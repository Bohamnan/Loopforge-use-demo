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

## Task-2.5：分区核对 — 经历类子项编辑（REQ-FE-03.3）

**完成时间**：2026-11-10
**实现者**：Yin Yang（frontend）

### 变更文件
| 文件路径 | 操作 | 说明 |
|---------|------|------|
| codes/hr-collection-agent-frontend/src/components/ObjectListEditor.tsx | 新增 | 工作 / 项目 / 教育经历的多条子项新增、修改、删除（可折叠卡片 `<details>`，无重排）；子项字段由 `SectionConfig` 驱动；工作经历内含职责 / 业绩两个文本列表；条数上限 20（取自 `FIELD_MAX_LENGTH`），子列表上限 30、单项 2000（取自 `EXPERIENCE_ITEM_LIMIT`）；字段路径 `work_experiences[1].start_date` 的错误显示在对应子项行；整表错误；提交态锁定 |
| codes/hr-collection-agent-frontend/src/components/StringListEditor.tsx | 修改 | 支持嵌套使用：`fieldKey` 可为子项路径、`maxItems` 覆盖、`bare` 隐藏状态标签与外层标记；原有行为不变 |
| codes/hr-collection-agent-frontend/src/components/SectionCard.tsx | 修改 | 经历类字段改用 `ObjectListEditor`（替换 2.4 的只读展示） |
| codes/hr-collection-agent-frontend/src/hooks/model/SectionView.ts、SectionView.test.ts | 修改 | `buildSectionUpdate`：提交时丢弃“完全为空”的子项（用户新增后未填写）；错误仍按用户所见下标报告 |
| codes/hr-collection-agent-frontend/src/components/Layout.css | 修改 | 子项卡片样式 |
| 测试 | 新增 | `ObjectListEditor.test.tsx`、`ResumeCollectionPage.items.test.tsx`；扩充 `SectionView.test.ts` |

### 偏差说明
- 新增的**空白子项在提交时被丢弃**（设计 §4.4 只写“列表提交完整新列表”）：避免把只点了“添加一条”却没填的占位项存入草稿；全部为空则提交 `[]`（即“确认留空”）。
- 删除子项后清除下标类字段错误：由 reducer 的 `FIELD_EDITED` 对该字段的全部路径错误一并清除（任何对该列表的编辑都会清掉它的旧错误，下次确认时重新校验），因此不会出现错位提示。
- 子项以 `<details open>` 折叠，未提供“全部收起 / 展开”。

### 遗留风险
- 子项无 id、以下标为 key：删除或在中间插入时，已折叠 / 展开的状态会随下标移动（仅影响显示，不影响数据）。
- 嵌套列表（职责 / 业绩）的 `status` 与“未提交修改”标记显示在外层经历字段上，子项级没有单独状态（契约中整块一个状态，O-11）。

## Task-2.6：最终确认与保存（REQ-FE-04，HIGH_RISK：约束 F-03）

**完成时间**：2026-11-10
**实现者**：Yin Yang（frontend）
**状态**：待人类审查（HIGH_RISK，tasks.md 暂不标 ✅）

