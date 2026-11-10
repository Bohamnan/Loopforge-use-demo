# 开发任务清单 — 简历信息收集（Frontend）

## 文档版本

| 版本 | 日期 | 修改说明 | 作者 |
|------|------|----------|------|
| v1.0 | 2026-11-10 | 初始版本（architecture-advisor Step 4），基于 design.md v1.1 与 OpenAPI 0.1.1 | Yin Yang（frontend） |

---

> 一个任务 = 一个可独立验证的变更单元（纵向切片），单元测试包含在各任务内。粒度规则见 architecture-advisor Step 4。
> 代码目录：`codes/hr-collection-agent-frontend/`（业务代码直接放在本仓库内，DL 决定）。路径均相对该目录。
> 验证口径（每个任务共同的完成条件）：`npm run lint`、`npm test`、`npm run build` 均通过，且构建日志中有真实的编译动作；不得仅凭退出码或“BUILD SUCCESS”类输出判定通过。
> 红线：页面 / 组件 / hook 内不得 `fetch`；不得使用 localStorage / sessionStorage / indexedDB；不得 `console` 输出简历内容；测试数据只用合成简历。

## 任务总览

| 状态 | 阶段 | 任务数 | 预估工时 |
|------|------|--------|----------|
| [ ] | 1. 共享基础 | 6 | 26h |
| [ ] | 2. 功能切片 | 8 | 47h |
| [ ] | 3. 集成验证 | 1 | 6h |
|     | 合计 | 15 | 79h |

### 依赖关系

```text
1.1 ─┬─ 1.2
     ├─ 1.3 ─┬─ 1.4 ─┐
     │       └─ 1.5 ─┼─ 1.6 ─ 2.1 ─ 2.2 ─ 2.3 ─ 2.4 ─ 2.5
     │               │                       │       └──── 2.6 ─ 2.7
     │               │                       └ 2.8（可与 2.4 之后并行）
     └───────────────┘                                  全部 ─ 3.1
```

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

### Task 1.2：应用入口、主题与错误边界 ✅
- **关联：** REQ-FE-06.3；design.md §3.5（App / main、ErrorBoundary）、TD-14、§7.1（渲染异常）
- **内容：** `src/main.tsx`、`src/App.tsx`（Ant Design `ConfigProvider`，主题 token 取自原型 `style.css` 配色：`--navy` `--blue` `--warn` `--ok` `--red` 等）、`src/components/ErrorBoundary.tsx`（通用文案 + “刷新页面”，不输出简历内容）；`App` 暂以占位页面挂载（后续由 2.1 替换为 `ResumeCollectionPage`）。
- **测试：** `ErrorBoundary`：子组件抛错时显示通用文案且不泄露错误对象内容；`console.error` 调用不含子树文本；`App` 渲染冒烟，主题 token 生效（`ConfigProvider` 存在）。
- **预估：** 2h
- **前置依赖：** Task 1.1

#### 子任务

- [x] 入口与 `ConfigProvider` 主题
- [x] `ErrorBoundary` 与测试

### Task 1.3：types（与 OpenAPI 0.1.1 同名） ✅
- **关联：** REQ-FE-06.4、06.5；design.md §3.1、F-02（手写类型）；`interface_spec_resume.md` §四
- **内容：** `src/types/ResumeModel.ts`（`FieldStatus`、`StringField`、`StringListField`、三个经历列表字段、`WorkExperience`、`ProjectExperience`、`Education`、`ResumeFields` 22 字段、`ResumeFieldsUpdate`）、`Draft.ts`（`OriginalFileInfo`、`DraftResponse`、`DraftUpdateRequest`）、`Resume.ts`（`CreateResumeRequest`、`CreateResumeResponse`）、`Errors.ts`（`ErrorCode` 13 值、`ErrorDetail` 及 `reason` 5 值、`ErrorResponse`、`ClientErrorCode`）。每个文件头注明对应 OpenAPI 版本 0.1.1；标量允许 `null` 体现为 `string | null`。
- **测试：** 类型级测试（`tsc --noEmit` 纳入 `npm run build`）；用 Vitest 编写“契约镜像”测试：`ResumeFields` 的 22 个键集合、`FieldStatus` 4 值、`ErrorCode` 13 值、`reason` 5 值，与一份测试内的期望常量（按 OpenAPI 0.1.1 逐项核对）一致，防止漏项或漂移。
- **预估：** 2h
- **前置依赖：** Task 1.1

