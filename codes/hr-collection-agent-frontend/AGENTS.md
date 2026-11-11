# hr-collection-agent-web — AGENTS.md

| 项 | 内容 |
|---|---|
| 状态 | 待复核（设计有更新） |
| 版本 | v2（会话化变更，待 Dev Lead 复核） |
| 来源 | [solution-design.md](../../01-requirements/HR_PR-1/solution-design.md)（HR_PR-1）；工作台 frontend 规范与架构参考；v2 补全依据 [design.md](../../frontend-docs/HR_PR-1/04_design/design.md)（v2.0）、[interface_spec_resume.md](../../frontend-docs/HR_PR-1/03_api/interface_spec_resume.md)（v0.3）、[tasks.md](../../frontend-docs/HR_PR-1/05_task/tasks.md)（v2.0）、[openapi.yaml](../../backend-docs/HR_PR-1/03_api/openapi.yaml)（**0.2.0**，已冻结） |
| 最后更新 | 2026-11-11（v2 增量更新，待 Dev Lead 复核） |

## 变更履历

| 版本 | 日期 | 变更（delta） | 驱动 |
|---|---|---|---|
| v1 | 2026-11-10 | 技术设计后补全，Dev Lead 复核确认 | design v1.1 |
| **v2** | 2026-11-11 | 会话化增量：① 契约版本 0.1.1→0.2.0；② 目录与组件 / hook / api 清单加入会话、对话、归档；③ 请求一节改 `browser_id`，删 `/current`、`draft_token`、`draft_not_found` 特例，新增 PUT / DELETE / blob 与对话 75s；④ 红线：“无文本框”改 ADR-007 口径，`already_saved` 红线按 X-06 重写，新增“已更新”时机、B-03 扩至对话 / 建议 / 下载、差异卡片列清空字段；⑤ 运行说明补测试夹具与脚本退役；⑥ 待确认清单更新 | design v2.0 §10.1 REQ-AGENTS-01；重跑清单 8b |

## 项目定位

HR 人力信息收集 Web 对话前端：支持用户上传简历、查看并校对识别结果、明确确认后接收保存结果。对应 frontend Workbench。

## 技术栈

| 类别 | 选型 | 依据 |
|---|---|---|
| 语言与版本 | TypeScript（`strict`）；Node.js ≥ 24（LTS），`package.json` 的 `engines` 写 `"node": ">=24"` | 工作台项目上下文与 frontend 架构参考 |
| 框架与构建 | React 18、Vite | 工作台项目上下文与 frontend 架构参考 |
| 组件库 | Ant Design（React 版）；主题 token 取自原型 `style.css` 配色（TD-14） | 工作台 frontend coding 规范；design TD-14 |
| 状态管理 | React `useState` / `useReducer`；不引入额外状态管理库 | 工作台 frontend coding 规范 |
| API 客户端 | 统一 `api` 封装层（基于 fetch），仅访问 backend | 工作台 frontend API 规范 |
| 测试与检查 | Vitest（jsdom）+ React Testing Library（含 user-event、jest-dom）+ ESLint；默认手写 `fetch` mock，不引入 MSW | REQ-FE-06.6；C-15；tasks 1.1 |
| 路由 / 状态库 | 单页应用，**不引入路由库与状态管理库**；对话页与已归档简历页由 `App` 的 `useState` 切换并同时挂载（TD-25） | design TD-02、TD-25 |

## 目录结构

