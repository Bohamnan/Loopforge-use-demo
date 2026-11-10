# 接口消费设计 — 简历信息收集（Frontend）

## 文档版本

| 版本 | 日期 | 修改说明 | 作者 |
|------|------|----------|------|
| v0.1 | 2026-11-10 | 初始版本（architecture-advisor Step 2.2），基于 OpenAPI 0.1.0（已冻结） | Yin Yang（frontend） |
| v0.2 | 2026-11-10 | 契约版本 0.1.0 → 0.1.1：G-01 邮箱 `pattern` + `maxLength 254` 已落地，七、G-01 缺口关闭；G-02 手机号 pattern 作用于提交值（先去空格与连字符，原值 `maxLength 32`）；CR-01 / CR-01a 长度与条数上限见 design.md §6.1；十、Q-01..Q-06 已裁决（F-01..F-05、G-01、G-02） | OpenAPI 0.1.1 |

> **输入**：`backend-docs/HR_PR-1/03_api/openapi.yaml`（**唯一契约来源**，info.version 0.1.1）、`api_design_resume.md`（仅作设计说明参考，字段级以 openapi.yaml 为准）、`01_requirements/requirements.md`（REQ-FE-01..06）、裁决 C-xx / D-xx / O-xx、`rules/frontend/api.md`、`codes/hr-collection-agent-frontend/AGENTS.md`。
> **引用不复制**：字段、类型、错误码清单不在此重抄，只写前端如何消费、状态如何映射、哪里需要前端自有决策。
> **状态**：评审通过（2026-11-10，G-01 / G-02 / F-01..F-05 已裁决）；契约版本 0.1.1。

## Step 2.1 适用性判定

**跳过。** frontend 无数据存储职责（`references/frontend.md` §0）：数据以 backend 为准，浏览器不持久化简历或校对内容（F-02）。不产出 `02_schema/`。简历数据在前端只存在于 `useState` / `useReducer` 运行时内存。

---

## 一、消费的接口清单

| # | 方法 + 路径（operationId） | 前端用途 | 关联 REQ-FE | 成功响应 | 前端幂等性 / 重试 |
|---|---|---|---|---|---|
| 1 | `POST /api/v1/resume-drafts`（createResumeDraft） | 上传并同步解析，创建草稿；重新上传即覆盖 | 01、02 | 201 `DraftResponse` | 非幂等；不自动重试，用户重新上传；请求进行中禁止再次提交 |
| 2 | `GET /api/v1/resume-drafts/current`（getCurrentResumeDraft） | 页面启动恢复草稿 | 05、02 | 200 `DraftResponse`；404 `draft_not_found` = 空态 | 安全方法；启动失败可手动重试 |
| 3 | `PATCH /api/v1/resume-drafts/current`（updateCurrentResumeDraft） | 提交校对（修正/补充/确认字段，部分更新） | 03 | 200 `DraftResponse` | 幂等；失败可手动重试；同一时刻只允许一个在途请求 |
| 4 | `POST /api/v1/resumes`（createResume） | 最终确认并保存 | 04 | 201 新增 / 200 已保存过，均为 `CreateResumeResponse` | 幂等（backend 幂等键）；失败/超时可直接重试，不查询状态（C-05） |

OpenAPI 无其他接口；已确认**不存在**丢弃草稿接口和保存状态查询接口（C-07、C-05），前端不得调用或假设它们。

---

## 二、公共消费约定

### 2.1 请求封装（api 层唯一出口）

- 前缀 `/api/v1`；所有调用经 api 封装层（基于 fetch），页面、组件、hook 不直接 `fetch`（红线）。
- `credentials: 'same-origin'` 显式设置（C-06）。不使用 `include`，不依赖 CORS。前端不读取、不存储 `draft_token`（HttpOnly，F-02）。
- JSON 请求体设 `Content-Type: application/json`；上传用 `FormData`，字段名 `file`，**不手动设置 multipart 的 Content-Type**（由浏览器生成 boundary）。
- 响应字段 snake_case 原样保留，不在 api 层转 camelCase（类型与契约一致，AGENTS.md「类型与 OpenAPI 一致」）。

### 2.2 超时

| 请求 | 超时 | 依据 |
|---|---|---|
| `POST /resume-drafts` | **75 秒** | C-08；backend 模型调用 60 秒，留 15 秒给上传与网络 |
| 其余三个 | **30 秒** | 前端自有决策（OpenAPI 仅说明“其他接口无长耗时”，未给数值），待 DL 确认，见「十、需 DL 确认」 |

用 `AbortController` 实现。超时抛出前端本地错误 `client_timeout`（不属于 backend `ErrorCode`，在类型中单独成员，避免混入契约枚举）。

