# HR_PR-1 影响分析 — frontend Workbench（v2 delta）

## 变更履历

| 版本 | 日期 | 变更原因 | 变更摘要 |
|---|---|---|---|
| v1.0 | 2026-11-10 | 初版 | frontend 影响分析，9 条待澄清问题（新项目，无存量代码） |
| v1.1 | 2026-11-10 | 跨 Workbench review 裁决 C-01..C-15 回流 | 增量修订 |
| v2 | 2026-11-11 | HR_PR-1-CRv2：PRD v2（#3 补充、#4 补 1 条、新增 #5 #6 #7）与 HLD v2、ADR-007/008/009 推翻 v1 的"无文本框、单草稿、无历史、无归档查看" | **整篇覆盖**为"从当前 v1 代码出发，v2 要改什么"；v1.x 内容靠 git 追溯，不再保留 |

**分析人**：Yin Yang（frontend）
**分析日期**：2026-11-11
**代码仓库**：`codes/hr-collection-agent-frontend`（v1 代码已存在，约 9300 行含测试；仓库约定 `AGENTS.md` 状态"已确认"，但仍是 v1 口径，见末尾）
**依据**：`prd.md` v2、`solution-design.md` v2（§3 第 4/6/7/8 步、§4 新契约、§5 Frontend、§8）、ADR-007/008/009、ADR-003/006 的 v2 修订、`.kiro/decisions/design/2026-11-11-HR_PR-1需求变更v2.md`、`architectural_constraints.md`（F-01/F-02/F-03）
**深度**：POC，整体 L2（`2026-11-10-HR_PR-1降级L2防止过度.md`）；红线点只有 F-02（对话内容不入浏览器存储）、F-03（保存成功才提示已保存）。

> 后端接口尚未定稿（OpenAPI 0.2.0 在契约阶段产出）。本文凡涉及接口，只写"需要什么数据/动作"，不拟路径与字段名。文中"现有"指 v1 代码。

---

## 1. v1 代码现状摘要（与 v2 相关部分）

| 模块 | 位置 | 现状 |
|---|---|---|
| 页面编排 | `pages/ResumeCollectionPage.tsx`（233 行） | 单页；按 `state.phase`（bootstrapping/bootstrap_failed/empty/reviewing/saved）渲染一条线性流：FileCard → ReviewSummary → 11 个 SectionCard / FinalReviewCard；底部 ComposerBar；4 个 ConfirmDialog（overwrite/new_chat/unconfirmed/unsubmitted_edits） |
| 会话状态机 | `hooks/model/SessionReducer.ts`（409 行） | 单草稿模型：`draft: DraftResponse\|null`；`Busy = upload\|patch\|confirm`；`epoch` 丢弃过期结果（`SessionReducer.ts:24` Busy、`:53` draft、`:206` BOOTSTRAP_SUCCEEDED、`:216` FILE_SELECTED） |
| 副作用 | `hooks/useResumeSession.ts`（222 行） | 启动 `getCurrentResumeDraft()`（:37）；上传 `createResumeDraft`（:75）；分区 PATCH `updateCurrentResumeDraft`（:130）；保存 `createResume()`（:161） |
| API 层 | `api/ApiClient.ts`、`ResumeDraftApi.ts`、`ResumeApi.ts`、`ResponseShapes.ts` | `request()` 方法仅 `GET\|POST\|PATCH`（ApiClient.ts:12）；**响应一律按 JSON 解析**（`ApiClient.ts:54`），无法解析即 `unknown_error`（`:69`）；默认超时 30s（`:9`）、上传 75s（`:7`）；v1 端点全是 `/resume-drafts/current`（单草稿）与 `/resumes`（POST） |
| 输入区 | `components/ComposerBar.tsx`（90 行） | 仅上传按钮（`:65`）+ 全页拖拽（`:38` 起）+ 声明；注释明确（`:25`）"无文本输入、不解析自由文本（ADR-006）"；`QuickReplyChips` 只有"确认无误""其余都没问题" |
| 外壳 | `components/AppShell.tsx`（42 行） | 侧栏只有"＋ 新对话"（`AppShell.tsx:31-33`，P-02：无历史）；<860px 侧栏折叠，按钮挪到顶栏（`useNarrowScreen`） |
| 对话流容器 | `components/ChatThread.tsx`（29 行）、`hooks/useChatScroll.ts` | 只按 `data-focus-key` 滚动/聚焦（`ChatThread.tsx:15`）；焦点键仅 `saved`/`final`/`section:*`（`useChatScroll.ts:14-18`） |
| 只读渲染 | `components/ReadOnlySection.tsx`（92 行，被 SectionCard 引用） | 以 `ResumeFields`（每字段含 `status`）渲染分区，含 `FieldStatusTag` |
| 保存结果 | `components/SavedResultCard.tsx` + reducer `CONFIRM_SUCCEEDED`（:337） | 保存后 `draft=null`、进入 `saved` 相，只留 `SavedSummary`；"上传下一份"回空态 |
| 无路由 | `App.tsx:26` | 直接渲染 `ResumeCollectionPage`；`package.json` 无路由库，AGENTS.md 明确"单页应用，不引入路由库（TD-02）" |

---

## 2. 变更影响评估

### 2.1 输入区：文本输入、思考中、失败重试（PRD #3/#5）

