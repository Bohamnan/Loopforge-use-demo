# HR_PR-1 影响分析 — frontend Workbench

## 变更履历

| 版本 | 日期 | 变更原因 | 变更摘要 |
|---|---|---|---|
| v1.0 | 2026-11-10 | 初版 | frontend 影响分析，9 条待澄清问题 |
| v1.1 | 2026-11-10 | 跨 Workbench review 裁决（`01-requirements/HR_PR-1/cross-workbench-review.md` C-01..C-15）已回流，增量修订 | 场景表补充 S14/S15 并更新各场景口径；「新增」「架构约束」「风险」「建议补充」按裁决调整；Q-frontend-01..09 全部标注裁决及 C 编号；末尾新增「裁决后需 DL 再确认的点」。未修改的节保持 v1.0 原文 |

> v1.1 修订标记：凡带 `〔v1.1 / C-xx〕` 的内容为本次按裁决增改。

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
| S4 | #2/#3 | 无法识别/不确定字段标记为待补充/待确认，不猜测补全；〔v1.1 / C-04〕字段状态 4 值 `recognized`（已识别待确认）/`uncertain`/`missing`/`confirmed`，需单独展示“已识别待确认” | components（字段状态标识，4 种展示）+ types（字段状态枚举 4 值，取值已定，字段名待 OpenAPI） | ⚠️ 场景未覆盖（待新建） |
| S5 | #3 | 按字段逐项对话确认；用户修正/补充后更新模型，其余未确认字段保持待处理；〔v1.1 / C-03〕由 frontend 按字段状态按固定顺序逐项提问，用户以结构化字段编辑回复（非自由文本），backend 只返回字段值与状态 | hooks（useReducer 提问序列/校对状态）+ components（结构化字段编辑）+ api（草稿修订） | ⚠️ 场景未覆盖（待新建） |
| S6 | #3/HLD | 姓名、手机号、邮箱缺失时引导补充；其他字段可空；〔v1.1 / C-09〕手机号（11 位大陆号或 `+` 开头国际号）、邮箱按 backend 同规则即时提示，格式不合法拒绝保存并指出字段（不视同缺失） | hooks/components（必填引导 + 即时格式提示；以 backend 校验为准） | ⚠️ 场景未覆盖（待新建） |
| S7 | #4 | 用户未明确确认前不得提示“已保存”，也不触发保存 | components（独立的确认操作）+ hooks（确认状态机） | ⚠️ 场景未覆盖（待新建） |
| S8 | #4 | 用户明确确认 → 调 backend 保存 → 仅 backend 返回成功后提示“已保存”；〔v1.1 / C-11〕成功后提供“上传下一份”，已确认记录不可修改 | hooks + api（确认保存）+ components（成功终态） | ⚠️ 场景未覆盖（待新建） |
| S9 | #4（异常路径） | 保存失败：不得提示已保存；展示通用错误并允许重试；〔v1.1 / C-05〕确认接口幂等，超时/失败后可直接重试确认，不做“保存状态查询” | hooks/components 错误态 + 防重复点击 | ⚠️ 场景未覆盖（待新建） |
| S10 | HLD §3/§5 | 刷新或关闭后重开，凭 HttpOnly Cookie 从 backend 恢复未确认草稿；〔v1.1 / C-07〕打开页面有草稿则自动恢复 | pages 启动时调用草稿读取（hooks/api） | ⚠️ 场景未覆盖（待新建） |
| S11 | HLD §3 | 模型能力/授权不可用或拒绝该输入：停止解析，显示不含敏感内容的错误 | api 错误转换 + components 错误态 | ⚠️ 场景未覆盖（待新建）；错误码待 OpenAPI（C-13） |
| S12 | HLD §3 | 同步解析等待期间的等待态、超时处理；〔v1.1 / C-08〕请求超时 75s，单一加载提示，超时提示重新上传 | hooks 加载态/超时（AbortController）+ components 单一加载提示 | ⚠️ 场景未覆盖（待新建） |
| S13 | HLD §5 | 草稿 7 天无活动被清理后，恢复失败的处理；〔v1.1 / C-07〕过期/令牌失效显示空态并引导重新上传 | hooks/api 空态 | ⚠️ 场景未覆盖（待新建） |
| S14 | 〔v1.1 / C-05、C-10〕补充 | 确认时该简历已保存过（姓名+手机号+邮箱规范化后同键）：不新增记录，提示“该简历已保存过”，不按首次成功处理 | hooks（识别 backend 返回的“已保存过”标识）+ components（专用提示态） | ⚠️ 场景未覆盖（待新建）；标识形式待 OpenAPI |
| S15 | 〔v1.1 / C-07〕补充 | 已有草稿时重新上传：前端先二次确认，确认后由上传接口覆盖当前草稿，不新增丢弃接口 | components（二次确认）+ hooks/api（复用上传） | ⚠️ 场景未覆盖（待新建） |