```text
codes/hr-collection-agent-frontend/
├── index.html
├── package.json / package-lock.json / .npmrc
├── tsconfig*.json、vite.config.ts、eslint 配置、Vitest 配置
└── src/
    ├── main.tsx、App.tsx           # 入口；Ant Design ConfigProvider 与主题（TD-14）；App 持有 view 状态，对话页与归档页同时挂载（TD-25）
    ├── pages/                      # ResumeCollectionPage（会话编排）、ArchivePage（归档列表 / 详情）：页面编排，不直接请求接口
    ├── components/                 # 展示与交互组件（AppShell、SessionList、ChatThread、SectionCard、FieldRow、ComposerBar、MessageList、SuggestionCard、UpdateDiffCard、SavedSessionView、ArchiveList、ArchiveDetail、ConfirmDialog、ErrorBoundary 等）
    ├── hooks/                      # useResumeSession、useSessionList、useArchive、useChatScroll：状态与副作用，调用 api 层（TD-16）
    │   └── model/                  # 纯 TS 业务规则，无 DOM：SessionReducer、SectionConfig、FieldRules、UploadPrecheck、SectionView、UpdateDiff、Verify、FormatTime（TD-06）
    ├── api/                        # ApiClient、ApiError、ResponseShapes、SessionApi、ConversationApi、ResumeApi、ArchiveApi：backend 调用与错误转换，唯一出口
    ├── types/                      # 与 OpenAPI 0.2.0 同名的手写类型（F-02）：ResumeModel、Session、Conversation、Archive、Resume、Errors
    └── test/                       # 测试 setup、fetch mock 工厂（ApiMocks、FakeBackend，会话模型）、合成简历数据（仅合成数据，B-06）
```

- 测试文件与被测文件同目录，命名 `*.test.ts(x)`；共用工具放 `src/test/`。
- `src` 下不新增其他目录（Q-DL-02：纯逻辑模块放 `hooks/model/`）。
- 依据：design v2.0 §3（TD-06、TD-16）、tasks v2.0。
- v1 的 `scripts/drill_resume.py`、`selftest_resume.py` 依赖单草稿契约，v2 后失效，按 Q-TD-01 **退役**（任务 3.2），其职责由 Vitest 红线测试与浏览器实测（11b）承担；退役前不得依赖这两个脚本验证 v2。

## 分层与职责

- `pages`：页面编排，不直接请求接口；**不使用路由库**（TD-02、TD-25）。
- `components`：展示与交互，不直接请求接口、不持有业务规则。
- `hooks`：状态与副作用，调用 `api` 层；不得操作 DOM 样式。会话 / 会话列表 / 归档三个 hook 互不嵌套（TD-16）。
- `api`：封装 backend 调用与错误转换，是前端访问数据的唯一出口。
- 类型定义与 backend OpenAPI 契约保持一致。

## 命名与编码约定

- 组件与文件使用 `PascalCase`（含 `api/`、`hooks/model/` 下的非组件模块）。
- Hooks 以 `use` 开头。
- 类型以接口契约命名，与 OpenAPI schema 同名；文件头注明对应的 OpenAPI 版本，契约每次变更时同步核对（F-02）。
- 业务规则（校验、状态转移、分区配置）只放 `hooks/model/`，组件不持有业务规则；hook 不操作 DOM 样式，需要滚动 / 聚焦时只返回信号（TD-06、`useChatScroll`）。
- 注释使用英文。
- 详细规范见工作台 [coding.md](../../rules/frontend/coding.md)。

## 接口与数据约定