| 项 | 涉及 | 改法方向 |
|---|---|---|
| 文本输入 | `ComposerBar.tsx`（修改：`:25` 注释、`:27-28` props、`:64-69` 在 `composer-bar` 内上传按钮旁增加输入与发送） | 在上传按钮旁增加多行文本框 + 发送按钮；Enter 发送、Shift+Enter 换行；**必须处理中文输入法组合态**（`isComposing` 时 Enter 不发送）；`autoComplete="off"`（见 F-02）；长度上限取后端契约（⚠️ 待契约给出）。文本内容只放组件/页面的运行时内存。 |
| 可用条件 | `ResumeCollectionPage.tsx:151`（`showComposer`）、`:174-182`（ComposerBar 调用处）；`ComposerBar.tsx:28`（`disabled`） | 仅"当前会话有简历且为校对中"时可发送（PRD #5 前提）；`empty` 相（未上传）与"已保存"会话（只读）禁用并给出原因提示（不是隐藏，避免用户困惑）。 |
| 上传与文本共存 | `ComposerBar.tsx:38-58`（拖拽监听，不改）、`:25`（注释改口径） | 全页拖拽/上传逻辑不变（含"禁用时仍取消浏览器默认拖放"的保护，防丢未提交编辑）；注释中"无文本框（ADR-006）"改为 ADR-007 口径。 |
| "思考中" | `SessionReducer.ts:24`（Busy 增加 `'chat'`/`'apply'`/`'delete'`）、新增助手占位气泡组件 | `Busy` 增加 `'chat'`；发送期间在对话流末尾显示"思考中…"占位（`role="status"`，沿用 `UploadProgressNotice.tsx:5-8` 的做法）；busy 期间沿用现有"busy 禁用全部交互"约束（分区编辑/上传/切换均禁用）。不流式（HLD §1）。 |
| 失败重试 | `SessionReducer.ts:26`（ErrorScope）、`:62` 附近（`pendingFile` 旁）新增 `pendingMessage` 字段（与 `pendingFile` 同构）；`ErrorAlert.tsx:17`（复用） | 新增 `ErrorScope='chat'`；状态中保留 `pendingMessage`（与 `pendingFile` 同构）：发送失败时用户消息气泡带"发送失败"标记，原文保留在内存，提供"重试"按钮；已有简历与对话不受影响（PRD #5 最后一条）。api 层仍不自动重试（DD-05/DD-06），重试由用户触发。 |
| 超时 | `ApiClient.ts:7-9`（超时常量）、`:31`（默认取值） | 对话请求需要独立超时常量（模型同步调用；现有 30s 默认值是否够用 ⚠️ 取决于后端实测，见 Q-frontend-v2-03）。 |

### 2.2 对话流：消息、修改建议卡片（PRD #3/#5）

| 项 | 涉及 | 改法方向 |
|---|---|---|
| 消息列表 | `ResumeCollectionPage.tsx:95-139`（`reviewing` 分支，在 `{pending}`（:138）之前插入）、新增 `MessageBubble`（用户/助手）组件 | 会话读取返回的对话记录渲染在现有线性流的**末尾**（FileCard/ReviewSummary/分区卡片之后、pending 之前）；新消息到达后沿用 `ChatThread.tsx:15` 的 focus-key 机制（`useChatScroll.ts:14` 增加消息焦点键）滚动到最新一条。 |
| 修改建议卡片 | 新增 `SuggestionCard` 组件 | 每条建议逐项列出：字段名称（经 `SectionConfig` 映射成中文标签）、原值、新值；"应用""取消"两个按钮；不可应用项不渲染"应用"并显示后端给出的原因（PRD #3）；一条建议含多项时同卡片展示（PRD #3）。 |
| 建议状态 | 同上 + 会话数据 | 卡片需区分 待处理 / 已应用 / 已取消（会话重新打开后这些状态由后端给出，前端不自行推断）；只有"待处理 + 校对中会话"才显示按钮。 |
| 应用 | `SessionReducer.ts:81`（参照 `PATCH_SUCCEEDED` 新增 APPLY_SUCCEEDED）、`useResumeSession.ts:124-136`（参照 `confirmSection` 的 busy+epoch 写法） | 应用/取消各是一次后端动作；应用成功的响应须带回更新后的字段（或前端重新读取会话），用它**替换 `state.draft`**，分区卡片、`ReviewSummary` 计数随之自动更新（它们都由 `draft.fields` 派生，无需改）。应用的字段在后端视为"已确认"（PRD #3）。 |
| 与就地编辑共存 | `SessionReducer.ts:246`（FIELD_EDITED）、`:271`/`:290`（PATCH_SUCCEEDED/FAILED，editBuffer 处理参照） | 两种方式改同一份数据，冲突点两处：① 应用建议时 `editBuffer` 里已有同字段未提交编辑 → 建议：**以应用为准，清掉 buffer 中对应字段**（用户点"应用"是更晚的明确动作），或在 UI 上提示；② 建议生成后用户又手工改了该字段，建议里的"原值"已过期 → 需后端在应用时校验并返回明确错误，或前端提示"原值已变化"（⚠️ Q-frontend-v2-05）。 |
| 失败 | `ErrorAlert` | 应用/取消失败：卡片内提示可重试，卡片状态保持待处理。 |

⚠️ 风险（中）：现有流里 11 个分区卡片会占很高的页面，消息位于其下方，用户点"应用"后改动的分区可能不在视野内。缓解方向：应用成功后卡片自身显示"已应用"并列出已变更字段，必要时滚动/聚焦到被修改分区（`useChatScroll` 增加焦点键）。具体布局留技术设计阶段定，不在本分析展开。

### 2.3 "确认提交"在对话中的处理（PRD #4 补充）

