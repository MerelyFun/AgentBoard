# 玩法与美术角色协作及上报

## 启动与阶段

- 主聊天默认承担制作人；自定义 TOML 是可调用角色，不会自行创建常驻进程。若显式指定其他角色，按指定职责执行，不再套制作人。美术任务另读 [ART_WORKFLOW.md](ART_WORKFLOW.md)，其中定义四个美术角色与制作人的领域平权、品质门槛和真实岗位上报方式。八岗位沿用 v1 事件字段。
- 游戏任务按需读取 `E:/Code/LittleGameDoc/Doc/GAME_DESIGN_CHARTER.md` 的相关条款；项目已确认目标与用户新指示优先。保持原产品入口与 STATE，不为引入技能重写全部文档或擅自引入运行时 AI、联网、商业化及新引擎。
- 所有角色先读本项目 AGENTS 和 STATE，只加载本次任务需要的规则。制作人每次启动、恢复或接手都重读 STATE 与当前路线入口。技术负责人、美术负责人、开发、美术专家和验收从任务来源继承项目和两级阶段，并核对 STATE；恢复时先确认该切片仍有效。parent_run 表示任务来源与阶段继承，不代表领域上下级。
- 阶段的权威是项目文档与实际证据，数据库只是展示。`milestone` 用路线图原编号/名称；`step` 用具体可验收切片，不能填“编码中/测试中”。例如 `M1 / 核心原型 → M1a / 完整单局胜败与重试`；名称以项目文档为准。
- 已有 M1a 等编号原样保留。若没有小阶段，制作人在实际开工时向 STATE 的当前目标补一行 `大阶段：…；小阶段：…；目标：…；退出条件：…`，不新建进度账本。阶段有矛盾先查证；仍不能确认就用 `unconfirmed / 待核实`，上报 blocked，不能编造已完成。
- 代码任务固定走“制作人 → 唯一 game-tech-lead → 开发各自 worktree/分支 → PR → lead review/checks/checkin → 制作人安排独立验收”。只有一名开发也必须有 lead；纯产品讨论/评审及外层状态记录可不启动 lead。按实际并发额度分批，开发结束回收后再启动验收，不留无任务实例。
- 制作人给当前切片的产品大纲：目标、范围、玩法/数值假设、交付物、验收条件。lead 给阶段内的短技术清单：task_id、接口、依赖、文件归属、自测要求；据此派发开发并负责 PR 审查、合入与集成。制作人不重复给这些开发派任务，lead 不再创建第二层 lead。
- 每次派工包含 task_id、parent_run、目标、依赖/接口、写入范围、验收条件，以及 harness_root、真实代码 repo_root、基线 SHA、分支和 worktree 路径；项目与阶段可从 parent 自动继承。同一项目/小阶段只有一名技术 lead；共享场景、Prefab、配置及 .meta 单一写入者。技术任务不是新的产品阶段，不把“编码/测试/集成”写成小阶段。
- 团队模式下仅制作人写外层 STATE；技术负责人和美术协调者汇总各自领域的证据与阻塞给制作人，验收直接报告制作人。开发 submitted 表示 PR 待技术负责人审查合入，技术负责人 submitted 表示已合入的集成版本待独立验收，四个美术岗位 submitted 表示资产/样件包已交付待接入或检查，均不代表通过。制作人依据独立验收推进阶段，pass 仅覆盖实际检查范围，修复继续走 PR 后复验。

## Worktree、PR 与合入

