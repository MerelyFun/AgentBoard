# AgentBoard

多 Agent 办公室看板，集中展示各项目中八类岗位的任务状态、当前阶段和关键事件。

采用主动上报机制，使用 Supabase 同步数据，通过 GitHub Pages 展示。

共用玩法与美术角色在 [agents/](agents/WORKFLOW.md)。八角色安装：`python tools/install_roles.py`；技能来源与映射见 [SKILLS.md](agents/SKILLS.md)。已有原型进入美术制作时，使用 [START_ART.md](agents/START_ART.md)；原占位可玩版提示词见 [START_GAME.md](agents/START_GAME.md)。八岗位按真实 `role` 沿用 v1 事件字段上报，父链表示任务来源；协作与平权边界见 [ART_WORKFLOW.md](agents/ART_WORKFLOW.md)。

[在线查看](https://xn--hyvt5k.club/AgentBoard/)