- 仅调用 backend 的 REST/HTTP/JSON API；backend 提供并维护 OpenAPI 契约。
- 简历文件上传使用 backend 契约定义的 `multipart/form-data`；路径、字段和响应以 OpenAPI 为准。
- 所有 API 调用经 `api` 封装层（基于 fetch）；按 `{code, message, request_id}` 统一错误体处理，不在控制台记录简历原文或敏感信息。
- 会话、对话、归档与确认保存 / 更新的高层契约见工作台 [solution-design.md](../../01-requirements/HR_PR-1/solution-design.md)（v2）；详细接口以 OpenAPI 为准。
- **契约来源**：`backend-docs/HR_PR-1/03_api/openapi.yaml`（当前 **0.2.0**，13 个操作、19 个业务错误码，已冻结）是唯一来源；手机号 / 邮箱 `pattern`、各字段 `maxLength` / `maxItems` 直接复用并集中在 `FieldRules`（`FIELD_MAX_LENGTH` 表，design §6.1，数值在 0.2.0 中未变；对话 `content` 上限 2000），不自定数值（G-01、G-02、CR-01、CR-01a、TD-07）。
- **手机号**：提交前先去掉空格与连字符，再按 `pattern` 校验；`maxLength 32` 针对提交前的原值（G-02）。
- **请求**：前缀 `/api/v1`；`credentials: 'same-origin'`，前端不读取、不存储浏览器标识 Cookie `browser_id`（HttpOnly，C-06、O-01；v1 的 `draft_token` 已废弃）；方法含 `GET/POST/PATCH/PUT/DELETE`；响应模式 `json`（默认）/ `none`（204）/ `blob`（原始文件，校验 `Content-Type`），三种模式下非 2xx 均按 JSON 错误体解析（TD-28）；路径参数一律 `encodeURIComponent`；JSON 设 `Content-Type`，上传用 `FormData` 字段 `file` 且不手设 Content-Type。
- **超时与重试**：上传与对话 75 秒（C-08、DD-12），其余接口 30 秒（F-01）；`AbortController` 实现；api 层不做自动重试，重试均由用户触发（DD-05、DD-06）。
- **错误处理**：统一解析为 `{code, message, request_id}`，可选 `details: [{field, reason}]`（D-06）；界面只展示 backend 的 `message`；前端本地错误码为 `client_timeout` / `network_error` / `unknown_error`，不混入契约 `ErrorCode`（F-05）；代理层的非 JSON 失败统一为 `unknown_error`（DD-10）。v1 的 `/resume-drafts/current` 与 `draft_not_found` 特例已删除；`DELETE` 会话的 `session_not_found` 视为成功（静默，`quietCodes`）；会话列表加载失败只影响列表区，可重试（TD-16）。**响应形状校验失败视为 `unknown_error`，不得进入成功分支**（F-03 基础，TD-28）。
- **日志**：控制台与日志只允许 `request_id`、`code`、HTTP 状态；不输出请求体、响应体、字段值、对话原文、助手回复、建议值（B-03）；`document.title` 与下载文件名不含姓名等简历内容。
- **结果未知后的核对（G2-04、TD-19）**：对话 / 保存 / 更新遇超时、网络失败、`unknown_error`（保存另含 `session_read_only`）→ 先 `GET` 会话再决定，决策由 `hooks/model/Verify.ts` 纯函数给出；不设客户端幂等键。
- **下载**：原始文件以 blob 取回，经 `saveBlob` 保存，文件名为通用名（`原始简历.pdf/.jpg/.png`），不含姓名、不取 `Content-Disposition`，保存后 `URL.revokeObjectURL`（TD-27）。
- **进度呈现**：上传期间只显示单一加载提示，对话只显示“思考中”，均不伪造分步进度、不显示耗时（P-05、TD-10）。
- **兼容与无障碍范围（TD-13）**：Chrome / Edge / Safari / Firefox 的最近两个主版本；窗口宽度 ≥ 360px，< 860px 外壳折叠；基础键盘可达（窄屏会话列表经 `Drawer` 到达），加载 / 错误 / 保存结果使用 `aria-live` / `role="alert"`，状态用“文字 + 颜色”表达；不做屏幕阅读器专项验收（Q-DL-05）。
- 简历与对话内容只存于前端运行时内存；会话与历史由服务端保存，浏览器仅持有 HttpOnly 的 `browser_id` Cookie，不把简历、校对或对话内容存入浏览器本地。

## 构建、运行与测试