### 2.3 统一错误解析

api 层把所有失败转换为同一个 `ApiError`，界面只面对它：

| 来源 | ApiError 内容 | 说明 |
|---|---|---|
| HTTP 非 2xx 且响应体是错误体 | `status`、`code`、`message`、`request_id`、可选 `details[{field, reason}]` | 按 OpenAPI `ErrorResponse` 解析 |
| HTTP 非 2xx 但响应体不是 JSON 或缺字段（如代理层返回的 413/502/504 页面） | `code = 'unknown_error'`，`message` 用前端固定通用文案 | 不展示原始响应体；不假设一定有错误体 |
| 请求超时 | `code = 'client_timeout'` | 见 2.2 |
| 网络失败（fetch reject，非超时） | `code = 'network_error'` | 通用“网络异常，请重试” |

规则：
- 界面**只展示** backend 的 `message`（B-03、`api.md` §3）；前端自有码（`client_timeout` / `network_error` / `unknown_error`）用前端固定文案。
- `details` 只取 `field` 与 `reason`，按 `reason` 映射前端文案（OpenAPI 只给枚举，文案由前端定义）；不假设 `details` 一定存在。
- 控制台与日志不输出请求体、响应体、文件名之外的简历内容；错误日志只允许 `request_id`、`code`、HTTP 状态（B-03、REQ-FE-06.3）。
- 页面打开时 `GET .../current` 返回 404 `draft_not_found` **不记错误日志**（O-12）。

### 2.4 Cookie 与 Vite dev proxy

- Cookie `draft_token`（`HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`，不含 `Domain`、不强制 `Secure`）由浏览器自动携带；`GET .../current` 与 `PATCH .../current` 成功时 backend 会滑动续期（O-01），上传成功时下发新令牌，`POST /resumes` 成功时使令牌过期（C-11）。前端对这些**无需任何代码**，也不要求读取。
- Vite `server.proxy['/api']`：`target` 指向 backend（本地 `http://localhost:8000`，见 OpenAPI `servers`）。要求：
  - 保留 `Set-Cookie`，不配置 `cookieDomainRewrite` / `cookiePathRewrite`（Cookie 无 Domain，Path 为 `/`）；
  - 不设置短于 75 秒的代理超时；
  - multipart 请求体原样透传。
- 浏览器从 dev server 端口访问，对 Cookie 而言与 `/api` 同源，所以 `SameSite=Lax` 与 `same-origin` 均成立（C-06）。

### 2.5 重试策略

- api 层**不做任何自动重试**。
- `POST /resumes`：用户可直接再次点击确认（幂等）；超时或网络失败不得提示成功（F-03）。
- `PATCH`：用户可重试；若前一个 PATCH 未结束则排队，不并发（见设计决策 DD-07）。
- `POST /resume-drafts`：重试 = 用户重新选择文件上传。

---

## 三、各接口消费设计

### 3.1 `POST /resume-drafts`（REQ-FE-01、02）

**请求**：`multipart/form-data`，字段 `file`。

**上传前预校验**（仅为体验，backend 为准，REQ-FE-01.2）：
- 只允许单个文件；扩展名 `.pdf` `.jpg` `.jpeg` `.png`（大小写不敏感），MIME 为 `application/pdf` / `image/jpeg` / `image/png` 之一；
- 大小 ≤ 10485760 字节；大小为 0 的文件拦截（对应 `file_empty`）；
- 预校验通过不代表 backend 通过：魔数由 backend 判断（`file_content_mismatch`）。

**成功（201）**：以响应 `DraftResponse` 整体替换运行时草稿状态（旧草稿已被 backend 删除或兜底清理，前端不需处理）。浏览器自动接收新 Cookie。

**失败处理**：

| code | HTTP | 界面处理 |
|---|---|---|
| `file_missing` `file_empty` `file_content_mismatch` `file_too_large` `unsupported_file_type` | 400/413/415 | 展示 `message`，保留在上传态，可重新选择；**不改变现有草稿**（O-02） |
| `parse_failed` | 502 | 展示 `message`（更换文件重传） |
| `parse_unavailable` | 503 | 展示 `message`（阻断，稍后重试；不暗示可换方式解析，ADR-001） |
| `parse_timeout` | 504 | 展示 `message`，提示重新上传 |
| `client_timeout`（75s） | — | 提示重新上传（C-08、REQ-FE-01.4）；不假设草稿是否已创建 |
| `network_error` `unknown_error` `internal_error` | — / 500 | 通用错误文案，可重新上传 |

