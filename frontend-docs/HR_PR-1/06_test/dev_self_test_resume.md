# 开发自测用例 — 简历信息收集（frontend Workbench）

> **模式：开发自测（白盒）**
> 两层验证：① 契约 mock 层——已有 Vitest 用例（`U:` 标注文件）断言请求构造与渲染；② 真实联调层——Orca 浏览器对真实 backend 走完整流程（`E:` 标注），用 DOM / 网络 / 存储 / console 断言，必要时只读 SQLite。前端无数据存储，不写存储查询（浏览器存储仅做"为空"检查）。
> 个人信息规则：样品 `{变量:sampleFile}` 与真值 `{变量:truthFile}` 只放 /tmp，不入库；本文与执行记录中个人信息值一律脱敏，只写长度、条数、通过与否。

## 文档版本

| 版本 | 日期 | 修改说明 | 作者 |
|------|------|----------|------|
| v1.0 | 2026-11-10 | 初始版本：用例设计 | Yin Yang |
| v1.1 | 2026-11-10 | 回填主流程联调与静态检查结果；31 条未执行 | Yin Yang |

## 文档信息

| 项目 | 内容 |
|------|------|
| 需求文档 | `frontend-docs/HR_PR-1/01_requirements/requirements.md`（v1.2，REQ-FE-01..06） |
| PRD | `01-requirements/HR_PR-1/prd.md` |
| Workbench 设计文档 | `frontend-docs/HR_PR-1/03_api/interface_spec_resume.md`（v0.2，契约 OpenAPI 0.1.1）；`04_design/design.md`（v1.1）；`05_task/tasks.md`（15/15 已实现）；原型评审 `01-requirements/HR_PR-1/prototype-review.md` |
| 测试范围 | 9 个被测单元（见下）；不含 backend 内部、模型识别质量（backend 范畴，仅作联调观察） |
| 测试环境 | dev：backend 127.0.0.1:8000（独立临时 DATA_DIR/FILE_DIR，真实 DeepSeek，已获 DL 批准），Vite dev 127.0.0.1:5173，Orca 内置浏览器 |
| 前置阻塞 | backend worker 同时自测占用 8000 端口；**服务启动须待协调者放行**，放行前本文件只含设计，结果列均为「待执行」 |

## 数据源说明

| 数据源类型 | 说明 |
|-----------|------|
| 消费接口清单 | `POST /api/v1/resume-drafts`、`GET/PATCH /api/v1/resume-drafts/current`、`POST /api/v1/resumes`（共 4 个，interface_spec §一） |
| 组件本地状态 | useReducer 会话状态（SessionReducer）；不在浏览器持久化（F-02） |
| 真实样品 | `/tmp/hr_sample/sample.png`（DL 本人中文简历，PNG）；真值 `/tmp/hr_sample/truth.md`（执行时转为 /tmp 下 truth.json，由 drill 脚本比对） |
| 合成数据 | 格式/大小/内容不符等错误文件由脚本在临时目录即时生成（txt、0 字节、10 MB±1、伪 PDF），不含任何个人信息 |
| 数据库（只读） | `{变量:dataDir}/resumes.db`、`drafts.db`（`sqlite3 file:...?mode=ro`）；"草稿失效"类用例需在临时 drafts.db 上删除草稿行作为夹具，仅限本次临时目录 |

## 执行方式标注

| 标注 | 含义 |
|------|------|
| `E:` | Orca 浏览器真实联调（脚本 `scripts/selftest_resume.py`，复用 `drill_resume.py` 的 orca 封装） |
| `U:文件` | 已有 Vitest 用例（`codes/hr-collection-agent-frontend/src/...`），本次整套重跑并回填；不新增用例，除非发现缺口 |
| `S:` | 静态检查（grep / ESLint / 构建产物扫描） |
| 故障注入 | 在页面内用 eval 包装 `window.fetch`（只记录 method、path、status，不记录 body 内容），可延迟或拒绝指定请求；不改被测源码 |

## 变量速查表

| 变量名 | 说明 | 获取方式 |
|--------|------|---------|
| `{变量:baseUrl}` | 前端地址 | `http://127.0.0.1:5173/` |
| `{变量:dataDir}` / `{变量:fileDir}` | 后端临时数据目录 / 原始文件目录 | `mktemp -d` 创建，启动 backend 时经环境变量指定 |
| `{变量:sampleFile}` | 真实样品 | `/tmp/hr_sample/sample.png` |
| `{变量:truthFile}` | 真值 | `/tmp/hr_sample/truth.md`（转 JSON 存 /tmp） |
| `{变量:synthDir}` | 合成错误文件目录 | `mktemp -d`：`a.txt`、`zero.pdf`、`big.png`（10485761 B）、`edge.png`（10485760 B）、`fake.pdf`（txt 内容改名 .pdf）、`UP.PNG`（大写扩展名） |
| `{变量:viewport}` | 视口 | 360×640、390×844、768×1024、1440×900 |
| `{变量:draftJson}` | 当前草稿 | 页面内 `fetch('/api/v1/resume-drafts/current')`，只在 /tmp 保存，不打印 |
| `{变量:recordId}` | 已保存记录 | `select id from resumes order by created_at desc limit 1` |
| `{变量:editField}` | 本次修改的字段 | 意向岗位 `job_title`，改为原值加后缀「（自测）」 |

---

## 用例统计（本 Workbench 测试维度集）

| 场景类型 | 代码 | 用例数 |
|---------|------|--------|
| 组件渲染 | RD | 10 |
| 主要交互流程 | IA | 26 |
| 加载态、空态与错误态 | ST | 29 |
| 接口调用（契约） | AC | 7 |
| 错误码映射 | EM | 18 |
| 响应式与窄屏 | RS | 8 |
| 安全静态 | SC | 10 |
| 合计 | — | 108 |

> 维度说明：模板四维（RD/IA/ST/AC）之外，按 TD-13、REQ-FE-06、interface_spec §3 增加 EM（每个 backend 业务码 + 前端本地码的界面映射）、RS（响应式与窄屏，含 a11y 热区）、SC（浏览器存储 / console / 外联 / 依赖等安全静态）。用例表采用紧凑表格：列「前置 / 步骤与输入 / 预期 / 验证查询 / AC」对应模板的前置条件、测试步骤、输入、预期输出、验证点、追溯 AC。

---

## 一、启动与草稿恢复

- 页面/组件：`ResumeCollectionPage`、`useResumeSession`（bootstrap）、`BootstrapErrorPanel`、`WelcomePanel`、`NoticeBanner`
- 路由：`/`（单页）
- 消费接口：`GET /api/v1/resume-drafts/current`
- 关联需求：REQ-FE-05、REQ-FE-02.1

