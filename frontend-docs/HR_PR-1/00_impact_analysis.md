# HR_PR-1 影响分析 — frontend Workbench

**分析人**：Yin Yang（frontend）
**分析日期**：2026-11-10
**代码仓库**：/Users/yanyin/orca/workspaces/workspce-coding/feature-frontend/codes/hr-collection-agent-frontend
**依据**：`01-requirements/HR_PR-1/prd.md`、`solution-design.md`（HLD 已批准，§4 契约 / §5 前端约束 / §8 假设）、仓库约定 `codes/hr-collection-agent-frontend/AGENTS.md`（状态：已确认）、`architectural_constraints.md`

> 代码现状：frontend 为**新项目**。仓库目录当前只有 `AGENTS.md`，无 `src/`、`package.json`、任何源码（已用 find 确认）。
> 因此本分析**没有可引用的 `文件:行号` 现有代码**；「修改」一节为空，影响全部为「新增」。各新增项的依据为 PRD 用户故事、HLD 条目及 AGENTS.md 分层约定。

---

## 涉及现有模块

| 模块/文件 | 路径 | 职责说明 |
|---------|------|---------|
| 无（新项目） | — | 仓库内无现有源码；仅有 `AGENTS.md`（分层与红线约定） |

---

## PRD 场景枚举清单与代码路径对应

> 新项目无现有代码路径，下表“落点”为按 AGENTS.md 分层应新建的位置；“⚠️ 场景未覆盖”表示尚无代码，属预期。

| # | 用户故事 | 场景分支（来自验收标准/HLD §5） | 落点（新增） | 状态 |
|---|---|---|---|---|
| S1 | #1 | 用户选择并上传简历，系统开始识别 | pages（上传页）+ components（上传控件）+ hooks（上传状态）+ api（multipart 上传） | ⚠️ 场景未覆盖（待新建） |
| S2 | #1 | 仅接受 PDF/JPG/JPEG/PNG，≤10 MB；不合规时前端拦截并提示 | components/hooks 内校验；api 层不重复业务规则 | ⚠️ 场景未覆盖（待新建） |
| S3 | #2 | 识别完成后按简历模型展示结果（`global-info/简历模板.md` 全部分类） | components（结果展示）+ types（简历模型类型） | ⚠️ 场景未覆盖（待新建） |
| S4 | #2/#3 | 无法识别/不确定字段标记为待补充/待确认，不猜测补全 | components（字段状态标识）+ types（字段状态枚举，⚠️ 取值待 OpenAPI） | ⚠️ 场景未覆盖（待新建） |
| S5 | #3 | 按字段逐项对话确认；用户修正/补充后更新模型，其余未确认字段保持待处理 | hooks（useReducer 对话/校对状态）+ api（草稿修订） | ⚠️ 场景未覆盖（待新建） |
| S6 | #3/HLD | 姓名、手机号、邮箱缺失时引导补充；其他字段可空 | hooks/components（必填引导；校验规则的归属见 Q-frontend-05） | ⚠️ 场景未覆盖（待新建） |
| S7 | #4 | 用户未明确确认前不得提示“已保存”，也不触发保存 | components（独立的确认操作）+ hooks（确认状态机） | ⚠️ 场景未覆盖（待新建） |
| S8 | #4 | 用户明确确认 → 调 backend 保存 → 仅 backend 返回成功后提示“已保存” | hooks + api（确认保存） | ⚠️ 场景未覆盖（待新建） |
| S9 | #4（异常路径） | 保存失败：不得提示已保存；展示通用错误并允许重试 | hooks/components 错误态 | ⚠️ 场景未覆盖（待新建）；重试语义见 Q-frontend-07 |
| S10 | HLD §3/§5 | 刷新或关闭后重开，凭 HttpOnly Cookie 从 backend 恢复未确认草稿 | pages 启动时调用草稿读取（hooks/api） | ⚠️ 场景未覆盖（待新建）；UX 见 Q-frontend-06 |
| S11 | HLD §3 | 模型能力/授权不可用或拒绝该输入：停止解析，显示不含敏感内容的错误 | api 错误转换 + components 错误态 | ⚠️ 场景未覆盖（待新建）；错误码待 OpenAPI |
| S12 | HLD §3 | 同步解析等待期间的等待态、超时处理 | hooks 加载态 + components 进度呈现 | ⚠️ 场景未覆盖（待新建）；见 Q-frontend-02 |
| S13 | HLD §5 | 草稿 7 天无活动被清理后，恢复失败的处理 | hooks/api 空态 | ⚠️ 场景未覆盖（待新建）；见 Q-frontend-06 |

