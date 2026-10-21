# 四角色协作与上报

## 启动与阶段

- 主聊天默认承担制作人；自定义 TOML 是可调用角色，不会自行创建常驻进程。若显式指定其他角色，按指定职责执行，不再套制作人。
- 所有角色先读本项目 AGENTS 和 STATE，只加载本次任务需要的规则。制作人每次启动、恢复或接手都重读 STATE 与当前路线入口。lead、开发和验收从派工者继承项目和两级阶段，并核对 STATE；恢复时先确认该切片仍有效。
- 阶段的权威是项目文档与实际证据，数据库只是展示。`milestone` 用路线图原编号/名称；`step` 用具体可验收切片，不能填“编码中/测试中”。例如 `M1 / 核心原型 → M1a / 完整单局胜败与重试`；名称以项目文档为准。
- 已有 M1a 等编号原样保留。若没有小阶段，制作人在实际开工时向 STATE 的当前目标补一行 `大阶段：…；小阶段：…；目标：…；退出条件：…`，不新建进度账本。阶段有矛盾先查证；仍不能确认就用 `unconfirmed / 待核实`，上报 blocked，不能编造已完成。
- 小任务走“制作人 → 开发 → 制作人安排独立验收”；多开发并行或明显跨模块时走“制作人 → 唯一 game-tech-lead → 开发并行 → lead 集成 → 制作人安排独立验收”。按实际并发额度分批，开发结束回收后再启动验收，不留无任务实例。
- 制作人给当前切片的产品大纲：目标、范围、玩法/数值假设、交付物、验收条件。lead 给阶段内的短技术清单：task_id、接口、依赖、文件归属、自测要求；据此派发开发并负责集成。制作人不同时重复给这些开发派任务，lead 不再创建第二层 lead。单开发模式由制作人直接给开发必要边界。
- 每次派工包含 task_id、parent_run、目标、依赖/接口、写入范围和验收条件；项目与阶段可从 parent 自动继承。同一项目/小阶段只有一名 lead；共享场景、Prefab、配置及 .meta 单一写入者，集成范围也须认领。技术任务不是新的产品阶段，不把“编码/测试/集成”写成小阶段。
- 团队模式下仅制作人写 STATE；lead 汇总开发的证据与阻塞给制作人，验收直接向制作人报告。制作人随进展记录当前切片、证据和阻塞，推进阶段须依据验收。开发 submitted 表示模块待集成（单开发时待验收）；lead submitted 表示集成包待独立验收，均不代表通过。pass 仅覆盖验收实际检查范围，修复按问题回派后复验。

## 调用方式

Python 3.11+，无第三方依赖。每个执行绑定一次，后续只报变化。示例参数是假设，实际值须从当前项目读取：

```powershell
# 制作人启动/恢复：先重读 STATE，再登记本次阶段与任务。
python E:/Code/AgentBoard/tools/report.py begin --project cat-and-dog --role game-producer --milestone M1 '核心原型' --step M1a '完整单局胜败与重试' --task M1a-plan --summary '核对当前切片与验收条件，尚未开工'
# 输出 {"delivery":"queued","run_id":"…","event_id":"…","event":"started"}

# 多开发时启动 lead，自动继承制作人的项目与阶段：
python E:/Code/AgentBoard/tools/report.py begin --role game-tech-lead --parent <制作人的run_id> --task M1a-integration --summary '拆分当前切片并负责集成'
# lead 派开发；单开发模式可直接使用制作人的 run_id：
python E:/Code/AgentBoard/tools/report.py begin --role game-developer --parent <lead的run_id> --task M1a-battle --summary '实现认领的战斗模块'
# 集成包交付后，由制作人安排验收，parent 使用制作人的 run_id：
python E:/Code/AgentBoard/tools/report.py begin --role game-verifier --parent <制作人的run_id> --task M1a-check --summary '独立检查当前切片交付'

python E:/Code/AgentBoard/tools/report.py event --run <自己的run_id> --kind checkpoint --summary '战斗事件接口已确定' --evidence 'assets/scripts/BattleEvents.ts'
python E:/Code/AgentBoard/tools/report.py event --run <自己的run_id> --kind blocked --summary '缺少抖音 AppID，无法导入验证'
# 开发/lead 均可 submitted；区别由 role 决定：
python E:/Code/AgentBoard/tools/report.py event --run <lead的run_id> --kind submitted --summary '集成结果已交付，等待独立验收' --evidence 'docs/本次交付证据.md'
# 仅验收角色：
python E:/Code/AgentBoard/tools/report.py event --run <自己的run_id> --kind verification --verdict inconclusive --summary '浏览器闭环通过；抖音真机未测' --evidence 'docs/本次验收证据.md'
python E:/Code/AgentBoard/tools/report.py event --run <自己的run_id> --kind stopped --summary '本次任务已交接'
```