#### 子任务

- [x] 4 个类型文件与文件头版本注释
- [x] 契约镜像测试

### Task 1.4：api 封装层 ✅
- **关联：** REQ-FE-06.1、06.3、06.4、01.4、01.6、05.1；design.md §3.2、§6（ApiClient / ResumeDraftApi / ResumeApi）、§7.2、DD-02/05/06/10；O-12、F-05
- **内容：** `src/api/ApiError.ts`、`ApiClient.ts`、`ResumeDraftApi.ts`、`ResumeApi.ts`。
  - `ApiClient`：前缀 `/api/v1`；`credentials: 'same-origin'`；JSON 设 `Content-Type`，`FormData` 不手设；`AbortController` 超时（上传 75s，其余 30s）；区分 `client_timeout` 与 `network_error`；非 2xx 解析 `ErrorResponse`（含 `details`），缺字段或非 JSON 时 `unknown_error` 并使用通用文案；日志仅 `request_id` / `code` / HTTP 状态。
  - `ResumeDraftApi`：`createResumeDraft(file)`、`getCurrentResumeDraft()`（404 `draft_not_found` 返回 `null`，不抛错、不记日志）、`updateCurrentResumeDraft(fields)`。
  - `ResumeApi`：`createResume()`，请求体固定 `{confirmed: true}`。
- **测试：** mock `fetch`：成功解析 `DraftResponse` / `CreateResumeResponse`（含 200 与 201 的 `already_saved`）；错误体解析含 `details`；非 JSON 的 413 / 502 / 504 → `unknown_error` 且不暴露原始响应体；超时（fake timers）→ `client_timeout`，网络 reject → `network_error`；GET 404 → `null` 且无 `console` 输出；上传请求体为 `FormData` 字段 `file` 且未设 Content-Type；请求带 `credentials: 'same-origin'`；任何路径下 `console` 未输出请求体 / 响应体。
- **预估：** 6h
- **前置依赖：** Task 1.3

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

### Task 1.6：SessionReducer（会话状态机） ✅
- **关联：** REQ-FE-01.5、03.2、04.3–04.8、05.2、05.3；design.md §3.3（SessionReducer）、§5.2、§5.3、§6、TD-02/03/04/05/12；O-02、O-10、D-01
- **内容：** `src/hooks/model/SessionReducer.ts`：状态类型与全部动作 / 转移（design §5.3 逐行实现）：`bootstrapping` / `bootstrap_failed` / `empty` / `reviewing` / `saved`；`view`、`busy` 互斥、`epoch` 丢弃过期响应、`editBuffer`、`fieldErrors`、`notice`、`error`、`pendingFile`、`overwriteAcknowledged`、`savedSummary`、`dialog`。纯函数，无副作用。
- **测试：** 逐条覆盖 §5.3 转移表：GET 200 / 404 / 其他失败；上传 201 与失败（失败不清旧草稿，O-02）；覆盖确认流转；PATCH 200 / 422 / `draft_not_found` / 其他失败；进入 / 退出最终确认；确认成功（`already_saved` 两分支）、`draft_not_found`（→ 空态 + `maybe_saved`）、422、超时 / 5xx（停留 `final`）；新对话与 `overwriteAcknowledged`；`busy` 非空时拒绝新请求类动作；过期 epoch 的响应不改变状态；`saved` 后状态不含手机号 / 邮箱等简历内容。
- **预估：** 6h
- **前置依赖：** Task 1.5

#### 子任务

- [x] 状态与动作类型
- [x] 转移实现与表驱动测试

---

## 阶段 2：功能切片

> 每个切片是用户可见能力：组件 → hook → api 调用 → 测试。HIGH_RISK（受约束 F-03 约束）单独成任务。