### 变更文件
| 文件路径 | 操作 | 说明 |
|---------|------|------|
| codes/hr-collection-agent-frontend/src/components/FinalReviewCard.tsx | 新增 | 最终确认卡：全文只读（11 区 / 22 字段，状态标签原样）、未确认字段数提示、“确认提交”（核心三项就绪才可点，进行中禁用并 loading）、“我还要修改”、失败时 `ErrorAlert` + “当前不能确认是否已保存，可直接重试”；核心未就绪时说明原因并提供“去确认基本信息”。卡内任何位置都不出现“已保存” |
| codes/hr-collection-agent-frontend/src/components/SavedResultCard.tsx | 新增 | 仅在后端返回成功后渲染：`already_saved=false` → “已保存”+ 姓名 / 原始文件名 / 保存时间（`formatSavedAt`）；`true` → 只有“该简历已保存过”，不含任何记录内容；均无记录编号 / `resume_id`；“上传下一份” |
| codes/hr-collection-agent-frontend/src/hooks/useResumeSession.ts | 修改 | 新增 `confirmResume`、`proceedUnconfirmed`（`busy` 由 null→confirm 时才发 `createResume()` 并回传 `epoch`）、`uploadNext`；`backToSections(section?)` |
| codes/hr-collection-agent-frontend/src/pages/ResumeCollectionPage.tsx | 修改 | 用 `FinalReviewCard` 替换 2.4 的临时“我还要修改”按钮；`saved` 阶段渲染 `SavedResultCard`；接线“还有字段未确认”确认框（偏差 ② 条件）；页面级拖拽防护 |
| codes/hr-collection-agent-frontend/src/hooks/usePreventFileDropNavigation.ts | 新增 | 全页面取消 `dragover` / `drop` 默认行为，覆盖没有 composer 的阶段（读取中 / 读取失败 / 结果页） |
| codes/hr-collection-agent-frontend/src/components/ComposerBar.tsx | 修改 | **修复审查 SUGGEST（拖拽离开页面）**：监听器在 `disabled` 时也保持挂载并 `preventDefault`，仅在可用时才把文件交给页面 |
| codes/hr-collection-agent-frontend/src/components/NoticeBanner.tsx | 修改 | “已恢复草稿”“已保存过”两类信息提示改 `role="status"`（需要行动的警告仍为 `alert`），减少同屏连续播报（兑现 2.3 风险的一部分） |
| codes/hr-collection-agent-frontend/src/components/Layout.css | 修改 | 最终确认卡与保存结果卡样式 |
| frontend-docs/HR_PR-1/04_design/design.md | 修改 | §4.4 补写“空子项处理”（偏差 ③），顶部变更履历追加 v1.2 |
| 测试 | 新增 / 修改 | `FinalReviewCard`、`SavedResultCard`、`usePreventFileDropNavigation`、`ComposerBar`（禁用时仍取消默认行为）、`ResumeCollectionPage.final.test.tsx`（30 例，按 REQ-FE-04.1–04.8 分组） |

### REQ-FE-04 验收标准 → 实现 → 测试
| AC | 实现 | 测试（`ResumeCollectionPage.final.test.tsx` 除特别注明） |
|---|---|---|
| 04.1 独立最终确认，核心三项就绪才可点 | `FinalReviewCard` + `coreReady`（三项均 `confirmed` 且值合法且无未提交编辑） | “REQ-FE-04.1” 组 4 例；`FinalReviewCard.test` 启用 / 禁用 / 原因 / 去确认基本信息 |
| 04.2 有未确认字段先提示，继续即确认当前显示的全部内容 | reducer `unconfirmed` 对话框 + `proceedUnconfirmed`；未提交编辑走 `unsubmitted_edits` 对话框 | “REQ-FE-04.2” 组 3 例（取消不发请求、继续发一次、无未确认不弹窗、放弃修改） |
| 04.3 成功前不显示“已保存”，不做乐观更新（F-03） | “已保存”只在 `phase=saved`（仅 `CONFIRM_SUCCEEDED` 设置）渲染 | “REQ-FE-04.3” 组：进行中、500 save_failed、500 internal_error、422 confirmation_required、非 JSON 502、网络失败、超时（fake timers）均断言无 `saved-result` 且无“已保存”；请求体恰为 `{"confirmed":true}`、`same-origin` |
| 04.4 成功：已保存 + 上传下一份；清空内容，只留姓名 / 文件名 / 保存时间 | `SavedResultCard`、`savedSummary` | “REQ-FE-04.4” 组：卡片三项、页面文本不含手机号 / 邮箱、无 `data-field`、无记录编号；上传下一份回到空态；结果页无上传栏 |
| 04.5 `already_saved` 只显示文字，不展示已有记录 | `SavedResultCard` 的 `alreadySaved` 分支 | “REQ-FE-04.5” 组：无姓名 / 文件名 / 手机号 / 邮箱；以字段而非 HTTP 状态判断（201+true、200+false） |
| 04.6 超时 / 网络失败不提示成功，可直接重试，不查询状态 | `CONFIRM_FAILED` 停留 `final`；按钮保持可点 | “REQ-FE-04.6” 组：超时后重试成功、网络失败后重试成功；请求序列恰为 `GET current → POST → POST`，无任何状态查询 |
| 04.7 `draft_not_found` → “可能已保存，请重新上传核实” | reducer 回空态 + `maybe_saved` 提示 | “REQ-FE-04.7” 组：提示出现、无成功态、内容清空、可重新上传 |
| 04.8 请求期间防止重复点击 | `busy=confirm`：按钮 disabled + loading，hook / reducer 忽略重复请求，“我还要修改”“新对话”同时禁用 | “REQ-FE-04.8” 组：多次点击只发一个 POST |

