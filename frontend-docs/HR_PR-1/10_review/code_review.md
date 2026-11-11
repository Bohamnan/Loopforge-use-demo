# Code Review Report — HR_PR-1（frontend，第一批：任务 1.1–1.6）

## 1. Review 结论
- Review 模式：Ticket-aware Review
- 持久化：是（本文件）
- 结论：**NEEDS_DECISION**（0 BLOCK / 2 QUESTION / 5 SUGGEST）
- Reviewer：Yin Yang（dev-lead，审查 agent 代行；被审查 Workbench：frontend）
- 日期：2026-11-10
- 审查对象：已合并到 feature 的 frontend 第一批，提交 4238907、3f45a41、7301bc7、357cf1a、4039088、4dfed73（基线 feature@dd929b2）
- 上下文限制：
  - 本批只含工程脚手架、入口与错误边界、契约类型、api 封装层、`hooks/model` 纯逻辑和 `SessionReducer`。**没有**页面、组件和 `useResumeSession`，因此 F-03 只能在“状态机层”核对（见下文），界面层“清楚展示待校对结果”“确认前不出现已保存提示”要等任务 2.x 审查时核对。
  - 审查期间未修改任何源码、测试、配置；未更新 `_progress.md`（由主 agent 维护）。
  - `project-memory/review_standards.md`、`security_checklist.md` 不存在，已跳过。

## 2. Review Scope
| 文件 | 变更类型 | 所属仓库/模块 | 对应 Task/REQ/AC | 风险等级 |
|------|----------|---------------|------------------|----------|
| package.json、package-lock.json、.npmrc、tsconfig.json、index.html、.gitignore | 新增 | 工程 | 1.1 / REQ-FE-06.1 | 中（依赖供应链） |
| eslint.config.js、vite.config.ts | 新增 | 质量门禁 / 代理 | 1.1 / REQ-FE-06.2、06.3、05.1 | **高**（F-01、F-02、B-03 的静态防线） |
| src/test/{setup,Smoke,ViteConfig,EslintRules}.test、ApiMocks.ts | 新增 | 测试基座 | 1.1 | 低 |
| src/main.tsx、App.tsx、components/ErrorBoundary.tsx（+ 测试） | 新增 | 入口 | 1.2 / REQ-FE-06.3 | 中（B-03） |
| src/types/{ResumeModel,Draft,Resume,Errors}.ts、Contract.test.ts | 新增 | types | 1.3 / REQ-FE-06.4、06.5 | 中（接口契约） |
| src/api/{ApiClient,ApiError,ResumeDraftApi,ResumeApi}.ts（+ 测试） | 新增 | api | 1.4 / REQ-FE-06.1、01.4、01.6、05.1 | **高**（唯一出口、B-03、超时） |
| src/hooks/model/{SectionConfig,FieldRules,UploadPrecheck,SectionView}.ts（+ 测试） | 新增 | hooks/model | 1.5 / REQ-FE-01、02、03、04 | 中（校验规则与契约一致性） |
| src/hooks/model/SessionReducer.ts（+ 测试）、SectionView.ts（`buildSectionUpdate`） | 新增 / 修改 | hooks/model | 1.6 / REQ-FE-04.3–04.8、05.2 | **高**（F-03、确认流程） |
| frontend-docs/HR_PR-1/05_task/{tasks,changelog}.md | 修改 | 文档 | 各任务 | — |

## 3. Evidence Pack
| 证据 | 路径 | 状态 | 说明 |
|------|------|------|------|
| 仓库约定 | codes/hr-collection-agent-frontend/AGENTS.md | ✅ 已确认（v1） | 非草稿 |
| 需求 | frontend-docs/HR_PR-1/01_requirements/requirements.md | ✅ 已读 | |
| 设计 | frontend-docs/HR_PR-1/04_design/design.md（v1.1） | ✅ 已读（§3、§5、§6） | |
| 接口说明 | frontend-docs/HR_PR-1/03_api/interface_spec_resume.md | ✅ 已读 | |
| 任务与变更记录 | 05_task/tasks.md、changelog.md | ✅ 已读 | 1.1–1.6 均标 ✅，与代码一致 |
| 冻结契约 | backend-docs/HR_PR-1/03_api/openapi.yaml（0.1.1） | ✅ 已读 | 22 键、13 业务码、5 reason、pattern、各上限逐项人工核对 |
| 跨 Workbench 评审 / 原型评审 | 01-requirements/HR_PR-1/{cross-workbench-review,prototype-review}.md | ✅ 已读 | 与本批无新增冲突 |
| 架构约束 / ADR | project-memory/architectural_constraints.md、adr_index.md（ADR-001..006） | ✅ 已读 | 本批涉及 F-01/F-02/F-03、B-03、ADR-004（幂等重试）、ADR-006（无自由文本） |
| 工程规范 | rules/frontend/coding.md | ✅ 已读 | |
| 审查参考 | .github/skills/code-reviewer/references/frontend.md | ✅ 已加载 | |
| 走读 / 自测报告 | — | 不存在 | 不阻断 |

## 4. BLOCKING Issues（必须修复才能合并）

无。

核对过但**未**构成 BLOCK 的高风险点（均有代码证据）：
- F-01：全仓库 `fetch` 仅出现在 `src/api/ApiClient.ts:50`（及测试的 mock）；无 `XMLHttpRequest` / `WebSocket` / 直连外部地址；无密钥、凭证、环境变量读取。
- F-02：`src` 内无 `localStorage` / `sessionStorage` / `indexedDB` / `document.cookie`；ESLint 以 `no-restricted-globals` + `no-restricted-properties` 覆盖 `window` / `globalThis` / `self` / `top` / `parent` 写法，并有 13 个永久用例（`src/test/EslintRules.test.ts`）在内存中验证。
- F-03（状态机层）：`phase: 'saved'` 只在 `CONFIRM_SUCCEEDED` 分支设置（`SessionReducer.ts:337-366`），该分支要求 `busy === 'confirm'` 且 epoch 匹配；进入 `busy: 'confirm'` 必须经 `CONFIRM_REQUESTED`（要求 `view === 'final'`、`coreReady`、无未提交编辑；仍有未确认字段则先弹 `unconfirmed` 对话框，`SessionReducer.test.ts:306-321`）。`CONFIRM_FAILED` 的 `draft_not_found` 只给 `maybe_saved` 提示，不进入成功态（测试 `SessionReducer.test.ts:360`）。`already_saved=true` 只设 `notice: 'already_saved'` 且 `savedSummary: null`（P-09、D-04，测试 `:350`）。
- B-03：`ApiClient.logFailure` 只输出 `request_id`、`code`、`status`；`ApiError.parseDetails` 只保留 `field` / `reason`；非契约错误体统一为 `unknown_error` 且不暴露原文（测试用中文哨兵内容验证）；`ErrorBoundary` 只记 `error.name`。

## 5. QUESTIONS（需要人类裁决）

### QUESTION-1：`engines.node` 为 `>=24`，但依赖链不支持 Node 25，是否收紧
**位置**：`package.json:6-8`；`AGENTS.md` 待确认 #4（DL 2026-11-10 决定 `">=24"`，“本机 v25.8.2 满足”）
**证据**：本人在 Node v25.8.2 复跑 `npm ci --dry-run` 得到 `EBADENGINE`：`jsdom@31.0.0` 要求 `^22.22.2 || ^24.15.0 || >=26.0.0`，`vitest@5.1.0` 要求 `^22.12.0 || ^24.0.0 || >=26.0.0`。测试与构建在 Node 25 上实际通过（见 §7），所以目前只是告警，不是故障。
**问题**：`>=24` 在字面上包含 Node 25（奇数版本，非 LTS，且被测试链路声明不支持）。AGENTS.md 的“本机 v25.8.2 满足”与依赖的声明矛盾。是继续接受 Node 25，还是把基线收紧为 Node 24 LTS / ≥26？
**需要谁裁决**：Dev Lead
**不同答案的影响**：
- 保持 `>=24`：零改动，但 Node 25 上的行为不被 jsdom / vitest 官方保证，将来升级这两个包时可能突然失败。
- 收紧为 `^24 || >=26`（并加 `.nvmrc` 写 24）：需更新 package.json、AGENTS.md（#4 的结论与技术栈表）；本机开发者要切到 24。建议的选项，成本很低。

### QUESTION-2：未经 Dev Lead 事先同意新增的 6 个配套依赖，是否追认
**位置**：`package.json:15-36`；`AGENTS.md`“依赖安装约定”：“新增依赖须先经 Dev Lead 同意”；tasks.md 1.1：“只引入上面列出的必要依赖”
**证据**：changelog Task-1.1 自报“5 个配套包”，但列出的是 6 个：`@testing-library/dom`、`@types/react`、`@types/react-dom`、`@eslint/js`、`typescript-eslint`、`globals`（计数与清单不一致，以清单为准）。
本人核对必要性（均为实际安装的 `node_modules/*/package.json` 的 peerDependencies / 代码引用）：
- `@testing-library/dom`：`@testing-library/react@16.3.3` 的必需 peer（`^10.0.0`）。
- `@types/react`、`@types/react-dom`：同一包 peer；TS strict 编译 TSX 必需。
- `typescript-eslint`：tasks 1.1 要求“ESLint（TypeScript …规则）”；`eslint.config.js:4` 使用。
- `@eslint/js`、`globals`：`eslint.config.js:1-2` 使用（recommended 规则集、浏览器全局）。
- 包名均为官方 / 主流包，无 typosquatting 迹象；全部精确版本；`package-lock.json` 的 `resolved` 全部指向 `registry.npmjs.org`（313 处，无其他域名）；`npm audit --omit=dev` 为 0 个漏洞。
**问题**：技术上都是必需配套，但 AGENTS.md 要求事先同意；这是流程偏差，需要 DL 追认并在 tasks / AGENTS 依赖清单里登记（AGENTS.md 技术栈表“测试与检查”一行目前没有列出它们）。
**需要谁裁决**：Dev Lead
**不同答案的影响**：
- 追认（建议）：更新 AGENTS.md 依赖说明 / tasks 1.1 清单，无代码改动；后续新增依赖继续先申请。
- 不追认：需要用别的方式替代（例如不用 typescript-eslint 就失去 TS 规则），实际不可行，不建议。

## 6. SUGGESTIONS（不影响合并，建议后续优化）

### SUGGEST-1：响应体读取阶段超时会被归为 `unknown_error`，而不是 `client_timeout`
**位置**：`src/api/ApiClient.ts:49-57`
**现状**：`response.json()` 被一个内层 `try/catch` 包住，捕获后只置 `payloadOk = false`。如果在响应头已到达、读取响应体期间触发 30s / 75s 的 `AbortController`，抛出的 `AbortError` 被吞掉，随后落到 `unknown_error`（`response.ok` 时）或 `ApiError.unknown(status)`，而不是 `ApiError.timeout()`。（按代码推断，未单独构造慢响应体复现；现有 `stubHangingFetch` 只覆盖响应头阶段挂起。）
**建议**：内层 catch 里先判断 `timedOut`，为真则抛 `ApiError.timeout()`；补一条“响应头已到、响应体挂起”的测试。对用户的影响是提示文案不同，不涉及数据正确性。

