# 变更记录 — 简历信息收集（Frontend）

> 每个任务完成后追加（feature-developer）。修改文件清单只记在这里。

## Task-1.1：工程脚手架与质量门禁

**完成时间**：2026-11-10
**实现者**：Yin Yang（frontend）

### 变更文件
| 文件路径 | 操作 | 说明 |
|---------|------|------|
| codes/hr-collection-agent-frontend/package.json、package-lock.json、.npmrc | 新增 | npm 脚本（dev/build/test/lint）、`engines.node >=24`、全部依赖精确版本、`save-exact=true`；lock 内 resolved 均指向 registry.npmjs.org，无私有 registry |
| codes/hr-collection-agent-frontend/tsconfig.json、index.html、.gitignore | 新增 | TypeScript strict；入口页；忽略 node_modules/dist/.env* |
| codes/hr-collection-agent-frontend/vite.config.ts | 新增 | `/api` → `http://127.0.0.1:8000`，timeout/proxyTimeout 120s，不改写 cookie；Vitest 配置（jsdom、setup） |
| codes/hr-collection-agent-frontend/eslint.config.js | 新增 | 禁用 localStorage/sessionStorage/indexedDB（含 window/globalThis 写法）；pages/components/hooks 禁用 fetch；no-console（仅允许 error）；`--max-warnings 0` |
| codes/hr-collection-agent-frontend/src/main.tsx | 新增 | 占位入口，任务 1.2 替换 |
| codes/hr-collection-agent-frontend/src/test/setup.ts、Smoke.test.tsx、ViteConfig.test.ts、EslintRules.test.ts | 新增 | 测试链路冒烟；代理配置断言；ESLint 红线以内存代码样例验证（永久用例，代替临时违规文件） |

### 偏差说明
- 依赖里除任务 1.1 点名的 Vite、React 18、TS、Ant Design、Vitest、RTL（user-event、jest-dom）、ESLint（TS + React Hooks）、jsdom、plugin-react 外，还包含其必需的配套包：`@testing-library/dom`（RTL 对等依赖）、`@types/react`、`@types/react-dom`、`@eslint/js`、`typescript-eslint`、`globals`。未引入状态库、路由库、请求库、MSW。
- TypeScript 取 6.0.3 而非 npm 最新 7.0.2：typescript-eslint 8.72.2 的对等依赖要求 `typescript <6.1.0`。
- 代理目标按 DL 复核使用 `127.0.0.1`。
- ESLint 红线用永久的 Vitest 用例验证（任务原写“临时违规文件”），避免入库违规文件。
- 本机 npm 全局 registry 为镜像站；安装时显式使用 `--registry=https://registry.npmjs.org/`，lock 中无镜像域名。

### 遗留风险
- `engines.node >=24` 包含 Node 25，但 jsdom 31 / vitest 5 声明支持 `^22.22.2 || ^24.15.0 || >=26`、`^22.12 || ^24 || >=26`，在 Node 25.8.2 上安装有 EBADENGINE 警告（测试可正常运行）。建议 DL 考虑将运行版本固定为 24 LTS 或 26。
- `npm audit` 报 10 项 moderate（minimatch 拒绝服务，经 eslint / typescript-eslint 传递），仅 dev 工具链，不进入产物；修复需降级 ESLint 9 属破坏性变更，暂不处理。

## Task-1.2：应用入口、主题与错误边界

**完成时间**：2026-11-10
**实现者**：Yin Yang（frontend）

### 变更文件
| 文件路径 | 操作 | 说明 |
|---------|------|------|
| codes/hr-collection-agent-frontend/src/main.tsx | 修改 | 真实入口：`StrictMode` + `createRoot` |
| codes/hr-collection-agent-frontend/src/App.tsx | 新增 | `ConfigProvider` + 原型配色主题 token（`appTheme`，TD-14）+ `ErrorBoundary`；暂以标题占位，任务 2.1 替换为 `ResumeCollectionPage` |
| codes/hr-collection-agent-frontend/src/components/ErrorBoundary.tsx | 新增 | 渲染异常兜底：通用文案 + “刷新页面”（`onReload` 可注入，便于测试）；自身只记录错误类名，不记 message / stack（B-03） |
| codes/hr-collection-agent-frontend/src/App.test.tsx、src/components/ErrorBoundary.test.tsx | 新增 | 入口渲染、主题 token、边界不泄露内容、仅记错误类名、刷新回调 |

