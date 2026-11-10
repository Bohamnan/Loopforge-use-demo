# backend Workbench — Bug 修复定位/验证参考

> 本文件由 bug-fixer 在 role=backend 时加载，回答"本 Workbench 怎么定位代码、怎么跑回归"，
> 与 SKILL.md 的 Phase 1 / Phase 3 配合使用。具体仓库结构以 `{code_roots.backend}/AGENTS.md` 为准。

---

## 1. 代码定位命令（对应 SKILL.md Phase 1）

```
grep -rn "{keyword}" src/ --include=*.py
```

入口目录：`src/app/api/`。关键词可取接口路径、函数名、异常类名、业务术语。

---

## 2. 回归验证命令（对应 SKILL.md Phase 3）

- 运行指定测试：`pytest -q {file}::{test_name}`
- 运行全部测试：`pytest -q`
- 静态检查：`ruff check .`
- 语法编译检查（兜底，无对应测试时使用）：`python -m compileall -q src`