- 现状：确认动作只有 `FinalReviewCard` 的确认按钮（`ResumeCollectionPage.tsx:125-136`；reducer `CONFIRM_REQUESTED` → `useResumeSession.ts:161` `createResume()`），`unconfirmed` 对话框也在这条路径上。
- 方向：**对话中的"确认提交"不得触发保存**。前端的做法：收到该意图的回复后，切到现有 `view='final'`（即 `SessionReducer.ts:306` `GO_FINAL_REQUESTED`、`useResumeSession.ts:138` `goFinal`，沿用其"有未提交修改先弹 `unsubmitted_edits` 对话框"的逻辑），展示 `FinalReviewCard`，用户仍点其中的确认按钮才调用 `createResume()`。
- 难点：前端**不能**自己解析自由文本判断"是不是确认提交"（那正是 ADR-007 交给模型做的事，也违背 F-03 精神）。所以需要后端在回复里给出一个明确的"展示待保存信息"信号（或直接把此类回复定义为纯文本，由用户自己点现有的"其余都没问题"芯片）。见 Q-frontend-v2-04。
- F-03 不变：只有 `createResume()` 的 2xx 且通过 `isCreateResumeResponse` 才进入"已保存"；对话回复、建议应用都不得触发"已保存"提示。

### 2.4 历史会话栏（PRD #6）

| 项 | 涉及 | 改法方向 |
|---|---|---|
| 列表 | `AppShell.tsx:30-34`（侧栏，修改）、新增 `SessionList` 组件 | 侧栏（v1 只有"新对话"）增加会话列表：名称（后端给出，"简历 · 姓名"/"未命名简历"）、状态（校对中/已保存，文字+颜色，TD-13）、最近活动时间（复用 `SavedResultCard.tsx:5` `formatSavedAt`，建议顺手挪到共享工具）；按最近活动倒序（后端排序，前端不重排）。 |
| 窄屏 | `AppShell.tsx:20,27,30`（`narrow` 分支）、`Layout.css:70`（`.app-sidebar`） | 现有 <860px 侧栏整体折叠，会让列表不可达。方向：窄屏用 Ant Design `Drawer`（已有依赖）由顶栏按钮打开列表，不引入新依赖。 |
| 切换/继续 | `SessionReducer.ts:117-124`（`resetToEmpty` 的 epoch+1 做法参照）、`:127`（`enterReview`）、`:27`（DialogKind 新增 `switch_session`）、`useResumeSession.ts:198` 返回对象增加切换/删除函数 | 选择会话 = 读取该会话（简历字段 + 对话记录 + 状态）→ 进入 reviewing（校对中）或只读（已保存）；沿用 `epoch` 机制：切换时 bump `epoch`，旧请求结果自动丢弃。切换前若 `editBuffer` 非空 → 复用 `unsubmitted_edits` 类对话框提示"未提交的修改将丢失"（新增一个 DialogKind，如 `switch_session`）。busy 时禁用切换（与现有 busy 约束一致）。校对中会话之间互不影响（各自读取各自的数据，前端内存只持有当前会话）。 |
| 删除 | `ResumeCollectionPage.tsx:192-232`（ConfirmDialog 复用模式）；`ApiClient.ts:12`（方法联合增加 `DELETE`） | 每项删除入口 → 二次确认；文案按状态区分：校对中="删除后简历信息与已上传文件一并删除，无法恢复"；已保存="只删除对话记录，已归档简历仍可在'已归档简历'中查看"（PRD #6）。删除当前打开的会话 → 回到空态。`request()` 需支持 `DELETE`，且删除成功响应可能无 JSON 正文（现有 `request` 会把无法解析的 2xx 判成 `unknown_error`，见 `ApiClient.ts:50-60`、`:69`）→ api 层需要"允许空正文"的选项。 |
| 列表刷新 | `useResumeSession.ts:75`（上传成功处）、`:130`、`:161`（PATCH/保存成功处）；或新增 `useSessionList` | 上传成功、对话/应用后（最近活动变化）、保存成功、删除后重新拉取列表（最简单，POC 不做本地推算）。 |
| 已保存会话只读 | `SessionReducer.ts:22`（Phase 附近新增只读标志，`:53-65` 状态字段）、`ResumeCollectionPage.tsx:142-146`（`saved` 分支） | 显示对话记录 + 已保存简历内容（按分区只读，内容来自正式库）；禁用文本输入、上传到当前会话、分区编辑、确认；不显示"应用/取消"。展示用 `ReadOnlySection`（见 2.5 对其数据形态的依赖）。 |
| "新对话" | `SessionReducer.ts:393-401`（NEW_CHAT_*）、`ResumeCollectionPage.tsx:200-211`（new_chat 对话框）、`useResumeSession.ts:181-188` | **P-08 二次确认大部分不再需要**：v1 的理由是"未确认草稿仍保留，再次上传会覆盖它"（`ResumeCollectionPage.tsx:205`），v2 中上传会新建会话、旧会话不会被覆盖，列表里随时可回去。建议：新对话 = 仅清空当前视图为空态（会话不入列表，直到上传，PRD #6）；**仅当 `editBuffer` 非空时**保留一个"未提交的修改将丢失"确认（该风险不因 v2 消失，且 F-02 决定它不能暂存到浏览器）。同理 `decideUpload` 的 `needs_overwrite`（`SessionReducer.ts:175,184,223`）与 `overwrite` 对话框（`ResumeCollectionPage.tsx:192-199`）、`overwriteAcknowledged` 字段（`SessionReducer.ts:64,110,122,142`）、`OVERWRITE_*`（`:231-235`）、`useResumeSession.ts:98` `confirmOverwrite`在 v2 中**不再有语义**，应删除；"在已有会话上再上传"改为"新建会话并切过去"（⚠️ Q-frontend-v2-06）。 |
| 页面打开默认展示 | `SessionReducer.ts:203-214`（BOOTSTRAP_*）、`ResumeCollectionPage.tsx:74-85` | 建议：**打开时只加载会话列表，主区显示欢迎/空态（新对话），不自动选中任何会话**。理由：① PRD #6 只要求"展示历史会话列表"；② 自动恢复最近会话易让人误以为是新对话而在旧会话上操作；③ 少一种启动状态，列表失败与会话失败分开处理。备选：自动打开最近的"校对中"会话（更接近 v1 "恢复未完成简历"的体验）。由 DL 选，见 Q-frontend-v2-07。 |

