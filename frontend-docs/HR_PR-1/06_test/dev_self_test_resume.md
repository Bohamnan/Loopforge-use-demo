# 开发自测用例 — 简历信息收集（frontend Workbench）

> **模式：开发自测（白盒），v2 增量更新**
> 验证分四类：① **R 引用单测**——用例映射到已有 Vitest 用例（文件 · 用例名见 `06_test/traceability_v2.md`），本批全量执行并通过；② **N 新增单测**——仅 AC / 红线缺口，本批新增 1 条（F-01）；③ **S 实测**——本批直接运行的 lint、test、build、grep、dist 扫描；④ **待 11q**——需要真实 backend、真实 DeepSeek 或真实浏览器联调，本批不启动后端、不连真实模型，不在此回填结果。缺口列为 `⚠ 缺口`，不属于 AC 或红线，本批未新增。
> 个人信息规则：v2 测试只用合成数据；v1 的真实样品（DL 本人简历）只在 11q 联调时使用，不入库，本文不含个人信息值。

## 文档版本

| 版本 | 日期 | 修改说明 | 作者 |
|------|------|----------|------|
| v1.0 | 2026-11-10 | 初始版本：用例设计 | Yin Yang |
| v1.1 | 2026-11-10 | 回填主流程联调与静态检查结果；31 条未执行 | Yin Yang |
| v2.0 | 2026-11-11 | 会话化增量（见文末变更清单）：requirements v2.0.2、接口消费规范 v0.3、OpenAPI 0.2.0、design v2.0、tasks v2.0。草稿相关用例改写或删除；E 类用例因 v1 脚本退役（任务 3.2）改为引用单测或待 11q；新增 REQ-FE-07..09 用例（§十–§十二）与会话列表用例；新增 1 条 F-01 静态测试（SC-11） | Yin Yang |

## 文档信息

| 项目 | 内容 |
|------|------|
| 需求文档 | `frontend-docs/HR_PR-1/01_requirements/requirements.md`（v2.0.2，REQ-FE-01..09，54 条 AC） |
| PRD | `01-requirements/HR_PR-1/prd.md` |
| Workbench 设计文档 | `frontend-docs/HR_PR-1/03_api/interface_spec_resume.md`（v0.3）；`frontend-docs/HR_PR-1/04_design/design.md`（v2.0，§8 追溯 54/54，§9.2 红线点）；`frontend-docs/HR_PR-1/05_task/tasks.md`（v2.0） |
| 契约 | `backend-docs/HR_PR-1/03_api/openapi.yaml` 0.2.0（冻结，本文件不修改） |
| 测试范围 | design §8 的 9 个分区（REQ-FE-01..09）；不含 backend 内部与模型识别质量（backend 范畴） |
| 测试环境 | 本批：Vitest + jsdom + React Testing Library，全部合成数据；**不启动 backend、不连真实 DeepSeek**。真实联调与 Orca 浏览器实测：待 11q 统一放行 |

## 数据源说明

| 数据源类型 | 说明 |
|-----------|------|
| 消费接口清单 | 13 个操作（interface_spec §一）。v1 的 `/resume-drafts*` 与 `POST /resumes` 已不存在 |
| 组件本地状态 | `SessionReducer` 与 hook 内存状态；不持久化（F-02、TD-03） |
| 合成数据 | `src/test/ApiMocks.ts`、`src/test/FakeBackend.ts`（会话模型，合成简历）；错误与超时场景由注入产生 |
| 真实样品 | v1 的真实样品仅用于 11q（003-IA-01、005-AC-02）；本批不读取、不使用 |
| 数据库 | 前端无数据存储；查库用例在 11q 由 backend 侧只读执行 |

## 执行方式标注

| 标注 | 含义 |
|------|------|
| `R:` | 引用已有 Vitest 用例（文件 · 用例名）；本批全量执行，68 文件 / 618 用例通过 |
| `N:` | 本批新增单测（F-01 凭证与外部端点静态断言，`src/test/CredentialAndEndpoint.test.ts`） |
| `S:` | 静态与构建，本批实测：`npm run lint`、`npm test`、`npm run build`、dist 扫描、源码 grep |
| `待 11q` | 需真实 backend、真实模型或真实浏览器；本批不执行。结果列保留 v1 历史结果并注明待复跑 |
| `⚠ 缺口` | 现有用例不能覆盖该断言，且不属于 AC 或红线；本批未新增，列入 M 表待 DL 决定 |

## 变量速查表

v2 不再使用草稿相关变量（`draftJson`、`recordId`、`editField`）。以下变量仅用于 11q 联合执行，取值方式与 v1 一致：

| 变量名 | 说明 | 获取方式 |
|--------|------|---------|
| `{变量:baseUrl}` | 前端地址 | `http://127.0.0.1:5173/` |
| `{变量:dataDir}` / `{变量:fileDir}` | 后端临时数据目录 / 原始文件目录（11q） | `mktemp -d`，启动 backend 时经环境变量指定 |
| `{变量:sampleFile}` | 真实样品（11q） | `/tmp/hr_sample/sample.png`，只在 /tmp |
| `{变量:synthDir}` | 合成错误文件目录 | `mktemp -d`，由脚本即时生成 |
| `{变量:viewport}` | 视口（11q） | 360×640、390×844、768×1024、1440×900 |

---

## 用例统计（本 Workbench 测试维度集，v2）

| 场景类型 | 代码 | 用例数 |
|---------|------|--------|
| 组件渲染 | RD | 9 |
| 主要交互流程 | IA | 40 |
| 加载态、空态与错误态 | ST | 41 |
| 接口调用（契约） | AC | 12 |
| 错误码映射 | EM | 22 |
| 响应式与窄屏 | RS | 8 |
| 安全静态 | SC | 11 |
| 合计 | — | 143 |

> 维度说明：模板四维（RD/IA/ST/AC）之外，按 TD-13、REQ-FE-06、interface_spec §四 保留 EM（22 条映射）、RS（窄屏）、SC（浏览器存储 / console / 外联 / 凭证）。v2 按 REQ-FE-07..09 新增 §十–§十二（对话、归档、更新）。用例表列为「前置 / 步骤与输入 / 预期 / 验证查询 / AC / 执行 / 结果」。

---

## 一、启动、会话列表与恢复

- 页面/组件：`ResumeCollectionPage`、`useSessionList`、`SessionList`、`WelcomePanel`、`ErrorAlert`、`NoticeBanner`
- 路由：`/`（单页）
- 消费接口：`GET /api/v1/sessions`（列表）、`GET /api/v1/sessions/{sid}`（选择会话）
- 关联需求：REQ-FE-05.1..05.3（v2 会话列表）、REQ-FE-02.1

| TC | 前置 | 步骤与输入 | 预期 | 验证查询 | AC | 执行 | 结果 |
|---|---|---|---|---|---|---|---|
| TC-FE-001-AC-01 | 新浏览器，无任何会话 | 打开 `{变量:baseUrl}` | 页面打开即发 1 次 `GET /api/v1/sessions`（经 api 层，same-origin）；不自动打开任何会话 | 包装 fetch 计数 = 1；F-01 静态断言：源码不读取 `document.cookie` | 05.1、06.1 | R: pages/ResumeCollectionPage.test（opens in the empty state）、pages/ResumeCollectionPage.sessions.test（does not open any of them）、api/SessionApi.test；N: test/CredentialAndEndpoint.test（has no cookie access） | ✅ 引用单测通过 |
| TC-FE-001-ST-01 | 无任何会话（列表为空） | 打开页面 | 欢迎页（「你好，我是简历录入助手」与上传入口）；会话列表为空；无错误提示 | DOM 含欢迎语；`role=alert` 数量 = 0；console 无输出（O-12） | 05.1 | R: pages/ResumeCollectionPage.test（opens in the empty state; the only request is the session list）；components/WelcomePanel.test | ✅ 引用单测通过 |
| TC-FE-001-IA-01 | 已有一个校对中的会话（刷新前已上传） | 刷新页面，在会话列表中选择该会话 | 刷新后不自动打开会话；列表显示该会话（校对中）；选择后回到校对视图，字段与刷新前一致 | 列表条数 = 1；打开后分区内容与 `GET /sessions/{sid}` 返回一致 | 05.1、05.3 | R: pages/ResumeCollectionPage.sessions.test（lists sessions with status words…；opens a reviewing and then a saved session…） | ✅ 引用单测通过；真实刷新恢复待 11q |
| TC-FE-001-IA-02 | 会话已进入最终确认前 | 刷新页面，在列表中选择该会话 | 恢复到可继续的确认视图；不出现「已保存」 | DOM 不含「已保存」；含「确认提交」或「确认本区」入口 | 05.3、04.3 | R: pages/ResumeCollectionPage.final.test（F-03 已保存只在确认后出现）；pages/ResumeCollectionPage.sessions.test | ✅ 引用单测通过 |
| TC-FE-001-ST-02 | `GET /sessions` 返回 500（注入） | 打开页面 | 列表区显示可重试错误；主区仍可上传与新对话；不当作「没有会话」 | 列表区 `role=alert` 1 个；上传入口可用；重试后列表恢复 | 05.2 | R: pages/ResumeCollectionPage.sessions.test（a failed list load only shows an error in the list area; retry recovers; upload still works） | ✅ 引用单测通过 |
| TC-FE-001-ST-03 | `GET /sessions` 网络失败（fetch reject，注入） | 打开页面 | 同 001-ST-02，文案为「网络异常，请检查网络后重试。」 | DOM 含该文案；不显示空态欢迎语 | 05.2 | R: api/ApiClient.test（network_error）；pages/ResumeCollectionPage.sessions.test | ✅ 引用单测通过 |
| TC-FE-001-ST-04 | GET 返回非 JSON 的 502（代理页） | 同上 | `unknown_error` 通用文案，不展示原始响应体 | DOM 不含 `<html`、不含响应正文 | 05.3、06.4 | R: api/ApiClient.test（非 JSON 失败 → unknown_error，不展示响应体） | ✅ 引用单测通过 |
| TC-FE-001-RD-02 | 已有含多条经历的会话（合成） | 打开该会话 | 工作 / 项目 / 教育按多条展示，条数与会话数据一致 | DOM 项目经历条数 = 会话 `fields.project_experiences` 长度（合成数据） | 02.1 | R: pages/ResumeCollectionPage.items.test（lists the existing items as editable cards） | ✅ 引用单测通过 |

---

## 二、上传简历

- 页面/组件：`ComposerBar`、`WelcomePanel`、`UploadProgressNotice`、`UploadPrecheck`、`ErrorAlert`（v2 无覆盖确认框）
- 消费接口：`POST /api/v1/sessions`
- 关联需求：REQ-FE-01（01.5 上传即新建会话）、REQ-FE-02.1