`begin` 自动生成独立 run_id，不能共用别人的执行 ID。`--instance` 可选填已知的 Codex 线程/子代理标识，省略则生成。`--parent` 建立派工关联并继承项目与两级阶段；若同时显式填写，必须与父执行一致。制作人或无 parent 的独立执行须填完整阶段；工具会检查 parent 角色关系，不能把验收挂到实现者名下。

run 是“角色×任务×阶段的一次执行”，不是永久 Agent 身份。切换阶段或任务：先 stopped，再重新 begin；恢复时同样重新 begin 并复用稳定 task_id。旧任务若仍在运行，制作人先协调交接，不能静默把其他实例改到新阶段。原 developer --lead 模式停止使用；旧执行先交接并 stopped，再新建 game-tech-lead，不改写或删除旧事件。

## 何时报告

只报启动/恢复、重要接口/产物/决策、阻塞/解除（unblocked）、提交、验收、结束/取消（cancelled）。简单执行通常 begin → submitted/verification → stopped 即可。制作人确定产品切片、lead 发布技术分工或接口时用 checkpoint，引用已有任务清单；不为上报新造长文档。

不逐工具上报，不定时让模型写心跳，不上传对话、思考、源码正文或密钥。摘要一句话，证据只用相对路径、提交号或安全链接。相互依赖的问题先通知协作者，数据库不充当消息总线。

上报错误不阻断开发，不反复重试；本次结束时简述未送达即可。`delivery=queued` 表示已本地排队，绝不说已上传。业务事件和传输状态分开。当前仅有本地发件箱，Supabase 接通后由同一入口负责发送，角色无需直接写 SQL、持有管理密钥或 git push。

## 未来接口约定

每条事件包含：`schema_version, event_id, occurred_at, run_id, instance_id, parent_run_id, project_id, role, lead, task_id, milestone{id,name}, step{id,name}, kind, summary, evidence[], verdict?`。阶段快照随事件携带，后端可独立处理；event_id 用作幂等键，occurred_at 是客户端时间，服务端另记 received_at，不能仅凭到达顺序覆盖状态。

角色值为 game-producer / game-tech-lead / game-developer / game-verifier。v1 的 lead 字段保留兼容，新执行由 `role == game-tech-lead` 自动派生，不能单独传 --lead；历史 developer+lead=true 仍按历史事实保留。前端识别 role 与 parent 链，不能把模块 submitted 或集成 submitted 展示成验收通过。

未来由 Supabase 接收端校验项目写入权限及角色事件约束，事务写入事件与状态投影；不能把本地 --role 当作安全授权。重试保留 event_id。密钥只留本机环境/服务端；Pages 前端仅持公开配置并受登录/RLS 约束，不能嵌入管理密钥。本轮不创建云资源或实现 HTTP 接收端。

网页应显示“最后上报的阶段/任务/状态＋时间”；很久没上报标待确认。自报 started 不能证明进程此刻仍在运行，异常退出也可能来不及 stopped。
