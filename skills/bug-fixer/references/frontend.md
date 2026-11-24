# frontend Workbench — Bug 修复定位/验证参考

> 本文件由 bug-fixer 在 role=frontend 时加载，回答"本 Workbench 怎么定位代码、怎么跑回归"，
> 与 SKILL.md 的 Phase 1 / Phase 3 配合使用。具体仓库结构以 `{code_roots.frontend}/AGENTS.md` 为准。

---

## 1. 代码定位命令（对应 SKILL.md Phase 1）

```
grep -rn "{keyword}" src/ --include=*.ts --include=*.tsx
```

关键词可取组件名、接口路径、页面关键词。入口目录 `src/{pages,components,hooks,api,types}`；排查数据流时顺着 pages → components → hooks → api 封装层查找。

---

## 2. 回归验证命令（对应 SKILL.md Phase 3）

- 只跑相关测试：`npx vitest run {file}`
- 全量测试：`npm test`
- 静态检查：`npm run lint`（格式检查随 lint，不单设格式化命令）
- 构建检查（无对应测试时兜底）：`npm run build`
- 依赖安装：`npm ci`
