# AgentBoard 当前状态

更新：2026-10-22

当前阶段：GitHub Pages 已发布，主动上报到正式网页的实时链路已验收。用户已授权 MerelyFun 账号发布。

网页：https://xn--hyvt5k.club/AgentBoard/  
仓库：https://github.com/MerelyFun/AgentBoard

## 已完成

- 四角色 / v1 事件协议不变；原 Python begin/event 已支持先写 outbox、自动有界发送和准确 ACK 归档。新增 flush，网络失败不影响开发。
- Supabase llcgzbyvpchabvodytrc：已应用 20261021173234_agentboard_cloud.sql，角色 token / viewer code 哈希已配置，agentboard-ingest 与 agentboard-access 均 ACTIVE v1。
- 数据库事务去重和乱序投影；私表、写 RPC 仅 service_role；网页由 Auth + membership RLS 只读。
- 前端访问码登录、Realtime、断线/重试、注销清空及演示/导入隔离已实现。
- MerelyFun/AgentBoard 公开仓库及 Pages 已发布；首次发布提交 1ddf378，Actions 39645112316 成功，公开构建变量和 HTTPS 已配置。
- 四种写入令牌和网页访问码只在本机 .local，不进入 Git。

## 已验证

- TypeScript + Vitest 50 项；Python 26 项；生产构建通过。
- Edge 8 项协议测试、两入口类型检查通过。
- 独立审查发现并修复滴流 ACK 超出总预算问题；0.3 秒预算实测 0.308 秒返回 queued、保留事件并释放锁。
- 真实 HTTP：匿名 snapshot 401、错误访问码 401、正确访问码换取真实 Auth 会话、成员可见三个项目 / 零执行。
- 未授权 authenticated 身份 snapshot 三个数组皆空；未下载服务密钥。公开源码原始凭证扫描通过。
- 真实 HTTP 上报：逆序事件得到正确投影；重复事件返回 duplicate；修改同 ID 内容或 run 上下文返回 409；跨角色 token 返回 403。
- 正式网页 HTTP 200，页面标题及 /AgentBoard/ 静态资源路径正确。
- 正式网页访问码登录成功，显示“云端 · 实时连接”；真实 CLI begin 返回 sent，submitted 后无需刷新，网页从“进行中”自动更新为“已提交”。
- 定向清理 HTTP / CLI 两组 QA 的事件和执行后，远端 projects 3 / runs 0 / events 0，网页同步恢复“等待第一条上报”。
- 429px 手机视口视觉通过，scrollWidth 414，无横向溢出。
- 浏览器证据保存在本机任务目录，不入 Git：agentboard-live-qa.png、agentboard-mobile.png、agentboard-published.png。
- 演示模式显示 7 个示例，切回云端恢复 0 个执行，数据无混合；退出登录恢复“请先登录”和访问码表单。
- 正式页浏览器控制台无 warn / error。
- Advisors 无安全 WARN/ERROR。私表 RLS 无策略是刻意拒绝普通角色；新索引未使用 INFO 属新建空库，详情见部署记录。

## 边界

实际游戏进度仍等角色开工后上报，未改三个游戏 STATE。网页历史最多 200 条，run 投影完整。活动报告过期只表示待确认。

源码审查发现非阻塞边界：正常 CLI 已阻止跨项目父子；若无效的跨项目新父子同时直接 HTTP 到达，现有每项目/run 锁可能让两者各自看不到另一端。不能用这种无效输入代替派工继承。