---

## 变更影响评估

### 新增

按 AGENTS.md 目录约定（`pages → components → hooks → api`，`types` 与 OpenAPI 一致）：

- **工程脚手架**（AGENTS.md「构建、运行与测试」）：Vite + React 18 + TypeScript + Ant Design 项目；`package.json` 需提供 `npm ci / build / test / lint`（脚本尚不存在）。〔v1.1 / C-15〕测试用 Vitest + React Testing Library，静态检查用 ESLint。〔v1.1 / C-06〕`vite.config` 配置 dev proxy 转发 `/api` 到 backend。
- **api 层**（S1、S5、S8、S10、S11）：基于 fetch 的统一封装；`multipart/form-data` 上传；按 `{code, message, request_id}` 统一错误体转换（`rules/frontend/api.md` §3）；〔v1.1 / C-06〕localhost 同源，fetch 使用 `same-origin`（Cookie 自动携带），不需要 CORS / `credentials: 'include'`；〔v1.1 / C-08〕请求超时 75s（AbortController）；不得在控制台输出简历内容。路径前缀参考 `/api/v1`，**具体路径、字段、状态值以 backend OpenAPI 为准，目前不存在**；〔v1.1 / C-13〕OpenAPI 草稿由 backend 在 architecture-advisor 阶段先出并冻结，api/types 待其冻结后对齐，期间可先搭骨架。
- **types 层**（S3、S4）：简历模型类型，覆盖 `简历模板.md` 的：姓名；求职意向（岗位名称、期望城市、期望薪资、到岗时间）；联系方式（手机号、邮箱、个人主页/GitHub/LinkedIn）；个人信息（性别、出生年月、政治面貌、现居城市、工作年限、最高学历）；个人优势；工作经历（多条）；项目经历（多条）；教育背景（多条）；专业技能；证书与荣誉；语言能力；自我评价。〔v1.1 / C-14〕以 `global-info/简历模板.md` 为最终模型，语言能力为独立分类。〔v1.1 / C-04〕字段状态枚举 `recognized` / `uncertain` / `missing` / `confirmed`。JSON 字段 snake_case、时间 ISO 8601 UTC（api.md §2）。
- **hooks 层**（S1、S5–S10、S12、S14、S15）：上传/解析、草稿恢复（〔v1.1 / C-07〕启动自动恢复）、校对（`useReducer` 状态机；〔v1.1 / C-03〕按字段状态顺序逐项提问）、确认保存（〔v1.1 / C-05〕可直接重试，处理“已保存过”）。状态仅存运行时内存（F-02）。
- **components 层**（S2–S4、S7、S9、S11、S14、S15）：文件上传控件、简历结果展示（〔v1.1 / C-04〕含 `recognized` 已识别待确认、`uncertain`、`missing`、`confirmed` 四种标识）、逐项校对的结构化字段编辑、独立“确认”操作、〔v1.1 / C-05〕“该简历已保存过”提示态、〔v1.1 / C-11〕成功终态与“上传下一份”、〔v1.1 / C-07〕覆盖草稿二次确认、错误态/加载态/空态（〔v1.1 / C-08〕单一加载提示）。
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
| 跨 Workbench：backend 维护 OpenAPI | 全部 api/types | 前端不自行约定契约；〔v1.1 / C-13〕等 backend OpenAPI 草稿冻结后对齐，可先搭骨架 |
| 契约变更经 cross-workbench-reviewer | 契约变更 | 契约确认后进入该审视 |
| B-04 用户确认后才入库 / 不猜测补全（前端侧） | S4、S6、S7 | 前端不自行补全字段值；仅展示 backend 结果与用户输入。〔v1.1 / C-04〕`recognized` 必须明确展示为“待用户确认”，不得当作已确认展示 |

---

## 技术风险