---

## 变更影响评估

### 新增

按 AGENTS.md 目录约定（`pages → components → hooks → api`，`types` 与 OpenAPI 一致）：

- **工程脚手架**（AGENTS.md「构建、运行与测试」）：Vite + React 18 + TypeScript + Ant Design 项目；`package.json` 需提供 `npm ci / build / test / lint`（命令在 AGENTS.md 已约定，但脚本尚不存在）。⚠️ 测试框架与 lint 配置未在任何文档中指定，待技术设计确认（见 Q-frontend-09）。
- **api 层**（S1、S5、S8、S10、S11）：基于 fetch 的统一封装；`multipart/form-data` 上传；按 `{code, message, request_id}` 统一错误体转换（`rules/frontend/api.md` §3）；请求需携带 Cookie（`credentials` 设置依赖部署形态，见 Q-frontend-03）；不得在控制台输出简历内容。路径前缀参考 `/api/v1`，**具体路径、字段、状态值以 backend OpenAPI 为准，目前不存在**。
- **types 层**（S3、S4）：简历模型类型，覆盖 `简历模板.md` 的：姓名；求职意向（岗位名称、期望城市、期望薪资、到岗时间）；联系方式（手机号、邮箱、个人主页/GitHub/LinkedIn）；个人信息（性别、出生年月、政治面貌、现居城市、工作年限、最高学历）；个人优势；工作经历（多条）；项目经历（多条）；教育背景（多条）；专业技能；证书与荣誉；语言能力；自我评价。JSON 字段 snake_case、时间 ISO 8601 UTC（api.md §2）。
- **hooks 层**（S1、S5–S10、S12）：上传/解析、草稿恢复、校对（`useReducer` 状态机）、确认保存。状态仅存运行时内存（F-02）。
- **components 层**（S2–S4、S7、S9、S11）：文件上传控件、简历结果展示（含待补充/待确认标识）、对话/逐项校对界面、独立“确认”操作、错误态/加载态/空态。
- **pages 层**：单页对话式流程编排（上传 → 展示 → 校对 → 确认 → 结果）。

### 修改

- 无（新项目，无现有代码可修改）。

### 不变

- 无存量代码需保证不变。以下为**边界上不应发生**的事项（红线）：不直连模型/外部服务/存储（F-01）；不使用 localStorage / sessionStorage / IndexedDB 保存简历或校对内容（F-02）；不引入额外状态管理库。

---

## 架构约束命中

| 约束 | 命中点 | 处理建议 |
|------|-------|---------|
| F-01 前端不持有凭证、不直连外部服务 | api 层是唯一出口（S1、S5、S8） | 所有请求只指向 backend；不放置任何模型密钥或外部 URL |
| F-02 浏览器不保存敏感数据 | 草稿恢复（S10）、校对状态（S5） | 状态仅用 `useState/useReducer`；禁止本地持久化。恢复依赖 backend + HttpOnly Cookie，前端不读取令牌。注意：F-02 在 `architectural_constraints.md` 为 WARN，在 AGENTS.md/HLD 为红线，按更严格口径执行 |
| F-03 确认前不得提示已保存 | S7、S8、S9 | 确认动作与保存成功状态分离；成功提示仅由 backend 成功响应驱动；失败/超时不提示成功。注意：不得做乐观更新 |
| B-03 日志/错误不含简历原文（前端侧对应 api.md §3） | api 错误转换、console 输出 | 不 `console.log` 简历内容、响应体；错误提示用 backend 返回的非敏感 `message` |
| 跨 Workbench：backend 维护 OpenAPI | 全部 api/types | 前端不自行约定契约；当前无 OpenAPI，见 Q-frontend-01 |
| 契约变更经 cross-workbench-reviewer | 契约变更 | 契约确认后进入该审视 |
| B-04 用户确认后才入库 / 不猜测补全（前端侧） | S4、S6、S7 | 前端不自行补全字段值；仅展示 backend 结果与用户输入 |

