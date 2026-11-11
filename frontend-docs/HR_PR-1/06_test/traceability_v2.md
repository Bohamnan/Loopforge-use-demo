# HR_PR-1 v2 前端设计追溯：54 条验收标准 → 测试

| 项 | 内容 |
|---|---|
| 依据 | `04_design/design.md` v2.0 §8（REQ-FE-01..09，54 条） |
| 任务 | 3.1 主流程、红线确定性测试与追溯核对 |
| 代码 | `codes/hr-collection-agent-frontend/src`（路径相对该目录） |
| 结论 | 54/54 有对应测试；无未覆盖项 |

测试引用写法：`文件 · 用例名（关键词）`。文件名省略 `src/` 前缀。`ResumeCollectionPage.*.test.tsx` 简写为 `page.<后缀>`。

## REQ-FE-01 上传

| 验收标准 | 设计产物 | 对应测试 |
|---|---|---|
| 01.1 只允许选择单个 PDF/JPG/JPEG/PNG | ComposerBar、UploadPrecheck | `components/ComposerBar.test.tsx` · 「has an upload button, a single-file input limited to the allowed types」；`hooks/model/UploadPrecheck.test.ts` |
| 01.2 类型 / 大小上传前拦截，backend 为准 | UploadPrecheck、ErrorAlert | `hooks/model/UploadPrecheck.test.ts`；`page.upload` · 「a failed upload leaves the reviewed session on screen」 |
| 01.3 单一加载提示并禁止重复提交 | UploadProgressNotice、busy=upload | `page.upload` · 「shows one loading notice, disables the inputs and ignores a second file while uploading」 |
| 01.4 上传 75 秒超时提示重新上传 | ApiClient（75s）、client_timeout | `page.upload` · 「times out after 75 seconds with the re-upload hint」；`api/ApiClient.test.ts` · 「honours a custom 75s timeout」 |
| 01.5 上传即新建会话，不弹覆盖确认 | SessionApi.createSession、enterSession | `page.upload` · 「a second upload opens another session and does not overwrite the first」；`hooks/model/SessionReducer.test.ts` · 「B. upload creates a new session」 |
| 01.6 上传错误只展示 message，不记文件名 | ErrorAlert、ApiClient 日志约束 | `page.upload` · 「never logs the file name on failure」；`api/ApiClient.test.ts` · 「logs only request_id, code and status」 |

## REQ-FE-02 识别结果展示

| 验收标准 | 设计产物 | 对应测试 |
|---|---|---|
| 02.1 按全部分类展示（经历多条） | SectionConfig、SectionCard、ObjectListEditor | `page.review` · 「shows all 11 sections and all 22 fields after opening a session」；`hooks/model/SectionConfig.test.ts` · 「has 11 sections in the designed order」 |
| 02.2 四种字段状态文案 | FieldStatusTag、ReviewSummary | `page.review` · 「shows the four statuses with the designed wording」；`components/FieldStatusTag.test.tsx` |
| 02.3 不把 recognized 当已确认 | §4.1 数据流、FieldStatusTag | `page.review` · 「does not show recognized as confirmed」；`components/FinalReviewCard.test.tsx` · 「never presents a recognized field as confirmed」 |
| 02.4 非核心字段可空，仅三项为保存门槛 | FieldRules.validateCore、coreReady | `hooks/model/FieldRules.test.ts` · 「core field validation」；`page.edit` · 「guides the user to fill a missing core field」 |

## REQ-FE-03 分区核对

| 验收标准 | 设计产物 | 对应测试 |
|---|---|---|
| 03.1 分区整区核对，突出 missing / uncertain | SectionCard、ReviewSummary | `page.review` · 「opens the first section that needs attention」「opens the first uncertain section when nothing is missing」 |
| 03.2 结构化字段编辑提交，以 backend 返回更新界面 | confirmSection、SessionApi.updateSessionFields | `page.edit` · 「sends only the fields of the active section ... moves on with the backend result」；`hooks/model/SessionReducer.test.ts` · 「C. section editing」 |
| 03.3 多条子项新增 / 修改 / 删除 | ObjectListEditor、StringListEditor | `page.items` · 「adds, edits and deletes items and submits the complete new list」；`page.edit` · 「adds, edits and deletes items and submits the whole new list」 |
| 03.4 核心三项缺失引导补充 | SectionCard、validateCore | `page.edit` · 「guides the user to fill a missing core field and blocks confirmation until it is valid」 |
| 03.5 手机号 / 邮箱即时格式提示 | FieldRules、TD-07 | `page.edit` · 「flags a badly formatted phone or email right after the user leaves the field」；`hooks/model/FieldRules.test.ts` · 「phone (G-02)」「email (G-01)」 |
| 03.6 details 字段级错误在字段旁展示 | fieldErrors、reasonText、FieldRow | `page.edit` · 「shows 422 details next to the field with the reason text」；`page.items` · 「shows backend 422 details at the item they point to」 |

