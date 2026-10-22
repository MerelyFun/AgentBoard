# AgentBoard

范围：三个小游戏共用的玩法与美术角色、阶段协议、轻量上报入口与监控网页。用户已授权发布到 MerelyFun/AgentBoard 和 GitHub Pages，并接入 Supabase 项目 llcgzbyvpchabvodytrc。

- 角色源文件在 `agents/`，个人安装目录为 `~/.codex/agents/`。修改角色后运行 `python tools/install_roles.py`。
- 基础角色为 producer / tech-lead / developer / verifier；美术角色为 art-lead / asset-artist / ui-artist / vfx-artist。职责与平权边界见 `agents/ART_WORKFLOW.md`。制作人继续评估体验与范围；视觉方向与资产质量由美术领域负责，STATE 的记录职责不代表上下级。代码及正式资产接入仍由唯一 tech-lead 按 worktree/PR 审查合入；verifier 独立验收，评审 checkpoint 与验收 verification 分开。
- 游戏制作按需读取 `E:/Code/LittleGameDoc/Doc/GAME_DESIGN_CHARTER.md`；阶段品质门槛见 `agents/ART_WORKFLOW.md`。维护角色、技能或看板不自动启动三个游戏的美术生产，不改游戏 STATE。
- 游戏状态以各自 `docs/STATE.md` 和所属路线图为准；本仓库不维护第二份游戏进度。
- 上报只记录关键转折；先写 `.local/outbox/` 再有界发送，确认后移入 sent；失败保留等待补发，不能影响开发。`.local/` 不得提交 Git。
- 修改 reporter 后运行 `python -m unittest discover -s tests -v`。提示词变更检查职责、阶段来源和调用方式是否一致，不写模仿措辞的测试。
- 网页为 React + Vite + TypeScript；运行 `npm run check`、`npm run build`，改 UI 后在浏览器检查交互和小屏。进度与接续工作见 `docs/STATE.md`。
- 网页默认真实空态，演示必须显式启用；本地导入与演示不能混合。20 分钟未更新只表示待确认，不能推断进程停止；提交不等于验收通过。
- 前后端沿用 `agents/WORKFLOW.md` 的 v1 事件字段，八岗位使用各自真实 role，不把美术岗位伪装成开发。`parent_run_id` 表示任务来源与阶段继承，不代表职级；新执行的 `lead` 仅由 game-tech-lead 派生，保留历史 developer+lead=true 的事实。submitted 适用于开发、技术负责人和四个美术岗位，不能当作通过；正式 verification/verdict 仅 game-verifier 可用，验收父执行仍为制作人。
- 网页仅放公开 URL/publishable key；写入凭证、访问码、服务密钥、本地发件箱和运行数据不得进入 Git 或静态包。数据用 Auth + RLS 限制成员只读，写入只走鉴权 Edge Function。