### SUGGEST-2：长度校验用 UTF-16 `.length`，与 OpenAPI `maxLength`（按字符）在非 BMP 字符上不一致
**位置**：`src/hooks/model/FieldRules.ts`（`isValidEmail`、`validateScalar`、`validateStringList`、`validateObjectList` 中的 `.length`）
**现状**：JSON Schema / Python 按 Unicode 码点计数，JS `.length` 按 UTF-16 码元计数；含 emoji 等非 BMP 字符的内容，前端会比后端更早判 `too_long`（更严，不会放过 backend 会拒绝的值）。
**建议**：改用 `[...value].length`（或 `Array.from`），补一条边界测试。优先级低，简历内容很少出现此类字符。

### SUGGEST-3：契约镜像测试使用复制的常量，缺少对 `openapi.yaml` 的自动漂移检测
**位置**：`src/types/Contract.test.ts:25`（注释“Expected values are copied from … openapi.yaml (0.1.1) on purpose”）；`FieldRules.test.ts` 的上限边界断言
**现状**：本人已逐项人工核对 22 键、13 业务码、5 reason、phone / email pattern、各 `maxLength` / `maxItems`（FieldRules.ts:8-62）与 openapi.yaml:279-312、457-494 一致。但测试本身不会在契约变更后失败，仍依赖人工记得更新（changelog 1.3 已声明这个风险）。
**建议**：不新增依赖的前提下，加一个读取 `backend-docs/.../openapi.yaml` 的轻量脚本 / 测试（只在文件存在时运行，并像 backend 一样在 CI 中要求存在），或把“契约变更 → 更新 `OPENAPI_VERSION` 与 `FIELD_MAX_LENGTH`”写进 cross-workbench-reviewer 的检查单。

### SUGGEST-4：ESLint 的 F-01 防线可再收紧
**位置**：`eslint.config.js:30-52`
**现状**：`fetch` 禁用范围按 AGENTS.md 只覆盖 `src/pages`、`src/components`、`src/hooks`，符合约定；但 `src/App.tsx`、`src/main.tsx`、`src/types` 不在范围内，也没有对 `XMLHttpRequest`、`WebSocket`、`EventSource`、`navigator.sendBeacon` 设限，F-01 靠人工约束。
**建议**：把 `fetch` 禁用改成“除 `src/api/**` 和测试外全部禁用”，并把上述几个 API 加入 `no-restricted-globals` / `no-restricted-properties`，补对应的 `EslintRules.test.ts` 用例。需要 DL 同意是否扩展 AGENTS.md 的红线文字（目前它字面限定三个目录）。

### SUGGEST-5：`npm audit` 的 10 项 moderate 记录跟踪点
**位置**：`package-lock.json`（minimatch 7.0.0–11.0.0，经 `eslint` / `@eslint/config-array` / `typescript-eslint` 传递）
**现状**：本人复跑 `npm audit --registry=https://registry.npmjs.org`：10 moderate，漏洞为 minimatch 的 globparts 放大 DoS（GHSA-g3hv-75wg-m249）；`npm audit --omit=dev` 为 **0**，即不进入构建产物。audit 给出的修复建议是降到 ESLint 9（`--force`，破坏性）。
**建议**：不处理（接受 worker 的判断）。在 changelog 或 AGENTS.md 里登记“待 eslint / typescript-eslint 升级后复查”，避免每次新开发者重新评估。注意审查机器上 npm 默认源是镜像，镜像不支持 audit 接口，需显式 `--registry=https://registry.npmjs.org`。

## 7. 测试与验证证据
| 项目 | 状态 | 说明 |
|------|------|------|
| `npm ci --registry=https://registry.npmjs.org` | ✅ | 按锁文件安装成功；输出 10 moderate 提示；`--dry-run` 另见 jsdom、vitest 的 `EBADENGINE`（Node v25.8.2，见 QUESTION-1） |
| `npm run lint`（`eslint . --max-warnings 0`） | ✅ 退出码 0，无告警 | |
| `npm test`（`vitest run`） | ✅ **15 个测试文件、226 个用例全部通过**，耗时约 3 s | 输出里 `ErrorBoundary.test.tsx` 会打印 React 的异常栈（jsdom 对故意抛错的 `Boom` 组件的框架输出），不是应用日志 |
| `npm run build`（`tsc --noEmit && vite build`） | ✅ | tsc 无错误；Vite 8.3.7 `1399 modules transformed`，产物 `dist/assets/index-*.js` 216.60 kB（gzip 73.16 kB），有真实的类型检查与打包动作 |
| Node / npm | v25.8.2 / 11.11.1 | 与 AGENTS.md“本机 v25.8.2”一致 |
| `npm audit` | 10 moderate（dev 链），`--omit=dev` 0 | 见 SUGGEST-5 |
| `npm view typescript version` | 7.0.2 | 佐证 worker 所说“npm 最新为 7.0.2”；`typescript-eslint@8.72.2` 的 peer 为 `typescript >=4.8.4 <6.1.0`（本机 node_modules 核实），因此 6.0.3 是该组合下的最高可用版本 |
| 密钥与真实简历 | ✅ 未发现 | `git ls-files codes/` 无 `.env`、`node_modules`、`dist`；`.npmrc` 无凭证；测试数据均为合成（`测试用户甲`、`13800138000`、`test.user@example.com`） |
| 覆盖率 | 未测 | 本批未跑覆盖率，不声明覆盖率达标 |

### 维度结论
| 维度 | 结论 |
|------|------|
| 架构合规 | ✅ 目录与 AGENTS.md 一致（`src` 下仅 `api/components/hooks(model)/types/test`），`hooks/model` 为无 DOM 纯逻辑，`api` 是唯一 fetch 出口；无状态管理库 / 路由库 / 请求库（`package.json` 已核对）；代理 `/api → http://127.0.0.1:8000`，未设 `cookieDomainRewrite` / `cookiePathRewrite`，`timeout` / `proxyTimeout` 120 s ≥ 75 s（`vite.config.ts:6-24`，有 `ViteConfig.test.ts`）。 |
| 业务逻辑 | ✅ 手机号先去空格 / 连字符再按 pattern 校验，`pattern` 使用 ASCII `\d`，与 OpenAPI 一致；核心三项空白 → `required`；整区 PATCH 体由 `buildSectionUpdate` 生成并先做本地校验；`epoch` + `busy` 丢弃过期响应；上传失败不清旧草稿（O-02）；GET 404 为空态，其他失败进入 `bootstrap_failed` 而非空态（裁决 F-03）；`saved` 后不保留手机号 / 邮箱（仅 `name`、`filename`、`saved_at`，TD-11）。仅状态机层核对，页面层待 2.x。 |
| 编码规范 | ✅ 文件 PascalCase、类型与 OpenAPI 同名、英文注释、文件头注明 OpenAPI 版本；`ApiClient` 以函数而非类实现，已登记为偏差。 |
| 安全 | ✅ 未发现可见问题（F-01、F-02、B-03 见 §4）；仅按“未发现可见安全问题”表述，不宣称安全已通过（页面、组件未实现）。 |
| 测试覆盖 | ✅（对本批范围）：226 个用例，reducer 63 例表驱动覆盖 design §5.3 转移（含 F-03 相关的“确认前不进入成功态”“maybe_saved 不是成功态”“already_saved 不展示内容”）；api 层用手写 `fetch` mock 覆盖 200 / 201 / 4xx / 非 JSON / 超时 / 网络错误 / 404 空态且断言 `console` 无请求体或响应体；ESLint 红线有永久用例。界面层 F-03 交互测试属 2.x。 |

### 逐项评估 worker 自报偏差
| # | 偏差 | 建议 | 依据与条件 |
|---|------|------|------------|
| 1 | TypeScript 取 6.0.3 而非 npm 最新 7.0.2 | **接受** | `typescript-eslint@8.72.2` peer 为 `typescript <6.1.0`（已核实）；7.x 会破坏 lint 链路。条件：升级 typescript-eslint 后再评估升 TS，登记在 changelog 遗留风险里（已登记）。 |
| 2 | 增加 6 个配套包（自报“5 个”，清单实为 6 个） | **接受内容，需 DL 追认流程** | 见 QUESTION-2：均为 peer 或配置必需，无可疑包名，版本精确，来源为官方 registry。 |
| 3 | Node 25 与 `engines >=24` | **暂接受，交 DL 裁决** | 见 QUESTION-1：测试与构建在 Node 25 实际通过，仅有 `EBADENGINE` 告警；建议收紧为 `^24 \|\| >=26` 并加 `.nvmrc`。 |
| 4 | `npm audit` 10 项 dev 中危（minimatch） | **接受** | 全部在 dev 工具链，`--omit=dev` 为 0，不进入产物；修复需降级 ESLint 9，属破坏性变更，不值得。见 SUGGEST-5。 |
| 5 | ESLint 红线用永久 Vitest 用例验证（代替“临时违规文件”） | **接受** | 比临时文件更可靠，且不入库违规代码。 |
| 6 | 手机号 `maxLength 32` 在规范化后的值上校验（AGENTS 写“针对提交前的原值”） | **接受** | 前端提交的就是规范化后的值（`toSubmitScalar`），backend 校验的也是该提交值；规范化后最长 16 位（pattern 上限），不会被 backend 拒绝。 |
| 7 | `buildSectionUpdate` 放在 `SectionView.ts`；`ApiClient` 导出函数 `request` 而非类；类型文件额外导出 `as const` 常量数组 | **接受** | 均为实现形式选择，纯逻辑仍在 `hooks/model/`，不违反分层。 |

## 8. Review Standards 候选沉淀
- **前端依赖基线**：`engines.node` 的范围不得包含主要依赖声明不支持的版本；新增依赖（含 peer 配套）先申请，申请记录与 changelog 的清单数量必须一致。
- **契约镜像测试**：手写类型 + 复制常量的方案必须配套自动漂移检测（读契约文件）或进入 cross-workbench-reviewer 检查单。
- **ESLint 红线测试**：红线规则用内存代码样例做永久用例，规则变更时同步更新。
- **请求超时语义**：超时计时器覆盖到响应体读取完成，且各阶段的中止都映射为同一类客户端错误。

## 9. 正向反馈
- F-03 在状态机层“只信后端成功”的设计清晰：`saved` 只由 `CONFIRM_SUCCEEDED` 驱动，`draft_not_found` 与超时都不会误报“已保存”，且有对应表驱动测试。
- `epoch` + `busy` 双重判定丢弃过期响应，并有“新对话后迟到响应”“过期上传 / PATCH / 确认”用例，避免异步竞态。
- `ApiError` 对非契约错误体一律降为固定文案，且测试用哨兵文本验证不泄露；`details` 只保留 `field` / `reason`。
- ESLint 同时用 `no-restricted-globals` 与 `no-restricted-properties` 覆盖 `window.xxx` / `globalThis.xxx` 写法，并以永久用例验证，且 `--max-warnings 0`。
- 依赖全部精确版本、lockfile 无镜像域名、`.npmrc` 无凭证，供应链基础规范。
- 变更记录（偏差说明、遗留风险）如实，TypeScript 版本与 Node 版本问题都是 worker 主动披露的。