### 偏差 ② 的落实
2.4 提前加的“未提交的修改”确认框保留并继续使用；本任务接线 `unconfirmed` 对话框，并用 `FinalReviewCard` 替换了临时“我还要修改”按钮。`new_chat` 对话框仍在 2.7。

### 偏差说明
- 422 `validation_failed`（确认时）回到分区视图并显示字段错误，错误卡出现在活跃分区内（沿用 2.4 的 `section` 级错误展示），不在最终确认卡内。
- 核心未就绪时，`FinalReviewCard` 另提供“去确认基本信息”入口（设计未列，用于避免死路：该情形下“我还要修改”可能落在别的分区）。
- 保存时间用 `toLocaleString('zh-CN', { hour12: false })` 本地时区格式化。

### 遗留风险
- HIGH_RISK：请人类审查 F-03 路径——`SavedResultCard` 的唯一入口（`reducer CONFIRM_SUCCEEDED`）、`draft_not_found` 与各类失败不会进入成功态。
- 超时 / 网络失败后“结果未知”。（2026-11-10 更正，第三批审查 SUGGEST-1）如果首次请求其实已经保存、只是响应丢了，backend 已删除草稿并使令牌失效（C-11），重试会得到 **404 `draft_not_found`**，界面显示“可能已保存，请重新上传核实”（D-01），不会得到 `already_saved=true`；`already_saved=true` 只出现在同一个人此前已保存、而本次仍持有有效草稿的情形（ADR-004）。原先写“重试会得到 `already_saved=true`”是错误的。
- “＋ 新对话”仍待 2.7；`saved` 与 `empty` 阶段点击该按钮暂无反应，使用“上传下一份”即可。

## Fix-2.6a：保存响应形状校验，防误报“已保存”（第三批审查 SUGGEST-2，F-03 加固）

**完成时间**：2026-11-10
**实现者**：Yin Yang（frontend）

### 变更文件
| 文件路径 | 操作 | 说明 |
|---------|------|------|
| codes/hr-collection-agent-frontend/src/api/ResponseShapes.ts | 新增 | `isCreateResumeResponse`：`resume_id` 非空字符串、`already_saved` 为布尔值、`saved_at` 为可解析的日期字符串；`isDraftResponse`：`draft_id` / `expires_at` 非空字符串、`original_file.filename` 非空、22 个字段齐全且每个为 `{value, status}`（`status` 属 4 种状态之一；列表字段 `value` 为数组，标量 `value` 为 `string \| null`） |
| codes/hr-collection-agent-frontend/src/api/ApiClient.ts | 修改 | `RequestOptions.validate`：2xx 响应体不满足形状时按 `unknown_error` 处理（保留 HTTP 状态、走同一日志规则，不暴露响应体） |
| codes/hr-collection-agent-frontend/src/api/ResumeApi.ts | 修改 | `createResume` 使用 `isCreateResumeResponse` |
| codes/hr-collection-agent-frontend/src/api/ResumeDraftApi.ts | 修改 | 三个草稿接口（上传、读取、更新）使用 `isDraftResponse` |
| 测试 | 新增 / 修改 | `ResponseShapes.test.ts`（保存响应 15 种非法形状、草稿 22 个缺字段等）、`ResumeApi.test`（8 种 2xx 非法形状 → `unknown_error`）、`ResumeDraftApi.test`（三个接口 × 3 种非法草稿）、`ApiClient.test`（`validate` 选项）、`ResumeCollectionPage.final.test`（200 `{}`、201 `{}`、缺 `already_saved`、`already_saved` 非布尔 → 停在最终确认页、有错误提示、可重试，无“已保存”） |