### 2.5 已归档简历页（PRD #7）

| 项 | 涉及 | 改法方向 |
|---|---|---|
| 导航/路由 | `App.tsx:26`、`AppShell.tsx:24-28`（顶栏） | **项目当前没有路由**（App.tsx 直接渲染单页；AGENTS.md 与 TD-02 明确不引入路由库；依赖新增须 DL 同意）。建议：不引入路由库，用 `App` 里的 `useState<'chat'\|'archive'>` 做两个入口（外壳顶栏/侧栏放"对话 / 已归档简历"切换，Ant Design `Segmented`/`Menu` 即可）。代价：无深链接、浏览器后退键不分页——本期 POC 可接受。 |
| 切换不丢状态 | `App.tsx` | 切到归档页再回来，不能丢掉对话页的 `editBuffer`、输入框内容、当前会话。`ResumeCollectionPage` 拥有 `useResumeSession`（`ResumeCollectionPage.tsx:51` 的 `useResumeSession()`），卸载会重置。建议两页都保持挂载、用 `hidden`/样式切换显示；归档页每次**激活时**重新拉取列表。 |
| 列表 | 新增 `ArchivePage`、`ArchiveList`、`useArchive` | 展示姓名、手机号、邮箱、求职意向岗位、保存时间（倒序由后端保证）；空状态"暂无记录"；加载中/失败/重试沿用 `ErrorAlert`。**手机号/邮箱为敏感信息**：仅渲染，不进日志、不进 title/URL。不做搜索（PRD）。 |
| 详情 | 新增 `ArchiveDetail` | 点击某条 → 主从布局或 `Drawer` 展示完整信息，按 9 个分类（`SectionConfig` 已有分区定义，可复用标题/字段配置）；未填写字段显示"未填写"；同时显示原始文件名与保存时间。 |
| 复用 `ReadOnlySection` 的前提 | `ReadOnlySection.tsx:77,85`（读 `fields[key].status`、渲染 `FieldStatusTag`）、`:8`（空值文案） | 现有 `ReadOnlySection` 需要每字段的 `status`（v1 草稿语义：未识别/待确认/已确认）。归档详情是"已确认的正式数据"，若后端返回的字段不带 status，需要一个适配（统一映射成 `confirmed` 并隐藏状态标签）或给 `ReadOnlySection` 加"不显示状态"开关。⚠️ 取决于后端详情字段形态（Q-frontend-v2-08）。同一份渲染也用于"已保存会话"的只读视图。另注意：现有空值文案是"（未提供）"（`ReadOnlySection.tsx:8`），PRD #7 要求"未填写"，需要统一/参数化。 |
| 原始文件打开/下载 | 新增文件链接组件；`ApiClient.ts:54`（`response.json()` 固定 JSON 解析，需旁路） | 文件是二进制，`request()` 只会 JSON 解析，**不能直接复用**。两种做法：A) 同源 `<a href=… target="_blank" download>`，由浏览器带 Cookie 请求（最简，不经 api 封装；但文件缺失时用户只会在新标签页看到后端错误 JSON，无法给出"原始文件暂不可用"提示）；B) 在 api 层新增 blob 请求，成功后 `URL.createObjectURL` 打开/下载，失败（文件缺失）在页面内提示"原始文件暂不可用，简历信息仍可正常查看"（PRD #7）。建议 B，且 blob URL 用完即 `revokeObjectURL`；blob 仅在内存，不属于浏览器持久存储。若后端在详情里直接返回"文件是否可用"标志，则可 A + 预先置灰按钮（Q-frontend-v2-09）。 |
| 只读 | — | 不提供编辑/删除入口（PRD #7）。 |

### 2.6 草稿恢复逻辑：从 `draft_token`/单草稿改为按会话（PRD #6，ADR-003/008）