---

## 技术风险

| 风险 | 严重性 | 说明 |
|------|:-----:|------|
| 无 OpenAPI 契约即无法落 api/types | 高 | AGENTS.md 待确认 #3：路径、字段类型、状态值、错误码均未定。前端可先按 HLD §4 高层契约搭骨架，但类型必须待契约冻结后对齐，否则返工 |
| 同步解析耗时/超时无数值（HLD §8 假设 2） | 中 | 10 MB 文件经模型同步解析可能较久；fetch 无默认超时，需设计等待态、超时阈值与重试，否则用户可能重复提交上传。阈值待 backend 实测 |
| Cookie 跨域/SameSite 配置（HLD §8 假设 4） | 中 | HttpOnly Cookie 由 backend 设置，前端无法读取。若前后端不同源，需 CORS `allow_credentials` + `credentials: 'include'` + SameSite/Secure 协同；开发环境与部署环境可能不一致。待 Dev Lead/backend 确认 |
| 确认保存重复提交 | 中 | 用户双击或超时后重试可能触发重复保存；是否幂等取决于 backend（见 Q-frontend-07）。前端需防重复点击，但无法单独保证 |
| 对话式校对的形态不明确 | 中 | PRD “对话校对”可为固定逐字段问答或由 backend 生成问题，影响 hooks 与契约形态（见 Q-frontend-04） |
| 复杂嵌套字段编辑（多条工作/项目/教育经历） | 低 | 需要支持增删改多条，字段较多；用户故事要求“按字段逐项”确认，可能导致交互较长 |
| 错误信息泄漏简历内容 | 低 | 依赖 backend 错误体不含敏感内容；前端只展示 `message`，不拼接上传内容 |

---

## 对 requirements 的建议补充

> 基于 HLD 与 PRD，以下边界条件 PRD 未覆盖，建议在 requirements 汇总时明确：
- 上传前的前端校验口径：类型以扩展名还是 MIME 判断；空文件、重命名伪装文件如何处理（最终以 backend 校验为准）。
- 一次会话内是否允许重新上传以替换当前草稿；重新上传是否覆盖未确认草稿并需二次提示。
- 保存成功后的页面终态：是否允许继续上传下一份简历，已确认记录是否还能修改（PRD 未提及修改已确认记录）。
- 手机号、邮箱的格式校验：由前端即时校验、backend 校验，还是两者都做（避免口径不一致）。
- 多页简历拍照是否需要支持多张图片（PRD/Q2 均为单文件）。
- 无障碍与浏览器兼容范围未定义。

---

## 验证回路自检

- 来源检查：本文件无“修改”项，因此无 `文件:行号` 引用；原因是新项目无源码，已在顶部声明。
- 约束覆盖：`architectural_constraints.md` 全部扫描，命中 F-01/F-02/F-03/B-03/B-04 及跨 Workbench 三条，见上表。
- 推断检查：无法确认项均标注 ⚠️ 并写入下方待澄清问题。
- 方案可行性追踪：无现有代码，无法追踪执行路径；Cookie、超时、CORS 等机制性结论均未下定论，标为风险与待确认。
- 新分支键唯一性、共享逻辑完整性：不适用（无现有分支结构/共享逻辑）。
- HLD §8 中涉及 frontend 的假设：#2（同步体验）、#4（Cookie）无法在空仓库中码级验证，已回流为 Q-frontend-02、Q-frontend-03。
- HLD 与 PRD 冲突：未发现。注意 F-02 在 constraints 文件为 WARN 而在 HLD/AGENTS.md 为红线，不构成冲突，按更严格口径。

