# HR_PR-1 跨 Workbench 一致性 Review 报告

**Review 人**：Yin Yang（来自 local_profile.yaml，role: dev-lead）
**生成日期**：2026-11-10（AI 草稿；Dev Lead 已于 2026-11-10 完成裁决）
**参与 Workbench**：backend, frontend

> 比对依据：`backend-docs/HR_PR-1/00_impact_analysis.md`、`frontend-docs/HR_PR-1/00_impact_analysis.md`、PRD、HLD §4/§5/§8、`project_glossary.md`、`architectural_constraints.md`、`global-info/简历模板.md`。
> 两个仓库均为新项目、无源码、无 OpenAPI，本报告只比对两份分析文档的口径，不涉及代码级核实。
> 按 Skill 原则，各 Workbench「待澄清问题」不在本报告裁决范围，由 requirements-analyst 第二轮 Q&A 处理；本报告仅在其造成跨 Workbench 口径不一致时引用。

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
| C-01 | **PDF 如何送入模型**（阻断 ADR-001 原路径） | Q-backend-01（需重开）、R-01、ADR-001 | 方案 a：backend 本地将 PDF 逐页渲染为 PNG 后按图片送模型（非 OCR，仍由模型直接理解，需新增 PDF 渲染依赖）；方案 b：提取 PDF 文本层后送模型（扫描件 PDF 无文本层会失败）；方案 c：首期只支持照片，PDF 范围外。a 最贴近 ADR-001 意图，但需修订 ADR-001 措辞并限制页数 | DL | ✅ DL 裁决（2026-11-10）：已经实测验证 `deepseek-flash` 支持 PDF 直接输入，维持 ADR-001 原路径，不做 PDF 转图片或文本提取。注：公开文档列出的格式只有图片，以 DL 的实测结论为准；backend 实现首个 spike 时须保留调用证据 |
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

---

## Dev Lead 确认

> 填写所有裁决项后，在此处签署确认：

- [x] 所有 API 契约不一致已处理
- [x] 数据模型不一致已处理
- [x] 责任边界无真空（或已明确分配）
- [x] 技术风险合并评估已完成
- [x] 术语问题已标注处理方向

**确认人**：Yin Yang（Dev Lead，对话中确认"接纳建议"）  **确认日期**：2026-11-10
