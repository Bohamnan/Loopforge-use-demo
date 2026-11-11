# 开发任务清单 — 简历信息收集（Frontend）

## 文档版本

| 版本 | 日期 | 修改说明 | 作者 |
|------|------|----------|------|
| v1.0 | 2026-11-10 | 初始版本（architecture-advisor Step 4），基于 design.md v1.1 与 OpenAPI 0.1.1 | Yin Yang（frontend） |
| **v2.0** | 2026-11-11 | **会话化变更重跑（8b）**，基于 design.md v2.0、OpenAPI 0.2.0、接口规范 v0.3：① 10 个 v1 任务因契约替换改回未完成（1.3、1.4、1.6、2.1、2.2、2.3、2.6、2.7、2.8、3.1），5 个保持 ✅（1.1、1.2、1.5、2.4、2.5）；② 新增 11 个任务（1.7–1.10、2.9–2.14、3.2）；③ 测试预算按 v2 增量重定；④ 测试夹具 `ApiMocks.ts`/`FakeBackend.ts` 改会话模型作为首个任务（1.3）；⑤ v1 两个自测脚本退役（Q-TD-01）并入 3.2；⑥ 新增“v1 测试删改范围”与“v2 设计覆盖核对” | HR_PR-1-CRv2 / CRv2.1；重跑清单 8b |

---

> 一个任务 = 一个可独立验证的变更单元（纵向切片），单元测试包含在各任务内。粒度规则见 architecture-advisor Step 4。
> 代码目录：`codes/hr-collection-agent-frontend/`（业务代码直接放在本仓库内，DL 决定）。路径均相对该目录。
> 验证口径（每个任务共同的完成条件）：`npm run lint`、`npm test`、`npm run build` 均通过，且构建日志中有真实的编译动作；不得仅凭退出码或“BUILD SUCCESS”类输出判定通过。
> 红线：页面 / 组件 / hook 内不得 `fetch`；不得使用 localStorage / sessionStorage / indexedDB；不得 `console` 输出简历内容、对话内容、建议值；测试数据只用合成简历。
> **v2 阅读约定**：标题带 `⟳ v2 重开` 的任务已改回未完成（子任务 `[ ]`）；其下“**v2 增量**”块是本轮的权威范围，原 v1 描述中与之冲突处（草稿、`/resume-drafts`、覆盖确认、`draft_not_found`、`draft_token`、“无文本框”）一律以 v2 增量为准，不再逐句改写 v1 正文。带 `🆕 v2 新增` 的任务是本轮新增。保持 ✅ 的 v1 任务不重做（其页面级测试仅换夹具，见 2.1）。契约版本统一核对 OpenAPI **0.2.0**。

## 任务总览

| 状态 | 阶段 | 任务数 | 预估工时 |
|------|------|--------|----------|
| [ ] | 1. 共享基础 | 10（v1 保留 3 + v2 重开 3 + v2 新增 4） | 47h |
| [ ] | 2. 功能切片 | 14（v1 保留 2 + v2 重开 6 + v2 新增 6） | 82h |
| [ ] | 3. 集成验证与收尾 | 2（v2 重开 1 + v2 新增 1） | 9h |
|     | 合计 | 26（其中 **v2 任务 21 个**：重开 10 + 新增 11；**HIGH_RISK 6 个**：1.8、1.9、2.6、2.10、2.13、3.1） | 138h（v2 任务 **112h**；v1 保留 26h 已完成） |

> 口径同 v1：含各任务内单元测试与 3.1 集成验证，不含代码审查与 `AGENTS.md` 复核。v2 估算依据：design.md v2.0 §3 的新增 / 修改 / 删除清单；SessionReducer 重写与对话 / 更新两条 HIGH_RISK 链路占大头。

### v2 执行顺序与依赖关系

```text
首个任务：1.3 types 与测试夹具（会话模型）
1.3 ─┬─ 1.4 api 核心 ─ 1.7 api 模块 ─┐
     ├─ 1.8 Verify ★ ─┐              │
     ├─ 1.9 UpdateDiff ★              │
     ├─ 1.10 小工具 ──┤              │
     └──────────────── 1.6 Reducer ──┴─ 2.1 外壳/会话装入 ─┬─ 2.2 上传 ─ 2.3 展示 ─┬─ 2.9 会话栏/切换/删除/离开
                                                           │                        ├─ 2.10 对话 ★ ─ 2.11 建议卡片
                                                           │                        └─ 2.6 最终确认/保存 ★ ─ 2.12 已保存视图 ─ 2.13 确认更新 ★
                                                           └─ 2.14 已归档简历页（依赖 1.7，可与 2.9 之后并行）
2.9 ─ 2.7 新对话；2.10/2.13/2.14 ─ 2.8 无障碍增量；全部 ─ 3.1 集成与红线 ★ ─ 3.2 脚本退役
（★ = HIGH_RISK；1.1、1.2、1.5、2.4、2.5 为 v1 保留任务，不在图中）
```

---

## 测试预算

> 防止过度：feature-developer、code-reviewer、dev-self-test 以此为上限；实际超出时先停下来问人类。（v1 补记见 `.kiro/decisions/design/2026-11-10-HR_PR-1降级L2防止过度.md`；v2 按下表重定，本表为 v2 权威）

| 项 | 值 |
|---|---|
| 规模档 | **轻量**（本地运行，约 5 人，POC；沿用 v1 判定） |
| 测试代码 : 业务代码 行数上限 | **≈ 1:1，按 v2 增量核算**。v1 存量实际约 1.6:1（业务 3539 行 / 测试 5758 行），已超；v2 不再放大：① 重写的测试以“删除 + 新写”计，净增不得使整体比继续上升；② 新增业务代码（估约 2800 行）对应的新增测试 ≤ 同量级；③ 阶段汇报时附实际比例，明显超出先停下说明理由，由 DL 判断 |
| 代码审查批次上限 | **≤ 3 批**：批 1 = 1.3–1.10（类型、夹具、api、纯逻辑，含 HIGH_RISK 1.8、1.9）；批 2 = 2.1–2.12（含 HIGH_RISK 2.6、2.10）；批 3 = 2.13、2.14、2.7、2.8、3.1、3.2（含 HIGH_RISK 2.13、3.1）。只审 HIGH_RISK 与本轮变更，v1 保留任务不重审 |
| 深度验证的红线（仅这些做故障注入 / 确定性测试） | ① **F-02** 浏览器不保存简历 / 对话内容（存储 API spy、`autoComplete="off"`、下载后 `revokeObjectURL`、ESLint 规则）；② **F-03** “已保存 / 已更新”只在成功响应（或核对读到已保存 / `applied`）之后显示，覆盖超时 / 网络失败 / 5xx / 422 / `save_failed` / 409 / 形状不符的 2xx，对话文字不触发保存与更新；③ **B-03** 前端不输出内容（对话原文、回复、建议值、姓名 / 手机 / 邮箱不进 `console`、`document.title`、下载文件名）；④ **差异卡片必须列出将被清空的字段**（`UpdateDiff` 的 `clears` 必列、卡片必显“将被清空”） |
| 其余功能的测试范围 | 仅主路径 + 主要异常路径；同一等价类只留代表值（如 6 个会话类错误码只测 `session_not_found` 一例 + 通用错误一例）；参数化不得用于凑数量；不为对齐文档重写仍有效的测试 |
| 审查规则 | 只有 BLOCK 可要求新增测试；SUGGEST 登记为跟踪项；审查同时检查冗余，重复或过度的测试建议删除 |

### v1 已有测试的删改范围（契约替换所致；仍有效的不动）

| 处理 | 文件（`src/` 下） | 原因 / 范围 |
|---|---|---|
| **删除** | `api/ResumeDraftApi.test.ts`（138 行）、`components/BootstrapErrorPanel.test.tsx`（21 行） | 被测单元随 v1 草稿接口 / 启动读取移除（design §3.2、§3.4）；由 1.7（`SessionApi`）与 2.9（列表错误态内联）新测试取代，不一对一搬运 |
| **删除用例** | `pages/ResumeCollectionPage.upload.test.tsx` 中覆盖确认用例；`ResumeCollectionPage.review.test.tsx` 中“已为你恢复未完成的简历”用例；`components/NoticeBanner.test.tsx`、`WelcomePanel.test.tsx` 中 `restored` / `draft_expired` / `maybe_saved` / `draft_not_found` 用例；`ResumeCollectionPage.final.test.tsx` 中 `draft_not_found → 空态 + 可能已保存` 用例 | 对应语义在 v2 消失（TD-12、REQ-FE-01.5、05.4、04.7） |
| **重写** | `hooks/model/SessionReducer.test.ts`（479 行，按 §5.3 A–G 表驱动重写，删旧 BOOTSTRAP / OVERWRITE / NEW_CHAT 行）；`api/ResumeApi.test.ts`（路径改按会话 + `updateResume`）；`api/ResponseShapes.test.ts`（删 `isDraftResponse`，加会话类形状）；`types/Contract.test.ts`、`types/ContractDrift.test.ts`（常量表改 0.2.0：`ErrorCode` 19 值、新类型镜像）；`pages/ResumeCollectionPage.test.tsx`（启动由 bootstrap 改为 `GET /sessions` 列表）、`.newchat.test.tsx`（改为清空视图 + 离开确认）、`.final.test.tsx`（F-03 用例集迁到会话端点，**HIGH_RISK 内容保留并加 409 / 重读核对**）、`.integration.test.tsx`（主流程改会话版，由 3.1 完成）、`.a11y.test.tsx`（加新控件） | 契约替换，断言对象变了 |
| **增量修改** | `api/ApiClient.test.ts`（保留 json 模式全部用例，加 `none` / `blob` / `PUT` / `DELETE` / 75s 对话）；`api/ApiError.test.ts`（码表）；`components/ComposerBar.test.tsx`（“无 `textarea`”断言反转为“有文本区且 `autoComplete="off"`”）；`components/SavedResultCard.test.tsx`、`FinalReviewCard.test.tsx`（文案 / 形态）；`components/AppShell*.test.tsx`（nav / sidebar / Drawer）；`components/ReadOnlySection.test.tsx`（`showStatus` / `emptyText`）；`hooks/useChatScroll.test.ts`（新增焦点键） | 小范围追加或调整，不整篇重写 |
| **仅换夹具、不改断言** | `pages/ResumeCollectionPage.edit.test.tsx`、`.items.test.tsx`；`components/SectionCard*.test.tsx`、`ReviewSummary.test.tsx`；`hooks/model/SectionView.test.ts`；`App.test.tsx`（加 view 切换用例除外）；`ReadOnlySection` 以外凡 import `ApiMocks`/`FakeBackend` 者 | 夹具导出名变化（`sampleDraft` → `sampleSessionDetail` 等）时只改 import / 调用，断言保持，由 1.3 / 2.1 完成 |
| **不动** | `FieldRules` / `UploadPrecheck` / `SectionConfig` 的既有用例、`FieldRow`、`StringListEditor`、`ObjectListEditor*`、`QuickReplyChips`、`ErrorAlert`、`ErrorBoundary`、`ConfirmDialog`、`FileCard`、`UploadProgressNotice`、`FieldStatusTag`、`useStableKeys`、`usePreventFileDropNavigation`、`Layout.responsive`、`test/EslintRules.test.ts`、`ViteConfig.test.ts`、`Smoke.test.tsx` | 单元与契约无关，v2 后仍成立（`useStableKeys.test.ts` 内含 draft 字样仅为变量名，核对后不改逻辑） |

