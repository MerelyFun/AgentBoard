# AgentBoard

三个抖音小游戏共用的 Codex 角色、主动上报入口和监控网页。当前为本地版：四角色、本地发件箱与文件导入已完成；Supabase 尚未接通，按要求暂不发布 GitHub。

| 角色 | 职责 |
|---|---|
| game-producer | 制作人兼玩法数值，恢复阶段、定义产品切片、安排独立验收、维护 STATE |
| game-tech-lead | 按需负责当前切片的技术拆分、接口和文件归属、派发开发、集成 |
| game-developer | 完成认领模块、自测、提交证据；支持并行实例 |
| game-verifier | 独立验收，给 pass / fail / inconclusive |

四种角色均用 `gpt-6.1-sol`；提示词简短，公共约定放 [WORKFLOW](agents/WORKFLOW.md)。一个开发能完成的小任务跳过 lead；多开发或明显跨模块时启用唯一 lead，开发人数按任务和并发额度决定，不常驻空闲实例。

## 使用

Python 3.11+。角色源文件在 `agents/`，运行下面命令安装四个角色到个人 `~/.codex/agents/`，已有同名文件更新前会保留一份 `.toml.bak`：

```powershell
python E:/Code/AgentBoard/tools/install_roles.py
```

三个项目外层 AGENTS 已有角色启动路由。新开项目聊天后可直接说：

> 按制作人流程恢复当前阶段，给出当前小阶段的产品大纲；需要并行时交技术负责人拆分、组织开发和集成，最后安排独立验收。

主聊天读制作人职责；lead/开发/验收按名称调用。若当前客户端的创建子代理工具尚不支持选择自定义角色，派工者读取相应 TOML，把 `developer_instructions` 和任务参数传入普通子代理；不能只改显示名。新装文件不保证当前已开的聊天热加载，首次使用建议新开项目聊天。主聊天的模型以界面选择为准；四个自定义角色显式配置为 `gpt-6.1-sol`。

阶段从各项目 STATE/路线图恢复，角色文件不写死 M0/M1。没有小阶段时，制作人开工再补短记录；本次安装不推进任何游戏进度。

## 上报

见 [统一调用与接口约定](agents/WORKFLOW.md)。制作人 begin 绑定项目、角色、任务、大阶段、小阶段；子实例 begin 只需 parent、role、task 和一句摘要，自动继承项目与阶段。以后 event 只需 run_id、事件和一句摘要。使用本机 Python，无常驻进程、额外依赖或逐工具记录。

派工链为制作人 → lead → 开发，独立验收直接挂制作人；单开发可直接挂制作人。开发 submitted 表示模块待集成，lead submitted 表示集成包待验收，只有 verifier 可报告验收结论，制作人依据证据决定阶段推进。STATE 仍仅由制作人维护。

当前返回 `delivery=queued`，事件保存在 `.local/outbox/`，一条一个 JSON，独立原子写入，多个开发不会争写一个状态文件。执行上下文在 `.local/runs/`。本轮没有联网发送、读取 Codex 私有数据库、申请云资源或推送 GitHub；不要把 queued 当成已同步。项目 STATE 仍是进度权威。

下一阶段沿用此命令接入 Supabase，不改角色提示词：先写本地发件箱，再有界发送，失败留待后续补发；后端以 event_id 去重。GitHub 仅发布代码和静态前端，运行数据进 Supabase，不逐事件 commit/push。到时需要 Supabase 项目地址与授权配置，当前不需要提供密钥。

## 校验

```powershell
python -m unittest discover -s E:/Code/AgentBoard/tests -v
```

测试使用隔离的临时数据目录，不产生游戏进度事件。手动运行可用 `AGENTBOARD_DATA_DIR` 指定本地发件箱位置（默认本仓库 `.local/`）。本安装依赖固定工作路径 `E:/Code/AgentBoard`，迁移时需同步修改角色与项目 AGENTS 中的路径。

## 监控网页

Node.js 22.14+，Python 3.11+。在本项目目录启动：

```powershell
cd E:/Code/AgentBoard
npm ci
npm run dev
```

打开 <http://127.0.0.1:5173/>。页面展示三个项目的大阶段、小阶段、执行实例、最近上报、关键事件和证据；项目、角色、状态及任务搜索可组合筛选。

初次打开为空态。点击“查看演示”可预览明确标记的示例，示例不是游戏实际进度。点击“连接设置 → 选择上报文件”，多选 `.local/outbox/` 内的 JSON 文件，即可查看角色工具产生的真实报告。每批导入整体替换当前导入内容，不增量合并；要查看完整历史，请选择所需的全部文件。文件只在浏览器内读取，刷新后清除，不上传任何服务。

当前是手动导入，尚无实时同步。活动报告超过 20 分钟显示“待确认”；开发/技术负责人提交与验收通过分开；项目阶段只取制作人上报，不从开发进度推算。

```powershell
npm run check
npm run build
```

`check` 包含类型检查、状态投影测试和真实 Python CLI 到网页导入的隔离合同测试。`build` 输出 `dist/`。GitHub Pages workflow 已准备，支持仓库子路径，但本地版没有配置远端、推送或部署。接入边界与后续工作见 [架构](docs/ARCHITECTURE.md)、[当前状态](docs/STATE.md)。

配置依据：[OpenAI 官方自定义 Agent 文档](https://learn.chatgpt.com/docs/agent-configuration/subagents)、[GPT-6.1 Sol 官方指南](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-6.1-sol)。采用职责聚焦、精简提示、按需委派与独立验证。
