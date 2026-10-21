# AgentBoard 当前状态

更新：2026-10-22

当前阶段：Supabase 接入及 GitHub Pages 首次发布验收。用户已授权 MerelyFun 账号发布。

## 已完成

- 四角色 / v1 事件协议不变；原 Python begin/event 已支持先写 outbox、自动有界发送和准确 ACK 归档。新增 flush，网络失败不影响开发。
- Supabase llcgzbyvpchabvodytrc：迁移、角色 token 哈希、viewer code 哈希、两个鉴权 Edge Function 已部署。
- 数据库事务去重和乱序投影；私表、写 RPC 仅 service_role；网页由 Auth + membership RLS 只读。
- 前端访问码登录、Realtime、断线/重试、注销清空及演示/导入隔离已实现。
- MerelyFun/AgentBoard 公开仓库已创建；Pages Actions、公开构建变量、HTTPS 已配置。
- 四种写入令牌和网页访问码只在本机 .local，不进入 Git。

## 已验证

- TypeScript + Vitest 50 项；Python 26 项；生产构建通过。
- Edge 8 项协议测试、两入口类型检查通过。
- 独立审查发现并修复滴流 ACK 超出总预算问题；0.3 秒预算实测 0.308 秒返回 queued、保留事件并释放锁。
- 真实 HTTP：匿名 snapshot 401、错误访问码 401、正确访问码换取真实 Auth 会话、成员可见三个项目 / 零执行。
- 未授权 authenticated 身份 snapshot 三个数组皆空；未下载服务密钥。公开源码原始凭证扫描通过。
- Advisors 无安全 WARN/ERROR。私表 RLS 无策略是刻意拒绝普通角色；新索引未使用 INFO 属新建空库，详情见部署记录。

## 待完成

- 首次 main push/Actions Pages 正式部署。
- 真实隔离 QA 上报 → 数据库 → 正式网页实时更新，去重/冲突/角色权限验证。
- 正式网页桌面/手机、登录/退出/切换验收，清理已知 QA 数据。

## 边界

实际游戏进度仍等角色开工后上报，未改三个游戏 STATE。网页历史最多 200 条，run 投影完整。活动报告过期只表示待确认。

源码审查发现非阻塞边界：正常 CLI 已阻止跨项目父子；若无效的跨项目新父子同时直接 HTTP 到达，现有每项目/run 锁可能让两者各自看不到另一端。不能用这种无效输入代替派工继承。
