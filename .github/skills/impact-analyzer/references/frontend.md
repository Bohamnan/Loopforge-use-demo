# frontend Workbench — 影响分析代码定位参考

> 本文件由 impact-analyzer 在 role=frontend 时加载，回答"本 Workbench 怎么定位与 PRD 相关的代码"，
> 与 SKILL.md 的 Step 1 配合使用。具体仓库结构以 `{code_roots.frontend}/AGENTS.md` 为准。

---

## 代码定位策略（对应 SKILL.md Step 1）

```
grep -rn "{keyword}" src/ --include=*.ts --include=*.tsx
```

关键词可取 PRD 中的页面关键词、组件名、接口路径。入口目录 `src/{pages,components,hooks,api,types}`。

入口优先：pages → components → hooks → api 封装层。