---

## 阶段 1：共享基础

> 多个切片共用的工程脚手架、类型、api 封装与纯逻辑。先于所有切片完成。

### Task 1.1：工程脚手架与质量门禁 ✅
- **关联：** REQ-FE-06.1、06.2、06.3、06.6、REQ-FE-05.1；design.md §3.5（Vite 配置）、§7.2、§9.1（安全性静态）；TD-13、TD-14
- **内容：** 在 `codes/hr-collection-agent-frontend/` 初始化工程：
  - Vite + React 18 + TypeScript（`strict`）+ Ant Design（React 版）；脚本 `npm ci` / `npm run build` / `npm test` / `npm run lint`（与 AGENTS.md 一致）。
  - 测试：Vitest（jsdom）+ React Testing Library（含 user-event、jest-dom 断言）；`src/test/setup`、合成数据与 `fetch` mock 工厂的目录约定；默认手写 `fetch` mock，不引入 MSW。
  - ESLint（TypeScript + React Hooks 规则），并配置以下规则：
    - 禁用 `localStorage` / `sessionStorage` / `indexedDB`（`no-restricted-globals` 及 `no-restricted-properties` 覆盖 `window.xxx` 形式）；
    - 在 `src/pages`、`src/components`、`src/hooks` 内禁用 `fetch`（`no-restricted-globals`），仅 `src/api` 豁免；
    - `no-console`（`warn`，仅允许 `console.error`）。
  - 依赖管理：使用 npm 默认 registry 本地安装（DL 决定不使用私有 Nexus，属项目例外，须在 `AGENTS.md` / 安装说明中注明）；`.npmrc` 设 `save-exact=true`，`package.json` 所有依赖写**精确版本**，提交 `package-lock.json`；只引入上面列出的必要依赖，添加前核对包名（防 typosquatting），不引入状态管理库、路由库、请求库。
  - `vite.config.ts`：`server.proxy['/api']` → `http://127.0.0.1:8000`，保留 `Set-Cookie`，不设置 `cookieDomainRewrite` / `cookiePathRewrite`，代理超时不短于 75 秒，multipart 原样透传。
  - `.gitignore`（`node_modules`、`dist`、覆盖率输出、`.env*`）；不提交任何密钥。
- **测试：** 冒烟用例（一个空渲染测试）确认 Vitest + RTL 链路可用；用一个故意违规的临时文件验证三条 ESLint 规则会报错（验证后删除，不入库）；`npm run build` 的日志中确认有真实 TypeScript 编译与 Vite 打包动作。
- **预估：** 4h
- **前置依赖：** 无

#### 子任务

- [x] `package.json`、`.npmrc`、`tsconfig*.json`、`index.html`、锁文件（精确版本）
- [x] `vite.config.ts`（proxy 与 Cookie 要求）、Vitest 配置与 `setup`
- [x] ESLint 配置与三条自定义约束
- [x] 安装说明中注明默认 registry 的项目例外

- **v2 状态：** 保持 ✅。v2 不改构建 / lint / 代理配置（design §3.5 Vite 配置“不变”）；`ViteConfig.test.ts`、`EslintRules.test.ts` 沿用。

### Task 1.2：应用入口、主题与错误边界 ✅
- **关联：** REQ-FE-06.3；design.md §3.5（App / main、ErrorBoundary）、TD-14、§7.1（渲染异常）
- **内容：** `src/main.tsx`、`src/App.tsx`（Ant Design `ConfigProvider`，主题 token 取自原型 `style.css` 配色：`--navy` `--blue` `--warn` `--ok` `--red` 等）、`src/components/ErrorBoundary.tsx`（通用文案 + “刷新页面”，不输出简历内容）；`App` 暂以占位页面挂载（后续由 2.1 替换为 `ResumeCollectionPage`）。
- **测试：** `ErrorBoundary`：子组件抛错时显示通用文案且不泄露错误对象内容；`console.error` 调用不含子树文本；`App` 渲染冒烟，主题 token 生效（`ConfigProvider` 存在）。
- **预估：** 2h
- **前置依赖：** Task 1.1

#### 子任务

- [x] 入口与 `ConfigProvider` 主题
- [x] `ErrorBoundary` 与测试

- **v2 状态：** 保持 ✅。`ErrorBoundary` 与主题不变；`App.tsx` 的 `view` 切换在 2.14 修改。

### Task 1.3：types 与测试夹具（OpenAPI 0.2.0，**v2 首个任务**） ✅
- **关联：** REQ-FE-06.4、06.5；design.md §3.1、F-02（手写类型）；`interface_spec_resume.md` §四
- **内容：** `src/types/ResumeModel.ts`（`FieldStatus`、`StringField`、`StringListField`、三个经历列表字段、`WorkExperience`、`ProjectExperience`、`Education`、`ResumeFields` 22 字段、`ResumeFieldsUpdate`）、`Draft.ts`（`OriginalFileInfo`、`DraftResponse`、`DraftUpdateRequest`）、`Resume.ts`（`CreateResumeRequest`、`CreateResumeResponse`）、`Errors.ts`（`ErrorCode` 13 值、`ErrorDetail` 及 `reason` 5 值、`ErrorResponse`、`ClientErrorCode`）。每个文件头注明对应 OpenAPI 版本 0.1.1；标量允许 `null` 体现为 `string | null`。
- **测试：** 类型级测试（`tsc --noEmit` 纳入 `npm run build`）；用 Vitest 编写“契约镜像”测试：`ResumeFields` 的 22 个键集合、`FieldStatus` 4 值、`ErrorCode` 13 值、`reason` 5 值，与一份测试内的期望常量（按 OpenAPI 0.1.1 逐项核对）一致，防止漏项或漂移。
- **预估：** 2h
- **前置依赖：** Task 1.1

**v2 增量（权威）**
- **涉及文件：** `src/types/Draft.ts`（删除）、`Session.ts`/`Conversation.ts`/`Archive.ts`（新增）、`ResumeModel.ts`/`Resume.ts`/`Errors.ts`（修改，文件头改 OpenAPI 0.2.0）；`src/test/ApiMocks.ts`、`src/test/FakeBackend.ts`（改为会话模型）；`types/Contract.test.ts`、`types/ContractDrift.test.ts`（改写）。约 11 个文件（类型与夹具同属一次契约替换，不再拆分）。
- **内容：** 类型清单见 design §3.1：`ResumeValues`、`SuggestionField`（19 值）、`SessionStatus`/`UpdateState`/`SessionSummary`/`SessionDetail`/`UpdateCandidate`、`ChatMessage`/`Suggestion*`、`ArchivedResume`/`ResumeSummary`、`UpdateResumeRequest/Response`；`ErrorCode` 13→19 值（删 `draft_not_found`）。夹具：`ApiMocks.ts` 的 `sampleDraft`/`applyPatch` 改为 `sampleSessionDetail`（`reviewing`/`saved·none`/`saved·pending`/`saved·applied`）、`sampleSuggestion`、`sampleArchivedResume`、`sampleSendMessageResponse`；`FakeBackend` 改为 `/sessions*`、`/sessions/{id}/messages`、`/sessions/{id}/resume`、`/resumes*` 的内存实现，**支持按请求注入延迟与失败**（供 F-03 / 核对测试，不依赖时序运气）；合成数据含哨兵字符串（design §9.3）。
- **验收：** `tsc --noEmit` 通过；契约镜像测试与 OpenAPI 0.2.0 逐项一致（`ErrorCode` 19、字段 22、状态值）；夹具被 1.4 / 1.6 / 2.x 直接复用；`npm run build` 日志有真实编译动作（此时依赖旧类型的 src 文件会编译失败，**允许本任务与 1.4、1.6、2.1 在同一提交序列内合并验收**：以 1.3→1.4→1.7→1.6→2.1 全部完成后 `npm run build` 通过为准，任务内以 `vitest` 针对本任务测试文件通过为准）。
- **前置依赖：** Task 1.1。 **HIGH_RISK：** 否。 **预估：** 7h。

#### 子任务

- [x] 4 个类型文件与文件头版本注释
- [x] 契约镜像测试