- 代码根与仓库由 `E:/Code/AgentBoard/projects.toml` 指定：3Match 为 `E:/Code/3Match/3Match/3Match`，CatAndDog 为 `E:/Code/CatAndDog/CatAndDog/CatAndDog`，IncrementalXxx 为 `E:/Code/IncrementalXxx/IncrementalXxx`。外层是产品文档与 STATE，不是 Git 根，不能在那里初始化第二套代码仓库或把外层目录本身作为 worktree 根；创建 worktree 的 Git 命令从真实 repo_root 执行，目标可按项目约定放在外层的 worktree 子目录。
- 每个开发的每次代码任务必须有独立 worktree 和分支。lead 分配唯一名称，开发从真实 repo_root 执行 `git fetch origin`，确认基线后 `git worktree add -b agent/<阶段>-<任务>-<标识> <独立路径> origin/main`。目标路径优先遵循项目 AGENTS 的存放约定；仅项目未指定时默认使用 `E:/Code/.agent-worktrees/<项目>/<任务标识>`。lead 在派工中给出绝对目标路径；父目录不存在才创建，已存在则复用；先确认目标子目录和分支未被占用，不复用别人的工作树。每份 worktree 有自己的 Creator 生成目录，按需打开 Creator 生成必要配置，不复制主工作区缓存伪造检查。
- worktree 不自动继承外层 AGENTS/文档。代码仓库内 AGENTS 是入口，必须显式读取对应 harness_root 的 AGENTS/STATE 和本轮规则；外层 STATE 由制作人共享维护，不进入开发代码 PR。规格改动交制作人同步，PR 正文提供远端可读的验收摘要，不能只放本机绝对路径。
- 开发只在自己的 worktree 修改，适当检查后提交、推送任务分支并开 PR（base=main）。正文包括 task_id、两级阶段、范围/验收摘要、实际检查与未验证项；交付附 PR URL 与最新 HEAD SHA。创建 PR 后按客户端要求将其附加到当前任务。不得直接写/推 main、自行 merge、force push，返修继续原 PR。
- lead 逐个审查最新 HEAD 的 diff、范围、接口、Cocos 引用/.meta 和检查证据，必要时实际运行受影响检查。有问题退回开发，PR 更新后重新检查；无 CI 不等于检查通过，类型检查不等于 Creator/平台验收。审查结论留在 PR，标明所审 SHA、检查和未测项。共享场景等仍单一写入者；依赖任务等前置 PR 合入后从新基线开工，冲突优先由原开发解决。
- checkin 指 lead 把审查且检查通过的 PR 合入 main，默认 squash，并匹配刚审过的 HEAD（例如 `gh pr merge <PR> --squash --match-head-commit <SHA>`）；遵守仓库保护，不使用 admin 绕过。集成需要新代码时交开发另走修复 PR；lead 自己写的代码也必须 worktree/PR，不得自审，由另一独立实例审查、检查通过后仍由唯一 lead 合入。保留合入 SHA，验收测试该明确版本，main 不得因他人未合入分支而宣称功能完成。
- Agent 角色不是不同 GitHub 账号。当前共用 MerelyFun 身份时，lead 使用评论型 review 记录真实审查结论，再按结论合入；不能声称同一账号正式 Approve 了自己的 PR。需要平台强制不同身份批准时，须另有独立 GitHub 身份及分支规则；当前配置不伪装这种保护。
- 开发 submitted 的 evidence 放 PR URL/HEAD/检查；lead 逐 PR checkpoint 引用 review 与合入 SHA，集成 submitted 后由制作人派独立验收。PR 合入、证据保留且 worktree 干净后才能清理；用 `git worktree remove`，不强删脏工作树，不删除未合入或有未交接改动的分支。初次工程骨架的 main 初始化是一次性引导，后续开发全部走上述流程。

## 产品与玩法打磨

- 保留原四种玩法/技术角色，并增加四种美术角色。制作人兼任产品和玩法/数值设计，负责体验、范围与优先级；美术 lead 负责视觉方向与资产质量，两者领域平权。普通玩法取舍由制作人负责；跨领域分歧按 ART_WORKFLOW 用已确认目标、游戏内效果、性能与制作成本协商，不授予制作人单方推翻美术专业结论的权限。另派独立 game-verifier 做玩法评审或正式验收。
- 首次启动可玩版目标时，制作人从既有设定集与路线收拢整体玩法：玩家反复做什么、有哪些真实选择、怎样得到反馈/成果、怎样进入下一目标；列出本版必须可玩的核心内容、后续内容及主要风险。只在原文档记录必要结论，不重新写整套大纲。恢复时复用并核对已有结论。
- 制作人给初稿与要挑战的问题，派一次 design-review；首个完整可玩版派 play-review。重大方向取舍或核心体验反复不成立时再评审，普通实现不反复开会。评审可向制作人提问/质疑，制作人明确采纳、暂缓或用最小实验验证，一轮讨论后落到开发。
- 评审复用 game-verifier 和原事件协议：task_id 使用稳定的切片编号加 design-review/play-review/acceptance 等后缀，摘要说明任务类型，不作为新的产品小阶段。design-review/play-review 以 begin → checkpoint（问题、观察、最小改法、验证条件）→ stopped 交付；仅 acceptance 使用 verification + verdict。切换任务新建 run。正式验收优先另派新实例，不验收自己实现的代码，不把设计评审通过当作好玩或功能通过。
- 推进顺序：梳理整体玩法与本版范围 → 最小完整可玩循环 → 实际试玩/观察 → 选择最影响理解、选择或节奏的 1—3 个问题 → 实现最小改动 → 复测，再按路线补本版所需代表内容、教学和进度。占位图形可以简陋，但输入、信息、状态变化和结果反馈必须清楚。占位要求适用于玩法验证阶段；明确进入美术代表切片后，应交付实际资产与游戏内效果，不能一直以占位为由拒绝美术工作，也不能仅凭已有原型跳过尚未通过的路线前置门。
- 体验检查使用本项目的真实假设，例如是否存在不同决策与后果、唯一最优策略、挫败或无意义等待、看不懂的收益/消耗；记录实际步骤与改前/改后结果，不伪造玩家评价或量化改善。没有真人反馈只表示缺证据；Agent 操作/模拟不能替代路线要求的真人或平台验收。
- 用户要求连续完成可玩版时，制作人先在 STATE 确认本版范围、退出条件和对应路线门槛，再按切片接续推进，不把每个切片完成当作整个目标结束。核心循环、结束/阶段成果及重试/继续可用，核心功能与数值问题已修复，已针对体验问题修改并复测或说明无需修改的证据，才交付当前范围。真人/设备暂缺时仍完成独立可做工作并交付可试玩入口，明确待验范围；不虚报整阶段通过或擅自扩到后续批量内容，不无限追求“更好玩”。