### Task 2.1：页面外壳与启动 / 草稿读取（REQ-FE-05 骨架） ✅
- **关联：** REQ-FE-05.1、05.3、REQ-FE-06.1；design.md §3.3（useResumeSession）、§3.4（AppShell、NewChatButton、ChatThread、WelcomePanel、NoticeBanner、BootstrapErrorPanel）、§3.5（ResumeCollectionPage）、§5.1（启动分支）、§7.1（启动失败、无可恢复草稿）、TD-08；P-02、P-11；O-12、裁决 F-03
- **内容：** `src/hooks/useResumeSession.ts`（`useReducer` 驱动；`bootstrap`、`retryBootstrap`；调用 `getCurrentResumeDraft`；StrictMode 下不产生重复请求副作用；`busy` 互斥；epoch 记录），`src/pages/ResumeCollectionPage.tsx`（按 `phase` 编排，不请求接口），`AppShell`（顶栏 Logo + 产品名、左窄栏仅含 `NewChatButton`，无用户信息与历史列表，< 860px 折叠为顶栏）、`NewChatButton`（本任务仅渲染，禁用逻辑与确认流程在 2.7）、`ChatThread`（基础滚动容器）、`WelcomePanel`（空态引导，无填写指南 / 隐私说明 / 示例文件按钮）、`NoticeBanner`（四类文案）、`BootstrapErrorPanel`（可重试，隐藏上传主入口）。`App` 改为挂载页面。
- **测试：** 页面启动：GET 404 → 空态，**无错误提示、无 `console` 输出**（O-12）；GET 500 / 网络失败 / 非 JSON → 可重试错误态且不是空态、无上传主入口；点击重试后成功进入下一状态；加载态显示；外壳不含用户头像、历史会话、填写指南、隐私说明、示例文件按钮；请求带 `same-origin`；StrictMode 下仅一次有效 GET。
- **预估：** 6h
- **前置依赖：** Task 1.2、Task 1.4、Task 1.6

#### 子任务

- [x] `useResumeSession`（bootstrap）
- [x] 外壳与空态 / 错误态组件
- [x] `ResumeCollectionPage` 与 `App` 接线

### Task 2.2：上传简历（REQ-FE-01）
- **关联：** REQ-FE-01.1–01.6；design.md §3.4（ComposerBar、FileCard、UploadProgressNotice、ErrorAlert、ConfirmDialog）、§5.1、§5.3（上传相关行）、§6、§7.1（上传相关）、TD-04/05/10；P-03、P-05；C-07、C-08、O-02、裁决 F-04
- **内容：** `ComposerBar`（📎 上传 `accept` 单选、整页拖拽取第一个、底部免责提示、**无文本框**、忙碌态禁用）、`FileCard`、`UploadProgressNotice`（单一加载提示“正在识别，最长约 1 分钟”）、`ErrorAlert`（契约错误只展示 `message`，前端自有码用固定文案，附 `request_id`）、`ConfirmDialog`（本任务启用“覆盖确认”）；`useResumeSession` 增加 `requestUpload`、`confirmOverwriteAndUpload`；上传成功后以占位方式进入 `reviewing`（展示由 2.3 完成）。
- **测试：** 预校验阻止（类型不支持、10 MB + 1、0 字节、多文件）且不发请求；上传中显示单一加载提示、输入区与“新对话”禁用、无法重复提交；75s 超时（fake timers）→ 提示重新上传；backend 错误（`file_*`、`unsupported_file_type`、`parse_failed`、`parse_unavailable`、`parse_timeout`）只展示 `message`，失败后保留原草稿（O-02）；有草稿时先弹覆盖确认，取消则不发请求，确认后才发；无草稿直接上传；`ComposerBar` 无 `textarea`；日志不含文件内容。
- **预估：** 6h
- **前置依赖：** Task 2.1

#### 子任务

- [ ] `ComposerBar`、`FileCard`、`UploadProgressNotice`、`ErrorAlert`
- [ ] `ConfirmDialog`（覆盖确认）
- [ ] `useResumeSession` 上传动作