---

## Dev Lead 裁决（2026-11-10）

| 项 | 裁决 |
|---|---|
| QUESTION-1 | 保持 `engines.node >=24` 不改；本机 Node 25 的 EBADENGINE 警告记为已知风险（测试与构建实测通过） |
| QUESTION-2 | 追认 6 个配套依赖；以后新增依赖须先用 ask 申请 |
| SUGGEST-1 | 在任务 2.2（上传）中处理：响应体读取阶段的超时归为 `client_timeout` |
| 其余 SUGGEST | 记为跟踪项，在后续相关任务中顺带处理 |
| 自报偏差 | 按审查建议全部接受（TS 6.0.3、npm audit 10 项 dev 中危记为已知风险） |
| 结论 | frontend 第一批通过 |

---

## 第二批审查（任务 2.1–2.5：页面骨架、上传、识别结果展示、分区编辑、经历子项编辑）

- 日期：2026-11-10
- Review 模式：Ticket-aware Review；Reviewer：Yin Yang（dev-lead，审查 agent 代行）
- 审查对象：提交 f9d8ba5、fa74d88、fab8249、eeb7af0、7c08e83（合并 d8dbc69）；本 worktree 已 `git merge feature`。
- 本批结论：**PASS_WITH_SUGGESTIONS**（0 BLOCK / 0 QUESTION / 6 SUGGEST）
- 上下文限制：
  - 本批尚无最终确认卡（2.6）、新对话与“已保存”结果卡（2.7）、无障碍收尾（2.8）。F-03 的“确认保存”交互只能核对“当前不存在任何可触发保存/成功提示的路径”，真正的确认流程留给 2.6（HIGH_RISK）审查。
  - 未做浏览器实机交互；以源码走读、`npm test` 用例与构建结果为证据。
  - 第一批遗留的 QUESTION-1（Node 范围）、QUESTION-2（配套依赖追认）仍待 DL 裁决，不在本批范围。

### Review Scope
| 文件 | 对应任务 | 风险 |
|---|---|---|
| `hooks/useResumeSession.ts`、`pages/ResumeCollectionPage.tsx`、`App.tsx` | 2.1–2.5 | **高**（F-01、F-03、状态机副作用） |
| `components/{AppShell,NewChatButton,ChatThread,WelcomePanel,NoticeBanner,BootstrapErrorPanel,ErrorAlert}.tsx` | 2.1 | 中 |
| `components/{ComposerBar,FileCard,UploadProgressNotice,ConfirmDialog}.tsx`、`api/ApiClient.ts` | 2.2 | 中（上传、超时） |
| `components/{FieldStatusTag,ReadOnlySection,ReviewSummary,SectionCard}.tsx`、`hooks/model/SectionView.ts` | 2.3 | 中（B-04/F-03 展示面） |
| `components/{FieldRow,StringListEditor,QuickReplyChips}.tsx` | 2.4 | 中（校验、PATCH 请求体） |
| `components/ObjectListEditor.tsx`、`buildSectionUpdate` | 2.5 | 中 |
| 24 个组件/页面测试文件、`test/ApiMocks.ts`、`test/setup.ts`、`Layout.css` | 2.1–2.5 | 低 |

### 核对结果（验收标准与红线）
| 项 | 结论 | 证据 |
|---|---|---|
| F-01 不直连/不保存密钥 | ✅ | 全仓库 `fetch` 仅在 `api/ApiClient.ts`；页面经 `useResumeSession` → `api` 层；`ResumeCollectionPage` 不请求接口；ESLint 通过 |
| F-02 不写浏览器存储 | ✅ | 非测试源码无 `localStorage/sessionStorage/indexedDB/document.cookie`；编辑缓冲只在 reducer 内存 |
| F-03 确认前不提示“已保存” | ✅（本批范围） | 源码中只有 `NoticeBanner` 的 `maybe_saved`（“可能已保存，请重新上传核实”）与 `already_saved`（“该简历已保存过”，P-09），二者只由 `CONFIRM_*` 动作触发，而 2.6 前页面没有任何会派发 `CONFIRM_REQUESTED` 的入口；`final` 视图只有临时“我还要修改”按钮 |
| O-12 GET 404 为空态；其他失败不当空态 | ✅ | `getCurrentResumeDraft` 404→`null`；页面 `bootstrap_failed` 渲染 `BootstrapErrorPanel` 并隐藏上传入口（裁决 F-03）；测试在 `ResumeCollectionPage.test.tsx` |
| O-10 `draft_not_found` 按接口区分 | ✅（PATCH） | reducer `PATCH_FAILED` 的 `draft_not_found` → 空态 + `draft_expired` 提示；确认接口的 `maybe_saved` 随 2.6 |
| C-07 重新上传前二次确认 | ✅ | 有草稿时 `FILE_SELECTED` → `needs_overwrite` → `ConfirmDialog`（“覆盖当前草稿”，文案含“未提交的修改”）；取消不发请求、确认才上传；`dialog` 非空时拖拽被 reducer 忽略 |
| 上传预校验（类型、10 MB、0 字节、多文件） | ✅ | 复用第一批 `precheckFile`/`pickSingleFile`；`ComposerBar` 的 `accept` 与单选；多文件给出提示 |
| 75 s 超时文案、失败保留旧草稿（O-02） | ✅ | 页面将 `client_timeout` 覆盖为“识别时间过长，请重新上传。”；`UPLOAD_FAILED` 不清 `draft` |
| 单一加载提示、不伪造进度（P-05） | ✅ | `UploadProgressNotice`：“正在识别，最长约 1 分钟”，无步骤/耗时 |
| P-02、P-11 外壳最小化 | ✅ | `AppShell` 仅标题与“＋ 新对话”，无用户信息/历史/填写指南/隐私说明/示例文件 |
| P-04、ADR-006 结构化分区、无自由文本 | ✅ | 11 个分区；`ComposerBar` 无文本框；`QuickReplyChips` 只触发既有动作 |
| P-06、P-10 状态与手机号展示 | ✅ | 四种状态文字 + 颜色；`missing/uncertain` 置顶高亮；手机号完整显示；未提交编辑只加“未提交修改”标记，不改变状态标签 |
| P-09、D-04 不展示记录编号 | ✅ | 非测试源码无 `resume_id`/`draft_id` 引用 |
| B-03 控制台 | ✅ | 非测试源码只有 `ApiClient.logFailure`（`request_id/code/status`）与 `ErrorBoundary`（类名）两处 `console.error` |
| PATCH 请求体（design §4.4） | ✅ | `confirmSection` 用 `buildSectionUpdate`（整区、手机号规范化、文本 trim、空白非核心→`null`、列表完整替换），测试覆盖“未触碰分区不提交” |
| 表单校验与契约一致 | ✅ | `FieldRow` 使用第一批 `validateScalar`（pattern/上限同 OpenAPI），不自定数值；后端 422 `details` 只显示 reason 文案 |

### 第一批 SUGGEST-1 是否关闭
**已关闭。** `api/ApiClient.ts:52-58`：读取响应体失败时先判断 `timedOut`，为真抛 `ApiError.timeout()`（并经外层 catch 保持 `client_timeout`）；`ApiClient.test.ts` 新增 2 个用例（响应头已到、body 挂起；成功与错误响应各一）。第一批其余 SUGGEST（长度按码点、契约漂移检测、ESLint 收紧、audit 跟踪）仍为跟踪项，本批未处理，符合 DL 裁决。

### BLOCKING Issues
无。

### QUESTIONS
无。

### SUGGESTIONS
- **第二批-SUGGEST-1（拖拽文件可能让浏览器离开页面，丢失未提交编辑）**：`components/ComposerBar.tsx:32-47`，`onDrop/onDragOver` 监听仅在 `!disabled` 且 `ComposerBar` 已挂载时注册。上传/保存进行中（`busy`）、启动阶段、读取失败、已保存阶段（composer 不渲染）把文件拖进页面，浏览器会按默认行为打开该文件并**离开当前页**，内存中的编辑缓冲（TD-03）和在途请求都会丢失。建议始终注册 `dragover/drop` 的 `preventDefault()`，只在可上传时才调用 `onFiles`。
- **第二批-SUGGEST-2（业务规则在页面与组件中重复）**：`pages/ResumeCollectionPage.tsx` 的快捷指令 `blocked`（`alreadyConfirmed`/`dirty`/`sectionConfirmBlock`）与 `SectionCard.tsx` 的 `confirmDisabled` 是同一条规则的两份实现；AGENTS.md 要求业务规则只放 `hooks/model/`。建议在 `SectionView.ts` 提供 `canConfirmSection(...)`，两处共用，避免后续改一处漏一处。
- **第二批-SUGGEST-3（“＋ 新对话”在 2.7 前点击无反应）**：`NewChatButton` 在可用状态下 `onClick` 为空。建议 2.7 前直接禁用（或不渲染），避免联调/演示时误判为缺陷；若保持现状，请确保 2.7 与 2.6 同一批次交付。
- **第二批-SUGGEST-4（空白行在失焦时被移除可能引发误点）**：`StringListEditor.tsx` 的 `onBlur` 会立刻删除空白行，行高变化可能让同一次点击落在相邻的“删除”按钮上（按下时失焦、抬起时布局已变）。属可能性判断，未实机复现；建议用 `onMouseDown` 阻止按钮抢焦点，或延后到 `requestAnimationFrame` 后再删，并在 2.8 的键盘/可达性验收里覆盖。
- **第二批-SUGGEST-5（遗留风险的归口）**：`role="alert"` 连续播报（`ErrorAlert`、`NoticeBanner`、Ant Design `Alert` 默认角色）和 `key={index}` 的 `<details>` 展开状态随下标漂移，均不影响数据正确性，同意放到 2.8 评估（提示类改 `role="status"`）；`ObjectListEditor` 若引入稳定的客户端 id 可顺带解决下标 key，成本很低。
- **第二批-SUGGEST-6（设计文档回写）**：偏差③（提交时丢弃完全为空的新增子项）会改变 design §4.4 的“列表提交完整新列表”口径，建议在下一次设计增量修订中补一句，并保留 `SectionView.test.ts` 中对应用例作为依据。