### 偏差说明
按设计实现，无偏差。

### 遗留风险
React 在开发模式下自身会向 console 输出异常信息（含 message），这是框架行为，非本组件输出；生产构建不输出。

## Task-1.3：types（与 OpenAPI 0.1.1 同名）

**完成时间**：2026-11-10
**实现者**：Yin Yang（frontend）

### 变更文件
| 文件路径 | 操作 | 说明 |
|---------|------|------|
| codes/hr-collection-agent-frontend/src/types/ResumeModel.ts | 新增 | `FieldStatus`、`StringField` 等列表字段、`WorkExperience` / `ProjectExperience` / `Education`、`ResumeFields`（22 字段）、`ResumeFieldsUpdate`；导出 `OPENAPI_VERSION`、`FIELD_STATUSES`、`RESUME_FIELD_KEYS` |
| codes/hr-collection-agent-frontend/src/types/Draft.ts | 新增 | `OriginalFileInfo`、`DraftResponse`、`DraftUpdateRequest` |
| codes/hr-collection-agent-frontend/src/types/Resume.ts | 新增 | `CreateResumeRequest`、`CreateResumeResponse` |
| codes/hr-collection-agent-frontend/src/types/Errors.ts | 新增 | `ErrorCode`（13 值，`ERROR_CODES`）、`ErrorDetail` / `ErrorReason`（5 值，`ERROR_REASONS`）、`ErrorResponse`、前端自有 `ClientErrorCode` 与 `ApiErrorCode` |
| codes/hr-collection-agent-frontend/src/types/Contract.test.ts | 新增 | 契约镜像测试：版本、22 键及顺序、4 状态、13 业务码、5 reason；`expectTypeOf` 类型断言（随 `tsc --noEmit` 检查） |

### 偏差说明
- 为了让契约镜像测试能在运行期核对枚举，类型文件额外导出了 `as const` 常量数组（`FIELD_STATUSES`、`RESUME_FIELD_KEYS`、`ERROR_CODES`、`ERROR_REASONS`、`OPENAPI_VERSION`），类型由它们派生；设计只要求类型，属于实现细节补充。
- 经历子 schema 的字段在 OpenAPI 中均非 required，故在 TS 中全部为可选。

### 遗留风险
类型为手写镜像（F-02），契约变更时需人工同步；镜像测试覆盖键集合与枚举，不覆盖各字段的 `maxLength`（由任务 1.5 的 `FIELD_MAX_LENGTH` 测试覆盖）。

## Task-1.4：api 封装层

**完成时间**：2026-11-10
**实现者**：Yin Yang（frontend）