| TC | 前置 | 步骤与输入 | 预期 | 验证查询 | AC | 执行 | 结果 |
|---|---|---|---|---|---|---|---|
| TC-FE-001-AC-01 | 新浏览器、无 Cookie | 打开 `{变量:baseUrl}` | 页面打开即发 1 次 `GET /api/v1/resume-drafts/current`，同源，不带自定义令牌头 | 网络：包装 fetch 记录 `GET /api/v1/resume-drafts/current` 次数 = 1；`document.cookie` 不含 `draft_token`（HttpOnly） | 05.1、06.1 | E: + U:ResumeDraftApi.test.ts | ✅ E 通过：启动 GET 次数=1 |
| TC-FE-001-RD-01 | GET 延迟 | 注入 GET 延迟 3 秒后打开页面 | 显示「正在读取草稿…」，此时无上传入口可用 | DOM：`innerText` 含「正在读取草稿…」；上传按钮不可点 | 05.1 | U:ResumeCollectionPage.test.tsx | ✅ U 文件级通过（Vitest 650/650；未逐条核对用例名） |
| TC-FE-001-ST-01 | 无草稿（404 `draft_not_found`） | 打开页面 | 空态：欢迎页「你好，我是简历录入助手」+ 上传入口；无错误提示 | DOM 含欢迎语；`role=alert` 数量 = 0；console 无 error（O-12） | 05.3 | E: + U:ResumeCollectionPage.test.tsx | ✅ E 通过：欢迎页空态，无 alert |
| TC-FE-001-IA-01 | 已上传样品、校对中 | 刷新页面 | 自动恢复；提示「已为你恢复未完成的简历」；字段值与状态与刷新前一致 | DOM 含提示；`{变量:draftJson}` 前后状态计数一致；刷新后恢复的核心三项为 recognized 状态文案「待确认」 | 05.2、02.1 | E: | ✅ E 通过：校对中刷新，显示「已为你恢复未完成的简历」，项目经历 4 条恢复 |
| TC-FE-001-IA-02 | 已进入最终确认阶段 | 刷新页面 | 恢复到可继续的状态（以 backend 草稿为准：回到校对/确认视图，不出现「已保存」） | DOM 不含「已保存」；有「确认本区」或「确认提交」入口 | 05.2、04.3 | E: | ✅ E 通过：进入最终确认视图后刷新，提示已恢复，页面无「已保存」，仍有确认入口 |
| TC-FE-001-ST-02 | GET 返回 500（故障注入） | 打开页面 | 可重试错误态，**不当空态**；提示「未能读取已有草稿，请重试。…」；上传不可用，防止覆盖 | DOM 含该提示且含重试按钮；无上传入口；恢复后点重试 → 进入正常态 | 05.3（DD-04 补充） | E:（注入）+ U:BootstrapErrorPanel.test.tsx | ✅ U 文件级通过（Vitest 650/650；未逐条核对用例名） |
| TC-FE-001-ST-03 | GET 网络失败（fetch reject） | 同上 | 同 ST-02，文案为网络异常通用文案 | DOM 含「网络异常，请检查网络后重试。」或 BootstrapErrorPanel 文案；不显示空态欢迎语 | 05.3 | U:ResumeCollectionPage.test.tsx | ✅ U 文件级通过（Vitest 650/650；未逐条核对用例名） |
| TC-FE-001-ST-04 | GET 返回非 JSON 的 502（代理页） | 同上 | `unknown_error` 通用文案，不展示原始响应体 | DOM 不含 `<html`、不含响应正文 | 05.3、06.4 | U:ApiClient.test.ts | ✅ U 文件级通过（Vitest 650/650；未逐条核对用例名） |
| TC-FE-001-RD-02 | 草稿含多条经历 | 恢复草稿 | 工作/项目/教育按多条展示，条数与草稿一致 | DOM 项目经历条数 = `draftJson.fields.project_experiences.value.length`（样品为 4） | 02.1 | E: | ✅ E 通过：项目经历 草稿=4 条与 DOM 一致 |

---

## 二、上传简历

- 页面/组件：`ComposerBar`、`WelcomePanel`、`UploadProgressNotice`、`UploadPrecheck`、`ConfirmDialog`（覆盖确认）
- 消费接口：`POST /api/v1/resume-drafts`
- 关联需求：REQ-FE-01、REQ-FE-02.1

| TC | 前置 | 步骤与输入 | 预期 | 验证查询 | AC | 执行 | 结果 |
|---|---|---|---|---|---|---|---|
| TC-FE-002-RD-01 | 空态 | 检查文件 input | `accept` 为 `.pdf,.jpg,.jpeg,.png`（或等价），无 `multiple`；欢迎页与输入区显示「PDF、JPG、JPEG、PNG · 单个文件 ≤ 10 MB」 | DOM：`input[type=file]` 的 `accept`、`multiple` 属性；文案存在 | 01.1 | E: + U:ComposerBar.test.tsx | ✅ E 通过：accept 含 pdf/jpg/jpeg/png，无 multiple |
| TC-FE-002-IA-01 | 空态 | 上传 `{变量:sampleFile}` | 出现单一加载提示「正在识别，最长约 1 分钟」；识别完成后展示校对视图（共 22 项、若干项待确认） | DOM：加载期含提示且仅 1 个；完成后含「项待确认」；计时 < 75 s | 01.3、02.1 | E: | ✅ E 通过：识别耗时 7.4s |
| TC-FE-002-AC-01 | 同上 | 观察上传请求 | `POST /api/v1/resume-drafts`，multipart，字段名 `file`，未手设 Content-Type（由浏览器带 boundary），`credentials: same-origin` | 网络：包装 fetch 记录 method/path/`body instanceof FormData`/`headers['Content-Type']` 为空 | 01.3、06.1 | E: + U:ResumeDraftApi.test.ts | ✅ E 通过：POST 记录=2 |
| TC-FE-002-IA-02 | 上传进行中 | 加载期间再次点击上传 / 选文件 | 上传入口被禁用，POST 只发 1 次 | 包装 fetch：`POST .../resume-drafts` 计数 = 1；按钮 `disabled` | 01.3 | E: + U:ResumeCollectionPage.upload.test.tsx | ✅ E 通过：加载提示=True 唯一=True 上传禁用=True |
| TC-FE-002-ST-01 | 空态 | 选 `{变量:synthDir}/a.txt` | 前端拦截，提示「仅支持 PDF、JPG、JPEG、PNG 格式。」，不发请求 | DOM 含该文案；POST 计数 = 0 | 01.2 | E: + U:UploadPrecheck（hooks/model） | ✅ U 文件级通过（Vitest 650/650；未逐条核对用例名） |
| TC-FE-002-ST-02 | 空态 | 选 `big.png`（10485761 B） | 拦截，提示「文件超过 10 MB，请压缩后重试。」；不发请求 | 同上 | 01.2 | E: | ✅ E 通过：big.png(10485761B) 拦截「文件超过 10 MB，请压缩后重试。」，POST 0 次 |
| TC-FE-002-ST-03 | 空态 | 选 `zero.pdf`（0 B） | 拦截（对应 `file_empty`），不发请求 | POST 计数 = 0；有错误提示 | 01.2 | E: | ✅ E 通过：zero.pdf 拦截「文件内容为空，请重新选择。」，POST 0 次 |
| TC-FE-002-ST-04 | 空态 | 选 `edge.png`（恰 10485760 B，内容非真实图片） | **放行**到 backend（边界），backend 判内容不符并返回错误；界面只显示 backend `message` | POST 计数 = 1；DOM 含 backend message；DB drafts 行数 = 0 | 01.2、01.6 | E: | ✅ E 通过：edge.png(恰 10485760B) 放行，POST 1 次，backend 返回内容与格式不符，界面显示 message+请求编号；草稿仍为 404 |
| TC-FE-002-ST-05 | 空态 | 选大写扩展名 `UP.PNG`（内容为真实 PNG 缩略） | 前端放行（扩展名大小写不敏感） | POST 计数 = 1 | 01.1 | E: + U:UploadPrecheck | ✅ U 文件级通过（Vitest 650/650；未逐条核对用例名） |
| TC-FE-002-ST-06 | 空态 | 一次选择多个文件（拖拽路径） | 提示「一次只能上传一个文件，已选择第一个。」，只处理第一个 | DOM 含提示；POST 计数 ≤ 1 | 01.1 | U:ResumeCollectionPage.upload.test.tsx | ✅ U 文件级通过（Vitest 650/650；未逐条核对用例名） |
| TC-FE-002-ST-07 | **SUGGEST-1**：已在校对阶段（页面内容很长） | 滚动到页面顶部，选 `a.txt` 上传 | 错误提示固定显示在底部输入区，**当下在视口内可见**；整页只有 1 个 `role=alert` | DOM：`getBoundingClientRect()` 的 `top>=0 && bottom<=innerHeight`；`querySelectorAll('[role=alert]').length === 1`；在 360/1440 各验一次 | 01.2、01.6 | E: + U:ResumeCollectionPage.upload.test.tsx | ✅ E 通过（SUGGEST-1 实机复测）：校对阶段滚到顶部上传 a.txt，提示在输入区内且在视口内；1280×900 与 360×640 均为 alert=1、inView=true、inComposer=true |
| TC-FE-002-ST-08 | 空态 | 选 `fake.pdf`（扩展名 pdf，内容为文本） | 前端放行；backend 返回 `file_content_mismatch`；只展示 `message`，无文件内容；保持上传态可重选 | DOM 含 message；console 无文件名外的内容；GET 草稿仍为 404 | 01.6 | E: | ✅ E 通过：fake.pdf 放行，backend file_content_mismatch，只显示 message，保持上传态 |
| TC-FE-002-ST-09 | 上传请求超过 75 秒 | 假定时器推进 75 s | 结束等待，提示「请求超时，请重试。」并允许重新上传；不假定草稿状态 | DOM 含提示；上传入口恢复可用 | 01.4 | U:ResumeDraftApi.test.ts、ResumeCollectionPage.upload.test.tsx（真实超时无法在不改 backend 下制造，沿用联调结论） | ✅ U 文件级通过（Vitest 650/650；未逐条核对用例名） |
| TC-FE-002-IA-03 | 已有草稿 | 再次选 `{变量:sampleFile}` | 先弹「覆盖当前草稿」确认框；确认前不发请求 | DOM 含确认框文案「将用新文件覆盖当前未确认的简历内容…」；POST 计数 = 0 | 01.5 | E: | ✅ E 通过：已有草稿再上传，弹「覆盖当前草稿」，确认前 POST 0 次 |
| TC-FE-002-IA-04 | 同上 | 点「取消」 | 关闭对话框，原草稿与编辑状态保留，无请求 | 草稿 JSON 不变；POST 计数 = 0 | 01.5 | E: | ✅ E 通过：取消后对话框关闭、POST 0、草稿内容长度不变、校对视图保留 |
| TC-FE-002-IA-05 | 同上 | 点继续 | 提交上传，识别后替换为新草稿；draft 库始终 1 行 | `select count(*) from drafts` = 1 | 01.5 | E: | ✅ E 通过：继续上传后 POST 1 次并替换，drafts 表始终 1 行 |
| TC-FE-002-ST-10 | 空态（无草稿） | 上传合法文件 | **不**弹覆盖确认，直接上传 | 无确认框；POST 计数 = 1 | 01.5 | E: | ✅ E 通过：无草稿时多次上传（样品、错误文件）均未弹覆盖确认 |
| TC-FE-002-ST-11 | 校对中，backend 不可用 | 停掉 backend 后上传 `{变量:sampleFile}` | 通用错误文案（网络/代理失败），草稿内容保持不变；可重试 | DOM 有错误提示；校对视图仍在；恢复 backend 后 GET 仍返回原草稿 | 01.6 | E: | ✅ E 通过：停掉 backend 后覆盖上传，显示「服务暂时不可用，请稍后重试。」（代理 502 → unknown_error），校对视图保留、上传可再用；重启后 drafts 仍 1 行 |