### 逐项评估 worker 自报偏差
| # | 偏差 | 建议 | 依据与条件 |
|---|------|------|------------|
| ① | `ErrorAlert` 从 2.2 提前到 2.1 | **接受** | 启动失败面板（2.1）依赖它；2.2 直接复用，无功能变化。 |
| ② | “未提交修改”确认框与最终视图的临时“我还要修改”按钮提前到 2.4 | **接受** | 快捷指令“其余都没问题”会让 reducer 进入 `unsubmitted_edits` 对话框与 `view=final`，若 UI 不渲染，`dialog` 非空会让后续动作全被忽略（状态机卡死）。条件：2.6 用最终确认卡替换临时按钮，且 `new_chat`、`unconfirmed` 两个对话框随 2.6/2.7 一起接线（当前它们不可达）。 |
| ③ | `buildSectionUpdate` 提交时丢弃完全为空的新增子项 | **接受** | 避免把“只点了添加却没填”的占位项存入草稿；校验错误仍按用户所见下标报告（先校验后过滤）；全空提交 `[]`，与“确认留空”语义一致。见 SUGGEST-6。 |
| ④ | 输入区与欢迎页各有一个上传入口 | **接受** | 与原型一致；两者调用同一选择器和同一 reducer 预校验；仅需保证无障碍名称区分（2.8 可处理）。 |

### 遗留风险评估
| 风险 | 评估 |
|---|---|
| “＋新对话”在 2.7 前无反应 | 接受，但建议先禁用（SUGGEST-3）。 |
| Ant Design `Alert` 的 `role=alert` 连续播报 | 接受，归口 2.8（SUGGEST-5）。 |
| 子项以下标为 key | 接受，仅影响折叠状态显示，不影响数据（SUGGEST-5）。 |

### 测试与验证证据
| 命令 | 结果 |
|---|---|
| `npm ci --registry=https://registry.npmjs.org` | ✅ 成功 |
| `npm run lint`（`--max-warnings 0`） | ✅ 退出码 0，无告警 |
| `npm test`（`vitest run`） | ✅ **38 个测试文件、405 个用例全部通过**（第一批为 15 个文件、226 个用例）；输出中的 `Error: render failed for 测试用户甲 …` 是 `ErrorBoundary` 用例故意抛错时 React/jsdom 的框架输出（内容为合成数据），不是应用日志 |
| `npm run build`（`tsc --noEmit && vite build`） | ✅ 1431 modules transformed |
| `npm audit --omit=dev` | ✅ 0 vulnerabilities |
| 密钥与真实简历 | ✅ 未发现；测试数据为合成（`测试用户甲`、`13800138000` 等） |
| 覆盖率 | 未测，不声明达标 |

### 维度结论
| 维度 | 结论 |
|------|------|
| 架构合规 | ✅ pages → hooks → api 单向；页面不请求接口；组件不持有状态机逻辑（SUGGEST-2 为小幅重复）；无新增状态/路由/请求库 |
| 业务逻辑 | ✅ 上传、覆盖确认、整区 PATCH、422 字段映射、过期草稿处理与设计 §5.3 一致；确认保存留待 2.6 |
| 编码规范 | ✅ PascalCase、英文注释、AntD 单一组件库；`useResumeSession` 以 `latest` ref 同步状态并在 `send` 中前后对比，StrictMode 下 bootstrap 仅一次请求 |
| 安全 | ✅ 未发现可见问题（F-01/F-02/B-03 见上表），不宣称安全已通过 |
| 测试覆盖 | ✅（对本批范围）：组件与页面共 24 个测试文件，覆盖上传预校验/覆盖确认/超时、四种状态展示、编辑与整区 PATCH、422 映射、经历子项增删改 |

### 正向反馈
- 把“请求发起”与“结果”分离：reducer 只改 `busy`，hook 在 `busy` 变化时发请求并带 `epoch`，过期响应自然被丢弃，副作用集中一处。
- 启动失败不当空态并隐藏上传入口，避免用户在读不到草稿时覆盖服务器上仍然存在的草稿。
- `FieldRow` 不设 `maxLength` 属性，避免静默截断用户输入，而是提示“内容过长”。
- 未提交编辑只用“未提交修改”标记，不伪造第五种字段状态；状态标签始终来自后端。
- 偏差与遗留风险在 changelog 里如实披露，且带明确的归口任务。

### 更新后的本批结论
**PASS_WITH_SUGGESTIONS**。建议 DL 将 2.1–2.5 视为通过审查；2.6（HIGH_RISK，F-03）审查时再核对确认流程、`unconfirmed`/`new_chat` 对话框接线与“已保存”提示的触发条件。

---

## Dev Lead 裁决（第二批，2026-11-10）

| 项 | 裁决 |
|---|---|
| 结论 | frontend 2.1–2.5 通过 |
| 偏差 ①–④ | 全部接受。② 的条件是：2.6 替换掉临时按钮，new_chat / unconfirmed 确认框随 2.6/2.7 接线；③ 补写进设计 §4.4 |
| SUGGEST：拖拽离开页面（ComposerBar.tsx:32-47） | 在下一批（任务 2.6）中修复 |
| 其余 SUGGEST | 记为跟踪项，归入 2.7 / 2.8 |

---

## 第三批审查（任务 2.6：最终确认与保存，HIGH_RISK：F-03）

- 日期：2026-11-10；Review 模式：Ticket-aware Review；Reviewer：Yin Yang（dev-lead，审查 agent 代行）
- 审查对象：提交 2bdd002（合并 c76cdb1）；本 worktree 已 `git merge feature`。
- 本批结论：**PASS_WITH_SUGGESTIONS**（0 BLOCK / 0 QUESTION / 5 SUGGEST）
- 上下文限制：未做浏览器实机交互；以源码走读、用例与构建结果为证据。`new_chat` 对话框与“＋ 新对话”接线属 2.7，不在本批。

### Review Scope
| 文件 | 风险 |
|---|---|
| `components/FinalReviewCard.tsx`、`components/SavedResultCard.tsx` | **高**（F-03） |
| `hooks/useResumeSession.ts`（`confirmResume`、`proceedUnconfirmed`、`startConfirm`、`uploadNext`、`backToSections(section?)`）、`pages/ResumeCollectionPage.tsx` | **高** |
| `hooks/usePreventFileDropNavigation.ts`、`components/ComposerBar.tsx` | 中（拖拽离开页面） |
| `components/NoticeBanner.tsx` | 低 |
| 测试：`ResumeCollectionPage.final.test.tsx`（30 例）、`FinalReviewCard/SavedResultCard/usePreventFileDropNavigation/ComposerBar` 测试 | — |
| `design.md`（v1.2）、`changelog.md` | — |

### 1. REQ-FE-04.1–04.8 逐条核对
| AC | 实现证据 | 测试证据 | 结论 |
|---|---|---|---|
| 04.1 独立最终确认；核心三项就绪才可点（D-03） | `FinalReviewCard` 的“确认提交”`disabled={!coreReady || busy}`；`coreReady` 要求三项均 `confirmed`、值合法、无未提交编辑；reducer `CONFIRM_REQUESTED` 对 `!coreReady` 直接忽略（双重防线） | final.test “04.1”组 4 例；`FinalReviewCard.test` | ✅ |
| 04.2 有未确认字段先提示；继续即确认当前显示的全部内容（D-03） | `unconfirmed` 对话框已接线（`ResumeCollectionPage.tsx`：标题“还有字段未确认”，文案“继续将视为确认当前显示的全部内容”，`proceedUnconfirmed`）；`unsubmitted_edits` 对话框保留 | “04.2”组：取消不发请求、继续发一次、无未确认字段不弹窗、放弃修改 | ✅ |
| 04.3 成功前不显示“已保存”，不做乐观更新（F-03） | 见下文第 2 节 | “04.3”组 | ✅ |
| 04.4（v1.2）成功后清空内容，仅留姓名/文件名/保存时间；“上传下一份” | `CONFIRM_SUCCEEDED` 置 `draft:null/editBuffer:{}`，只保留 `savedSummary{name,filename,saved_at}`；`SavedResultCard`；结果阶段不渲染 composer | “04.4”组：三项展示、页面文本不含手机号/邮箱、无 `data-field`、无记录编号、上传下一份回空态 | ✅ |
| 04.5 `already_saved=true` 只显示一句话（D-04、P-09） | `SavedResultCard` 的 `alreadySaved` 分支只渲染“该简历已保存过”；`savedSummary:null` | “04.5”组：无姓名/文件名/手机号/邮箱；只按字段判断（201+true、200+false 两个交叉用例，O-08） | ✅ |
| 04.6 超时/网络失败不提示成功，可直接重试，不查询状态（C-05） | `CONFIRM_FAILED` 停留 `final`、按钮保持可点；失败文案“未收到保存结果，尚未确认保存成功，可直接重试。” | “04.6”组：请求序列恰为 `GET current → POST → POST`，无任何状态查询 | ✅（见第 5 节关于重试结果的说明） |
| 04.7 `draft_not_found` → “可能已保存，请重新上传核实”（D-01） | reducer `CONFIRM_FAILED` 的 `draft_not_found` → 空态 + `maybe_saved`，不进入成功态 | “04.7”组：提示出现、无成功态、内容清空、可重新上传 | ✅ |
| 04.8 请求期间防重复点击 | `busy='confirm'`：按钮 disabled+loading；reducer/`confirmResume` 在 `busy≠null` 时忽略；“我还要修改”同时禁用 | “04.8”组：多次点击只发 1 个 POST | ✅ |
| C-10 幂等键、C-11 确认后不可改、P-09 不展示记录编号 | 前端不构造/展示幂等键、`resume_id`、记录编号；保存后不提供任何修改入口 | 04.4/04.5 组断言无记录编号 | ✅ |

### 2. F-03 路径核对（HIGH_RISK）
- **唯一入口**：非测试源码中 `phase: 'saved'` 只在 `SessionReducer.ts` 的 `CONFIRM_SUCCEEDED` 分支设置（行 337–342）；`SavedResultCard` 只在 `case 'saved'` 渲染；`CONFIRM_SUCCEEDED` 只在 `useResumeSession.startConfirm` 里 `createResume()` 的 fulfilled 回调派发。该分支还要求 `busy==='confirm'`、epoch 匹配且 `draft!==null`，过期响应被丢弃。
- **无乐观更新**：派发“请求”动作时只置 `busy='confirm'`，页面此时仍是 `reviewing/final`；“已保存”字样在非测试源码中只出现于 `SavedResultCard`（成功后）以及 `FinalReviewCard` 里“当前不能确认是否已保存”的否定提示，后者不是成功提示。
- **请求体恰为 `{confirmed:true}`**：`ResumeApi.createResume` 固定构造 `{ confirmed: true }`；final.test 断言请求体 `{"confirmed":true}` 与 `credentials: 'same-origin'`。
- **各失败路径无成功态**（final.test “04.3”组逐一断言无 `saved-result`、无“已保存”）：进行中、500 `save_failed`、500 `internal_error`、422 `confirmation_required`、502 非 JSON、网络失败、超时（fake timers）。2xx 但非 JSON 由 `ApiClient.request` 抛 `unknown_error`（第一批已有用例）。
- **例外风险**：2xx 且为 JSON 但形状不对的响应，见 SUGGEST-2。