### Task 1.4：api 封装核心（ApiClient / ApiError / ResponseShapes） ✅
- **关联：** REQ-FE-06.1、06.3、06.4、01.4、01.6、05.1；design.md §3.2、§6（ApiClient / ResumeDraftApi / ResumeApi）、§7.2、DD-02/05/06/10；O-12、F-05
- **内容：** `src/api/ApiError.ts`、`ApiClient.ts`、`ResumeDraftApi.ts`、`ResumeApi.ts`。
  - `ApiClient`：前缀 `/api/v1`；`credentials: 'same-origin'`；JSON 设 `Content-Type`，`FormData` 不手设；`AbortController` 超时（上传 75s，其余 30s）；区分 `client_timeout` 与 `network_error`；非 2xx 解析 `ErrorResponse`（含 `details`），缺字段或非 JSON 时 `unknown_error` 并使用通用文案；日志仅 `request_id` / `code` / HTTP 状态。
  - `ResumeDraftApi`：`createResumeDraft(file)`、`getCurrentResumeDraft()`（404 `draft_not_found` 返回 `null`，不抛错、不记日志）、`updateCurrentResumeDraft(fields)`。
  - `ResumeApi`：`createResume()`，请求体固定 `{confirmed: true}`。
- **测试：** mock `fetch`：成功解析 `DraftResponse` / `CreateResumeResponse`（含 200 与 201 的 `already_saved`）；错误体解析含 `details`；非 JSON 的 413 / 502 / 504 → `unknown_error` 且不暴露原始响应体；超时（fake timers）→ `client_timeout`，网络 reject → `network_error`；GET 404 → `null` 且无 `console` 输出；上传请求体为 `FormData` 字段 `file` 且未设 Content-Type；请求带 `credentials: 'same-origin'`；任何路径下 `console` 未输出请求体 / 响应体。
- **预估：** 6h
- **前置依赖：** Task 1.3

**v2 增量（权威）**
- **涉及文件：** `src/api/ApiClient.ts`、`ApiError.ts`、`ResponseShapes.ts` 及对应 `*.test.ts`；`ResumeDraftApi.ts`/`ResumeDraftApi.test.ts` 删除。
- **内容：** design §3.2、TD-28：`method` 增 `PUT|DELETE`；`responseMode: json|none|blob`（`none` 期望 204，其他 2xx → `unknown_error`；`blob` 校验 `Content-Type` ∈ pdf/jpeg/png）；三种模式下非 2xx 均按 JSON 错误体解析；`CHAT_TIMEOUT_MS = 75_000`；`quietCodes` 仅 `DELETE` 的 `session_not_found`；`ResponseShapes` 删 `isDraftResponse`，新增 `isSessionDetail`（`status`/`update_state` 与 `fields`·`resume`·`update_candidate` 互斥一致性）、`isSessionList`、`isSendMessageResponse`、`isSuggestionActionResponse`、`isSessionFieldsResponse`、`isUpdateResumeResponse`、`isArchivedResume`、`isResumeList`；形状校验失败 = `unknown_error`，**不得进入成功分支**（F-03 基础）。
- **验收：** 保留 v1 json 模式全部用例；204 成功 / 非 204 失败；blob 类型校验与 JSON 错误体解析；`SessionDetail` 互斥不一致 → `unknown_error`；`PUT`/`DELETE`；对话 75s、其余 30s（fake timers）；日志仍只含 `request_id`/`code`/状态。非 `HIGH_RISK`，只测主路径与主要异常。
- **前置依赖：** Task 1.3。 **HIGH_RISK：** 否。 **预估：** 5h。

#### 子任务

- [x] `ApiError` 与工厂
- [x] `ApiClient`（超时、错误转换、日志约束）
- [x] `ResumeDraftApi`、`ResumeApi`
- [x] 契约样例的 mock 工厂（供后续切片测试复用，放 `src/test/`）

### Task 1.5：hooks/model 纯逻辑 ✅
- **关联：** REQ-FE-01.1、01.2、02.1、02.2、03.4、03.5、04.1、04.2；design.md §3.3、§4.2–§4.4、§6（SectionConfig / FieldRules / UploadPrecheck / SectionView）、§6.1（`FIELD_MAX_LENGTH`）、TD-06、TD-07；G-01、G-02、CR-01、CR-01a
- **内容：** `src/hooks/model/SectionConfig.ts`（11 个分区、22 字段、控件类型、核心标记、子项字段配置）、`FieldRules.ts`（`normalizePhone`、`PHONE_PATTERN`、`EMAIL_PATTERN`、`EMAIL_MAX_LENGTH = 254`、`FIELD_MAX_LENGTH` 按 design §6.1 逐项取自 OpenAPI 0.1.1、`validateCore`、`reasonText`、字段路径 `a[0].b` 解析）、`UploadPrecheck.ts`（扩展名、MIME、10485760 字节、0 字节、多文件取第一个并提示）、`SectionView.ts`（分区状态汇总优先级 `missing` > `uncertain` > `recognized` > `confirmed`、`firstTodoSection`、`coreReady`、`unconfirmedCount`、`hasUnsubmittedEdits`、分区内高亮排序）。文件均为纯 TS，无 DOM。
- **测试：** 手机号：`13800138000`、`+85212345678` 通过，10 位 / 含字母 / `+` 位数不足拒绝，`138 0013 8000`、`138-0013-8000` 规范化后通过，提交原值超 32 字符拒绝；邮箱：`a@b.co` 通过，`a@b`、`a b@c.d`、255 字符拒绝；`FIELD_MAX_LENGTH` 每个上限做边界断言（等于通过、超 1 失败），并与 OpenAPI 0.1.1 数值核对；核心三项空白拒绝；`UploadPrecheck`：`.PDF` 通过、`.docx` 拒绝、恰好 10 MB 通过、10 MB + 1 拒绝、0 字节拒绝；`SectionConfig` 的字段集合与 `ResumeFields` 22 键一一对应、分区合计 22；`SectionView`：状态优先级、活跃分区选取（含全部已确认）、`coreReady`、未确认计数、缓冲存在判定。
- **预估：** 6h
- **前置依赖：** Task 1.3

#### 子任务

- [x] `SectionConfig`
- [x] `FieldRules`（含上限表）
- [x] `UploadPrecheck`
- [x] `SectionView`

- **v2 状态：** 保持 ✅。`FieldRules`、`UploadPrecheck`、`SectionConfig`、`SectionView` 的既有用例沿用；v2 对其的增补（`labelOfField`、`valuesAsFields`）在 1.10。

### Task 1.6：SessionReducer（会话状态机，按 design §5.3 重写） ✅
- **关联：** REQ-FE-01.5、03.2、04.3–04.8、05.2、05.3；design.md §3.3（SessionReducer）、§5.2、§5.3、§6、TD-02/03/04/05/12；O-02、O-10、D-01
- **内容：** `src/hooks/model/SessionReducer.ts`：状态类型与全部动作 / 转移（design §5.3 逐行实现）：`bootstrapping` / `bootstrap_failed` / `empty` / `reviewing` / `saved`；`view`、`busy` 互斥、`epoch` 丢弃过期响应、`editBuffer`、`fieldErrors`、`notice`、`error`、`pendingFile`、`overwriteAcknowledged`、`savedSummary`、`dialog`。纯函数，无副作用。
- **测试：** 逐条覆盖 §5.3 转移表：GET 200 / 404 / 其他失败；上传 201 与失败（失败不清旧草稿，O-02）；覆盖确认流转；PATCH 200 / 422 / `draft_not_found` / 其他失败；进入 / 退出最终确认；确认成功（`already_saved` 两分支）、`draft_not_found`（→ 空态 + `maybe_saved`）、422、超时 / 5xx（停留 `final`）；新对话与 `overwriteAcknowledged`；`busy` 非空时拒绝新请求类动作；过期 epoch 的响应不改变状态；`saved` 后状态不含手机号 / 邮箱等简历内容。
- **预估：** 6h
- **前置依赖：** Task 1.5

**v2 增量（权威）**
- **涉及文件：** `src/hooks/model/SessionReducer.ts`、`SessionReducer.test.ts`（重写）。
- **内容：** design §3.3、§5.2、§5.3 A–G、TD-02/03/04/05/16..19/24/29：`Busy` 扩展（`upload|read|patch|chat|suggest|confirm|update|delete`，`read` 带 `readPurpose`）；`SessionState` 以 `sessionId` 标识，`reviewing` 用 `draft={original_file,fields}`，`saved` 用 `saved={resume,update_state,update_candidate}`；`messages`/`pendingMessage`/`diff`/`dialog(leave|delete|unconfirmed|unsubmitted_edits)`/`notice(already_saved|updated|session_gone)`；`enterSession(detail)` 为唯一装入口；删除 `BOOTSTRAP_*`、`OVERWRITE_*`、`overwriteAcknowledged`、`restored`；`epoch` 在切换 / 新对话 / 删除当前 / 会话不存在时递增；应用建议成功清除对应 `editBuffer`；结果未知后的重读核对事件（`MESSAGE_VERIFIED`/`CONFIRM_VERIFIED`/`UPDATE_VERIFIED`）。纯函数，无副作用、无 DOM。
- **验收：** 表驱动覆盖 §5.3 每一行；`busy` 互斥与过期 epoch 丢弃；失败不清空旧视图；`saved` 后状态不含手机号 / 邮箱等简历内容之外的多余副本（内容只在 `saved.resume`）；“已保存 / 已更新”notice 仅由成功事件或核对事件置位（F-03 在 reducer 层的基础断言，完整红线在 2.6 / 2.13 / 3.1）。同一等价类只留代表值。
- **前置依赖：** Task 1.3、Task 1.5。 **HIGH_RISK：** 否（状态转移本身；F-03 红线测试放在 2.6、2.13）。 **预估：** 10h。

#### 子任务

- [x] 状态与动作类型
- [x] 转移实现与表驱动测试

