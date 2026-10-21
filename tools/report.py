"""Lightweight, offline-first agent event entry point with optional HTTP delivery."""

import argparse
import json
import os
from pathlib import Path
import sys
import tomllib
import uuid
from datetime import datetime, timezone

from transport import flush_outbox

ROOT = Path(__file__).resolve().parents[1]
ROLES = ("game-producer", "game-tech-lead", "game-developer", "game-verifier")
PARENT_ROLES = {
    "game-producer": (),
    "game-tech-lead": ("game-producer",),
    "game-developer": ("game-producer", "game-tech-lead"),
    "game-verifier": ("game-producer",),
}
KINDS = ("checkpoint", "blocked", "unblocked", "submitted", "verification", "stopped", "cancelled")


def atomic_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(f".{uuid.uuid4().hex}.tmp")
    try:
        with temporary.open("x", encoding="utf-8") as stream:
            json.dump(value, stream, ensure_ascii=False, indent=2)
            stream.write("\n")
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def data_root():
    return Path(os.environ.get("AGENTBOARD_DATA_DIR", ROOT / ".local"))


def checked_id(value):
    try:
        return str(uuid.UUID(value))
    except (ValueError, AttributeError) as error:
        raise ValueError("run_id 必须是 begin 返回的 UUID") from error


def load_run(run_id):
    path = data_root() / "runs" / f"{checked_id(run_id)}.json"
    if not path.is_file():
        raise ValueError("找不到本次执行；请先 begin")
    return json.loads(path.read_text(encoding="utf-8"))


def enqueue(context, kind, summary, evidence=(), verdict=None):
    event = {
        "schema_version": 1,
        "event_id": str(uuid.uuid4()),
        "occurred_at": datetime.now(timezone.utc).isoformat(),
        **context,
        "kind": kind,
        "summary": summary,
        "evidence": list(evidence),
    }
    if verdict:
        event["verdict"] = verdict
    atomic_json(data_root() / "outbox" / f"{event['event_id']}.json", event)
    sent = flush_outbox(ROOT, data_root(), preferred=event["event_id"])
    result = {
        "delivery": "sent" if event["event_id"] in sent["sent"] else "queued",
        "run_id": context["run_id"], "event_id": event["event_id"], "event": kind,
    }
    if sent["errors"]:
        result["transport"] = sent["errors"][0]
    return result


def flush(args):
    result = flush_outbox(ROOT, data_root(), limit=args.limit, budget=args.budget)
    return {
        "delivery": "sent" if result["sent"] and result["status"] == "complete" else "queued",
        "transport": result,
    }


def begin(args):
    projects = tomllib.loads((ROOT / "projects.toml").read_text(encoding="utf-8"))["projects"]
    parent = load_run(args.parent) if args.parent else None
    milestone = dict(zip(("id", "name"), args.milestone)) if args.milestone else None
    step = dict(zip(("id", "name"), args.step)) if args.step else None
    supplied = {"project_id": args.project, "milestone": milestone, "step": step}
    if parent:
        if parent["role"] not in PARENT_ROLES[args.role]:
            raise ValueError("派工关系应为制作人→lead→开发，或制作人直接派开发/验收")
        if any(value is not None and parent[key] != value for key, value in supplied.items()):
            raise ValueError("子任务的项目/阶段必须与 parent 一致；阶段切换后请使用新的 parent run")
        supplied = {key: parent[key] for key in supplied}
    elif any(value is None for value in supplied.values()):
        raise ValueError("无 --parent 时必须提供 --project、--milestone ID NAME 和 --step ID NAME")
    if supplied["project_id"] not in projects:
        raise ValueError(f"未知项目，可选：{', '.join(projects)}")
    context = {
        "run_id": str(uuid.uuid4()),
        "instance_id": args.instance or str(uuid.uuid4()),
        "parent_run_id": checked_id(args.parent) if args.parent else None,
        "role": args.role,
        # Keep the v1 field for readers; role is the single source for new runs.
        "lead": args.role == "game-tech-lead",
        "task_id": args.task,
        **supplied,
    }
    atomic_json(data_root() / "runs" / f"{context['run_id']}.json", context)
    return enqueue(context, "started", args.summary)


def report_event(args):
    context = load_run(args.run)
    if args.kind == "verification":
        if context["role"] != "game-verifier" or not args.verdict:
            raise ValueError("verification 仅供 game-verifier，且必须指定 --verdict")
    elif args.verdict:
        raise ValueError("--verdict 只能与 verification 一起使用")
    if args.kind == "submitted" and context["role"] not in ("game-developer", "game-tech-lead"):
        raise ValueError("submitted 仅供开发/技术负责人；制作人用 checkpoint 交接")
    return enqueue(context, args.kind, args.summary, args.evidence, args.verdict)


def nonempty(value):
    value = value.strip()
    if not value:
        raise argparse.ArgumentTypeError("不能为空")
    return value


def positive_limit(value):
    number = int(value)
    if not 1 <= number <= 1000:
        raise argparse.ArgumentTypeError("必须在 1 到 1000 之间")
    return number


def positive_budget(value):
    number = float(value)
    if not 0 < number <= 30:
        raise argparse.ArgumentTypeError("必须大于 0 且不超过 30 秒")
    return number


def main():
    parser = argparse.ArgumentParser(description="AgentBoard 关键事件上报（先本地排队，配置后短时自动发送）")
    commands = parser.add_subparsers(dest="command", required=True)
    start = commands.add_parser("begin", help="绑定一次角色×任务×阶段，并报告 started")
    start.add_argument("--project", type=nonempty, help="无 --parent 时必填")
    start.add_argument("--role", required=True, choices=ROLES)
    start.add_argument("--milestone", nargs=2, metavar=("ID", "NAME"), type=nonempty)
    start.add_argument("--step", nargs=2, metavar=("ID", "NAME"), type=nonempty)
    start.add_argument("--task", required=True, type=nonempty)
    start.add_argument("--summary", required=True, type=nonempty)
    start.add_argument("--instance", type=nonempty)
    start.add_argument("--parent", help="父执行 ID，自动继承项目和两级阶段")
    start.set_defaults(handler=begin)
    event = commands.add_parser("event", help="报告关键转折，自动携带阶段")
    event.add_argument("--run", required=True)
    event.add_argument("--kind", required=True, choices=KINDS)
    event.add_argument("--summary", required=True, type=nonempty)
    event.add_argument("--evidence", action="append", default=[], type=nonempty)
    event.add_argument("--verdict", choices=("pass", "fail", "inconclusive"))
    event.set_defaults(handler=report_event)
    pending = commands.add_parser("flush", help="有界补发本地队列；失败保留原事件")
    pending.add_argument("--limit", type=positive_limit, default=100)
    pending.add_argument("--budget", type=positive_budget, default=15.0, help="总网络预算秒数，最多 30 秒")
    pending.set_defaults(handler=flush)
    args = parser.parse_args()
    try:
        result = args.handler(args)
    except (OSError, ValueError) as error:
        print(json.dumps({"delivery": "error", "message": str(error)}, ensure_ascii=False))
        return 1
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    sys.exit(main())
