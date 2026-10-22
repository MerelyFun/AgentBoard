import concurrent.futures
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


class ReporterTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.storage = Path(self.temporary.name)
        self.environment = dict(
            os.environ, AGENTBOARD_DATA_DIR=self.temporary.name,
            AGENTBOARD_TRANSPORT_CONFIG=str(self.storage / "transport-not-configured.json"),
        )

    def call(self, *arguments, expected=0):
        result = subprocess.run(
            [sys.executable, str(ROOT / "tools/report.py"), *arguments],
            env=self.environment, capture_output=True, encoding="utf-8", timeout=10,
        )
        self.assertEqual(result.returncode, expected, result.stdout + result.stderr)
        return json.loads(result.stdout)

    def begin(self, role="game-producer", *extra):
        return self.call(
            "begin", "--project", "cat-and-dog", "--role", role,
            "--milestone", "M1", "核心原型", "--step", "M1a", "完整单局胜败与重试",
            "--task", "M1a-T1", "--summary", "测试数据，不代表项目进度", *extra,
        )

    def events(self):
        return [json.loads(path.read_text(encoding="utf-8")) for path in (self.storage / "outbox").glob("*.json")]

    def test_context_roundtrip_and_delivery_are_separate(self):
        run = self.begin("game-developer")
        result = self.call("event", "--run", run["run_id"], "--kind", "blocked", "--summary", "缺少测试设备")
        self.assertEqual(result["delivery"], "queued")
        self.assertEqual(result["event"], "blocked")
        blocked = next(event for event in self.events() if event["kind"] == "blocked")
        self.assertEqual(blocked["milestone"], {"id": "M1", "name": "核心原型"})
        self.assertEqual(blocked["step"], {"id": "M1a", "name": "完整单局胜败与重试"})
        self.assertNotIn("root", blocked)
        self.assertNotIn("verdict", blocked)

    def test_parallel_instances_and_events_do_not_overwrite(self):
        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
            runs = list(pool.map(lambda _: self.begin("game-developer"), range(12)))
            list(pool.map(lambda run: self.call(
                "event", "--run", run["run_id"], "--kind", "submitted",
                "--summary", "隔离测试交付", "--evidence", "assets/test.ts",
            ), runs))
        events = self.events()
        self.assertEqual(len({run["run_id"] for run in runs}), 12)
        self.assertEqual(len(events), 24)
        self.assertEqual(len({event["event_id"] for event in events}), 24)
        self.assertFalse(list(self.storage.rglob("*.tmp")))

    def test_parent_chain_automatically_inherits_project_and_phase(self):
        parent = self.begin()
        lead = self.call("begin", "--role", "game-tech-lead", "--parent", parent["run_id"], "--task", "M1a-integration", "--summary", "技术拆分与集成")
        child = self.call("begin", "--role", "game-developer", "--parent", lead["run_id"], "--task", "M1a-module", "--summary", "认领模块")
        verifier = self.call("begin", "--role", "game-verifier", "--parent", parent["run_id"], "--task", "M1a-check", "--summary", "独立验收")
        contexts = [json.loads((self.storage / "runs" / f"{run['run_id']}.json").read_text(encoding="utf-8")) for run in (parent, lead, child, verifier)]
        self.assertEqual(contexts[1]["parent_run_id"], parent["run_id"])
        self.assertEqual(contexts[2]["parent_run_id"], lead["run_id"])
        self.assertEqual(contexts[3]["parent_run_id"], parent["run_id"])
        self.assertEqual([context["lead"] for context in contexts], [False, True, False, False])
        for context in contexts[1:]:
            for key in ("project_id", "milestone", "step"):
                self.assertEqual(context[key], contexts[0][key])
        self.call(
            "begin", "--project", "3match", "--role", "game-developer",
            "--milestone", "M0", "环境", "--step", "M0.1", "打开工程",
            "--task", "M0.1-T1", "--parent", parent["run_id"], "--summary", "错误跨项目关联", expected=1,
        )
        self.assertEqual(len(self.events()), 4)

    def test_child_cannot_override_product_step_or_invent_parent_role(self):
        producer = self.begin()
        lead = self.call("begin", "--role", "game-tech-lead", "--parent", producer["run_id"], "--task", "integration", "--summary", "集成")
        self.call("begin", "--role", "game-developer", "--parent", lead["run_id"], "--task", "module", "--step", "M1b", "擅自推进阶段", "--summary", "不应允许", expected=1)
        self.call("begin", "--role", "game-verifier", "--parent", lead["run_id"], "--task", "check", "--summary", "验收须由制作人派发", expected=1)
        self.call("begin", "--role", "game-tech-lead", "--parent", lead["run_id"], "--task", "nested-lead", "--summary", "不创建第二层 lead", expected=1)
        self.assertEqual(len(self.events()), 2)

    def test_art_parent_chain_inherits_context_and_keeps_technical_lead_separate(self):
        producer = self.begin()
        technical = self.call("begin", "--role", "game-tech-lead", "--parent", producer["run_id"], "--task", "integration", "--summary", "集成")
        for parent in (producer, technical):
            with self.subTest(art_lead_parent=parent["run_id"]):
                art_lead = self.call("begin", "--role", "game-art-lead", "--parent", parent["run_id"], "--task", "art-direction", "--summary", "美术协调")
                for role in ("game-asset-artist", "game-ui-artist", "game-vfx-artist"):
                    artist = self.call("begin", "--role", role, "--parent", art_lead["run_id"], "--task", "art-slice", "--summary", "代表切片")
                    context = json.loads((self.storage / "runs" / f"{artist['run_id']}.json").read_text(encoding="utf-8"))
                    self.assertEqual(context["parent_run_id"], art_lead["run_id"])
                    self.assertEqual(context["role"], role)
                    self.assertFalse(context["lead"])
                    self.assertEqual(context["milestone"], {"id": "M1", "name": "核心原型"})
                    self.assertEqual(context["step"], {"id": "M1a", "name": "完整单局胜败与重试"})
        self.assertEqual(len(self.events()), 10)

    def test_artist_can_link_to_producer_or_technical_lead_but_not_peer_artist(self):
        producer = self.begin()
        technical = self.call("begin", "--role", "game-tech-lead", "--parent", producer["run_id"], "--task", "integration", "--summary", "集成")
        for parent in (producer, technical):
            for role in ("game-asset-artist", "game-ui-artist", "game-vfx-artist"):
                self.call("begin", "--role", role, "--parent", parent["run_id"], "--task", "art", "--summary", "美术任务")
        artist = self.begin("game-ui-artist")
        for role in ("game-art-lead", "game-asset-artist", "game-ui-artist", "game-vfx-artist", "game-tech-lead", "game-verifier"):
            self.call("begin", "--role", role, "--parent", artist["run_id"], "--task", "invalid-chain", "--summary", "非法关联", expected=1)
        art_lead = self.begin("game-art-lead")
        self.call("begin", "--role", "game-verifier", "--parent", art_lead["run_id"], "--task", "independent-check", "--summary", "验收须保持独立", expected=1)

    def test_all_art_roles_submit_without_self_verification(self):
        for role in ("game-art-lead", "game-asset-artist", "game-ui-artist", "game-vfx-artist"):
            with self.subTest(role=role):
                artist = self.begin(role)
                self.call("event", "--run", artist["run_id"], "--kind", "submitted", "--summary", "美术交付待验收", "--evidence", "assets/review.png")
                self.call("event", "--run", artist["run_id"], "--kind", "verification", "--verdict", "pass", "--summary", "不能自验", expected=1)
        submissions = [event for event in self.events() if event["kind"] == "submitted"]
        self.assertEqual(len(submissions), 4)
        self.assertTrue(all(not event["lead"] and "verdict" not in event for event in submissions))

    def test_standalone_begin_requires_explicit_phase(self):
        result = self.call("begin", "--role", "game-producer", "--project", "3match", "--task", "plan", "--summary", "缺少两级阶段", expected=1)
        self.assertEqual(result["delivery"], "error")
        self.assertFalse((self.storage / "runs").exists())

    def test_lead_submits_integration_but_cannot_verify(self):
        lead = self.begin("game-tech-lead")
        self.call("event", "--run", lead["run_id"], "--kind", "submitted", "--summary", "集成包待独立验收", "--evidence", "docs/integration.md")
        self.call("event", "--run", lead["run_id"], "--kind", "verification", "--verdict", "pass", "--summary", "不能自验", expected=1)
        submission = next(event for event in self.events() if event["kind"] == "submitted")
        self.assertEqual(submission["role"], "game-tech-lead")
        self.assertNotIn("verdict", submission)

    def test_old_lead_context_can_be_closed_without_rewriting_history(self):
        old = self.begin("game-developer")
        path = self.storage / "runs" / f"{old['run_id']}.json"
        context = json.loads(path.read_text(encoding="utf-8"))
        context["lead"] = True  # Previously installed developer --lead runs.
        path.write_text(json.dumps(context), encoding="utf-8")
        self.call("event", "--run", old["run_id"], "--kind", "stopped", "--summary", "旧执行已交接，后续用独立技术负责人")
        stopped = next(event for event in self.events() if event["kind"] == "stopped")
        self.assertEqual(stopped["role"], "game-developer")
        self.assertTrue(stopped["lead"])

    def test_only_verifier_can_report_verdict(self):
        developer = self.begin("game-developer")
        self.call("event", "--run", developer["run_id"], "--kind", "verification", "--verdict", "pass", "--summary", "越权验收", expected=1)
        verifier = self.begin("game-verifier")
        self.call("event", "--run", verifier["run_id"], "--kind", "verification", "--summary", "缺结论", expected=1)
        self.call("event", "--run", verifier["run_id"], "--kind", "verification", "--verdict", "inconclusive", "--summary", "无真机，结论不足", "--evidence", "docs/qa.md")
        verified = [event for event in self.events() if event["kind"] == "verification"]
        self.assertEqual(len(verified), 1)
        self.assertEqual(verified[0]["verdict"], "inconclusive")

    def test_invalid_identity_and_cross_role_submission_are_rejected(self):
        self.call("event", "--run", "../../outside", "--kind", "checkpoint", "--summary", "无效执行", expected=1)
        producer = self.begin()
        self.call("event", "--run", producer["run_id"], "--kind", "submitted", "--summary", "角色不匹配", expected=1)
        self.assertEqual(len(self.events()), 1)

    def test_storage_failure_is_explicit_not_delivered(self):
        invalid = self.storage / "file-instead-of-directory"
        invalid.write_text("occupied", encoding="utf-8")
        self.environment["AGENTBOARD_DATA_DIR"] = str(invalid)
        result = self.begin_failing_storage()
        self.assertEqual(result["delivery"], "error")

    def begin_failing_storage(self):
        return self.call(
            "begin", "--project", "3match", "--role", "game-producer",
            "--milestone", "M0", "环境", "--step", "M0.1", "打开工程",
            "--task", "M0.1-plan", "--summary", "不能写入", expected=1,
        )


if __name__ == "__main__":
    unittest.main()
