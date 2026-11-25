# 开发任务清单 — 用户列表页（静态 Mock 演示，Frontend）

## 文档版本

| 版本 | 日期 | 修改说明 | 作者 |
|---|---|---|---|
| v1.0 | 2026-11-25 | 初始版本：基于 `01-requirements/HR_PR-2/prd.md`、`frontend-docs/HR_PR-2/04_design/design.md`（含 §10 Dev_Lead 评审补充）及 `00_impact_analysis.md` 制定 | Dev_Lead |

---

> 一个任务 = 一个可独立验证的变更单元（纵向切片），单元测试包含在各任务内。
> 代码目录：`codes/hr-collection-agent-frontend/`，文中文件相对路径均以此为基准。
> 每个任务的共同完成门禁：`npm run lint`（0 warning）、`npm test`、`npm run build`（`tsc --noEmit && vite build`，确认日志包含真实编译动作）均通过。
> 红线约束：页面/组件/Hook 内严禁 `fetch`；全局严禁 `localStorage` / `sessionStorage` / `indexedDB`；严禁 `console.log` 输出用户信息；仅使用合成脱敏数据（`B-06`）；不新增第三方依赖；代码注释使用英文。

## 任务总览

| 状态 | 阶段 | 任务数 | 预估工时 |
|---|---|---|---|
| [ ] | 1. 共享基础与 Mock 服务层 | 2 | 2.5h |
| [ ] | 2. 功能切片（组件、页面与导航集成） | 4 | 4.5h |
| [ ] | 3. 集成测试与门禁收尾 | 1 | 2.0h |
| | 合计 | 7 | 9.0h |

### 执行顺序与依赖关系

```text
Task 1.1（User 类型 + MockUserApi + 单测）
  └── Task 1.2（useUserList Hook）
        ├── Task 2.1（UserFilterBar 组件）──┐
        ├── Task 2.2（UserTable 组件）──────┼── Task 2.4（UserListPage + Layout.css + App.tsx + App.test.tsx）
        └── Task 2.3（UserDetailModal 组件）┘         │
                                                      └── Task 3.1（UserListPage.test.tsx 全场景测试与构建门禁）
```

> 说明：`Task 2.1`、`Task 2.2`、`Task 2.3` 在 `Task 1.2` 契约确定后可并行开发。

---

## 测试预算

> 控制测试发散：本需求为 **L2 静态 Mock 展示页**，遵循轻量档预算，不写重复或凑数用例。

| 项 | 值 |
|---|---|
| 规模档 | **轻量**（纯前端静态 Mock 展示页，无后端与持久化） |
| 测试代码 : 业务代码 行数参考值 | **≤ 1:1**（按本次 `HR_PR-2` 增量估算，业务代码约 550–700 行，新增测试控制在 450–650 行内） |
| 代码审查批次参考值 | **1 批**（Task 3.1 完成后统一整体 Review，重点核查 ESLint 红线、响应式布局、竞态保护与 AC 覆盖） |
| 必须覆盖的核心场景 | ① 关键字模糊搜索（大小写不敏感、清空、防抖/回车）与多条件组合筛选/重置（页码归 1）；② 前端内存分页（28 条按 `created_at` 倒序、每页 10/20/50 切换）；③ 点击行/按钮打开 `Modal` 详情与 `未填写` 空值占位；④ 加载中、筛选空态、演示空数据、请求失败与重试恢复；⑤ 并发 `seq` 保护与 `App.tsx` 三页签保活（`TD-25`）；⑥ `B-03` / `F-02` 不落本地存储、不输出用户信息到 `console` |

---

## 阶段 1：共享基础与 Mock 服务层

