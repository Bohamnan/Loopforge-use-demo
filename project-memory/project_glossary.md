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
| 简历模型 | 系统预设的通用简历结构化字段集合，解析结果按它整理、校对和保存。拟含：基本信息、求职意向、教育经历、工作经历、项目经历、技能、证书、语言能力、自我评价 | project-brief.confirmed.yaml:glossary_seed | 2026-11-10 |
| 原始文件 | 用户上传的简历文件（PDF、照片等），保存在项目 file 目录下，并与对应的简历记录关联 | project-brief.confirmed.yaml:glossary_seed | 2026-11-10 |
| 校对 | 系统把解析结果按简历模型逐项展示，用户在对话中修正并确认的过程；确认后才保存 | project-brief.confirmed.yaml:glossary_seed | 2026-11-10 |
