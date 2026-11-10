# HR_PR-1 跨 Workbench 一致性 Review 报告

**Review 人**：Yin Yang（来自 local_profile.yaml，role: dev-lead）
**生成日期**：2026-11-10（AI 草稿；Dev Lead 已于 2026-11-10 完成裁决）
**参与 Workbench**：backend, frontend

> 比对依据：`backend-docs/HR_PR-1/00_impact_analysis.md`、`frontend-docs/HR_PR-1/00_impact_analysis.md`、PRD、HLD §4/§5/§8、`project_glossary.md`、`architectural_constraints.md`、`global-info/简历模板.md`。
> 两个仓库均为新项目、无源码、无 OpenAPI，本报告只比对两份分析文档的口径，不涉及代码级核实。
> 按 Skill 原则，各 Workbench「待澄清问题」不在本报告裁决范围，由 requirements-analyst 第二轮 Q&A 处理；本报告仅在其造成跨 Workbench 口径不一致时引用。

**变更履历**：

| 日期 | 变更 | 原因 |
|---|---|---|
| 2026-11-10 | 新增「契约审视：OpenAPI 草稿 v0.1.0-draft」节（O-01..O-13） | C-13：OpenAPI 冻结前须经本 Review 审视；同时审视 D-06 错误体变更 |
| 2026-11-10 | 新增「契约审视（第二轮）：frontend 接口消费设计」节（G-01、F-01..F-05） | frontend Step 2.2 提出契约缺口与待确认点 |
| 2026-11-10 | 新增「契约变更：OpenAPI 0.1.1」节（G-01、G-02、CR-01） | backend 技术设计提出 CR-01，与 G-01/G-02 合并为一次兼容修订 |
| 2026-11-10 | C-01 补充：任务 1.8 实测 deepseek-flash 不接受 PDF，PDF 改为本地转换后提交（见 ADR-001 修订 1） | 实测证据推翻原结论 |

---

## 汇总状态

| Workbench | 分析人 | 完成时间 | 文档路径 |
|---|-------|---------|---------|
| backend | Yin Yang（backend） | 2026-11-10 | `backend-docs/HR_PR-1/00_impact_analysis.md` |
| frontend | Yin Yang（frontend） | 2026-11-10 | `frontend-docs/HR_PR-1/00_impact_analysis.md` |

---

## 维度 1：API 契约对齐（接口提供 ↔ 消费）

识别到 1 组接口关系：**frontend（消费） → backend（提供）**，对应 HLD §4 三条契约。

| 接口 | frontend 期望 | backend 定义 | 状态 |
|-----|-------------|-------------|------|
| 公共：路径前缀 / 错误体 | `/api/v1`；统一错误体 `{code, message, request_id}`；只展示 `message` | `/api/v1`；统一错误体 `{code, message, request_id}`；`request_id` 中间件 | ✅ 一致 |
| 公共：契约来源 | 以 backend OpenAPI 为准，不自行约定 | 路由与模型同步生成 OpenAPI | ✅ 一致（OpenAPI 尚不存在，见维度 4） |
| 简历上传并同步解析 | multipart 上传；前端预校验类型 / 大小，以 backend 为准；等待态 | multipart；后端校验类型 / 大小 / 魔数；同步调模型并落草稿 | ✅ 一致 |
| 未确认草稿读取 | 页面启动时凭 HttpOnly Cookie 恢复；前端不读令牌 | `core` 签发 HttpOnly Cookie 令牌；草稿读取接口 | ✅ 一致 |
| 草稿校对更新 | 按字段修订，未确认字段保持待处理 | 字段更新 + 字段状态流转 | ✅ 一致（字段状态取值见维度 2） |
| 丢弃草稿 / 重新上传替换草稿 | Q-frontend-06 提出可能需要"丢弃草稿"类契约 | 未定义此接口；仅在"建议补充"中提到重复上传语义 | ⚠️ 仅出现在一侧 |
| 用户确认与保存 | 仅 backend 成功后提示已保存；仍在询问是否幂等（Q-frontend-07），并考虑"结果未知"时需补状态查询 | **Dev Lead 已答复：确认接口幂等**，同一草稿重复确认返回同一结果 | ⚠️ 不一致（决策未同步到 frontend） |
| Cookie / 部署同源口径 | 同源与否未定（Q-frontend-03），`credentials` 设置待定 | **POC 口径已定**：localhost 同源、单进程，`Secure` 不强制 | ⚠️ 不一致（决策未同步到 frontend） |

**⚠️ 不一致项（待 Dev Lead 裁决）**：