| TC | 前置 | 步骤与输入 | 预期 | 验证查询 | AC | 执行 | 结果 |
|---|---|---|---|---|---|---|---|
| TC-FE-002-RD-01 | 空态 | 检查文件 input | `accept` 为 `.pdf,.jpg,.jpeg,.png`（或等价），无 `multiple`；欢迎页与输入区显示「PDF、JPG、JPEG、PNG · 单个文件 ≤ 10 MB」 | DOM：`input[type=file]` 的 `accept`、`multiple` 属性；文案存在 | 01.1 | R: components/ComposerBar.test（has an upload button, a single-file input limited to the allowed types） | ✅ 引用单测通过 |
| TC-FE-002-IA-01 | 空态 | 上传合成 PNG（单测）；真实样品在 11q 执行 | 出现单一加载提示；完成后直接进入校对视图（不弹覆盖确认），显示各分区与待确认字段 | 加载提示唯一；完成后分区与字段可见 | 01.3、01.5、02.1 | R: pages/ResumeCollectionPage.upload.test（uploads directly, enters the review and sends the file once with same-origin credentials） | ✅ 引用单测通过；真实识别耗时与结果待 11q |
| TC-FE-002-AC-01 | 空态 | 观察上传请求 | `POST /api/v1/sessions`，multipart 字段 `file`，不手设 Content-Type，same-origin | 包装 fetch：method、path、`FormData`、无 Content-Type 头 | 01.5、06.1 | R: pages/ResumeCollectionPage.upload.test（sends the file once with same-origin credentials）；api/SessionApi.test（createSession） | ✅ 引用单测通过 |
| TC-FE-002-IA-02 | 上传进行中（注入延迟） | 加载期间再次点击上传 / 选文件 | 上传入口被禁用，POST 只发 1 次 | 包装 fetch：`POST /api/v1/sessions` 计数 = 1；按钮 disabled | 01.3 | R: pages/ResumeCollectionPage.upload.test（shows one loading notice, disables the inputs and ignores a second file while uploading） | ✅ 引用单测通过 |
| TC-FE-002-ST-01 | 空态 | 选 `{变量:synthDir}/a.txt` | 前端拦截，提示「仅支持 PDF、JPG、JPEG、PNG 格式。」，不发请求 | DOM 含该文案；POST 计数 = 0 | 01.2 | R: hooks/model/UploadPrecheck.test（类型判定）；pages/ResumeCollectionPage.upload.test（blocks unsupported type before any request） | ✅ 引用单测通过 |
| TC-FE-002-ST-02 | 空态 | 选 `big.png`（10485761 B） | 拦截，提示「文件超过 10 MB，请压缩后重试。」；不发请求 | 同上 | 01.2 | R: hooks/model/UploadPrecheck.test（accepts exactly 10 MB and rejects one byte more）；pages/ResumeCollectionPage.upload.test（blocks over 10 MB before any request） | ✅ 引用单测通过 |
| TC-FE-002-ST-03 | 空态 | 选 `zero.pdf`（0 B） | 拦截（对应 `file_empty`），不发请求 | POST 计数 = 0；有错误提示 | 01.2 | R: hooks/model/UploadPrecheck.test（rejects an empty file） | ✅ 引用单测通过 |
| TC-FE-002-ST-04 | 空态 | 选 `edge.png`（恰 10485760 B，内容非真实图片） | **放行**到 backend（边界），backend 判内容不符并返回错误；界面只显示 backend `message` | POST 计数 = 1；DOM 含 backend message；会话列表仍为空 | 01.2、01.6 | R: hooks/model/UploadPrecheck.test（accepts exactly 10 MB and rejects one byte more）；真实 backend 返回待 11q | ⏸ 待 11q（前端放行已引用单测；backend 返回待执行） |
| TC-FE-002-ST-05 | 空态 | 选大写扩展名 `UP.PNG`（内容为真实 PNG 缩略） | 前端放行（扩展名大小写不敏感） | POST 计数 = 1 | 01.1 | 缺口：UploadPrecheck.test 未断言大写扩展名（实现已小写化，见 M-9） | ⚠ 缺口（未新增，M-9） |
| TC-FE-002-ST-06 | 空态 | 一次选择多个文件（拖拽路径） | 提示「一次只能上传一个文件，已选择第一个。」，只处理第一个 | DOM 含提示；POST 计数 ≤ 1 | 01.1 | R: pages/ResumeCollectionPage.upload.test（takes the first of several dropped files and says so） | ✅ 引用单测通过 |
| TC-FE-002-ST-07 | **SUGGEST-1**：已在校对阶段（页面内容很长） | 滚动到页面顶部，选 `a.txt` 上传 | 错误提示固定显示在底部输入区，**当下在视口内可见**；整页只有 1 个 `role=alert` | DOM：`getBoundingClientRect()` 的 `top>=0 && bottom<=innerHeight`；`querySelectorAll('[role=alert]').length === 1`；在 360/1440 各验一次 | 01.2、01.6 | 待 11q：Orca 浏览器，视口 1280 与 360，SUGGEST-1 布局（v2 已加会话抽屉，需复跑） | ⏸ 待 11q（v1 2026-11-10 实测通过；v2 布局变更需复跑） |
| TC-FE-002-ST-08 | 空态 | 选 `fake.pdf`（扩展名 pdf，内容为文本） | 前端放行；backend 返回 `file_content_mismatch`；只展示 `message`，无文件内容；保持上传态可重选 | DOM 含 message；console 无文件名外的内容；会话列表不变 | 01.6 | R: components/ErrorAlert.test（只展示 message）；真实 backend 返回 file_content_mismatch 待 11q | ⏸ 待 11q（message 展示已引用单测；真实返回待执行） |
| TC-FE-002-ST-09 | 上传请求超过 75 秒（假定时器） | 推进 75 s | 结束等待，提示「请求超时，请重试。」并允许重新上传 | DOM 含提示；上传入口恢复可用 | 01.4 | R: pages/ResumeCollectionPage.upload.test（times out after 75 seconds with the re-upload hint）；api/ApiClient.test（75 s） | ✅ 引用单测通过 |
| TC-FE-002-IA-03 | 已有一个校对中的会话 | 再次上传合成 PNG | 不弹覆盖确认；新建第二个会话并进入其校对视图；第一个会话保留在列表中 | 会话列表条数 = 2；POST 1 次；无确认框 | 01.5 | R: pages/ResumeCollectionPage.upload.test（a second upload opens another session and does not overwrite the first） | ✅ 引用单测通过 |
| TC-FE-002-ST-11 | 已有校对中的会话；上传请求网络失败（注入） | 上传合成 PNG | 显示通用网络错误文案；校对视图保留；可再次上传 | 文案存在；会话列表条数不变 | 01.6 | R: pages/ResumeCollectionPage.upload.test（a failed upload leaves the reviewed session on screen）；api/ApiClient.test（network_error） | ✅ 引用单测通过；真实停服联调待 11q |

---

## 三、识别结果展示与字段状态

- 页面/组件：`SectionCard`、`FieldRow`、`FieldStatusTag`、`ReviewSummary`、`ReadOnlySection`
- 消费接口：（沿用 `SessionDetail`，来自 `POST /api/v1/sessions` 与 `GET /api/v1/sessions/{sid}`）
- 关联需求：REQ-FE-02

| TC | 前置 | 步骤与输入 | 预期 | 验证查询 | AC | 执行 | 结果 |
|---|---|---|---|---|---|---|---|
| TC-FE-003-RD-01 | 样品识别完成（合成） | 查看分区 | 11 个分区（基本信息、求职意向、个人信息、个人优势、工作经历、项目经历、教育背景、专业技能、证书与荣誉、语言能力、自我评价）覆盖 22 个字段 | DOM 分区标题 11 个；字段标签数与 SectionConfig 一致；会话 `fields` 键数 = 22 | 02.1 | R: pages/ResumeCollectionPage.review.test（shows all 11 sections and all 22 fields after opening a session）；hooks/model/SectionConfig.test | ✅ 引用单测通过 |
| TC-FE-003-RD-02 | 同上 | 看状态标签 | `recognized`→「待确认」，`uncertain`→「不确定、请确认」，`missing`→「待补充」，`confirmed`→「已确认」；状态用文字表达，不只靠颜色 | DOM：标签文字集合 ⊆ 上述四种；计数与会话 `fields` 状态计数一致 | 02.2 | R: pages/ResumeCollectionPage.review.test（shows the four statuses with the designed wording）；components/FieldStatusTag.test | ✅ 引用单测通过 |
| TC-FE-003-RD-03 | 同上 | 对比 DOM 与会话数据 | recognized 字段不显示「已确认」；missing 字段值为空，前端不自行补全 | 逐字段：DOM 值 == 会话 `fields` 值（比较结果只输出通过数）；合成数据中 recognized 字段状态标签均非「已确认」 | 02.3 | R: pages/ResumeCollectionPage.review.test（does not show recognized as confirmed）；components/FinalReviewCard.test（never presents a recognized field as confirmed） | ✅ 引用单测通过 |
| TC-FE-003-IA-01 | 识别完成（真实样品） | 将姓名、手机号、邮箱、最高学历与真值比对 | 核心字段与真值一致（报告只写一致 / 不一致与长度） | 真值比对（11q 提供，真值不入库） | 02.1 | 待 11q：真实样品 + 真实 backend + DeepSeek | ⏸ 待 11q（本批不连真实模型；v1 2026-11-10 联调通过，脚本已退役） |
| TC-FE-003-RD-04 | 非核心字段全部为 missing | 查看 | 空非核心字段不阻止进入最终确认；仅姓名、手机号、邮箱为保存门槛 | 样品 11 个字段 missing；逐区确认后「确认提交」可点 | 02.4 | R: pages/ResumeCollectionPage.edit.test（guides the user to fill a missing core field）；hooks/model/FieldRules.test（core field validation） | ✅ 引用单测通过 |

---

## 四、分区校对与编辑

- 页面/组件：`SectionCard`（编辑态）、`FieldRow`、`StringListEditor`、`ObjectListEditor`、`FieldRules`、`QuickReplyChips`
- 消费接口：`PATCH /api/v1/sessions/{sid}/fields`
- 关联需求：REQ-FE-03

