# AgentBoard 架构

八角色（玩法/技术/验收四类与美术四类）→ `tools/report.py` → 本机 outbox → 鉴权 HTTPS Edge Function → Postgres 事件与投影 → Auth + RLS 查询 / Realtime → GitHub Pages。

游戏的 STATE/路线图仍是阶段权威。数据库展示报告，不采集对话或 Codex 私有数据库，不推断进程状态。

## 事件和状态

协议见 `agents/WORKFLOW.md`。v1 事件包含完整执行上下文；event_id 幂等，相同 ID/内容重复确认，不同内容拒绝。run 的项目、角色、任务、阶段、父执行不可变。按客户端微秒时间+event_id排序，服务端另记 received_at；乱序到达仍正确投影。

本机原子写入，准确 ACK 后移至 sent。多进程非阻塞锁避免抢发；自动最多 5 条 / 约 2 秒，失败不影响游戏开发。显式 flush 默认 100 条 / 15 秒。没有常驻进程，没有新报告时不主动轮询。

数据库保留 append-only 事件和完整 run/project 投影；快照只含最近 200 条历史，但 run 状态不依赖截断历史。只有 producer 更新项目阶段；checkpoint 保留阻塞/结论，submitted 不等于通过，停止后保留验收结论；活动报告超 20 分钟标待确认。

## 权限

静态包只有公开 URL/publishable key。未登录可打开外壳，不能读实际进度。随机访问码服务端只存 SHA-256；Edge 验证后用内部地址生成一次性 Auth 登录令牌并交换标准会话，不发送邮件。访问码不保存到浏览器。

数据 SELECT 必须有 membership，普通 authenticated 身份不会自动获权。成员表仅本人可读，浏览器没有写入权限；服务 RPC 仅授权 service_role。八类 writer token 分角色、限三个项目，服务端不能信任本地 --role。private 表/函数不暴露，不用 public SECURITY DEFINER 绕过授权。

服务密钥来自 Edge runtime，不下载到本机或前端。`.local/`、访问码、运行数据不得进入 Git。CORS 限正式域名及本机端口，凭证鉴权仍是安全边界。

## 网页与发布

云端、演示、本地导入分离；切换停止订阅。Realtime 去抖刷新，订阅成功后补查避免首次竞态；页面恢复焦点及可见时每 30 秒补查。断线保留上次成功数据并明确提示，注销立即清除私有数据。

React + Vite + TypeScript。办公室由房间、共享桌、透明坐姿人物三份 WebP 组合；每四个真实 run 一桌，桌后/桌面/桌前分层，手机按项目查看。图像只承担场景，岗位/任务/阶段/状态由 HTML 和真实执行驱动。八岗位 role 在本地导入、云端 snapshot、身份图标及筛选间一致；不从旧摘要推断岗位。美术可提交，正式验收仍独占 verifier，领域平权不改变技术集成职责。

PR 只读检查，main 构建部署；部署 job 单独授予 pages/id-token 权限。helper 自动生成 `/AgentBoard/` 基址。仓库变量仅公开连接配置。账号已有自定义域名用于项目 Pages，强制 HTTPS。

测试涵盖领域投影、真实 Python CLI 合同、隔离 HTTP 传输和数据库/浏览器端到端验证。结果见 `docs/STATE.md`，维护见 `docs/DEPLOYMENT.md`。