| 动作 | 命令 |
|---|---|
| 依赖管理 | npm；`.npmrc` 设 `save-exact=true`，`package.json` 所有依赖写精确版本，提交 `package-lock.json`，不使用开放区间（tasks 1.1） |
| 安装依赖 | `npm ci`（按锁文件安装，使用 npm 默认 registry） |
| 开发运行 | `npm run dev`（Vite dev server，端口由 Vite 默认值决定；需 backend 已运行于 `http://127.0.0.1:8000`） |
| 构建 | `npm run build`（含 `tsc --noEmit` 类型检查与 Vite 打包） |
| 测试 | `npm test`（Vitest，单次运行；不使用 watch 模式作为验证命令） |
| 静态检查 | `npm run lint`（ESLint；格式检查随 lint，不单设格式化命令） |

验证口径：构建日志须有真实的编译动作，不能仅凭退出码或“成功”字样判定通过。

测试夹具：`src/test/ApiMocks.ts`、`FakeBackend.ts` 为会话模型，支持按请求注入延迟与失败，供 F-03 / 结果未知核对类确定性测试使用；v1 的 `drill_resume.py` / `selftest_resume.py` 已退役（任务 3.2）。

### 依赖安装约定（项目例外）

- **不使用私有 Nexus**：DL 于 2026-11-10 决定，本项目依赖使用 npm 默认 registry 在本地直接安装，**不配置私有 registry 或 registry 凭证**。这是对全局规范“依赖经私有 Nexus 安装”的**项目级例外**，仅适用于本项目（与 backend 一致，T-DL-01）。
- 新增第三方依赖前须评估安全性（维护状态、已知漏洞、包名是否可疑，防 typosquatting），移除未使用依赖；新增依赖须先经 Dev Lead 同意。
- `package-lock.json` 与 `.npmrc` 不得包含带凭证的 URL 或 token。
- 不引入状态管理库、路由库、请求库（design TD-02；API 规范）。

### Vite dev proxy 与 Cookie（C-06、O-01）

- `vite.config.ts` 中 `server.proxy['/api']` 转发到 `http://127.0.0.1:8000`（backend 默认监听 `127.0.0.1:8000`）。
- 必须**保留 `Set-Cookie`**，不配置 `cookieDomainRewrite` / `cookiePathRewrite`（`browser_id` 无 Domain、Path 为 `/`）。
- 代理超时不得短于 75 秒（上传超时），multipart 请求体原样透传。
- 浏览器经 dev server 同源访问 `/api`，因此使用 `credentials: 'same-origin'`，不依赖 CORS。
- 代理目标使用 `127.0.0.1` 而不是 `localhost`：新版 Node 在 macOS 上解析 `localhost` 时可能优先得到 IPv6 的 `::1`，而 backend 只监听 `127.0.0.1`，会导致代理连接被拒（DL 复核修正，2026-11-10）。

### 环境变量

- 前端不使用任何密钥或凭证（F-01）；**v2 无新增环境变量**，不需要环境变量承载密钥。如后续引入非敏感配置（如 backend 地址），变量名须以 `VITE_` 开头并在此登记；`.env*` 加入 `.gitignore`。
- 运行前提：backend 须为 OpenAPI 0.2.0 版本并运行于 `http://127.0.0.1:8000`；v1 backend 的草稿接口已不存在，旧版 backend 无法配合本前端。

## 红线