| TC | 前置 | 步骤与输入 | 预期 | 验证查询 | AC | 执行 | 结果 |
|---|---|---|---|---|---|---|---|
| TC-FE-004-IA-01 | 样品识别完成 | 观察第一个分区及其后续顺序 | 按固定顺序逐区核对，当前区展示该区全部字段；missing/uncertain 被突出 | DOM：分区顺序与 SectionConfig 顺序一致；missing 字段带「待补充」且有可见强调 | 03.1 | R: pages/ResumeCollectionPage.review.test（opens the first section that needs attention） | ✅ 引用单测通过 |
| TC-FE-004-AC-01 | 校对视图，基本信息区 | 点「确认本区」 | 发 `PATCH /api/v1/sessions/{sid}/fields`；`fields` 仅含该区键（name / phone / email / homepage） | 包装 fetch 记录请求体键集合（不记录值） | 03.2、06.1 | R: pages/ResumeCollectionPage.edit.test（sends only the fields of the active section）；api/SessionApi.test（updateSessionFields） | ✅ 引用单测通过 |
| TC-FE-004-IA-02 | PATCH 已发出 | 等待响应 | 以返回值更新：本区字段变「已确认」，其余字段状态不变 | 状态变化的字段集合 = 本区字段集合 | 03.2 | R: pages/ResumeCollectionPage.edit.test（moves on with the backend result） | ✅ 引用单测通过 |
| TC-FE-004-IA-03 | 求职意向区 | 将 `job_title` 改为原值加后缀「（自测）」后确认本区 | PATCH 带新值；界面显示新值 | 请求体 job_title 以后缀结尾（不记录值）；DOM 同 | 03.2 | R: pages/ResumeCollectionPage.edit.test（shows an edit as "未提交修改"…；sends only the fields of the active section） | ✅ 引用单测通过 |
| TC-FE-004-IA-04 | 项目经历区（4 条） | 删除第 4 条（「删除这一条」）→ 确认本区 | PATCH 带完整新列表（3 条）；界面 3 条 | PATCH body 中 `project_experiences` 长度 = 3；界面条数 = 3 | 03.3 | R: pages/ResumeCollectionPage.items.test（adds, edits and deletes items and submits the complete new list） | ✅ 引用单测通过 |
| TC-FE-004-IA-05 | 项目经历区 | 新增 1 条并填项目名称、修改另一条的字段 | 新增/修改均进入整体替换列表 | 条数、被修改字段值（脱敏仅比较长度变化） | 03.3 | R: pages/ResumeCollectionPage.items.test（adds, edits and deletes items and submits the complete new list）；components/ObjectListEditor.test | ✅ 引用单测通过 |
| TC-FE-004-IA-06 | 专业技能区（字符串列表） | 增加 1 项、删除 1 项 | 整体替换；空项按留空处理并提示「空项将按留空确认」 | PATCH body `skills` 为完整新数组；空项提示存在 | 03.3 | R: components/StringListEditor.test（adds an empty item；shows the placeholder hint for an empty list） | ✅ 引用单测通过 |
| TC-FE-004-ST-01 | 基本信息区 | 清空姓名 | 引导补充（核心必填），该区「确认本区」不可用 | 按钮 disabled / 出现必填提示；无 PATCH | 03.4 | R: pages/ResumeCollectionPage.edit.test（guides the user to fill a missing core field and blocks confirmation until it is valid） | ✅ 引用单测通过 |
| TC-FE-004-ST-02 | 基本信息区 | 手机号依次输入 `13800138000`、`+85212345678`、`138-0013 8000`、`138` | 前两者通过；第三者先去空格与连字符后通过且提交值已规范化；`138` 即时提示格式不正确 | DOM 提示；PATCH 中 phone 为规范化值（只验证长度=11 且无空格/连字符） | 03.5 | R: pages/ResumeCollectionPage.edit.test（submits the phone with spaces and hyphens removed (G-02)）；hooks/model/FieldRules.test（phone (G-02, OpenAPI phone.pattern)） | ✅ 引用单测通过 |
| TC-FE-004-ST-03 | 基本信息区 | 邮箱依次输入 `a@b.c`、`a@b`、`a b@c.d`、254/255 字符 | 前一者通过，其余格式不合法即时提示；255 字符超长 | DOM 提示；确认按钮禁用 | 03.5 | R: pages/ResumeCollectionPage.edit.test（flags a badly formatted phone or email right after the user leaves the field）；hooks/model/FieldRules.test（email (G-01)） | ✅ 引用单测通过 |
| TC-FE-004-ST-04 | backend 返回 422 `validation_failed` + `details` | mock | 在对应字段旁展示原因：required=必填、invalid_format=格式不正确、invalid_type=类型不符、too_long=内容过长；子项字段路径 `work_experiences[0].start_date` 定位到对应行 | 渲染断言；`unknown_field` 走通用错误 | 03.6 | R: pages/ResumeCollectionPage.edit.test（shows 422 details next to the field with the reason text）；pages/ResumeCollectionPage.items.test（shows backend 422 details at the item they point to） | ✅ 引用单测通过 |
| TC-FE-004-ST-05 | 会话已被删除（注入 404 `session_not_found`） | 点「确认本区」 | 提示「该会话已不存在」，回到空态并刷新会话列表 | DOM 含提示与欢迎页；列表重读 1 次 | 04.7、03.2 | R: pages/ResumeCollectionPage.edit.test（returns to the empty state with "该会话已不存在"…）；pages/ResumeCollectionPage.sessions.test（a session that no longer exists…） | ✅ 引用单测通过 |
| TC-FE-004-ST-06 | PATCH 在途（注入延迟 2 s） | 连续快速点两个分区的确认 | 同一时刻仅一个在途 PATCH，后者排队，不并发；界面不被较早响应覆盖 | 包装 fetch：PATCH 并发峰值 = 1 | 03.2（DD-07） | R: pages/ResumeCollectionPage.edit.test（allows at most one PATCH in flight and locks the section meanwhile） | ✅ 引用单测通过 |
| TC-FE-004-ST-07 | 任意文本字段 | 输入超出 `FIELD_MAX_LENGTH` 的值 / 列表超 maxItems | 就地提示内容过长，禁止提交 | 渲染断言（边界：恰好上限通过，上限+1 失败） | 03.5、06.5 | R: hooks/model/FieldRules.test（max length）；components/ObjectListEditor.test | ✅ 引用单测通过 |
| TC-FE-004-RD-01 | 任一文本字段 | 输入 `<img src=x onerror=alert(1)>` 并确认 | 作为纯文本显示，不执行、不生成 DOM 元素（XSS） | `document.querySelectorAll('img[src=x]').length === 0`；值按文本回显 | 03.2、06.1 | 缺口：字段值纯文本渲染无单测（ChatThread 的纯文本用例只覆盖对话，见 M-10） | ⚠ 缺口（M-10）；v1 2026-11-10 联调通过，v2 待 11q 复跑 |
| TC-FE-004-IA-07 | 键盘 | 用 Tab/Enter 完成「编辑→确认本区」 | 基础键盘可达 | 焦点序列可到达输入框与按钮；Enter 触发 | 03.1（TD-13） | R: pages/ResumeCollectionPage.a11y.test（keyboard reachability of the v2 controls） | ✅ 引用单测通过 |

---

## 五、最终确认与保存

- 页面/组件：`FinalReviewCard`、`SavedResultCard`、`SavedSessionView`、`NoticeBanner`、`ConfirmDialog`（「还有字段未确认」）
- 消费接口：`POST /api/v1/sessions/{sid}/resume`（PUT 更新见 §十二）
- 关联需求：REQ-FE-04

| TC | 前置 | 步骤与输入 | 预期 | 验证查询 | AC | 执行 | 结果 |
|---|---|---|---|---|---|---|---|
| TC-FE-005-ST-01 | 核心三项尚未全部确认 | 进入最终确认并尝试提交 | 「确认提交」不可点；提示「请先确认姓名、手机号、邮箱后再提交。」 | 按钮 disabled；文案存在；无 POST | 04.1 | R: pages/ResumeCollectionPage.final.test（keeps "确认提交" disabled with a reason while a core field is not confirmed）；components/FinalReviewCard.test | ✅ 引用单测通过 |
| TC-FE-005-IA-01 | 逐区确认完毕 | 观察最终确认卡 | 展示「请核对下面的全部内容；点击“确认提交”后才会保存。」，**此时不含「已保存」** | DOM 无「已保存」；`select count(*) from resumes` 不变 | 04.1、04.3 | R: pages/ResumeCollectionPage.final.test（F-03: "已保存" only after a confirmed save）；components/FinalReviewCard.test（shows the full result read-only） | ✅ 引用单测通过 |
| TC-FE-005-IA-02 | 仍有未确认字段（跳过某区，点「其余都没问题」） | 点「确认提交」 | 先弹「还有字段未确认」提示；继续即视为确认当前显示的全部内容 | DOM 含提示；继续后才发 POST | 04.2 | R: pages/ResumeCollectionPage.final.test（asks first when fields are unconfirmed; cancel sends nothing, continue sends once） | ✅ 引用单测通过 |
| TC-FE-005-IA-03 | POST 延迟 3 s（注入） | 点「确认提交」，等待期间检查 | **返回前不显示「已保存」或成功提示、无乐观更新**；按钮禁用 | 3 s 内每 0.5 s 采样 DOM：无「已保存」；返回后才出现 | 04.3、04.8 | R: pages/ResumeCollectionPage.final.test（F-03 保存中不显示已保存）；components/FinalReviewCard.test（locks both buttons while the request is in flight） | ✅ 引用单测通过；真实 4 s 延迟采样待 11q |
| TC-FE-005-AC-01 | 同上 | 双击 / 连点「确认提交」 | 只发 1 次 `POST /api/v1/sessions/{sid}/resume`，体为 `{confirmed: true}` | 包装 fetch：POST 计数 = 1；body 键集合 = `confirmed` | 04.8 | R: components/FinalReviewCard.test（locks both buttons while the request is in flight）；pages/ResumeCollectionPage.final.test（saves … once per click） | ✅ 引用单测通过 |
| TC-FE-005-IA-04 | 保存成功（POST 201） | 等待响应 | 显示「已保存」卡，仅含姓名、原始文件名、保存时间；会话转只读已保存视图 | DOM 不含合成数据的手机号、邮箱文本（包含检测，只输出 true / false） | 04.4 | R: pages/ResumeCollectionPage.final.test（saves once per click, then shows the saved card from the re-read session）；components/SavedResultCard.test（shows "已保存" with exactly the name, the original file name and the saved time）；components/SavedSessionView.test | ✅ 引用单测通过 |
| TC-FE-005-AC-02 | 保存成功后 | 只读查询 backend 数据与原始文件（sqlite3 -readonly，11q） | 归档记录新增 1 条；修改值已入库；原始文件 sha256 与样品一致；无草稿残留 | 按 backend v2 表结构在 11q 重写断言（前端无数据存储） | 04.4、08.4 | 待 11q：真实 backend 与数据库 | ⏸ 待 11q（v1 草稿表断言已删除，v2 待重写） |
| TC-FE-005-IA-05 | 已保存视图 | 点「上传下一份」 | 回到欢迎态，无旧内容，无确认框；可再次上传 | 含欢迎语；上传入口可用 | 04.4 | R: pages/ResumeCollectionPage.newchat.test（"上传下一份" on a saved session goes back to the empty view without a dialog）；components/SavedResultCard.test（offers "上传下一份" and calls the handler） | ✅ 引用单测通过 |
| TC-FE-005-IA-06 | 同一份简历（合成数据）已保存过，再次上传并确认提交 | 走到最终确认并提交 | 只读展示已有记录；显示「该简历已保存过」；不显示「已保存」「已更新」；不新增记录 | DOM 含该句，不含「已保存」「已更新」；POST 返回 already_saved 不计为新增（11q 查库） | 04.5、09.4 | R: pages/ResumeCollectionPage.final.test（already_saved=true answered with HTTP 201 shows "该简历已保存过"…）；components/SavedSessionView.test（saved/pending） | ✅ 引用单测通过 |
| TC-FE-005-ST-02 | POST 超时或网络失败（注入，服务端实际已保存） | 点「确认提交」 | 不提示成功；先 GET 会话重读，读到 status=saved 才显示「已保存」 | 包装 fetch：提交后 GET /sessions/{sid} 1 次；无其他结果查询 | 04.6 | R: pages/ResumeCollectionPage.final.test（the save took effect but the answer was lost: the re-read finds it saved；saved but the re-read failed） | ✅ 引用单测通过 |
| TC-FE-005-ST-03 | POST 超过 30 s（假定时器） | 点「确认提交」 | 同 005-ST-02：不提示成功，按重读结果渲染；超时文案「请求超时，请重试。」 | 渲染断言；请求计数 | 04.6 | R: pages/ResumeCollectionPage.final.test（F-03 重读用例，见追溯 04.6） | ✅ 引用单测通过 |
| TC-FE-005-ST-04 | 会话已被删除（注入 404 `session_not_found`） | 点「确认提交」 | 提示「该会话已不存在」，回到空态并刷新列表；不显示成功 | DOM 含提示；无「已保存」；列表重读 1 次 | 04.7 | R: pages/ResumeCollectionPage.edit.test（returns to the empty state with "该会话已不存在"…）；pages/ResumeCollectionPage.sessions.test（a session that no longer exists…） | ✅ 引用单测通过 |
| TC-FE-005-ST-05 | backend 返回 `save_failed` 500（mock） | 点「确认提交」 | 展示 `message`；会话仍为校对中，内容保留，可直接重试 | 渲染断言；会话状态仍为校对中 | 04.6 | R: pages/ResumeCollectionPage.final.test（save_failed: no success anywhere, the session stays in review and can be retried） | ✅ 引用单测通过 |
| TC-FE-005-ST-06 | backend 返回 `validation_failed` + details（模型值非法） | mock | 就地标字段并回到校对 | 渲染断言 | 04.1、03.6 | R: pages/ResumeCollectionPage.final.test（422 returns to the section of the field with the reason shown） | ✅ 引用单测通过 |
| TC-FE-005-ST-07 | backend 返回 `confirmation_required` | mock | 视为前端缺陷：通用错误文案带 request_id | 渲染断言 | 04.6 | R: hooks/model/SessionReducer.test（confirmation_required 分支） | ✅ 引用单测通过 |

---

## 六、新对话、会话切换、删除与未提交编辑拦截