| 风险 | 严重性 | 说明 |
|------|:-----:|------|
| 无 OpenAPI 契约即无法落 api/types | 高 → 中〔v1.1 / C-13〕 | 裁决：backend 先出 OpenAPI 草稿并冻结后对齐，可先搭骨架；仍是串行依赖，冻结前字段级实现不能定稿 |
| 同步解析耗时/超时（HLD §8 假设 2） | 中 → 低〔v1.1 / C-08〕 | 阈值已定：frontend 75s、backend 60s，单一加载提示，超时提示重新上传。残留：超时重传会让上传接口每次新建草稿，产生孤儿草稿，依赖 7 天清理兜底（review 维度 4 判定 POC 可接受） |
| Cookie 跨域/SameSite（HLD §8 假设 4） | 中 → 低〔v1.1 / C-06〕 | POC 口径：localhost 同源，Vite dev proxy，`same-origin`，Cookie `HttpOnly; SameSite=Lax; Path=/`。残留：生产/非 localhost 部署形态不在本次裁决范围 |
| 确认保存重复提交 | 中 → 低〔v1.1 / C-05、C-10〕 | backend 幂等（键：姓名+手机号+邮箱规范化）+ 唯一约束兜底；frontend 仍需防重复点击并处理“已保存过”态 |
| 对话式校对的形态不明确 | 中 → 低〔v1.1 / C-03〕 | 已定：frontend 驱动，结构化字段编辑；hooks 持有逐项提问流程。残留：确认按钮启用条件见文末「再确认」 |
| 字段状态口径不一致（新增）〔v1.1 / C-04〕 | 中 | 若前端把 `recognized` 当已确认展示，违反 B-04/F-03 精神；需 4 种状态分别展示并纳入测试 |
| 复杂嵌套字段编辑（多条工作/项目/教育经历） | 低 | 需支持增删改多条；结构化字段编辑 + 逐项确认可能使交互较长（C-03 带来） |
| 错误信息泄漏简历内容 | 低 | 依赖 backend 错误体不含敏感内容；前端只展示 `message`，不拼接上传内容 |

---

## 对 requirements 的建议补充

> 基于 HLD 与 PRD，以下边界条件 PRD 未覆盖，建议在 requirements 汇总时明确：
- 上传前的前端校验口径：类型以扩展名还是 MIME 判断；空文件、重命名伪装文件如何处理（最终以 backend 校验为准）。〔v1.1：未裁决，保持开放，随 OpenAPI/技术设计确定〕
- ✅ 已裁决〔v1.1 / C-07〕：重新上传覆盖当前草稿，前端二次确认。
- ✅ 已裁决〔v1.1 / C-11〕：成功后提供“上传下一份”，已确认记录不可修改。
- ✅ 已裁决〔v1.1 / C-09〕：以 backend 为准，frontend 同规则即时提示。
- ✅ 已裁决〔v1.1 / C-02〕：单文件；照片为单张图片，不支持多图。
- 无障碍与浏览器兼容范围未定义。〔v1.1：未裁决，保持开放〕

---

## 验证回路自检

- 来源检查：本文件无“修改”项，因此无 `文件:行号` 引用；原因是新项目无源码，已在顶部声明。
- 约束覆盖：`architectural_constraints.md` 全部扫描，命中 F-01/F-02/F-03/B-03/B-04 及跨 Workbench 三条，见上表。
- 推断检查：无法确认项均标注 ⚠️ 并写入下方待澄清问题。
- 方案可行性追踪：无现有代码，无法追踪执行路径；Cookie、超时、CORS 等机制性结论均未下定论，标为风险与待确认。
- 新分支键唯一性、共享逻辑完整性：不适用（无现有分支结构/共享逻辑）。
- HLD §8 中涉及 frontend 的假设：#2（同步体验）、#4（Cookie）无法在空仓库中码级验证，已回流为 Q-frontend-02、Q-frontend-03。
- 〔v1.1〕裁决回流：C-01（PDF 直送模型）、C-12（草稿存储形态）为 backend 内部，对 frontend 上传格式无影响，未改动 frontend 范围。
- HLD 与 PRD 冲突：未发现。注意 F-02 在 constraints 文件为 WARN 而在 HLD/AGENTS.md 为红线，不构成冲突，按更严格口径。

---

## 待澄清问题（回流第二轮 Q&A）