### Task 1.7：api 模块（Session / Conversation / Resume / Archive） ✅
- **关联：** design §3.2、§6（SessionApi…ArchiveApi）、TD-28；interface_spec v0.3 DD-12..DD-22；REQ-FE-01、03、04、05、07、08、09
- **涉及文件：** `src/api/SessionApi.ts`、`ConversationApi.ts`、`ResumeApi.ts`（改）、`ArchiveApi.ts` 及各 `*.test.ts`（`ResumeApi.test.ts` 重写）。
- **内容：** `createSession(file)`、`listSessions()`、`getSession(id)`、`deleteSession(id)`（`none` 模式）、`updateSessionFields(id, fields)`；`sendMessage(id, content)`（75s）、`applySuggestions`/`cancelSuggestions(id, mid)`；`createResume(sessionId)`（体恒为 `{confirmed:true}`）、`updateResume(sessionId)`（体恒为 `{confirm_update:true}`）；`listResumes()`、`getResume(id)`、`downloadResumeFile(id)`（`blob`）。固定 URL / 方法 / 超时 / 模式 / 校验；路径参数 `encodeURIComponent`；不含任何 UI 文案。
- **验收：** 每个函数一例成功 + 一例主要错误（`session_not_found` 或通用错误）；请求体恒定值断言；路径编码一例；`DELETE` 404 视为成功一例；上传体为 `FormData` 字段 `file` 且不手设 Content-Type；`credentials: 'same-origin'`；`console` 不输出请求 / 响应体。同一等价类只留代表值。
- **前置依赖：** Task 1.4。 **HIGH_RISK：** 否。 **预估：** 5h。

#### 子任务

- [x] `SessionApi`、`ConversationApi`
- [x] `ResumeApi`（改）、`ArchiveApi`
- [x] 各模块测试

### Task 1.8：Verify（结果未知后的核对，纯逻辑；HIGH_RISK：F-03） 🆕 v2 新增 ✅（v2 第一批审查 PASS，DL 2026-11-11 确认）
- **关联：** design §3.3、§6（Verify）、TD-19；REQ-FE-04.6、07.3、09.4；G2-04
- **涉及文件：** `src/hooks/model/Verify.ts`、`Verify.test.ts`。
- **内容：** `matchSentMessage(messages, knownIds, text)`（尾部连续 `user(content===text)` + `assistant`，二者 `message_id` 均 ∉ `knownIds`）、`decideAfterConfirmRead(detail)` → `saved{already}` | `still_reviewing`、`decideAfterUpdateRead(detail)` → `applied|pending|other`、`cardStatus(suggestions)`（四种卡片状态，由 backend 的 `Suggestion.status` 归纳，前端不推断）。
- **验收：** 命中 / 未命中 / 重复文本消息靠 `knownIds` 区分；`decideAfterConfirmRead` 对 `status=saved`（含 `update_state=pending`）与 `reviewing` 的判定；`decideAfterUpdateRead` 三种；`cardStatus` 四种。**F-03 关键断言：** 无法从读取结果确认已保存 / 已更新时一律回落到“未确认”，不得默认成功。
- **前置依赖：** Task 1.3。 **HIGH_RISK：** 是（决定“已保存 / 已更新”是否显示）。 **预估：** 3h。

#### 子任务

- [x] `Verify` 四个纯函数
- [x] 表驱动测试（含 F-03 回落断言）

### Task 1.9：UpdateDiff（更新差异计算，纯逻辑；HIGH_RISK：差异必列清空字段） 🆕 v2 新增 ✅（v2 第一批审查 PASS，DL 2026-11-11 确认）
- **关联：** design §3.3、§6（UpdateDiff）、TD-23；REQ-FE-09.2；Y-02
- **涉及文件：** `src/hooks/model/UpdateDiff.ts`、`UpdateDiff.test.ts`。
- **内容：** `buildUpdateDiff(resume, candidate)`：按 `SECTIONS` 顺序遍历 22 个键；标量 `null`/空白视为同一“空”，字符串先 trim；文本列表逐项 trim 并丢弃空项，**顺序有意义**；经历子项缺失键与 `null` 视为相同，子项键集合取 `SectionConfig`；有差异的逐项给出，候选为空而已有值非空 → `clears=true` 且**必列**；相同字段只计数；附原始文件新旧名称。
- **验收：** 相同 / 不同 / **候选清空（`clears`）必出现于差异列表** / 列表顺序不同 / 经历子项缺失键 vs `null` / 仅文件不同 各一例代表值；`clears` 字段不会被“相同”或归一化吞掉（红线：差异卡片必须列出将被清空的字段）。
- **前置依赖：** Task 1.3、Task 1.5。 **HIGH_RISK：** 是。 **预估：** 3h。

#### 子任务

- [x] `buildUpdateDiff` 与归一规则
- [x] 表驱动测试（含 `clears` 必列断言）

### Task 1.10：小工具增补（FormatTime / labelOfField / valuesAsFields） ✅
- **关联：** design §3.3（FormatTime、SectionConfig、SectionView）、TD-22；REQ-FE-05.2、07.4、08.3、09.2
- **涉及文件：** `src/hooks/model/FormatTime.ts`（新增，由 `SavedResultCard.tsx` 的 `formatSavedAt` 上移）、`SectionConfig.ts`（加 `labelOfField(key)`）、`SectionView.ts`（加 `valuesAsFields(values)`）及各自既有测试文件追加用例。
- **内容：** `formatDateTime(iso)` 供列表、消息、归档、结果卡共用；`labelOfField` 覆盖 19 个建议字段，白名单外字段抛错（由形状校验兜底）；`valuesAsFields` 把 `ResumeValues` 适配为带占位状态的 `ResumeFields`，仅供渲染、不上送。
- **验收：** `formatDateTime` 一例；`labelOfField` 对 19 个字段完整、对白名单外抛错；`valuesAsFields` 22 键齐全且产物不用于任何请求体。
- **前置依赖：** Task 1.3、Task 1.5。 **HIGH_RISK：** 否。 **预估：** 2h。

#### 子任务

- [x] `FormatTime`（含 `SavedResultCard` 调用点）
- [x] `labelOfField`、`valuesAsFields`

---

## 阶段 2：功能切片

> 每个切片是用户可见能力：组件 → hook → api 调用 → 测试。HIGH_RISK（受约束 F-03 约束）单独成任务。

### Task 2.1：页面外壳与会话装入（REQ-FE-05 骨架，去掉启动读草稿） ✅
- **关联：** REQ-FE-05.1、05.3、REQ-FE-06.1；design.md §3.3（useResumeSession）、§3.4（AppShell、NewChatButton、ChatThread、WelcomePanel、NoticeBanner、BootstrapErrorPanel）、§3.5（ResumeCollectionPage）、§5.1（启动分支）、§7.1（启动失败、无可恢复草稿）、TD-08；P-02、P-11；O-12、裁决 F-03
- **内容：** `src/hooks/useResumeSession.ts`（`useReducer` 驱动；`bootstrap`、`retryBootstrap`；调用 `getCurrentResumeDraft`；StrictMode 下不产生重复请求副作用；`busy` 互斥；epoch 记录），`src/pages/ResumeCollectionPage.tsx`（按 `phase` 编排，不请求接口），`AppShell`（顶栏 Logo + 产品名、左窄栏仅含 `NewChatButton`，无用户信息与历史列表，< 860px 折叠为顶栏）、`NewChatButton`（本任务仅渲染，禁用逻辑与确认流程在 2.7）、`ChatThread`（基础滚动容器）、`WelcomePanel`（空态引导，无填写指南 / 隐私说明 / 示例文件按钮）、`NoticeBanner`（四类文案）、`BootstrapErrorPanel`（可重试，隐藏上传主入口）。`App` 改为挂载页面。
- **测试：** 页面启动：GET 404 → 空态，**无错误提示、无 `console` 输出**（O-12）；GET 500 / 网络失败 / 非 JSON → 可重试错误态且不是空态、无上传主入口；点击重试后成功进入下一状态；加载态显示；外壳不含用户头像、历史会话、填写指南、隐私说明、示例文件按钮；请求带 `same-origin`；StrictMode 下仅一次有效 GET。
- **预估：** 6h
- **前置依赖：** Task 1.2、Task 1.4、Task 1.6

**v2 增量（权威）**
- **涉及文件：** `src/hooks/useResumeSession.ts`（去 `bootstrap`/`retryBootstrap`/`getCurrentResumeDraft`，加 `openSession`、入参 `{onActivity}`、`enterSession`）、`src/pages/ResumeCollectionPage.tsx`（删 `bootstrapping/bootstrap_failed` 分支与 overwrite/new_chat 对话框，加 `visible` 属性）、`WelcomePanel.tsx`（去 `draft_not_found` 位）、`NoticeBanner.tsx`（删 `restored`/`draft_expired`/`maybe_saved`，加 `session_gone`）、`BootstrapErrorPanel.tsx` 与其测试（删除）；页面级测试夹具迁移：`ResumeCollectionPage.test.tsx`（重写启动用例）、`.edit.test.tsx`、`.items.test.tsx`、`.review.test.tsx`（仅换夹具）。
- **内容：** 启动不再读单草稿；空态直接展示 `WelcomePanel`；`openSession(id)` 经 `getSession` 装入并按 `status` 分流；StrictMode 无重复副作用（启动无请求）。列表数据由 2.9 提供，本任务页面先接受 `sidebar` 空插槽。
- **验收：** 启动无会话请求即进入空态且无错误提示、无 `console` 输出；`openSession` 对 `reviewing`/`saved` 分流；`session_not_found` → 回空态 + `session_gone` 提示；外壳仍无头像 / 历史以外的用户信息；edit / items 页面测试换夹具后全部通过且断言未改。
- **前置依赖：** Task 1.4、Task 1.6、Task 1.7。 **HIGH_RISK：** 否。 **预估：** 7h。

#### 子任务

- [x] `useResumeSession`（bootstrap）
- [x] 外壳与空态 / 错误态组件
- [x] `ResumeCollectionPage` 与 `App` 接线