---

## 三、识别结果展示与字段状态

- 页面/组件：`SectionCard`、`FieldRow`、`FieldStatusTag`、`ReviewSummary`、`ReadOnlySection`
- 消费接口：（沿用 POST/GET 返回的 `DraftResponse`）
- 关联需求：REQ-FE-02

| TC | 前置 | 步骤与输入 | 预期 | 验证查询 | AC | 执行 | 结果 |
|---|---|---|---|---|---|---|---|
| TC-FE-003-RD-01 | 样品识别完成 | 查看分区 | 11 个分区（基本信息、求职意向、个人信息、个人优势、工作经历、项目经历、教育背景、专业技能、证书与荣誉、语言能力、自我评价）覆盖 22 个字段 | DOM 分区标题 11 个；字段标签数量与 SectionConfig 一致；`Object.keys(draftJson.fields).length === 22` | 02.1 | E: + U:SectionCard.test.tsx | ✅ E 通过：字段=22 分区标题=11 |
| TC-FE-003-RD-02 | 同上 | 看状态标签 | `recognized`→「待确认」，`uncertain`→「不确定、请确认」，`missing`→「待补充」，`confirmed`→「已确认」；状态用文字表达，不只靠颜色 | DOM：标签文字集合 ⊆ 上述四种；计数与 `draftJson` 状态计数一致 | 02.2 | E: + U:FieldStatusTag.test.tsx | ✅ E 通过：草稿状态计数={'recognized': 11, 'missing': 11}；摘要行与草稿计数一致 |
| TC-FE-003-RD-03 | 同上 | 对比 DOM 与草稿 | recognized 字段不显示「已确认」；missing 字段值为空，前端不自行补全 | 逐字段：DOM 值 == `draftJson` 值（比较结果只输出通过数）；样品中 recognized 字段的状态标签均非「已确认」 | 02.3 | E: | ✅ E 通过：上传后无字段显示为已确认 |
| TC-FE-003-IA-01 | 同上 | 与 `{变量:truthFile}` 比对核心字段 | 姓名、手机号、邮箱、最高学历显示与真值一致（报告只写「一致/不一致」与长度） | drill 脚本 compare；输出脱敏 | 02.1 | E: | ✅ E 通过：核心字段与真值一致={"name": true, "phone": true, "email": true} 长度={'name': 2, 'phone': 11, 'email': 24} |
| TC-FE-003-RD-04 | 非核心字段全部为 missing | 查看 | 空非核心字段不阻止进入最终确认；仅姓名、手机号、邮箱为保存门槛 | 样品 11 个字段 missing；逐区确认后「确认提交」可点 | 02.4 | E: | ✅ E 通过：样品 11 个字段 missing，其余仅核心三项门槛，逐区确认后可提交并保存成功 |

---

## 四、分区校对与编辑

- 页面/组件：`SectionCard`（编辑态）、`FieldRow`、`StringListEditor`、`ObjectListEditor`、`FieldRules`、`QuickReplyChips`
- 消费接口：`PATCH /api/v1/resume-drafts/current`
- 关联需求：REQ-FE-03

