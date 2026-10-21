# Image Gen prompts

Generated using the built-in Image Gen tool. No reference images were used. Final copies: `dashboard-concept.png` and `dashboard-mobile-concept.png`.

## Desktop

```text
Use case: ui-mockup.
Asset type: production-ready complete desktop web application UI concept, screenshot of the whole primary dashboard, 1440 by 900, 16:10. No browser frame, no perspective, no physical devices.
Product: AgentBoard, an intentionally restrained and exceptionally legible Chinese monitoring workbench for three Douyin mini-game projects. The screenshot MUST be a full usable application primary screen, not a marketing hero.
Visual direction: professional Linear-like neutral SaaS interface; precise, airy, flat white surfaces over very pale cool gray canvas #F7F8FA; subtle #E5E8EC hairlines, ink #20262D, secondary #78818D, muted teal accent #188B80, very soft teal selection #E8F5F2. Neutral sans serif Chinese font with Inter-style Latin. 28px main title, 17px section titles, 14px body, 12px toolbar and metadata. 6px restrained corners, barely any shadows. No decorative artwork, no charts, no progress bars, no percentages, no metric tiles, no avatars with faces.
Precise full-screen composition:
A fixed 216px wide white left sidebar with subtle right border. Top a tiny simple teal board-like square outline mark and the word AgentBoard. Navigation row "项目总览" selected in pale teal with a small grid icon. A little gray navigation caption "游戏项目"; below three plain rows with tiny color squares: "3Match", "CatAndDog", "IncrementalXxx". Bottom left muted settings gear "设置" and below an understated text "主动上报 · 阶段清晰".
To the right, a 64px tall white app topbar with "项目总览" at left and at right a subtle outlined status control "演示模式" and a gear outline button "连接设置". A tiny amber dot on demo mode. Below topbar main canvas with 36px padding.
At main top a left aligned headline "三个项目，一个工作台。" and supporting copy "阶段、任务与关键行动，一目了然。" with good breathing room. At right of supporting line a tiny understated text "以下均为演示数据".
Below a single open white horizontal project summary strip, divided into three equal columns by thin vertical lines; NOT three separated rounded cards. Height around 190px. Column 1: tiny violet square, "3Match" bold, second line "星灯魔女". Large stage line "M0  环境与平台风险"; small label "当前小阶段"; text "M0.1 · 竖屏交互验证". At bottom tiny clock icon with "最后上报 · 2 分钟前", plus muted amber text "待确认 AppID". Column 2 teal square "CatAndDog", second line "毛球街保卫战", large stage "M1  最小可玩单局"; label "当前小阶段"; text "M1a · 胜败与重试"; bottom "最后上报 · 5 分钟前", subdued teal "暂无阻塞". Column 3 amber square "IncrementalXxx", second line "星际财团"; stage "M1  两块地机制原型"; label "当前小阶段"; text "M1.1 · 首次生产闭环"; bottom "最后上报 · 12 分钟前", subdued teal "暂无阻塞".
Below with 30px gap a two-column workspace: main left around 720px wide and right events rail around 280px wide, gap 24px. Both open white regions with subtle square-ish border, no card nesting.
Main left title row "Agent 动态" with subdued count "6 个示例" alongside. Under title one toolbar with a small search icon input "搜索任务…" wide left and compact select controls "全部角色" "全部状态" right. Under toolbar a table-like list with understated gray header "角色 / 当前任务", "大阶段 / 小阶段", "状态", "最后上报". Use 6 comfortable rows, each task and phase two-line text and tiny chevron at far right, visually suggesting click opens detail. Each row a 24px pastel geometric icon next to role. Example rows:
1 "制作人" minor "3Match", task "确认环境验证范围", phase "M0 · 环境与平台风险" / "M0.1 · 竖屏交互验证", status with teal dot "进行中", last "2 分钟前".
2 "开发 · A" minor "CatAndDog", task "接入胜败与重试", phase "M1 · 最小可玩单局" / "M1a · 胜败与重试", status teal dot "进行中", last "5 分钟前".
3 "开发 · B" minor "CatAndDog", task "补充单局状态测试", same M1 and M1a, status gray dot "待开始", last "8 分钟前".
4 "开发" minor "IncrementalXxx", task "实现首次生产闭环", phase M1 and M1.1, status teal dot "进行中", last "12 分钟前".
5 "验收" minor "CatAndDog", task "验证重试状态重置", phase M1 and M1a, status purple dot "待验收", last "15 分钟前".
6 "开发" minor "3Match", task "抖音构建与导入", phase M0 and M0.2, status amber dot "阻塞", last "18 分钟前".
Right rail title "关键事件" plus tiny light gray "演示". Under title vertical hairline timeline with small colored dots, simple time labels, readable compact event summaries:
"14:32" / "制作人确认当前阶段" / "3Match · M0.1"
"14:29" / "开发 A 开始胜败与重试" / "CatAndDog · M1a"
"14:22" / "首次生产闭环进入开发" / "IncrementalXxx · M1.1"
"14:18" / amber "构建任务等待 AppID" / "3Match · 阻塞"
At bottom of rail muted small help "仅展示关键上报，长时间未更新不代表停止。"
Constraints: full primary screen fits whole canvas, all areas fully composed, code-native text/controls/table and simple line icons easy to implement in React/CSS. All sample statuses must clearly be demo. Do not invent any other navigation, section, chart, statistic, percentage, big decorative banner, unrelated branding or card grid. The board is for understanding stages and important events. Maintain excellent Chinese character rendering and reasonable row density.
```