- 页面/组件：`NewChatButton`、`SessionList`、`ConfirmDialog`、`AppShell`
- 关联需求：REQ-FE-05.3..05.6、REQ-FE-01.5（v2 上传不弹覆盖确认）、TD-12

| TC | 前置 | 步骤与输入 | 预期 | 验证查询 | AC | 执行 | 结果 |
|---|---|---|---|---|---|---|---|
| TC-FE-006-IA-01 | 校对中的会话 | 点「＋ 新对话」，确认「清空并开始」 | 界面回到欢迎态；会话仍在列表中，不被删除；无 DELETE 请求 | 包装 fetch：无 DELETE；列表条数不变 | 05.4、05.6 | R: pages/ResumeCollectionPage.newchat.test（without unsubmitted edits clears at once, calls nothing and keeps the session in the list）；hooks/model/SessionReducer.test（G. new chat clears the view without deleting） | ✅ 引用单测通过 |
| TC-FE-006-IA-02 | 校对中，有未提交编辑 | 点「＋ 新对话」，再点「取消」 | 关闭对话框；当前视图与编辑内容保留 | DOM 仍为校对视图；无请求 | 05.4 | R: pages/ResumeCollectionPage.newchat.test（with unsubmitted edits asks first: cancel keeps everything, continue clears） | ✅ 引用单测通过 |
| TC-FE-006-IA-03 | 空态（无未提交编辑） | 点「＋ 新对话」 | 直接回到欢迎态，无确认框，无请求 | 无 modal；无请求 | 05.4 | R: pages/ResumeCollectionPage.newchat.test（without unsubmitted edits clears at once…） | ✅ 引用单测通过 |
| TC-FE-006-IA-04 | 某字段已改但未点「确认本区」 | 切换到另一会话或点「＋ 新对话」 | 弹「有未提交的修改」；「返回」保留编辑内容；「继续」放弃修改 | DOM 含弹窗与文案；取消后输入值仍在 | 05.4 | R: pages/ResumeCollectionPage.sessions.test（with unsubmitted edits asks first: cancel keeps the view, continue opens the other session）；pages/ResumeCollectionPage.newchat.test（with unsubmitted edits asks first） | ✅ 引用单测通过 |
| TC-FE-006-IA-05 | 保存成功后（已保存视图） | 点「＋ 新对话」 | 无确认框，直接回到欢迎态 | 无 modal | 04.4 | R: pages/ResumeCollectionPage.newchat.test（"上传下一份" on a saved session goes back to the empty view without a dialog） | ✅ 引用单测通过 |
| TC-FE-006-IA-06 | 有 2 个以上会话 | 打开页面，查看会话列表 | 列表显示名称、状态（校对中 / 已保存）、最近活动；顺序与 backend 返回一致；页面打开不自动打开任何会话 | 列表条目与 `GET /sessions` 返回一致 | 05.1、05.2 | R: pages/ResumeCollectionPage.sessions.test（lists sessions with status words and does not open any of them） | ✅ 引用单测通过 |
| TC-FE-006-IA-07 | 一个校对中会话与一个已保存会话 | 依次在列表中选择两个会话 | 两者互不影响；已保存会话只读展示，无最终确认入口 | DOM：已保存会话无「确认提交」；校对中会话字段保留 | 05.3、04.10 | R: pages/ResumeCollectionPage.sessions.test（opens a reviewing and then a saved session without side effects on each other）；components/SavedSessionView.test（saved/none） | ✅ 引用单测通过 |
| TC-FE-006-IA-08 | 校对中会话（当前） | 在列表中点删除，确认 | 确认框说明信息与文件将删除；确认后当前视图回空态，会话移出列表 | 包装 fetch：DELETE 1 次；列表条数减 1 | 05.5 | R: pages/ResumeCollectionPage.sessions.test（reviewing: confirmation says information and file are deleted; deleting the current session returns to the empty view） | ✅ 引用单测通过 |
| TC-FE-006-IA-09 | 已保存会话 | 删除→取消；再删除→确认 | 确认框仅说明删除聊天记录；取消不发请求 | 取消：DELETE 0 次 | 05.5 | R: pages/ResumeCollectionPage.sessions.test（saved: confirmation says only the chat record is deleted; cancel sends nothing） | ✅ 引用单测通过 |
| TC-FE-006-IA-10 | 会话列表可用 | 分别执行上传、发送对话、确认保存、删除 | 每次动作成功后重读列表（`GET /sessions`） | GET /sessions 次数随动作增加 | 05.6 | R: pages/ResumeCollectionPage.sessions.test（upload still works）；pages/ResumeCollectionPage.chat.test（sends the text, shows both bubbles … and refreshes the list） | ✅ 引用单测通过 |
| TC-FE-006-IA-11 | 列表中的会话已被删除（注入 404） | 点击该会话 | 提示「该会话已不存在」，回空态，列表刷新 | DOM 含提示；列表重读 | 05.3、04.7 | R: pages/ResumeCollectionPage.sessions.test（a session that no longer exists returns to the empty view with a notice） | ✅ 引用单测通过 |

---

## 七、响应式、窄屏与无障碍

- 页面/组件：`AppShell`、`Layout.css`、`useNarrowScreen`、`useChatScroll`
- 关联需求：TD-13（窗口宽 ≥ 360px，< 860px 外壳折叠，≤ 599px 热区 ≥ 44px）；SUGGEST-1/2/3

指标采集：v1 的 `drill_resume.py` 指标函数已随任务 3.2 退役，11q 按同一指标在 Orca 浏览器采集（overflowX、offscreenControls、clippedInputs、buttonsUnder44、composerH），另增「<44px 按钮定位」：输出 `tagName/className/aria-label 长度/所在容器 class/宽高`，不输出文本内容。

| TC | 前置 | 步骤与输入 | 预期 | 验证查询 | AC | 执行 | 结果 |
|---|---|---|---|---|---|---|---|
| TC-FE-007-RS-01 | 校对视图 | 视口 360×640 | `documentElement.scrollWidth <= innerWidth`；越界控件 0；输入框被截断 0；侧栏折叠为顶栏，「新对话」在右上 | `metrics()` 输出 | TD-13 | 待 11q：Orca 浏览器，视口 360×640 校对页 | ⏸ 待 11q（v1 2026-11-10 通过；v2 布局变更需复跑） |
| TC-FE-007-RS-02 | 同上 | 视口 390×844 | 同上 | 同上 | TD-13 | 待 11q：Orca 浏览器，视口 390×844 | ⏸ 待 11q（v1 2026-11-10 通过；v2 需复跑） |
| TC-FE-007-RS-03 | 同上 | 视口 768×1024 | 不溢出、不截断；仍为折叠外壳（< 860） | 同上 | TD-13 | 待 11q：Orca 浏览器，视口 768×1024 | ⏸ 待 11q（v1 2026-11-10 通过；v2 需复跑） |
| TC-FE-007-RS-04 | 同上 | 视口 1440×900 | 左侧栏 + 主区，不溢出 | 同上 | TD-13 | 待 11q：Orca 浏览器，视口 1440×900 | ⏸ 待 11q（v1 2026-11-10 通过；v2 需复跑） |
| TC-FE-007-RS-05 | 全流程 | 在 360 / 390 / 768 / 1440 下各完成「识别后的校对页→确认本区→最终确认视图→确认提交按钮可见可点」的关键步骤 | 每个视口下关键控件在视口内可点；对话区独立滚动、输入区固定 | 元素 `getBoundingClientRect` 在视口内；`scrollTop` 变化发生在对话区而非 body | TD-13 | 待 11q：Orca 浏览器，360 宽全流程 | ⏸ 待 11q（v1 2026-11-10 通过；v2 需复跑） |
| TC-FE-007-RS-06 | 360 宽校对页 | 枚举所有可见 `button` 的尺寸 | 全部 ≥ 44×44；若仍有 <44px 的按钮，定位其所属组件（联调遗留：1/24） | 脚本输出 `tag/class/容器/宽高` 列表（无文本） | TD-13、SUGGEST-3 | 待 11q：Orca 浏览器，枚举可见 button 尺寸；SUGGEST-3 不处理 | ⏸ 待 11q（v1 已定位 antd 弹窗关闭按钮 32×32，列为已知限制） |
| TC-FE-007-RS-07 | 360×640 | 测输入区高度 | 不超过视口高度约 27% | `composerH / innerHeight` | TD-13、SUGGEST-3 | 待 11q：Orca 浏览器，输入区高度占比 | ⏸ 待 11q（v1 2026-11-10：169 px = 26.4%） |
| TC-FE-007-RS-08 | 临界宽度 | 依次设宽 859 / 860 与 599 / 600 | 859 折叠、860 展开；599 起热区 44px、600 恢复 | `getComputedStyle` 与布局类 | TD-13、05.2 | R: components/AppShell.responsive.test（below 860px the side bar folds away）；components/Layout.responsive.test（断点 859 / 860，599 / 600） | ✅ 引用单测通过 |
| TC-FE-007-RD-01 | 上传/保存/错误各一次 | 检查 aria | 加载、错误、保存结果使用 `aria-live` / `role=alert`；同一时刻仅 1 个 alert | DOM 查询 | TD-13 | R: pages/ResumeCollectionPage.a11y.test（announcements；focus management） | ✅ 引用单测通过 |
| TC-FE-007-RD-02 | 页面渲染异常（注入错误） | 触发 ErrorBoundary | 显示「页面出现异常，请刷新后重试。」，不泄露堆栈/内容 | 渲染断言 | 06.3 | R: components/ErrorBoundary.test（页面渲染异常提示） | ✅ 引用单测通过 |

---

## 八、api 封装与错误码映射

- 组件：`ApiClient`、`ApiError`、`SessionApi`、`ConversationApi`、`ResumeApi`、`ArchiveApi`、`ResponseShapes`
- 规则：统一解析为 `{code, message, request_id}` + 可选 `details`；界面只展示 backend `message`；前端本地码用固定文案（interface §2.3、§3）

接口调用（AC）

| TC | 前置 | 步骤与输入 | 预期 | 验证查询 | AC | 执行 | 结果 |
|---|---|---|---|---|---|---|---|
| TC-FE-008-AC-01 | 全流程（会话、对话、建议、保存、更新、归档） | 汇总接口请求 | 请求只命中契约 13 个操作之一；路径以 `/api/v1` 开头；方法与 OpenAPI 0.2.0 一致；无草稿接口 | 包装 fetch 请求集合 ⊆ 13 个操作 | 06.1、06.5 | R: api/SessionApi.test、api/ConversationApi.test、api/ResumeApi.test、api/ArchiveApi.test、types/ContractDrift.test | ✅ 引用单测通过 |
| TC-FE-008-AC-02 | 响应异常形状 | 200 但缺字段 | 报「上传结果异常，请刷新页面后核对。」类提示，不渲染半成品 | 渲染断言 | 06.4 | R: api/ResponseShapes.test（形状不符 → unknown_error，不进成功分支） | ✅ 引用单测通过 |

错误码映射（EM）——v0.3 §四 的 22 条映射（19 个 backend 业务码 + 3 个前端本地码，`unknown_error` 含形状校验失败）。v1 的 18 条（含 `draft_not_found` 三处）已删除，见变更清单。执行列：`R:` 为引用单测（文件级），`⚠ 缺口` 为仅契约清单、无界面断言。