| # | 接口 | 冲突描述 | 裁决（Dev Lead 填写） |
|---|-----|---------|----------------------|
| 1 | 确认保存 | backend 已按 DL 答复采用幂等；frontend 仍按"未知"设计，可能多做"保存状态查询"契约。需决定是否把幂等结论同步到 frontend 分析，并删除"结果未知时查询状态"的设想 | ✅ 见 C-05/C-10：frontend 修改 |
| 2 | Cookie / 同源 | backend 已采用 POC 口径（localhost 同源 + 单进程）；frontend 仍按跨域可能性评估 `credentials: 'include'` 与 CORS。需决定 frontend 是否按同源（Vite dev proxy）执行 | ✅ 见 C-06：frontend 按同源修改 |
| 3 | 丢弃草稿 / 重新上传 | frontend 提出可能需要"丢弃草稿"接口，backend 未规划；HLD §4 也未列出。需决定是否新增契约，或规定"重新上传即覆盖当前草稿"由上传接口承担 | ✅ 见 C-07：不新增丢弃接口，重新上传即覆盖当前草稿，由上传接口承担 |

> 另：对话校对由谁驱动（Q-backend-06 / Q-frontend-04）两侧均列为待澄清且口径一致（都未定），属开放问题，交 requirements-analyst 第二轮 Q&A，**不在此裁决**；但它会直接决定草稿读取 / 更新契约的形态，建议优先处理。

---

## 维度 2：数据模型一致性（数据模型生产 ↔ 消费）

识别到 1 组数据模型关系：**backend（生产，`schemas` 简历模型 / 草稿模型） → frontend（消费，`types` 层）**。

| 字段 / 结构 | backend 定义 | frontend 对应 | 状态 |
|------------|-------------|-------------|------|
| 简历模型分类 | 来源 `简历模板.md`：姓名、求职意向、联系方式、个人信息、个人优势、工作经历[多条]、项目经历[多条]、教育背景[多条]、专业技能、证书与荣誉、语言能力、自我评价 | 同 12 类，并列出求职意向 / 联系方式 / 个人信息子字段 | ✅ 两侧一致（与 PRD / glossary 分类名不同，见维度 5） |
| 多条经历 | 工作 / 项目 / 教育为多条，子项存储方式待设计 | 支持增删改多条 | ✅ 一致 |
| 字段级状态取值 | 4 值：已识别 / 不确定 / 缺失 / 用户已确认 | 3 值：待补充 / 待确认 / 已确认（取值待 OpenAPI） | ⚠️ 不一致 |
| 核心必填字段 | 姓名 / 手机号 / 邮箱，校验在 `services` 单点实现 | 姓名 / 手机号 / 邮箱缺失时引导补充；格式校验归属待定（Q-frontend-05） | ✅ 字段一致（校验归属属开放问题） |
| JSON 命名 / 时间格式 | 未在分析中声明（应遵循 `rules/backend/api.md`） | snake_case；ISO 8601 UTC | ✅ 无冲突（backend 实现时须按 rules 落实） |
| 记录—原始文件关系 | 一对一（B-05）；多图会改变此假设（Q-backend-10） | 单文件；多图列为建议补充 | ✅ 一致（均按单文件） |
| `语言能力` 归属 | 独立分类 | 独立分类 | ✅ 两侧一致；但 `简历模板.md` 中语言能力是"证书与荣誉"下的一行，见维度 5 |

**⚠️ 不一致项（待 Dev Lead 裁决）**：

| # | 字段 | 冲突描述 | 裁决（Dev Lead 填写） |
|---|-----|---------|----------------------|
| 1 | 字段级状态枚举 | backend 4 值（已识别 / 不确定 / 缺失 / 用户已确认），frontend 3 值（待补充 / 待确认 / 已确认）。对应关系推测为"缺失≈待补充、不确定≈待确认、用户已确认≈已确认"，但 backend 的"已识别"（模型识别、用户尚未确认）在 frontend 无对应值。由于 PRD 要求"按字段逐项确认"，"已识别未确认"是否需要单独状态，会影响确认按钮的启用条件 | ✅ 见 C-04：以 backend 4 值为准，frontend 修改 |

---

## 维度 3：责任边界

| 用户故事 | 覆盖 Workbench | 状态 |
|---------|-------|------|
| #1 上传简历文件 | backend（S1-1/S1-2/S1-E1）、frontend（S1/S2） | ✅ 已覆盖 |
| #2 整理为预设简历模型 | backend（S2-1/S2-2/S2-E1）、frontend（S3/S4/S11） | ✅ 已覆盖 |
| #3 对话校对 | backend（S3-1/S3-2/S3-E1）、frontend（S5/S6/S10/S13） | ✅ 已覆盖（驱动方待澄清） |
| #4 确认并保存 | backend（S4-1~S4-3/S4-E1~E3）、frontend（S7/S8/S9） | ✅ 已覆盖 |

细项分工核对：

| 事项 | backend | frontend | 结论 |
|---|---|---|---|
| 文件类型 / 大小校验 | 权威校验（含魔数） | 预校验，提示用 | ✅ 分工清晰 |
| 防重复确认 | 幂等 + 唯一约束兜底 | 防重复点击 | ✅ 分工清晰 |
| 草稿 7 天清理 | 负责 | 过期后的空态提示 | ✅ 分工清晰 |
| 原始文件归档与一致性（B-05） | 负责 | 不涉及 | ✅ |
| 不得猜测补全 | 模型输出严格校验 | 不自行补全、只展示 | ✅ |
| 逐项提问的编排 | 待定（Q-backend-06） | 待定（Q-frontend-04） | ⚠️ 两侧都未认领，但均已登记为待澄清，不计为责任真空 |