### 其他接口的同类风险
- 草稿接口的 2xx 响应也会被页面直接读取 22 个字段，形状不对会使界面崩溃或把不完整的数据当作草稿，因此一并加了 `isDraftResponse`。
- **读取草稿（GET current）** 返回形状不对时是**错误**（进入“读取失败，可重试”），不是“没有草稿”——避免用户误以为没有草稿而上传覆盖。
- 错误响应（非 2xx）的形状校验在第一批已有（非契约错误体 → `unknown_error`）。

### 偏差说明
`saved_at` 额外要求可被 `Date.parse` 解析（审查只要求字符串），这样“已保存 + 乱码时间”的组合不会出现（对应 SUGGEST-4 的前置条件）。

### 遗留风险
形状校验是最小校验，不核对各字段内容的业务含义（例如列表项内部字段）；这些仍由 TypeScript 类型与后端契约保证。

## Task-2.7：新对话与覆盖确认（P-08、TD-12）

**完成时间**：2026-11-10
**实现者**：Yin Yang（frontend）

### 变更文件
| 文件路径 | 操作 | 说明 |
|---------|------|------|
| codes/hr-collection-agent-frontend/src/hooks/useResumeSession.ts | 修改 | 新增 `requestNewChat`、`confirmNewChat`（reducer 的 `NEW_CHAT_*` 动作早已就绪，本任务补入口） |
| codes/hr-collection-agent-frontend/src/pages/ResumeCollectionPage.tsx | 修改 | “＋ 新对话”接线；`new_chat` 确认框（偏差 ② 的剩余部分）：说明界面将清空、服务端未确认草稿仍保留、刷新会恢复、再次上传会覆盖；有未提交编辑时追加“未提交的修改将丢失”；无草稿 / 结果页直接清空，不弹框 |
| codes/hr-collection-agent-frontend/src/components/NoticeBanner.tsx、NoticeBanner.test.tsx | 修改 | **SUGGEST-5**：去掉与结果卡重复的 `already_saved` 提示（`BannerKind` 排除该项；该句只由 `SavedResultCard` 显示）；页面不再把该通知交给横幅 |
| codes/hr-collection-agent-frontend/src/pages/ResumeCollectionPage.newchat.test.tsx | 新增 | 9 例，见验证 |

### 验证要点
空态直接清空且不调接口；有草稿先确认并写明后果；取消保留草稿与未提交编辑；确认后清空界面且不调任何接口（无丢弃接口）；确认后的下一次上传不再二次确认覆盖（`overwriteAcknowledged`）；重新加载页面仍会恢复旧草稿（已知行为 Q-DL-04）；最终确认页同样先询问；结果页直接清空；请求进行中按钮禁用。

### 偏差说明
按设计实现，无偏差。reducer 的 `notice: 'already_saved'` 仍保留，作为“结果页应显示已保存过”的标记，仅不再由横幅渲染。

### 遗留风险
“新对话”后刷新页面会恢复旧草稿（TD-12，已知行为，对话框已明示）。

## Task-2.8：无障碍与响应式（TD-13）

**完成时间**：2026-11-10
**实现者**：Yin Yang（frontend）

