# frontend Workbench — 模块探索参考

> 本文件由 module-explorer 在 role=frontend 时加载，回答"本 Workbench 优先探索什么、怎么定位"，
> 与 SKILL.md 的探索方法配合使用。具体仓库结构以 `{code_roots.frontend}/AGENTS.md` 为准。

---

## 1. 探索策略（对应 SKILL.md Step 1）

分层模式：pages → components → hooks → api 封装层；目录 `src/{pages,components,hooks,api,types}`。

- 优先探索目标：从 pages 切入看页面编排，再看 components 的展示与交互，然后是 hooks 的状态与副作用，最后是 api 封装层的接口调用。
- 关注重点：加载态、空态、错误态的处理；接口入参出参；字段命名与业务术语的对应；错误如何经 api 层转换。

---

## 2. 定位命令（对应 SKILL.md Step 1）

```
grep -rn "{keyword}" src/ --include=*.ts --include=*.tsx
```

入口目录 `src/`，按 `pages`、`components`、`hooks`、`api`、`types` 分别展开。