| TC | 前置 | 步骤与输入 | 预期 | 验证查询 | AC | 执行 | 结果 |
|---|---|---|---|---|---|---|---|
| TC-FE-004-IA-01 | 样品识别完成 | 观察第一个分区及其后续顺序 | 按固定顺序逐区核对，当前区展示该区全部字段；missing/uncertain 被突出 | DOM：分区顺序与 SectionConfig 顺序一致；missing 字段带「待补充」且有可见强调 | 03.1 | E: + U:ResumeCollectionPage.review.test.tsx | ✅ E 通过：分区顺序 基本信息→求职意向→个人信息 |
| TC-FE-004-AC-01 | 同上 | 点「确认本区」（基本信息） | 发 `PATCH /api/v1/resume-drafts/current`，请求体 `fields` 仅含该区字段键（name/phone/email/homepage），其余字段不在请求中 | 包装 fetch 记录 body 的键集合（不记录值）= 该区键集合 | 03.1、03.2 | E: + U:ResumeCollectionPage.review.test.tsx | ✅ E 通过：PATCH 键=['email', 'homepage', 'name', 'phone'] |
| TC-FE-004-IA-02 | 同上 | 响应后 | 界面以返回值更新：本区字段变「已确认」，其余字段状态不变 | `draftJson` 状态计数变化量 = 本区字段数；其它区标签不变 | 03.2 | E: | ✅ E 通过：状态变化字段=['email', 'homepage', 'name', 'phone'] |
| TC-FE-004-IA-03 | 求职意向区 | 将 `{变量:editField}` 改为原值加后缀「（自测）」并确认本区 | PATCH 带新值；界面显示新值 | `draftJson.fields.job_title.value` 以「（自测）」结尾；DOM 同 | 03.2 | E: | ✅ E 通过：意向岗位 原长=39 新长=43 状态=confirmed |
| TC-FE-004-IA-04 | 项目经历区（4 条） | 删除第 4 条（「删除这一条」）→ 确认本区 | PATCH 带完整新列表（3 条）；界面 3 条 | PATCH body 中 `project_experiences` 长度 = 3；GET 草稿同 | 03.3 | E: + U:ResumeCollectionPage.items.test.tsx | ✅ U 文件级通过（Vitest 650/650；未逐条核对用例名） |
| TC-FE-004-IA-05 | 项目经历区 | 新增 1 条并填项目名称、修改另一条的字段 | 新增/修改均进入整体替换列表 | 条数、被修改字段值（脱敏仅比较长度变化） | 03.3 | E: + U:ObjectListEditor.test.tsx | ✅ U 文件级通过（Vitest 650/650；未逐条核对用例名） |
| TC-FE-004-IA-06 | 专业技能区（字符串列表） | 增加 1 项、删除 1 项 | 整体替换；空项按留空处理并提示「空项将按留空确认」 | PATCH body `skills` 为完整新数组；空项提示存在 | 03.3 | E: + U:StringListEditor.test.tsx | ✅ U 文件级通过（Vitest 650/650；未逐条核对用例名） |
| TC-FE-004-ST-01 | 基本信息区 | 清空姓名 | 引导补充（核心必填），该区「确认本区」不可用 | 按钮 disabled / 出现必填提示；无 PATCH | 03.4 | E: + U:ResumeCollectionPage.edit.test.tsx | ✅ U 文件级通过（Vitest 650/650；未逐条核对用例名） |
| TC-FE-004-ST-02 | 基本信息区 | 手机号依次输入 `13800138000`、`+85212345678`、`138-0013 8000`、`138` | 前两者通过；第三者先去空格与连字符后通过且提交值已规范化；`138` 即时提示格式不正确 | DOM 提示；PATCH 中 phone 为规范化值（只验证长度=11 且无空格/连字符） | 03.5 | E: + U:FieldRules（hooks/model） | ✅ U 文件级通过（Vitest 650/650；未逐条核对用例名） |
| TC-FE-004-ST-03 | 基本信息区 | 邮箱依次输入 `a@b.c`、`a@b`、`a b@c.d`、254/255 字符 | 前一者通过，其余格式不合法即时提示；255 字符超长 | DOM 提示；确认按钮禁用 | 03.5 | E: + U:FieldRules | ✅ U 文件级通过（Vitest 650/650；未逐条核对用例名） |
| TC-FE-004-ST-04 | backend 返回 422 `validation_failed` + `details` | mock | 在对应字段旁展示原因：required=必填、invalid_format=格式不正确、invalid_type=类型不符、too_long=内容过长；子项字段路径 `work_experiences[0].start_date` 定位到对应行 | 渲染断言；`unknown_field` 走通用错误 | 03.6 | U:ResumeCollectionPage.edit.test.tsx、SectionCard.edit.test.tsx | ✅ U 文件级通过（Vitest 650/650；未逐条核对用例名） |
| TC-FE-004-ST-05 | 删除临时 drafts.db 中该草稿行（夹具） | 点「确认本区」 | PATCH 返回 `draft_not_found` → 提示「草稿已失效，请重新上传简历」，运行时草稿清空，回到空态 | DOM 提示 + 欢迎页；GET 404 | 03（interface §3.3） | E: | ✅ E 通过：删除临时 drafts 行后确认本区，显示「草稿已失效，请重新上传简历」并回到欢迎态 |
| TC-FE-004-ST-06 | PATCH 在途（注入延迟 2 s） | 连续快速点两个分区的确认 | 同一时刻仅一个在途 PATCH，后者排队，不并发；界面不被较早响应覆盖 | 包装 fetch：PATCH 并发峰值 = 1 | 03.2（DD-07） | U:ResumeCollectionPage.review.test.tsx（待核对存在）+ E: | ✅ U 文件级通过（Vitest 650/650；未逐条核对用例名） |
| TC-FE-004-ST-07 | 任意文本字段 | 输入超出 `FIELD_MAX_LENGTH` 的值 / 列表超 maxItems | 就地提示内容过长，禁止提交 | 渲染断言（边界：恰好上限通过，上限+1 失败） | 03.5、06.5 | U:FieldRules、ObjectListEditor.test.tsx | ✅ U 文件级通过（Vitest 650/650；未逐条核对用例名） |
| TC-FE-004-RD-01 | 任一文本字段 | 输入 `<img src=x onerror=alert(1)>` 并确认 | 作为纯文本显示，不执行、不生成 DOM 元素（XSS） | `document.querySelectorAll('img[src=x]').length === 0`；值按文本回显 | 03.2、06.1 | E: | ✅ E 通过：个人主页输入 <img onerror>/<b> 后确认，页面无 img/b 注入，草稿按文本保存 |
| TC-FE-004-IA-07 | 键盘 | 用 Tab/Enter 完成「编辑→确认本区」 | 基础键盘可达 | 焦点序列可到达输入框与按钮；Enter 触发 | 03.1（TD-13） | U:ResumeCollectionPage.a11y.test.tsx | ✅ U 文件级通过（Vitest 650/650；未逐条核对用例名） |

---

## 五、最终确认与保存

- 页面/组件：`FinalReviewCard`、`SavedResultCard`、`NoticeBanner`、`ConfirmDialog`（「还有字段未确认」）
- 消费接口：`POST /api/v1/resumes`
- 关联需求：REQ-FE-04

| TC | 前置 | 步骤与输入 | 预期 | 验证查询 | AC | 执行 | 结果 |
|---|---|---|---|---|---|---|---|
| TC-FE-005-ST-01 | 核心三项尚未全部确认 | 进入最终确认并尝试提交 | 「确认提交」不可点；提示「请先确认姓名、手机号、邮箱后再提交。」 | 按钮 disabled；文案存在；无 POST | 04.1 | E: + U:ResumeCollectionPage.final.test.tsx | ✅ U 文件级通过（Vitest 650/650；未逐条核对用例名） |
| TC-FE-005-IA-01 | 逐区确认完毕 | 观察最终确认卡 | 展示「请核对下面的全部内容；点击“确认提交”后才会保存。」，**此时不含「已保存」** | DOM 无「已保存」；`select count(*) from resumes` 不变 | 04.1、04.3 | E: | ✅ E 通过：最终确认视图未出现已保存 |
| TC-FE-005-IA-02 | 仍有未确认字段（跳过某区，点「其余都没问题」） | 点「确认提交」 | 先弹「还有字段未确认」提示；继续即视为确认当前显示的全部内容 | DOM 含提示；继续后才发 POST | 04.2 | E: + U:ResumeCollectionPage.final.test.tsx | ✅ U 文件级通过（Vitest 650/650；未逐条核对用例名） |
| TC-FE-005-IA-03 | POST 延迟 3 s（注入） | 点「确认提交」，等待期间检查 | **返回前不显示「已保存」或成功提示、无乐观更新**；按钮禁用 | 3 s 内每 0.5 s 采样 DOM：无「已保存」；返回后才出现 | 04.3、04.8 | E: | ✅ E 复测通过：POST 延迟 4 秒、页内 250ms 采样，3.8 秒前 14 个样本均无「已保存」，4.8 秒后 11 个样本均出现；连点 2 次只发 1 次 POST |
| TC-FE-005-AC-01 | 同上 | 双击/连点「确认提交」 | 只发 1 次 `POST /api/v1/resumes`，体为 `{confirmed:true}` | 包装 fetch：POST 计数 = 1；body 键集合 = `confirmed` | 04.8 | E: + U:FinalReviewCard.test.tsx | ✅ E 通过：POST /resumes 次数=1 |
| TC-FE-005-IA-04 | 正常保存 | 等待 201 | 显示「已保存」+「上传下一份」；保存卡仅保留姓名、原始文件名、保存时间；运行时内存清空 | DOM：不含邮箱、手机号、其他字段文本（以 `draftJson` 中的值做包含检测，输出仅 true/false）；有保存卡三项 | 04.4 | E: + U:SavedResultCard.test.tsx | ✅ E 通过：显示已保存 + 上传下一份 |
| TC-FE-005-AC-02 | 保存后 | 只读查库与文件 | resumes +1；子表条数与校对一致；`{变量:editField}` 的修改值已入库；原始文件存在且 sha256 与样品一致；drafts = 0；无 `.tmp` | `sqlite3 -readonly {变量:dataDir}/resumes.db "select count(*) from resumes"`；`select job_title from resumes where id={变量:recordId}`（只比对后缀）；`sha256` 对比；`ls {变量:fileDir}` | 04.4 | E: | ✅ E 通过：resumes=1 修改值入库=True drafts=0 文件数=1 tmp=0 |
| TC-FE-005-IA-05 | 保存后 | 点「上传下一份」 | 回到欢迎态，可再次上传；无旧内容 | DOM 含欢迎语；上传入口可用 | 04.4 | E: | ✅ E 通过：保存后点「上传下一份」回到欢迎态，无旧内容 |
| TC-FE-005-IA-06 | 同一人再次上传样品并确认提交 | 走到提交 | 仅显示「该简历已保存过」文字，不展示已有记录内容；资料库不新增 | DOM 含提示；`select count(*) from resumes` 不变；`select count(*) from drafts`=0 | 04.5 | E: | ✅ E 通过：同一人再次上传并提交，显示「该简历已保存过」，页面无项目等记录内容，resumes 仍 1 行，drafts 0 |
| TC-FE-005-ST-02 | POST 网络失败（注入 reject） | 点提交 | **不提示成功**；显示「未收到保存结果，尚未确认保存成功，可直接重试。」；按钮恢复；不调用任何状态查询（无 GET `/resumes*`） | DOM 无「已保存」；包装 fetch 无 `GET /api/v1/resumes`；再点一次可成功 | 04.6 | E: + U:ResumeCollectionPage.final.test.tsx | ✅ U 文件级通过（Vitest 650/650；未逐条核对用例名） |
| TC-FE-005-ST-03 | POST 超过 30 s | 假定时器 | 同 ST-02，`client_timeout` 文案「请求超时，请重试。」，不提示成功 | 渲染断言 | 04.6 | U:ResumeCollectionPage.final.test.tsx | ✅ U 文件级通过（Vitest 650/650；未逐条核对用例名） |
| TC-FE-005-ST-04 | 删除 drafts.db 草稿行（夹具）后提交 | 点提交 | POST 返回 `draft_not_found` → 提示「可能已保存，请重新上传核实」，**不显示成功**，不回空态 | DOM 含提示（NoticeBanner 文案「当前不能确认是否已保存…」）；无「已保存」 | 04.7 | E: | ✅ E 通过：删除 drafts 行后提交，POST 404 draft_not_found，显示 alert「可能已保存，请重新上传核实」，无成功卡，不回空态 |
| TC-FE-005-ST-05 | backend 返回 `save_failed` 500 | mock | 展示 `message`，草稿保留，可直接重试 | 渲染断言 | 04.6 | U:ResumeCollectionPage.final.test.tsx | ✅ U 文件级通过（Vitest 650/650；未逐条核对用例名） |
| TC-FE-005-ST-06 | backend 返回 `validation_failed` + details（模型值非法） | mock | 就地标字段并回到校对 | 渲染断言 | 04.1、03.6 | U:ResumeCollectionPage.final.test.tsx | ✅ U 文件级通过（Vitest 650/650；未逐条核对用例名） |
| TC-FE-005-ST-07 | backend 返回 `confirmation_required` | mock | 视为前端缺陷：通用错误文案带 request_id | 渲染断言 | 04.6 | U:ResumeApi.test.ts | ✅ U 文件级通过（Vitest 650/650；未逐条核对用例名） |

