---
name: 项目术语表
description: 项目标准业务术语。由 requirement-kickoff、requirements-analyst 和 module-explorer 在执行过程中增量填充。
type: reference
---

# 项目术语表

> 本文件通过 Skill 执行增量填充。
> 写入时机：requirement-kickoff 业务澄清发现新业务术语、requirements-analyst 技术汇总发现新技术术语、module-explorer 探索模块发现业务概念时追加（草稿，人工确认后生效）。

<!-- draft -->

---

| 术语 | 定义 | 来源模块/文档 | 写入日期 |
|------|------|------------|---------|
| 简历模型 | 系统预设的简历结构化字段集合，以 `global-info/简历模板.md` 为准：姓名、求职意向、联系方式、个人信息、个人优势、工作经历（多条）、项目经历（多条）、教育背景（多条）、专业技能、证书与荣誉、语言能力（独立分类）、自我评价（可选）。解析结果按它整理、校对和保存（2026-11-10 按 HR_PR-1 C-14 修订） | project-brief.confirmed.yaml:glossary_seed；HR_PR-1 cross-workbench-review C-14 | 2026-11-10 |
| 原始文件 | 用户上传的简历文件（PDF、照片等），保存在项目 file 目录下，并与对应的简历记录关联 | project-brief.confirmed.yaml:glossary_seed | 2026-11-10 |
| 校对 | 系统把解析结果按简历模型逐项展示，用户在对话中修正并确认的过程；确认后才保存 | project-brief.confirmed.yaml:glossary_seed | 2026-11-10 |
| 未确认草稿 | 解析后、用户确认前暂存在服务端临时存储（独立 SQLite 文件，与正式库分离）的简历数据；7 天无活动后清理，不写入浏览器本地 | HR_PR-1 requirements（C-12、ADR-003） | 2026-11-10 |
| 草稿访问令牌 | 经 `HttpOnly; SameSite=Lax` Cookie 下发的随机令牌，7 天有效，仅用于同一浏览器定位未确认草稿；保存成功后作废 | HR_PR-1 requirements（C-06、C-11） | 2026-11-10 |
| 简历记录 | 用户明确确认后写入正式库、与原始文件一一关联的结构化简历；确认后不可修改 | HR_PR-1 requirements（C-02、C-11） | 2026-11-10 |
| 字段状态 | 简历模型每个字段的处理状态：`recognized`（已识别，待确认）/ `uncertain`（不确定）/ `missing`（缺失）/ `confirmed`（已确认） | HR_PR-1 requirements（C-04） | 2026-11-10 |
| 幂等键 | 规范化后的"姓名 + 手机号 + 邮箱"组合，用于判定同一个人的简历；同键再次确认时不新增记录，返回已有记录并带"已保存过"（`already_saved`）标识 | HR_PR-1 requirements（C-10、D-02、D-04） | 2026-11-10 |