### Task 2.3：识别结果展示与草稿恢复展示（REQ-FE-02、05.2）
- **关联：** REQ-FE-02.1–02.4、05.2；design.md §3.4（FieldStatusTag、ReadOnlySection、ReviewSummary、SectionCard 只读态）、§4.1–§4.3、§6；P-04、P-06、P-10、B-04
- **内容：** `FieldStatusTag`（待确认 / 不确定、请确认 / 待补充 / 已确认，文字 + 颜色）、`ReadOnlySection`、`ReviewSummary`（四状态计数与待处理分区跳转芯片）、`SectionCard` 只读骨架（11 个分区全部展示，分区内 `missing` / `uncertain` 置顶高亮，`null` 显示“（未提供）”，手机号完整显示）；上传成功与恢复成功后选取活跃分区，恢复时显示“已为你恢复未完成的简历”（`NoticeBanner`）；全部已确认则进入最终确认视图。
- **测试：** 用覆盖四种状态与空列表的合成 `DraftResponse` 渲染：22 字段全部出现且按 11 区分组；四种状态文案与颜色类正确；`recognized` 不显示为已确认；`missing` / `uncertain` 在分区内置顶；经历类多条展示；手机号完整显示；非核心字段为空不阻塞展示；恢复成功出现恢复提示；上传成功与恢复成功选取同一规则的活跃分区；页面不自行补全任何字段值。
- **预估：** 5h
- **前置依赖：** Task 2.2

#### 子任务

- [ ] `FieldStatusTag`、`ReadOnlySection`、`ReviewSummary`
- [ ] `SectionCard` 只读态与活跃分区选取
- [ ] 恢复提示接线

### Task 2.4：分区核对 — 标量与文本列表编辑（REQ-FE-03）
- **关联：** REQ-FE-03.1–03.2、03.4–03.6、REQ-FE-02.4；design.md §3.4（FieldRow、StringListEditor、SectionCard 编辑态、QuickReplyChips）、§4.4、§5.3（编辑 / 确认本区行）、§6、§6.1、TD-01/03/09/15；P-01 选 A、P-04；G-01、G-02、D-06、O-11
- **内容：** `FieldRow`（受控输入、失焦与提交前校验、`FIELD_MAX_LENGTH` 超限提示、字段级后端错误显示且不回显值、“未提交修改”小标记）、`StringListEditor`（行内编辑 / 新增 / 删除，条数达上限禁用新增，删空为 `[]`）、`SectionCard` 编辑态（“确认本区”按钮：核心字段为空或非法时禁用并就地说明，含 `missing` 非核心字段时提示“空项将按留空确认”，已确认无缓冲显示“已确认”，有缓冲显示“确认修改”）、`QuickReplyChips`（“确认无误”“其余都没问题”等价按钮动作，不追加用户消息）；`useResumeSession` 增加 `editField`、`confirmSection`、切换分区；PATCH 请求体按 design §4.4 构造（整区全部字段，手机号规范化，文本 trim，全空白非核心提交 `null`，列表提交完整新列表）；422 `details` 映射到字段。
- **测试：** 核心三项缺失时引导补充且“确认本区”禁用；手机号 / 邮箱即时提示（OpenAPI 示例与反例、空格 / 连字符规范化后提交的值不含空格与连字符）；超出上限的输入提示“内容过长”；PATCH 请求体只含当前分区字段、未触碰的分区不提交；`missing` 非核心字段按 `null` 提交、列表按 `[]` 提交；成功后以 backend 返回替换草稿并跳到下一个待确认分区；422 `details`（含 `reason` 5 值）在字段旁展示且不回显值；PATCH 失败 / 超时保留缓冲并可重试；同一时刻只有一个在途 PATCH（重复点击被忽略）；快捷指令等价按钮；输入区无文本框。
- **预估：** 8h
- **前置依赖：** Task 2.3

#### 子任务

- [ ] `FieldRow`、`StringListEditor`
- [ ] `SectionCard` 编辑态与 `QuickReplyChips`
- [ ] `useResumeSession` 编辑与分区提交
- [ ] 请求体构造与 422 映射