| 编号 | 待澄清问题（指向具体代码/场景） | 建议回答人 | 不同答案的影响 |
|------|------------------------------|-----------|--------------|
| Q-frontend-01 | ⚠️ backend OpenAPI 何时提供？具体路径、字段、字段状态与错误码？（S1、S3–S5、S8、S11） | DL（跨 Workbench） | ✅ **已裁决 C-13 / C-04**：architecture-advisor 阶段 backend 先出 OpenAPI 草稿，经 Review 冻结后两侧并行；字段状态取 4 值。路径/字段/错误码仍待 OpenAPI 草稿提供，frontend 先搭骨架 |
| Q-frontend-02 | ⚠️ 同步解析的前端超时、等待态呈现和超时后是否重试？（S12） | DL | ✅ **已裁决 C-08**：frontend 请求超时 75s（backend 60s）；单一加载提示；超时提示重新上传 |
| Q-frontend-03 | ⚠️ 同源与否、Cookie 属性、开发环境约定？（S10） | DL | ✅ **已裁决 C-06**：localhost 同源；Vite dev proxy 转发 `/api`；fetch `same-origin`；Cookie `HttpOnly; SameSite=Lax; Path=/`，不强制 Secure；不需要 CORS credentials |
| Q-frontend-04 | ⚠️ “对话校对”由谁驱动，回复形态？（S5） | BA / DL | ✅ **已裁决 C-03**：frontend 按字段状态逐项提问；用户以结构化字段编辑回复（非自由文本）；backend 只返回字段值与状态 |
| Q-frontend-05 | ⚠️ 姓名、手机号、邮箱格式校验由谁负责？（S6） | DL | ✅ **已裁决 C-09**：以 backend 为准，frontend 同规则即时提示；手机号 11 位大陆号或 `+` 开头国际号，邮箱仅格式；不合法拒绝保存并指出字段，不视同缺失 |
| Q-frontend-06 | ⚠️ 恢复草稿 UX、过期提示、重新上传是否覆盖？（S10、S13、S15） | BA | ✅ **已裁决 C-07**：自动恢复；重新上传覆盖当前草稿（前端二次确认）；不新增丢弃接口；过期/令牌失效显示空态引导重新上传 |
| Q-frontend-07 | ⚠️ 确认保存是否幂等？超时重试？（S8、S9、S14） | DL（跨 Workbench） | ✅ **已裁决 C-05 / C-10**：确认接口幂等，幂等键=姓名+手机号+邮箱（规范化后比较）；去掉“保存状态查询”；超时后可直接重试；新增“该简历已保存过”提示态 |
| Q-frontend-08 | ⚠️ 保存成功后页面终态？（S8） | BA | ✅ **已裁决 C-11**：显示已保存，提供“上传下一份”；已确认记录不可修改；草稿与临时文件删除、令牌作废（backend 侧） |
| Q-frontend-09 | ⚠️ 前端测试框架与 lint 选型？ | DL | ✅ **已裁决 C-15**：Vitest + React Testing Library + ESLint |

---

## 裁决后需 DL 再确认的点（〔v1.1〕）

以下为按裁决落地时发现、裁决文本未覆盖的细节，**未擅自决定**：

| 编号 | 问题 | 涉及裁决 | 影响 |
|---|---|---|---|
| R-01 | “最终确认”按钮启用条件：是否要求所有 `recognized` / `uncertain` 字段逐项变为 `confirmed`，还是仅姓名/手机号/邮箱齐全且格式合法即可确认（其余字段可保持原状态保存）？review 维度 2 提到该状态影响确认按钮，但 C-04 未写明 | C-03、C-04 | 前者交互更长但更贴 PRD“按字段逐项确认”；后者更简单，但 `recognized` 字段被保存时是否视为已确认需明确 |
| R-02 | “已保存过”时返回的已有记录与当前草稿内容可能不同：界面应只提示，还是展示已有记录？“已保存过”的响应标识形式？ | C-05、C-10 | 影响 S14 的展示与 types；待 OpenAPI |
| R-03 | 75s 超时后 backend 可能仍在处理并已建草稿；用户重新上传会产生孤儿草稿，且 Cookie 令牌可能指向新旧草稿之一 | C-07、C-08 | review 维度 4 已判定 POC 可接受；请确认重新上传时令牌/草稿的覆盖语义由 backend 保证 |
| R-04 | C-09 格式不合法“拒绝保存”：前端是禁用确认按钮，还是允许提交由 backend 返回字段级错误后指出字段？错误体是否含字段名 | C-09 | 影响错误体契约与 hooks |
| R-05 | C-01 官方文档未列 PDF，DL 实测为准；上传格式不变，frontend 不受影响，但若 backend 实测失败回退需求变更，frontend 的 PDF 上传范围会受影响 | C-01 | 仅提示，需 backend spike 证据 |
