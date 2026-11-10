# 需求文档 — 简历信息收集（Frontend）

## 文档版本

| 版本 | 日期 | 修改说明 | 作者 |
|------|------|----------|------|
| v1.0 | 2026-11-10 | 初始版本（requirements-analyst Step 2） | Dev Lead |

---

## 简介

本模块归属 frontend 应用 `hr-collection-agent-web`（TypeScript / React 18 / Vite / Ant Design），为提供简历的用户提供单页对话式流程：上传简历 → 展示识别结果 → 逐项校对 → 明确确认 → 反馈结果。

- 只通过 backend 接口取数，同源部署（localhost）；开发环境由 Vite dev proxy 转发 `/api`（C-06）。
- 状态只用 `useState` / `useReducer` 保存在运行时内存，不引入额外的状态管理库。
- 范围外：HR 查看与管理端、简历筛选、已确认记录的修改与删除。
- 依据：PRD `01-requirements/HR_PR-1/prd.md`；第一轮 Q&A Q1..Q8 与第二轮 TQ-01..TQ-13（`requirements_plan.md`）；HLD `solution-design.md`；跨 Workbench 裁决 C-01..C-15、D-01..D-06（`01-requirements/HR_PR-1/cross-workbench-review.md`）；影响分析 `00_impact_analysis.md`（v1.1）。

## 术语表

| 术语 | 说明 |
|------|------|
| 简历模型 | 以 `global-info/简历模板.md` 为准的结构化字段集合，"语言能力"为独立分类（C-14） |
| 原始文件 | 用户上传的简历文件（PDF、JPG/JPEG、PNG） |
| 校对 | 用户在对话中逐项确认、修正、补充字段的过程；确认后才保存 |
| 未确认草稿 ⬜ | 用户确认前由 backend 暂存的简历数据；前端只凭 Cookie 恢复，不在浏览器本地保存 |
| 字段状态 ⬜ | `recognized`（已识别，待确认）/ `uncertain`（不确定）/ `missing`（缺失）/ `confirmed`（已确认）（C-04） |
| 已保存过 ⬜ | backend 判定同一个人（姓名 + 手机号 + 邮箱）已有简历记录时返回的结果，带 `already_saved` 标识（C-10、D-04） |

> ⬜ = 新技术术语候选，待 Step 3 由 Dev Lead 逐条确认后写入 `project-memory/project_glossary.md`。

---

## 需求

### REQ-FE-01：上传 PDF 或照片简历

**用户故事：** 作为提供简历的用户，我希望在对话界面中上传简历文件，以便系统识别内容。

**关联 PRD：** 用户故事#1；Q2；TQ-02（C-08）、TQ-06（C-07）

#### 验收标准

1. THE 上传控件 SHALL 只允许选择单个 PDF、JPG、JPEG 或 PNG 文件。
2. IF 所选文件类型不支持或超过 10 MB, THEN THE 前端 SHALL 在上传前提示并阻止提交；backend 的校验结果为最终结论。
3. WHEN 文件提交上传, THE 前端 SHALL 显示单一加载提示，并在等待期间禁止重复提交。
4. IF 上传请求超过 75 秒未返回, THEN THE 前端 SHALL 结束等待，提示用户重新上传（C-08）。
5. WHEN 当前已有未确认草稿且用户选择重新上传, THE 前端 SHALL 先请用户二次确认将覆盖当前草稿，确认后才提交（C-07、S15）。
6. IF backend 返回上传错误（类型、大小、内容不符或模型不可用）, THEN THE 前端 SHALL 只展示错误体中的 `message`，不展示或记录文件内容。

---

### REQ-FE-02：展示简历模型识别结果

**用户故事：** 作为提供简历的用户，我希望清楚看到系统识别出的各项信息及其状态，以便知道哪些需要我处理。

**关联 PRD：** 用户故事#2；Q1、Q3；TQ-01（C-04、C-14）

#### 验收标准

1. WHEN 上传成功或草稿恢复成功, THE 前端 SHALL 按简历模型的全部分类展示字段，其中工作经历、项目经历、教育背景按多条展示。
2. THE 前端 SHALL 按字段状态区分展示：`recognized` 显示为"待确认"，`uncertain` 显示为"不确定、请确认"，`missing` 显示为"待补充"，`confirmed` 显示为"已确认"。
3. THE 前端 SHALL 不把 `recognized` 字段当作已确认展示，也不自行补全任何字段的值（B-04、C-04）。
4. THE 前端 SHALL 允许非核心字段为空，只把姓名、手机号、邮箱作为保存门槛。

---

### REQ-FE-03：对话式逐项校对

**用户故事：** 作为提供简历的用户，我希望系统逐项向我确认信息，我可以直接修正或补充。

**关联 PRD：** 用户故事#2、#3；Q3；TQ-04（C-03）、TQ-05（C-09）

#### 验收标准

1. THE 前端 SHALL 依据字段状态按固定顺序逐项提问，优先处理 `missing` 与 `uncertain` 字段，其次处理 `recognized` 字段（C-03）。
2. WHEN 用户对某一字段确认、修正或补充, THE 前端 SHALL 以结构化字段编辑的形式提交给 backend，并以 backend 返回的结果更新界面；其余字段保持原状态。
3. THE 前端 SHALL 支持对工作经历、项目经历、教育背景等多条子项进行新增、修改和删除。
4. WHEN 姓名、手机号或邮箱缺失, THE 前端 SHALL 引导用户补充。
5. WHEN 用户输入手机号或邮箱, THE 前端 SHALL 使用与 backend 相同的规则即时提示格式问题：手机号为 11 位大陆号或以 `+` 开头的国际号，邮箱只校验格式（C-09）。
6. IF backend 返回带 `details` 的字段级错误, THEN THE 前端 SHALL 在对应字段旁展示原因（D-06）。

