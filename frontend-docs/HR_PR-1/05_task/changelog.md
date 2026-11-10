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