### 3. 拖拽修复
- `usePreventFileDropNavigation`（`ResumeCollectionPage` 顶层调用）在 `document` 上取消 `dragover/drop` 默认行为，覆盖读取中/读取失败/结果页等没有 composer 的阶段，卸载时清理监听；有单测。
- `ComposerBar.tsx`：监听器不再因 `disabled` 而卸载，`preventDefault()` 始终执行，仅 `!disabled` 时才把文件交给 `onFiles`；有“禁用时仍取消默认行为且不调用 `onFiles`”的用例。
- 结论：第二批 SUGGEST-1 **已关闭**。小问题见 SUGGEST-3。

### 4. 偏差落实
| 项 | 结论 |
|---|---|
| 偏差 ② | **已落实**：`FinalReviewCard` 替换了临时“我还要修改”按钮；`unsubmitted_edits`、`unconfirmed` 两个对话框都已接线；`new_chat` 未渲染，留 2.7（reducer 中该动作当前无入口）。 |
| 偏差 ③ | **已补写**：`design.md` 版本 v1.2，§4.4 新增“空子项处理”（丢弃全空子项、全空则提交 `[]`、校验在丢弃前按用户所见下标进行），变更履历追加 v1.2。第二批 SUGGEST-6 已关闭。 |

### 5. worker 提出的 4 个审查点
1. **F-03 路径**：见第 2 节，通过。
2. **确认时 422 回到分区视图并在活跃分区显示字段错误**：合理。`CONFIRM_FAILED` 的 `validation_failed` 把 `fieldErrors` 设为后端 `details`、切回 `sections` 视图并按第一个出错路径定位分区，错误卡复用 2.4 的分区级展示，用户能在字段旁看到原因并重新“确认本区”。`confirmation_required`（422，无 details）走 confirm 级错误，留在最终确认卡内显示（有用例）。**接受**。
3. **“去确认基本信息”入口**：合理且无副作用。`backToSections('basic')` 依次发 `BACK_TO_SECTIONS`、`SECTION_SELECTED`，仅在核心未就绪时出现，避免“我还要修改”落到无关分区的死路。**接受**。
4. **“超时后重试，如果其实已保存，会得到 `already_saved=true`”——核实结果：该说法错误，主 agent 的判断正确；前端的实际行为是对的，错的是 changelog 的文字。**
   - 契约依据：openapi.yaml `createResume` 描述：两种成功情形都会删除草稿并使令牌过期（C-11）；“草稿不存在/令牌无效（**含‘首次已成功但响应丢失后的重试’**）→ 404 `draft_not_found`（D-01）”；ADR-004 缺点一栏同样写明“确认成功后响应丢失的重试会得到 `draft_not_found`”。`already_saved=true` 只出现在“同一身份此前已保存，且本次仍持有有效草稿”的情形（例如重新上传同一人后确认）。
   - 前端实际行为：重试得到 404 时，`CONFIRM_FAILED`→`maybe_saved`（“可能已保存，请重新上传核实”）+ 空态，不进入成功态，行为正确（用例“04.7”组覆盖）。
   - 不正确之处：（a）changelog Task-2.6“遗留风险”第 2 条写“已保存但响应丢失的情形，重试会得到 `already_saved=true`”；（b）“04.6”组两条用例只覆盖“第一次确实没保存、重试成功”这一种，没有覆盖“第一次已保存但响应丢失 → 重试 404 → `maybe_saved`”这条与契约一致的路径（单独的 04.7 用例用的是首发就 404）；（c）`FinalReviewCard` 的提示“当前不能确认是否已保存，可直接重试（重复提交不会产生重复记录）”对用户略有误导：重试可能得到“可能已保存，请重新上传核实”而不是成功。未发现代码注释里有同样的错误说法。
   - 处理：不构成缺陷，列为 SUGGEST-1（更正文字并补一条用例），不升级为 QUESTION/BLOCK。

### 6. `NoticeBanner` 的 `role` 调整
**合理，接受。** `restored`、`already_saved` 为信息提示，改 `role="status"`（礼貌播报）；`draft_expired`、`maybe_saved` 是需要用户采取行动的警告，保留 `alert`。同时 `SavedResultCard` 本身是 `role="status"`。这兑现了第二批 SUGGEST-5 的一半（连续播报）；`ErrorAlert` 仍是 `alert`，符合“错误需立即告知”。

### BLOCKING Issues
无。

### QUESTIONS
无。

### SUGGESTIONS
- **第三批-SUGGEST-1（更正 ④ 的文字并补用例）**：更正 changelog 的错误说法为“已保存但响应丢失时，重试得到 404 `draft_not_found`，界面显示‘可能已保存，请重新上传核实’（D-01）”；在 final.test 的 04.6 组追加“首次超时 → 重试返回 404 → 出现 `maybe_saved`、无成功态”用例；可把 `FinalReviewCard` 提示改为“可再试一次；若提示草稿不存在，则可能已保存，请重新上传核实”。
- **第三批-SUGGEST-2（成功响应形状校验，F-03 加固）**：`ApiClient.request` 对 2xx 只做 `payload as T`。如果某个代理/网关返回 `200` 的 JSON（如 `{}`、`null`、`[]`），`createResume` 会被当作成功：`CONFIRM_SUCCEEDED` 中 `response.already_saved` 为 `undefined`，走“新保存”分支，界面显示“已保存”和无效的保存时间。这违反“只在 backend 返回成功后才提示已保存”的精神（按代码推断，未单独构造该响应运行）。建议在 `createResume`（以及两个草稿接口）里做最小形状校验：`typeof resume_id==='string' && typeof already_saved==='boolean' && typeof saved_at==='string'`，不满足抛 `unknown_error`，并补用例。改动很小，建议在 2.7 或随下一次提交一起做；不阻断 2.6 标 ✅。
- **第三批-SUGGEST-3（全局取消 drop 会影响文本拖拽）**：`usePreventFileDropNavigation` 与 `ComposerBar` 对所有 `dragover/drop` 都 `preventDefault`，页面内把选中文字拖进输入框这类原生操作也会被取消。建议只在 `event.dataTransfer?.types` 包含 `'Files'` 时取消。
- **第三批-SUGGEST-4（保存时间文案）**：`formatSavedAt` 对无法解析的值直接显示原始文本；配合 SUGGEST-2 的校验后可去掉该回退，避免“已保存 + 乱码时间”的组合。
- **第三批-SUGGEST-5（遗留）**：“＋ 新对话”在 `saved`/`empty` 阶段点击仍无反应（2.7）；`NoticeBanner` 里 `already_saved` 条目现已不再被页面使用（由 `SavedResultCard` 展示同一句话），2.7 收尾时可清理或统一为一处。

### 测试与验证证据
| 命令 | 结果 |
|---|---|
| `npm ci --registry=https://registry.npmjs.org` | ✅ 成功 |
| `npm run lint`（`--max-warnings 0`） | ✅ 退出码 0 |
| `npm test` | ✅ **42 个测试文件、453 个用例全部通过**（上一批 38/405） |
| `npm run build`（`tsc --noEmit && vite build`） | ✅ 1435 modules transformed |
| `npm audit --omit=dev` | ✅ 0 vulnerabilities |
| 密钥与真实简历 | ✅ 未发现；测试数据为合成 |

### 2.6 的 HIGH_RISK 审查结论
**建议 DL 将任务 2.6 标 ✅。** F-03 路径单一且可审计（`CONFIRM_SUCCEEDED` 是 `saved` 与“已保存”文案的唯一来源）；无乐观更新；请求体、失败与超时/网络/非 JSON 各路径无成功态均有测试；REQ-FE-04.1–04.8 全部有实现与用例对应；D-01/D-03/D-04/C-05/C-10/C-11/P-09 均符合。建议随后尽快完成 SUGGEST-2（成功响应形状校验）和 SUGGEST-1（更正文档并补用例），均为小改动，不阻断标 ✅。

### 正向反馈
- 把“成功态”收敛到 reducer 的单一分支，并对每条失败路径逐一断言无成功态，审计成本很低。
- 最终确认卡全文只读、状态标签原样展示，且卡内不出现任何成功措辞。
- 请求序列断言（`GET → POST → POST`）直接证明了“不查询状态”。
- 偏差与遗留风险如实披露；只有 ④ 的因果描述需要更正。

---

## 第五批审查（SUGGEST 修复 + 2.7–2.8）

- 日期：2026-11-10；Review 模式：Ticket-aware Review；Reviewer：Yin Yang（dev-lead，审查 agent 代行）
- 审查对象：a8f4020（2.6 标 ✅）、5be3727（保存/草稿响应形状校验）、bdb7316（文案与用例）、8966bb0（2.7 新对话）、a012693（2.8 无障碍与响应式），已合并 feature（73b345e）；本 worktree 已 `git merge feature`。
- 本批结论：**PASS_WITH_SUGGESTIONS**（0 BLOCK / 0 QUESTION / 4 SUGGEST；另有 2 个 worker 提出的 DL 确认点，我的建议均为“接受”）
- 上下文限制：未做浏览器实机与真实读屏验证（changelog 同样声明）；窄屏与 ≥360px 只在 jsdom 中验证。

### 1. 第三批 SUGGEST-2（响应形状校验）——已关闭
- **实现**：`api/ResponseShapes.ts`；`ApiClient.request` 新增 `validate`，2xx 且校验失败 → `ApiError.unknown(status)`，不作为成功（`ApiClient.ts`：`!payloadOk || (validate && !validate(payload))`）。`createResume` 用 `isCreateResumeResponse`，三个草稿接口（上传、GET current、PATCH）用 `isDraftResponse`。
- **F-03 误报路径**：`resume_id` 非空字符串、`already_saved` 严格 boolean、`saved_at` 为可解析日期；`ResumeApi.test.ts` 逐项覆盖 200 `{}`、201 `{}`、`null`、`[]`、缺 `already_saved`、`already_saved` 为字符串、空 `resume_id`、缺 `saved_at`（共 8 个）→ `unknown_error`，且断言日志不含响应内容；`ResponseShapes.test.ts` 另覆盖 15 种反例。形状错误的保存响应因此不可能进入 `CONFIRM_SUCCEEDED`。
- **`saved_at` 必须可解析（比建议略严）——建议接受（DL 确认点①）**：后端时间格式固定为 `YYYY-MM-DDTHH:MM:SSZ`（`core/clock.py`），所有主流浏览器都能解析；即使将来某个合法成功响应被误拒，退化路径也是“显示 unknown_error → 用户重试 → 404 `draft_not_found` → ‘可能已保存，请重新上传核实’”（D-01），不会丢数据也不会误报成功，属于安全方向的失败。`Date.parse` 本身较宽松（如 `"2026"` 也能解析），不影响安全性。
- **不误伤合法响应**：逐字段对照 OpenAPI 0.1.1 的 `DraftResponse`/`ResumeFields`：22 个字段都要求 `{value,status}`，`status` 属 4 种枚举；标量 `value` 为 `string | null`（符合 `type: [string,'null']`，null 通过）；7 个列表字段 `value` 必须是数组（空数组通过，符合 `type: array`）；`original_file.filename`、`draft_id`、`expires_at` 要求非空字符串（后端上传时文件名必有扩展名且非空）；多余字段不拒绝（未设 `additionalProperties` 限制）。没有发现会拒绝契约合法响应的条件。
- **读取草稿形状错误 → 可重试错误而非“无草稿”**：`getCurrentResumeDraft` 只把 404 `draft_not_found` 映射为 `null`，形状错误抛 `unknown_error` → `bootstrap_failed` 面板（可重试、隐藏上传入口）；`ResumeDraftApi.test.ts` 的 “restore with … is an error, not ‘no draft’” 3 例覆盖。
- **残余**：见 SUGGEST-1（列表元素类型、`size_bytes`、`content_type` 未校验）、SUGGEST-3（上传响应形状错误时服务端其实已替换草稿）。