| 现有 | 涉及 | 改法方向 |
|---|---|---|
| 启动即 `getCurrentResumeDraft()`，404 `draft_not_found` 视为空态（O-12） | `ResumeDraftApi.ts:23-35`、`useResumeSession.ts:32-50`、`SessionReducer.ts:206-214` | 该函数及"current 草稿"语义整体作废。启动改为：读会话列表（失败 → `bootstrap_failed` 重试面板，沿用）；读单个会话按会话标识。`draft_not_found` 的"空态不报错"特例不再适用：会话标识不存在（如在别处被删）是真正的"会话不存在"错误，应提示并刷新列表。 |
| 所有写操作针对"当前草稿"（PATCH `/current`、POST `/resumes` 无参） | `ResumeDraftApi.ts:11,40`、`ResumeApi.ts:9-12` | 分区 PATCH、保存、对话、应用都必须带"当前会话是哪一个"（以什么形式由契约定，见数据需求）。前端状态需新增 `activeSessionId`、会话列表、对话消息；`SessionState.draft`（`SessionReducer.ts:53`）保留为"当前会话的简历字段"，尽量少动 reducer 其余分支。 |
| `DraftResponse` 含 `draft_id`、`expires_at`，`isDraftResponse` 校验两者非空（ResponseShapes.ts:69-70） | `types/Draft.ts:15,23`、`ResponseShapes.ts:69-70` | `expires_at` 随"7 天自动清理"取消而消失，**若不改校验，后端不再返回该字段时所有响应会被判 `unknown_error`**；类型与校验需按新契约重写。 |
| `restored` 与 `NoticeKind` 的 `restored`/`draft_expired`/`maybe_saved` | `SessionReducer.ts:25,54,139`（restored）、`:293`（draft_expired 触发）、`:369-370`（maybe_saved 触发）；`NoticeBanner.tsx:9-11,30` | `restored`（"已为你恢复未完成的简历"）：v2 由用户主动选会话进入，不再需要自动恢复提示，可删；`draft_expired`（草稿 7 天失效）随 TTL 取消失去触发条件，删；`maybe_saved`（确认保存时 404）语义改为"会话不存在"，需重新定义文案与处理。 |
| `CONFIRM_SUCCEEDED` 置 `draft:null` 并清空 | `SessionReducer.ts:337-365`、`SavedResultCard.tsx:23-52` | v2 保存后会话仍在列表、转为"已保存"、可只读查看对话与简历。方向：保存成功后保留 `activeSessionId`，切到只读已保存视图并仍展示 `SavedResultCard`；"上传下一份"= 新对话。`already_saved`（ADR-004）情形：会话关联到已有记录，前端沿用"只显示该简历已保存过、不展示已有记录内容"（P-09/D-04），但与"已保存会话可看简历内容"如何一致 ⚠️ 见 Q-frontend-v2-10。 |

### 2.7 F-02：对话内容同样不得进入浏览器存储

- 现状防线：ESLint 已禁用 `localStorage`/`sessionStorage`/`indexedDB`（含 `window.xxx`，`eslint.config.js:40-41,51-52`，由 `test/EslintRules.test.ts` 守护）；`src/` 之外网络调用也被禁（F-01）。v2 的新代码（消息、建议、输入框草稿、会话列表）都落在这个规则覆盖范围内，**无需新增存储类 lint 规则**。
- v2 需额外注意的点（实现与自测须检查，不新增机制）：
  1. 文本框 `autoComplete="off"`，避免浏览器表单自动填充历史把对话文本记下来；
  2. 对话文本、模型回复、建议值**不写 `console`**（B-03 前端侧：`ApiClient.ts:22` `logFailure` 只允许 `request_id/code/status`，新增 api 函数必须走同一个 `request()`）；
  3. 不把会话名称（含姓名）、消息、简历字段写进 `document.title`、URL（含 hash/query）或 `<a download>` 文件名；
  4. 文件 blob URL 用完即回收；
  5. 输入框未发送文本、`pendingMessage` 只放 React 内存，刷新即丢（与 `editBuffer` 同样的既有取舍）；
  6. 浏览器标识 Cookie 是 HttpOnly，前端代码不读不写（沿用 v1 的 `draft_token` 做法，AGENTS.md 已写）。
- 未提交文本的丢失风险：用户输入但未发送的文字在切换会话/新对话时丢失；建议 POC 不做拦截（只对 `editBuffer` 提示），写入使用说明即可。

### 2.8 受影响的现有测试（只列清单，不写测试）

行为变化导致需要调整（共享测试夹具 `ApiMocks.ts`、`FakeBackend.ts` 是单草稿模型，先改它们会带动大部分页面测试）：

| 测试文件 | 原因 |
|---|---|
| `test/ApiMocks.ts`、`test/FakeBackend.ts` | 单草稿 `/current` 行为、`expires_at`、"保存后草稿删除→再确认 404（C-11）"都要换成会话模型 |
| `hooks/model/SessionReducer.test.ts`（479 行） | 状态结构、BOOTSTRAP、NEW_CHAT、overwrite、CONFIRM_SUCCEEDED 等分支改变 |
| `api/ResumeDraftApi.test.ts`、`api/ResumeApi.test.ts`、`api/ResponseShapes.test.ts`、`api/ApiClient.test.ts` | 端点、`expires_at` 校验、方法集合（DELETE）、空正文/二进制响应 |
| `types/Contract.test.ts`、`types/ContractDrift.test.ts` | 断言 OpenAPI `0.1.1` 与字段镜像，契约升级到 0.2.0 后需随之更新 |
| `pages/ResumeCollectionPage.test.tsx`、`.integration`、`.upload`、`.final`、`.review`、`.a11y`、`.newchat`、`.edit`、`.items` | 均经 `stubFetch`/`FakeBackend` 驱动页面，启动流程（先拉列表）、上传覆盖对话框、新对话、保存后行为变化；`newchat` 基本需重写 |
| `components/ComposerBar.test.tsx` | 第 10 行断言"no text box（ADR-006）"，v2 有文本框 |
| `components/AppShell.test.tsx`、`AppShell.responsive.test.tsx`、`Layout.responsive.test.ts` | 侧栏现在只含"新对话"，v2 含列表/导航；窄屏折叠规则改变 |
| `components/NoticeBanner.test.tsx` | `restored`/`draft_expired` 若删除 |
| `components/SavedResultCard.test.tsx` | 保存后保留会话/只读语义若调整 |
| `App.test.tsx` | 增加导航外壳后渲染结构变化 |
| `hooks/useChatScroll.test.ts` | 若增加消息/建议焦点键 |

