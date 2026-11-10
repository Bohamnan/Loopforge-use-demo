# backend Workbench — 模块探索参考

> 本文件由 module-explorer 在 role=backend 时加载，回答"本 Workbench 优先探索什么、怎么定位"，
> 与 SKILL.md 的探索方法配合使用。具体仓库结构以 `{code_roots.backend}/AGENTS.md` 为准。

---

## 1. 探索策略（对应 SKILL.md Step 1）

分层：api → services → repositories / clients；schemas 贯穿各层。目录：`src/app/{api,services,repositories,clients,schemas,core}`。

- 优先探索目标：services（业务流程编排）→ api（入参校验与响应）→ repositories（存储读写）→ clients（对外调用）。
- 关注重点：确认后才入库的流程、简历记录与原始文件的关联、对外调用链路（超时、重试、异常转换）、敏感数据是否外传。

---

## 2. 定位命令（对应 SKILL.md Step 1）

```
grep -rn "{keyword}" src/ --include=*.py
find src/app/api -name "*.py" -not -path "*/__pycache__/*"
```

入口目录：`src/app/api/`。
