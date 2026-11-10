# 变更记录 — 简历信息收集（Backend，HR_PR-1）

> 每个任务完成后追加（append 语义）。修改文件清单只记在这里。

## Task-1.1：工程初始化（uv、pytest、ruff、.gitignore、测试基座）

**完成时间**：2026-11-10
**实现者**：Yin Yang（backend）

### 变更文件
| 文件路径 | 操作 | 说明 |
|---------|------|------|
| codes/hr-collection-agent-backend/pyproject.toml | 新增 | uv 工程清单，依赖 == 精确版本，requires-python >=3.11,<3.12，pytest/ruff 配置 |
| codes/hr-collection-agent-backend/uv.lock | 新增 | uv lock 生成（公共 PyPI，无私有索引） |
| codes/hr-collection-agent-backend/.gitignore | 新增 | data/、file/、.env、.venv/、__pycache__/、.pytest_cache/ 等 |
| codes/hr-collection-agent-backend/.env.example | 新增 | 仅占位符 |
| codes/hr-collection-agent-backend/src/app/**/__init__.py | 新增 | api、services、repositories、clients、schemas、core 包骨架 |
| codes/hr-collection-agent-backend/tests/conftest.py | 新增 | 禁网 autouse 夹具、data_dir/file_dir 夹具 |
| codes/hr-collection-agent-backend/tests/helpers.py | 新增 | 合成 PDF/JPEG/PNG 魔数字节 |
| codes/hr-collection-agent-backend/tests/test_scaffold.py | 新增 | 7 个基座冒烟用例 |

### 偏差说明
AGENTS.md 要求安装用 uv 默认索引；.gitignore 放在 codes/hr-collection-agent-backend/ 内（后端代码目录）。pyyaml、pytest-cov 已按 DL 采纳加入开发依赖。按 uv 惯例 [tool.uv] package=false，以 pytest pythonpath=src 导入 app。安全评估：新依赖均为主流维护中的包；uvx pip-audit 对锁定版本报告 No known vulnerabilities found。

### 遗留风险
FakeClock、FakeParserClient 按任务计划分别在 1.2、1.8 补入。

---