## Mobile

```text
Use case: ui-mockup.
Asset type: complete narrow mobile responsive webpage screenshot, single 400 by 1100 app screen with no device frame. This is the responsive version of the AgentBoard desktop monitoring dashboard, not a new design or marketing page.
Visual system: flat very pale coolgray canvas #F7F8FA, white app surfaces, #E5E8EC 1px hairlines, ink #20262D, secondary #78818D, teal #188B80, teal selection #E8F5F2, amber caution #B77916. Chinese neutral sans serif, restrained 6px corners, 14px content and 12px metadata, 24px heading. No photos, no decoration, no charts, no progress bars or percentages, no fake metrics.
Screen:
Top white 60px header with tiny teal square outline logo and "AgentBoard" left, two small buttons on right: amber dot "演示" and gear outline icon. Border-bottom. No desktop sidebar. Main vertical scroll area has 20px side margins.
Title at y90 "三个项目，一个工作台。" and small subtitle "阶段、任务与关键行动，一目了然。".
Compact project select full-width at y170 labelled "全部项目" with chevron and muted right "演示数据". Under it a white project overview list grouped into three compact rows divided by hairlines:
Row1 violet square "3Match" bold and "星灯魔女" muted, next line "M0 · 环境与平台风险", next "M0.1 · 竖屏交互验证"; metadata bottom "2 分钟前" and amber "待确认 AppID".
Row2 teal square "CatAndDog" and "毛球街保卫战", "M1 · 最小可玩单局", "M1a · 胜败与重试"; bottom "5 分钟前" and teal "暂无阻塞".
Row3 amber square "IncrementalXxx" and "星际财团", "M1 · 两块地机制原型", "M1.1 · 首次生产闭环"; bottom "12 分钟前" and teal "暂无阻塞".
After 24px gap section title "Agent 动态" with right muted "6 个示例". Under one search bar "搜索任务…" and next line two equal selectors "全部角色" and "全部状态".
A white list of three example rows with fine separators. First role "制作人" / tiny "3Match", right teal dot "进行中"; task "确认环境验证范围"; next stage "M0 · 环境与平台风险"; next substage "M0.1 · 竖屏交互验证"; bottom muted "最后上报 · 2 分钟前" and tiny chevron.
Second role "开发 · A" / CatAndDog, status teal "进行中"; task "接入胜败与重试"; stage "M1 · 最小可玩单局" and "M1a · 胜败与重试"; metadata "最后上报 · 5 分钟前" chevron.
Third role "验收" / CatAndDog, purple "待验收"; task "验证重试状态重置"; stage "M1 · 最小可玩单局"; "M1a · 胜败与重试"; metadata "最后上报 · 15 分钟前" chevron.
At bottom understated "关键事件" heading and first timeline item, suggesting natural further page scroll.
Important: this is a compact professional actual app UI. Each row has stage + substage visible, no horizontally overflowing table, no stacked giant decorative cards. Keep real text readable and consistent with exact quoted copy. All data explicitly demo. Full viewport evenly composed, practical to implement in React/CSS.
```