| TC | 错误码（HTTP） | 来源接口 | 界面处理（v0.3 §四） | 执行 | 结果 |
|---|---|---|---|---|---|
| TC-FE-008-EM-01 | file_missing（400） | #1 上传 | 展示 message，可重新选择 | R: types/Contract.test（契约清单）；界面通用展示见 components/ErrorAlert.test | ⚠ 缺口（逐码界面断言，M-9） |
| TC-FE-008-EM-02 | file_empty（400） | #1 上传 | 前端预校验拦截（「文件内容为空」） | R: hooks/model/UploadPrecheck.test（rejects an empty file）；后端返回码仅契约清单 | ✅ 前端路径通过；后端码缺口（M-9） |
| TC-FE-008-EM-03 | file_content_mismatch（400） | #1 上传 | 展示 message，可重新选择 | 缺口：仅契约清单；真实返回待 11q（002-ST-08） | ⚠ 缺口（M-9） |
| TC-FE-008-EM-04 | file_too_large（413） | #1 上传 | 展示 message，可重新选择 | R: components/ErrorAlert.test；pages/ResumeCollectionPage.upload.test（blocks over 10 MB before any request） | ✅ 引用单测通过 |
| TC-FE-008-EM-05 | unsupported_file_type（415） | #1 上传 | 展示 message，可重新选择 | R: pages/ResumeCollectionPage.upload.test（blocks unsupported type before any request，前端）；后端码仅契约清单 | ✅ 前端路径；后端码缺口（M-9） |
| TC-FE-008-EM-06 | parse_failed（502） | #1 上传 | 展示 message，更换文件重传 | R: api/SessionApi.test；pages/ResumeCollectionPage.upload.test | ✅ 引用单测通过 |
| TC-FE-008-EM-07 | parse_unavailable（503） | #1 上传 | 展示 message，阻断，稍后重试 | 缺口：仅契约清单 | ⚠ 缺口（M-9） |
| TC-FE-008-EM-08 | parse_timeout（504） | #1 上传 | 展示 message，重新上传 | R: components/ErrorAlert.test | ✅ 引用单测通过 |
| TC-FE-008-EM-09 | session_not_found（404） | #3–#10 | 提示「该会话已不存在」，回空态并刷新列表；#4 删除时视为已删除（静默） | R: pages/ResumeCollectionPage.sessions.test；pages/ResumeCollectionPage.edit.test；hooks/useResumeSession.test（session_not_found returns to the empty view…） | ✅ 引用单测通过 |
| TC-FE-008-EM-10 | session_read_only（409） | #5–#9 | 展示 message，重读会话按 saved 只读渲染 | R: hooks/model/SessionReducer.test；pages/ResumeCollectionPage.final.test | ✅ 引用单测通过 |
| TC-FE-008-EM-11 | validation_failed（422，details） | #5 #6 #9 #10 | 按 details 就地展示；#6 定位到 content | R: pages/ResumeCollectionPage.edit.test（shows 422 details…）；pages/ResumeCollectionPage.items.test；pages/ResumeCollectionPage.final.test（422 returns to the section…） | ✅ 引用单测通过 |
| TC-FE-008-EM-12 | confirmation_required（422） | #9 #10 | 通用文案 + request_id（前端缺陷） | R: hooks/model/SessionReducer.test（confirmation_required 分支） | ✅ 引用单测通过 |
| TC-FE-008-EM-13 | chat_failed（502） | #6 | 展示 message，原文保留，可直接重发 | R: api/ConversationApi.test；pages/ResumeCollectionPage.chat.test（chat_failed keeps the text） | ✅ 引用单测通过 |
| TC-FE-008-EM-14 | suggestion_unavailable（409） | #7 #8 | 卡片内展示 message，重读会话 | R: pages/ResumeCollectionPage.suggest.test（suggestion_unavailable shows the message inside the card and refreshes it） | ✅ 引用单测通过 |
| TC-FE-008-EM-15 | update_not_available（409） | #10 | 展示 message，重读会话 | R: hooks/model/SessionReducer.test（reducer 分支）；页面层无用例 | ✅ reducer 分支通过；页面断言缺口（M-9） |
| TC-FE-008-EM-16 | resume_not_found（404） | #12 #13 | 「该简历不存在」，回列表重读 | 缺口：仅契约清单 | ⚠ 缺口（M-9） |
| TC-FE-008-EM-17 | file_not_available（404） | #13 | 页面内提示「原始文件暂不可用」 | R: pages/ArchivePage.test（disables the button with a hint when the file is not available）；api/ArchiveApi.test | ✅ 引用单测通过 |
| TC-FE-008-EM-18 | save_failed（500） | #9 #10 | #9 会话仍 reviewing 可重试；#10「已有简历未改变」可重试 | R: pages/ResumeCollectionPage.final.test（save_failed: no success anywhere…）；pages/ResumeCollectionPage.update.test（save_failed: no "已更新"…） | ✅ 引用单测通过 |
| TC-FE-008-EM-19 | internal_error（500） | 全部 | 通用文案，可重试；展示内容不变 | R: api/ApiClient.test；api/SessionApi.test | ✅ 引用单测通过 |
| TC-FE-008-EM-20 | client_timeout（本地） | #1、#6 为 75 s；其余 30 s | 固定文案「请求超时，请重试。」，按结果未知规则核对 | R: api/ApiClient.test；api/ConversationApi.test（maps chat_failed and times out after 75s） | ✅ 引用单测通过 |
| TC-FE-008-EM-21 | network_error（本地） | 全部 | 固定文案「网络异常，请检查网络后重试。」 | R: api/ApiClient.test；pages/ResumeCollectionPage.sessions.test | ✅ 引用单测通过 |
| TC-FE-008-EM-22 | unknown_error（本地，含形状校验失败） | 全部 | 通用文案；不进入成功分支 | R: api/ApiClient.test（非 JSON）；pages/ResumeCollectionPage.update.test（a 2xx answer of the wrong shape is not "已更新"） | ✅ 引用单测通过 |

---

## 九、浏览器侧安全静态

- 关联需求：REQ-FE-06；约束 F-01、F-02、F-03、B-03、B-06

| TC | 前置 | 步骤与输入 | 预期 | 验证查询 | AC | 执行 | 结果 |
|---|---|---|---|---|---|---|---|
| TC-FE-009-SC-01 | 完整流程结束后（合成数据） | 断言浏览器存储 API 未被调用 | Storage.prototype.setItem / getItem、indexedDB.open、document.cookie setter 调用次数均为 0 | spy 调用次数；真实浏览器存储为空待 11q | 06.2、06.1 | R: pages/ResumeCollectionPage.integration.test（F-02 spies）；test/EslintRules.test（still forbids browser storage everywhere） | ✅ 引用单测通过 |
| TC-FE-009-SC-02 | 对话、建议、保存、更新、下载及失败路径 | 对 console.* 与 document.title 打哨兵字符串 | 输出不含简历内容、对话原文、助手回复、建议值；错误只含 request_id、code、HTTP 状态 | 哨兵字符串计数 = 0 | 06.3 | R: pages/ResumeCollectionPage.chat.test（B-03）；pages/ResumeCollectionPage.integration.test（B-03 哨兵）；api/ApiClient.test（logs only request_id, code and status on failure） | ✅ 引用单测通过 |
| TC-FE-009-SC-03 | 完整流程（真实浏览器） | 枚举 performance resource 条目 | 请求仅为本站同源 | origin 与 location.origin 比较；单测侧 test/ViteConfig.test（代理仅转发 /api） | 06.1 | 待 11q：Orca 浏览器；单测侧 ViteConfig.test | ⏸ 待 11q（v1 2026-11-10 通过；v2 需复跑） |
| TC-FE-009-SC-04 | 源码 | 静态扫描非测试源码 | `fetch(` 仅出现在 `src/api/`；无 `localStorage`/`sessionStorage`/`indexedDB`/`document.cookie`；`console.*` 不含数据 | `grep -rn` 结果；`EslintRules.test.ts` 通过 | 06.1、06.2、06.3 | R: test/EslintRules.test（forbids window.fetch in components；allows fetch inside src/api）；S: 本批 grep，非测试源码中 localStorage / sessionStorage / indexedDB / document.cookie 无命中 | ✅ 引用单测通过 |
| TC-FE-009-SC-05 | 源码 | `npm run lint` | 0 warning | 退出码 0 且输出无 warning | 06.6 | S: 本批 `npm run lint`（`eslint . --max-warnings 0`） | ✅ 退出码 0，0 warning |
| TC-FE-009-SC-06 | 契约 | 对比类型与 OpenAPI 0.2.0 | 契约版本 0.2.0；13 个操作；19 个业务码；5 个 reason；上限常量一致 | types/Contract.test、types/ContractDrift.test 通过 | 06.5 | R: types/Contract.test（declares the contract version；has the 19 backend error codes）；types/ContractDrift.test | ✅ 引用单测通过 |
| TC-FE-009-SC-07 | 测试数据 | 扫描 `src/test/` 与 `scripts/` | 仅合成数据；无真实姓名/手机/邮箱；脚本不含个人信息 | 以 /tmp 真值中的核心值做 `git grep -F`（脚本内比对，输出命中数，应为 0） | 06.6 | S: 本批对 src 与 frontend-docs/HR_PR-1 做 11 位手机号、邮箱形态 grep：手机号命中 3 处、邮箱命中 3 处，均为示例占位（示例号段与 example.com / 占位域名，不列出原文） | ✅ 命中均为占位值（人工核对） |
| TC-FE-009-SC-08 | 构建产物 | `npm run build` 后扫描 `dist/` | 构建通过（含 tsc）；产物不含 `sk-`、`DEEPSEEK`、`api_key` 等凭证特征 | `grep -rEl "sk-[A-Za-z0-9]{10,}|DEEPSEEK|api[_-]?key" dist` 应无输出 | 06.1 | S: 本批 `npm run build`（tsc --noEmit + vite build）与 dist 扫描（sk-、DEEPSEEK、api_key） | ✅ tsc 退出 0；vite 转换 1458 模块；dist 无命中 |
| TC-FE-009-SC-09 | 全部 Vitest | `npm test` | 全部通过（基线 650） | 退出码与用例数 | 06.6 | S: 本批 `npm test`（Vitest 全量） | ✅ 68 个文件 / 618 个用例全部通过 |
| TC-FE-009-SC-10 | 本次产出物 | 提交前扫描 | 文档、脚本、报告不含样品个人信息；样品/真值/截图不入库 | 同 SC-07 + `git status` 无 /tmp 文件 | 06.6 | S: 同 SC-07；提交前复核 `git status`，无 /tmp 产物入库 | ✅ 提交前复核通过 |
| TC-FE-009-SC-11 | 源码（非测试） | 静态扫描：凭证字面量、绝对外部 URL、document.cookie 读写 | 三类模式均无命中；正控样例命中（测试本身有效） | test/CredentialAndEndpoint.test（5 条） | 06.1、06.2 | N: test/CredentialAndEndpoint.test.ts（本批新增，F-01，缺口补充） | ✅ 5/5 通过（本批新增） |

---

## 十、对话与修改建议（REQ-FE-07，v2 新增）

- 页面/组件：`ChatThread`、`MessageList`、`ComposerBar`、`ThinkingNotice`、`SuggestionCard`、`ChangeRows`
- 消费接口：`POST /api/v1/sessions/{sid}/messages`；`POST .../messages/{mid}/apply`、`.../cancel`；失败后先 `GET /api/v1/sessions/{sid}` 核对（TD-19）
- 关联需求：REQ-FE-07.1..07.7；F-02、F-03、B-03