### 2. 第三批 SUGGEST-1——已关闭
`FinalReviewCard` 文案改为“当前不能确认是否已保存。可以再试一次；如果提示草稿不存在，说明可能已经保存，请重新上传核实。”；`final.test` 新增“超时 → 重试 → 404 → maybe_saved”用例（该文件 +55 行）。与 openapi `createResume` 的 D-01 描述一致。

### 3. 任务 2.7（P-08、C-07、Q-DL-04）
| 检查项 | 结论 | 证据 |
|---|---|---|
| 有草稿时二次确认 | ✅ | reducer 的 `NEW_CHAT_REQUESTED`：`reviewing` → `dialog:'new_chat'`；页面对话框“开始新对话”，文案写明：界面清空、未确认草稿仍保留、刷新会恢复、再次上传会覆盖；有未提交编辑时追加“未提交的修改将丢失”。包括最终确认页（用例“also asks on the final review screen”） |
| 无草稿/结果页直接清空 | ✅ | `empty`/`saved` 直接 `resetToEmpty`，不弹框（用例） |
| 取消保留草稿与未提交编辑 | ✅ | `dismissDialog`；用例“cancelling keeps the draft and the unsubmitted edits” |
| 确认后清空界面，不调接口 | ✅ | 用例“confirming clears the screen and calls no API (there is no discard endpoint)” |
| 下一次上传覆盖原草稿，不再二次确认 | ✅ | `overwriteAcknowledged=true`；用例“the next upload overwrites the old draft without asking a second time” |
| 刷新仍恢复旧草稿 | ✅（已知行为，Q-DL-04/TD-12） | 对话框已明示；用例“after a reload the old draft is restored again (known behaviour)” |
| 请求进行中不可点 | ✅ | `newChatDisabled={busy || …}`；用例“is locked while a request is running” |
| 偏差 ② 的 `new_chat` 框已接线 | ✅ | `ResumeCollectionPage.tsx` 新增 `ConfirmDialog open={state.dialog==='new_chat'}`；至此 `overwrite`、`unconfirmed`、`unsubmitted_edits`、`new_chat` 四个对话框全部接线，偏差 ② 完全落实 |
| 第三批 SUGGEST-5（已保存提示重复/新对话） | ✅ 已关闭 | `NoticeBanner` 的 `BannerKind` 排除 `already_saved`，该句只由 `SavedResultCard` 显示；新对话已接线 |

### 4. 任务 2.8（TD-13）
| 检查项 | 结论 | 证据 |
|---|---|---|
| < 860px 布局 | ✅（jsdom） | `useNarrowScreen`（`matchMedia('(max-width: 859px)')` + `useSyncExternalStore`）：窄屏不渲染侧栏、“＋ 新对话”移入标题栏且全页只有一个；宽屏在侧栏（`AppShell.responsive.test.tsx`）。注意 `Layout.css` 没有 `@media` 规则，窄屏行为完全靠此 hook；≥360px 的实际排版未在真实浏览器验证（SUGGEST-4） |
| 焦点移动 | ✅ | `focusKeyOf`：`reviewing`+`sections` → `section:<活跃分区>`，`final` → `final`，`saved` → `saved`，其余 `null`；`ChatThread` 仅在 key 变化时 `scrollIntoView` + `focus({preventScroll:true})`，标题带 `tabIndex={-1}`。编辑过程中 key 不变，不会抢焦点；用例覆盖展示草稿、确认后下一个分区、点“修改”、进入最终确认与结果页 |
| aria-live / role | ✅ | 加载提示 `status`；恢复提示、未确认字段提示、输入区提示、保存结果卡为 `status`；只有 `ErrorAlert`（真实错误）与需用户采取行动的 `draft_expired`、`maybe_saved` 为 `alert`。用例断言“有恢复提示时错误仍只有一个 `alert`”。`draft_expired`/`maybe_saved` 保留 `alert` 可以接受：二者都会立刻把界面清空回到空态，需要即时告知 |
| `useStableKeys` 替代下标 key | ✅ | 随 `add/remove` 同步，外部长度变化时整体重置（自愈）；`ObjectListEditor`、`StringListEditor` 已使用；4 个单测 + `ObjectListEditor.keys.test` 验证删除中间项后其余卡片保持同一 DOM。渲染期 `setStored` 是 React 文档认可的“按渲染派生重置”写法；模块级计数器在 StrictMode 下会跳号，无影响 |
| 第二批/三批 SUGGEST-3 只取消含 Files 的拖拽 | ✅ 已关闭 | `isFileDrag`（`types` 含 `Files` 或已有 `files`）；`usePreventFileDropNavigation` 与 `ComposerBar` 都先判断；文本/链接拖拽不受影响，有用例 |
| 第三批 SUGGEST-4 `formatSavedAt` | ✅ 已关闭 | 无法解析时返回 `null`，结果卡隐藏“保存时间”行，不再显示原始文本 |
| 焦点自动移动的范围（DL 确认点②）——建议接受 | ✅ | 在“有草稿显示出来”（恢复或上传成功）时把焦点移到待核对分区标题，是 TD-13“跨分区推进后焦点移到新分区标题”的合理延伸；空态、读取中、读取失败不移动，不会抢走用户焦点。建议加上 `prefers-reduced-motion` 时不用平滑滚动（SUGGEST-2） |

### 5. 前面各批跟踪项的去向
| 来源 | 项 | 状态 |
|---|---|---|
| 第一批 | QUESTION-1（Node 范围）、QUESTION-2（依赖追认）、自报偏差 | 已由 DL 裁决（保持 `>=24` 并记已知风险；追认 6 个包） |
| 第一批 | SUGGEST-1（body 超时） | 已关闭（2.2） |
| 第一批 | SUGGEST-2（长度按码点） | **未处理**，`FieldRules.ts` 仍用 `.length`；建议在 3.1 前随一次校验相关改动处理 |
| 第一批 | SUGGEST-3（契约漂移检测）、SUGGEST-4（ESLint 收紧）、SUGGEST-5（audit 跟踪） | **未处理**，建议归入 3.x 的集成/验收（契约测试、lint 规则）与发布前依赖复查；`npm audit --omit=dev` 本批仍为 0 |
| 第二批 | SUGGEST-1（拖拽）、SUGGEST-3（新对话）、SUGGEST-5（alert 播报、下标 key）、SUGGEST-6（设计回写） | 已关闭 |
| 第二批 | SUGGEST-2（`canConfirmSection` 去重复） | **未处理**，代码中仍无该函数，页面与 `SectionCard` 各有一份规则；建议下一次改动 `SectionView.ts` 时顺带做 |
| 第二批 | SUGGEST-4（失焦删空行可能误点） | **未处理**，`StringListEditor.tsx:79` 仍在 `onBlur` 删除；建议 3.x 手工验收时重点点测，必要时改成 `onMouseDown` 防抢焦点 |
| 第三批 | SUGGEST-1、2、3、4、5 | 全部已关闭 |

### BLOCKING Issues
无。

### QUESTIONS
无。

### SUGGESTIONS
- **第五批-SUGGEST-1（形状校验的残余覆盖）**：`isDraftResponse` 不检查列表元素类型（经历列表的每个元素应是对象、文本列表的每个元素应是字符串）以及 `original_file.size_bytes`/`content_type`。`ObjectListEditor` 的 `itemTitle(item)` 对 `null` 元素会抛 `TypeError`（被 `ErrorBoundary` 兜底）。后端契约保证了这些，所以只是纵深防御；若要补，加几行元素类型检查即可，不要过严以免误伤。
- **第五批-SUGGEST-2（`prefers-reduced-motion`）**：`ChatThread` 的 `scrollIntoView({behavior:'smooth'})` 未考虑用户的“减少动态效果”设置，建议在该设置下改用 `auto`。
- **第五批-SUGGEST-3（上传响应形状错误时的提示）**：上传 201 但形状错误时，服务端实际已替换草稿而界面保留旧草稿并提示 `unknown_error`。这是极端情形，安全方向正确（不展示不完整数据）；可在文案中提示“刷新页面可恢复最新草稿”，降低困惑。
- **第五批-SUGGEST-4（窄屏验证）**：响应式完全依赖 `useNarrowScreen`，`Layout.css` 没有 `@media`；请在 3.x 的人工验收中用 Chrome/Edge/Safari/Firefox 最近两个主版本分别验证 360px 与 859/860px 边界，并留一条回归记录。

### 测试与验证证据
| 命令 | 结果 |
|---|---|
| `npm ci --registry=https://registry.npmjs.org` | ✅ 成功 |
| `npm run lint`（`--max-warnings 0`） | ✅ 退出码 0 |
| `npm test` | ✅ **50 个测试文件、577 个用例全部通过**（上一批 42/453） |
| `npm run build`（`tsc --noEmit && vite build`） | ✅ 1439 modules transformed |
| `npm audit --omit=dev` | ✅ 0 vulnerabilities |
| 密钥与真实简历 | ✅ 未发现；测试数据合成 |

### 对 2.7、2.8 的审查结论
**建议 DL 将 2.7、2.8 标 ✅**（同时 2.6 的 SUGGEST-1/2 已关闭，建议保持 ✅）。无 BLOCK/QUESTION；两个 DL 确认点（`saved_at` 必须可解析、焦点移动范围）我的建议均为接受。frontend 阶段 2 的“编码任务”到此完成，剩余跟踪项（第一批 SUGGEST-2/3/4/5，第二批 SUGGEST-2/4，第五批 SUGGEST-1–4）建议在阶段 3 的验收前统一排期。

### 正向反馈
- 形状校验放在 api 层的 `validate` 钩子上，所有读写接口共用，且保持 `status` 不变、日志不含响应内容。
- 对“保存成功但响应被判无效”的退化路径设计正确（重试 → 404 → 可能已保存），不丢数据、不误报。
- 焦点、角色与键盘可达性的测试按行为编写（焦点落在哪里、alert 数量），不是只断言属性。
- `useStableKeys` 有自愈机制，避免了常见的“外部更新后 key 错位”问题。

---

## Dev Lead 裁决（第五批，2026-11-10）

| 项 | 裁决 |
|---|---|
| 结论 | 2.7、2.8 通过，标 ✅ |
| DL 确认点 ①：saved_at 必须可解析 | 接受 |
| DL 确认点 ②：草稿显示时焦点移到待核对分区标题 | 接受 |
| 跟踪项 | 随任务 3.1 一并处理：本批 S1/S2/S3、第一批 S2（码点长度）、第二批 S4（失焦删空行）及报告列出的其余跟踪项；本批 S4（窄屏实机验证）留到联调阶段 |


