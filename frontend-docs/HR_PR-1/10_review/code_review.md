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
**已关闭。** `api/ApiClient.ts:53-58`：读取响应体失败时先判断 `timedOut`，为真抛 `ApiError.timeout()`（并经外层 catch 保持 `client_timeout`）；`ApiClient.test.ts` 新增 2 个用例（响应头已到、body 挂起；成功与错误响应各一）。第一批其余 SUGGEST（长度按码点、契约漂移检测、ESLint 收紧、audit 跟踪）仍为跟踪项，本批未处理，符合 DL 裁决。

### BLOCKING Issues
无。

### QUESTIONS
无。

### SUGGESTIONS
- **第二批-SUGGEST-1（拖拽文件可能让浏览器离开页面，丢失未提交编辑）**：`components/ComposerBar.tsx:34-48`，`onDrop/onDragOver` 监听仅在 `!disabled` 且 `ComposerBar` 已挂载时注册。上传/保存进行中（`busy`）、启动阶段、读取失败、已保存阶段（composer 不渲染）把文件拖进页面，浏览器会按默认行为打开该文件并**离开当前页**，内存中的编辑缓冲（TD-03）和在途请求都会丢失。建议始终注册 `dragover/drop` 的 `preventDefault()`，只在可上传时才调用 `onFiles`。
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