## REQ-FE-04 最终确认与保存结果

| 验收标准 | 设计产物 | 对应测试 |
|---|---|---|
| 04.1 独立"最终确认"，核心三项就绪才可点 | FinalReviewCard、coreReady | `page.final` · 「keeps "确认提交" disabled with a reason while a core field is not confirmed」；`components/FinalReviewCard.test.tsx` · 「disables 确认提交 and says why」 |
| 04.2 有未确认字段先提示，继续即确认当前全部 | ConfirmDialog(unconfirmed) | `page.final` · 「asks first when fields are unconfirmed; cancel sends nothing, continue sends once」；`page.integration` · 主流程 |
| 04.3 成功前不显示"已保存"，无乐观更新（F-03） | SavedResultCard 仅 phase=saved、Verify | `page.final` · 「saves with exactly {confirmed: true}, once per click, then shows the saved card from the re-read session」；`page.integration` · 主流程（保存前无结果） |
| 04.4 成功显示"已保存"，会话转只读已保存视图 | SavedSessionView、SavedResultCard(saved) | `components/SavedResultCard.test.tsx` · 「shows 已保存 with exactly the name, the original file name and the saved time」；`components/SavedSessionView.test.tsx` · 「saved/none」；`page.integration` · 主流程 |
| 04.5 already_saved：显示"该简历已保存过"，只读展示已有记录，提供"按本次内容更新" | SavedSessionView、SavedResultCard(already_saved) | `components/SavedSessionView.test.tsx` · 「saved/pending: 该简历已保存过 ... never 已保存」；`components/SavedResultCard.test.tsx` · 「for an already saved resume shows only the sentence」；`page.integration` · 主流程（第二次保存） |
| 04.6 超时 / 网络失败 / 409 后先重读会话再按状态渲染（F-03） | Verify.decideAfterConfirmRead、TD-19 | `page.final` · 「the save took effect but the answer was lost: the re-read finds it saved」「saved but the re-read failed」；`hooks/model/Verify.test.ts` · 「decideAfter*Read」 |
| 04.7 会话不存在提示并回空态、刷新列表 | SESSION_GONE、NoticeBanner | `page.edit` · 「returns to the empty state with 该会话已不存在」；`page.sessions` · 「a session that no longer exists returns to the empty view with a notice」 |
| 04.8 确认请求期间防重复点击 | busy=confirm、按钮 loading | `components/FinalReviewCard.test.tsx` · 「locks both buttons while the request is in flight」；`page.final` · 「saves ... once per click」 |
| 04.9 对话"确认提交"只回复文本，不触发保存 | ConversationApi.sendMessage、无动作字段 | `page.chat` · 「F-03: chatting 确认提交 only shows the reply; no save or update request is made」；`page.integration` · 主流程（session 2 不发 POST / PUT） |
| 04.10 已保存会话不显示最终确认入口；被拒时只展示 message | SavedSessionView（无 FinalReviewCard）、session_read_only | `page.saved` · 「shows the record and a read-only conversation: no apply / cancel, chat closed」；`components/FinalReviewCard.test.tsx` · 「shows the backend message for backend errors」 |

## REQ-FE-05 会话列表与切换

| 验收标准 | 设计产物 | 对应测试 |
|---|---|---|
| 05.1 页面打开读列表并显示空态，不自动打开会话；前端不读 Cookie | useSessionList、初始 empty | `page.sessions` · 「lists sessions with status words and does not open any of them」；`page.chat` · 「is closed before an upload with a hint」 |
| 05.2 列表展示名称 / 状态 / 最近活动，顺序以 backend 为准；窄屏可达 | SessionList、AppShell（Drawer） | `page.sessions` · 「reaches the session list through the 会话 drawer」；`components/AppShell.responsive.test.tsx` · 「below 860px the side bar folds away」 |
| 05.3 选择会话：校对中可继续；已保存只读展示 | openSession、enterSession | `page.sessions` · 「opens a reviewing and then a saved session without side effects on each other」；`page.saved` |
| 05.4 切换 / 新建对话且有未提交编辑先提示 | leave 对话框 | `page.sessions` · 「with unsubmitted edits asks first: cancel keeps the view, continue opens the other session」；`page.newchat` · 「with unsubmitted edits asks first」 |
| 05.5 删除二次确认，成功移除；删除当前会话回空态 | ConfirmDialog(delete)、SessionApi.deleteSession | `page.sessions` · 「reviewing: confirmation says information and file are deleted」「saved: confirmation says only the chat record is deleted」；`page.integration` · 删除步骤 |
| 05.6 上传 / 对话 / 应用 / 保存 / 更新 / 删除后重读列表 | onActivity、useSessionList.reload | `page.sessions` · 「a failed list load only shows an error in the list area; retry recovers; upload still works」（上传后列表计数增加）；`page.chat` · 「sends the text, shows both bubbles, ... and refreshes the list」 |

