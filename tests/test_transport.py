"""Real loopback HTTP checks; never contact the configured production receiver."""

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
import uuid

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from transport import delivery_lock, flush_outbox, load_config  # noqa: E402


class TransportTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.storage = Path(self.temporary.name)
        self.config_path = self.storage / "transport.json"
        self.environment = {
            "AGENTBOARD_DATA_DIR": str(self.storage),
            "AGENTBOARD_TRANSPORT_CONFIG": str(self.config_path),
        }
        self.patch_environment = patch.dict(os.environ, self.environment)
        self.patch_environment.start()
        self.addCleanup(self.patch_environment.stop)
        self.requests = []
        self.respond = lambda event: (200, {"accepted": True, "event_id": event["event_id"]})
        self.response_delay = 0
        self.drip_interval = 0
        self.drip_bytes = 4
        owner = self

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                event = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                owner.requests.append({"event": event, "token": self.headers.get("x-agentboard-token")})
                time.sleep(owner.response_delay)
                status, response = owner.respond(event)
                payload = json.dumps(response).encode()
                self.send_response(status)
                if 300 <= status < 400:
                    self.send_header("Location", "/other-target")
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(payload)))
                try:
                    self.end_headers()
                    if owner.drip_interval:
                        for start in range(0, len(payload), owner.drip_bytes):
                            self.wfile.write(payload[start:start + owner.drip_bytes])
                            self.wfile.flush()
                            time.sleep(owner.drip_interval)
                    else:
                        self.wfile.write(payload)
                except OSError:
                    pass

            def log_message(self, *args):
                pass

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.addCleanup(self.server.server_close)
        self.thread = threading.Thread(target=self.server.serve_forever, kwargs={"poll_interval": 0.01}, daemon=True)
        self.thread.start()
        self.addCleanup(self.server.shutdown)
        self.endpoint = f"http://127.0.0.1:{self.server.server_port}/agentboard-ingest"

    def configure(self, **overrides):
        configuration = {
            "endpoint": self.endpoint, "allow_loopback_http": True,
            "tokens": {"game-producer": "producer-local-test-token", "game-developer": "developer-local-test-token"},
            **overrides,
        }
        self.config_path.write_text(json.dumps(configuration), encoding="utf-8")
        return configuration

    def event(self, role="game-producer"):
        event_id = str(uuid.uuid4())
        event = {
            "schema_version": 1, "event_id": event_id,
            "occurred_at": "2026-10-22T01:00:00+00:00", "run_id": str(uuid.uuid4()),
            "instance_id": "transport-test-only", "parent_run_id": None,
            "project_id": "3match", "role": role, "lead": False,
            "task_id": "isolated-transport-test", "milestone": {"id": "QA", "name": "TEST ONLY"},
            "step": {"id": "QA.1", "name": "TEST ONLY"}, "kind": "started",
            "summary": "TEST ONLY, no project progress", "evidence": [],
        }
        path = self.storage / "outbox" / f"{event_id}.json"
        path.parent.mkdir(exist_ok=True)
        path.write_text(json.dumps(event), encoding="utf-8")
        return event, path

    def send(self, **kwargs):
        return flush_outbox(ROOT, self.storage, **kwargs)

    def test_no_configuration_is_offline_and_has_no_network_or_lock(self):
        _, path = self.event()
        result = self.send()
        self.assertEqual(result["status"], "offline")
        self.assertTrue(path.is_file())
        self.assertFalse((self.storage / "transport.lock").exists())
        self.assertEqual(self.requests, [])

    def test_ack_moves_original_file_and_selects_token_by_role(self):
        self.configure()
        event, path = self.event("game-developer")
        original = path.read_bytes()
        result = self.send()
        self.assertEqual(result["sent"], [event["event_id"]])
        self.assertFalse(path.exists())
        self.assertEqual((self.storage / "sent" / path.name).read_bytes(), original)
        self.assertEqual(self.requests[0], {"event": event, "token": "developer-local-test-token"})
        self.assertEqual(self.send()["attempted"], 0)

    def test_duplicate_ack_is_success_with_original_event_id(self):
        self.configure()
        self.respond = lambda event: (200, {"accepted": True, "event_id": event["event_id"], "duplicate": True})
        event, _ = self.event()
        self.assertEqual(self.send()["sent"], [event["event_id"]])

    def test_only_exact_success_ack_can_remove_queue_entry(self):
        self.configure()
        for status, ack in (
            (200, {"accepted": True, "event_id": str(uuid.uuid4())}),
            (200, {"accepted": 1}),
            (200, {"accepted": False}),
            (201, {"accepted": True}),
            (200, []),
        ):
            with self.subTest(status=status, ack=ack):
                _, path = self.event()
                self.respond = lambda event: (status, ack)
                self.assertEqual(self.send(preferred=path.stem)["errors"], ["ack_invalid"])
                self.assertTrue(path.exists())

    def test_http_failure_or_redirect_does_not_retry_or_forward_credentials(self):
        self.configure()
        _, path = self.event()
        for status in (401, 500, 302):
            with self.subTest(status=status):
                self.respond = lambda event: (status, {"detail": "server response is not logged"})
                before = len(self.requests)
                result = self.send()
                self.assertEqual(result["errors"], ["http_error"])
                self.assertEqual(len(self.requests), before + 1)
                self.assertTrue(path.is_file())

    def test_missing_role_token_does_not_send_but_other_roles_can_send(self):
        self.configure(tokens={"game-developer": "developer-local-test-token"})
        _, producer = self.event()
        developer, _ = self.event("game-developer")
        result = self.send(preferred=producer.stem)
        self.assertEqual(result["errors"], ["role_token_missing"])
        self.assertEqual(result["sent"], [developer["event_id"]])
        self.assertTrue(producer.exists())
        self.assertEqual(len(self.requests), 1)

    def test_invalid_config_is_queued_without_credential_in_error(self):
        _, path = self.event()
        self.config_path.write_text('{"tokens":"private-secret-do-not-log", invalid', encoding="utf-8")
        result = self.send()
        self.assertEqual(result["status"], "config_error")
        self.assertNotIn("private-secret", json.dumps(result))
        self.assertTrue(path.is_file())
        self.assertEqual(self.requests, [])

    def test_remote_http_and_embedded_credentials_are_rejected(self):
        for endpoint, allow in (
            ("http://example.com/ingest", True),
            (self.endpoint, False),
            ("https://user:private-secret@example.com/ingest", False),
            ("https://example.com/ingest?token=private-secret", False),
            ("https://example.com/ingest#private-secret", False),
        ):
            with self.subTest(endpoint=endpoint):
                self.configure(endpoint=endpoint, allow_loopback_http=allow)
                with self.assertRaisesRegex(ValueError, "^transport_config_invalid$"):
                    load_config(ROOT)
        self.configure(endpoint="https://example.com/functions/v1/agentboard-ingest", allow_loopback_http=False)
        self.assertEqual(load_config(ROOT)["endpoint"], "https://example.com/functions/v1/agentboard-ingest")

    def test_send_limit_preserves_remaining_events(self):
        self.configure()
        for _ in range(8):
            self.event()
        result = self.send()
        self.assertEqual(result["attempted"], 5)
        self.assertEqual(len(result["sent"]), 5)
        self.assertEqual(len(list((self.storage / "outbox").glob("*.json"))), 3)

    def test_deadline_and_network_timeout_leave_queue_intact(self):
        self.configure()
        _, path = self.event()
        self.response_delay = 0.8
        before = time.monotonic()
        result = self.send(budget=0.15)
        self.assertLess(time.monotonic() - before, 0.6)
        self.assertIn(result["errors"], (["network_error"], ["deadline_exceeded"]))
        self.assertTrue(path.is_file())
        self.assertEqual(self.send(budget=0)["attempted"], 0)

    def test_drip_fed_ack_cannot_extend_total_deadline_or_keep_worker_or_lock(self):
        self.configure()
        _, path = self.event()
        self.drip_interval = 0.04
        processes = []
        real_popen = subprocess.Popen

        def track_worker(*args, **kwargs):
            process = real_popen(*args, **kwargs)
            processes.append(process)
            return process

        before = time.monotonic()
        with patch("transport.subprocess.Popen", side_effect=track_worker):
            result = self.send(budget=0.3)
        self.assertLess(time.monotonic() - before, 0.6)
        self.assertEqual(result["errors"], ["deadline_exceeded"])
        self.assertEqual(len(self.requests), 1, "the worker must reach the drip-fed response")
        self.assertTrue(path.is_file())
        self.assertFalse((self.storage / "sent" / path.name).exists())
        self.assertTrue(processes)
        self.assertTrue(all(process.poll() is not None for process in processes))
        with delivery_lock(self.storage) as acquired:
            self.assertTrue(acquired)
        # A retry can immediately take the same lock and deliver the same ID.
        self.drip_interval = 0
        self.assertEqual(self.send()["sent"], [path.stem])

    def test_real_begin_cli_has_two_second_wall_budget_for_drip_fed_valid_ack(self):
        self.configure()
        self.drip_interval = 0.04
        self.respond = lambda event: (200, {
            "accepted": True, "event_id": event["event_id"], "padding": "x" * 220,
        })
        before = time.monotonic()
        result = self.cli(
            "begin", "--project", "3match", "--role", "game-producer",
            "--milestone", "QA", "TEST ONLY", "--step", "QA.1", "TEST ONLY",
            "--task", "drip-transport-qa", "--summary", "ISOLATED TEST ONLY",
        )
        self.assertLess(time.monotonic() - before, 2.7)
        self.assertEqual(result["delivery"], "queued")
        self.assertEqual(result["transport"], "deadline_exceeded")
        self.assertEqual(len(self.requests), 1)
        self.assertTrue((self.storage / "outbox" / f"{result['event_id']}.json").is_file())
        self.assertFalse((self.storage / "sent" / f"{result['event_id']}.json").exists())

    def test_process_lock_is_nonblocking_and_does_not_send_twice(self):
        self.configure()
        self.event()
        with delivery_lock(self.storage) as acquired:
            self.assertTrue(acquired)
            before = time.monotonic()
            self.assertEqual(self.send()["status"], "busy")
            self.assertLess(time.monotonic() - before, 0.2)
        self.assertEqual(len(self.send()["sent"]), 1)
        self.assertEqual(len(self.requests), 1)

    def test_malformed_outbox_file_is_preserved_and_not_sent(self):
        self.configure()
        _, path = self.event()
        path.write_text('{"private":"not-a-valid-event"}', encoding="utf-8")
        self.assertEqual(self.send()["errors"], ["outbox_event_invalid"])
        self.assertTrue(path.is_file())
        self.assertEqual(self.requests, [])

    def cli(self, *arguments):
        process = subprocess.run(
            [sys.executable, str(ROOT / "tools/report.py"), *arguments],
            env={**os.environ, **self.environment}, capture_output=True, encoding="utf-8", timeout=5,
        )
        self.assertEqual(process.returncode, 0, process.stdout + process.stderr)
        return json.loads(process.stdout)

    def test_real_cli_persists_then_sends_and_flush_recovers_failed_delivery(self):
        self.configure()

        def assert_persisted(event):
            self.assertTrue((self.storage / "outbox" / f"{event['event_id']}.json").is_file())
            return 200, {"accepted": True, "event_id": event["event_id"]}

        self.respond = assert_persisted
        run = self.cli(
            "begin", "--project", "3match", "--role", "game-producer",
            "--milestone", "QA", "TEST ONLY", "--step", "QA.1", "TEST ONLY",
            "--task", "transport-qa", "--summary", "ISOLATED TEST ONLY",
        )
        self.assertEqual(run["delivery"], "sent")
        self.respond = lambda event: (500, {})
        result = self.cli("event", "--run", run["run_id"], "--kind", "checkpoint", "--summary", "ISOLATED TEST ONLY")
        self.assertEqual(result["delivery"], "queued")
        self.assertEqual(result["transport"], "http_error")
        self.respond = assert_persisted
        resent = self.cli("flush", "--limit", "10", "--budget", "2")
        self.assertEqual(resent["delivery"], "sent")
        self.assertEqual(resent["transport"]["sent"], [result["event_id"]])
        self.assertEqual(len(list((self.storage / "sent").glob("*.json"))), 2)

    def test_partial_flush_reports_queued_even_if_one_event_was_sent(self):
        self.configure(tokens={"game-developer": "developer-local-test-token"})
        self.event("game-producer")
        developer, _ = self.event("game-developer")
        result = self.cli("flush", "--budget", "2")
        self.assertEqual(result["delivery"], "queued")
        self.assertEqual(result["transport"]["sent"], [developer["event_id"]])
        self.assertIn("role_token_missing", result["transport"]["errors"])


if __name__ == "__main__":
    unittest.main()
