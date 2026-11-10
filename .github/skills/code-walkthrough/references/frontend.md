# frontend Workbench — 代码走读分段范式参考

> 本文件由 code-walkthrough 在 role=frontend 时加载，回答"本 Workbench 改动按什么逻辑线分段走读"，
> 与 SKILL.md 的 Step 1（走读地图）配合使用。具体仓库结构以 `{code_roots.frontend}/AGENTS.md` 为准。

---

## 本 Workbench 分段逻辑线（对应 SKILL.md Step 1）

顺着一次用户操作的链路分段，不按文件字母序：

用户操作 → 组件事件 → hook → api 封装 → 接口返回 → 渲染

多个页面或组件的改动先按页面/组件聚类，再在每组内按上述链路分段。

额外关注的决策点/风险点：

- 加载态、错误态、空数据展示是否都有处理。
- 校对确认流程：用户明确确认前不得提示"已保存"（F-03）。
- 组件内是否绕过 api 封装直接请求接口。
- 是否在浏览器或控制台留存了敏感数据。