### Task 1.1：用户类型契约与静态 Mock 服务实现
- **关联：** PRD 用户故事 #1–#5；design.md §3、§4、§10.1、§10.2
- **内容：**
  - 新增 `src/types/User.ts`：定义并导出 `UserRole`（`'admin' | 'hr' | 'member'`）、`UserStatus`（`'active' | 'disabled'`）、`DemoSceneMode`（`'normal' | 'loading' | 'empty' | 'error'`）、`UserRecord`、`UserListQuery`、`UserListResult`。
  - 新增 `src/api/MockUserApi.ts`：
    - 导出 `MOCK_DEPARTMENTS`（`['研发部', '产品部', '人力资源部', '运营部']`）与 `MOCK_USERS`（28 条合成脱敏用户记录，覆盖 3 角色、2 状态、4 部门、唯一 `created_at` 及含 `null`/空字符串的样例）。
    - 实现 `fetchMockUsers(query, options?: { delayMs?: number })`：支持 `demoMode`（`empty`/`error`/`normal`）、`keyword`（对 `name`/`username`/`phone`/`email` 大小写不敏感匹配）、`status`/`role`/`department` 过滤、`created_at` 倒序排序及内存分页切片。
    - 实现 `fetchMockUserDetail(userId, options?: { delayMs?: number; forceError?: boolean })`：按 `user_id` 查找返回完整副本，支持模拟异步延迟与失败抛出。
- **测试：** 新增 `src/api/MockUserApi.test.ts`，覆盖关键字模糊搜索、多条件组合过滤、按 `created_at` 倒序与分页边界（第 1/2/3 页及越界页）、`empty`/`error` 模拟、详情命中与失败。
- **预估：** 1.5h
- **前置依赖：** 无

#### 子任务
- [ ] 创建 `src/types/User.ts`
- [ ] 创建 `src/api/MockUserApi.ts`（28 条合成脱敏数据 + 过滤/分页/详情查询）
- [ ] 创建并跑通 `src/api/MockUserApi.test.ts`

### Task 1.2：列表与详情状态管理 Hook（`useUserList`）
- **关联：** PRD 用户故事 #1–#5；design.md §5、§6、§10.2；`TD-16`、`TD-25`
- **内容：**
  - 新增 `src/hooks/useUserList.ts`，接收 `{ active: boolean; delayMs?: number }`。
  - 维护查询条件 `query`（`keyword`、`status`、`role`、`department`、`page`、`pageSize=10`、`demoMode='normal'`）、列表状态（`status: 'idle' | 'loading' | 'ready' | 'error'`、`items`、`total`、`error: LocalError | null`）与详情弹框状态（`selectedUserId`、`detailStatus`、`detailData`、`detailError: LocalError | null`）。
  - 仅在 `active` 首次为 `true` 时触发初始加载，后续切出再切回保留当前筛选与分页状态。
  - 搜索/筛选变更自动将 `page` 重置为 `1`；`resetFilters()` 清空关键字与下拉筛选并重置为第 1 页；`retryList()` 在 `demoMode === 'error'` 时自动恢复为 `'normal'` 后重发；`openDetail(userId)` / `retryDetail()` 独立管理详情状态且支持 `listSeq` / `detailSeq` 并发序号丢弃过期响应。
- **测试：** 随 `Task 3.1` 在 `UserListPage.test.tsx` 中联测（避免 Hook 与页面测试重复）。
- **预估：** 1.0h
- **前置依赖：** Task 1.1

#### 子任务
- [ ] 实现 `src/hooks/useUserList.ts`（查询、分页、演示模式、重试与 `seq` 竞态保护）
- [ ] 核对 Hook 不直接调用 `fetch`、不操作 DOM 样式、不写入浏览器存储

---

## 阶段 2：功能切片（组件、页面与导航集成）