| TC | 前置 | 步骤与输入 | 预期 | 验证查询 | AC | 执行 | 结果 |
|---|---|---|---|---|---|---|---|
| TC-FE-010-IA-01 | 已上传并校对中的会话 | 输入文本，按 Enter 发送 | 文本与回复各显示为一个气泡；输入框清空 | DOM 两个气泡；POST messages 1 次 | 07.1 | R: pages/ResumeCollectionPage.chat.test（sends the text, shows both bubbles）；components/ComposerBar.test（chat input (REQ-FE-07.1)） | ✅ 引用单测通过 |
| TC-FE-010-ST-01 | 未上传（空态）与已保存会话 | 查看输入区 | 输入区禁用并提示；不可发送 | 输入框 disabled | 07.1 | R: pages/ResumeCollectionPage.chat.test（is closed before an upload with a hint） | ✅ 引用单测通过 |
| TC-FE-010-ST-02 | 发送后等待回复（注入延迟） | 发送后再次发送，尝试上传、切换 | 显示「思考中」；第二次发送被忽略；上传、分区编辑、切换被禁用 | DOM 含「思考中」；POST messages 1 次 | 07.2 | R: pages/ResumeCollectionPage.chat.test（shows "思考中" while waiting and ignores a second send meanwhile）；pages/ResumeCollectionPage.a11y.test（"思考中" is announced politely…） | ✅ 引用单测通过 |
| TC-FE-010-ST-03 | chat_failed（注入） | 发送消息 | 显示通用错误；原文保留在输入框，可直接重发 | 输入框值 = 原文；未写入消息列表 | 07.3 | R: pages/ResumeCollectionPage.chat.test（chat_failed keeps the text） | ✅ 引用单测通过 |
| TC-FE-010-ST-04 | 超时或网络失败（注入），服务端已收到 / 未收到两种 | 发送后等待；重试前先重读 | 先 GET 会话核对：已到达则不重发并显示回复；未到达则允许重发 | 包装 fetch：重试前 GET /sessions/{sid} 1 次 | 07.3 | R: pages/ResumeCollectionPage.chat.test（the lost request had reached the server；the lost request never arrived）；hooks/model/Verify.test（matchSentMessage） | ✅ 引用单测通过 |
| TC-FE-010-AC-01 | 对话请求假定时器 | 推进 75 s | 结束等待，显示超时文案，原文保留 | 请求只发 1 次 | 07.3 | R: api/ConversationApi.test（maps chat_failed and times out after 75s） | ✅ 引用单测通过 |
| TC-FE-010-IA-02 | 模型返回一张建议卡片（合成） | 查看卡片；点「取消」 | 逐项展示字段名、原值、新值；可「应用」或「取消」 | DOM 三列文本；取消后卡片为已取消 | 07.4 | R: components/SuggestionCard.test（shows label, old and new value for a pending row）；pages/ResumeCollectionPage.suggest.test（cancel marks the card cancelled） | ✅ 引用单测通过 |
| TC-FE-010-IA-03 | 建议卡片待处理，分区有同字段未提交编辑 | 点「应用」 | 分区按 backend 返回更新；卡片显示「已应用」；同字段未提交编辑被清除 | apply 响应与界面一致 | 07.5 | R: pages/ResumeCollectionPage.suggest.test（apply replaces the fields, does not jump, drops the edit of that field）；hooks/model/SessionReducer.test（D. chat and suggestions） | ✅ 引用单测通过 |
| TC-FE-010-ST-05 | apply 返回 suggestion_unavailable（注入） | 点「应用」 | 卡片内显示 message；随后重读会话刷新卡片 | DOM 含 message；GET 1 次 | 07.6 | R: pages/ResumeCollectionPage.suggest.test（suggestion_unavailable shows the message inside the card and refreshes it） | ✅ 引用单测通过 |
| TC-FE-010-IA-04 | 用户文本含修改意图（如「把电话改成…」） | 发送 | 前端不解析意图，不改分区；仅展示回复与 backend 给出的建议 | 分区字段不变；无 PATCH | 07.6、04.9 | R: pages/ResumeCollectionPage.chat.test（F-03: chatting "确认提交" only shows the reply）；hooks/model/Verify.test（cardStatus summarises the four card states） | ✅ 引用单测通过 |
| TC-FE-010-IA-05 | 分区字段已改未确认，随后收到应用建议 | 对同字段应用建议 | 以建议结果为准；未提交编辑被替换 | 分区显示 backend 值 | 07.7 | R: pages/ResumeCollectionPage.suggest.test（drops the edit of that field）；pages/ResumeCollectionPage.edit.test（shows an edit as "未提交修改"…） | ✅ 引用单测通过 |

## 十一、已归档简历（REQ-FE-08，v2 新增）

- 页面/组件：`ArchivePage`、`ArchiveList`、`ArchiveDetail`、`ReadOnlySection`（showStatus=false）、`AppShell`（导航）
- 消费接口：`GET /api/v1/resumes`、`GET /api/v1/resumes/{rid}`、`GET /api/v1/resumes/{rid}/file`（blob）
- 关联需求：REQ-FE-08.1..08.4

| TC | 前置 | 步骤与输入 | 预期 | 验证查询 | AC | 执行 | 结果 |
|---|---|---|---|---|---|---|---|
| TC-FE-011-IA-01 | 对话页有校对中会话 | 切换到「已归档简历」，再切回对话页 | 两页保持挂载；切换后对话页状态不丢失 | DOM 保留会话内容 | 08.1 | R: App.test（switches views with the navigation；keeps both pages mounted） | ✅ 引用单测通过 |
| TC-FE-011-ST-01 | 进入归档页 | 切到归档页 | 只在打开时请求 `GET /resumes` 1 次 | fetch 计数 | 08.2 | R: App.test（the archive is only requested when it is opened） | ✅ 引用单测通过 |
| TC-FE-011-AC-01 | 归档有 1 条记录（合成） | 打开归档页 | 列表显示姓名、手机、邮箱、岗位、保存时间；不显示记录编号 | DOM 文本；无 resume_id | 08.2 | R: pages/ArchivePage.test（lists name, phone, email and job intention, never the record id）；api/ArchiveApi.test（lists and reads archived resumes） | ✅ 引用单测通过 |
| TC-FE-011-ST-02 | 归档无记录 | 打开归档页 | 显示「暂无记录」 | DOM 含该文案 | 08.2 | R: pages/ArchivePage.test（shows "暂无记录" when nothing is archived） | ✅ 引用单测通过 |
| TC-FE-011-ST-03 | 详情请求返回 resume_not_found（注入） | 点击列表条目 | 提示「该简历不存在」，回列表重读 | DOM 提示；列表重读 1 次 | 08.2 | 缺口：契约清单存在（types/Contract.test），无界面用例（M-9） | ⚠ 缺口（未新增，M-9） |
| TC-FE-011-IA-02 | 归档详情（合成，含空值） | 打开详情 | 分类只读展示，不显示状态标签；空值显示「未填写」；显示原始文件名与保存时间 | DOM 无状态标签；「未填写」计数 | 08.3 | R: pages/ArchivePage.test（opens the detail read-only with file name and saved time; empty values as "未填写"）；components/ReadOnlySection.test（showStatus=false hides status tags） | ✅ 引用单测通过 |
| TC-FE-011-AC-02 | 原始文件可用 | 点「下载原始文件」 | 经 api 取 blob；保存文件名为「原始简历」加扩展名，不含姓名；保存后释放 object URL | `URL.revokeObjectURL` 调用 1 次；下载名断言 | 08.4 | R: pages/ArchivePage.test（downloads with a generic file name and releases the object URL；no contact data in console or title）；api/ArchiveApi.test（downloads the file as a Blob and maps file_not_available） | ✅ 引用单测通过 |
| TC-FE-011-ST-04 | file_not_available（注入） | 查看下载按钮 | 按钮禁用，提示「原始文件暂不可用」 | 按钮 disabled | 08.4 | R: pages/ArchivePage.test（disables the button with a hint when the file is not available） | ✅ 引用单测通过 |

## 十二、已保存过后的确认更新（REQ-FE-09，v2.1 新增）

- 页面/组件：`QuickReplyChips`（saved 相）、`UpdateDiffCard`、`SavedSessionView`、`ChangeRows`
- 消费接口：`PUT /api/v1/sessions/{sid}/resume`（仅点击「确认更新」后发送，body 为 `{confirm_update: true}`）；失败或未知结果后 `GET /api/v1/sessions/{sid}` 核对（TD-19）
- 关联需求：REQ-FE-09.1..09.5；F-03（「已更新」时机）；差异必列清空字段（TD-23）

| TC | 前置 | 步骤与输入 | 预期 | 验证查询 | AC | 执行 | 结果 |
|---|---|---|---|---|---|---|---|
| TC-FE-012-IA-01 | 已保存会话，后续对话得到更新候选（合成） | 查看对话区快捷回复，点击「按本次内容更新」 | 出现快捷回复；无自由文本更新入口；点击后打开差异卡片且不发请求 | PUT 0 次 | 09.1 | R: pages/ResumeCollectionPage.update.test（opens from the quick reply without any request） | ✅ 引用单测通过 |
| TC-FE-012-IA-02 | 候选清空某已有字段（合成） | 打开差异卡片 | 逐字段列出差异；清空字段必列并标「将被清空」 | DOM 含「将被清空」；字段数与 UpdateDiff 输出一致 | 09.2 | R: hooks/model/UpdateDiff.test（always lists a field the candidate clears… red line）；pages/ResumeCollectionPage.update.test（lists the cleared field as "将被清空"） | ✅ 引用单测通过 |
| TC-FE-012-AC-01 | 仅文件名不同 | 打开差异卡片 | 显示原文件名与新文件名；相同字段只给数量 | DOM | 09.2 | R: hooks/model/UpdateDiff.test（reports a file-only difference） | ✅ 引用单测通过 |
| TC-FE-012-AC-02 | 差异卡片已打开 | 连续点两次「确认更新」 | 只发 1 次 PUT，请求体为 `{confirm_update: true}`；按钮锁定 | PUT 计数 = 1；body 键集合 | 09.3 | R: pages/ResumeCollectionPage.update.test（sends exactly {confirm_update: true} once per click）；api/ResumeApi.test（updateResume puts the constant body） | ✅ 引用单测通过 |
| TC-FE-012-ST-01 | 差异卡片已打开 | 点「取消」 | 关闭卡片；记录不变；无请求 | PUT 0 次；已保存内容不变 | 09.5 | R: pages/ResumeCollectionPage.update.test（cancel closes the card and keeps the record unchanged） | ✅ 引用单测通过 |
| TC-FE-012-ST-02 | PUT 返回 save_failed（注入） | 点「确认更新」 | 不显示「已更新」；提示已有简历未改变；卡片保留可重试 | DOM 无「已更新」 | 09.4 | R: pages/ResumeCollectionPage.update.test（save_failed: no "已更新", says the record is unchanged, the card stays for a retry） | ✅ 引用单测通过 |
| TC-FE-012-ST-03 | PUT 超时或网络失败（注入），服务端已更新 / 未更新两种 | 点「确认更新」，等待未知结果 | 先重读会话：update_state=applied 才显示「已更新」，否则提示未确认，不显示已更新 | GET 1 次后渲染 | 09.4 | R: pages/ResumeCollectionPage.update.test（unknown result (network), then 重新读取核对…）；hooks/model/Verify.test（update: applied / pending / other） | ✅ 引用单测通过 |
| TC-FE-012-ST-04 | PUT 返回 2xx 但形状不符（注入） | 点「确认更新」 | 不进入成功分支；显示通用错误；不显示「已更新」 | DOM | 09.4 | R: pages/ResumeCollectionPage.update.test（a 2xx answer of the wrong shape is not "已更新"）；api/ResumeApi.test（rejects a wrong 2xx shape） | ✅ 引用单测通过 |
| TC-FE-012-IA-03 | 重新打开 update_state=applied 的会话 | 打开会话 | 只显示静态一行「已按本次内容更新」；不显示「已更新」结果卡 | DOM | 09.4 | R: components/SavedSessionView.test（saved/applied: a static "已按本次内容更新" line, no "已更新" result (TD-24)） | ✅ 引用单测通过 |

## 覆盖追溯矩阵

### 验收标准覆盖（v2，54 条）

