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
