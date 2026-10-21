"""Install these four personal Codex roles without modifying config.toml."""

import os
from pathlib import Path
import shutil
import sys
import tomllib

ROOT = Path(__file__).resolve().parents[1]
ROLES = ("game-producer", "game-tech-lead", "game-developer", "game-verifier")


def main():
    destination = Path(os.environ.get("CODEX_HOME", Path.home() / ".codex")) / "agents"
    sources = [ROOT / "agents" / f"{role}.toml" for role in ROLES]
    for role, source in zip(ROLES, sources):
        config = tomllib.loads(source.read_text(encoding="utf-8"))
        if config["name"] != role or config["model"] != "gpt-6.1-sol":
            raise ValueError(f"角色名称或模型错误：{source}")
        if not config.get("description") or not config.get("developer_instructions"):
            raise ValueError(f"缺少角色说明：{source}")
    destination.mkdir(parents=True, exist_ok=True)
    for source in sources:
        target = destination / source.name
        if target.exists() and target.read_bytes() == source.read_bytes():
            print(f"unchanged: {target}")
            continue
        if target.exists():
            # Preserve the previous installed version when refreshing these roles.
            shutil.copy2(target, target.with_suffix(".toml.bak"))
        shutil.copy2(source, target)
        print(f"installed: {target}")


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    main()
