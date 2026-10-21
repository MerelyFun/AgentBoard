"""Bounded outbox delivery. No third-party dependencies or credential logs."""

import base64
from contextlib import contextmanager
from http.client import HTTPException
import json
import os
from pathlib import Path
import subprocess
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener
import uuid


AUTO_LIMIT = 5
AUTO_BUDGET = 2.0
MAX_EVENT_BYTES = 256 * 1024
MAX_ACK_BYTES = 4096


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, newurl):
        # Never forward role credentials to a redirect target.
        return None


def load_config(project_root):
    path = Path(os.environ.get(
        "AGENTBOARD_TRANSPORT_CONFIG", Path(project_root) / ".local" / "transport.json"
    ))
    try:
        if not path.exists():
            return None
        if path.stat().st_size > 64 * 1024:
            raise ValueError("configuration too large")
        config = json.loads(path.read_text(encoding="utf-8-sig"))
        endpoint = config["endpoint"]
        tokens = config["tokens"]
        parsed = urlsplit(endpoint)
        if any(ord(character) <= 32 for character in endpoint):
            raise ValueError("invalid endpoint")
        secure = parsed.scheme == "https"
        loopback = (
            parsed.scheme == "http"
            and parsed.hostname in ("127.0.0.1", "::1", "localhost")
            and config.get("allow_loopback_http") is True
        )
        if not (secure or loopback) or not parsed.hostname:
            raise ValueError("HTTPS required")
        if parsed.username or parsed.password or parsed.fragment or parsed.query:
            raise ValueError("invalid endpoint")
        if not isinstance(tokens, dict) or not all(
            isinstance(key, str) and isinstance(value, str)
            and bool(value.strip()) and "\r" not in value and "\n" not in value
            for key, value in tokens.items()
        ):
            raise ValueError("invalid role tokens")
        # Access .port now so malformed ports fail before the HTTP request.
        parsed.port
        return {"endpoint": endpoint, "tokens": tokens}
    except (OSError, ValueError, TypeError, KeyError, AttributeError):
        # Do not include parser errors: the source may contain a secret.
        raise ValueError("transport_config_invalid") from None


@contextmanager
def delivery_lock(storage):
    """OS-released, nonblocking lock; a crashed process cannot leave a stale lock."""
    handle = None
    acquired = False
    try:
        storage.mkdir(parents=True, exist_ok=True)
        handle = (storage / "transport.lock").open("a+b")
        if handle.seek(0, 2) == 0:
            handle.write(b"\0")
            handle.flush()
        handle.seek(0)
        if os.name == "nt":
            import msvcrt
            msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        acquired = True
    except OSError:
        pass
    try:
        yield acquired
    finally:
        if handle is not None:
            if acquired:
                handle.seek(0)
                if os.name == "nt":
                    import msvcrt
                    msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
                else:
                    import fcntl
                    fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
            handle.close()


def _pending(storage, preferred):
    """Stream files rather than scanning the entire queue on every agent action."""
    preferred_name = f"{preferred}.json" if preferred else None
    if preferred_name:
        yield storage / "outbox" / preferred_name
    try:
        with os.scandir(storage / "outbox") as entries:
            for entry in entries:
                if entry.name.endswith(".json") and entry.name != preferred_name and entry.is_file():
                    yield Path(entry.path)
    except FileNotFoundError:
        return


def _post_inline(opener, config, event, payload, timeout):
    token = config["tokens"].get(event.get("role"))
    if not token:
        return "role_token_missing"
    request = Request(
        config["endpoint"], data=payload, method="POST",
        headers={"Content-Type": "application/json", "x-agentboard-token": token},
    )
    try:
        with opener.open(request, timeout=timeout) as response:
            raw = response.read(MAX_ACK_BYTES + 1)
            if response.status != 200 or len(raw) > MAX_ACK_BYTES:
                return "ack_invalid"
            ack = json.loads(raw)
            if not isinstance(ack, dict) or ack.get("accepted") is not True or ack.get("event_id") != event["event_id"]:
                return "ack_invalid"
    except HTTPError as error:
        error.close()
        return "http_error"
    except (URLError, OSError, TimeoutError, HTTPException):
        return "network_error"
    except (ValueError, TypeError):
        return "ack_invalid"
    return None