不受影响（预期）：`FieldRules`、`SectionConfig`、`SectionView`、`UploadPrecheck` 的 model 测试；`SectionCard*`、`FieldRow`、`ObjectListEditor`、`StringListEditor`、`ReadOnlySection`（除空值文案/状态开关调整外）、`ConfirmDialog`、`ErrorAlert`、`ErrorBoundary`、`FileCard`、`QuickReplyChips`（其"不含文本框"断言只针对芯片组件，仍成立）等组件测试；`EslintRules.test.ts`、`ViteConfig.test.ts`。

---

## 3. 模块变更汇总

| 类别 | 数量 | 内容 |
|---|:---:|---|
| 新增 | 9 | `MessageBubble`、`SuggestionCard`、`SessionList`（含删除入口）、`ArchivePage`、`ArchiveList`、`ArchiveDetail`、原始文件打开/下载小组件、`useSessionList`/`useArchive` hooks、会话/对话/归档 API 模块及对应 `types`（按一组计） |
| 修改 | 15 | `ComposerBar.tsx:25-90`、`AppShell.tsx:19-41`、`ResumeCollectionPage.tsx:51-232`、`SessionReducer.ts:24-27,53-64,117-142,175-184,203-409`、`useResumeSession.ts:32-50,75,98,130,161,181-198`、`ApiClient.ts:12,50-69`（DELETE、空正文、二进制/超时）、`ResumeDraftApi.ts:11,23-40`、`ResumeApi.ts:9-12`（均改为按会话）、`ResponseShapes.ts:69-70`、`types/Draft.ts:15,23`、`NoticeBanner.tsx:9-11,30`、`SavedResultCard.tsx:23-52`、`useChatScroll.ts:14-18`（新增焦点键）、`App.tsx:26`（导航）、`ReadOnlySection.tsx:8,77,85`（状态开关/空值文案） |
| 不变 | 22 | `FieldRules`、`SectionConfig`、`SectionView`、`UploadPrecheck`、`SectionCard`、`FieldRow`、`ObjectListEditor`、`StringListEditor`、`FieldStatusTag`、`FileCard`、`FinalReviewCard`、`ReviewSummary`、`QuickReplyChips`、`ConfirmDialog`、`ErrorAlert`、`ErrorBoundary`、`UploadProgressNotice`、`WelcomePanel`、`BootstrapErrorPanel`、`usePreventFileDropNavigation`、`useStableKeys`、`useNarrowScreen`（另 `ChatThread`、`NewChatButton` 仅随调用方变化，组件本身不改；构建/lint 配置不变） |

## 4. 架构约束命中

| 约束 | 命中点 | 处理建议 |
|---|---|---|
| F-01 前端不持有凭证、不直连外部服务 | 对话、会话、归档、文件下载 | 全部经 `api` 层（`request()`），页面/组件/hook 内不出现 `fetch`（ESLint 已强制）；文件下载若用 `<a href>` 属同源浏览器导航，不是 fetch，但要核对 lint 规则不拦截 |
| F-02 浏览器不保存敏感数据 | 对话文本、建议值、会话列表、blob | 见 2.7；仅内存；不新增存储 API |
| F-03 确认前不显示已保存 | 对话中"确认提交"、建议应用 | 见 2.3；仅 `createResume()` 通过形状校验后才显示"已保存" |
| B-03（前端侧）不泄露敏感信息 | 新增 api 调用、错误展示 | 沿用 `ApiClient.ts:22` `logFailure` 只记 `request_id/code/status`；界面只展示后端 `message` |
| AGENTS.md 红线"输入区不含自由文本框，不解析自由文本（ADR-006）" | `ComposerBar.tsx:25` | 与 ADR-007 冲突；"不解析自由文本"在前端仍成立（理解在 backend/模型），"不含文本框"需修订 |
| AGENTS.md "单页应用，不引入路由库" | 归档页导航 | 建议遵守（用 `useState` 切换）；若 DL 要路由须先批准依赖并改 AGENTS.md |

## 5. 技术风险

| 风险 | 严重性 | 说明 |
|---|:---:|---|
| 单草稿 → 多会话是 reducer 与 api 层的结构性改动 | 中 | 状态机 409 行、测试 479 行，且所有页面测试依赖单草稿夹具；先改夹具再改 reducer，按会话"当前会话"收敛改动面 |
| 对话与分区距离远（应用后改动不在视野） | 中 | 见 2.2；设计阶段定布局，必要时给被改分区加焦点键 |
| 对话重试可能造成重复消息 | 中 | 超时/断网时服务端可能已记录该消息；前端无法区分，需契约层给幂等手段（Q-frontend-v2-03） |
| 模型同步时延 | 中 | 无后端实测前超时值不可定（HLD §8 假设）；超时后用户需明确提示 |
| 建议"原值"过期（手工编辑后再应用） | 低 | Q-frontend-v2-05 |
| 导航切换导致状态丢失 | 低 | 两页保持挂载 |
| 窄屏下历史列表可达性 | 低 | Drawer |
| 无深链接/后退键 | 低 | POC 接受 |

## 6. 对 requirements 的建议补充

