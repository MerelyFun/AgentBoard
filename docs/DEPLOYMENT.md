# 部署与维护

仓库 `MerelyFun/AgentBoard`，网页 `https://xn--hyvt5k.club/AgentBoard/`，Supabase `llcgzbyvpchabvodytrc`（AgentBoard，ap-southeast-2）。域名继承账号个人 Pages，未购买或修改域名。

## GitHub Pages

Pages 使用 GitHub Actions、强制 HTTPS。main 自动检查/构建/部署；PR 只检查。Actions Variables：`VITE_SUPABASE_URL` 和 `VITE_SUPABASE_PUBLISHABLE_KEY`。二者是公开配置，不要放 service_role/secret key、writer token 或访问码。workflow 自动计算子路径。

## Supabase

迁移在 `supabase/migrations/`；函数在 `supabase/functions/`。先应用迁移，再部署 agentboard-ingest / agentboard-access，包含相对引用和 deno.json。两个函数关闭网关 JWT 检查，因为函数自行验证 writer token / viewer code；不能删掉自鉴权。

服务函数只用 Supabase runtime 内置凭证。部署前读当前官方文档，CLI 子命令先 --help，新迁移先 `supabase migration new`。DDL 后运行 Security/Performance Advisors，并以匿名/成员身份验证权限。

八岗位沿用 `schema_version: 1` 和原事件字段。发布对应迁移与 ingest 校验后，前端和 reporter 均使用八种真实 role；不得依赖摘要把美术报告映射成开发。检查角色约束、父链允许关系、submitted 权限与 verifier 专用 verification 同步生效；`lead` 仅代表技术负责人，历史 developer+lead=true 仍兼容。既有运行记录保持原样，不回写角色或重建游戏进度。

## 接入更多项目

项目数量不再固定为三个，网页根据云端快照自动展示。先应用 `registered_projects` 迁移并部署新版 `agentboard-ingest`，再按 `supabase/register-project.example.sql` 替换占位值：登记项目 ID、显示名称等元数据，仅为需要上报该项目的 writer 显式追加授权。既有 token 的角色与项目范围不会自动改变。浏览器保持只读，不提供管理凭证或项目授权入口。

使用本仓库 reporter 时，在 `projects.toml` 加入相同 ID 的项目配置（根目录、仓库、STATE 与路线图），即可使用原 `begin/event/flush` 命令。ID 长度为 1–200 个 UTF-16 码元，不能含空白/控制字符，不能为 `all`。未登记项目仍由外键拒绝，已登记但未授权项目由 Edge 和数据库双重拒绝。本地 JSON 导入可读取更多项目，未配置显示名称的项目以 ID 显示。

## 本机配置

`.local/transport.json` 应配置接收地址和八种角色各自的令牌，原 Python 命令自动读取。四个美术岗位分别注册自己的服务端哈希与项目写入授权，不能复用 game-developer 身份。下列仅为占位示意，不含实际令牌；真实配置不得提交：

```json
{
  "endpoint": "https://PROJECT.supabase.co/functions/v1/agentboard-ingest",
  "tokens": {
    "game-producer": "<producer-token>",
    "game-tech-lead": "<tech-lead-token>",
    "game-developer": "<developer-token>",
    "game-verifier": "<verifier-token>",
    "game-art-lead": "<art-lead-token>",
    "game-asset-artist": "<asset-artist-token>",
    "game-ui-artist": "<ui-artist-token>",
    "game-vfx-artist": "<vfx-artist-token>"
  }
}
```

令牌至少 32 个随机字节、base64url 编码；服务器只存哈希。请求头 x-agentboard-token，body 为原始 v1 事件。HTTP 200 且 accepted:true、event_id匹配才确认。失败留 outbox；sent 保留原始已确认记录。

访问码在 `.local/网页访问码.txt`，原配置 `.local/viewer.json`，只授予查看。勿放 URL、截图或公开聊天。撤销凭证须同步服务端哈希/本机文件；立即终止已有查看会话还需撤销 membership，单改访问码不撤销已签发 JWT。

另一台机器应生成自己的令牌并注册哈希，不复用或公开原始凭证。没有常驻发送服务，网络恢复但无新报告时运行 `python tools/report.py flush`。

## 验证

`npm run check`、Python unittest、生产构建通过后，用隔离 QA run/目录验证真实云端，阶段与摘要明确 QA，不能伪装游戏进度。覆盖八岗位接收与显示、允许及拒绝的父链、美术 submitted、非 verifier 的 verification 拒绝，以及旧四角色记录可读。只清理本次已知 QA ID，不删真实报告。正式网页还须检查登录、实时更新、匿名不可读、办公室岗位筛选与小屏交互，才能报告部署成功。