---

## 待澄清问题（回流第二轮 Q&A）

| 编号 | 待澄清问题（指向具体代码/场景） | 建议回答人 | 不同答案的影响 |
|------|------------------------------|-----------|--------------|
| Q-frontend-01 | ⚠️ backend OpenAPI 何时提供？上传/解析、草稿读取、字段修订、确认保存的具体路径、字段、字段状态（待补充/待确认/已确认）取值与错误码是什么？（S1、S3–S5、S8、S11） | DL（跨 Workbench） | 决定 types 与 api 层结构；契约冻结前只能搭骨架，字段级实现需等待 |
| Q-frontend-02 | ⚠️ 同步解析的前端超时阈值、等待态呈现（纯加载提示还是阶段提示）和超时后是否允许重试？（S12，HLD §8 假设 2） | DL | 超时值短则需更早进入失败态并提示重试；长则需要更强的等待反馈与防重复上传；若实测不可接受，可能回到 Dev Lead 评估异步流程，将新增轮询状态 |
| Q-frontend-03 | ⚠️ 前后端是否同源部署？Cookie 的 SameSite/Secure/Path/续期，及开发环境（Vite 代理或跨域）的约定？（S10，HLD §8 假设 4，AGENTS.md 待确认 #2） | DL | 同源则 fetch 用默认 same-origin；跨域则需 `credentials: 'include'` 及 backend CORS 配合，影响 api 封装与本地开发配置 |
| Q-frontend-04 | ⚠️ “对话校对”是前端按字段顺序固定生成问题，还是 backend 返回待确认项/问题文本？用户回复是自由文本还是结构化字段编辑？（S5） | BA（交互形态）/ DL（契约） | 前端固定逐项：契约简单、hooks 持有流程；backend 驱动：需契约包含问题与回复交互，若含自由文本解析则属 backend 职责，影响范围显著扩大 |
| Q-frontend-05 | ⚠️ 姓名、手机号、邮箱的格式校验由谁负责？前端是否做即时格式校验，格式不合法是否视同缺失？（S6） | DL | 前端校验：体验好但需与 backend 规则一致；仅 backend 校验：前端仅展示错误，规则单点 |
| Q-frontend-06 | ⚠️ 重新打开页面时存在未过期草稿：自动恢复还是让用户选择“继续/放弃”？草稿已过期（7 天）或令牌失效时如何提示？重新上传是否覆盖草稿？（S10、S13） | BA | 自动恢复：流程简单；允许放弃/重传：需新增“丢弃草稿”类契约与操作（⚠️ HLD §4 契约未列出丢弃草稿接口） |
| Q-frontend-07 | ⚠️ 确认保存是否幂等？超时或网络失败后用户重试，backend 如何避免重复归档？前端在“结果未知”时应展示什么？（S8、S9） | DL（跨 Workbench） | 幂等：前端可安全重试；非幂等：前端需先查询草稿/保存状态再决定，契约需补充状态查询 |
| Q-frontend-08 | ⚠️ 保存成功后页面终态：是否允许继续提交下一份简历？已确认记录是否可再修改？（S8） | BA | 影响流程终态与是否需要“重新开始”及清理运行时内存的逻辑；PRD 未提及修改已确认记录，默认按不支持处理待确认 |
| Q-frontend-09 | ⚠️ 前端测试框架与 lint 工具的选型（AGENTS.md 已约定 `npm test` / `npm run lint`，但未指定框架）；是否使用 Vitest + React Testing Library、ESLint 的规则集？ | DL | 影响脚手架与后续 dev-self-test、CI；不影响业务功能 |