---

## 六、新对话、覆盖确认与未提交编辑拦截

- 页面/组件：`NewChatButton`、`ConfirmDialog`、`AppShell`
- 关联需求：REQ-FE-01.5、P-08、TD-12

| TC | 前置 | 步骤与输入 | 预期 | 验证查询 | AC | 执行 | 结果 |
|---|---|---|---|---|---|---|---|
| TC-FE-006-IA-01 | 校对中有草稿 | 点「＋ 新对话」 | 弹确认框；确认后界面清空为欢迎态；**backend 草稿未被删除**（无丢弃接口） | 无 DELETE 请求；`select count(*) from drafts`=1；刷新后草稿恢复 | 01.5、05.2 | E: | ✅ E 通过：新对话弹「开始新对话」，点「清空并开始」回到欢迎态，无 DELETE 请求，drafts 仍 1 行，刷新后草稿恢复 |
| TC-FE-006-IA-02 | 同上 | 点新对话后「取消」 | 保留当前界面 | DOM 仍为校对视图 | 01.5 | E: | ✅ E 通过：取消后弹窗关闭，校对视图保留 |
| TC-FE-006-IA-03 | 空态 | 点新对话 | 直接回到欢迎态，无确认框 | 无 modal | 01.5 | U:ResumeCollectionPage.newchat.test.tsx | ✅ U 文件级通过（Vitest 650/650；未逐条核对用例名） |
| TC-FE-006-IA-04 | 某字段已改但未点确认本区 | 点「确认本区」之外的操作（如其他分区确认/上传/新对话） | 弹「存在未提交的修改」；「返回」保留编辑内容；继续则放弃修改 | DOM 含弹窗与文案「有未提交的修改，继续将放弃这些修改。是否继续？」；返回后输入值仍在 | 03.2 | E: + U:ResumeCollectionPage.edit.test.tsx | ✅ U 文件级通过（Vitest 650/650；未逐条核对用例名） |
| TC-FE-006-IA-05 | 保存成功后 | 点新对话 | 无确认框，直接新对话 | 无 modal | 04.4 | U:ResumeCollectionPage.newchat.test.tsx | ✅ U 文件级通过（Vitest 650/650；未逐条核对用例名） |

---

## 七、响应式、窄屏与无障碍

- 页面/组件：`AppShell`、`Layout.css`、`useNarrowScreen`、`useChatScroll`
- 关联需求：TD-13（窗口宽 ≥ 360px，< 860px 外壳折叠，≤ 599px 热区 ≥ 44px）；SUGGEST-1/2/3

指标采集：沿用 `drill_resume.py` 的 `metrics()`（overflowX、offscreenControls、clippedInputs、buttonsUnder44、composerH），另增「<44px 按钮定位」：输出 `tagName/className/aria-label 长度/所在容器 class/宽高`，不输出文本内容。

| TC | 前置 | 步骤与输入 | 预期 | 验证查询 | AC | 执行 | 结果 |
|---|---|---|---|---|---|---|---|
| TC-FE-007-RS-01 | 校对视图 | 视口 360×640 | `documentElement.scrollWidth <= innerWidth`；越界控件 0；输入框被截断 0；侧栏折叠为顶栏，「新对话」在右上 | `metrics()` 输出 | TD-13 | E: | ✅ E 通过：360×640 无横向溢出、越界 0、截断输入框 0；确认本区在视口内且 44×44 |
| TC-FE-007-RS-02 | 同上 | 视口 390×844 | 同上 | 同上 | TD-13 | E: | ✅ E 通过：390×844 同上 |
| TC-FE-007-RS-03 | 同上 | 视口 768×1024 | 不溢出、不截断；仍为折叠外壳（< 860） | 同上 | TD-13 | E: | ✅ E 通过：768×1024 无溢出/越界/截断，确认本区在视口内（按钮 32px 高，≥600 不适用 44px 规则） |
| TC-FE-007-RS-04 | 同上 | 视口 1440×900 | 左侧栏 + 主区，不溢出 | 同上 | TD-13 | E: | ✅ E 通过：1440×900 无溢出/越界/截断 |
| TC-FE-007-RS-05 | 全流程 | 在 360 / 390 / 768 / 1440 下各完成「识别后的校对页→确认本区→最终确认视图→确认提交按钮可见可点」的关键步骤 | 每个视口下关键控件在视口内可点；对话区独立滚动、输入区固定 | 元素 `getBoundingClientRect` 在视口内；`scrollTop` 变化发生在对话区而非 body | TD-13 | E: | ✅ E 通过：360 宽走完 逐区确认→确认提交（在视口内，44×44）→已保存，resumes=1；390/768/1440 校对页确认按钮在视口内 |
| TC-FE-007-RS-06 | 360 宽校对页 | 枚举所有可见 `button` 的尺寸 | 全部 ≥ 44×44；若仍有 <44px 的按钮，定位其所属组件（联调遗留：1/24） | 脚本输出 `tag/class/容器/宽高` 列表（无文本） | TD-13、SUGGEST-3 | E: | ✅ E 通过（定位完成）：360/390 校对页可见 button <44px 为 0；联调遗留的“未定位”按钮为 antd 弹窗关闭按钮 .ant-modal-close（32×32，打开覆盖/新对话确认框时出现；drill 的 metrics 把它排除在外）。不属 button.ant-btn 规则，记为 SUGGEST，未修 |
| TC-FE-007-RS-07 | 360×640 | 测输入区高度 | 不超过视口高度约 27% | `composerH / innerHeight` | TD-13、SUGGEST-3 | E: | ✅ E 通过：360×640 输入区高 169px = 26.4% ≤ 27% |
| TC-FE-007-RS-08 | 临界宽度 | 依次设宽 859 / 860 与 599 / 600 | 859 折叠、860 展开；599 起热区 44px、600 恢复 | `getComputedStyle` 与布局类 | TD-13 | E: + U:AppShell.responsive.test.tsx、Layout.responsive.test.ts | ✅ U 文件级通过（Vitest 650/650；未逐条核对用例名） |
| TC-FE-007-RD-01 | 上传/保存/错误各一次 | 检查 aria | 加载、错误、保存结果使用 `aria-live` / `role=alert`；同一时刻仅 1 个 alert | DOM 查询 | TD-13 | E: + U:ResumeCollectionPage.a11y.test.tsx | ✅ U 文件级通过（Vitest 650/650；未逐条核对用例名） |
| TC-FE-007-RD-02 | 页面渲染异常（注入错误） | 触发 ErrorBoundary | 显示「页面出现异常，请刷新后重试。」，不泄露堆栈/内容 | 渲染断言 | 06.3 | U:ErrorBoundary.test.tsx | ✅ U 文件级通过（Vitest 650/650；未逐条核对用例名） |