### Task 2.2：上传简历（REQ-FE-01，上传即新建会话） ✅
- **关联：** REQ-FE-01.1–01.6；design.md §3.4（ComposerBar、FileCard、UploadProgressNotice、ErrorAlert、ConfirmDialog）、§5.1、§5.3（上传相关行）、§6、§7.1（上传相关）、TD-04/05/10；P-03、P-05；C-07、C-08、O-02、裁决 F-04
- **内容：** `ComposerBar`（📎 上传 `accept` 单选、整页拖拽取第一个、底部免责提示、**无文本框**、忙碌态禁用）、`FileCard`、`UploadProgressNotice`（单一加载提示“正在识别，最长约 1 分钟”）、`ErrorAlert`（契约错误只展示 `message`，前端自有码用固定文案，附 `request_id`）、`ConfirmDialog`（本任务启用“覆盖确认”）；`useResumeSession` 增加 `requestUpload`、`confirmOverwriteAndUpload`；上传成功后以占位方式进入 `reviewing`（展示由 2.3 完成）。
- **测试：** 预校验阻止（类型不支持、10 MB + 1、0 字节、多文件）且不发请求；上传中显示单一加载提示、输入区与“新对话”禁用、无法重复提交；75s 超时（fake timers）→ 提示重新上传；backend 错误（`file_*`、`unsupported_file_type`、`parse_failed`、`parse_unavailable`、`parse_timeout`）只展示 `message`，失败后保留原草稿（O-02）；有草稿时先弹覆盖确认，取消则不发请求，确认后才发；无草稿直接上传；`ComposerBar` 无 `textarea`；日志不含文件内容。
- **预估：** 6h
- **前置依赖：** Task 2.1

**v2 增量（权威）**
- **涉及文件：** `useResumeSession.ts`（`requestUpload` 改为 `createSession`，删 `confirmOverwriteAndUpload`）、`ComposerBar.tsx`（上传 / 拖拽保持；文本输入由 2.10 加）、`ResumeCollectionPage.upload.test.tsx`（删覆盖确认用例，改会话端点）、`ComposerBar.test.tsx`（仅调整，不含文本输入断言）。
- **内容：** 上传永远新建会话，**无覆盖确认**；有未提交编辑时走离开确认（意图 `upload(file)`，TD-29、Q-TD-02，对话框由 2.9 提供，本任务先留意图类型与调用点）；成功后进入 `reviewing` 并触发 `onActivity()`。预校验、75s 超时、`ErrorAlert`、单一加载提示沿用。
- **验收：** 预校验阻止（类型 / 10MB+1 / 0 字节 / 多文件）不发请求；上传中输入区与“新对话”禁用；成功进入新会话且旧会话不被覆盖；backend 上传错误（取 `parse_failed` 与 `file_too_large` 各一例）只展示 `message`，失败不改变当前视图；无覆盖确认弹窗。
- **前置依赖：** Task 2.1。 **HIGH_RISK：** 否。 **预估：** 4h。

#### 子任务

- [x] `ComposerBar`、`FileCard`、`UploadProgressNotice`、`ErrorAlert`
- [x] `ConfirmDialog`（覆盖确认）
- [x] `useResumeSession` 上传动作

### Task 2.3：识别结果展示（REQ-FE-02，去草稿恢复展示） ✅
- **关联：** REQ-FE-02.1–02.4、05.2；design.md §3.4（FieldStatusTag、ReadOnlySection、ReviewSummary、SectionCard 只读态）、§4.1–§4.3、§6；P-04、P-06、P-10、B-04
- **内容：** `FieldStatusTag`（待确认 / 不确定、请确认 / 待补充 / 已确认，文字 + 颜色）、`ReadOnlySection`、`ReviewSummary`（四状态计数与待处理分区跳转芯片）、`SectionCard` 只读骨架（11 个分区全部展示，分区内 `missing` / `uncertain` 置顶高亮，`null` 显示“（未提供）”，手机号完整显示）；上传成功与恢复成功后选取活跃分区，恢复时显示“已为你恢复未完成的简历”（`NoticeBanner`）；全部已确认则进入最终确认视图。
- **测试：** 用覆盖四种状态与空列表的合成 `DraftResponse` 渲染：22 字段全部出现且按 11 区分组；四种状态文案与颜色类正确；`recognized` 不显示为已确认；`missing` / `uncertain` 在分区内置顶；经历类多条展示；手机号完整显示；非核心字段为空不阻塞展示；恢复成功出现恢复提示；上传成功与恢复成功选取同一规则的活跃分区；页面不自行补全任何字段值。
- **预估：** 5h
- **前置依赖：** Task 2.2

**v2 增量（权威）**
- **涉及文件：** `ReadOnlySection.tsx`（`showStatus`、`emptyText`、导出 `ValueView`）及测试；`ResumeCollectionPage.review.test.tsx`（删恢复提示用例）。
- **内容：** 校对中视图行为与 v1 完全一致（`showStatus=true`、`（未提供）`，Q-TD-03）；`showStatus=false` 时不渲染 `FieldStatusTag` 与 attention 高亮、不读 `fields[key].status`，供 2.12 / 2.14 使用；活跃分区选取规则沿用。
- **验收：** 校对中既有展示用例全部通过（22 字段 / 11 区 / 四状态）；`showStatus=false` 无状态标签且空值显示 `emptyText`；不再出现“已为你恢复未完成的简历”。
- **前置依赖：** Task 2.2。 **HIGH_RISK：** 否。 **预估：** 3h。

#### 子任务

- [x] `FieldStatusTag`、`ReadOnlySection`、`ReviewSummary`
- [x] `SectionCard` 只读态与活跃分区选取
- [x] 恢复提示接线

### Task 2.4：分区核对 — 标量与文本列表编辑（REQ-FE-03） ✅
- **关联：** REQ-FE-03.1–03.2、03.4–03.6、REQ-FE-02.4；design.md §3.4（FieldRow、StringListEditor、SectionCard 编辑态、QuickReplyChips）、§4.4、§5.3（编辑 / 确认本区行）、§6、§6.1、TD-01/03/09/15；P-01 选 A、P-04；G-01、G-02、D-06、O-11
- **内容：** `FieldRow`（受控输入、失焦与提交前校验、`FIELD_MAX_LENGTH` 超限提示、字段级后端错误显示且不回显值、“未提交修改”小标记）、`StringListEditor`（行内编辑 / 新增 / 删除，条数达上限禁用新增，删空为 `[]`）、`SectionCard` 编辑态（“确认本区”按钮：核心字段为空或非法时禁用并就地说明，含 `missing` 非核心字段时提示“空项将按留空确认”，已确认无缓冲显示“已确认”，有缓冲显示“确认修改”）、`QuickReplyChips`（“确认无误”“其余都没问题”等价按钮动作，不追加用户消息）；`useResumeSession` 增加 `editField`、`confirmSection`、切换分区；PATCH 请求体按 design §4.4 构造（整区全部字段，手机号规范化，文本 trim，全空白非核心提交 `null`，列表提交完整新列表）；422 `details` 映射到字段。
- **测试：** 核心三项缺失时引导补充且“确认本区”禁用；手机号 / 邮箱即时提示（OpenAPI 示例与反例、空格 / 连字符规范化后提交的值不含空格与连字符）；超出上限的输入提示“内容过长”；PATCH 请求体只含当前分区字段、未触碰的分区不提交；`missing` 非核心字段按 `null` 提交、列表按 `[]` 提交；成功后以 backend 返回替换草稿并跳到下一个待确认分区；422 `details`（含 `reason` 5 值）在字段旁展示且不回显值；PATCH 失败 / 超时保留缓冲并可重试；同一时刻只有一个在途 PATCH（重复点击被忽略）；快捷指令等价按钮；输入区无文本框。
- **预估：** 8h
- **前置依赖：** Task 2.3

#### 子任务

- [x] `FieldRow`、`StringListEditor`
- [x] `SectionCard` 编辑态与 `QuickReplyChips`
- [x] `useResumeSession` 编辑与分区提交
- [x] 请求体构造与 422 映射

- **v2 状态：** 保持 ✅。`SectionCard`、`FieldRow`、`StringListEditor`、`QuickReplyChips` 不变（design §3.7）；`useResumeSession` 中 `editField` / `confirmSection` 随 2.1 重写时原样保留；页面级 `ResumeCollectionPage.edit.test.tsx` 仅换夹具（2.1 完成）。应用建议后清除对应 `editBuffer` 的行为在 2.11。

### Task 2.5：分区核对 — 经历类子项编辑（REQ-FE-03.3） ✅
- **关联：** REQ-FE-03.3、03.6；design.md §3.4（ObjectListEditor）、§4.4、§6（ObjectListEditor）、§6.1（经历区块上限）；O-11、CR-01a
- **内容：** `ObjectListEditor`：工作经历、项目经历、教育背景的多条子项新增 / 修改 / 删除（可折叠卡片，无重排）；工作经历子项含 `responsibilities` / `achievements` 两个文本列表（复用 `StringListEditor`）；子项条数上限 20、子项内字符串上限 2000、`responsibilities` / `achievements` 条数上限 30，均取自 `FIELD_MAX_LENGTH`；删除子项后清除该分区下标类 `fieldErrors`；字段路径 `work_experiences[0].start_date` 映射到对应行；列表整块提交。
- **测试：** 新增 / 修改 / 删除子项后提交体为完整新列表；达到 20 条时新增禁用；子项字符串超 2000 提示；`responsibilities` 超 30 条禁用新增；422 `details` 的下标路径定位到正确子项行；删除子项后旧下标错误被清除；空列表可作为“确认留空”提交；三类经历区块的子项字段与 OpenAPI 的 `WorkExperience` / `ProjectExperience` / `Education` 字段一致。
- **预估：** 6h
- **前置依赖：** Task 2.4

#### 子任务

- [x] `ObjectListEditor` 与子项配置渲染
- [x] 下标错误映射与清除

- **v2 状态：** 保持 ✅。`ObjectListEditor` 不变；`ResumeCollectionPage.items.test.tsx` 仅换夹具（2.1 完成）。