### 变更文件
| 文件路径 | 操作 | 说明 |
|---------|------|------|
| codes/hr-collection-agent-frontend/src/api/ApiError.ts | 新增 | `ApiError`：`status`、`code`（契约码或前端自有码）、`message`、`request_id`、`details`（仅保留 field / reason）；工厂 `fromBody` / `unknown` / `timeout` / `network`；非契约错误体统一为 `unknown_error` 且不暴露原文（DD-10） |
| codes/hr-collection-agent-frontend/src/api/ApiClient.ts | 新增 | 唯一调用 fetch 的模块：`/api/v1` 前缀、`credentials: 'same-origin'`、JSON / FormData（不手设 multipart Content-Type）、`AbortController` 超时（上传 75s、其余 30s）、区分 `client_timeout` 与 `network_error`、无自动重试；失败日志仅 `request_id` / `code` / status，`quietCodes` 可免记预期错误 |
| codes/hr-collection-agent-frontend/src/api/ResumeDraftApi.ts | 新增 | `createResumeDraft`、`getCurrentResumeDraft`（404 `draft_not_found` → `null`，不抛、不记日志，O-12）、`updateCurrentResumeDraft` |
| codes/hr-collection-agent-frontend/src/api/ResumeApi.ts | 新增 | `createResume`（请求体固定 `{confirmed: true}`） |
| codes/hr-collection-agent-frontend/src/test/ApiMocks.ts | 新增 | 测试辅助：`fetch` mock、挂起 / 超时 mock、合成 `DraftResponse`（覆盖四种字段状态与空列表）与 `CreateResumeResponse` |
| codes/hr-collection-agent-frontend/src/api/*.test.ts（4 个） | 新增 | 见验证；全部使用 mock，不依赖真实 backend |

### 偏差说明
- `ApiClient` 导出函数 `request` 而非类（设计只说“基于 fetch 的底层请求”），属实现形式选择。
- 客户端错误文案（超时 / 网络 / 未知）在 `ApiError` 中给出默认固定文案；上传超时的专用文案“识别时间过长，请重新上传”由 UI 层（任务 2.2 的 `ErrorAlert`）按场景覆盖。

### 遗留风险
无。`ApiError.request_id` 在前端自有码上为 `undefined`，UI 展示 `request_id` 时需判空。

## Task-1.5：hooks/model 纯逻辑

**完成时间**：2026-11-10
**实现者**：Yin Yang（frontend）

### 变更文件
| 文件路径 | 操作 | 说明 |
|---------|------|------|
| codes/hr-collection-agent-frontend/src/hooks/model/SectionConfig.ts | 新增 | 11 个分区、22 字段、控件类型、核心标记；三类经历子项字段配置；`getSection`、`sectionKeyOfField` |
| codes/hr-collection-agent-frontend/src/hooks/model/FieldRules.ts | 新增 | 手机号 / 邮箱 pattern 与 254 上限（OpenAPI 0.1.1）、`normalizePhone`、`FIELD_MAX_LENGTH` 与 `EXPERIENCE_ITEM_LIMIT`（design §6.1，数值全部取自 OpenAPI）、`validateScalar` / `validateCore` / `validateStringList` / `validateObjectList`、`toSubmitScalar`、`reasonText`、`parseFieldPath` |
| codes/hr-collection-agent-frontend/src/hooks/model/UploadPrecheck.ts | 新增 | 扩展名（大小写不敏感）、MIME、10485760 字节、0 字节；`pickSingleFile` 多文件取第一个并带提示文案 |
| codes/hr-collection-agent-frontend/src/hooks/model/SectionView.ts | 新增 | `sectionStatus`（missing > uncertain > recognized > confirmed）、`firstTodoSection`、`coreReady`、`statusCounts`、`unconfirmedCount`、`hasUnsubmittedEdits`、`orderedFieldKeys` |
| codes/hr-collection-agent-frontend/src/hooks/model/*.test.ts（4 个） | 新增 | 见验证 |

### 偏差说明
- `FIELD_MAX_LENGTH` 为按字段的对象表（`maxLength` / `maxItems` / `itemMaxLength`），经历区块内部上限另放 `EXPERIENCE_ITEM_LIMIT`；设计只写“上限表”，结构为实现选择，数值与 OpenAPI 0.1.1 一致。
- 手机号 `maxLength 32` 针对提交原值；前端提交的是规范化后的值，故在规范化后的值上校验长度（更宽松于对原值的校验，但与实际提交内容一致，不会导致 backend 拒绝）。
- 另导出 `orderedFieldKeys`、`statusCounts`、`pickSingleFile`、`MULTIPLE_FILES_NOTICE` 等设计 §4.3 / §6 提到的派生函数，供后续切片使用。

### 遗留风险
- `coreReady` 在核心字段存在未提交编辑时返回 false（保守策略），任务 2.6 需保证“最终确认”按钮的禁用文案能解释这一原因。
- 邮箱校验使用 `trim` 后的值；OpenAPI 对全空白在服务层按 required 拒绝，二者一致。

## Task-1.6：SessionReducer（会话状态机）

**完成时间**：2026-11-10
**实现者**：Yin Yang（frontend）

### 变更文件
| 文件路径 | 操作 | 说明 |
|---------|------|------|
| codes/hr-collection-agent-frontend/src/hooks/model/SessionReducer.ts | 新增 | 纯函数 reducer：`phase`（bootstrapping / bootstrap_failed / empty / reviewing / saved）、`view`、`busy` 互斥、`epoch` 丢弃过期响应、`editBuffer`、`fieldErrors`、`notice`、`error`、`pendingFile`、`overwriteAcknowledged`、`savedSummary`、`dialog`；实现 design §5.3 全部转移；导出 `decideUpload` 供 hook 与 reducer 共用 |
| codes/hr-collection-agent-frontend/src/hooks/model/SectionView.ts | 修改 | 新增 `buildSectionUpdate`：按 design §4.4 生成整区 PATCH 体并返回本地校验错误（任务 1.5 的纯逻辑补充，供 reducer 与后续 hook 使用） |
| codes/hr-collection-agent-frontend/src/hooks/model/SessionReducer.test.ts | 新增 | 表驱动覆盖 §5.3 转移（63 例） |
| codes/hr-collection-agent-frontend/src/hooks/model/SectionView.test.ts | 修改 | 增补 `buildSectionUpdate` 用例 |

### 偏差说明
- `buildSectionUpdate` 放在 `SectionView.ts`（tasks 1.5 的文件），因为它是设计 §4.4 的纯函数且被 reducer 校验步骤使用；设计 §3.3 未单列。
- 文本列表在校验前先丢弃空白行，因此条数 / 单项长度错误的下标指向清理后的列表；若 UI 保留空白行，需在失焦时丢弃空白行以保持下标一致（任务 2.4 注意）。
- reducer 通过动作名区分“请求发起”与“结果”；发起类动作（`FILE_SELECTED`、`SECTION_CONFIRM_REQUESTED`、`CONFIRM_REQUESTED` 等）只改状态（置 `busy`），真正调用 api 由任务 2.x 的 `useResumeSession` 根据 `busy` 的变化触发，`decideUpload` 供 hook 判定是否应发起上传。
- `PATCH_FAILED` / `CONFIRM_FAILED` 遇 `draft_not_found` 时保持 `epoch` 不变（该请求就是当前 epoch 的最后一个在途请求），其余 reset 才递增。

### 遗留风险
- `GO_FINAL_REQUESTED` 在 `view` 已是 `final` 时为幂等空操作。
- 任务 2.x 的 hook 需用“前后状态对比”（`busy` 由 null 变为 upload / patch / confirm）触发请求，并捕获当时的 `epoch` 回传；该约定已在本文件注释中说明，尚未有 hook 层测试。

## Task-2.1：页面外壳与启动 / 草稿读取

**完成时间**：2026-11-10
**实现者**：Yin Yang（frontend）

### 变更文件
| 文件路径 | 操作 | 说明 |
|---------|------|------|
| codes/hr-collection-agent-frontend/src/hooks/useResumeSession.ts | 新增 | `useReducer` 驱动会话状态机；启动时读取草稿（`bootstrap`，用 in-flight 标志保证 StrictMode 下只发一次 GET）；`retryBootstrap`、`dismissNotice`；`send(action)` 返回动作前后的状态，供后续切片在 `busy` 由 null 变为 upload / patch / confirm 时发起请求并回传 `epoch` |
| codes/hr-collection-agent-frontend/src/pages/ResumeCollectionPage.tsx | 新增 | 按 `phase` 编排：读取中 / 读取失败（可重试）/ 空态 / 已恢复（仅恢复提示，内容展示见 2.3）；不直接请求接口 |
| codes/hr-collection-agent-frontend/src/components/AppShell.tsx、NewChatButton.tsx、ChatThread.tsx、WelcomePanel.tsx、NoticeBanner.tsx、BootstrapErrorPanel.tsx | 新增 | 外壳仅含标题与“＋ 新对话”（无用户信息、历史列表、填写指南、隐私说明、示例文件按钮，P-02、P-11）；空态；四类提示文案；启动失败面板（隐藏上传入口，裁决 F-03） |
| codes/hr-collection-agent-frontend/src/components/ErrorAlert.tsx | 新增 | 错误展示：后端错误只显示 `message` + 请求编号；前端自有码用固定文案；本地错误显示 `message`；`timeoutMessage` 可覆盖超时文案（2.2 使用） |
| codes/hr-collection-agent-frontend/src/components/Layout.css | 新增 | 原型配色与基础布局（`style.css` 视觉参考） |
| codes/hr-collection-agent-frontend/src/App.tsx、App.test.tsx | 修改 | 挂载 `ResumeCollectionPage`；`ConfigProvider` 关闭按钮自动插空格（避免“重 试”） |
| codes/hr-collection-agent-frontend/src/test/setup.ts | 修改 | 补 `matchMedia` 的 jsdom polyfill（Ant Design 需要） |
| 各组件 / 页面 `*.test.tsx` | 新增 | 见验证 |

### 偏差说明
- `ErrorAlert` 在 tasks 中归 2.2，因启动失败面板（2.1）需要它，提前到 2.1 实现；2.2 直接复用。
- “读取草稿”加载提示在 2.1 用 `Spin` 内联；2.2 新增 `UploadProgressNotice` 后，页面保持这一处不变（只在上传时使用该组件）。
- “＋ 新对话”按钮本任务只渲染并按 `busy` / 启动阶段禁用，点击逻辑与确认框在 2.7；侧栏响应式折叠在 2.8。
- `reviewing` 阶段本任务只显示恢复提示，字段内容展示在 2.3。
- `useResumeSession` 用 `useEffect` 同步 `latest` 引用（`react-hooks/refs` 禁止在渲染期写 ref）。

### 遗留风险
- 在 2.7 前点击“＋ 新对话”无反应（按钮已渲染但未接线）；2.2–2.5 的联调演示需知悉。

## Task-2.2：上传简历（REQ-FE-01）

**完成时间**：2026-11-10
**实现者**：Yin Yang（frontend）

### 变更文件
| 文件路径 | 操作 | 说明 |
|---------|------|------|
| codes/hr-collection-agent-frontend/src/api/ApiClient.ts、ApiClient.test.ts | 修改 | **处理审查 SUGGEST-1**：读取响应体（`response.json()`）阶段被超时中止时抛 `client_timeout`，不再落到 `unknown_error`；补两条测试（响应头已到但 body 挂起，成功 / 错误响应各一）。计时器本就覆盖到 body 读取完成，仅分类逻辑改动 |
| codes/hr-collection-agent-frontend/src/components/ComposerBar.tsx | 新增 | 📎 上传按钮、整页拖拽（document 级 drop，忙碌时移除监听）、单选 `accept`、10 MB 提示、AI 免责文案；**无文本框**；`forwardRef` 暴露 `openPicker`；选择后重置 input 以便再次选择同一文件 |
| codes/hr-collection-agent-frontend/src/components/FileCard.tsx、UploadProgressNotice.tsx、ConfirmDialog.tsx | 新增 | 文件卡；单一加载提示（`role=status`、`aria-live=polite`，无步骤无耗时，P-05）；通用二次确认框 |
| codes/hr-collection-agent-frontend/src/hooks/useResumeSession.ts | 修改 | 增加 `requestUpload`（多文件取第一个并给出提示）、`confirmOverwrite`、`cancelOverwrite`；在 `busy` 由 null 变为 `upload` 时发起请求并回传 `epoch` |
| codes/hr-collection-agent-frontend/src/pages/ResumeCollectionPage.tsx | 修改 | 接入 `ComposerBar`、上传中的文件卡 + 加载提示、`ErrorAlert`（超时文案“识别时间过长，请重新上传。”）、覆盖确认框；欢迎页“上传简历”按钮打开选择器 |
| codes/hr-collection-agent-frontend/src/components/Layout.css | 修改 | 文件卡、输入区、加载提示样式 |
| 各组件 / 页面测试 | 新增 | `ComposerBar`、`FileCard`、`UploadProgressNotice`、`ConfirmDialog`、`ResumeCollectionPage.upload.test.tsx` |

### 偏差说明
- 审查 SUGGEST-1 按 DL 裁决在本任务处理；其余 SUGGEST 与本任务无关（SUGGEST-2 长度按码点、SUGGEST-3 契约漂移检测、SUGGEST-4 ESLint 收紧、SUGGEST-5 audit 跟踪），保留为跟踪项。
- `reviewing` 阶段此时仅显示文件卡与恢复提示，字段展示在 2.3。
- 页面测试里 Ant Design Modal 的关闭动画在 jsdom 中不会结束，测试用 `ConfigProvider` 关闭 motion；生产代码不受影响。
- 页面中同时存在欢迎页的“上传简历”按钮与输入区的“上传简历”按钮（两处入口，原型也有 📎 + 建议芯片）。

### 遗留风险
- 上传期间“新对话”按钮禁用；上传结束后点击仍无反应，待 2.7。
- 拖拽监听挂在 `document` 上，仅在 `ComposerBar` 挂载且未禁用时生效；确认框打开期间 `busy` 仍为 null，此时拖入文件会被 reducer 忽略（`dialog` 非空时 `decideUpload` 返回 ignored）。

## Task-2.3：识别结果展示与草稿恢复展示（REQ-FE-02、05.2）

**完成时间**：2026-11-10
**实现者**：Yin Yang（frontend）

### 变更文件
| 文件路径 | 操作 | 说明 |
|---------|------|------|
| codes/hr-collection-agent-frontend/src/components/FieldStatusTag.tsx | 新增 | 四种状态：待确认 / 不确定、请确认 / 待补充 / 已确认（文字 + 颜色，带 `data-status`） |
| codes/hr-collection-agent-frontend/src/components/ReadOnlySection.tsx | 新增 | 分区只读渲染：22 字段全部以 `data-field` 标注；`missing` / `uncertain` 置顶并高亮；`null` 显示“（未提供）”；手机号完整显示（P-10）；文本列表、多条经历子项逐条展示；未提交编辑覆盖显示并带“未提交修改”标记（不是第五种字段状态） |
| codes/hr-collection-agent-frontend/src/components/ReviewSummary.tsx | 新增 | 四状态计数与“需要处理”跳转芯片（仅含 missing / uncertain 的分区） |
| codes/hr-collection-agent-frontend/src/components/SectionCard.tsx | 新增 | 分区卡：标题、分区状态徽标、只读字段；非活跃分区带“修改”入口；活跃分区 `aria-current` 高亮（编辑态在 2.4） |
| codes/hr-collection-agent-frontend/src/hooks/model/SectionView.ts、SectionView.test.ts | 修改 | 新增 `currentValue`（编辑缓冲优先，含显式 null / 空列表） |
| codes/hr-collection-agent-frontend/src/hooks/useResumeSession.ts | 修改 | 新增 `selectSection` |
| codes/hr-collection-agent-frontend/src/pages/ResumeCollectionPage.tsx | 修改 | `reviewing` 时渲染文件卡、概览、11 个分区卡；`view=final`（全部已确认）时以只读卡展示、不带“修改”入口（2.6 替换为最终确认卡） |
| codes/hr-collection-agent-frontend/src/components/Layout.css | 修改 | 分区、字段行、高亮样式 |
| 各组件 / 页面测试 | 新增 | `FieldStatusTag`、`ReadOnlySection`、`ReviewSummary`、`SectionCard`、`ResumeCollectionPage.review.test.tsx` |

### 偏差说明
- 单字段且标签与分区标题相同的分区（个人优势、工作经历等 9 个）不重复渲染字段标签行，但仍带 `data-field` 属性，保证 22 字段均可定位。
- `view=final` 的临时展示（全部已确认的草稿）复用 `SectionCard`，没有“确认提交”按钮；真正的最终确认卡在 2.6。

### 遗留风险
- 多个 `role="alert"`：Ant Design `Alert` 默认带该角色，恢复提示与错误提示同屏时读屏会连续播报；2.8（无障碍）时统一评估把提示类改为 `role="status"`。

## Task-2.4：分区核对 — 标量与文本列表编辑（REQ-FE-03）

**完成时间**：2026-11-10
**实现者**：Yin Yang（frontend）

### 变更文件
| 文件路径 | 操作 | 说明 |
|---------|------|------|
| codes/hr-collection-agent-frontend/src/components/FieldRow.tsx | 新增 | 标量字段就地编辑：受控输入（无 `maxLength` 属性，不静默截断）、核心必填空值立即提示、格式 / 过长在失焦后提示、后端字段级错误（只显示 reason 文案，不回显值）、“未提交修改”标记（不改变状态标签） |
| codes/hr-collection-agent-frontend/src/components/StringListEditor.tsx | 新增 | 文本列表新增 / 修改 / 删除；**失焦时丢弃空白行**；达到 50 项禁用新增；整表错误与单项错误；新增行自动聚焦 |
| codes/hr-collection-agent-frontend/src/components/QuickReplyChips.tsx | 新增 | 快捷指令芯片（“确认无误”“其余都没问题”），与卡片按钮等价，不接收自由文本 |
| codes/hr-collection-agent-frontend/src/components/SectionCard.tsx | 修改 | 活跃分区进入编辑态：缺失 / 不确定字段置顶；“确认本区 / 确认修改 / 已确认”按钮；核心字段不合法时禁用并说明；“空项将按留空确认”提示；分区级错误可重试；经历类字段暂以只读显示（编辑在 2.5） |
| codes/hr-collection-agent-frontend/src/components/ComposerBar.tsx | 修改 | 增加 `quickReplies` 插槽 |
| codes/hr-collection-agent-frontend/src/hooks/model/SectionView.ts、SectionView.test.ts | 修改 | 新增 `sectionConfirmBlock`（核心三项缺失 / 非法时不可确认） |
| codes/hr-collection-agent-frontend/src/hooks/useResumeSession.ts | 修改 | 新增 `editField`、`confirmSection`（`busy` 由 null→patch 时用 `buildSectionUpdate` 生成整区请求体并回传 `epoch`）、`goFinal`、`discardEditsAndGoFinal`、`backToSections`、`dismissDialog` |
| codes/hr-collection-agent-frontend/src/pages/ResumeCollectionPage.tsx | 修改 | 活跃分区接入编辑；快捷指令；“未提交的修改”确认框；临时“我还要修改”按钮 |
| codes/hr-collection-agent-frontend/src/test/ApiMocks.ts | 修改 | 新增 `applyPatch`（按后端语义模拟 PATCH：提交的字段变为 confirmed） |
| codes/hr-collection-agent-frontend/src/components/Layout.css | 修改 | 编辑态样式 |
| 各组件 / 页面测试 | 新增 | `FieldRow`、`StringListEditor`、`QuickReplyChips`、`SectionCard.edit`、`ResumeCollectionPage.edit` |

### 偏差说明
- **“未提交的修改”确认框与最终确认视图的临时“我还要修改”按钮提前到 2.4**：“其余都没问题”会走 reducer 的 `unsubmitted_edits` 对话框与 `view=final`，若 UI 不渲染它们，状态机会卡死（`dialog` 非空时忽略后续动作）。该对话框在 2.6 复用；最终确认卡（含“确认提交”）仍在 2.6，届时替换临时按钮。
- 非核心字段的过长 / 条数错误在点击“确认本区”时由 reducer 本地拦截并显示在字段旁（不发请求）；只有核心字段缺失 / 非法会预先禁用按钮。
- 文本列表在失焦时丢弃空白行，故 `buildSectionUpdate` 报告的下标与 UI 行一致（兑现第一批实现备注）。

### 遗留风险
- 编辑缓冲只在内存，刷新页面会丢失未提交编辑（TD-03，已知行为）。
- 点击“确认本区”时若同一分区已 `confirmed` 且无编辑，按钮为“已确认”且禁用；用户需先改动才能再次提交（符合设计 §6）。