## 第十一批审查（frontend 收尾批：3.1 集成验证、4 个跟踪项清理、样品联调脚本、三条窄屏/错误提示修复）

- 日期：2026-11-10；Reviewer：Yin Yang（dev-lead，审查 agent 代行）；Review 模式：Ticket-aware Review；被审查 Workbench：frontend（已加载 code-reviewer 的 frontend references）
- 审查对象：`899da70`（3.1）、`c47bc02`/`18363a6`/`0f07f40`/`d306368`（跟踪项清理）、`737018b`（`scripts/drill_resume.py`）、`17542f0`/`887a23b`/`59930a1`（三条 SUGGEST 修复）及联调报告提交；合并提交 `5ca3265`（9 个功能提交 `merge-base --is-ancestor` 均为真）。
- **本批结论：通过（0 BLOCK / 0 QUESTION / 4 SUGGEST）。F-01/F-02/F-03 无退化。建议关闭 frontend 全部任务（3.1 及联调、跟踪项清理），frontend 阶段无阻断。**
- 上下文限制：SUGGEST-1 的浏览器实机复测**未能做**——启动 Vite 开发服务器的命令被本环境的执行工具拦截（长驻服务器告警），我没有绕开该限制；改以“变异验证 + 构建产物核对”替代（见下）。未用样品简历，也没有读取样品。另有：仅 jsdom，无真实浏览器布局；未测其他浏览器。

### 3.1 集成测试是否真断言
| 检查项 | 结论 | 证据 |
|---|---|---|
| 浏览器存储 spy | ✅ | `ResumeCollectionPage.integration.test.tsx` 对 `Storage.prototype` 的方法逐个 `vi.spyOn` 并在调用时记录；每个用例末尾断言零访问；另有 `security statics: the watchers themselves work` 自检用例证明监视器本身有效（防“监视器失灵导致假通过”） |
| console 无简历内容/响应体 | ✅ | `console.log/info/warn/error/debug` 全部被 spy，用例末尾把调用序列 JSON 化后断言不含合成姓名/手机/邮箱及响应体 message；404 空态断言 `consoleCalls` 为 `[]` |
| 变异 M1：在页面里写 `window.localStorage.setItem` | ✅ 被杀 | 集成用例 14 个中，主流程、草稿恢复等多个用例失败 |
| 变异 M2：在 `ApiClient` 里 `console.log(JSON.stringify(payload))` | ✅ 被杀 | 主流程、恢复、404 空态等用例失败 |
| 变异 M3：把 `error` 从 `ComposerBar` 中移除（回到列表末尾之外的“无处显示”） | ✅ 被杀 | `src/pages` 下多个上传错误用例（含“恰好一个 alert”）失败 |
| 变异 M4：窄屏按钮 `min-height: 44px`→`30px` | ✅ 被杀 | `Layout.responsive.test.ts` “makes every button at least 44x44 px” 失败 |
| 变异 M5：忽略 `prefers-reduced-motion` | ✅ 被杀 | `ChatThread.test.tsx` “scrolls without animation when…” 失败 |
| 变异 M6：`charLength` 改回 `.length` | ✅ 被杀 | `FieldRules` 4 个用例失败（100 个 emoji 合法、101 个超长等） |
| F-03（确认前不显示已保存） | ✅ | 主流程断言“已保存”仅在 201 之后可见；5xx、`draft_not_found`、确认超时均不显示成功；确认请求体恰为 `{confirmed:true}` 且只发一次 |

### 追溯矩阵（33 条）
- `traceability_3.1.md` 共 33 行 `REQ-FE-*`，与 design.md 中去重后的 33 条验收标准数量一致。
- 逐一抽取矩阵里引用的 43 个测试文件名并对照仓库：全部真实存在（`upload/edit/final/items/review.test.tsx` 为 `ResumeCollectionPage.*.test.tsx` 的简写，对应文件均存在）。矩阵自述“映射为文件级，未逐用例展开”，该表述属实：我抽查的 06.2、06.3、04.3、04.8 与集成用例对应得上。结论：对应真实；颗粒度为文件级，属可接受限制。

### 四个跟踪项清理
| 项 | 结论 | 证据 |
|---|---|---|
| 契约漂移检测（`ContractDrift.test.ts`）、草稿形状校验 | ✅ | `ResponseShapes` 现校验 `size_bytes`（有限非负数）、`content_type` 枚举、经历项成员类型、子列表为字符串数组；不符按“未知错误”处理，2xx 形状错误给出“上传结果异常，请刷新页面后核对”（因服务器可能已替换草稿）。契约文件本批未改（`03_api` 无 diff） |
| 网络防线（`eslint.config.js`） | ✅ | 范围从 pages/components/hooks 扩大为 `src/**` 除 `src/api` 与测试：`fetch`、`XMLHttpRequest`、`WebSocket`、`EventSource`、`navigator.sendBeacon` 均禁；`EslintRules.test.ts` 用真实 ESLint 对违规样例断言报错。`npm run lint` 零警告 |
| 码点长度/空白行/确认规则 | ✅ | `charLength` 按 Unicode 码点计，与 JSON Schema/Python `maxLength` 一致（M6 被杀）；空白行不计入条数上限但错误下标仍对应屏幕位置；“确认本区”按钮与“确认无误”快捷回复共用 `canConfirmSection`，消除两处规则分叉 |
| 尊重减少动态效果 | ✅ | `matchMedia('(prefers-reduced-motion: reduce)')` 为真时滚动用 `auto`（M5 被杀） |

### 三条窄屏/错误提示修复
| 项 | 结论 | 说明 |
|---|---|---|
| SUGGEST-1 上传错误提示固定在输入区 | ✅（实机复测未做） | `ComposerBar` 新增 `error` 插槽，错误渲染在固定输入区内而不是滚动列表末尾；页面上仍只有一个 `role=alert`（用例固化）。`showComposer` 仅在 `empty`/`reviewing` 阶段为真，而上传错误只在这两个阶段产生（`FILE_SELECTED` 预校验失败、`UPLOAD_FAILED` 后阶段回到 empty/reviewing），因此不会出现“错误存在但输入区隐藏”的盲区。我读了 reducer 确认 |
| SUGGEST-2 窄屏标签上置 | ✅ | `@media (max-width: 599px)`：`.field-edit` 换行，标签占满一行，输入框 `flex: 1 1 180px`；不影响宽屏。生产构建的 CSS 中该规则作为 `@media (width<=599px)` 存在 |
| SUGGEST-3 热区 ≥ 44px | ✅（附 SUGGEST-1） | 窄屏 `button.ant-btn { min-height/min-width: 44px }`（选择器权重盖过 antd 尺寸类）；窄屏隐藏输入区格式提示，欢迎页仍保留。代价：输入区高度 147→169px（作者实测），仍低于视口 27%。破坏原型 P-xx？未见：仅在 ≤599px 生效，桌面与平板布局不变（作者在 768/1440 复测，我未能复测） |
| `vite.config.ts`：`test.css.include` 与 `server.fs.allow` | ✅ 不影响生产构建 | `test.css` 只在 Vitest 内生效，使 jsdom 测试能把 `Layout.css` 作为文本读取；`server.fs.allow` 仅作用于 `vite dev` 服务器（让契约漂移测试读取 `backend-docs/HR_PR-1/03_api`），且只放开这一个目录。我实测 `npm run build`：产物 `dist/assets/index-*.css` 含 `min-height:44px`、`composer-error` 与窄屏媒体查询，`dist/` 被 `.gitignore` 忽略；构建不引用 `backend-docs`。开发服务器多开放了一个只读的 API 契约目录，内容非机密，可接受 |

### `scripts/drill_resume.py` 与全仓敏感信息
| 检查项 | 结论 | 证据 |
|---|---|---|
| 不含个人信息 | ✅ | 文件、真值、目录均为命令行参数；输出只含判定、状态、长度、条数，不打印字段值（我通读了所有 `print`）；`draft.json` 与截图写到调用者指定的 `--shots` 目录（权限 0600），要求在仓库外 |
| 不读 `.env` | ✅ | 全文无 `.env`；唯一环境变量是 `ORCA_CLI_COMMAND`（命令名） |
| 不外发到非本机 | ✅ | 脚本自身无网络代码；仅驱动 `orca` CLI；`--url` 默认 `http://127.0.0.1:5173/`；页面内 `fetch` 为同源相对路径；SQLite 以 `mode=ro` 只读打开 |
| 仓库无样品简历/真实手机号邮箱 | ✅ | `git ls-files` 无任何 pdf/jpg/png/doc；历史新增文件中也无此类扩展名；全仓文本中的手机号只有合成号 `13800138000`、`13900139000`、`13700137000/001/099`（另两处 11 位数字是 `uv.lock` 哈希片段）；邮箱均为 `example.com/.test` 合成或测试用 URL；历史新增行同样如此；`.env` 被两个 `.gitignore` 忽略，仅 `.env.example` 入库 |
| 联调报告中的样品内容 | ⚠ SUGGEST-2 | 第七节写明“个人信息值一律脱敏”，且确未出现姓名、手机、邮箱值；但出现了样品中的一个内部部门标记、行业词序列、一条技能句的原文片段与“主要客户”类别列表，属于从真实简历派生的内容 |

### SUGGESTIONS（不阻断）
- **第十一批-SUGGEST-1（实机复测）**：SUGGEST-1/2/3 目前只有 jsdom 单测 + 作者的样品复测记录（“被截断输入框 2→0、按钮不足 44px 的 21→1，另有 1 个未定位”），且报告自述“未在浏览器里再次触发上传错误做实机复测”。请在联调环境用**合成数据**（不用样品）补测：①在校对阶段上传 `.txt`，确认提示出现在固定输入区且当下可见；②360 宽下查出那个未定位的 <44px 按钮。
- **第十一批-SUGGEST-2（联调报告脱敏）**：把内部部门标记、技能原文片段、“主要客户”列表改为概括性描述（如“带入 1 个内部标记”“1 条技能的连接词被改写”），避免真实简历派生信息进入仓库历史。因已提交，只能后续改，不能抹去历史。
- **第十一批-SUGGEST-3（契约测试跳过）**：沿用第十批建议——`openapi_available()` 为假时整组契约测试静默跳过；前端的 `ContractDrift.test.ts` 同样读取 `backend-docs`，若在仅检出 `codes/` 的环境运行应当失败而非跳过（请确认其行为）。
- **第十一批-SUGGEST-4（2xx 形状错误的识别）**：`ErrorAlert` 以 `code==='unknown_error' && 2xx` 判断“形状异常”，依赖 `ApiError` 的内部约定；建议在 `ApiError` 上提供显式的 `isBadResponse` 访问器，避免魔法组合。