**⚠️ 责任真空（待 Dev Lead 裁决）**：

本次未发现责任真空：4 个用户故事均被两个 Workbench 明确覆盖，且没有一侧把工作推给另一侧而对方未承接的情况。

---

## 维度 4：技术风险合并评估

| 风险 | 来源 Workbench | 单个 Workbench 评级 | 合并评级 | 说明 |
|------|-------|:-------:|:-------:|------|
| 无 OpenAPI，frontend 无法落 api / types | frontend | 高 | 高 | backend 的 OpenAPI 由路由同步生成，即 backend 至少写出路由与 schemas 后 frontend 才能对齐类型；两侧存在**串行依赖**。建议 architecture-advisor 阶段先冻结 OpenAPI 草稿再并行开发 |
| 记录与文件一致性（B-05，无跨存储事务） | backend R-04 | 高 | 高 | 仅 backend 内部；frontend 只依赖成功 / 失败结果，无叠加 |
| 同步解析超时 / 重复上传 | backend R-02（中）、frontend（中） | 中 / 中 | 中 | 叠加点：frontend 超时后允许重试，而上传接口每次都新建草稿（非幂等），可能产生孤儿草稿与临时文件，依赖 7 天清理兜底。POC 规模下可接受，不升级 |
| 字段状态口径不一 + 模型输出不可信 | backend R-06（中）、frontend 校对形态（中） | 中 / 中 | 中 → 需关注 | 若"已识别未确认"状态在 frontend 缺失，可能把模型结果当成已确认展示，违反 B-04 / F-03 精神。随维度 2 #1 裁决而定 |
| Cookie / SameSite / 同源 | backend R-03（中）、frontend（中） | 中 / 中 | 低（POC） | 已按 POC 同源处理；前提是维度 1 #2 同步到 frontend |
| 确认保存重复提交 | frontend（中） | 中 | 低 | backend 已定幂等 + 唯一约束 |
| DeepSeek 输入形式（base64 / 上传） | backend R-01 | 低 | 低 | 对 frontend 无影响 |
| 文件内容安全 | backend R-08 | 中 | 中 | 无叠加 |
| 草稿清理触发 | backend R-05 | 中 | 低（POC） | 单进程，无多 worker 重复清理 |
| 错误信息泄漏简历内容 | frontend（低）、backend B-03 | 低 | 低 | 两侧口径一致：后端不回显值，前端只展示 `message` |
| 嵌套多条经历编辑体验 | frontend | 低 | 低 | 无叠加 |

---

## 维度 5：术语一致性

| 术语 | 各 Workbench 用法 | 状态 | 处理建议 |
|------|---------|------|---------|
| 简历模型分类名 | glossary / PRD：基本信息、教育经历、技能、证书；backend / frontend：姓名+联系方式+个人信息、教育背景、专业技能、证书与荣誉，另含"个人优势" | ⚠️ | 以 glossary 为准；但 PRD 写明"最终分类以确认后的简历模型为准"，而两侧都采用 `简历模板.md` 分类。建议 Dev Lead 确认以 `简历模板.md` 为最终模型，并更新 glossary 中"简历模型"的定义 |
| 语言能力 | 两侧均作为独立分类；`简历模板.md` 中是"证书与荣誉"下的一行 | ⚠️ | 需确认是独立分类还是证书子项，结论同步到 glossary |
| 字段状态（待补充 / 待确认 / 缺失 / 不确定 / 已识别 / 已确认） | backend 与 frontend 用词不同 | ⚠️ | 与维度 2 #1 同步裁决，确定后写入 glossary |
| 草稿 / 未确认草稿 | 两侧均使用；glossary 无 | — | 建议新增术语："未确认草稿：解析后、用户确认前暂存于服务端临时存储的简历数据，7 天无活动清理" |
| 草稿访问令牌 | backend：Cookie 令牌 / 草稿令牌；frontend：令牌 | — | 建议新增术语，统一为"草稿访问令牌"（HLD 用语） |
| 简历记录 | 两侧均使用；glossary 无 | — | 建议新增术语："确认后写入正式库、与原始文件关联的结构化简历" |
| 校对 / 对话校对 | 两侧用法与 glossary 一致 | ✅ | 无需处理 |
| 原始文件 | 两侧用法与 glossary 一致 | ✅ | 无需处理 |

---

## 遗留问题汇总

- 维度 1 不一致项：3 条（幂等决策未同步、同源决策未同步、丢弃草稿接口仅一侧提出）
- 维度 2 不一致项：1 条（字段级状态枚举）
- 维度 3 责任真空：0 条
- 维度 5 术语问题：3 条 ⚠️（分类名、语言能力归属、字段状态用词）+ 3 条建议新增术语

**需求汇总（requirements-analyst）启动条件**：所有 ⚠️ 项均已裁决（或明确标注"接受风险"），且无未分配责任的用户故事。