任何失败都**不清空当前已展示的草稿**（O-02：失败不动旧草稿与 Cookie）。

**覆盖二次确认**（REQ-FE-01.5）：仅当运行时已存在草稿时，选择文件后先弹出确认；确认后才调用接口。运行时没有草稿（启动 GET 为空态）则直接上传。

### 3.2 `GET /resume-drafts/current`（REQ-FE-05）

- 页面启动调用一次。无请求体。
- **200**：自动恢复，展示全部字段与状态；`expires_at` 可选展示“草稿保留至…”（非 AC 要求，是否展示留 Step 3）。
- **404 `draft_not_found`**：api 层返回 `null`（不抛错、不记日志，O-12）；界面进入空态，引导上传（REQ-FE-05.3）。令牌缺失、无效、已过期、保存后作废，在界面上无需区分。
- **其他失败**（500、网络、超时、非 JSON）：**不当作空态**。展示可重试的错误态，避免用户误以为没有草稿而重新上传覆盖（设计决策 DD-04，待 DL 确认）。

### 3.3 `PATCH /resume-drafts/current`（REQ-FE-03）

**请求体**：`{ fields: ResumeFieldsUpdate }`，只含有变化或被确认的字段。

**语义**（以 OpenAPI 为准，前端据此组织提交）：
- 请求里出现的字段一律置为 `confirmed`；未出现的保持原值与原状态。因此“确认某字段”= 把该字段当前值放进请求。
- 标量可提交 `null` 表示“确认留空”（核心三项除外）；列表区块提交 `[]` 表示“确认留空”。
- 工作经历、项目经历、教育背景及文本列表（`strengths` `skills` `certificates_honors` `languages`）为**整体替换**，块只有一个整体状态（O-11）。界面可逐条展示与编辑，但提交时必须带**完整的新列表**，确认以**整块**为单位。
- 子项无 id，`details[].field` 形如 `work_experiences[0].start_date`，用下标定位到界面中的那一行。

**核心三项的即时校验**（REQ-FE-03.4、03.5）：
- `name`、`phone`、`email`：不可为空字符串（`minLength: 1`）；全空白视为空，前端先 trim 判断。
- `phone`：校验前**先去除空格与连字符**，再用 OpenAPI 的 `ResumeFieldsUpdate.phone.pattern` `^(1\d{10}|\+\d{6,15})$`（O-05，唯一来源）。pattern 在前端以常量引用，代码注释标注来源；契约变更时同步。测试样例用 OpenAPI 给出的 `13800138000`、`+85212345678` 及反例。
- `email`：按 OpenAPI 0.1.1 `ResumeFieldsUpdate.email`：`pattern` `^[^\s@]+@[^\s@]+\.[^\s@]+$`、`maxLength` 254（G-01，唯一来源）；pattern 以常量引用并注明来源。长度 / 条数上限同样取自 OpenAPI，见 design.md §6.1。
- 格式不合法：就地提示字段并禁用相关提交/最终确认（D-06）。

**成功（200）**：用响应的 `DraftResponse` 整体替换本地草稿（以 backend 返回的值与状态为准，前端不自行推断状态）。

**失败处理**：

| code | 界面处理 |
|---|---|
| `validation_failed`（422） | 按 `details[{field, reason}]` 在字段旁展示；`reason` 到文案：`required`=必填，`invalid_format`=格式不正确，`invalid_type`=类型不符，`too_long`=内容过长，`unknown_field`=内部错误（前端不应提交未定义字段，按通用错误处理并报告 request_id）。不回显值 |
| `draft_not_found`（404，PATCH 场景） | 提示“草稿已失效，请重新上传简历”，运行时草稿清空，回到空态（O-10） |
| 其他 | 通用错误文案，保留本地编辑内容并允许重试 |

### 3.4 `POST /resumes`（REQ-FE-04）

**请求体**：`{ confirmed: true }`。只在用户点击独立的“最终确认”后发送（B-04、F-03）。

**前置（前端侧，REQ-FE-04.1/04.2）**：姓名、手机号、邮箱齐全、格式合法，且这三项状态为 `confirmed`，最终确认才可点击。若仍有其他未确认字段，先提示，用户继续即视为确认当前显示的全部内容（D-03）；此时 backend 按草稿当前值保存。进行中按钮禁用（REQ-FE-04.8）。

**响应处理**（只依赖 `already_saved`，不看 HTTP 201/200，O-08）：