### Task 2.6：最终确认与保存结果（REQ-FE-04，HIGH_RISK：约束 F-03，会话版） ⟳ v2 重开
- **关联：** REQ-FE-04.1–04.8；design.md §3.4（FinalReviewCard、SavedResultCard、ConfirmDialog）、§5.1、§5.3（最终确认相关行）、§6、§7.1、§9.2、TD-04/11；B-04、F-03、C-05、C-10、C-11、D-01、D-03、D-04、O-08、O-10、P-09、Q-DL-03
- **内容：** `FinalReviewCard`（11 区全文只读、未确认字段数提示、“确认提交”仅在核心三项齐全、合法且为 `confirmed` 时可点，否则说明原因；“我还要修改”；失败时卡内 `ErrorAlert`，按钮可直接重试）、`SavedResultCard`（`already_saved=false`：“已保存”+ 姓名 / 原始文件名 / 保存时间 +“上传下一份”；`already_saved=true`：仅“该简历已保存过”，不展示任何记录内容；均不显示 `resume_id` / 记录编号）、`ConfirmDialog`（启用“存在未确认字段”和“存在未提交编辑”两类）；`useResumeSession` 增加 `goFinal`、`backToSections`、`confirmResume`、`resetAfterSaved`；成功后只保留 `savedSummary`，清空草稿与缓冲；`draft_not_found` → 空态 + “可能已保存，请重新上传核实”；422 返回对应分区。
- **测试：** 约束 F-03 重点用例：成功响应之前（进行中、超时、网络失败、5xx、`save_failed`、422、`draft_not_found`）界面任何位置都不出现“已保存”；超时 / 网络失败后按钮可立即重试且不调用任何状态查询；`already_saved` 依据字段而非 HTTP 状态（200 / 201 两种都覆盖），`true` 时不渲染任何已有记录内容；成功后内存中无手机号 / 邮箱等简历内容，仅姓名 / 文件名 / 保存时间；核心三项未就绪时确认按钮禁用；仍有未确认字段时先弹提示，取消不发请求，继续后发送；存在未提交编辑时被拦截；进行中防重复点击；`recognized` 字段在最终视图中不显示为已确认；数据验证：断言 `POST /resumes` 请求体恰为 `{confirmed: true}` 且只发送一次。
- **预估：** 9h
- **前置依赖：** Task 2.4（Task 2.5 可并行，进入最终确认的集成场景以 2.5 完成为准）

**v2 增量（权威）**
- **涉及文件：** `useResumeSession.ts`（`confirmResume(sessionId)`、保存后重读会话、`verifyByConfirm`）、`SavedResultCard.tsx`（`saved`/`already_saved` 两形态；`updated` 在 2.13）、`FinalReviewCard.tsx`（仅文案，design §6）、`ResumeCollectionPage.final.test.tsx`、`SavedResultCard.test.tsx`、`FinalReviewCard.test.tsx`。`draft_not_found → 空态 + 可能已保存` 整条路径删除。
- **内容：** `POST /sessions/{id}/resume`，体恒为 `{confirmed:true}`；成功后**会话保留**并转只读（重读会话，内容来自正式库，TD-11 v2）；超时 / 网络失败 / `unknown_error` / `session_read_only`（409）→ 先 `GET` 会话再决定（`Verify.decideAfterConfirmRead`，TD-19，G2-04）；`already_saved` 依据响应字段而非 HTTP 状态；不显示 `resume_id`；422 回对应分区。
- **验收（F-03 确定性用例，沿用 v1 用例集并迁移）：** 成功响应之前（进行中、超时、网络失败、5xx、`save_failed`、422、409 未核对为已保存、形状不符的 2xx）任何位置都不出现“已保存”；仅 POST 2xx 且形状通过，或重读到 `status=saved` 才出现；`already_saved=true` 出现“该简历已保存过”，**不出现“已保存”/“已更新”**；核对路径：超时后重读命中已保存 → 显示已保存且不再重发 POST，未命中 → 保持校对中并可重试；`POST` 请求体恰为 `{confirmed:true}` 且每次点击只发一次；核心三项未就绪按钮禁用。
- **前置依赖：** Task 2.3、Task 1.8、Task 1.7。 **HIGH_RISK：** 是（F-03）。 **预估：** 7h。

#### 子任务

- [ ] `FinalReviewCard`、`SavedResultCard`
- [ ] `ConfirmDialog` 两类场景
- [ ] `confirmResume` 及全部错误分支
- [ ] HIGH_RISK 用例集（单独成组）

### Task 2.7：新对话（清空视图 + 离开确认，去覆盖语义） ⟳ v2 重开
- **关联：** REQ-FE-01.5；design.md §3.4（NewChatButton）、§5.3（新对话相关行）、TD-12；P-08、C-07、Q-DL-04
- **内容：** `NewChatButton` 启用与禁用逻辑（忙碌态禁用）；`useResumeSession` 增加 `requestNewChat`、`confirmNewChat`；有未确认草稿或未提交编辑时先弹确认，文案明示“刷新页面会恢复该草稿，再次上传会覆盖它”；确认后清空界面、`epoch++`、`overwriteAcknowledged=true`（后续首次上传不再重复覆盖确认）；`empty` / `saved` 下无需确认；“上传下一份”复位。
- **测试：** 无草稿时直接清空；有草稿时弹确认，取消不变，确认后清空且不调用任何接口（无丢弃草稿接口）；确认后再次上传不再弹覆盖确认；刷新（重新 bootstrap）后旧草稿仍被恢复；忙碌期间按钮禁用；过期响应在新对话后被丢弃。
- **预估：** 3h
- **前置依赖：** Task 2.6

**v2 增量（权威）**
- **涉及文件：** `NewChatButton.tsx`（不变）、`useResumeSession.ts`（`requestNewChat`/`confirmNewChat` 简化）、`ResumeCollectionPage.newchat.test.tsx`（重写）。
- **内容：** “新对话”仅清空当前视图并 `epoch++`，**会话不删除、仍在列表中**；仅当 `editBuffer` 非空时弹离开确认（TD-12、TD-29，对话框与意图由 2.9 提供）；删除 `overwriteAcknowledged`；`empty`/`saved` 下无需确认；“上传下一份”复位。
- **验收：** 无未提交编辑时直接清空且不调任何接口；有未提交编辑时弹确认，取消不变、确认后清空；忙碌期间按钮禁用；新对话后到达的旧响应被丢弃（epoch）。
- **前置依赖：** Task 2.9。 **HIGH_RISK：** 否。 **预估：** 2h。

#### 子任务

- [ ] `NewChatButton` 与对话框接线
- [ ] `requestNewChat` / `confirmNewChat` 与 epoch 处理

### Task 2.8：无障碍与响应式（增量：新控件与焦点键） ⟳ v2 重开
- **关联：** design.md §3.3（useChatScroll）、§3.4（ChatThread）、§6（ChatThread、AppShell）、TD-13、TD-14；Q-DL-05
- **内容：** `src/hooks/useChatScroll.ts`（仅返回“需要滚动 / 聚焦的区块 key”，不触碰 DOM 样式）、`ChatThread` 使用该信号完成 `scrollIntoView` / `focus()`；`aria-live="polite"` 播报加载与保存结果、`role="alert"` 用于错误；分区推进后焦点移到新分区标题；< 860px 外壳折叠（`Drawer` 或顶栏按钮承载“＋ 新对话”）；状态用文字 + 颜色；核心按钮键盘可达。
- **测试：** 按角色与名称查询核心按钮并通过键盘触发；加载 / 错误 / 保存结果出现在对应 `aria-live` / `role=alert` 区域；分区推进后焦点位于新分区标题；`useChatScroll` 为纯信号（不引用 DOM API）；窄屏下外壳折叠且“＋ 新对话”仍可达（以 `matchMedia` mock 验证）。
- **预估：** 4h
- **前置依赖：** Task 2.4

**v2 增量（权威）**
- **涉及文件：** `useChatScroll.ts`（`focusKeyOf` 输入加 `lastMessageId`、`diffOpen`，TD-31）及测试、`ResumeCollectionPage.a11y.test.tsx`、`AppShell.responsive.test.tsx`。
- **内容：** 新消息 → `message:last`；差异卡片打开 → `update-diff`；已保存视图 → `saved`；窄屏会话 `Drawer` 的可达性由 2.9 实现、本任务补 a11y 用例；`aria-live` 覆盖“思考中”与错误。
- **验收：** 新增控件（发送、应用 / 取消、会话项、删除、导航切换）可键盘触达；“思考中”与错误出现在 `aria-live` / `role=alert`；`useChatScroll` 仍为纯信号。只测上述，不扩展。
- **前置依赖：** Task 2.10、Task 2.13、Task 2.14。 **HIGH_RISK：** 否。 **预估：** 3h。

#### 子任务

- [ ] `useChatScroll` 与 `ChatThread` 焦点 / 滚动
- [ ] 外壳响应式与 aria 属性

### Task 2.9：会话栏、切换、删除与离开确认（REQ-FE-05） ✅
- **关联：** design §3.3（useSessionList）、§3.4（SessionList、AppShell）、TD-16/17/26/29/30；REQ-FE-05.1–05.6；ADR-008
- **涉及文件：** `src/hooks/useSessionList.ts`、`src/components/SessionList.tsx`、`AppShell.tsx`（加 `nav`/`sidebar` 插槽、窄屏 `Drawer`）、`ConfirmDialog` 文案（`leave`、`delete` 两种，组件本身不变）、`useResumeSession.ts`（`requestDelete`/`confirmDelete`/`confirmLeave`、`LeaveIntent`）、`ResumeCollectionPage.tsx`（接线）及测试。约 8 个文件。
- **内容：** 列表 `loading/error（重试）/空` 三态，失败只影响列表区（TD-16）；选会话 → `openSession`；`busy≠null` 时列表不响应；删除校对中（“信息与文件一并删除，无法恢复”）与已保存（“只删对话记录，归档简历保留”）两种文案；删除当前会话回空态、`DELETE` 404 视为成功；离开确认仅当 `editBuffer` 非空，意图 `switch(id)|new_chat|upload(file)`；上传 / 对话 / 应用 / 保存 / 更新 / 删除成功后各 `reload()` 一次，读取类不刷新（TD-30）；窄屏顶栏“会话”按钮开 `Drawer`，选后关闭。
- **验收（主路径 + 主要异常）：** 列表三态；切换会话互不影响；删除二次确认两种文案；删除当前会话回空态；无未提交编辑时切换不弹框、有则弹且取消不变；列表加载失败不阻塞主区；窄屏会话入口可达（`matchMedia` mock）。
- **前置依赖：** Task 2.3。 **HIGH_RISK：** 否。 **预估：** 8h。

