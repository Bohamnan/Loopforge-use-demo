---
span
---
# 架构约束

> 每条约束标注级别（BLOCK/WARN）和来源，确保约束可追溯、可裁决。
> 由 Dev Lead 在 architecture-advisor 执行中维护。
> 来源 id 指 project-brief.confirmed.yaml 中的约束编号或键名。

<!-- draft -->

---

## 跨 Workbench 通信约束

| 约束 | 级别 | 来源 | 说明 |
| ---- | :--: | ---- | ---- |
| frontend 只通过 backend 提供的 HTTP 接口取数，不直连外部服务、不直连存储 | BLOCK | cross_workbench.dependency | 通用预设，用户确认 |
| backend 维护接口契约（OpenAPI），frontend 按契约开发 | BLOCK | cross_workbench.contract_owner | 契约以 backend 为准 |
| 接口契约变更须经 cross-workbench-reviewer 审视后才能合入 | BLOCK | cross_workbench.contract_change | 框架自带 Skill 的使用方式 |

---

## 数据层约束

| 约束 | 级别 | 来源 | 说明 |
| ---- | :--: | ---- | ---- |
| 每条简历记录必须关联其原始文件（存放于项目 file 目录），保存记录与保存文件须保持一致，不得出现有记录无文件或有文件无记录 | BLOCK | backend B-05 | 用户补充：简历模型需保存上传原始文件与模型的关联 |
| 持久化实体带 id、created_at、updated_at | WARN | backend conventions.audit_fields | 通用惯例（随存储职责确认，SQLite） |

---

## 安全约束

| 约束 | 级别 | 来源 | 说明 |
| ---- | :--: | ---- | ---- |
| 密钥、凭证只放环境变量或配置中心，不进代码、日志、仓库、测试夹具 | BLOCK | backend B-01 / cross_workbench.secrets_rule | 通用安全规范 |
| 数据不得发往批准清单之外的外部服务；对外调用只经 clients 层 | BLOCK | backend B-02 | 批准清单由项目方提供；DeepSeek 是否在清单内待确认 |
| 日志与错误响应不得包含用户提交内容原文或敏感个人信息 | BLOCK | backend B-03 | 通用安全规范 |
| 简历属个人敏感信息：仅允许发送给批准清单内的模型服务；测试与样例只用合成或脱敏简历，不得提交真实简历 | BLOCK | backend B-06 | 通用数据安全要求 |
| 前端不得保存任何密钥或凭证，不得直连外部服务或存储 | BLOCK | frontend F-01 | 跨 Workbench 约定与通用安全规范 |
| 不在浏览器本地存储敏感数据 | WARN | frontend F-02 | 同 client_persistence |

---

## 业务约束

| 约束 | 级别 | 来源 | 说明 |
| ---- | :--: | ---- | ---- |
| 解析结果必须经用户在对话中确认后才能写入数据库；识别不到或不确定的字段必须请用户补充，不得猜测补全 | BLOCK | backend B-04 | 用户补充：与用户对话校对，信息确认后再保存 |
| 对话界面必须清楚展示待校对的解析结果，用户明确确认前不得提示“已保存” | BLOCK | frontend F-03 | 随 B-04：确认后才保存 |
| 发给 LLM 的单次请求体（含 base64 与文本）不得超过 1 MB；照片与 PDF 渲染页须先缩小分辨率、压成 JPEG，压到下限仍超限则返回 `parse_failed`，不外发 | BLOCK | DL 2026-11-10 | LLM 侧上限 1 MB；新增依赖 Pillow 已获批（精确版本，公共源） |
| TODO: 照片文字识别方式、DeepSeek flash 是否支持图像输入尚未核实 | — | backend key_dependencies | 待项目方核实后补充 |

---

## 约束变更记录

| 日期 | 变更内容 | 变更人 |
| ---- | -------- | ------ |
| 2026-11-10 | 初始化：由 project-brief.confirmed.yaml 生成草稿 | project-setup-brief |
| 2026-11-10 | 新增“LLM 请求体 ≤ 1 MB”约束；批准新增 Pillow | DL |