- PRD #6：列表需要后端给"名称"，前端不应自行拼接"简历 · 姓名"（避免姓名更新后不一致）——建议在 requirements 里写明名称由后端提供。
- PRD #3/#5：补充"消息发送中不可切换/删除会话、不可再发送"的口径（前端按 busy 禁用即可）；建议 PRD 或 requirements 明确。
- PRD #6："已保存会话只读"与"已归档简历仍可查看"是两个入口读同一份简历，建议 requirements 注明两处展示的字段与顺序保持一致。
- PRD #7："未填写的字段显示为未填写"与 v1 的"（未提供）"文案不一致，建议统一一个。
- 未提交的输入框文本不保留（F-02 决定），建议在 requirements 说明，避免被当成缺陷。
- 窄屏（<860px）下历史列表与归档入口的呈现，v1 的 TD-13 只覆盖"新对话"按钮，建议补充。

## 7. 对后端接口的数据/动作需求清单（供契约审视，不含路径与字段名）

1. **会话列表**：当前浏览器的全部会话；每项需要会话标识、会话名称（后端按"简历 · 姓名/未命名简历"生成）、状态（校对中/已保存）、最近活动时间；按最近活动倒序。
2. **读取单个会话**：简历字段（含每字段状态，沿用 v1 语义）、原始文件信息、对话记录（用户/助手消息按时间序，含每条的时间）、会话状态；已保存会话的简历内容来自正式库。
3. **创建会话（上传）**：上传文件同步解析并返回新会话（含会话标识）；上传成功即进入列表。
4. **删除会话**：按会话标识删除；需明确成功响应形态（有无正文）与"已不存在"的处理。
5. **发送对话消息**：入参为当前会话与文本；返回助手回复文本、若有则修改建议（每项：字段标识、原值、新值、是否可应用、不可应用原因）、以及是否需要前端"展示待保存信息"的信号（见 Q-04）；失败有可展示的 `message`。
6. **应用建议 / 取消建议**：各为一个动作；应用后返回更新后的简历字段（或明确要求前端重新读取）；建议需有可持久的状态（待处理/已应用/已取消）供会话重开时展示。
7. **按会话的分区 PATCH 与最终保存**：分区更新、`confirmed` 保存都需要定位到会话；保存成功响应保留 `already_saved`、`saved_at` 语义，并说明保存后会话状态变化。
8. **已归档简历列表**：姓名、手机号、邮箱、求职意向岗位、保存时间；倒序；是否分页。
9. **已归档简历详情**：完整字段（说明是否带字段状态）、原始文件名与类型、保存时间、原始文件是否可用的标志。
10. **原始文件获取**：二进制响应；需说明响应头（类型、附件名）与文件缺失时的错误形态。
11. **其他**：对话文本长度上限、对话请求建议超时、错误码（会话不存在、消息过长、建议已失效/不可应用、文件缺失）。

## 8. 待澄清问题（回流第二轮 Q&A）

共 **10 条**。

| 编号 | 待澄清问题 | 建议回答人 | 不同答案的影响 |
|---|---|---|---|
| Q-frontend-v2-01 | ⚠️ 同一浏览器标识下的"当前会话"如何在后续请求里指明（路径/参数/Header），以及切换会话是否需要服务端记住"当前会话" | DL（跨 Workbench） | 影响 `ResumeDraftApi`/`ResumeApi` 全部改法与 reducer 的 `activeSessionId` 设计；服务端有"当前会话"概念则前端更简单但切换需要一次请求 |
| Q-frontend-v2-02 | ⚠️ 修改建议里 `原值/新值` 对列表类字段（技能、工作经历等 objectList/stringList）以什么形态给出，字段标识是否含条目下标 | DL（跨 Workbench） | 决定 `SuggestionCard` 是直接渲染文本还是需要按 `SectionConfig` 重新格式化；若是复杂结构，卡片实现量显著增加 |
| Q-frontend-v2-03 | ⚠️ 对话请求超时时长（现有默认 30s，上传 75s）；失败/超时后重试是否会重复入库同一条消息，后端是否提供幂等手段（如客户端消息标识）或重试前可先重读会话判断 | DL（跨 Workbench） | 无幂等则前端只能"重试前先重读会话核对"，多一次请求与一类状态；有则重试直接重发 |
| Q-frontend-v2-04 | ⚠️ 对话中"确认提交"：后端回复是否带明确的"展示待保存信息"信号，还是仅文本回复、由用户点现有"其余都没问题"进入 | BA / DL | 有信号：前端自动切到 `FinalReviewCard`；无信号：不改前端，只是回复文本引导用户点芯片 |
| Q-frontend-v2-05 | ⚠️ 建议生成后字段被手工修改（原值已变），应用时由谁拦：后端校验原值并返回错误，还是前端比较提示 | DL（跨 Workbench） | 后端拦 → 前端只展示错误；前端拦 → 需要每次渲染卡片时比对当前值，逻辑与实现量更多 |
| Q-frontend-v2-06 | ⚠️ 在"校对中"会话里再次点上传：是新建会话并切过去（旧会话保留），还是在当前会话内替换文件 | BA | 前者无需覆盖确认、实现最简；后者要后端提供"替换文件"且 `overwrite` 对话框保留 |
| Q-frontend-v2-07 | ⚠️ 页面打开默认展示：空态+列表（建议）还是自动打开最近的"校对中"会话 | BA / DL | 前者启动只拉列表；后者启动先拉列表再拉会话，多一种启动失败态；体验上更接近 v1 的"恢复" |
| Q-frontend-v2-08 | ⚠️ 已归档简历详情的字段形态：是否沿用草稿的"值+状态"结构，还是只有值 | DL（跨 Workbench） | 沿用则直接复用 `ReadOnlySection`；仅值则需要适配或新写只读渲染 |
| Q-frontend-v2-09 | ⚠️ 原始文件缺失时后端如何表达：详情里的可用标志，还是打开文件时才返回错误 | DL（跨 Workbench） | 有标志可预置灰按钮并用 `<a>` 链接；无标志需前端用 blob 请求并在页面内处理错误（实现略多） |
| Q-frontend-v2-10 | ⚠️ 保存时 `already_saved`（同一人已保存过）后，该会话进入"已保存"并能只读看到简历内容，与 v1 "不展示已有记录内容"（P-09/D-04）是否冲突 | BA | 若允许展示：已保存视图统一，实现简单；若仍不展示：该情形的会话需要特例视图 |