### 本批复跑
| 命令 | 结果 |
|---|---|
| `npm ci` | ✅ 安装成功 |
| `npm run lint`（`eslint . --max-warnings 0`） | ✅ 零告警 |
| `npm test` | ✅ **53 个文件、650 个用例全部通过**，与基线一致 |
| `npm run build`（`tsc --noEmit && vite build`） | ✅ `1439 modules transformed`，产出 `dist/index.html`、`index-*.css`（4.62 kB）、`index-*.js`（492.59 kB），有真实类型检查与编译动作 |
| 变异（6 处，均还原） | M1–M6 全部被杀；还原后 `git status --short` 无变更（过程中因 shell 命令里的 `->` 被当作重定向，误生成了一个名为 `length` 的临时文件，已立即删除，未入库） |

### 最终结论
**通过。建议关闭 frontend 全部任务，frontend 阶段无阻断。** 3.1 的存储与 console 断言真实有效（含监视器自检，6 处变异全被杀）；追溯矩阵 33 条与测试文件真实对应；三条 SUGGEST 修复合理，仅作用于 ≤599px 与固定输入区，不改变桌面布局与 F-03 行为；`vite.config.ts` 的测试期配置不影响生产构建（已用构建产物核对）；联调脚本不含个人信息、不读 `.env`、只访问本机；全仓与历史新增内容未发现样品简历或真实手机号邮箱。关闭前请 DL 知悉：窄屏三项修复的浏览器实机复测与联调报告脱敏（SUGGEST-1/2）为非阻断的收尾事项。


---

## v2 第一批审查（阶段 1：1.3、1.4、1.6、1.7、1.8、1.9、1.10）

- Review 模式：Ticket-aware Review；持久化：是（本节）
- 日期：2026-11-11；Reviewer：Yin Yang（dev-lead，审查 agent 代行）；被审查 Workbench：frontend
- 范围：`git diff 0fb8eda b97961a -- codes/hr-collection-agent-frontend`（39 个文件；src +1158，测试与夹具 +1177）。合并 `feature`（7627e71）后审查。
- 依据：requirements v2、design v2.0、`interface_spec_resume.md` v0.3、OpenAPI 0.2.0、tasks v2.0、仓库 `AGENTS.md`（v2）。
- 结论：**PASS_WITH_SUGGESTIONS**（0 BLOCK / 0 QUESTION / 4 SUGGEST）
- **HIGH_RISK 1.8 Verify（F-03）：建议标 ✅。HIGH_RISK 1.9 UpdateDiff（清空字段必列）：建议标 ✅。** 1.3、1.4、1.6、1.7、1.10 建议保持 ✅。
- 上下文限制：本批没有页面、组件和 `useResumeSession`，F-03 只能在"纯逻辑 + 状态机"层核对；界面是否在确认前出现"已保存"提示，等阶段 2（2.6、2.13）与 3.1 审查时核对。

### 红线核对
| 红线 | 结论 | 证据 |
|---|---|---|
| F-03 "已保存/已更新"只由成功事件或核对事件置位 | ✅（状态机层） | `notice: 'updated'` 只在 `UPDATE_SUCCEEDED`（`SessionReducer.ts:683-695`）与 `UPDATE_VERIFIED` 的 `applied` 分支（`:711-718`）出现；`phase: 'saved'` + `savedSummary` 只在 `CONFIRM_SUCCEEDED`（`:587-612`）与 `CONFIRM_VERIFIED` 的 `saved` 分支（`:638-667`）出现。2xx 的形状校验失败 = `unknown_error`，不进成功分支（`ApiClient.ts:97-99`，`ResponseShapes.ts` 全部响应）。结果未知（超时/网络/`unknown_error`）与 `session_read_only`/`update_not_available` 一律先重读再判断（`:628-633`、`:702`）；读取失败或读到仍是 `reviewing`/`pending` 时回落为"未确认"并保留错误（`:641-644`、`:720`）。 |
| `Verify` 回落 | ✅ | `decideAfterConfirmRead` 仅 `status==='saved'` 才给 `saved`，其余 `still_reviewing`（`Verify.ts:25-28`）；`decideAfterUpdateRead` 仅 `update_state==='applied'` 给 `applied`（`:33-37`）；`matchSentMessage` 要求尾部两条同时满足角色、文本、且 `message_id` 都不在已知集合（`:9-20`），不匹配即视为"未送达"，不会误认为已发送。 |
| 差异必列清空字段 | ✅ | `buildUpdateDiff` 对 22 个键逐一比较，任何归一后不相等的键都进入 `changed`，"候选为空而已有值非空"另标 `clears`（`UpdateDiff.ts:64-75`）；归一只做 trim / 丢弃空列表项 / 经历子项缺键 = `null`，不会把"有值 → 空"归一成相同；空白串视为空，因此清空不会被 `'  '` 掩盖（测试已覆盖）。 |
| F-02 不在浏览器持久化敏感数据 | ✅ | `src` 下无 `localStorage/sessionStorage/indexedDB/document.cookie`（非测试文件检索）；Cookie 由 backend 的 `HttpOnly` 设置；`editBuffer`、会话详情只在 reducer 内存。ESLint 红线测试 `EslintRules.test.ts` 24 项通过。 |
| B-03 / 控制台 | ✅ | `ApiClient.logFailure` 只输出 `request_id/code/status`（`ApiClient.ts:30-33`）；`quietCodes` 仅用于 `DELETE session_not_found`；全部 `src` 非测试文件仅两处 `console.error`（另一处只打印 `error.name`）。 |
| F-01 / 分层 | ✅ | `fetch` 只在 `ApiClient.ts:62`；`SessionApi/ConversationApi/ResumeApi/ArchiveApi` 只固定 URL/方法/超时/校验器，路径参数一律 `encodeURIComponent`；请求体恒为 `{confirmed:true}` / `{confirm_update:true}`（`ResumeApi.ts`）。 |
| 与冻结契约一致 | ✅ | 13 个接口的路径/方法与 OpenAPI 0.2.0 对读一致；`ErrorCode` 19 值、`SuggestionField` 19 值由 `Contract.test.ts`/`ContractDrift.test.ts` 与契约文件比对；`isSessionDetail` 对 `status`/`update_state`/`fields`/`resume`/`update_candidate` 互斥一致性做了校验。 |

### BLOCKING Issues
无。

### QUESTIONS
无。

### SUGGESTIONS（不阻断，登记为跟踪项；按 delivery §八，不要求新增测试）
- **SUGGEST-1（`UpdateDiff` 的"空"对经历区块不完整）**：`isEmpty`（`UpdateDiff.ts:62`）对 `objectList` 只判断数组长度。若候选的经历数组里是若干"全部子项为空"的条目，而已有记录有实际内容，该字段仍会进入 `changed`（红线成立，不会漏列），但 `clears` 为 `false`，卡片上不会按"将被清空"强调。后端候选是否可能出现全空条目要看 2.x 的 `merge_update`，建议实现 2.x 差异卡片时让 `isEmpty` 对 `objectList` 认"所有条目全空"，或确认后端已拒绝全空条目。
- **SUGGEST-2（消息文本与后端存储需一致）**：`matchSentMessage` 用 `user.content !== text` 严格比较（`Verify.ts:17`），而 `SEND_REQUESTED` 保存的是未 trim 的原文（`SessionReducer.ts:480`）。如果 backend `ChatService` 存储前对内容做了 trim 或规范化，则"请求其实已送达"会被判为未送达，用户重发会产生重复消息（不违反 F-03，也不丢数据）。请在阶段 2 审查 backend `ChatService` 时确认"按原文存储"，或把比较改为两侧 trim 后比较。
- **SUGGEST-3（`valuesAsFields` 的占位状态）**：`SectionView.ts:212` 把已保存值适配为 `status: 'confirmed'` 的 `ResumeFields`，注释已写"仅渲染、不上送、`showStatus=false`"，但类型上无法阻止它被误用到 PATCH 或 `coreReady/unconfirmedCount` 之类的判断里（它们会把一切当作已确认）。建议 2.x 在页面层只经 `ReadOnlySection` 使用，或给它一个不可赋给 `ResumeFields` 的品牌类型；不要求本批修改。
- **SUGGEST-4（冗余测试，建议合并）**：`SessionReducer.test.ts` 31 例总体与 §5.3 状态转移一一对应，未见过度；`ApiClient.test.ts`/`ResponseShapes.test.ts` 中 v1 保留的 json 模式用例与 v2 新增的 `none/blob` 用例不重复。唯一建议：`ConversationApi.test.ts`（4 例）里 `applySuggestions` 与 `cancelSuggestions` 仅路径末段不同，可合并为一个参数化用例；`Contract.test.ts` 与 `ContractDrift.test.ts` 各 12 例中"键集合镜像"部分与 `ResponseShapes` 使用的常量重叠，可在阶段 3 汇总时去重。合计可减约 3 例，不影响覆盖。

### 其他观察（非问题）
- 测试（含夹具）新增 1177 行 / 源码新增 1158 行 ≈ 1.0 : 1，低于预算，未见过度。
- `FakeBackend`（299 行）支持按请求注入延迟与失败，满足 1.3 的验收（供 F-03 与核对测试复用）；其自测 `FakeBackend.test.ts` 仅 2 例，规模合理。
- `SavedResultCard.formatSavedAt` 保留为 `formatDateTime` 的别名，避免页面层过渡期断链，阶段 2 收口时可删除别名。

### 已知且不计入问题：阶段 2/3 范围内的失败
- `npx vitest run`：10 个文件失败（`App.test.tsx` 与 9 个 `ResumeCollectionPage.*.test.tsx`）为收集/类型阶段失败，已通过的 483 条用例全部通过；阶段 1 范围内的 `src/api`、`src/hooks/model`、`src/types`、`src/test` 共 21 个文件 319 条全部通过。
- `tsc --noEmit` 的报错全部落在 `useResumeSession.ts`（14）、`pages/ResumeCollectionPage*.tsx`（含 9 个页面测试，共 45）、`App.test.tsx`（1，仍引用 `draft_not_found`）、`NoticeBanner.tsx`/`NoticeBanner.test.tsx`（5，仍用 `restored/maybe_saved/draft_expired`）、`useChatScroll.test.ts`（1，仍引用 `bootstrapping/bootstrap_failed` 的 `Phase`）。后三类 tasks.md 已列为阶段 2 的删除/改写对象（见"v1 测试的处置"表及 `NoticeBanner`、`useChatScroll` 相关任务），属阶段 2，不作为 BLOCK。
- `eslint . --max-warnings 0`：通过。

### 本批复跑
| 命令 | 结果 |
|---|---|
| `npx vitest run src/api src/hooks/model src/types src/test` | ✅ 21 文件 / 319 用例通过 |
| `npx vitest run`（全量） | 483 用例通过；10 个文件按上文属阶段 2/3 的失败 |
| `npx tsc --noEmit` | 报错全部归属阶段 2/3（见上） |
| `npx eslint . --max-warnings 0` | ✅ |
| 未做 | 未跑 `npm run build`（`tsc` 阶段已知失败）；未做浏览器实测；未做变异测试（本批未预算） |