### Task 2.1：筛选工具栏与演示状态切换组件（`UserFilterBar`）
- **关联：** PRD 用户故事 #2、#3、#5；design.md §6、§10.3
- **内容：**
  - 新增 `src/components/UserFilterBar.tsx`：
    - 关键字搜索框（`Input.Search` 或带清除按钮 `allowClear` 的受控输入框）：输入防抖（250ms）自动触发、回车或点击搜索按钮立即触发（并取消未执行的防抖定时器）、点击清空按钮立即恢复；组件卸载时清理定时器。
    - 状态下拉（全部 / 启用 / 禁用）、角色下拉（全部 / 管理员 / HR / 普通用户）、部门下拉（全部 / `MOCK_DEPARTMENTS`）。
    - “重置”按钮（清空关键字与全部筛选下拉）。
    - 演示状态切换器（Ant Design `Segmented`：`正常数据` / `加载中` / `空数据` / `请求失败`）。
- **测试：** 随 `Task 3.1` 验证防抖/回车搜索、清空、多条件筛选、重置及演示模式切换。
- **预估：** 1.0h
- **前置依赖：** Task 1.2

#### 子任务
- [ ] 创建 `src/components/UserFilterBar.tsx`
- [ ] 确认窄屏下 `flex-wrap: wrap` 布局与可访问标签（`aria-label` / 占位文案）

### Task 2.2：用户列表表格与分页组件（`UserTable`）
- **关联：** PRD 用户故事 #1、#2、#5；design.md §4、§6、§10.3
- **内容：**
  - 新增 `src/components/UserTable.tsx`，封装 `Table<UserRecord>`（`rowKey="user_id"`、`scroll={{ x: 'max-content' }}`）。
  - 渲染 9 列：用户编号、姓名（链接按钮样式，可点击打开详情）、用户名、手机号、邮箱、角色（`Tag`：管理员 `blue` / HR `cyan` / 普通用户默认）、状态（`Tag`：启用 `success` / 禁用 `default`）、创建时间（复用 `formatDateTime`）、操作（“查看详情”按钮）。
  - 配置 `onRow` 整行点击打开详情；姓名按钮与“查看详情”按钮需 `e.stopPropagation()` 防止双触发。
  - 受控分页：`current={page}`、`pageSize={pageSize}`、`total={total}`、`showSizeChanger`、`pageSizeOptions={[10, 20, 50]}`、`showTotal={(t) => \`共 ${t} 条\`}`。
  - 空态区分：筛选条件生效且无匹配时展示“未找到符合条件的用户”+“清空筛选”按钮；无条件或演示空态时展示“暂无用户数据”+“刷新”按钮。
- **测试：** 随 `Task 3.1` 验证列渲染、分页切换、行点击与空态引导。
- **预估：** 1.25h
- **前置依赖：** Task 1.2

#### 子任务
- [ ] 创建 `src/components/UserTable.tsx`
- [ ] 复用 `formatDateTime` 并配置 `scroll={{ x: 'max-content' }}` 与空态反馈

### Task 2.3：用户详情弹框组件（`UserDetailModal`）
- **关联：** PRD 用户故事 #4、#5；design.md §4、§6、§10.2
- **内容：**
  - 新增 `src/components/UserDetailModal.tsx`，基于 Ant Design `Modal`（`centered`、`maskClosable`、`keyboard` 默认启用支持 ESC、底部仅保留“关闭”按钮）。
  - 加载态：弹框内容区展示 `Spin`（带可识别提示文案或 `aria-label`）。
  - 错误态：复用 `ErrorAlert` 展示错误提示，并提供“重试”按钮（点击重新请求当前用户详情，不影响列表数据）。
  - 就绪态：使用 `Descriptions` 分组只读展示完整信息（基础信息：用户编号/姓名/用户名/性别；组织与角色：角色/所属部门/岗位；联系方式：手机号/邮箱/办公地点；账号与时间：账号状态/创建时间/最近活跃时间；备注）。非必填字段为空或 `null` 时统一显示 `未填写`。
- **测试：** 随 `Task 3.1` 验证弹框打开/关闭（关闭按钮与 ESC）、完整字段与 `未填写` 展示、加载态及失败重试。
- **预估：** 1.0h
- **前置依赖：** Task 1.2