- F-01：不得保存密钥或凭证，不得直连模型服务、其他外部服务或存储；只通过 backend HTTP API。
- F-02：不得在浏览器本地存储简历、对话或其他敏感个人信息；前端运行时只保留完成交互所需的临时状态；对话文本框 `autoComplete="off"`；下载后释放 blob URL。
- F-03：用户明确确认前不得提示“已保存”；仅在 backend 返回保存成功（2xx 且形状校验通过），或重读会话确认为已保存后反馈成功。**“已更新”同理**：仅在 PUT 2xx 且形状通过，或核对读到 `update_state=applied`（本次更新流程内）后显示；差异卡片出现、请求进行中、超时、`save_failed`、对话文字均不得出现“已更新”；对话文字不得触发保存或更新请求。
- 页面、组件不得直接请求接口；组件不得持有业务规则；Hook 不得操作 DOM 样式。
- 上传限制为 PDF、JPG/JPEG、PNG 且单文件不超过 10 MB；姓名、手机号、邮箱为保存前必需字段，其他字段允许为空。
- 必须清楚展示待校对结果与未识别/不确定字段，并支持用户修正。
- API 契约变更须经过 `cross-workbench-reviewer` 审视。
- ESLint 强制（tasks 1.1）：禁用 `localStorage` / `sessionStorage` / `indexedDB`（含 `window.xxx` 形式；F-02）；`src/pages`、`src/components`、`src/hooks` 内禁用 `fetch`（仅 `src/api` 豁免）；`no-console`（`warn`，仅允许 `console.error`，且不得输出简历内容或响应体，B-03）。
- 不展示记录编号或 `resume_id`（P-09）；`already_saved=true` 时显示“该简历已保存过”，既不是“已保存”也不是“已更新”，已保存内容由已保存会话视图只读展示（X-06 替代 D-04）。
- **差异卡片必须列出将被清空的字段**（候选为空而已有值非空，`clears` 必列并标“将被清空”，TD-23、REQ-FE-09.2）。
- 输入区含对话文本框（ADR-007），但**前端不解析自由文本**：自由文本只发给 backend，前端仅展示回复与修改建议；校对仍可用结构化分区就地编辑（ADR-006 v2 修订）；消息以纯文本渲染，不解析 Markdown / HTML。
- 不引入路由库与状态管理库（TD-02、TD-25）。
- 测试深度按风险分配：仅 F-02、F-03、B-03 与差异必列清空字段做确定性 / 故障注入测试，其余只测主路径与主要异常路径（tasks.md“测试预算”）。
- 测试与样例只用合成简历，不提交真实简历（B-06）。

## 待确认清单

| 序号 | 内容 | 状态 | 依据 / 原因 |
|---|---|---|---|
| 1 | 用户等待同步解析时的进度呈现与模型超时后的具体交互 | ✅ 已关闭 | P-05、TD-10（单一加载提示，不伪造进度）；C-08、REQ-FE-01.4（75 秒超时后提示重新上传）；裁决 F-04（孤儿草稿由 7 天清理兜底，POC 接受）；ADR-002 |
| 2 | Cookie 的 SameSite、Secure、Path、续期及跨域部署配置 | ✅ 已关闭 | C-06、O-01；interface_spec §2.4（`HttpOnly; SameSite=Lax; Path=/`，不含 Domain，不强制 Secure）；同源 + Vite dev proxy，前端无 Cookie 代码；ADR-003 |
| 3 | backend OpenAPI 的具体路径、字段类型、状态值和错误码 | ✅ 已关闭 | v1：OpenAPI 0.1.1（4 个接口、22 字段、13 个业务码）；**v2：OpenAPI 0.2.0 已冻结**（13 个操作、19 个业务码）；G-01、G-02、CR-01、CR-01a；跨 Workbench Review 已通过 |
| 4 | Node.js 版本（及 `engines` / `.nvmrc`） | ✅ 已关闭 | DL 复核决定（2026-11-10）：`engines` 为 `"node": ">=24"`（Node 24 LTS）；本机 v25.8.2 满足 |
| 5 | 非本地（非 localhost）部署时的同源方式（反向代理、Cookie `Secure`） | ⏳ 保留 | 本期为 localhost POC，生产部署形态未定（与 backend 待确认 #2a 同属部署设计）。确认人：Dev Lead/部署负责人；时机：部署设计 |
| 6 | 本文件 v2 增量（契约 0.2.0、会话 / 对话 / 归档、红线更新、脚本退役）的复核 | ⏳ 待复核 | design v2.0 §10.1 REQ-AGENTS-01；确认人：Dev Lead；复核通过后状态改回“已确认”，feature-developer 在此之前不得开始 |