## REQ-FE-06 边界与非功能

| 验收标准 | 设计产物 | 对应测试 |
|---|---|---|
| 06.1 仅经 api 封装调用，无凭证，不直连 | 四个 api 模块、ApiClient；ESLint `no-restricted-globals` | `test/EslintRules.test.ts` · 「forbids window.fetch in components」「allows fetch inside src/api」；`api/*.test.ts` |
| 06.2 不用浏览器存储；文本框关闭自动填充；blob 用后回收 | TD-02/03/20/27、saveBlob | `test/EslintRules.test.ts` · 「still forbids browser storage everywhere」；`page.chat` · 「F-02: the text box is not remembered by the browser」；`page.integration` · F-02 哨兵断言 |
| 06.3 日志不输出内容；标题、URL、下载名不含姓名；通用文件名 | §7.2、no-console、logFailure | `api/ApiClient.test.ts` · 「logs only request_id, code and status on failure」；`page.chat` · 「B-03」；`page.integration` · B-03 哨兵断言 |
| 06.4 错误统一解析 `{code, message, request_id}` + details | ApiError、ApiClient | `api/ApiError.test.ts`；`api/ApiClient.test.ts` · 「parses a backend error body into ApiError with details」 |
| 06.5 types 与 api 与冻结 OpenAPI 0.2.0 对齐 | src/types 头部 0.2.0 | `types/Contract.test.ts` · 「declares the contract version」「has the 19 backend error codes」；`types/ContractDrift.test.ts` |
| 06.6 Vitest + RTL + ESLint，合成数据 | §9 | `npm test`、`npm run lint`（三条自定义规则）；合成数据见 `test/ApiMocks.ts`、`test/FakeBackend.ts` |

## REQ-FE-07 对话与修改建议

| 验收标准 | 设计产物 | 对应测试 |
|---|---|---|
| 07.1 校对中提供文本输入与发送（Enter / Shift+Enter、IME、≤2000）；未上传 / 已保存禁用 | ComposerBar（TD-20） | `components/ComposerBar.test.tsx` · 「chat input (REQ-FE-07.1)」；`page.chat` · 「sends the text, shows both bubbles」「is closed before an upload with a hint」 |
| 07.2 发送中"思考中"，禁用上传 / 分区编辑 / 切换 / 再发 | ThinkingNotice、busy=chat | `page.chat` · 「shows 思考中 while waiting and ignores a second send meanwhile」；`page.a11y` · 「思考中 is announced politely」 |
| 07.3 对话 75s；失败保留原文可重试；重试前先重读核对 | CHAT_TIMEOUT_MS、pendingMessage、Verify.matchSentMessage | `api/ConversationApi.test.ts` · 「maps chat_failed and times out after 75s」；`page.chat` · 「chat_failed keeps the text」「the lost request had reached the server」「the lost request never arrived」；`hooks/model/Verify.test.ts` · 「matchSentMessage」 |
| 07.4 建议卡片逐项展示字段 / 原值 / 新值；应用 / 取消；不可应用显示原因 | SuggestionCard、ChangeRows | `components/SuggestionCard.test.tsx` · 「shows label, old and new value for a pending row」；`page.suggest` · 「cancel marks the card cancelled」 |
| 07.5 应用后按 backend 结果更新分区，卡片显示"已应用"，清除同字段未提交编辑 | §5.3-D、TD-03/21 | `page.suggest` · 「apply replaces the fields, does not jump, drops the edit of that field」；`hooks/model/SessionReducer.test.ts` · 「D. chat and suggestions」 |
| 07.6 不解析用户文本意图；建议状态以 backend 为准 | cardStatus、TD-01/21 | `hooks/model/Verify.test.ts` · 「cardStatus summarises the four card states」；`page.suggest` · 「suggestion_unavailable shows the message inside the card and refreshes it」 |
| 07.7 分区就地编辑保留，与对话修改作用于同一份信息 | draft.fields 唯一权威 | `page.suggest` · 「drops the edit of that field」；`page.edit` · 「shows an edit as 未提交修改」 |