#### 子任务
- [ ] 创建 `src/components/UserDetailModal.tsx`
- [ ] 复用 `ErrorAlert` 与 `formatDateTime`，统一空值占位 `未填写`

### Task 2.4：页面编排、样式补充与顶部导航接入
- **关联：** PRD 用户故事 #1、#5；design.md §3、§6、§10.3；impact_analysis §2
- **内容：**
  - 新增 `src/pages/UserListPage.tsx`：复用 `AppShell`（`nav={nav}`、`showNewChat={false}`），编排页面标题、`UserFilterBar`、列表错误态（`ErrorAlert` + “重试”按钮）、`UserTable`、`UserDetailModal`。
  - 修改 `src/components/Layout.css`：末尾追加 `.user-list-page`、`.user-list-header`、`.user-filter-bar`、`.user-list-error` 等样式，遵循 `TD-14` 颜色变量与 `TD-13` 响应式要求。
  - 修改 `src/App.tsx`：扩展 `View = 'chat' | 'archive' | 'users'`，在顶部 `Segmented` 追加 `{ label: '用户列表', value: 'users' }`，新增 `<div hidden={view !== 'users'}><UserListPage active={view === 'users'} nav={nav} /></div>`。
  - 修改 `src/App.test.tsx`：追加切换至“用户列表”页签与多页签保活（`TD-25`）回归测试。
- **测试：** 运行 `npm test -- src/App.test.tsx` 确认既有 4 条用例与新增导航保活用例全部通过。
- **预估：** 1.25h
- **前置依赖：** Task 2.1, Task 2.2, Task 2.3

#### 子任务
- [ ] 创建 `src/pages/UserListPage.tsx`
- [ ] 更新 `src/components/Layout.css`
- [ ] 更新 `src/App.tsx` 与 `src/App.test.tsx`

---

## 阶段 3：集成测试与门禁收尾

### Task 3.1：页面级集成测试、红线验证与构建门禁
- **关联：** design.md §9；PRD 全部验收标准
- **内容：**
  - 新增 `src/pages/UserListPage.test.tsx`，覆盖：
    1. 初始加载中反馈与加载完成后默认按创建时间倒序分页展示（10 条/页，共 28 条）；
    2. 切换第 2 页与修改每页条数（20 条）；
    3. 关键字搜索（姓名/用户名/手机号/邮箱模糊匹配、防抖/回车、页码归 1、清空恢复、无匹配空态“未找到符合条件的用户”+快捷清空）；
    4. 状态/角色/部门组合筛选与“重置”；
    5. 点击单行或“查看详情”按钮打开居中 `Modal`，展示完整字段与 `未填写` 占位，关闭后保持列表搜索/筛选/分页状态；详情加载失败后点击弹框内“重试”恢复展示；
    6. 演示状态切换（`加载中` / `空数据` / `请求失败`）及失败态下保留筛选条件、点击“重试”恢复正常；
    7. 并发操作竞态测试（快速连续切换筛选/点击不同行，仅采纳最后一次响应）；
    8. `B-03` / `F-02` 红线检查（测试期间无 `console.log` 输出用户信息，不读写 `localStorage`/`sessionStorage`）。
  - 执行完整验证链：
    - `npm run lint`（要求 0 error, 0 warning）
    - `npm test`（既有 618+ 与新增全部通过）
    - `npm run build`（核对输出包含真实 `tsc` 与 `vite build` 编译打包过程）
- **预估：** 2.0h
- **前置依赖：** Task 2.4

#### 子任务
- [ ] 编写并跑通 `src/pages/UserListPage.test.tsx`
- [ ] 执行 `npm run lint`、`npm test`、`npm run build` 并确认全部通过
- [ ] 同步更新 `01-requirements/HR_PR-2/_progress.md` 状态为待代码审查/QA 验收