### 变更文件
| 文件路径 | 操作 | 说明 |
|---------|------|------|
| codes/hr-collection-agent-frontend/src/hooks/useChatScroll.ts | 新增 | 纯函数 `focusKeyOf` + 薄封装 `useChatScroll`：只返回“该滚动 / 聚焦的区块 key”（`section:<key>` / `final` / `saved` / null），不碰 DOM |
| codes/hr-collection-agent-frontend/src/components/ChatThread.tsx | 修改 | 按 `focusKey` 查找 `[data-focus-key]`，`scrollIntoView`（环境没有该方法时跳过）并 `focus({ preventScroll: true })`；key 不变不重复聚焦 |
| codes/hr-collection-agent-frontend/src/components/SectionCard.tsx、FinalReviewCard.tsx、SavedResultCard.tsx | 修改 | 标题加 `data-focus-key` 与 `tabIndex={-1}` 作为聚焦目标 |
| codes/hr-collection-agent-frontend/src/hooks/useNarrowScreen.ts、components/AppShell.tsx | 新增 / 修改 | `matchMedia('(max-width: 859px)')`：窄屏时侧栏收起，“＋ 新对话”移到标题栏，仍唯一且可达；侧栏 `aria-label="会话操作"` |
| codes/hr-collection-agent-frontend/src/hooks/model/UploadPrecheck.ts | 修改 | `isFileDrag`：`types` 含 `Files`（拖拽过程中文件尚不可读）或已有文件 |
| codes/hr-collection-agent-frontend/src/hooks/usePreventFileDropNavigation.ts、components/ComposerBar.tsx | 修改 | **SUGGEST-3**：只取消文件拖拽的默认行为，文本 / 链接拖拽不受影响；`ComposerBar` 提示用 `role="status"` |
| codes/hr-collection-agent-frontend/src/components/SavedResultCard.tsx | 修改 | **SUGGEST-4**：`formatSavedAt` 无法解析时返回 `null`，结果卡隐藏“保存时间”行，不再显示原始乱码（保存响应的 `saved_at` 已在 api 层校验为可解析日期） |
| codes/hr-collection-agent-frontend/src/hooks/useStableKeys.ts、components/ObjectListEditor.tsx、StringListEditor.tsx | 新增 / 修改 | 子项 / 文本行改用稳定 key（随新增 / 删除同步，外部长度变化时重置）：删除中间项后其余卡片保持同一 DOM（折叠状态不错位） |
| codes/hr-collection-agent-frontend/src/components/FinalReviewCard.tsx | 修改 | “还有 n 项字段未确认”提示改 `role="status"` |
| codes/hr-collection-agent-frontend/src/pages/ResumeCollectionPage.tsx | 修改 | 使用 `useChatScroll` 与 `ChatThread` 的 `focusKey` |
| 测试 | 新增 | `useChatScroll`、`useStableKeys`、`ChatThread`、`AppShell.responsive`、`ObjectListEditor.keys`、`ResumeCollectionPage.a11y`，并扩充 `ComposerBar`、`usePreventFileDropNavigation`、`SavedResultCard`、`FinalReviewCard`、`UploadPrecheck` |

### 跟踪项处理情况
| 跟踪项 | 处理 |
|---|---|
| alert 连续播报 | 已处理：恢复提示（2.6）、未确认字段提示、输入区提示均为 `role="status"`；页面上只有真正的错误（`ErrorAlert`）与需行动的警告（草稿失效、可能已保存）是 `alert`。测试断言“有恢复提示时错误仍只有一个 alert” |
| 子项用下标作为 key | 已处理（`useStableKeys`，经历子项与文本行） |
| SUGGEST-3 全局拦截 drop 影响文本拖拽 | 已处理 |
| SUGGEST-4 `formatSavedAt` 回退 | 已处理 |
| 屏幕阅读器专项验收 | 不做（Q-DL-05 已裁定范围：基础键盘 + `aria-live`，不做读屏专项）；已验证标签、焦点、`status`/`alert` 角色，但没有用真实读屏软件验证 |
| 窄屏用 Drawer | 未用：直接把“＋ 新对话”放进标题栏（设计 §6 允许“顶栏按钮承载”），避免新增交互层 |

### 偏差说明
- 焦点会在“有草稿显示出来”（恢复或上传成功）时移到当前待核对分区标题，这是设计 TD-13 的“跨分区推进后焦点移到新分区标题”的延伸；页面刚打开且读取失败 / 空态时不移动焦点。
- 其余按设计实现。

### 遗留风险
- 字段级错误文本通过 `aria-describedby` 关联到输入框，没有单独 `role="alert"`（避免多个错误同时连续播报）；未经真实读屏验证。
- 浏览器兼容只在 jsdom 中验证，未在 Chrome / Edge / Safari / Firefox 实机验证（任务 3.1 之后的人工验收项）。

## Cleanup-A：草稿形状校验补全 + 上传响应异常提示（第五批 S1、S3）

**完成时间**：2026-11-10
**实现者**：Yin Yang（frontend）