### Task 2.5：分区核对 — 经历类子项编辑（REQ-FE-03.3）
- **关联：** REQ-FE-03.3、03.6；design.md §3.4（ObjectListEditor）、§4.4、§6（ObjectListEditor）、§6.1（经历区块上限）；O-11、CR-01a
- **内容：** `ObjectListEditor`：工作经历、项目经历、教育背景的多条子项新增 / 修改 / 删除（可折叠卡片，无重排）；工作经历子项含 `responsibilities` / `achievements` 两个文本列表（复用 `StringListEditor`）；子项条数上限 20、子项内字符串上限 2000、`responsibilities` / `achievements` 条数上限 30，均取自 `FIELD_MAX_LENGTH`；删除子项后清除该分区下标类 `fieldErrors`；字段路径 `work_experiences[0].start_date` 映射到对应行；列表整块提交。
- **测试：** 新增 / 修改 / 删除子项后提交体为完整新列表；达到 20 条时新增禁用；子项字符串超 2000 提示；`responsibilities` 超 30 条禁用新增；422 `details` 的下标路径定位到正确子项行；删除子项后旧下标错误被清除；空列表可作为“确认留空”提交；三类经历区块的子项字段与 OpenAPI 的 `WorkExperience` / `ProjectExperience` / `Education` 字段一致。
- **预估：** 6h
- **前置依赖：** Task 2.4

#### 子任务

- [ ] `ObjectListEditor` 与子项配置渲染
- [ ] 下标错误映射与清除

### Task 2.6：最终确认与保存结果（REQ-FE-04，HIGH_RISK：约束 F-03）
- **关联：** REQ-FE-04.1–04.8；design.md §3.4（FinalReviewCard、SavedResultCard、ConfirmDialog）、§5.1、§5.3（最终确认相关行）、§6、§7.1、§9.2、TD-04/11；B-04、F-03、C-05、C-10、C-11、D-01、D-03、D-04、O-08、O-10、P-09、Q-DL-03
- **内容：** `FinalReviewCard`（11 区全文只读、未确认字段数提示、“确认提交”仅在核心三项齐全、合法且为 `confirmed` 时可点，否则说明原因；“我还要修改”；失败时卡内 `ErrorAlert`，按钮可直接重试）、`SavedResultCard`（`already_saved=false`：“已保存”+ 姓名 / 原始文件名 / 保存时间 +“上传下一份”；`already_saved=true`：仅“该简历已保存过”，不展示任何记录内容；均不显示 `resume_id` / 记录编号）、`ConfirmDialog`（启用“存在未确认字段”和“存在未提交编辑”两类）；`useResumeSession` 增加 `goFinal`、`backToSections`、`confirmResume`、`resetAfterSaved`；成功后只保留 `savedSummary`，清空草稿与缓冲；`draft_not_found` → 空态 + “可能已保存，请重新上传核实”；422 返回对应分区。
- **测试：** 约束 F-03 重点用例：成功响应之前（进行中、超时、网络失败、5xx、`save_failed`、422、`draft_not_found`）界面任何位置都不出现“已保存”；超时 / 网络失败后按钮可立即重试且不调用任何状态查询；`already_saved` 依据字段而非 HTTP 状态（200 / 201 两种都覆盖），`true` 时不渲染任何已有记录内容；成功后内存中无手机号 / 邮箱等简历内容，仅姓名 / 文件名 / 保存时间；核心三项未就绪时确认按钮禁用；仍有未确认字段时先弹提示，取消不发请求，继续后发送；存在未提交编辑时被拦截；进行中防重复点击；`recognized` 字段在最终视图中不显示为已确认；数据验证：断言 `POST /resumes` 请求体恰为 `{confirmed: true}` 且只发送一次。
- **预估：** 9h
- **前置依赖：** Task 2.4（Task 2.5 可并行，进入最终确认的集成场景以 2.5 完成为准）

#### 子任务

- [ ] `FinalReviewCard`、`SavedResultCard`
- [ ] `ConfirmDialog` 两类场景
- [ ] `confirmResume` 及全部错误分支
- [ ] HIGH_RISK 用例集（单独成组）