| AC | 验收标准（摘要） | 覆盖用例 | 状态 |
|---|---|---|---|
| 01.1 | 只允许选择单个 PDF/JPG/JPEG/PNG | 002-RD-01, 002-ST-05, 002-ST-06 | ✅ 引用单测通过 |
| 01.2 | 类型 / 大小上传前拦截，backend 为准 | 002-ST-01, 002-ST-02, 002-ST-03, 002-ST-04, 002-ST-07 | ✅ 引用单测通过（另有待 11q 项） |
| 01.3 | 单一加载提示并禁止重复提交 | 002-IA-01, 002-IA-02 | ✅ 引用单测通过 |
| 01.4 | 上传 75 秒超时提示重新上传 | 002-ST-09 | ✅ 引用单测通过 |
| 01.5 | 上传即新建会话，不弹覆盖确认 | 002-IA-01, 002-AC-01, 002-IA-03 | ✅ 引用单测通过 |
| 01.6 | 上传错误只展示 message，不记文件名 | 002-ST-04, 002-ST-07, 002-ST-08, 002-ST-11 | ✅ 引用单测通过（另有待 11q 项） |
| 02.1 | 按全部分类展示（经历多条） | 001-RD-02, 002-IA-01, 003-RD-01, 003-IA-01 | ✅ 引用单测通过（另有待 11q 项） |
| 02.2 | 四种字段状态文案 | 003-RD-02 | ✅ 引用单测通过 |
| 02.3 | 不把 recognized 当已确认 | 003-RD-03 | ✅ 引用单测通过 |
| 02.4 | 非核心字段可空，仅三项为保存门槛 | 003-RD-04 | ✅ 引用单测通过 |
| 03.1 | 分区整区核对，突出 missing / uncertain | 004-IA-01, 004-IA-07 | ✅ 引用单测通过 |
| 03.2 | 结构化字段编辑提交，以 backend 返回更新界面 | 004-AC-01, 004-IA-02, 004-IA-03, 004-ST-05, 004-ST-06, 004-RD-01 | ✅ 引用单测通过 |
| 03.3 | 多条子项新增 / 修改 / 删除 | 004-IA-04, 004-IA-05, 004-IA-06 | ✅ 引用单测通过 |
| 03.4 | 核心三项缺失引导补充 | 004-ST-01 | ✅ 引用单测通过 |
| 03.5 | 手机号 / 邮箱即时格式提示 | 004-ST-02, 004-ST-03, 004-ST-07 | ✅ 引用单测通过 |
| 03.6 | details 字段级错误在字段旁展示 | 004-ST-04, 005-ST-06 | ✅ 引用单测通过 |
| 04.1 | 独立"最终确认"，核心三项就绪才可点 | 005-ST-01, 005-IA-01, 005-ST-06 | ✅ 引用单测通过 |
| 04.2 | 有未确认字段先提示，继续即确认当前全部 | 005-IA-02 | ✅ 引用单测通过 |
| 04.3 | 成功前不显示"已保存"，无乐观更新（F-03） | 001-IA-02, 005-IA-01, 005-IA-03 | ✅ 引用单测通过 |
| 04.4 | 成功显示"已保存"，会话转只读已保存视图 | 005-IA-04, 005-AC-02, 005-IA-05, 006-IA-05 | ✅ 引用单测通过（另有待 11q 项） |
| 04.5 | already_saved：显示"该简历已保存过"，只读展示已有记录，提供"按本次内容更新" | 005-IA-06 | ✅ 引用单测通过 |
| 04.6 | 超时 / 网络失败 / 409 后先重读会话再按状态渲染（F-03） | 005-ST-02, 005-ST-03, 005-ST-05, 005-ST-07 | ✅ 引用单测通过 |
| 04.7 | 会话不存在提示并回空态、刷新列表 | 004-ST-05, 005-ST-04, 006-IA-11 | ✅ 引用单测通过 |
| 04.8 | 确认请求期间防重复点击 | 005-IA-03, 005-AC-01 | ✅ 引用单测通过 |
| 04.9 | 对话"确认提交"只回复文本，不触发保存 | 010-IA-04 | ✅ 引用单测通过 |
| 04.10 | 已保存会话不显示最终确认入口；被拒时只展示 message | 006-IA-07 | ✅ 引用单测通过 |
| 05.1 | 页面打开读列表并显示空态，不自动打开会话；前端不读 Cookie | 001-AC-01, 001-ST-01, 001-IA-01, 006-IA-06 | ✅ 引用单测通过 |
| 05.2 | 列表展示名称 / 状态 / 最近活动，顺序以 backend 为准；窄屏可达 | 001-ST-02, 001-ST-03, 006-IA-06, 007-RS-08 | ✅ 引用单测通过 |
| 05.3 | 选择会话：校对中可继续；已保存只读展示 | 001-IA-01, 001-IA-02, 001-ST-04, 006-IA-07, 006-IA-11 | ✅ 引用单测通过 |
| 05.4 | 切换 / 新建对话且有未提交编辑先提示 | 006-IA-01, 006-IA-02, 006-IA-03, 006-IA-04 | ✅ 引用单测通过 |
| 05.5 | 删除二次确认，成功移除；删除当前会话回空态 | 006-IA-08, 006-IA-09 | ✅ 引用单测通过 |
| 05.6 | 上传 / 对话 / 应用 / 保存 / 更新 / 删除后重读列表 | 006-IA-01, 006-IA-10 | ✅ 引用单测通过 |
| 06.1 | 仅经 api 封装调用，无凭证，不直连 | 001-AC-01, 002-AC-01, 004-AC-01, 004-RD-01, 008-AC-01, 009-SC-01, 009-SC-03, 009-SC-04, 009-SC-08, 009-SC-11 | ✅ 引用单测通过（另有待 11q 项） |
| 06.2 | 不用浏览器存储；文本框关闭自动填充；blob 用后回收 | 009-SC-01, 009-SC-04, 009-SC-11 | ✅ 引用单测通过 |
| 06.3 | 日志不输出内容；标题、URL、下载名不含姓名；通用文件名 | 007-RD-02, 009-SC-02, 009-SC-04 | ✅ 引用单测通过 |
| 06.4 | 错误统一解析 `{code, message, request_id}` + details | 001-ST-04, 008-AC-02 | ✅ 引用单测通过 |
| 06.5 | types 与 api 与冻结 OpenAPI 0.2.0 对齐 | 004-ST-07, 008-AC-01, 009-SC-06 | ✅ 引用单测通过 |
| 06.6 | Vitest + RTL + ESLint，合成数据 | 009-SC-05, 009-SC-07, 009-SC-09, 009-SC-10 | ✅ 引用单测通过 |
| 07.1 | 校对中提供文本输入与发送（Enter / Shift+Enter、IME、≤2000）；未上传 / 已保存禁用 | 010-IA-01, 010-ST-01 | ✅ 引用单测通过 |
| 07.2 | 发送中"思考中"，禁用上传 / 分区编辑 / 切换 / 再发 | 010-ST-02 | ✅ 引用单测通过 |
| 07.3 | 对话 75s；失败保留原文可重试；重试前先重读核对 | 010-ST-03, 010-ST-04, 010-AC-01 | ✅ 引用单测通过 |
| 07.4 | 建议卡片逐项展示字段 / 原值 / 新值；应用 / 取消；不可应用显示原因 | 010-IA-02 | ✅ 引用单测通过 |
| 07.5 | 应用后按 backend 结果更新分区，卡片显示"已应用"，清除同字段未提交编辑 | 010-IA-03 | ✅ 引用单测通过 |
| 07.6 | 不解析用户文本意图；建议状态以 backend 为准 | 010-ST-05, 010-IA-04 | ✅ 引用单测通过 |
| 07.7 | 分区就地编辑保留，与对话修改作用于同一份信息 | 010-IA-05 | ✅ 引用单测通过 |
| 08.1 | 对话 / 已归档简历切换，不引入路由库，切换不丢状态 | 011-IA-01 | ✅ 引用单测通过 |
| 08.2 | 进入归档页重读列表；展示姓名 / 手机 / 邮箱 / 岗位 / 保存时间；暂无记录 | 011-ST-01, 011-AC-01, 011-ST-02, 011-ST-03 | ✅ 引用单测通过 |
| 08.3 | 详情按分类只读（不显示状态，"未填写"）+ 文件名、保存时间 | 011-IA-02 | ✅ 引用单测通过 |
| 08.4 | 经 api 层取二进制并下载；不可用时页面内提示 | 005-AC-02, 011-AC-02, 011-ST-04 | ✅ 引用单测通过（另有待 11q 项） |
| 09.1 | 存在更新候选时对话流提供快捷回复"按本次内容更新"；不开放自由文本 | 012-IA-01 | ✅ 引用单测通过 |
| 09.2 | 逐字段比较并展示差异卡片（"将清空"必列、文件新旧名、相同字段只给数量） | 012-IA-02, 012-AC-01 | ✅ 引用单测通过 |
| 09.3 | 卡片提供"确认更新 / 取消"，只有点击才发请求，防重复点击 | 012-AC-02 | ✅ 引用单测通过 |
| 09.4 | 仅 PUT 2xx 且形状通过，或核对读到 applied 才显示"已更新"；失败保留卡片；未知结果引导核对（F-03） | 005-IA-06, 012-ST-02, 012-ST-03, 012-ST-04, 012-IA-03 | ✅ 引用单测通过 |
| 09.5 | 取消则关闭卡片，已有内容不变 | 012-ST-01 | ✅ 引用单测通过 |

AC 覆盖：54/54 条至少有一条 R / N / S 通过的用例；0 条仅有待 11q 用例；0 条无用例。

### 接口消费覆盖（13 个操作）

| # | 操作 | 覆盖用例 | 状态 |
|---|---|---|---|
| 1 | `POST /sessions` | 002-AC-01、002-IA-01、002-IA-03 | ✅ 引用单测 |
| 2 | `GET /sessions` | 001-AC-01、006-IA-06 | ✅ 引用单测 |
| 3 | `GET /sessions/{sid}` | 001-IA-01、005-ST-02、010-ST-04 | ✅ 引用单测 |
| 4 | `DELETE /sessions/{sid}` | 006-IA-08、006-IA-09 | ✅ 引用单测 |
| 5 | `PATCH /sessions/{sid}/fields` | 004-AC-01、004-IA-02、004-IA-03 | ✅ 引用单测 |
| 6 | `POST /sessions/{sid}/messages` | 010-IA-01、010-ST-03、010-ST-04 | ✅ 引用单测 |
| 7 | `POST …/messages/{mid}/apply` | 010-IA-03、010-ST-05 | ✅ 引用单测 |
| 8 | `POST …/messages/{mid}/cancel` | 010-IA-02 | ✅ 引用单测 |
| 9 | `POST /sessions/{sid}/resume` | 005-IA-03、005-AC-01、005-ST-05 | ✅ 引用单测 |
| 10 | `PUT /sessions/{sid}/resume` | 012-AC-02、012-ST-03 | ✅ 引用单测 |
| 11 | `GET /resumes` | 011-AC-01、011-ST-01 | ✅ 引用单测 |
| 12 | `GET /resumes/{rid}` | 011-AC-01、011-IA-02 | ✅ 引用单测 |
| 13 | `GET /resumes/{rid}/file` | 011-AC-02、011-ST-04 | ✅ 引用单测 |

### 错误码覆盖（v0.3 §四，22 条）

界面处理或 reducer 断言覆盖 18/22（EM-02、EM-05 仅前端预校验路径，EM-15 仅 reducer 分支）；其余 4 条仅契约清单（M-9）。

### 界面状态覆盖（附加追溯维度）

