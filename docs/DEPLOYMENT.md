# 部署与维护

仓库 `MerelyFun/AgentBoard`，网页 `https://xn--hyvt5k.club/AgentBoard/`，Supabase `llcgzbyvpchabvodytrc`（AgentBoard，ap-southeast-2）。域名继承账号个人 Pages，未购买或修改域名。

## GitHub Pages

Pages 使用 GitHub Actions、强制 HTTPS。main 自动检查/构建/部署；PR 只检查。Actions Variables：`VITE_SUPABASE_URL` 和 `VITE_SUPABASE_PUBLISHABLE_KEY`。二者是公开配置，不要放 service_role/secret key、writer token 或访问码。workflow 自动计算子路径。

## Supabase

迁移在 `supabase/migrations/`；函数在 `supabase/functions/`。先应用迁移，再部署 agentboard-ingest / agentboard-access，包含相对引用和 deno.json。两个函数关闭网关 JWT 检查，因为函数自行验证 writer token / viewer code；不能删掉自鉴权。

服务函数只用 Supabase runtime 内置凭证。部署前读当前官方文档，CLI 子命令先 --help，新迁移先 `supabase migration new`。DDL 后运行 Security/Performance Advisors，并以匿名/成员身份验证权限。

## 本机配置

`.local/transport.json` 已配置接收地址和四种角色令牌，原 Python 命令自动读取。配置示意（不得填写后提交）：

```json
{
  "endpoint": "https://PROJECT.supabase.co/functions/v1/agentboard-ingest",
  "tokens": {
    "game-producer": "随机令牌",
    "game-tech-lead": "随机令牌",
    "game-developer": "随机令牌",
    "game-verifier": "随机令牌"
  }
}
```

令牌至少 32 个随机字节、base64url 编码；服务器只存哈希。请求头 x-agentboard-token，body 为原始 v1 事件。HTTP 200 且 accepted:true、event_id匹配才确认。失败留 outbox；sent 保留原始已确认记录。

访问码在 `.local/网页访问码.txt`，原配置 `.local/viewer.json`，只授予查看。勿放 URL、截图或公开聊天。撤销凭证须同步服务端哈希/本机文件；立即终止已有查看会话还需撤销 membership，单改访问码不撤销已签发 JWT。

另一台机器应生成自己的令牌并注册哈希，不复用或公开原始凭证。没有常驻发送服务，网络恢复但无新报告时运行 `python tools/report.py flush`。

## 验证

`npm run check`、Python unittest、生产构建通过后，用隔离 QA run/目录验证真实云端，阶段与摘要明确 QA，不能伪装游戏进度。只清理本次已知 QA ID，不删真实报告。正式网页还须检查登录、实时更新、匿名不可读，才能报告部署成功。
