# AgentBoard 架构

AgentBoard 统一展示 3Match、CatAndDog、IncrementalXxx 的阶段、任务、角色和重要事件。Agent 主动报告；网页呈现报告与时效，不推断 Codex 的内部运行状态。

## 边界

- `agents/`、`tools/`、`tests/`、`projects.toml`：角色对话负责的角色提示、上报协议、Python 工具与配置。接入前先读 `agents/WORKFLOW.md`，不另起一套事件字段。
- `src/`：React + TypeScript 网页、状态投影和导入测试。演示数据按需加载，默认空态；真实本地导入与演示分开。
- `.github/workflows/pages.yml`：检查、构建与 GitHub Pages 发布。Pages 只运行静态文件，不承担上报接收端。
- `docs/STATE.md`：本项目当前进度、验证与下一步；三个游戏的阶段权威仍是各项目的 STATE 和路线图。

当前数据流：四角色 → `tools/report.py` → `.local/outbox/*.json` → 用户多选文件 → 浏览器内校验/投影。刷新后清除，每批导入替换全部导入数据。最多 500 文件，单文件 256KB、总计 10MB；任一文件无效整批拒绝，保留此前数据。

目标数据流：角色 → 同一轻量入口 → Supabase → 网页只读查询/订阅。GitHub 存代码和部署产物，事件数据不通过 commit/push 同步。角色协议 v1 已接入本地导入；Supabase 表、接收端和订阅留待后续实现。用户要求当前仅本地，不创建远端或发布。

`src/data/report-import.ts` 校验 v1 事件、按 event_id 去重，并以微秒时间与 event_id 排序。run 上下文不可变；由事件生成执行状态和关键事件，只有制作人可更新项目级阶段。四角色支持 producer → tech-lead → developer 及 producer → verifier 的父执行关系，兼容旧 developer 的 lead 标记。UI 不依赖 reporter 内部存储结构之外的 Codex 信息。

## 状态语义

大阶段、小阶段来自游戏项目文档；角色工作状态和验收结果单独显示。开发提交不等于验收通过，完成任务不自动推进游戏阶段。

启动、任务接领、关键产物或决策、阻塞、解除阻塞、提交、验收和停止属于重要事件。每次普通工具调用不产生看板事件。时间戳表示最近报告，过期报告显示“待确认”，不能认定 Agent 死亡或仍在工作。

无云连接时默认显示未接入/空态。只有用户显式打开演示时才显示带持久标记的示例；构建与部署不能把示例当真实报告，也不能以无错误证明已连接。

## Supabase 接入约束

表、鉴权、事件去重与实时订阅按最终上报协议实现，本阶段不预建假接口。浏览器侧仅使用允许公开的连接配置和受访问策略限制的读取权限；任何写入凭据、管理员密钥或本地发件箱均不得进入静态包或 Git。

## 构建与发布

Node.js 22.14+、Python 3.11+；CI 使用 Node 24 和 Ubuntu 的 Python 3。运行 `npm ci`、`npm run check`、`npm run build`，输出 `dist/`。

Pages workflow 从 `GITHUB_REPOSITORY` 计算 `VITE_BASE_PATH`：普通项目仓库为 `/仓库名/`，`owner.github.io` 为 `/`。Vite 配置读取此环境变量；内部链接和静态资源使用相同基址，避免子路径白屏。首版无需服务端路由。

PR 只运行只读检查与构建；仅 main 推送或在 main 手动触发时上传并部署 Pages，写权限只授予部署 job。启用远端发布前，仓库的 Pages 发布源需设为 GitHub Actions；尚未运行远端 workflow 时不能宣称部署成功。

## 验证

类型与网页测试由 `npm run check` 执行；生产构建及仓库子路径预览检查静态资源。浏览器验收覆盖项目切换、筛选、详情、空态、演示标记和窄屏。角色工具修改另跑 Python 测试；不为未改动的角色逻辑重复造测试。

发布配置依据：[GitHub Pages 官方工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)、[setup-node](https://github.com/actions/setup-node)、[Vite base](https://vite.dev/config/shared-options.html#base)。