def _post(config, event, payload, deadline):
    """Bound DNS, connect and streamed reads by one parent-owned wall deadline.

    Socket timeouts alone are idle timeouts and cannot stop a drip-fed ACK.
    A short-lived worker only handles HTTP; it never owns the delivery lock or
    changes files. The parent kills and reaps it before returning on timeout.
    Credentials travel through stdin, never through process arguments.
    """
    token = config["tokens"].get(event.get("role"))
    if not token:
        return "role_token_missing"
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        return "deadline_exceeded"
    message = json.dumps({
        "endpoint": config["endpoint"], "token": token,
        "event_id": event["event_id"],
        "payload": base64.b64encode(payload).decode("ascii"),
        "timeout": min(5.0, remaining),
    }).encode("utf-8")
    try:
        process = subprocess.Popen(
            [sys.executable, str(Path(__file__).resolve()), "--http-worker"],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            close_fds=True, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
    except OSError:
        return "transport_worker_failed"
    try:
        stdout, _ = process.communicate(message, timeout=max(0, deadline - time.monotonic()))
    except subprocess.TimeoutExpired:
        process.kill()
        process.communicate()
        return "deadline_exceeded"
    if time.monotonic() >= deadline:
        return "deadline_exceeded"
    if process.returncode != 0:
        return "transport_worker_failed"
    try:
        failure = json.loads(stdout)
        if failure not in (None, "http_error", "network_error", "ack_invalid"):
            return "transport_worker_failed"
        return failure
    except (ValueError, TypeError):
        return "transport_worker_failed"


def _http_worker():
    """Internal pipe protocol; never read configs, acquire locks or archive files."""
    try:
        message = json.loads(sys.stdin.buffer.read(MAX_EVENT_BYTES * 2))
        handlers = [NoRedirect()]
        if urlsplit(message["endpoint"]).hostname in ("127.0.0.1", "::1", "localhost"):
            handlers.append(ProxyHandler({}))
        failure = _post_inline(
            build_opener(*handlers),
            {"endpoint": message["endpoint"], "tokens": {"worker": message["token"]}},
            {"event_id": message["event_id"], "role": "worker"},
            base64.b64decode(message["payload"], validate=True), message["timeout"],
        )
    except Exception:
        # A malformed internal message or unexpected library error must not log
        # credentials or stall the caller. The event remains in its outbox.
        failure = "network_error"
    print(json.dumps(failure), flush=True)


def flush_outbox(project_root, storage, *, limit=AUTO_LIMIT, budget=AUTO_BUDGET, preferred=None):
    """Deliver at most limit events within a parent-enforced wall-clock budget.

    The caller has already persisted its event. A failure never removes an event;
    retries reuse its event_id, including an ACK followed by a local disk failure.
    """
    result = {"status": "offline", "attempted": 0, "sent": [], "errors": []}
    deadline = time.monotonic() + budget
    try:
        config = load_config(project_root)
    except ValueError:
        return {**result, "status": "config_error", "errors": ["transport_config_invalid"]}
    if config is None:
        return result
    storage = Path(storage)
    try:
        with delivery_lock(storage) as acquired:
            if not acquired:
                return {**result, "status": "busy"}
            result["status"] = "complete"
            for path in _pending(storage, preferred):
                remaining = deadline - time.monotonic()
                if result["attempted"] >= limit or remaining <= 0:
                    result["status"] = "limited"
                    break
                if not path.is_file():
                    continue
                result["attempted"] += 1
                try:
                    if path.stat().st_size > MAX_EVENT_BYTES:
                        raise ValueError("too large")
                    payload = path.read_bytes()
                    event = json.loads(payload)
                    if not isinstance(event, dict) or str(uuid.UUID(event["event_id"])) != path.stem:
                        raise ValueError("invalid identity")
                    if not isinstance(event.get("role"), str):
                        raise ValueError("invalid role")
                except (OSError, ValueError, TypeError, KeyError, AttributeError):
                    result["errors"].append("outbox_event_invalid")
                    continue
                failure = _post(config, event, payload, deadline)
                if failure:
                    result["errors"].append(failure)
                    # Network/auth/ACK failure is unlikely to improve for another
                    # queued event in this invocation. Missing roles can differ.
                    if failure != "role_token_missing":
                        break
                    continue
                try:
                    sent = storage / "sent" / path.name
                    sent.parent.mkdir(parents=True, exist_ok=True)
                    if sent.exists() and sent.read_bytes() != payload:
                        result["errors"].append("sent_archive_conflict")
                        continue
                    os.replace(path, sent)
                    result["sent"].append(event["event_id"])
                except OSError:
                    result["errors"].append("sent_archive_failed")
    except OSError:
        result["errors"].append("transport_storage_unavailable")
    if result["errors"]:
        result["status"] = "queued"
    return result


if __name__ == "__main__" and sys.argv[1:] == ["--http-worker"]:
    _http_worker()