---

### REQ-FE-04：明确确认并反馈保存结果

**用户故事：** 作为提供简历的用户，我希望只在我明确确认后才保存，并清楚知道保存结果。

**关联 PRD：** 用户故事#4；Q4；TQ-07（C-05、C-10）、TQ-08（C-11）、TQ-10..TQ-13（D-01、D-03、D-04、D-06）

#### 验收标准

1. THE 前端 SHALL 提供独立的"最终确认"操作；只有当姓名、手机号、邮箱齐全、格式合法并已确认时才可点击（D-03、D-06）。
2. WHEN 仍有未确认字段时用户点击最终确认, THE 前端 SHALL 先提示存在未确认字段；用户继续确认即视为确认当前显示的全部内容（D-03）。
3. THE 前端 SHALL 在 backend 返回保存成功之前，不显示"已保存"或任何成功提示，也不做乐观更新（F-03）。
4. WHEN backend 返回保存成功, THE 前端 SHALL 显示"已保存"，并提供"上传下一份"入口；同时清空运行时内存中的简历内容（C-11）。
5. WHEN backend 返回 `already_saved` 标识, THE 前端 SHALL 只显示"该简历已保存过"的文字提示，不展示已有记录的内容（D-04、S14）。
6. IF 确认请求超时或网络失败, THEN THE 前端 SHALL 不提示成功，并允许用户直接重试确认；不调用任何保存状态查询接口（C-05）。
7. IF backend 返回"草稿不存在或令牌无效"的业务码, THEN THE 前端 SHALL 提示"可能已保存，请重新上传核实"（D-01）。
8. THE 前端 SHALL 在确认请求进行期间防止重复点击。

---

### REQ-FE-05：草稿恢复

**用户故事：** 作为提供简历的用户，我希望关闭页面后在同一浏览器重新打开时，能继续未完成的校对。

**关联 PRD：** 用户故事#3（前提：用户可查看并回复校对问题）；Q6；TQ-03（C-06）、TQ-06（C-07）

#### 验收标准

1. WHEN 页面打开, THE 前端 SHALL 调用草稿读取接口；fetch 使用 `same-origin`，由浏览器自动携带 Cookie，前端不读取令牌（C-06）。
2. WHEN 存在可恢复的草稿, THE 前端 SHALL 自动恢复并展示其内容与字段状态（C-07）。
3. IF backend 返回"无可恢复草稿"（令牌缺失、无效或草稿已过期）, THEN THE 前端 SHALL 显示空态，并引导用户上传简历。

---

### REQ-FE-06：浏览器侧数据安全与接口规范

**用户故事：** 作为系统，我希望前端不保存敏感数据、不直连外部服务，并统一处理接口结果。

**关联 PRD：** 用户故事#1–#4（横切）；架构约束 F-01..F-03、B-03；`rules/frontend/api.md`；TQ-01（C-13）、TQ-09（C-15）

#### 验收标准

1. THE 前端 SHALL 只通过统一的 api 封装调用 backend `/api/v1` 接口，不持有任何凭证，不直连模型或其他外部服务（F-01）。
2. THE 前端 SHALL 不使用 localStorage、sessionStorage 或 IndexedDB 保存简历或校对内容（F-02）。
3. THE 前端 SHALL 不在控制台或日志中输出简历内容或接口响应体（B-03）。
4. THE 前端 SHALL 把错误统一解析为 `{code, message, request_id}`，以及可选的 `details: [{field, reason}]`（D-06）。
5. THE 前端的 types 与 api 层 SHALL 在 backend OpenAPI 草稿冻结后与之对齐；冻结前只搭骨架（C-13）。
6. THE 前端测试 SHALL 使用 Vitest 与 React Testing Library，代码检查使用 ESLint，测试数据只用合成简历（C-15、B-06）。

---

## 可追溯性矩阵

| 需求 | PRD 用户故事 | 驱动的 Q&A / 裁决 | 影响分析场景 |
|------|-------------|------------------|-------------|
| REQ-FE-01 | #1 | Q2、TQ-02、TQ-06、C-07、C-08 | S1、S2、S11、S12、S15 |
| REQ-FE-02 | #2 | Q1、Q3、TQ-01、C-04、C-14 | S3、S4 |
| REQ-FE-03 | #2、#3 | Q3、TQ-04、TQ-05、TQ-13、C-03、C-09、D-06 | S5、S6 |
| REQ-FE-04 | #4 | Q4、TQ-07、TQ-08、TQ-10、TQ-11、TQ-13、C-05、C-10、C-11、D-01、D-03、D-04 | S7、S8、S9、S14 |
| REQ-FE-05 | #3 | Q6、TQ-03、TQ-06、TQ-12、C-06、C-07、D-05 | S10、S13 |
| REQ-FE-06 | #1–#4（横切） | TQ-01、TQ-09、C-13、C-15、D-06、F-01..F-03 | — |

**覆盖率**：PRD 用户故事 4/4（100%）；影响分析场景 S1..S15 全部映射；第二轮 TQ 13/13 已落入 AC。无来源缺失项。

> 待开放项（不阻断需求确认）：影响分析中的"上传前校验口径细节"和"无障碍 / 浏览器兼容范围"仍未定义，留待 architecture-advisor 技术设计处理。
