# 已安装的小游戏设计与美术技能

核验日期：2026-10-22。安装位置：`C:/Users/革命成功/.agents/skills/`，使用系统 skill-installer 按固定提交安装，保留完整技能目录、模板、references、脚本及上游许可证。不安装整个大仓库，不新增游戏运行依赖。

## 选型依据

“认可度”以公开 GitHub 仓库 stars、维护情况和本项目适配度综合评估；下列为本次核验候选，并非全网穷举，也不是某个 skill 的独立评分。

| 仓库 | GitHub API stars 快照 | 最近推送 | 许可 | 选择 |
| --- | ---: | --- | --- | --- |
| [sickn33/agentic-awesome-skills](https://github.com/sickn33/agentic-awesome-skills) | 48,283 | 2026-10-21 | MIT | 本次候选最高星的通用技能库，选择 game-art 与 game-design 基础原则 |
| [Donchitos/Claude-Code-Game-Studios](https://github.com/Donchitos/Claude-Code-Game-Studios) | 27,069 | 2026-10-19 | MIT | 游戏工作室分工参考；高度耦合 Claude 的配置/审批流，部分美术角色仅写规格，不整套移植 |
| [gamedev-skills/awesome-gamedev-agent-skills](https://github.com/gamedev-skills/awesome-gamedev-agent-skills) | 2,635 | 2026-10-09 | Apache-2.0 | 生产流程更具体，有清单、模板、原生尺寸/alpha QA，选择四个专项技能 |
| [abagames/agentic-gamedev-skills](https://github.com/abagames/agentic-gamedev-skills) | 27 | 2026-10-17 | MIT | 侧重小型游戏实验，本次不作为主要来源 |
| [FunplayAI/funplay-skill](https://github.com/FunplayAI/funplay-skill) | 9 | 2026-06-15 | MIT | 本次不选 |

## 安装与岗位映射

| skill | 固定源码目录 | 主要使用角色 |
| --- | --- | --- |
| game-art | sickn33: `skills/game-development/game-art` | art-lead、asset-artist，UI 按需 |
| game-design | sickn33: `skills/game-development/game-design` | producer、verifier |
| create-game-assets | gamedev-skills: `skills/disciplines/create-game-assets` | art-lead、asset-artist，UI 按需 |
| game-ui-ux | gamedev-skills: `skills/disciplines/game-ui-ux` | ui-artist |
| game-feel | gamedev-skills: `skills/disciplines/game-feel` | vfx-artist，UI 动效按需 |
| shader-programming | gamedev-skills: `skills/disciplines/shader-programming` | vfx-artist，只有确需材质时读取 |

- sickn33 固定提交：`2984de11956e413008c6f98121cd141c499e47a3`。
- gamedev-skills 固定提交：`0a70cfc64672d512c5b5b6006b5dcb5cf90dbdbd`。
- 图像实际生成与修改沿用系统自带 `imagegen`，本轮无需另装生成服务。技能不会自行提供图像模型或 DCC；没有工具时如实交付规范/清单与缺口。
- `game-art` / `game-design` 的上游自定义 frontmatter 字段如不符合本机校验，会归入 `metadata` 并保留原值，正文保持不变；实际适配及文件哈希记在同目录安装清单 `SKILLS.lock.json`。
- `create-game-assets/scripts/asset_report.py` 与 `build_preview_sheet.py` 使用 Pillow；当前 Python 已有 Pillow 12.3.0，无需安装新依赖。脚本只做确定性 QA/预览，不替代 imagegen 完成图像创作或编辑。
- 上游 UI 里包含 PC/TV/手柄示例，其他技能包含 Godot/Unity 示例。只读取当前抖音触控与 Cocos 所需部分，不照搬异引擎 API，不把通用建议升级为当前发布的额外门槛。

角色源码在本目录，运行 `python E:/Code/AgentBoard/tools/install_roles.py` 安装八个角色到当前 `CODEX_HOME/agents`（未设置时 `~/.codex/agents`）。角色文件沿用已有模型配置，不修改个人 config.toml。新技能在下一轮可用；若当前会话未枚举新角色，使用 [START_ART.md](START_ART.md) 的普通子代理回退方式，或新开会话。

八岗位均使用各自真实 role 沿用 v1 事件字段上报，岗位身份不靠摘要或 instance 猜测；技能不改变上报权限与独立验收规则。完整协作、阶段质量及父链关系见 [ART_WORKFLOW.md](ART_WORKFLOW.md) 和 [WORKFLOW.md](WORKFLOW.md)。