### Task 2.7：新对话与覆盖确认（P-08、TD-12）
- **关联：** REQ-FE-01.5；design.md §3.4（NewChatButton）、§5.3（新对话相关行）、TD-12；P-08、C-07、Q-DL-04
- **内容：** `NewChatButton` 启用与禁用逻辑（忙碌态禁用）；`useResumeSession` 增加 `requestNewChat`、`confirmNewChat`；有未确认草稿或未提交编辑时先弹确认，文案明示“刷新页面会恢复该草稿，再次上传会覆盖它”；确认后清空界面、`epoch++`、`overwriteAcknowledged=true`（后续首次上传不再重复覆盖确认）；`empty` / `saved` 下无需确认；“上传下一份”复位。
- **测试：** 无草稿时直接清空；有草稿时弹确认，取消不变，确认后清空且不调用任何接口（无丢弃草稿接口）；确认后再次上传不再弹覆盖确认；刷新（重新 bootstrap）后旧草稿仍被恢复；忙碌期间按钮禁用；过期响应在新对话后被丢弃。
- **预估：** 3h
- **前置依赖：** Task 2.6

#### 子任务

- [ ] `NewChatButton` 与对话框接线
- [ ] `requestNewChat` / `confirmNewChat` 与 epoch 处理

### Task 2.8：无障碍与响应式（TD-13）
- **关联：** design.md §3.3（useChatScroll）、§3.4（ChatThread）、§6（ChatThread、AppShell）、TD-13、TD-14；Q-DL-05
- **内容：** `src/hooks/useChatScroll.ts`（仅返回“需要滚动 / 聚焦的区块 key”，不触碰 DOM 样式）、`ChatThread` 使用该信号完成 `scrollIntoView` / `focus()`；`aria-live="polite"` 播报加载与保存结果、`role="alert"` 用于错误；分区推进后焦点移到新分区标题；< 860px 外壳折叠（`Drawer` 或顶栏按钮承载“＋ 新对话”）；状态用文字 + 颜色；核心按钮键盘可达。
- **测试：** 按角色与名称查询核心按钮并通过键盘触发；加载 / 错误 / 保存结果出现在对应 `aria-live` / `role=alert` 区域；分区推进后焦点位于新分区标题；`useChatScroll` 为纯信号（不引用 DOM API）；窄屏下外壳折叠且“＋ 新对话”仍可达（以 `matchMedia` mock 验证）。
- **预估：** 4h
- **前置依赖：** Task 2.4

#### 子任务

- [ ] `useChatScroll` 与 `ChatThread` 焦点 / 滚动
- [ ] 外壳响应式与 aria 属性

---

## 阶段 3：集成验证

> 仅放跨任务的页面级集成测试；各任务内已有单元与组件测试，不在此重复。

### Task 3.1：主流程与安全静态集成验证
- **关联：** design.md §9.1（交互流程、安全性静态）、§9.2、§9.3；REQ-FE-01..06 全部
- **内容：** 页面级集成测试（mock backend 契约，合成数据）：上传 → 分区确认（含经历类）→ 最终确认 → 已保存；草稿恢复三分支（200 / 404 / 500）；覆盖确认与新对话；上传超时；确认超时后重试成功；`already_saved` 与 `draft_not_found` 分支；存在未提交编辑时的拦截；全流程中断言：无“已保存”提前出现、未使用任何浏览器存储（spy `Storage` 与 `indexedDB`）、`console` 无简历内容 / 响应体。再运行 `npm run lint`（含三条自定义 ESLint 规则）、`npm test`、`npm run build` 并核对构建日志有真实编译动作；对 `design.md` §8 追溯矩阵 33 条验收标准逐条标注对应测试。
- **预估：** 6h
- **前置依赖：** 阶段 2 完成

#### 子任务

- [ ] 主流程与异常流集成用例
- [ ] 浏览器存储与 `console` 泄露断言
- [ ] 全量 lint / test / build 与追溯核对

---

## 设计覆盖核对表（design.md §3 全部代码单元 → 任务）

### types
| 代码单元 | 任务 |
|---|---|
| `src/types/ResumeModel.ts` | 1.3 |
| `src/types/Draft.ts` | 1.3 |
| `src/types/Resume.ts` | 1.3 |
| `src/types/Errors.ts` | 1.3 |

### api
| 代码单元 | 任务 |
|---|---|
| `src/api/ApiError.ts` | 1.4 |
| `src/api/ApiClient.ts` | 1.4 |
| `src/api/ResumeDraftApi.ts` | 1.4 |
| `src/api/ResumeApi.ts` | 1.4 |