#### 子任务

- [x] `useSessionList`、`SessionList`
- [x] `AppShell` 插槽与窄屏 `Drawer`
- [x] 删除、离开确认与 `reload` 接线

### Task 2.10：对话输入与消息列表（REQ-FE-07.1–07.3，HIGH_RISK：B-03 / F-03 / F-02） 🆕 v2 新增
- **关联：** design §3.4（ComposerBar、MessageList、MessageBubble、ThinkingNotice）、§5.4、TD-10/15/19/20；REQ-FE-07.1–07.3；ADR-007
- **涉及文件：** `ComposerBar.tsx`（文本输入、发送、字数、IME 守卫、只读态）、`MessageList.tsx`、`MessageBubble.tsx`、`ThinkingNotice.tsx`、`useResumeSession.ts`（`sendMessage`/`retryMessage`/`discardPendingMessage`）、`ResumeCollectionPage.tsx` 接线及测试。约 7 个文件。
- **内容：** `Input.TextArea` `autoComplete="off"`；Enter 发送、Shift+Enter 换行，`isComposing`/composition 期间 Enter 不发送；trim 空或 >2000 禁发（不截断）；发送即 `pendingMessage`，**成功才清空输入框**；失败或结果未知后输入框只读，气泡提供“重试 / 放弃”（放弃 = 原文回填）；超时 / 网络失败 → 先重读会话，`Verify.matchSentMessage` 命中则视为成功、未命中则可重试；`chat_failed` 展示 `message`；消息以**纯文本**渲染（不解析 Markdown / HTML）；`phase=empty` 提示先上传，`phase=saved` 禁用并提示。
- **验收（红线 + 主路径）：** B-03：对话成功 / 失败 / 超时路径对 `console.*`、`document.title` 用哨兵字符串断言不含对话原文与回复；F-03：对话中发“确认提交”只出现回复文本，**不发起 `POST …/resume`**；F-02：文本框 `autoComplete="off"`、不写任何浏览器存储；IME 与字数边界各一例；超时重读命中 / 未命中各一例；`busy` 互斥与防重复发送。
- **前置依赖：** Task 2.3、Task 1.8、Task 1.7。 **HIGH_RISK：** 是。 **预估：** 8h。

#### 子任务

- [x] `ComposerBar` 文本输入与 IME / 字数 / 只读
- [x] `MessageList`、`MessageBubble`、`ThinkingNotice`
- [x] `sendMessage` 及核对重读
- [x] 红线用例集（单独成组）

### Task 2.11：修改建议卡片（REQ-FE-07.4–07.6） 🆕 v2 新增
- **关联：** design §3.4（SuggestionCard、ChangeRows）、TD-21；REQ-FE-07.4–07.6；O2-01
- **涉及文件：** `SuggestionCard.tsx`、`ChangeRows.tsx`、`useResumeSession.ts`（`applySuggestions`/`cancelSuggestions`）、`MessageList.tsx` 接线及测试。
- **内容：** 一条助手消息一张卡；整卡应用 / 取消；`applicable=false` 行只展示原因文案；按钮仅在 `cardStatus=pending ∧ phase=reviewing ∧ !busy` 显示；应用成功用响应 `fields` 整体替换、**不自动跳转分区**、清除 `editBuffer` 中被应用字段（TD-03）、提供“查看 X 分区”芯片；`suggestion_unavailable` 在卡片内 `ErrorAlert`。
- **验收：** 四种卡片状态按钮显隐；应用后分区展示同步且对应 `editBuffer` 被清除；不可应用项无应用入口；`suggestion_unavailable` 卡内提示。非 HIGH_RISK，只测主路径与主要异常。
- **前置依赖：** Task 2.10。 **HIGH_RISK：** 否。 **预估：** 6h。

#### 子任务

- [ ] `ChangeRows`、`SuggestionCard`
- [ ] 应用 / 取消及 `editBuffer` 清理

### Task 2.12：已保存会话视图（REQ-FE-04.4、04.5、05.3） 🆕 v2 新增
- **关联：** design §3.4（SavedSessionView）、TD-11/18/22；REQ-FE-04.4、04.5、05.3
- **涉及文件：** `SavedSessionView.tsx`、`ResumeCollectionPage.tsx`（`saved` 分支改渲染）、`MessageList.tsx`（只读模式）及测试。
- **内容：** 组合 `FileCard` → `SavedResultCard` → 只读分区（`showStatus=false`、`emptyText='未填写'`，`valuesAsFields` 适配）→ `update_state=applied` 时静态一行“已按本次内容更新” → 只读 `MessageList`（建议卡无按钮）；重读失败（`saved=null`）时只显示结果卡 + “重新读取”。重新打开 `applied` 会话**不**触发“已更新”提示（TD-24）。
- **验收：** `saved/none`、`saved/pending`、`saved/applied` 三种会话渲染；空值显示“未填写”；只读消息无应用 / 取消按钮；重读失败回退结果卡；手机号 / 邮箱仅渲染不进日志。
- **前置依赖：** Task 2.6、Task 2.10、Task 2.3。 **HIGH_RISK：** 否。 **预估：** 4h。

#### 子任务

- [ ] `SavedSessionView`
- [ ] 重读失败回退

### Task 2.13：已保存过后的确认更新（REQ-FE-09，HIGH_RISK：F-03 “已更新” + 差异必列清空字段） 🆕 v2 新增
- **关联：** design §3.4（UpdateDiffCard）、§5.5、TD-23/24；REQ-FE-09.1–09.5；Y-01、Y-02
- **涉及文件：** `UpdateDiffCard.tsx`、`SavedResultCard.tsx`（`updated` 形态）、`useResumeSession.ts`（`openUpdateDiff`/`closeUpdateDiff`/`confirmUpdate`、`verifyByUpdate`）、`ResumeCollectionPage.tsx`（快捷回复“按本次内容更新”，不经模型）及测试。
- **内容：** 快捷回复进入差异卡（`buildUpdateDiff`）；卡内文件新旧名称、有差异字段（`clears` 行高亮并标“将被清空”）、其余 N 项相同；“确认更新”→ `PUT …/resume`，体恒为 `{confirm_update:true}`；**“已更新”仅在 PUT 2xx 且形状通过，或核对路径读到 `update_state=applied` 时出现**；`save_failed` 追加“已有简历未改变”；超时 / 网络失败 → 重试 / 重新读取核对；对话文字不发起 `PUT`。
- **验收（红线确定性用例）：** 差异卡出现、请求进行中、超时、`save_failed`、形状不符的 2xx 均不出现“已更新”；差异卡**必须列出所有 `clears` 字段**并标“将被清空”（候选清空某字段的合成数据断言）；`already_saved` 响应既不显示“已保存”也不显示“已更新”；核对读到 `applied` 才显示“已更新”；`PUT` 体恒为 `{confirm_update:true}` 且一次点击只发一次。
- **前置依赖：** Task 2.12、Task 1.9、Task 1.8。 **HIGH_RISK：** 是。 **预估：** 8h。

#### 子任务

- [ ] `UpdateDiffCard` 与快捷回复入口
- [ ] `confirmUpdate` 及核对重读
- [ ] 红线用例集（单独成组）

### Task 2.14：已归档简历页（REQ-FE-08） 🆕 v2 新增
- **关联：** design §3.3（useArchive）、§3.4（ArchiveList、ArchiveDetail）、§3.5（ArchivePage、App）、TD-25/26/27；REQ-FE-08.1–08.5
- **涉及文件：** `src/hooks/useArchive.ts`、`src/pages/ArchivePage.tsx`、`ArchiveList.tsx`、`ArchiveDetail.tsx`（含 `saveBlob`）、`src/App.tsx`（`view` 状态、两页同时挂载、`Segmented` 导航）及测试。约 8 个文件。
- **内容：** `App` 持有 `view`，两页同时挂载、非当前页 `hidden`（不引入路由库，不丢 `editBuffer` / 输入 / 当前会话）；归档页 `active` 由 false→true 时重读列表；`Table`（姓名、手机号、邮箱、求职意向，`null` 显示“未填写”，不显示 id）、空态“暂无记录”；详情 `Drawer`（9 分类只读、文件名、保存时间、最近更新）；“打开原始文件”：`file_available=false` 禁用并提示，点击走 blob + `saveBlob`（临时 `<a download>`、`revokeObjectURL`），**文件名为通用名**（`原始简历.pdf/.jpg/.png`），`file_not_available`/`resume_not_found` 页面内提示。
- **验收：** 列表 / 空态 / 详情；两页切换不丢对话页状态；下载文件名通用且调用 `revokeObjectURL`；`file_available=false` 禁用；手机号 / 邮箱不进日志与标题。非 HIGH_RISK（F-02 / B-03 的下载断言汇总在 3.1）。
- **前置依赖：** Task 2.1、Task 1.7、Task 2.3。 **HIGH_RISK：** 否。 **预估：** 8h。

#### 子任务

- [ ] `useArchive`、`ArchivePage`、列表与详情
- [ ] `App` 两页挂载与导航
- [ ] 文件下载与通用文件名

---

## 阶段 3：集成验证与收尾

> 仅放跨任务的页面级集成测试；各任务内已有单元与组件测试，不在此重复。

