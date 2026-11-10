# backend Workbench — 影响分析代码定位参考

> 本文件由 impact-analyzer 在 role=backend 时加载，回答"本 Workbench 怎么定位与 PRD 相关的代码"，
> 与 SKILL.md 的 Step 1 配合使用。具体仓库结构以 `{code_roots.backend}/AGENTS.md` 为准。

---

## 代码定位策略（对应 SKILL.md Step 1）

定位命令：

```
grep -rn "{keyword}" src/ --include=*.py
find src/app -name "*{模块名}*" -not -path "*/__pycache__/*"
```

入口目录：`src/app/api/`。

入口优先次序：api（路由与入参模型）→ services → repositories / clients；同时关注 schemas 与 `tests/` 中的相关测试。