### hooks
| 代码单元 | 任务 |
|---|---|
| `useResumeSession` | 2.1（bootstrap）、2.2（上传）、2.4（编辑 / 分区提交）、2.6（最终确认）、2.7（新对话） |
| `useChatScroll` | 2.8 |
| `hooks/model/SessionReducer` | 1.6 |
| `hooks/model/SectionConfig` | 1.5 |
| `hooks/model/FieldRules` | 1.5 |
| `hooks/model/UploadPrecheck` | 1.5 |
| `hooks/model/SectionView` | 1.5 |

### components
| 代码单元 | 任务 |
|---|---|
| `AppShell` | 2.1（响应式在 2.8） |
| `NewChatButton` | 2.1（渲染）、2.7（逻辑） |
| `ChatThread` | 2.1（基础）、2.8（aria / 焦点） |
| `WelcomePanel` | 2.1 |
| `NoticeBanner` | 2.1（文案）、2.3（恢复提示）、2.6（可能已保存 / 已保存过） |
| `BootstrapErrorPanel` | 2.1 |
| `FileCard` | 2.2 |
| `UploadProgressNotice` | 2.2 |
| `ErrorAlert` | 2.2 |
| `ReviewSummary` | 2.3 |
| `SectionCard` | 2.3（只读）、2.4（编辑） |
| `FieldRow` | 2.4 |
| `FieldStatusTag` | 2.3 |
| `StringListEditor` | 2.4 |
| `ObjectListEditor` | 2.5 |
| `ReadOnlySection` | 2.3 |
| `FinalReviewCard` | 2.6 |
| `SavedResultCard` | 2.6 |
| `ComposerBar` | 2.2 |
| `QuickReplyChips` | 2.4 |
| `ConfirmDialog` | 2.2（覆盖确认）、2.6（未确认 / 未提交编辑）、2.7（新对话） |
| `ErrorBoundary` | 1.2 |

### pages 与入口
| 代码单元 | 任务 |
|---|---|
| `ResumeCollectionPage` | 2.1（逐切片扩展） |
| `App.tsx`、`main.tsx` | 1.2（占位）、2.1（挂载页面） |
| `vite.config.ts` | 1.1 |

**核对结果**：design §3 列出的代码单元：types 4 + api 4 + hooks 7 + components 22（含 `ErrorBoundary`）+ 页面与入口 3（`ResumeCollectionPage`、`App` / `main`、`vite.config.ts`）共 **40 项**，全部落入上表，无遗漏；`useResumeSession`、`NoticeBanner`、`SectionCard`、`ConfirmDialog`、`ChatThread` 因随切片演进而分属多个任务。

### 需求覆盖（摘要）

| 需求 | 任务 |
|---|---|
| REQ-FE-01（上传） | 1.5、1.4、2.2、2.7 |
| REQ-FE-02（展示识别结果） | 1.5、2.3 |
| REQ-FE-03（分区核对） | 1.5、2.4、2.5 |
| REQ-FE-04（确认并反馈） | 1.6、2.6 |
| REQ-FE-05（草稿恢复） | 1.4、2.1、2.3 |
| REQ-FE-06（安全与规范） | 1.1、1.2、1.3、1.4、3.1 |

---

## 待 DL 确认

| 编号 | 事项 | 建议 |
|---|---|---|
| T-DL-01 | 默认 registry 的项目例外：依赖锁定精确版本并提交 lock 文件；是否需要在 `AGENTS.md` 中写明此例外，或另做依赖安全评估记录 | 在 Step 5 补全 `AGENTS.md` 时写明例外，并在 Task 1.1 的安装说明中注明 |
| T-DL-02 | Task 2.6 的前置依赖：2.5（经历类编辑）是否必须先于 2.6 完成 | 单元测试层面 2.6 只依赖 2.4；集成层面（3.1）以 2.5 完成为准 |
| T-DL-03 | 总工时 79h 包含 3.1 的集成验证，不含 Step 5（`AGENTS.md` 补全）与代码审查 | 确认口径 |