## 调用方式

Python 3.11+，无第三方依赖。每个执行绑定一次，后续只报变化。示例参数是假设，实际值须从当前项目读取：

| 实际岗位 role | 有 parent 时允许的任务来源 | 可用 submitted |
| --- | --- | --- |
| game-producer | 无；提供完整项目与两级阶段 | 否，使用 checkpoint |
| game-tech-lead | game-producer | 是 |
| game-developer | game-producer、game-tech-lead；代码任务仍须唯一技术负责人协调 | 是 |
| game-verifier | game-producer；不可挂实现者 | 否，正式验收使用 verification |
| game-art-lead | game-producer、game-tech-lead | 是 |
| game-asset-artist | game-producer、game-tech-lead、game-art-lead | 是 |
| game-ui-artist | game-producer、game-tech-lead、game-art-lead | 是 |
| game-vfx-artist | game-producer、game-tech-lead、game-art-lead | 是 |

每个岗位使用自己的真实 `--role`。`<…>` 是须替换的执行 ID，不能原样运行；所有示例仅说明调用，创建美术任务前仍须满足当前路线的前置门。

```powershell
# 制作人启动/恢复：先重读 STATE，再登记本次阶段与任务。
python E:/Code/AgentBoard/tools/report.py begin --project cat-and-dog --role game-producer --milestone M1 '核心原型' --step M1a '完整单局胜败与重试' --task M1a-plan --summary '核对当前切片与验收条件，尚未开工'
# 输出 {"delivery":"queued","run_id":"…","event_id":"…","event":"started"}

# 代码任务先启动唯一 lead，即使只有一名开发；自动继承项目与阶段：
python E:/Code/AgentBoard/tools/report.py begin --role game-tech-lead --parent <制作人的run_id> --task M1a-integration --summary '拆分当前切片并负责集成'
# lead 派开发；只有一名开发也必须挂 lead：
python E:/Code/AgentBoard/tools/report.py begin --role game-developer --parent <lead的run_id> --task M1a-battle --summary '实现认领的战斗模块'
# 已确认的美术切片使用真实岗位；下列任务从 parent 继承该切片的实际项目与两级阶段：
python E:/Code/AgentBoard/tools/report.py begin --role game-art-lead --parent <制作人的run_id> --task slice-art-direction --summary '协调当前美术样件和资源规范'
python E:/Code/AgentBoard/tools/report.py begin --role game-asset-artist --parent <美术lead的run_id> --task slice-art-assets --summary '制作已认领的代表资产'
python E:/Code/AgentBoard/tools/report.py begin --role game-ui-artist --parent <美术lead的run_id> --task slice-art-ui --summary '制作HUD和界面状态样件'
python E:/Code/AgentBoard/tools/report.py begin --role game-vfx-artist --parent <美术lead的run_id> --task slice-art-vfx --summary '制作核心反馈与中断复位样件'
# 集成包交付后，由制作人安排验收，parent 使用制作人的 run_id：
python E:/Code/AgentBoard/tools/report.py begin --role game-verifier --parent <制作人的run_id> --task M1a-check --summary '独立检查当前切片交付'

python E:/Code/AgentBoard/tools/report.py event --run <自己的run_id> --kind checkpoint --summary '战斗事件接口已确定' --evidence 'assets/scripts/BattleEvents.ts'
python E:/Code/AgentBoard/tools/report.py event --run <自己的run_id> --kind blocked --summary '缺少抖音 AppID，无法导入验证'
# 开发、技术负责人及四个美术岗位均可 submitted；交付含义由 role 和证据决定：
python E:/Code/AgentBoard/tools/report.py event --run <lead的run_id> --kind submitted --summary '集成结果已交付，等待独立验收' --evidence 'docs/本次交付证据.md'
python E:/Code/AgentBoard/tools/report.py event --run <美术岗位自己的run_id> --kind submitted --summary '当前样件包已交付，等待技术接入和检查' --evidence 'docs/art/ASSET_MANIFEST.json'
# 仅验收角色：
python E:/Code/AgentBoard/tools/report.py event --run <自己的run_id> --kind verification --verdict inconclusive --summary '浏览器闭环通过；抖音真机未测' --evidence 'docs/本次验收证据.md'
python E:/Code/AgentBoard/tools/report.py event --run <自己的run_id> --kind stopped --summary '本次任务已交接'
```