---

## 八、api 封装与错误码映射

- 组件：`ApiClient`、`ApiError`、`ResumeDraftApi`、`ResumeApi`、`ResponseShapes`
- 规则：统一解析为 `{code, message, request_id}` + 可选 `details`；界面只展示 backend `message`；前端本地码用固定文案（interface §2.3、§3）

接口调用（AC）

| TC | 前置 | 步骤与输入 | 预期 | 验证查询 | AC | 执行 | 结果 |
|---|---|---|---|---|---|---|---|
| TC-FE-008-AC-01 | 全流程 | 汇总 4 个接口的请求 | 路径均以 `/api/v1` 开头；方法与契约一致；仅有这 4 个接口（无丢弃/状态查询接口） | 包装 fetch 的请求集合 ⊆ {POST /resume-drafts, GET/PATCH /resume-drafts/current, POST /resumes} | 06.1 | E: + U:ResumeApi.test.ts、ResumeDraftApi.test.ts | ✅ U 文件级通过（Vitest 650/650；未逐条核对用例名） |
| TC-FE-008-AC-02 | 响应异常形状 | 200 但缺字段 | 报「上传结果异常，请刷新页面后核对。」类提示，不渲染半成品 | 渲染断言 | 06.4 | U:ResponseShapes.test.ts | ✅ U 文件级通过（Vitest 650/650；未逐条核对用例名） |

错误码映射（EM）——13 个 backend 业务码 + 3 个前端本地码 + 非 JSON，逐个断言界面处理（均为 `U:` 契约 mock 层；其中 `file_content_mismatch`、`draft_not_found` 另有 E: 真实联调见 TC-FE-002-ST-08、TC-FE-004-ST-05、TC-FE-005-ST-04）

| TC | 错误码（HTTP） | 触发接口 | 预期界面处理 | 执行 | 结果 |
|---|---|---|---|---|---|
| TC-FE-008-EM-01 | `file_missing`（400） | 上传 | 展示 message，保持上传态，不动现有草稿 | U:ResumeApi/ResumeDraftApi + ResumeCollectionPage.upload.test.tsx | ✅ U 文件级通过（Vitest 650/650；未逐条核对用例名） |
| TC-FE-008-EM-02 | `file_empty`（400） | 上传 | 同上 | 同上 | ✅ E+U 通过：file_empty 由前端预校验拦截（「文件内容为空，请重新选择。」，无 POST）；契约 mock 见 Vitest |
| TC-FE-008-EM-03 | `file_content_mismatch`（400） | 上传 | 同上 | U: + E:（ST-08） | ✅ U 文件级通过（Vitest 650/650；未逐条核对用例名） |
| TC-FE-008-EM-04 | `file_too_large`（413） | 上传 | 同上 | U: | ✅ U 文件级通过（Vitest 650/650；未逐条核对用例名） |
| TC-FE-008-EM-05 | `unsupported_file_type`（415） | 上传 | 同上 | U: | ✅ U 文件级通过（Vitest 650/650；未逐条核对用例名） |
| TC-FE-008-EM-06 | `parse_failed`（502） | 上传 | 展示 message，提示更换文件重传 | U: | ✅ U 文件级通过（Vitest 650/650；未逐条核对用例名） |
| TC-FE-008-EM-07 | `parse_unavailable`（503） | 上传 | 展示 message，不暗示其他解析方式 | U: | ✅ U 文件级通过（Vitest 650/650；未逐条核对用例名） |
| TC-FE-008-EM-08 | `parse_timeout`（504） | 上传 | 展示 message，提示重新上传 | U: | ✅ U 文件级通过（Vitest 650/650；未逐条核对用例名） |
| TC-FE-008-EM-09 | `draft_not_found`（404） | GET | 空态，不报错不记日志 | U: + E:（001-ST-01） | ✅ U 文件级通过（Vitest 650/650；未逐条核对用例名） |
| TC-FE-008-EM-10 | `draft_not_found`（404） | PATCH | 「草稿已失效，请重新上传简历」，回空态 | U: + E:（004-ST-05） | ✅ U 文件级通过（Vitest 650/650；未逐条核对用例名） |
| TC-FE-008-EM-11 | `draft_not_found`（404） | POST /resumes | 「可能已保存，请重新上传核实」，不回空态、不显示成功 | U: + E:（005-ST-04） | ✅ U 文件级通过（Vitest 650/650；未逐条核对用例名） |
| TC-FE-008-EM-12 | `validation_failed`（422，5 种 reason） | PATCH / POST /resumes | details 按 reason 映射文案到字段旁 | U: | ✅ U 文件级通过（Vitest 650/650；未逐条核对用例名） |
| TC-FE-008-EM-13 | `confirmation_required`（422） | POST /resumes | 通用错误文案 + request_id | U: | ✅ U 文件级通过（Vitest 650/650；未逐条核对用例名） |
| TC-FE-008-EM-14 | `save_failed`（500） | POST /resumes | 展示 message，草稿保留可重试 | U: | ✅ U 文件级通过（Vitest 650/650；未逐条核对用例名） |
| TC-FE-008-EM-15 | `internal_error`（500） | 任一 | 通用错误文案，可重试 | U: | ✅ U 文件级通过（Vitest 650/650；未逐条核对用例名） |
| TC-FE-008-EM-16 | `client_timeout`（本地） | 全部 | 固定文案「请求超时，请重试。」；上传 75 s、其余 30 s | U:ApiClient.test.ts | ✅ U 文件级通过（Vitest 650/650；未逐条核对用例名） |
| TC-FE-008-EM-17 | `network_error`（本地） | 全部 | 固定文案「网络异常，请检查网络后重试。」 | U:ApiClient.test.ts + E:（002-ST-11） | ✅ U 文件级通过（Vitest 650/650；未逐条核对用例名） |
| TC-FE-008-EM-18 | `unknown_error`（非 JSON 失败，如 413/502/504 页） | 全部 | 固定通用文案，不展示原始响应体 | U:ApiClient.test.ts、ApiError.test.ts | ✅ U 文件级通过（Vitest 650/650；未逐条核对用例名） |

---

## 九、浏览器侧安全静态

- 关联需求：REQ-FE-06；约束 F-01、F-02、F-03、B-03、B-06

