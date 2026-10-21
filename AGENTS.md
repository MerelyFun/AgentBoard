# AgentBoard

范围：三个小游戏共用的四角色、阶段协议、轻量上报入口与监控网页。用户已授权发布到 MerelyFun/AgentBoard 和 GitHub Pages，并接入 Supabase 项目 llcgzbyvpchabvodytrc。

- 角色源文件在 `agents/`，个人安装目录为 `~/.codex/agents/`。修改角色后运行 `python tools/install_roles.py`。
- 四角色为 producer / tech-lead / developer / verifier。小任务跳过 lead；并行开发由唯一 lead 技术派工并集成，独立验收由制作人安排。
- 游戏状态以各自 `docs/STATE.md` 和所属路线图为准；本仓库不维护第二份游戏进度。
- 上报只记录关键转折；先写 `.local/outbox/` 再有界发送，确认后移入 sent；失败保留等待补发，不能影响开发。`.local/` 不得提交 Git。
- 修改 reporter 后运行 `python -m unittest discover -s tests -v`。提示词变更检查职责、阶段来源和调用方式是否一致，不写模仿措辞的测试。
- 网页为 React + Vite + TypeScript；运行 `npm run check`、`npm run build`，改 UI 后在浏览器检查交互和小屏。进度与接续工作见 `docs/STATE.md`。
- 网页默认真实空态，演示必须显式启用；本地导入与演示不能混合。20 分钟未更新只表示待确认，不能推断进程停止；提交不等于验收通过。
- 前后端沿用 `agents/WORKFLOW.md` 的事件协议，禁止另建一套上报字段。网页仅放公开 URL/publishable key；写入凭证、访问码、服务密钥、本地发件箱和运行数据不得进入 Git 或静态包。数据用 Auth + RLS 限制成员只读，写入只走鉴权 Edge Function。