`begin` 自动生成独立 run_id，不能共用别人的执行 ID。`--instance` 可选填已知的 Codex 线程/子代理标识，省略则生成。`--parent` 建立任务关联并继承项目与两级阶段；若同时显式填写，必须与父执行一致。制作人或无 parent 的独立执行须填完整项目与阶段；工具会检查上表的 parent 角色关系，不能把验收挂到实现者名下。协议允许的任务来源不替代代码任务的唯一技术负责人规则，也不授予领域上的指挥权。

run 是“角色×任务×阶段的一次执行”，不是永久 Agent 身份。切换阶段或任务：先 stopped，再重新 begin；恢复时同样重新 begin 并复用稳定 task_id。旧任务若仍在运行，制作人先协调交接，不能静默把其他实例改到新阶段。原 developer --lead 模式停止使用；旧执行先交接并 stopped，再新建 game-tech-lead，不改写或删除旧事件。

## 何时报告

只报启动/恢复、重要接口/产物/决策、阻塞/解除（unblocked）、提交、验收、结束/取消（cancelled）。开发和美术交付通常 begin → submitted → stopped，正式验收 begin → verification → stopped，玩法/美术方案评审 begin → checkpoint → stopped。制作人确定产品切片或玩法取舍、技术负责人发布接口、美术协调者确认样板时用 checkpoint，引用已有任务清单；不为上报新造长文档。

不逐工具上报，不定时让模型写心跳，不上传对话、思考、源码正文或密钥。摘要一句话，证据只用相对路径、提交号或安全链接。相互依赖的问题先通知协作者，数据库不充当消息总线。

上报错误不阻断开发，不让模型反复重试。缺配置、暂时离线、发送忙或正常 queued 时静默继续，不逐次提醒用户，不要求用户通知或重启 agent；只有本地记录失败、凭证失效等持续且需要用户处理的问题才简述一次。`delivery=queued` 表示已本地排队，绝不说已上传；只有收到相同 event_id 的云端确认才返回 `delivery=sent`。业务事件和传输状态分开。原入口自动有界补发，上报不需要直接写 SQL、持有管理密钥或逐事件 git push；代码交付按前述 PR 流程。

## 接口约定

每条事件包含：`schema_version, event_id, occurred_at, run_id, instance_id, parent_run_id, project_id, role, lead, task_id, milestone{id,name}, step{id,name}, kind, summary, evidence[], verdict?`。阶段快照随事件携带，后端可独立处理；event_id 用作幂等键，occurred_at 是客户端时间，服务端另记 received_at，不能仅凭到达顺序覆盖状态。

八种角色值为 game-producer / game-tech-lead / game-developer / game-verifier / game-art-lead / game-asset-artist / game-ui-artist / game-vfx-artist。`schema_version` 仍为 1，事件字段不变，美术使用真实 role。`lead` 只表示技术负责人，新执行由 `role == game-tech-lead` 自动派生，不能单独传 --lead，game-art-lead 的 lead 为 false；历史 developer+lead=true 仍按历史事实保留，不改写旧事件。前端按真实 role 与 parent 链显示岗位和任务来源，不能把开发、美术或集成 submitted 展示成验收通过。

submitted 仅供 game-tech-lead、game-developer 和四个美术岗位；制作人交接用 checkpoint。verification 与 verdict 仅供独立 game-verifier 的 acceptance，verdict 为 pass/fail/inconclusive；任何其他岗位不能给正式验收结论。来源父链与事件权限在 reporter 和云端同时校验。

Supabase 接收端校验项目写入权限及角色事件约束，事务写入事件与状态投影；不能把本地 --role 当作安全授权。重试保留 event_id。角色写入令牌只留本机 `.local/transport.json`；Pages 前端仅持公开配置并受登录/RLS 约束，不能嵌入管理密钥。

`begin/event` 自动先写发件箱、再尝试补发，最多 5 条、总预算约 2 秒。每次调用重新读取本机连接配置；配置就绪或网络恢复后，下一次正常上报会自动发送并分批补发旧记录，无需通知或重启角色。准确确认后移入 `.local/sent/`，原始记录保留。无人报告时不会主动轮询；需要手动补发可运行 `python E:/Code/AgentBoard/tools/report.py flush`（默认最多 100 条、15 秒）。网络不通、配置缺失或别的实例正在发送时，保持 queued 即可。详细连接与发布配置见 `docs/DEPLOYMENT.md`。

网页应显示“最后上报的阶段/任务/状态＋时间”；很久没上报标待确认。自报 started 不能证明进程此刻仍在运行，异常退出也可能来不及 stopped。