### Task 3.1：主流程、红线确定性测试与安全静态集成验证（HIGH_RISK：F-02 / F-03 / B-03） ⟳ v2 重开
- **关联：** design.md §9.1（交互流程、安全性静态）、§9.2、§9.3；REQ-FE-01..06 全部
- **内容：** 页面级集成测试（mock backend 契约，合成数据）：上传 → 分区确认（含经历类）→ 最终确认 → 已保存；草稿恢复三分支（200 / 404 / 500）；覆盖确认与新对话；上传超时；确认超时后重试成功；`already_saved` 与 `draft_not_found` 分支；存在未提交编辑时的拦截；全流程中断言：无“已保存”提前出现、未使用任何浏览器存储（spy `Storage` 与 `indexedDB`）、`console` 无简历内容 / 响应体。再运行 `npm run lint`（含三条自定义 ESLint 规则）、`npm test`、`npm run build` 并核对构建日志有真实编译动作；对 `design.md` §8 追溯矩阵 33 条验收标准逐条标注对应测试。
- **预估：** 6h
- **前置依赖：** 阶段 2 完成

**v2 增量（权威）**
- **涉及文件：** `ResumeCollectionPage.integration.test.tsx`（改会话版重写）、`src/test/` 下红线哨兵与 spy 工具（如需）、`App.test.tsx`（加 view 切换与两页保持挂载用例）。
- **内容：** 主流程：上传 → 对话 → 应用建议 → 分区确认 → 最终确认 → 已保存 → 已保存过 → 差异 → 确认更新；历史会话切换 / 删除；归档页列表 / 详情 / 下载。**红线（design §9.2）：** F-02 整条流程中 `Storage.prototype.setItem/getItem`、`indexedDB.open`、`document.cookie` setter 调用次数为 0，下载后 `revokeObjectURL` 被调用；F-03 见 2.6 / 2.13 用例集，本任务做端到端复核（含对话文字不发起 `POST …/resume` 与 `PUT`）；B-03 对 `console.*`、`document.title`、下载文件名用哨兵字符串断言。再运行 `npm run lint`、`npm test`、`npm run build` 并核对构建日志有真实编译动作；对 design §8 追溯矩阵的 54 条验收标准逐条标注对应测试。
- **验收：** 三条红线确定性测试通过；54/54 追溯完成；本任务不重复各任务内已有单元 / 组件测试。
- **前置依赖：** 阶段 2 全部完成。 **HIGH_RISK：** 是（红线集中验证）。 **预估：** 8h。

#### 子任务

- [ ] 主流程与异常流集成用例
- [ ] 浏览器存储与 `console` 泄露断言
- [ ] 全量 lint / test / build 与追溯核对

### Task 3.2：v1 自测脚本退役（Q-TD-01） 🆕 v2 新增
- **关联：** design §6.2（X-10）、§10.3 Q-TD-01；DL 授权采纳“退役，由 11b 自测覆盖”
- **涉及文件：** 删除 `scripts/drill_resume.py`、`scripts/selftest_resume.py`（含 `scripts/__pycache__`）；`AGENTS.md` 中如有对脚本的引用同步去除；不新增替代脚本。
- **内容：** 两脚本依赖 v1 单草稿契约（`/resume-drafts/current`、`draft_token`、`drafts` 表、`POST /resumes`），v2 后失效；退役后真实样品演练由 11b 自测（Vitest 红线测试 + 浏览器实测）覆盖。确需“真实样品演练”另立小任务，不在本轮。
- **验收：** 仓库内无对两脚本的残留引用（`grep` 为空）；`npm run lint`、`npm test`、`npm run build` 不受影响（脚本不在 `src/`）。
- **前置依赖：** Task 3.1。 **HIGH_RISK：** 否。 **预估：** 1h。

#### 子任务

- [ ] 删除脚本并清理引用

---

## 设计覆盖核对表（design.md v2.0 §3 全部新增 / 修改 / 删除单元 → 任务）

> v1 保留且 design §3.7 标“不变”的单元沿用 v1 任务（1.1、1.2、1.5、2.4、2.5），不重复列出。

### types
| 代码单元 | 操作 | 任务 |
|---|---|---|
| `ResumeModel.ts` | 修改 | 1.3 |
| `Draft.ts` | 删除 | 1.3 |
| `Session.ts` / `Conversation.ts` / `Archive.ts` | 新增 | 1.3 |
| `Resume.ts` / `Errors.ts` | 修改 | 1.3 |

### api
| 代码单元 | 操作 | 任务 |
|---|---|---|
| `ApiClient.ts` / `ApiError.ts` / `ResponseShapes.ts` | 修改 | 1.4 |
| `ResumeDraftApi.ts` | 删除 | 1.4 |
| `SessionApi.ts` / `ConversationApi.ts` / `ArchiveApi.ts` | 新增 | 1.7 |
| `ResumeApi.ts` | 修改 | 1.7 |

### hooks 与 model
| 代码单元 | 操作 | 任务 |
|---|---|---|
| `useResumeSession` | 修改 | 2.1（装入）、2.2（上传）、2.6（保存）、2.7（新对话）、2.9（删除 / 离开）、2.10（对话）、2.11（建议）、2.13（更新）；`editField`/`confirmSection` 沿用 2.4 |
| `useSessionList` | 新增 | 2.9 |
| `useArchive` | 新增 | 2.14 |
| `useChatScroll` | 修改 | 2.8 |
| `SessionReducer` | 修改 | 1.6 |
| `UpdateDiff` | 新增 | 1.9 |
| `Verify` | 新增 | 1.8 |
| `SectionConfig`（`labelOfField`）/ `SectionView`（`valuesAsFields`）/ `FormatTime` | 修改 / 新增 | 1.10 |
| `FieldRules` / `UploadPrecheck` | 不变 | 1.5（v1） |

### components
| 代码单元 | 操作 | 任务 |
|---|---|---|
| `AppShell` | 修改 | 2.9（插槽、`Drawer`）、2.14（`nav`） |
| `SessionList` | 新增 | 2.9 |
| `ComposerBar` | 修改 | 2.2（上传沿用）、2.10（文本输入） |
| `MessageList` / `MessageBubble` / `ThinkingNotice` | 新增 | 2.10 |
| `SuggestionCard` / `ChangeRows` | 新增 | 2.11 |
| `UpdateDiffCard` | 新增 | 2.13 |
| `SavedSessionView` | 新增 | 2.12 |
| `ReadOnlySection` | 修改 | 2.3 |
| `SavedResultCard` | 修改 | 2.6（`saved`/`already_saved`）、2.13（`updated`） |
| `NoticeBanner` / `WelcomePanel` | 修改 | 2.1 |
| `BootstrapErrorPanel` | 删除 | 2.1 |
| `ArchiveList` / `ArchiveDetail` / `saveBlob` | 新增 | 2.14 |
| `FinalReviewCard`（文案） | 修改 | 2.6 |
| `ConfirmDialog`（文案 `leave`/`delete`） | 修改 | 2.9 |
| 其余（`SectionCard`、`FieldRow`、编辑器、`FileCard`、`ErrorAlert`、`ErrorBoundary`、`ReviewSummary`、`QuickReplyChips`、`UploadProgressNotice`、`NewChatButton`、`ChatThread`） | 不变 | v1 任务沿用 |

### pages 与入口
| 代码单元 | 操作 | 任务 |
|---|---|---|
| `ResumeCollectionPage` | 修改 | 2.1 起逐切片扩展 |
| `ArchivePage` | 新增 | 2.14 |
| `App.tsx` | 修改 | 2.14（`view`、两页挂载） |
| `vite.config.ts` | 不变 | 1.1（v1） |
| `scripts/drill_resume.py`、`selftest_resume.py` | 删除（Q-TD-01） | 3.2 |

**核对结果：** design §3 的 v2 新增 / 修改 / 删除单元（types 7、api 8、hooks 与 model 10、components 约 22、pages 与入口 4、脚本 2）全部落入上表，无遗漏。

### 需求覆盖（摘要）

| 需求 | 任务 |
|---|---|
| REQ-FE-01（上传） | 1.5、2.2 |
| REQ-FE-02（展示识别结果） | 1.5、2.3 |
| REQ-FE-03（分区核对） | 1.5、2.4、2.5 |
| REQ-FE-04（确认保存与反馈） | 1.6、1.8、2.6、2.12 |
| REQ-FE-05（会话与历史） | 1.6、2.1、2.7、2.9 |
| REQ-FE-06（安全与规范） | 1.1、1.3、1.4、1.7、3.1 |
| REQ-FE-07（对话修改与问答） | 1.8、2.10、2.11 |
| REQ-FE-08（已归档简历） | 1.7、2.14 |
| REQ-FE-09（确认更新） | 1.9、2.12、2.13 |

---

## 待 DL 确认

| 编号 | 事项 | 建议 |
|---|---|---|
| T-DL-01 | 默认 registry 的项目例外（v1 已在 `AGENTS.md` 写明） | 沿用，v2 无变化 |
| T-DL-02 | 1.3 的验收口径：类型与夹具替换会使依赖旧类型的 `src` 暂时无法编译，1.3→1.4→1.7→1.6→2.1 需连续完成才能整体 `build` 通过 | 同意按“该序列整体验收一次 build，序列内以各自测试文件通过为准”；若不同意则需引入临时兼容类型，增加返工 |
| T-DL-03 | 总工时 138h（v2 任务 112h）含 3.1 集成验证，不含代码审查与 `AGENTS.md` 复核 | 确认口径 |
| T-DL-04 | 测试预算规模档“轻量”、1:1 与 ≤ 3 批审查（v1 实际 1.6:1 已超，v2 增量按 1:1 核算） | 确认；由 DL 判断是否同时安排 v1 存量测试精简（不在本轮） |
| T-DL-05 | 3.1 同时标记 HIGH_RISK（红线集中验证），共 6 个 HIGH_RISK 任务（1.8、1.9、2.6、2.10、2.13、3.1） | 确认；若认为 3.1 不应算 HIGH_RISK，则红线端到端复核降为 2.6 / 2.10 / 2.13 内的用例 |