| TC | 前置 | 步骤与输入 | 预期 | 验证查询 | AC | 执行 | 结果 |
|---|---|---|---|---|---|---|---|
| TC-FE-009-SC-01 | 完整流程（上传→校对→保存）结束后 | 检查浏览器存储 | localStorage、sessionStorage、IndexedDB 均无简历/校对内容（应为空） | eval：`localStorage.length===0 && sessionStorage.length===0 && (await indexedDB.databases()).length===0`；`document.cookie` 不含 `draft_token` | 06.2、06.1 | E: | ✅ E 通过：localStorage/sessionStorage/IndexedDB 为空，无可读 draft_token |
| TC-FE-009-SC-02 | 完整流程期间 | 钩子捕获 `console.log/info/warn/error/debug` | 无简历内容或响应体；允许仅含 `request_id`/`code`/HTTP 状态；以 draft 中姓名、手机号、邮箱值做包含检测，输出仅 true/false | eval 钩子数组；对 `{变量:draftJson}` 的核心值做 `includes`；含错误路径（ST-08、ST-11）后再检 | 06.3 | E: | ✅ E 通过：含 404/502 错误路径的整个会话，console 仅 3 条 error，内容只有 request_id/code/status；对样品手机号、邮箱命中 0 |
| TC-FE-009-SC-03 | 完整流程 | 枚举 `performance.getEntriesByType('resource')` | 请求域名仅为本站同源，不出现第三方/模型域名 | eval：`new URL(e.name).origin === location.origin` 全部成立 | 06.1 | E: | ✅ E 通过：所有资源请求同源 |
| TC-FE-009-SC-04 | 源码 | 静态扫描非测试源码 | `fetch(` 仅出现在 `src/api/`；无 `localStorage`/`sessionStorage`/`indexedDB`/`document.cookie`；`console.*` 不含数据 | `grep -rn` 结果；`EslintRules.test.ts` 通过 | 06.1、06.2、06.3 | S: + U:EslintRules.test.ts | ✅ U 文件级通过（Vitest 650/650；未逐条核对用例名） |
| TC-FE-009-SC-05 | 源码 | `npm run lint` | 0 warning | 退出码 0 且输出无 warning | 06.6 | S: | ✅ npm run lint 退出码 0，0 warning |
| TC-FE-009-SC-06 | 契约 | 对比类型与 OpenAPI 0.1.1 | 22 字段键、4 个 FieldStatus、13 个 ErrorCode、5 个 reason、10485760 上限一致 | `Contract.test.ts`、`ContractDrift.test.ts` 通过 | 06.5 | U: | ✅ U 文件级通过（Vitest 650/650；未逐条核对用例名） |
| TC-FE-009-SC-07 | 测试数据 | 扫描 `src/test/` 与 `scripts/` | 仅合成数据；无真实姓名/手机/邮箱；脚本不含个人信息 | 以 /tmp 真值中的核心值做 `git grep -F`（脚本内比对，输出命中数，应为 0） | 06.6 | S: | ⏸ 未执行（本轮范围收缩，见汇总） |
| TC-FE-009-SC-08 | 构建产物 | `npm run build` 后扫描 `dist/` | 构建通过（含 tsc）；产物不含 `sk-`、`DEEPSEEK`、`api_key` 等凭证特征 | `grep -rEl "sk-[A-Za-z0-9]{10,}|DEEPSEEK|api[_-]?key" dist` 应无输出 | 06.1 | S: | ⏸ 未执行（本轮范围收缩，见汇总） |
| TC-FE-009-SC-09 | 全部 Vitest | `npm test` | 全部通过（基线 650） | 退出码与用例数 | 06.6 | U: | ✅ npm test：53 文件 / 650 用例全部通过 |
| TC-FE-009-SC-10 | 本次产出物 | 提交前扫描 | 文档、脚本、报告不含样品个人信息；样品/真值/截图不入库 | 同 SC-07 + `git status` 无 /tmp 文件 | 06.6 | S: | ⏸ 未执行（本轮范围收缩，见汇总） |

---

## 覆盖追溯矩阵

### 验收标准覆盖

| AC 编号 | AC 描述（摘要） | 覆盖用例 | 状态 |
|---------|---------|---------|------|
| REQ-FE-01.1 | 只允许单个 PDF/JPG/JPEG/PNG | TC-FE-002-RD-01、002-ST-05、002-ST-06 | ✅ 已设计 |
| REQ-FE-01.2 | 类型/大小不符上传前提示并阻止 | TC-FE-002-ST-01..04、002-ST-07 | ✅ 已设计 |
| REQ-FE-01.3 | 单一加载提示、禁止重复提交 | TC-FE-002-IA-01、002-AC-01、002-IA-02 | ✅ 已设计 |
| REQ-FE-01.4 | 75 秒超时提示重传 | TC-FE-002-ST-09、008-EM-16 | ✅ 已设计（真实超时不可实测） |
| REQ-FE-01.5 | 有草稿再上传先二次确认 | TC-FE-002-IA-03..05、002-ST-10、006-IA-01..03 | ✅ 已设计 |
| REQ-FE-01.6 | 上传错误只展示 message | TC-FE-002-ST-04、002-ST-07、002-ST-08、002-ST-11、008-EM-01..08 | ✅ 已设计 |
| REQ-FE-02.1 | 全部分类展示，多条子项 | TC-FE-003-RD-01、001-RD-02、003-IA-01 | ✅ 已设计 |
| REQ-FE-02.2 | 四种状态区分展示 | TC-FE-003-RD-02 | ✅ 已设计 |
| REQ-FE-02.3 | recognized 不当已确认、不补全 | TC-FE-003-RD-03 | ✅ 已设计 |
| REQ-FE-02.4 | 非核心可空，仅三项为门槛 | TC-FE-003-RD-04、005-ST-01 | ✅ 已设计 |
| REQ-FE-03.1 | 22 字段 11 区逐区核对 | TC-FE-004-IA-01、004-AC-01 | ✅ 已设计 |
| REQ-FE-03.2 | 结构化提交、以返回值更新 | TC-FE-004-AC-01、004-IA-02、004-IA-03、004-ST-06、006-IA-04 | ✅ 已设计 |
| REQ-FE-03.3 | 多条子项新增/改/删 | TC-FE-004-IA-04..06 | ✅ 已设计 |
| REQ-FE-03.4 | 核心三项缺失引导补充 | TC-FE-004-ST-01 | ✅ 已设计 |
| REQ-FE-03.5 | 手机号/邮箱即时格式提示 | TC-FE-004-ST-02、004-ST-03、004-ST-07 | ✅ 已设计 |
| REQ-FE-03.6 | details 字段级原因 | TC-FE-004-ST-04、008-EM-12 | ✅ 已设计 |
| REQ-FE-04.1 | 独立最终确认且门槛 | TC-FE-005-ST-01、005-IA-01 | ✅ 已设计 |
| REQ-FE-04.2 | 有未确认字段先提示 | TC-FE-005-IA-02 | ✅ 已设计 |
| REQ-FE-04.3 | 成功前不显示已保存 | TC-FE-005-IA-01、005-IA-03 | ✅ 已设计 |
| REQ-FE-04.4 | 成功显示已保存、清空内存 | TC-FE-005-IA-04、005-AC-02、005-IA-05 | ✅ 已设计 |
| REQ-FE-04.5 | already_saved 只显示提示 | TC-FE-005-IA-06 | ✅ 已设计 |
| REQ-FE-04.6 | 超时/网络失败可重试且不查状态 | TC-FE-005-ST-02、005-ST-03、005-ST-05、005-ST-07 | ✅ 已设计 |
| REQ-FE-04.7 | draft_not_found 提示可能已保存 | TC-FE-005-ST-04、008-EM-11 | ✅ 已设计 |
| REQ-FE-04.8 | 确认期间防重复点击 | TC-FE-005-IA-03、005-AC-01 | ✅ 已设计 |
| REQ-FE-05.1 | 打开页面读草稿、same-origin | TC-FE-001-AC-01、001-RD-01 | ✅ 已设计 |
| REQ-FE-05.2 | 自动恢复展示 | TC-FE-001-IA-01、001-IA-02、006-IA-01 | ✅ 已设计 |
| REQ-FE-05.3 | 无草稿空态引导上传 | TC-FE-001-ST-01..04 | ✅ 已设计 |
| REQ-FE-06.1 | 只经 api 封装、不直连 | TC-FE-008-AC-01、009-SC-03、009-SC-04 | ✅ 已设计 |
| REQ-FE-06.2 | 不用浏览器存储 | TC-FE-009-SC-01、009-SC-04 | ✅ 已设计 |
| REQ-FE-06.3 | 控制台不输出内容 | TC-FE-009-SC-02、009-SC-04、007-RD-02 | ✅ 已设计 |
| REQ-FE-06.4 | 统一错误解析 | TC-FE-008-AC-02、008-EM-01..18 | ✅ 已设计 |
| REQ-FE-06.5 | types/api 与 OpenAPI 对齐 | TC-FE-009-SC-06 | ✅ 已设计 |
| REQ-FE-06.6 | Vitest/RTL/ESLint、合成数据 | TC-FE-009-SC-05、009-SC-07、009-SC-09 | ✅ 已设计 |

### 接口消费覆盖

| 消费接口 | 覆盖用例 | 状态 |
|---------|---------|------|
| `POST /api/v1/resume-drafts` | TC-FE-002-AC-01、002-IA-01..05、008-EM-01..08 | ✅ |
| `GET /api/v1/resume-drafts/current` | TC-FE-001-AC-01、001-ST-01..04、008-EM-09 | ✅ |
| `PATCH /api/v1/resume-drafts/current` | TC-FE-004-AC-01、004-IA-03..06、004-ST-04..06、008-EM-10、008-EM-12 | ✅ |
| `POST /api/v1/resumes` | TC-FE-005-AC-01、005-AC-02、005-IA-04、005-IA-06、005-ST-02..07、008-EM-11、008-EM-13、008-EM-14 | ✅ |