### 变更文件
| 文件路径 | 操作 | 说明 |
|---------|------|------|
| codes/hr-collection-agent-frontend/src/api/ResponseShapes.ts | 修改 | **S1**：`isDraftResponse` 增加：文本列表每个元素必须是字符串；经历列表每个元素必须是对象，已知成员为 string / null（`responsibilities`、`achievements` 为字符串数组）；`original_file.size_bytes` 为非负有限数；`content_type` 属 3 个允许值 |
| codes/hr-collection-agent-frontend/src/components/ObjectListEditor.tsx | 修改 | 纵深防御：即使有非对象元素漏进来也不崩溃（标题 / 渲染都按空对象处理） |
| codes/hr-collection-agent-frontend/src/components/ErrorAlert.tsx、pages/ResumeCollectionPage.tsx | 修改 | **S3**：上传返回 2xx 但形状不对（`unknown_error` 且状态码 2xx）时显示“上传结果异常，请刷新页面后核对。”；其他 `unknown_error`（如 502）仍用通用文案 |
| 测试 | 新增 / 修改 | `ResponseShapes.test`（列表元素 / 成员类型 / 文件信息）、`ObjectListEditor.test`（null 元素）、`ErrorAlert.test`、`ResumeCollectionPage.upload.test` |

### S3 的选择
选“提示用户刷新核对”，不自动重新读取当前草稿：自动 GET 会引入新的请求与状态分支（读取失败时又要处理），而这是极端情形（代理改写了 201 响应）；提示文案明确，刷新页面即触发启动时的草稿读取。

### 偏差说明
`content_type` 也加入校验（审查建议里提及）；它不被界面使用，但属于契约枚举，不合法时视为异常响应。

### 遗留风险
形状校验仍只覆盖界面实际读取的部分；未知额外成员被忽略。

## Cleanup-B：长度按码点、空白行不再失焦删除、确认规则去重复（第一批 S2、第二批 S2 / S4）

**完成时间**：2026-11-10
**实现者**：Yin Yang（frontend）

### 变更文件
| 文件路径 | 操作 | 说明 |
|---------|------|------|
| codes/hr-collection-agent-frontend/src/hooks/model/FieldRules.ts | 修改 | **第一批 S2**：新增 `charLength`（`Array.from(value).length`，按 Unicode 码点计数，与 OpenAPI `maxLength` 一致），标量、邮箱、手机号、文本列表项、经历子项及子列表项的长度检查全部改用它。空白行不计入条数上限，过长项的下标仍是用户所见的行位置 |
| codes/hr-collection-agent-frontend/src/components/StringListEditor.tsx | 修改 | **第二批 S4**：去掉失焦时删除空白行（行高变化可能让同一次点击落到相邻的“删除”按钮上）。空白行留在屏幕上，仅在提交时丢弃（`buildSectionUpdate` 早已如此） |
| codes/hr-collection-agent-frontend/src/hooks/model/SectionView.ts | 修改 | `buildSectionUpdate`：校验在“保留空白行”的版本上进行，所以错误下标与屏幕行一致，提交内容仍不含空白行；新增 `sectionConfirmState`（按钮文案 / 阻断原因 / 是否有未提交编辑）与 `canConfirmSection`（**第二批 S2**） |
| codes/hr-collection-agent-frontend/src/components/SectionCard.tsx、pages/ResumeCollectionPage.tsx | 修改 | 卡片按钮与“确认无误”快捷指令共用 `canConfirmSection`，删除页面里重复的规则 |
| 测试 | 新增 / 修改 | `FieldRules.test`（emoji 边界：100/101、500/501、5000/5001、1000/1001、2000/2001、邮箱 254；空白行不计数且下标保持）、`SectionView.test`（`canConfirmSection`、空白行下标）、`StringListEditor.test` / `ObjectListEditor.test` / `ResumeCollectionPage.edit.test`（失焦不删行，空白行不提交） |

### 偏差说明
第一批 changelog 与实现备注曾约定“文本列表在失焦时丢弃空白行”，现按 DL 要求改为“只在提交时丢弃”；`ObjectListEditor` 中嵌套列表同样。

### 遗留风险
空白行会一直留在界面直到用户删除或提交；提交后（PATCH 成功）新草稿不含空白行，界面随之刷新。