| 结果 | 界面 |
|---|---|
| 成功，`already_saved = false` | 显示“已保存”，提供“上传下一份”，清空运行时简历内容（REQ-FE-04.3/04.4） |
| 成功，`already_saved = true` | 只显示“该简历已保存过”文字提示，不展示已有记录内容（D-04、REQ-FE-04.5）；同样提供“上传下一份”并清空内容 |
| `draft_not_found`（404，确认场景） | 提示“可能已保存，请重新上传核实”（D-01、O-10、REQ-FE-04.7）；不显示成功 |
| `validation_failed`（422，带 details） | 就地标出字段并回到校对（草稿中的模型值格式可能不合法） |
| `confirmation_required`（422） | 视为前端缺陷：通用错误文案并带 request_id；不应出现 |
| `save_failed`（500） | 展示 `message`，草稿保留，可直接重试 |
| `client_timeout` / `network_error` / `internal_error` / `unknown_error` | **不提示成功**；允许直接重试确认；不调用任何状态查询（C-05、REQ-FE-04.6） |

`resume_id`、`saved_at` 不是界面必需，可不展示；不得将 `resume_id` 写入浏览器存储。

---

## 四、类型对齐策略

按 AGENTS.md「类型与 OpenAPI 契约一致、以接口契约命名」，**手写** `src/types/`，与 OpenAPI schema 同名，不引入类型生成依赖（设计决策 DD-01）。

| OpenAPI schema | TS 类型（同名） | 位置 |
|---|---|---|
| `FieldStatus` `StringField` `StringListField` 及三个经历列表字段 | 同名 | `src/types/` 简历模型相关 |
| `WorkExperience` `ProjectExperience` `Education` | 同名 | 同上 |
| `ResumeFields`（22 个字段，每个带值与状态） | 同名 | 同上 |
| `ResumeFieldsUpdate`（部分更新，无状态） | 同名 | 同上 |
| `OriginalFileInfo` `DraftResponse` `DraftUpdateRequest` | 同名 | 草稿相关 |
| `CreateResumeRequest` `CreateResumeResponse` | 同名 | 保存相关 |
| `ErrorCode` `ErrorDetail` `ErrorResponse` | 同名；`ApiError` 为前端类，另含前端自有码 | 错误相关 |

对齐规则：
- 22 个字段键、`FieldStatus` 四值、`ErrorCode` 十三值、`reason` 五值、10485760 上限，均与 OpenAPI 一致；
- 标量允许 `null`（`type: [string, 'null']`）要在 TS 中体现为 `string | null`；
- 契约变更（须经 cross-workbench-reviewer）时，先更新本节对照与 types，再改调用代码；
- 具体文件拆分在 Step 3 §3 中确定，本文不预设文件名。

---

## 五、A..F 信息需求覆盖情况

| 编号 | 需求项 | 状态 | 位置 |
|---|---|---|---|
| A | 接口清单、方法、用途 | ✅ 全部由 OpenAPI 提供（4 个接口） | 一、三 |
| B | 请求/响应类型、字段、字段状态 | ✅ 22 字段、FieldStatus 4 值、列表整体状态、多条子项结构（无 id）均已确定 | 三、四 |
| C | 业务码、错误体、`details` | ✅ 13 个业务码、`details` 与 5 个 `reason`、字段路径格式；HTTP 状态按接口给出 | 二 2.3、三 |
| D | 幂等与“已保存过” | ✅ `already_saved` 字段（200/201 仅作参考）、规范化由 backend 完成 | 三 3.4 |
| E | Cookie 行为 | ✅ 属性、签发/续期/作废时机、同源、proxy 要求 | 二 2.4 |
| F | 其他约定 | ✅ 全部已提供：文件规则、模型超时 60s、手机号与邮箱 pattern（0.1.1）、字段长度 / 条数上限（CR-01 / CR-01a）；非上传接口超时 30s 为前端自有决策（F-01 已采纳） | 七、十 |

---

## 六、设计决策