**观察（非裁决项，供参考）**：
- 两份分析头部的"代码仓库"路径写的是 Orca worktree 路径（`/Users/yanyin/orca/workspaces/...`），合并到 feature 后与主工作区路径不一致。建议后续以 `local_profile.yaml` 的 `code_roots` 为准，文档中改写为仓库相对路径。
- Dev Lead 对 backend 的答复（Q01 / Q05 / POC 定位）只回写到了 backend 文档。建议后续 DL 答复统一写入 `_progress.md` 或 requirements 汇总，避免单侧可见。

---

## 复核：待核实问题合并清单（2026-11-10）

> 将 backend Q-backend-01..10、frontend Q-frontend-01..09 与上文 ⚠️ 项合并去重。"建议"列为 AI 按 POC 口径给出的参考，**不是裁决**；裁决由 Dev Lead / BA 填写。
> 本节不替代 requirements-analyst 第二轮 Q&A，裁决结果作为其输入。

### 外部事实核实

| 核实项 | 核实方式 | 结论 |
|---|---|---|
| `deepseek-flash` 是否接受 PDF 输入（Q-backend-01 / ADR-001） | 查阅 DeepSeek 官方文档 [Vision 指南](https://api-docs.deepseek.com/guides/vision/)、[Files API](https://api-docs.deepseek.com/guides/files_api)（2026-11-10 访问） | ❌ **官方文档列出的支持格式仅 JPEG / PNG / GIF / WebP**，未列 PDF。图片可 base64 内联（请求体 ≤ 48 MiB）、外链 URL、Files API 上传。**照片路径可行；PDF 无法"直接"提交。** 未用真实凭证调用验证 |
| 图片输入形式 | 同上 | base64 内联即可满足 10 MB 上限，无需外链 URL（避免对外暴露文件，符合 B-06） |

### 合并清单

| # | 问题 | 来源 | 建议（参考） | 建议裁决人 | 裁决 |
|---|---|---|---|---|---|
| C-01 | **PDF 如何送入模型**（阻断 ADR-001 原路径） | Q-backend-01（需重开）、R-01、ADR-001 | 方案 a：backend 本地将 PDF 逐页渲染为 PNG 后按图片送模型（非 OCR，仍由模型直接理解，需新增 PDF 渲染依赖）；方案 b：提取 PDF 文本层后送模型（扫描件 PDF 无文本层会失败）；方案 c：首期只支持照片，PDF 范围外。a 最贴近 ADR-001 意图，但需修订 ADR-001 措辞并限制页数 | DL | ✅ DL 裁决（2026-11-10）：已经实测验证 `deepseek-flash` 支持 PDF 直接输入，维持 ADR-001 原路径，不做 PDF 转图片或文本提取。注：公开文档列出的格式只有图片，以 DL 的实测结论为准；backend 实现首个 spike 时须保留调用证据。⚠️ **2026-11-10 补充**：任务 1.8 用合成文档实测，deepseek-flash 不接受 PDF（只支持 webp/png/jpeg/gif）；DL 裁决仍只用 deepseek-flash，PDF 在 backend 本地转换（文本层优先、渲染 PNG 兜底、最多 5 页）后提交，见 ADR-001 修订 1 |
| C-02 | PDF 页数 / 多图上限 | Q-backend-10、frontend 建议补充 | 若选 C-01a：限制 PDF ≤ 5 页（一次请求多图）；照片仍单文件单图；记录—文件保持一对一 | DL / BA | ✅ 按一般实践（DL 授权）：单文件；PDF 不超过 10 MB，不另设页数上限；照片为单张图片；记录与文件一对一 |
| C-03 | 对话校对驱动方与交互形态 | Q-backend-06、Q-frontend-04 | frontend 基于字段状态按固定顺序逐项提问；用户以结构化字段编辑回复（非自由文本解析）；backend 只返回字段值 + 状态 | DL（契约）/ BA（交互） | ✅ DL 采纳建议（2026-11-10）：frontend 按字段状态逐项提问；用户以结构化字段编辑回复；backend 只返回字段值和状态 |
| C-04 | 字段级状态枚举 | 维度 2 #1 | 采用 4 值：`recognized`（已识别待确认）/ `uncertain`（不确定）/ `missing`（缺失）/ `confirmed`（已确认）；frontend 增加"已识别待确认"展示 | DL | ✅ DL 采纳建议（2026-11-10）：4 个值 `recognized` / `uncertain` / `missing` / `confirmed`；frontend 增加"已识别待确认"展示 |
| C-05 | 确认保存幂等同步到 frontend | 维度 1 #1、Q-frontend-07 | 同步 DL 已答复的幂等结论；frontend 去掉"保存状态查询"设想，超时后可直接重试确认 | DL | ✅ DL 采纳建议（2026-11-10）：把幂等结论同步到 frontend，幂等键按 C-10；frontend 去掉"保存状态查询"，超时后可直接重试确认，并处理"已保存过"提示 |
| C-06 | 部署同源 / Cookie | 维度 1 #2、Q-backend-08、Q-frontend-03 | localhost 同源：开发用 Vite dev proxy 转发 `/api`；fetch 默认 `same-origin`；Cookie `HttpOnly; SameSite=Lax; Path=/`，不强制 Secure；单进程 | DL | ✅ DL 采纳建议（2026-11-10）：localhost 同源，开发时用 Vite dev proxy 转发 `/api`；fetch 用 `same-origin`；Cookie `HttpOnly; SameSite=Lax; Path=/`，不强制 Secure；单进程 |
| C-07 | 丢弃草稿 / 重新上传 / 打开页面恢复 | 维度 1 #3、Q-frontend-06 | 打开页面存在草稿则自动恢复；重新上传即覆盖当前草稿（由上传接口承担，前端二次确认）；不新增丢弃接口；过期或令牌失效时显示空态并引导重新上传 | BA | ✅ 按一般实践（DL 授权）：打开页面时有草稿则自动恢复；重新上传即覆盖当前草稿（前端先二次确认），不新增丢弃接口；草稿过期或令牌失效时显示空态，引导重新上传 |
| C-08 | 同步解析超时与重试 | Q-backend-07、Q-frontend-02 | backend 调模型超时 60s；frontend 请求超时 75s（略大于后端）；单一加载提示；超时后提示重新上传 | DL | ✅ DL 采纳建议（2026-11-10）：backend 调模型超时 60s；frontend 请求超时 75s；单一加载提示；超时后提示重新上传 |
| C-09 | 手机号 / 邮箱校验规则与归属 | Q-backend-04、Q-frontend-05 | backend 为权威校验；frontend 用同一规则做即时提示；规则 POC 从宽（手机号 = 11 位大陆号或 `+` 开头国际号，邮箱仅格式校验）；格式不合法时拒绝保存并提示字段，不视同缺失 | BA | ✅ 按一般实践（DL 授权）：以 backend 校验为准，frontend 用同一规则做即时提示；手机号接受 11 位大陆号或 `+` 开头的国际号，邮箱只校验格式；格式不合法时拒绝保存并指出字段，不视同缺失 |
| C-10 | 同一手机号 / 邮箱重复保存 | Q-backend-03 | POC 允许多条，不建唯一键；查重属范围外 | BA | ✅ DL 裁决（2026-11-10）：幂等键 = 姓名 + 联系方式（手机号、邮箱），规范化后比较（去首尾空格、邮箱转小写）。同键再次确认时不新增记录，返回已有记录，并标明"已保存过"。正式库对该组合建唯一约束兜底并发 |
| C-11 | 保存成功后终态 | Q-frontend-08 | 展示已保存，提供"上传下一份"；已确认记录不可修改；草稿与临时文件删除、令牌作废 | BA | ✅ 按一般实践（DL 授权）：显示已保存，提供"上传下一份"；已确认记录不可修改；删除草稿与临时文件，作废令牌 |
| C-12 | 未确认草稿存储形态 | Q-backend-02 | 独立 SQLite 文件（与正式库分离） | DL（backend 内部） | ✅ DL 采纳建议（2026-11-10）：独立 SQLite 文件，与正式库分离 |
| C-13 | OpenAPI 交付时点 | Q-frontend-01、维度 4 | architecture-advisor 阶段由 backend 先产出 OpenAPI 草稿并经本 Review 冻结，再并行开发 | DL | ✅ DL 采纳建议（2026-11-10）：architecture-advisor 阶段由 backend 先出 OpenAPI 草稿，经本 Review 冻结后两侧并行开发 |
| C-14 | 简历模型分类与"语言能力"归属 | 维度 5 | 以 `global-info/简历模板.md` 为最终模型；"语言能力"作为独立分类（PRD 已列出）；更新 glossary 定义 | DL / BA | ✅ 按一般实践（DL 授权）：以 `global-info/简历模板.md` 为最终模型；"语言能力"作为独立分类；同步更新 glossary |
| C-15 | 工程工具链 | Q-backend-09、Q-frontend-09 | backend：uv + `pyproject.toml`，pytest；frontend：Vitest + React Testing Library + ESLint | DL（各 Workbench 内部） | ✅ DL 采纳建议（2026-11-10）：backend 用 uv + `pyproject.toml` + pytest；frontend 用 Vitest + React Testing Library + ESLint |

> C-01 若不选"首期不支持 PDF"，需按 requirement-change-router 修订 ADR-001 与 HLD §3/§8，并通知 backend 修订影响分析 R-01；frontend 不受影响（上传格式不变）。

### 第二轮：按裁决修订后新增的待确认点（2026-11-10）

> 来源：backend 影响分析 v3 的 Q-backend-11/12，frontend 影响分析 v1.1 的「裁决后需 DL 再确认的点」R-01..R-04（frontend R-05 仅为提示，不需裁决）。已合并去重。

| # | 问题 | 来源 | 裁决 |
|---|---|---|---|
| D-01 | 首次确认已成功但响应丢失，重试时草稿已删、令牌已作废，得不到"已保存过" | Q-backend-11 | ✅ DL 采纳建议（2026-11-10）：POC 接受。backend 对"草稿不存在 / 令牌无效"返回专门错误码；frontend 提示"可能已保存，请重新上传核实"；重新上传后由幂等键返回"已保存过"。不做已确认标记保留 |
| D-02 | 幂等键规范化范围；同一个人再次提交时如何处理新内容 | Q-backend-12 | ✅ DL 采纳建议（2026-11-10）：在 C-10 基础上，手机号去掉空格和连字符、去掉 `+86` / `86` 前缀，姓名合并内部多余空格；同键命中时丢弃新内容并删除临时文件，不覆盖已有记录 |
| D-03 | "最终确认"按钮的启用条件 | frontend R-01 | ✅ DL 采纳建议（2026-11-10）：姓名、手机号、邮箱齐全、格式合法并已确认即可启用；其余未确认字段给出提示，用户点最终确认即视为确认当前显示的全部内容 |
| D-04 | 提示"已保存过"时是否展示已有记录 | frontend R-02 | ✅ DL 采纳建议（2026-11-10）：只显示文字提示，不回显已有记录内容；响应带 `already_saved` 标识与记录 id |
| D-05 | 前端 75s 超时后重新上传，新旧草稿与令牌如何处理 | frontend R-03 | ✅ DL 采纳建议（2026-11-10）：由 backend 保证每次上传都生成新草稿和新令牌，Cookie 以最新一次响应为准；旧草稿由 7 天清理兜底 |
| D-06 | 手机号 / 邮箱格式不合法时如何拒绝保存 | frontend R-04 | ✅ DL 采纳建议（2026-11-10）：前端即时提示并禁用确认按钮；backend 返回字段级错误，只带字段名和原因，不回显值（B-03）；统一错误体增加可选字段 `details: [{field, reason}]` |

> D-06 属于接口契约变更：统一错误体由 `{code, message, request_id}` 扩展为可带 `details`。architecture-advisor 产出 OpenAPI 草稿时须落实，并同步 `rules/backend/api.md` 与 `rules/frontend/api.md` 中的错误体约定；契约冻结时仍须经本 Review 审视。

---

## 契约审视：OpenAPI 草稿 v0.1.0-draft（2026-11-10）

> 审视对象：`backend-docs/HR_PR-1/03_api/openapi.yaml`（`openapi-spec-validator` 校验通过）、`03_api/api_design_resume.md`、`02_schema/sql_ddl_resume.md`。
> 对照：REQ-BE-01..06、REQ-FE-01..06、本 Review C/D 裁决，以及 frontend 前置检查列出的 Step 2.2 信息需求（A 接口、B 类型、C 业务码、D 幂等、E Cookie、F 其他）。

### 覆盖检查（frontend 信息需求 → OpenAPI）

| 需求 | OpenAPI 提供 | 状态 |
|---|---|---|
| A 接口清单 | `POST /resume-drafts`、`GET /resume-drafts/current`、`PATCH /resume-drafts/current`、`POST /resumes`；不提供丢弃草稿、保存状态查询、修改删除接口 | ✅ 与 C-05 / C-07 / C-11 一致 |
| B 简历模型结构 | `ResumeFields`：22 个字段，每个为 `{value, status}`；工作经历、项目经历、教育背景为子项数组；`languages` 独立 | ✅ 与 C-04 / C-14 一致 |
| B 时间格式 | `date-time`（ISO 8601 UTC） | ✅ |
| C 错误体 | `ErrorResponse{code, message, request_id, details?}`；`details[].field` 支持 `work_experiences[0].start_date` 路径 | ✅ D-06 已落实；`rules/backend/api.md` 已同步，`rules/frontend/api.md` 待 frontend Step 2.2 同步 |
| C 业务码 | 13 个：文件类 5 个、解析类 3 个（含 `parse_timeout`）、`draft_not_found`、`validation_failed`、`confirmation_required`、`save_failed`、`internal_error` | ✅ 覆盖 frontend 列出的全部类别 |
| D 幂等 | `already_saved` 布尔值 + `resume_id`；新增返回 201，命中返回 200 | ✅ D-04 |
| E Cookie | `draft_token`，`HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`；上传时签发；保存时以 `Max-Age=0` 作废 | ✅ C-06 / C-11 / D-05 |
| F 校验口径 | 魔数判型、≤ 10485760 字节；手机号、邮箱规则只写在描述里 | ⚠️ 见 O-05 |
| Schema 对齐 | 草稿库与正式库为独立 SQLite 文件；`uq_resumes_identity(name_key, phone_key, email_key)`；令牌只存 SHA-256 | ✅ C-10 / C-12 / D-02 |

### 待裁决项

| # | 问题 | 来源 | 建议 | 裁决 |
|---|---|---|---|---|
| O-01 | 读取、更新成功时是否滑动续期 Cookie | backend 待确认 1 | 续期，与"7 天无活动"对齐 | ✅ DL 采纳建议（2026-11-10） |
| O-02 | 上传失败时不创建草稿，也不动已有草稿和 Cookie | backend 待确认 2 | 采纳 | ✅ DL 采纳建议（2026-11-10） |
| O-03 | 带有效旧令牌重新上传成功时，立即删除旧草稿（比 REQ-BE-01.6 多一步） | backend 待确认 3 | 采纳，减少残留的个人数据；超时等无法定位的旧草稿仍靠 7 天清理兜底。REQ-BE-01.6 的表述按此补充 | ✅ DL 采纳建议（2026-11-10） |
| O-04 | 只有 `+86` 后恰好是 11 位大陆号时才去掉前缀 | backend 待确认 4 | 采纳。不带 `+` 的 `86…` 会先被 C-09 校验拒绝，那条分支实际不会触发，无害 | ✅ DL 采纳建议（2026-11-10） |
| O-05 | 手机号正则：大陆号 `^1\d{10}$`，国际号 `^\+\d{6,15}$` | backend 待确认 5 | 采纳，并以 `pattern` 写进 OpenAPI 的 `ResumeFieldsUpdate.phone`，作为 frontend 即时校验的唯一来源 | ✅ DL 采纳建议（2026-11-10） |
| O-06 | `{DATA_DIR}` / `{FILE_DIR}` 的具体路径 | backend 待确认 6 | `{DATA_DIR}` = 仓库内 `data/`（存 `drafts.db`、`resumes.db`），`{FILE_DIR}` = 仓库内 `file/`；都可以用环境变量覆盖，并加入 `.gitignore` | ✅ DL 采纳建议（2026-11-10） |
| O-07 | 草稿清理间隔 1 小时 | backend 待确认 7 | 采纳 | ✅ DL 采纳建议（2026-11-10） |
| O-08 | 新增返回 201，已保存过返回 200；frontend 只依赖 `already_saved` | backend 待确认 8 | 采纳 | ✅ DL 采纳建议（2026-11-10） |
| O-09 | `PATCH` 的核心三项类型是 `string`，但没有禁止空字符串 | 主 agent 审视 | `name` / `phone` / `email` 加 `minLength: 1`；全空白字符串在服务层按 `required` 拒绝 | ✅ DL 采纳建议（2026-11-10） |
| O-10 | `draft_not_found` 同时表示"页面打开时无可恢复草稿"（REQ-FE-05.3）和"确认时草稿不存在，可能已保存"（REQ-FE-04.7） | 主 agent 审视 | 接受同一个码，frontend 按调用的接口区分文案，在 OpenAPI 描述中写明 | ✅ DL 采纳建议（2026-11-10） |
| O-11 | 工作、项目、教育经历是整块一个状态、整块替换，不是每条子项单独确认 | 主 agent 审视 | POC 接受。frontend 逐条展示、整块确认 | ✅ DL 采纳建议（2026-11-10） |
| O-12 | 页面打开时没有草稿属于正常情况，接口却返回 404 | 主 agent 审视 | 接受。frontend 把这种 404 当作空态，不当作错误提示或日志 | ✅ DL 采纳建议（2026-11-10） |
| O-13 | 接口没有限流（全局规范要求重要接口限流） | 主 agent 审视 | POC 接受此风险（localhost，约 5 人），记为已知风险；上线前另立需求处理 | ✅ DL 采纳建议（2026-11-10） |

> 状态：O-01..O-13 已裁决（2026-11-10）；backend「Schema + 接口设计评审」关卡随之通过。
> 冻结条件：O-01..O-13 裁决完成，backend 按裁决修订 OpenAPI（至少 O-05、O-09、O-10 的描述），版本从 `0.1.0-draft` 改为 `0.1.0`，然后通知 frontend 进入 Step 2.2。

---

## 契约审视（第二轮）：frontend 接口消费设计（2026-11-10）

> 审视对象：`frontend-docs/HR_PR-1/03_api/interface_spec_resume.md`、`rules/frontend/api.md`（D-06 已同步），以冻结的 OpenAPI 0.1.0 为基准。
> frontend 结论：A..E 全部覆盖，F 有 1 处缺口；其余 REQ-FE 验收标准都能被 OpenAPI 满足。主 agent 已核实缺口属实。

| # | 问题 | 来源 | 建议 | 裁决 |
|---|---|---|---|---|
| G-01 | **契约缺口**：OpenAPI 的 `email` 只有 `minLength: 1`，描述写"邮箱格式"，没有给出规则。C-09 要求前后端用同一规则，REQ-FE-03.5 的即时提示暂时做不到 | frontend 契约缺口 | backend 在 OpenAPI 补 `pattern: '^[^\s@]+@[^\s@]+\.[^\s@]+$'` 和 `maxLength: 254`（规则从宽，只防明显错误）；backend 原本就做"邮箱格式"校验，这次只是写明规则，属于兼容修订，版本升到 0.1.1 | ✅ DL 采纳建议（2026-11-10） |
| G-02 | **契约矛盾**（主 agent 核对时发现）：`phone` 的 `pattern` 作用在提交的原值上，但描述又说"校验前先去除空格与连字符"。按 OpenAPI 字面校验时，`138 0013 8000` 会被拒绝，和描述冲突。这也是 frontend 第 3 问"backend 是否接受带空格的原值"的根源 | frontend 确认点 3 | 写明契约：`pattern` 针对提交值，客户端提交前必须先去掉空格和连字符；backend 校验前同样先去掉，作为兜底。描述按此修改，随 G-01 一起进入 0.1.1 | ✅ DL 采纳建议（2026-11-10） |
| F-01 | 上传以外的 3 个接口，前端超时设为 30 秒 | frontend 确认点 2 | 采纳 | ✅ DL 采纳建议（2026-11-10） |
| F-02 | 前端类型（`src/types/`）手写，与 OpenAPI 同名，不引入生成器 | frontend 确认点 4 | POC 采纳。类型文件头注明对应的 OpenAPI 版本；契约每次变更时，frontend 必须同步核对 | ✅ DL 采纳建议（2026-11-10） |
| F-03 | 页面启动时 GET 返回 404 以外的失败（5xx、网络错误），显示可重试的错误态，不当作空态 | frontend 确认点 5 | 采纳。这样可以避免用户误以为没有草稿而重新上传，把真实草稿覆盖掉 | ✅ DL 采纳建议（2026-11-10） |
| F-04 | 上传 75 秒超时后，backend 其实可能已经成功：O-03 删掉了旧草稿，但浏览器没收到新 Cookie，之后 GET 会得到空态，新草稿成为孤儿 | frontend 确认点 6 | POC 接受。用户在重新上传前已经二次确认过覆盖，影响只是需要再上传一次；孤儿草稿由 7 天清理兜底 | ✅ DL 采纳建议（2026-11-10） |
| F-05 | 前端本地错误码 `client_timeout`、`network_error`、`unknown_error`，不混入 backend 的错误码枚举 | frontend 设计决策 | 采纳 | ✅ DL 采纳建议（2026-11-10） |

> 状态：G-01、G-02、F-01..F-05 已裁决（2026-11-10）；frontend Step 2.2 评审通过（G-01/G-02 待 OpenAPI 0.1.1 落实）。
> 处理方式：G-01、G-02 由 backend 修订 OpenAPI 到 0.1.1（只改描述和校验规则，不改结构，属于兼容修订）。backend 正在做 Step 3，等它这一轮结束后再下发，避免打断。frontend 的 Step 2.2 评审在 G/F 项裁决后通过；修订完成后，frontend 用 0.1.1 的 `pattern` 实现邮箱即时校验。

---

## 契约变更：OpenAPI 0.1.1（2026-11-10）

> 合并三项兼容修订：只增加校验约束和澄清描述，不改接口结构、字段名和业务码。

| # | 变更 | 来源 | 裁决 |
|---|---|---|---|
| G-01 | `email` 增加 `pattern: '^[^\s@]+@[^\s@]+\.[^\s@]+$'`、`maxLength: 254` | 第二轮契约审视 | ✅ 已裁决（采纳建议） |
| G-02 | `phone` 的 `pattern` 针对提交值；客户端提交前必须去掉空格和连字符，backend 校验前同样去掉作为兜底 | 第二轮契约审视 | ✅ 已裁决（采纳建议） |
| CR-01 | 补充 `maxLength` / `maxItems`：`name` ≤ 100、`phone` ≤ 32、`email` ≤ 254、其他标量 ≤ 500、`self_evaluation` ≤ 5000；文本列表 ≤ 50 项、每项 ≤ 1000；经历区块 ≤ 20 条；超限时 `details.reason = too_long` | backend `04_design/design.md` 附录 B | ✅ DL 采纳建议（2026-11-10） |

> 落地复核（2026-11-10，主 agent）：OpenAPI 0.1.1 校验通过；G-01、G-02 和 CR-01 的顶层字段值与上表一致。**差异**：经历区块（WorkExperience / ProjectExperience / Education）内部字符串取 `maxLength: 2000`，`responsibilities` / `achievements` 取 `maxItems: 30`，来自 backend design 附录 B 的原始申请，上表未单列。见 CR-01a，待裁决。
>
> | # | 问题 | 建议 | 裁决 |
> |---|---|---|---|
> | CR-01a | 经历区块内部字段上限沿用 2000 / 30（比顶层"其他标量 ≤ 500"宽） | 采纳 OpenAPI 现值：项目背景、成果等长文本需要更大空间；OpenAPI 是唯一来源，本表据此补录 | ✅ DL 采纳建议（2026-11-10） |

> frontend 即时校验直接复用 0.1.1 中的 `pattern` / `maxLength` / `maxItems`；backend 修订后用 `openapi-spec-validator` 校验，由主 agent 复核。

---

## Dev Lead 确认

> 填写所有裁决项后，在此处签署确认：

- [x] 所有 API 契约不一致已处理
- [x] 数据模型不一致已处理
- [x] 责任边界无真空（或已明确分配）
- [x] 技术风险合并评估已完成
- [x] 术语问题已标注处理方向

**确认人**：Yin Yang（Dev Lead，对话中确认"接纳建议"）  **确认日期**：2026-11-10