| 界面状态 | 覆盖用例 | 状态 |
|---|---|---|
| 启动空态（欢迎页） | 001-ST-01 | ✅ |
| 会话列表加载错误（可重试，主区可用） | 001-ST-02、001-ST-03 | ✅ |
| 上传加载态（单一提示） | 002-IA-02 | ✅ |
| 上传前拦截与上传错误（message 展示） | 002-ST-01..04、002-ST-11 | ✅ |
| 校对态（四种字段状态） | 003-RD-02、004-IA-01 | ✅ |
| 编辑态与字段级错误 | 004-ST-01..04 | ✅ |
| 会话已不存在（回空态并刷新） | 004-ST-05、005-ST-04、006-IA-11 | ✅ |
| 最终确认态与已保存 / 已保存过 | 005-IA-01..06 | ✅ |
| 确认框（未确认字段、未提交编辑、删除、将被清空） | 005-IA-02、006-IA-04、006-IA-08、006-IA-09、012-IA-02 | ✅ |
| 对话思考中 | 010-ST-02 | ✅ |
| 建议卡片（待处理 / 已取消 / 不可应用） | 010-IA-02、010-ST-05 | ✅ |
| 差异卡片与已按本次内容更新 | 012-IA-01、012-IA-03 | ✅ |
| 归档空态与详情只读 | 011-ST-02、011-IA-02 | ✅ |
| 窄屏（360 / 390 / 768 / 桌面） | 007-RS-01..07（待 11q）；007-RS-08（引用单测） | ⏸ 待 11q |
| 异常边界（ErrorBoundary） | 007-RD-02 | ✅ |

### 主要交互路径覆盖

| 交互路径 | 覆盖用例 | 状态 |
|---|---|---|
| 上传 → 逐区校对 → 修改字段 → 最终确认 → 已保存 | 002-IA-01、004-IA-01..03、005-IA-01..04 | ✅ 引用单测（窄屏布局待 11q） |
| 刷新后选择会话继续 | 001-IA-01、001-IA-02 | ✅ 引用单测（窄屏布局待 11q） |
| 对话 → 建议 → 应用 / 取消 | 010-IA-01..03、010-IA-02 | ✅ 引用单测（窄屏布局待 11q） |
| 重复保存（已保存过） | 005-IA-06 | ✅ 引用单测（窄屏布局待 11q） |
| 更新确认（快捷回复 → 差异 → 确认 / 取消） | 012-IA-01、012-AC-02、012-ST-01 | ✅ 引用单测（窄屏布局待 11q） |
| 归档列表 → 详情 → 下载 | 011-AC-01、011-IA-02、011-AC-02 | ✅ 引用单测（窄屏布局待 11q） |
| 会话切换、删除、新对话、未提交编辑拦截 | 006-IA-01..09 | ✅ 引用单测（窄屏布局待 11q） |

## 覆盖率统计

| 维度 | 总数 | 已覆盖 | 覆盖率 |
|------|------|--------|--------|
| 验收标准（AC，REQ-FE-01..09） | 54 | 54 | 100%（54/54 有通过的用例） |
| 被测分区（REQ-FE-01..09） | 9 | 9 | 100% |
| 消费接口操作 | 13 | 13 | 100% |
| 错误码（v0.3 §四） | 22 | 18 | 81%（其余见 M-9） |
| 红线 F-01 | 静态断言 | SC-04、SC-11 | 100%（真实浏览器存储 / 网络记录待 11q） |
| 红线 F-02 | — | 确定性测试 | 100%（SC-01、SC-04、page.integration） |
| 红线 F-03 | — | 确定性测试 | 100%（005-IA-01..06、012-ST-02..04、010-ST-04） |
| 红线 B-03 | — | 哨兵断言 | 100%（SC-02、010 与 page.integration） |

## PRD 与设计文档比对：遗漏 / 无法覆盖的场景

| # | 场景 | 处理 |
|---|------|------|
| M-1 | 75 秒真实上传超时 | 无法在不改 backend 下制造；假定时器单测覆盖（002-ST-09） |
| M-2 | `parse_failed / parse_unavailable / parse_timeout` 的真实触发 | 需要 backend 模型侧故障；前端 message 展示有单测；真实触发留给 backend 侧 |
| M-3 | 其他浏览器（Chrome / Edge / Safari / Firefox 最近两版） | 仅 Orca 内置浏览器（待 11q）；兼容范围声明（TD-13）未逐个验证 |
| M-4 | PRD「跨日重开」 | v2 会话由 backend 保存，列表重读覆盖（05.1）；保存期限以 backend 为准，前端用例不断言 |
| M-5 | 屏幕阅读器专项 | 明确不做（Q-DL-05） |
| M-6 | PDF 简历的真实识别 | 真实样品为 PNG；PDF 路径由 v1 合成样本验证，待 11q 复跑 |
| M-7 | 识别质量（Q-1..Q-4） | backend / 模型范畴，仅在 003-IA-01 观察，不作前端通过判据 |
| M-8 | 并发多标签页同一 Cookie | 未设计；POC 单用户，标记为已知缺口 |
| M-9 | 逐码界面断言缺口：`file_missing`、`file_content_mismatch`、`parse_unavailable`、`resume_not_found`（仅契约清单）；`unsupported_file_type` 与 `file_empty` 的后端返回；`update_not_available` 页面层；大写扩展名（002-ST-05） | 未新增：不属于 AC 或红线；ErrorAlert 与 ApiClient 对任意码统一展示 message，已有通用覆盖。待 DL 决定是否补 |
| M-10 | 字段值纯文本渲染（004-RD-01，`<img onerror>` 类输入） | 无单测（ChatThread 纯文本用例只覆盖对话）。v1 联调通过；未新增，待 DL 决定，或 11q 复跑 |
| M-11 | 第 3 批审查遗留 frontend SUGGEST S-1..S-5 | 不处理，列为已知限制（见用例执行汇总） |

## 用例执行汇总

执行日期 2026-11-11。环境：本地 Vitest（jsdom）+ React Testing Library；合成数据；未启动 backend，未连真实 DeepSeek，未使用 Orca 浏览器（见「待 11q」）。

| 结果分类 | 数量 | 说明 |
|---|---|---|
| 引用单测通过（R） | 117 | 映射到已有 Vitest 用例，本批全量执行通过 |
| 新增单测通过（N） | 1 | 本批新增，F-01 凭证与外部端点静态断言 |
| 静态与构建实测（S） | 5 | 本批运行：lint、test、build、dist 扫描、源码 grep |
| 待 11q | 13 | 真实 backend、真实模型或真实浏览器；v1 历史结果保留并注明 |
| 缺口（未新增） | 7 | 不属于 AC 或红线，列入 M-9 / M-10，待 DL 决定 |
| 合计 | 143 | 失败 0 |

门禁（本批实测，提交前运行）：
- `npm run lint`：退出码 0（`eslint . --max-warnings 0`）。
- `npm test`：68 个文件、618 个用例全部通过（v2 基线 613 + 本批 F-01 5 条）。
- `npm run build`：`tsc --noEmit` 退出码 0；vite 转换 1458 模块；产物 `index-*.js` 921.92 kB（超过 500 kB 的分包提示未处理）。本批未执行 `npm ci`，沿用已安装依赖。

### 发现

| 编号 | 级别 | 说明 | 处理 |
|---|---|---|---|
| F-1 | 已知限制 | 360 宽下 `.ant-modal-close` 为 32×32，未达 44 px（v1 RS-06） | 未修；SUGGEST，待 DL 决定 |
| F-2 | 已修（本批） | 首次写的 F-01 测试使用 `node:fs`，`tsc` 报 Node 类型缺失，`npm run build` 失败；改为 `import.meta.glob` 读取源码后构建与测试通过 | 已修（测试文件，未改业务代码） |
| F-3 | 文档 | `traceability_v2.md` 13 处用例名与源码字符串不一致（与第 3 批 S-2 相同内容），本批按源码原文修正，便于本文件引用可查 | 已修（文档；未改业务代码） |

### 已知限制（第 3 批审查遗留 SUGGEST，本批不处理）

- S-1：集成用例只监听 `document.cookie` 的 setter，未监听 getter。本批 SC-11 静态扫描覆盖源码中的 `document.cookie` 读写，但不覆盖运行时读取。
- S-3：`saveBlob` 在 `link.click()` 后同步调用 `URL.revokeObjectURL`，真实浏览器中是否影响下载未验证（待 11q）。
- S-4：`UPDATE_SUCCEEDED` 在重读失败时保留旧的 pending 候选，「按本次内容更新」快捷回复仍可见。
- S-5：design §3.4 把 `ChatThread` 列为「不变」，但代码已有焦点键去除 `#` 后缀的改动（文档待同步）。

### 待 11q 联合执行清单

- 003-IA-01、005-AC-02：真实样品与真值比对；数据库与原始文件校验。
- 002-ST-04、002-ST-07、002-ST-08、002-ST-11（真实停服）：真实 backend 返回与布局。
- 005-IA-03（4 s 延迟采样）、007-RS-01..07（窄屏布局与按钮尺寸）、009-SC-03（真实同源资源）。
- 全部 `⏸ 待 11q` 行：Orca 浏览器或真实 backend 复跑；v1 历史结果不得直接沿用为 v2 结论。

## 变更清单（v2）

| 动作 | 用例 ID | 原因（驱动） |
|---|---|---|
| 删除 | TC-FE-001-RD-01、TC-FE-002-IA-04、TC-FE-002-IA-05、TC-FE-002-ST-10 | v2 启动不读草稿，无草稿加载态；上传不弹覆盖确认（01.5） |
| 删除并替换 | TC-FE-008-EM-01..18 → TC-FE-008-EM-01..22 | OpenAPI 0.2.0 与接口规范 v0.3 §四：`draft_not_found` 删除，会话码与对话码新增 |
| 改写（行为 / 接口路径变更） | 001-AC-01, 001-ST-01, 001-IA-01, 001-IA-02, 001-ST-02, 001-ST-03, 001-RD-02, 002-IA-01, 002-AC-01, 002-IA-02, 002-ST-04, 002-ST-08, 002-ST-09, 002-IA-03, 002-ST-11, 003-RD-01, 003-RD-02, 003-RD-03, 003-IA-01, 004-AC-01, 004-IA-02, 004-IA-03, 004-IA-04, 004-ST-05, 005-AC-01, 005-IA-04, 005-AC-02, 005-IA-05, 005-IA-06, 005-ST-02, 005-ST-03, 005-ST-04, 005-ST-05, 006-IA-01, 006-IA-02, 006-IA-03, 006-IA-04, 006-IA-05, 008-AC-01, 009-SC-01, 009-SC-02, 009-SC-03, 009-SC-06 | 草稿接口改为会话接口；会话列表与删除；上传即新建会话；保存与已保存过语义（REQ-FE-03..05、08） |
| 改写执行 / 结果（历史 E 结果不沿用） | 001-ST-04, 002-RD-01, 002-ST-01, 002-ST-02, 002-ST-03, 002-ST-05, 002-ST-06, 002-ST-07, 003-RD-04, 004-IA-01, 004-IA-05, 004-IA-06, 004-ST-01, 004-ST-02, 004-ST-03, 004-ST-04, 004-ST-06, 004-ST-07, 004-RD-01, 004-IA-07, 005-ST-01, 005-IA-01, 005-IA-02, 005-IA-03, 005-ST-06, 005-ST-07, 007-RS-01, 007-RS-02, 007-RS-03, 007-RS-04, 007-RS-05, 007-RS-06, 007-RS-07, 007-RS-08, 007-RD-01, 007-RD-02, 008-AC-02, 009-SC-04, 009-SC-05, 009-SC-07, 009-SC-08, 009-SC-09, 009-SC-10 | 执行列改为 R（引用单测）或待 11q；结果保留 v1 结论时注明 |
| 新增 | 006-IA-06..11、010-IA-01..05、010-ST-01..05、010-AC-01、011-IA-01、011-ST-01..04、011-AC-01..02、012-IA-01..03、012-AC-01..02、012-ST-01..04、009-SC-11 | REQ-FE-05、07、08、09 的 v2 覆盖；009-SC-11 为 F-01 凭证断言（红线缺口） |
| 未改 | 其余 K 行的步骤与预期 | 与 v2 行为一致，仅更新执行 / 结果列 |

以上为本文件 v2 增量的全部变更；v1 的逐条执行记录见 git 历史（v1.1）。

