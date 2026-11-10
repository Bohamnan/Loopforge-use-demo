# HR_PR-1 frontend：design.md §8 追溯矩阵 → 测试（Task 3.1 核对）

契约：OpenAPI 0.1.1。测试路径均相对 `codes/hr-collection-agent-frontend/src/`；`集成` 指 `pages/ResumeCollectionPage.integration.test.tsx`（Task 3.1 新增，14 例）。

| 验收标准 | 对应测试 |
|---|---|
| REQ-FE-01.1 单个 PDF/JPG/PNG | `hooks/model/UploadPrecheck.test.ts`、`components/ComposerBar.test.tsx`、`pages/ResumeCollectionPage.upload.test.tsx` |
| REQ-FE-01.2 类型/大小预校验 | `hooks/model/UploadPrecheck.test.ts`、`pages/ResumeCollectionPage.upload.test.tsx`（backend 错误展示） |
| REQ-FE-01.3 单一加载提示、禁重复提交 | `upload.test.tsx`（loading notice）、`components/UploadProgressNotice.test.tsx` |
| REQ-FE-01.4 75 秒超时 | `upload.test.tsx`、`api/ApiClient.test.ts`、集成（上传超时） |
| REQ-FE-01.5 覆盖二次确认 | `upload.test.tsx`（re-upload）、`components/ConfirmDialog.test.tsx`、集成（覆盖确认） |
| REQ-FE-01.6 错误只展示 message、不记录文件内容 | `upload.test.tsx`（console 无文件名）、`api/ApiClient.test.ts`、集成（console 泄露断言） |
| REQ-FE-02.1 全部分类展示、经历多条 | `hooks/model/SectionConfig.test.ts`、`components/ReadOnlySection.test.tsx`、`SectionCard.test.tsx`、集成（主流程含经历区） |
| REQ-FE-02.2 四种状态文案 | `components/FieldStatusTag.test.tsx`、`ReviewSummary.test.tsx`、`hooks/model/SectionView.test.ts` |
| REQ-FE-02.3 recognized 不当已确认 | `FieldStatusTag.test.tsx`、`pages/ResumeCollectionPage.final.test.tsx`（04.x 重点用例） |
| REQ-FE-02.4 非核心可空 | `components/SectionCard.edit.test.tsx`、`pages/ResumeCollectionPage.edit.test.tsx`、集成（主流程 missing 字段按留空确认） |
| REQ-FE-03.1 分区整区核对、突出 missing/uncertain | `hooks/model/SectionView.test.ts`、`pages/ResumeCollectionPage.review.test.tsx`、`components/ReviewSummary.test.tsx` |
| REQ-FE-03.2 结构化提交并以 backend 返回更新 | `edit.test.tsx`、集成（FakeBackend 逐区 PATCH，每次不含全部 22 字段） |
| REQ-FE-03.3 子项新增/修改/删除 | `components/ObjectListEditor.test.tsx`、`StringListEditor.test.tsx`、`pages/ResumeCollectionPage.items.test.tsx` |
| REQ-FE-03.4 核心三项缺失引导 | `edit.test.tsx`、`hooks/model/FieldRules.test.ts` |
| REQ-FE-03.5 手机号/邮箱即时提示 | `hooks/model/FieldRules.test.ts`、`components/FieldRow.test.tsx`、`edit.test.tsx` |
| REQ-FE-03.6 details 字段级错误 | `edit.test.tsx`（422）、`items.test.tsx`（下标路径） |
| REQ-FE-04.1 最终确认门槛 | `final.test.tsx`、`components/FinalReviewCard.test.tsx` |
| REQ-FE-04.2 未确认字段先提示 | `final.test.tsx`、集成（未提交修改拦截） |
| REQ-FE-04.3 成功前不显示已保存 | `final.test.tsx`、集成（主流程、5xx、draft_not_found 均断言） |
| REQ-FE-04.4 成功结果并清空内容 | `final.test.tsx`、`components/SavedResultCard.test.tsx`、集成（主流程，页面无字段与手机号/邮箱） |
| REQ-FE-04.5 already_saved | `final.test.tsx`、集成（HTTP 200 + already_saved=true） |
| REQ-FE-04.6 超时/网络失败可重试、不查状态 | `final.test.tsx`、集成（确认超时后重试，请求序列仅两次 POST） |
| REQ-FE-04.7 draft_not_found | `final.test.tsx`、`components/NoticeBanner.test.tsx`、集成 |
| REQ-FE-04.8 防重复点击 | `final.test.tsx`、集成（POST /resumes 体恰为 `{confirmed:true}` 且只发一次） |
| REQ-FE-05.1 打开页面读草稿、same-origin | `api/ResumeDraftApi.test.ts`、`api/ApiClient.test.ts`、`test/ViteConfig.test.ts` |
| REQ-FE-05.2 自动恢复 | `review.test.tsx`、集成（200 分支） |
| REQ-FE-05.3 无草稿空态（404 不报错） | `pages/ResumeCollectionPage.test.tsx`、`components/WelcomePanel.test.tsx`、集成（404 无 alert、console 为空；500 仅重试） |
| REQ-FE-06.1 仅经 api 封装、无凭证 | `test/EslintRules.test.ts`（页面/组件/hook 禁 fetch）、`api/*.test.ts`；`npm run lint` |
| REQ-FE-06.2 不用浏览器存储 | `test/EslintRules.test.ts`、`npm run lint`、集成（每例断言 localStorage/sessionStorage/indexedDB/Storage 方法零访问，含监视器自检） |
| REQ-FE-06.3 console 无简历内容/响应体 | `api/ApiClient.test.ts`、`components/ErrorBoundary.test.tsx`、集成（每例断言 console 不含简历内容与响应体 message） |
| REQ-FE-06.4 错误统一解析 | `api/ApiError.test.ts`、`api/ApiClient.test.ts`、`api/ResponseShapes.test.ts` |
| REQ-FE-06.5 types 与 OpenAPI 对齐 | `types/Contract.test.ts`、`types/ContractDrift.test.ts`、`api/ResponseShapes.test.ts`、`npm run build`（tsc） |
| REQ-FE-06.6 Vitest + RTL + ESLint、合成数据 | `test/Smoke.test.tsx`、`test/EslintRules.test.ts`；全部用例使用合成数据 |

说明：映射为文件级，依据测试文件命名与内容核对，未逐用例展开。