| 编号 | 决策项 | 决策 | 理由 | ADR |
|---|---|---|---|---|
| DD-01 | 类型来源 | 手写 `src/types/`，同名对照 OpenAPI | 契约小（4 接口），避免引入生成器依赖；同名对照 + 契约变更流程保证一致 | 无（未达门槛） |
| DD-02 | 404 处理 | `GET .../current` 的 404 在 api 层返回 `null`；其余接口的 404 抛 `ApiError`，由调用方按接口选文案 | O-10、O-12；同一业务码在三个接口含义不同，api 层不写文案 | 无 |
| DD-03 | 成功判定 | “已保存/已保存过”只依据 `already_saved`，不依据 HTTP 状态 | O-08 | 无 |
| DD-04 | 启动失败 | 启动 GET 的非 404 失败进入可重试错误态，不退化为空态 | 避免误导用户重新上传并覆盖仍存在的草稿 | 无 |
| DD-05 | 超时 | 上传 75 秒；其他三个 30 秒；`AbortController`；本地错误码 `client_timeout` | C-08；其余为前端自有决策 | 无 |
| DD-06 | 重试 | api 层不自动重试，只做手动重试 | 上传非幂等；确认与更新幂等但由用户触发更可控；不做保存状态查询（C-05） | 无 |
| DD-07 | PATCH 并发 | 同一时刻只允许一个在途 PATCH，后续请求排队 | PATCH 是部分更新且响应整体替换本地状态，并发会让较早响应覆盖较新状态 | 无 |
| DD-08 | 手机号提交值 | 提交去除空格与连字符后的值 | pattern 作用于规范化后的值；见「十」确认 | 无 |
| DD-09 | 错误文案 | 只展示 backend `message`；前端自有码用固定文案；`details.reason` 由前端映射文案 | B-03；OpenAPI 只给枚举 | 无 |
| DD-10 | 非 JSON 错误 | 代理或网关返回的非 JSON 失败统一为 `unknown_error` | 同源经 proxy，413/502/504 可能不是应用错误体 | 无 |
| DD-11 | 草稿丢失文案 | PATCH 的 `draft_not_found` 回到空态；确认的 `draft_not_found` 不回空态，提示核实 | O-10；确认场景可能已保存 | 无 |

> 以上决策均不影响其他 Workbench、不引入新技术组件、不偏离约束，按「ADR 门槛」不起草 ADR；Step 3 统一再扫描一次。

---

## 七、契约缺口

| 编号 | 缺口 | 影响的 AC | 当前处理 |
|---|---|---|---|
| G-01 | ~~邮箱校验规则未在 OpenAPI 给出~~ | REQ-FE-03.5、REQ-FE-04.1 | ✅ 已关闭：OpenAPI 0.1.1 补充 `pattern` 与 `maxLength 254`，前端即时校验使用同一规则 |

除此以外，未发现 OpenAPI 无法满足的 REQ-FE 验收标准。

---

## 八、REQ-FE 追溯

| 需求 | 本文覆盖点 |
|---|---|
| REQ-FE-01（上传） | 3.1；2.2；2.3 |
| REQ-FE-02（展示结果） | 3.1 成功、3.3、四（FieldStatus 与 22 字段） |
| REQ-FE-03（逐项校对） | 3.3；四；七 G-01 |
| REQ-FE-04（确认保存） | 3.4；2.5 |
| REQ-FE-05（草稿恢复） | 3.2；2.4 |
| REQ-FE-06（安全与规范） | 2.1、2.3、2.4、四；DD-01、DD-09 |

---

## 九、与架构约束 / 红线核对

| 约束 | 结论 |
|---|---|
| F-01 只通过 backend、api 层唯一出口 | ✅ 2.1 |
| F-02 不使用浏览器本地存储、不读令牌 | ✅ 2.1、2.4、3.4（不存 `resume_id`） |
| F-03 成功前不提示已保存 | ✅ 3.4；超时/网络失败不提示成功 |
| B-03 日志不含简历内容 | ✅ 2.3 |
| HLD §5 前端约束 | ✅ 无冲突 |
| ADR-001..003 | ✅ 无冲突（503 不暗示其他解析方式；同步；草稿 Cookie） |

---

## 十、DL 确认事项（均已裁决）

| 编号 | 问题 | 建议 |
|---|---|---|
| Q-01 | **G-01 邮箱规则**：由 backend 补 `pattern` 后前端复用，还是前端先采用一个暂行规则？ | ✅ 已裁决（2026-11-10）：由 backend 补充（保持“唯一来源”） |
| Q-02 | 非上传接口（GET/PATCH/POST resumes）前端超时 30 秒是否可接受？ | ✅ 已裁决（2026-11-10）：采纳 30 秒 |
| Q-03 | 手机号提交值：前端提交去除空格与连字符后的值，backend 是否同样接受带空格的原值？ | ✅ 已裁决（2026-11-10）：提交规范化值 |
| Q-04 | 类型手写还是由 OpenAPI 生成（DD-01） | ✅ 已裁决（2026-11-10）：手写 |
| Q-05 | 启动 GET 的非 404 失败进入可重试错误态而非空态（DD-04） | ✅ 已裁决（2026-11-10）：采纳 |
| Q-06 | 75 秒超时后若 backend 实际已成功：旧令牌对应的旧草稿可能已被 O-03 删除，而浏览器仍持旧令牌，之后 GET 得到空态。是否接受？ | ✅ 已裁决（2026-11-10）：接受（POC，用户本就是在重新上传） |