## REQ-FE-08 已归档简历

| 验收标准 | 设计产物 | 对应测试 |
|---|---|---|
| 08.1 对话 / 已归档简历切换，不引入路由库，切换不丢状态 | App、AppShell.nav、TD-25 | `App.test.tsx` · 「switches views with the navigation」「keeps both pages mounted」；`page.integration` · 主流程（归档步骤） |
| 08.2 进入归档页重读列表；展示姓名 / 手机 / 邮箱 / 岗位 / 保存时间；暂无记录 | ArchivePage、useArchive、ArchiveList | `pages/ArchivePage.test.tsx` · 「lists name, phone, email and job intention, never the record id」「shows 暂无记录」；`App.test.tsx` · 「the archive is only requested when it is opened」 |
| 08.3 详情按分类只读（不显示状态，"未填写"）+ 文件名、保存时间 | ArchiveDetail、ReadOnlySection(showStatus=false) | `pages/ArchivePage.test.tsx` · 「opens the detail read-only with file name and saved time; empty values as 未填写」；`components/ReadOnlySection.test.tsx` · 「showStatus=false hides status tags」 |
| 08.4 经 api 层取二进制并下载；不可用时页面内提示 | ArchiveApi.downloadResumeFile、saveBlob、TD-27 | `pages/ArchivePage.test.tsx` · 「downloads with a generic file name and releases the object URL」「disables the button with a hint when the file is not available」；`api/ArchiveApi.test.ts` · 「downloads the file as a Blob and maps file_not_available」 |

## REQ-FE-09 已保存过后的确认更新

| 验收标准 | 设计产物 | 对应测试 |
|---|---|---|
| 09.1 存在更新候选时对话流提供快捷回复"按本次内容更新"；不开放自由文本 | QuickReplyChips（saved 相） | `page.update` · 「opens from the quick reply without any request」；`page.integration` · 主流程（差异步骤） |
| 09.2 逐字段比较并展示差异卡片（"将清空"必列、文件新旧名、相同字段只给数量） | UpdateDiff.buildUpdateDiff、UpdateDiffCard | `hooks/model/UpdateDiff.test.ts` · 「always lists a field the candidate clears ... (red line)」「reports a file-only difference」；`page.update` · 「lists the cleared field as 将被清空」 |
| 09.3 卡片提供"确认更新 / 取消"，只有点击才发请求，防重复点击 | ResumeApi.updateResume、busy=update | `page.update` · 「sends exactly {confirm_update: true} once per click」「cancel closes the card」；`api/ResumeApi.test.ts` · 「updateResume puts the constant body」；`page.integration` · 主流程（只 1 次 PUT） |
| 09.4 仅 PUT 2xx 且形状通过，或核对读到 applied 才显示"已更新"；失败保留卡片；未知结果引导核对（F-03） | Verify.decideAfterUpdateRead、isUpdateResumeResponse | `page.update` · 「save_failed: no 已更新」「a 2xx answer of the wrong shape is not 已更新」；`hooks/model/Verify.test.ts` · 「update: applied / pending / other」；`api/ResumeApi.test.ts` · 「rejects a wrong 2xx shape」 |
| 09.5 取消则关闭卡片，已有内容不变 | UPDATE_DIFF_CLOSED | `page.update` · 「cancel closes the card and keeps the record unchanged」 |

## 红线点（design §9.2）

| 红线 | 确定性测试 |
|---|---|
| F-02 不保存数据到浏览器 | `page.integration` 全流程：`Storage.prototype.setItem / getItem`、`indexedDB.open`、`document.cookie` setter 调用次数为 0；下载后 `URL.revokeObjectURL` 被调用；`test/EslintRules.test.ts` 静态禁用 |
| F-03 已保存 / 已更新时机 | `page.final`（保存中、超时、网络失败、重读）；`page.update`（请求进行中、超时、save_failed、形状错误）；`page.chat`「确认提交」只回复；`page.integration` 端到端（已保存过时不出现"已保存"，对话文字不发 POST / PUT） |
| B-03 日志与标题不含内容 | `page.chat`（console.* / document.title / storage 哨兵断言）；`page.integration`（哨兵 `哨兵甲-用户原文-7f3a`、`哨兵乙-助手回复-9c1d`、`哨兵-简历-0001.pdf` 不出现在 console、标题；下载名为 `原始简历.pdf`） |
| 差异必列清空字段 | `hooks/model/UpdateDiff.test.ts`（红线用例）；`page.update` |
