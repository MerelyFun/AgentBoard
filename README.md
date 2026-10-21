# AgentBoard

三个抖音小游戏共用的 Codex 角色、轻量主动上报工具与监控网页。

- 网页：[AgentBoard](https://xn--hyvt5k.club/AgentBoard/)
- 代码：[MerelyFun/AgentBoard](https://github.com/MerelyFun/AgentBoard)
- 首次登录：连接设置 → 输入本机 `E:/Code/AgentBoard/.local/网页访问码.txt` 中的访问码。

网页公开，进度由 Supabase Auth + RLS 限制成员查看。角色只在关键转折报告，不采集对话或 Codex 私有数据库。游戏项目的 STATE/路线图仍是阶段权威。

## 角色

| 角色 | 职责 |
|---|---|
| game-producer | 制作人兼玩法数值，恢复阶段、定义切片、安排独立验收、维护 STATE |
| game-tech-lead | 按需拆技术任务、接口和文件归属，组织并行开发与集成 |
| game-developer | 完成认领模块、自测、提交证据；支持并行实例 |
| game-verifier | 独立验收，给 pass / fail / inconclusive |

均配置 `gpt-6.1-sol`。小任务跳过 lead；多开发时只有一名 lead。完成即释放实例，不常驻空闲 Agent。公共约定与完整调用见 [WORKFLOW](agents/WORKFLOW.md)。

```powershell
python E:/Code/AgentBoard/tools/install_roles.py
```

安装到个人 `~/.codex/agents/`，覆盖同名角色前保留 `.toml.bak`。三个项目外层 AGENTS 已有启动路由。新开项目聊天可说：

> 按制作人流程恢复阶段，给出当前小阶段的产品大纲；需要并行时交技术负责人拆分、组织开发和集成，最后安排独立验收。

主聊天模型以界面选择为准；如派工接口不支持自定义角色，派工者读取对应 TOML 的 developer_instructions 并连同任务参数传给普通子代理。阶段必须来自实际 STATE，不写死在角色里。

## 主动上报

Python 3.11+，仅标准库，无后台进程。制作人 begin 绑定项目、任务、大阶段、小阶段；子实例由 parent 继承，后续只用 run_id 上报一句变化。切换任务/阶段时结束旧 run 后重新 begin。

`begin/event` 先原子写入 `.local/outbox/`，再有界发送（最多 5 条、约 2 秒总预算）。只有云端准确确认同一 event_id 才返回 `delivery=sent` 并移入 `.local/sent/`；失败保持 `queued`，不阻断开发。集中补发：

```powershell
python E:/Code/AgentBoard/tools/report.py flush
```

默认最多 100 条、15 秒。本机 `.local/transport.json` 已配四种角色各自的写入令牌，数据库只存哈希。角色继续使用原命令，无需 SQL、管理密钥或 git push。GitHub 发布代码，事件直接进入 Supabase。

只报启动、关键决策/产物、阻塞/解除、提交、验收、结束。提交不等于通过；阶段由制作人依据证据推进。不上报对话、思考、源码正文或密钥。

## 开发与验证

Node.js 22.14+、Python 3.11+：

```powershell
cd E:/Code/AgentBoard
npm ci
npm run dev
npm run check
python -m unittest discover -s tests -v
npm run build
```

本机网页 <http://127.0.0.1:5173/>，公开配置参考 `.env.example`。已配置时默认云端，登录后实时订阅；断线保留上次成功数据并明确提示。访问码不保存到浏览器，标准 Auth 会话可注销。

演示须手动开启且持续标记；本地导入只在浏览器读取，每批替换、刷新清除，与云端/演示不混合。可选 outbox 或 sent JSON，最多 500 文件、单个 256KB、总计 10MB；整批失败时保留此前数据。

项目阶段只取制作人，活动报告超过 20 分钟标待确认，不推断进程存活。历史展示最近 200 条云端事件，run 状态由完整数据库投影提供。

测试隔离数据和传输配置。`AGENTBOARD_DATA_DIR` 改发件箱目录，`AGENTBOARD_TRANSPORT_CONFIG` 改传输配置。角色安装使用固定路径 `E:/Code/AgentBoard`，迁移时同步角色和项目 AGENTS。

main 自动检查并发布 Pages，PR 只检查。见 [架构](docs/ARCHITECTURE.md)、[部署](docs/DEPLOYMENT.md)、[当前状态](docs/STATE.md)。
