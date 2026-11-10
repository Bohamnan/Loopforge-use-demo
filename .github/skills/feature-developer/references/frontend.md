# frontend Workbench — 功能开发参考

> 本文件由 feature-developer 在 role=frontend 时加载，回答"本 Workbench 具体怎么定位/实现/验证"，
> 与 SKILL.md 的 Gather-Act-Verify 循环配合使用。
> 注意：本文件是**Workbench 级**参考；具体仓库的结构与约定以 `{code_roots.frontend}/AGENTS.md` 为准（更细、更权威）。

---

## 1. GATHER 策略（对应 SKILL.md Step 1）

design.md 未给出路径时，用下面的命令搜索相关代码（入口目录 `src/{pages,components,hooks,api,types}`）：

```
grep -rn "{keyword}" src/ --include=*.ts --include=*.tsx
```

收集清单：

- 页面（`src/pages`）
- 相关组件（`src/components`）
- hook（`src/hooks`）
- api 封装（`src/api`）
- 类型定义（`src/types`，与 backend 契约对齐）
- 现有测试

---

## 2. ACT 实现顺序与分层职责（对应 SKILL.md Step 2）

分层模式：pages → components → hooks → api 封装层。

实现顺序（从底层到上层）：types → api 封装 → hook → components → pages。

各层职责：

- pages：页面编排与路由。禁止直接请求接口。
- components：展示与交互。禁止直接请求接口、持有业务规则。
- hooks：状态与副作用，调用 api 层。禁止操作 DOM 样式。
- api：封装对 backend 接口的调用与错误转换，是前端访问后端的唯一出口。

状态用 React 自带的 useState、useReducer，不引入状态管理库；组件库用 Ant Design（React 版）。

---

## 3. VERIFY 命令（对应 SKILL.md Step 3）

- 必须通过（失败即 BLOCK）：`npm run build`
- 尽力执行（失败按 SKILL.md 失败处理表）：
  - 只跑指定测试：`npx vitest run {file}`
  - 全量测试：`npm test`
  - 静态检查：`npm run lint`（格式检查随 lint，不单设格式化命令）
- 依赖安装：`npm ci`

---

## 4. Workbench 红线 / 边界检查清单（对应 SKILL.md Guardrail「高风险修改」「Workbench 模式混用」与 VERIFY 边界检查）

必须 BLOCK 的硬红线：

- F-01：不得保存任何密钥或凭证，不得直连外部服务或存储。
- F-03：对话界面必须清楚展示待校对的解析结果，用户明确确认前不得提示"已保存"。
- 页面、组件内不得直接请求接口，须经 api 封装层。
- 组件层不得持有业务规则；hook 层不得操作 DOM 样式。
- 密钥、凭证只放环境变量或配置中心，不得写入代码、日志、仓库。

WARN：

- F-02：不在浏览器本地存储敏感数据。

VERIFY 边界检查：

- 页面是否处理了加载态、空态、错误态。
- 错误是否经 api 层统一转换。
- 是否在控制台输出了用户提交内容或敏感数据。
- 请求与响应类型是否与 backend 契约一致。

HIGH_RISK 判定：涉及校对结果展示和"已保存"提示（F-03）的改动。