### 错误码覆盖（附加追溯维度）

| 类别 | 清单 | 覆盖 |
|---|---|---|
| backend `ErrorCode` 13 个 | file_missing、file_empty、file_content_mismatch、file_too_large、unsupported_file_type、parse_failed、parse_unavailable、parse_timeout、draft_not_found、validation_failed、confirmation_required、save_failed、internal_error | EM-01..15 全覆盖（13/13） |
| 前端本地码 3 个 | client_timeout、network_error、unknown_error | EM-16..18（3/3） |
| validation_failed 的 5 个 reason | required、invalid_format、invalid_type、too_long、unknown_field | 004-ST-04、008-EM-12（5/5） |

### 界面状态覆盖（附加追溯维度）

| 界面状态 | 覆盖用例 | 状态 |
|---------|---------|------|
| 启动加载态 | TC-FE-001-RD-01 | ✅ |
| 空态（欢迎页） | TC-FE-001-ST-01、005-IA-05 | ✅ |
| 上传加载态 | TC-FE-002-IA-01、002-IA-02 | ✅ |
| 启动错误态（可重试） | TC-FE-001-ST-02..04 | ✅ |
| 上传错误态（含固定输入区可见性） | TC-FE-002-ST-01..04、002-ST-07..08、002-ST-11 | ✅ |
| 校对态（四种字段状态） | TC-FE-003-RD-02、004-IA-01 | ✅ |
| 编辑态 / 字段级错误 | TC-FE-004-ST-01..04、004-ST-07 | ✅ |
| 最终确认态 | TC-FE-005-IA-01..03 | ✅ |
| 保存成功 / 已保存过 / 可能已保存 | TC-FE-005-IA-04、005-IA-06、005-ST-04 | ✅ |
| 确认框（覆盖、未确认字段、未提交修改） | TC-FE-002-IA-03、005-IA-02、006-IA-04 | ✅ |
| 窄屏（360/390/768/桌面） | TC-FE-007-RS-01..08 | ✅ |
| 异常边界 | TC-FE-007-RD-02 | ✅ |

### 主要交互路径覆盖

| 交互路径 | 覆盖用例 | 状态 |
|---------|---------|------|
| 上传→逐区校对→修改字段→最终确认→已保存 | TC-FE-002-IA-01、004-IA-01..03、005-IA-01..04 | ✅ |
| 刷新恢复 | TC-FE-001-IA-01、001-IA-02 | ✅ |
| 重复保存（已保存过） | TC-FE-005-IA-06 | ✅ |
| 覆盖确认（取消/继续） | TC-FE-002-IA-03..05 | ✅ |
| 新对话 | TC-FE-006-IA-01..03、006-IA-05 | ✅ |
| 未提交编辑拦截 | TC-FE-006-IA-04 | ✅ |
| 格式/大小错误 | TC-FE-002-ST-01..03、002-ST-07 | ✅ |
| 后端不可用 | TC-FE-001-ST-02、002-ST-11、005-ST-02 | ✅ |

---

## 覆盖率统计

| 维度 | 总数 | 已覆盖（已设计） | 覆盖率 |
|------|------|--------|--------|
| 验收标准（AC，REQ-FE-01..06） | 33 | 33 | 100% |
| 被测单元 | 9 | 9 | 100% |
| backend 业务码 | 13 | 13 | 100% |
| 前端本地错误码 | 3 | 3 | 100% |
| 消费接口 | 4 | 4 | 100% |

> 「已设计」不等于「已通过」；通过率见下节执行汇总（待回填）。

## PRD 与设计文档比对：遗漏/无法覆盖的场景

| # | 场景 | 处理 |
|---|------|------|
| M-1 | 75 秒真实上传超时 | 无法在不改 backend 下制造；用假定时器的 Vitest 覆盖（002-ST-09），联调报告同样标未实测 |
| M-2 | `parse_unavailable`（503）、`parse_failed`（502）、`parse_timeout`（504）的真实触发 | 需要 backend 模型侧故障（密钥失效/超时），不在前端自测里破坏 backend 环境；Vitest 契约 mock 覆盖；真实触发留给 backend 自测 |
| M-3 | 其他浏览器（Chrome/Edge/Safari/Firefox 最近两版） | 仅用 Orca 内置浏览器；兼容范围声明（TD-13）未逐个验证 |
| M-4 | PRD 用户故事#3 的"关闭页面后重新打开"跨日（草稿 7 天过期） | 不等待 7 天；以 DB 删除草稿行模拟"草稿失效"（004-ST-05、005-ST-04） |
| M-5 | 屏幕阅读器专项 | 明确不做（Q-DL-05） |
| M-6 | PDF 简历文件的真实识别 | 本次样品为 PNG；PDF 路径在上一次联调（合成样本）已验证，不重复 |
| M-7 | 识别质量（Q-1..Q-4） | backend/模型范畴，仅在 003-IA-01 观察，不作前端通过/失败判据 |
| M-8 | 并发多标签页同一 Cookie | 未设计；POC 单用户场景，标记为已知缺口 |

## 用例执行汇总

执行日期 2026-11-10。环境：backend 127.0.0.1:8000（独立临时目录、真实 DeepSeek）+ Vite 5173 + Orca 浏览器；样品为 DL 的真实中文简历（只在 /tmp，本文不含个人信息值）。E2E 脚本：`codes/hr-collection-agent-frontend/scripts/selftest_resume.py`（`main` 场景）。

| 项 | 数量 |
|---|---|
| 用例总数 | 108 |
| ✅ E 浏览器联调通过（含 lint/全量 Vitest 两条静态项） | 23 |
| ✅ U 文件级通过（引用 Vitest 650/650，未逐条核对用例名） | 53 |
| ⚠️ 不确定 | 1（TC-FE-005-IA-03，见下） |
| ❌ 失败 | 0 |
| ⏸ 未执行 | 31 |
| 已有结果的通过率 | 76 / 77 = 98.7%（1 条不确定）；按总数 76 / 108 = 70.4% |
| AC 覆盖率（设计层） | 33 / 33 = 100%；有 E 或 U 结果的 AC 见下 |

主流程（桌面 1280）已在真实后端走通：上传样品 → 识别（约 6–11 秒）→ 22 字段、11 分区、状态摘要与草稿计数一致 → 核心三项与真值一致 → 逐区确认（基本信息区的 PATCH 仅含该区 4 个字段）→ 修改意向岗位（入库且带修改后缀）→ 最终确认 → 已保存；SQLite 只读核对：resumes 1、drafts 0、文件 1 个、无 tmp；浏览器存储为空、请求均同源。

### 需要后续处理的项

| 项 | 说明 |
|---|---|
| TC-FE-005-IA-03 不确定 | 注入 3 秒延迟后的 5 次采样里出现「已保存」。脚本中第二次点击与 orca 调用有延迟，采样可能已晚于响应；未能确认延迟注入是否生效，**不判为缺陷**，需单独复测（把采样改为在 POST 发出后立即开始，并记录响应时间） |
| 未执行（31 条） | 360/390/768 窄屏与 <44px 按钮定位（RS-01..08）、SUGGEST-1 实机复测（002-ST-07）、刷新恢复（001-IA-01/02）、重复保存（005-IA-06）、覆盖确认（002-IA-03..05）、新对话（006-IA-01/02）、未提交编辑拦截（006-IA-04）、格式/大小错误（002-ST-01..04）、后端不可用（002-ST-11）、故障注入类（001-ST-02、005-ST-02/04、004-ST-05）等。原因：本轮按协调者要求缩小范围，主流程脚本调通后在用户指示下收尾；脚本场景（viewports/refresh/dup/overwrite/newchat/errors）尚未编写 |
| U 文件级 | 53 条仅引用整套 Vitest 通过，没有逐条核对对应用例名，标注为文件级 |

联调中观察到的脚本侧问题（非产品缺陷）：Orca 在用户正处于输入法输入时会拒绝点击事件，脚本已加重试。