## 9. 仓库约定（AGENTS.md）后续需修订的位置（本任务不改）

`codes/hr-collection-agent-frontend/AGENTS.md`（由 DL 确认后更新）：目录结构与 `components`/`hooks`/`api` 清单、"契约来源 OpenAPI 0.1.1"、"请求"一节中 `draft_token`/`/current` 的描述、"错误处理"里 `draft_not_found` 空态特例（O-12）、红线"输入区不含自由文本框"（ADR-006→ADR-007）、红线"`already_saved=true` 时只显示……"（视 Q-10）、待确认清单新增归档导航与对话超时项。

---

## 10. 验证回路自检

> 行号均相对 `codes/hr-collection-agent-frontend/src/`（`eslint.config.js` 相对仓库根）。

| # | 检查项 | 结论 | 说明 |
|---|---|---|---|
| 1 | 来源检查（每条"修改"有 `文件:行号`） | 通过 | 第 1、2、3 节的修改项均已带行号；v1 现状表中无法给单行的"整文件新增"项（新增组件）按新文件处理，不属于"修改"。已核对的行号来自本次对源码的 grep。 |
| 2 | 约束覆盖（`architectural_constraints.md`） | 通过 | 第 4 节覆盖 F-01/F-02/F-03/B-03 前端侧，并标出与 AGENTS.md 红线、"不引入路由库"的冲突点。未命中 B-01/B-02/B-04/B-05/B-06（后端约束，前端无对应代码）。 |
| 3 | 推断检查（无法确认处标 ⚠️） | 通过 | 依赖后端契约/业务口径的 10 项统一落在第 8 节 Q-frontend-v2-01..10；文中 ⚠️ 项（超时值、`原值`过期、列表类形态、详情字段状态、文件缺失表达等），均指向对应 Q 编号或"设计阶段"，无未标注的推断结论。 |
| 4 | 方案可行性追踪（改法能产生预期结果） | 有缺口 | ① 已追踪并确认：`request()` 对非 JSON 正文一律判 `unknown_error`（`ApiClient.ts:54-60,69`），故删除（可能无正文）与文件下载必须改 api 层；`isDraftResponse` 强制 `expires_at`（`ResponseShapes.ts:70`），契约去掉该字段后会全部失败；`epoch` 丢弃过期结果的机制（`SessionReducer.ts:117-124,206`）可复用于会话切换。② 缺口：未追踪"`ReadOnlySection` 适配 `confirmed` 状态可行"——依赖归档详情字段形态（Q-08）；"`<a href>` 同源下载是否被 ESLint 拦截"仅凭规则文件判断（`eslint.config.js:46-53` 禁的是 fetch/XHR 等），未实际运行验证；blob 路径的浏览器行为未验证。 |
| 5 | 新分支/新路径键唯一性 | 不适用 / 部分检查 | v2 在 reducer 并行结构里新增的是 `Busy`（`SessionReducer.ts:24`）、`DialogKind`（`:27`）、`ErrorScope`（`:26`）、`NoticeKind`（`:25`）的取值与 `focusKeyOf` 的焦点键（`useChatScroll.ts:14-18`）。现有同级取值互不重叠（Busy: upload/patch/confirm；Dialog: overwrite/new_chat/unconfirmed/unsubmitted_edits；焦点键: saved/final/section:*），建议新增 `chat/apply/delete`、`switch_session`、`message:*`/`suggestion:*` 与之不重复，已核对。无路由/分支键冲突问题；导航用 `useState`，不涉及路由键。 |
| 6 | 共享逻辑完整性（同一逻辑所有出现位置） | 有缺口 | 已搜索：`overwriteAcknowledged`/`needs_overwrite` 共 7 处（`SessionReducer.ts:64,110,122,142,175,184,223`）及 `useResumeSession.ts:98`、页面对话框 `ResumeCollectionPage.tsx:192`，已在 2.4 列全；`draft_expired`/`restored`/`maybe_saved` 触发点在 `SessionReducer.ts:139,293,369-370` 已列。缺口：① 对 `*.test.*` 中引用这些符号的位置只按文件级列出（2.8），未逐行；② `state.draft` 在 `ResumeCollectionPage.tsx` 内引用点较多（`:99,102,105,112,125,155` 等），本文只说"随会话改"，未逐一核对每处是否需要改；③ 未搜索 `scripts/drill_resume.py`、`scripts/selftest_resume.py` 是否依赖单草稿端点（仓库内有这两个脚本，可能需随契约更新）。以上三项留技术设计阶段补。 |

**汇总**：通过 3 项；不适用/部分 1 项；有缺口 2 项（第 4、6 项）。
