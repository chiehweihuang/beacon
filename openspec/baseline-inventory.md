# 既有規格盤點入口

這是導覽，不是已驗證的完整功能規格，也不是另一份任務進度表。
盤點基準：`5fd4ac0d29aad37d3c6f3fc3fc2db764f8c16226`；工作樹另有既存未提交變更。
本次讀取 ARCHITECTURE.md；ROADMAP.md 僅部分輸出可見，未用其餘段落做現況結論。
前者自述 v2.0.8，後者自述 v3.3.2，不能將兩者直接當成現行實作。

| 領域 | 起始證據入口 | 待核對邊界 |
|---|---|---|
| guide / advisor / inspect | core/content/、commands/、ADAPTERS.md | 觸發、輸出、能力限制及生成關係 |
| 靜態檢測與評分 | core/scripts/、test/static-audit-scoring.test.mjs、test/scoring-properties.test.mjs | 證據不足、未量測、信心與分母規則 |
| Pattern library | core/patterns/、test/pattern-runtime.test.mjs、test/patterns-schema.test.mjs | 規則格式、無效輸入、各 adapter 一致性 |
| 瀏覽器檢測 | test/tier2-audit.test.mjs、test/focus-flow.test.mjs | 瀏覽器失敗、證據來源、靜態與動態結果差異 |
| 報告與比較 | core/scripts/、test/generate-report-category-disclosure.test.mjs、test/reader-task-audit.test.mjs | JSON 相容性、歷史比較、非計分證據 |
| UI gate 與視口 | test/design-qa.test.mjs、相關 feature branch | 等另一批變更交付後核對；未合併工作不能算主線 baseline |
| 建置與發布 | build.mjs、ADAPTERS.md、RELEASE-POLICY.md、test/build-roundtrip.test.mjs | canonical source、生成物、版本一致性 |
| 研究營運與改善 | repo 外的研究 runner；本 change 的設計 | 排程、輪替、歷史、registry / SQLite；不搬入私有原始資料 |

每個正式 baseline capability 必須附來源 revision、相關入口／失敗分支、對應測試及未驗證範圍。
優先補改善管線直接依賴的檢測、報告及營運契約，再逐步涵蓋其餘功能。
文件缺漏不等於功能缺漏；測試存在也不等於本次已執行通過。

已核對範圍以正式 specs 為準：
- [audit-evidence](specs/audit-evidence/spec.md)：評分、coverage、日期及額外證據隔離。
- [research-daily](specs/research-daily/spec.md)：三類配額、輪替、快照歷史、已測續跑路徑及 shared flock。
- [research-results](specs/research-results/spec.md)：triage、digest、SQLite 與 regression 的已知能力及缺陷。
- [adapter-build](specs/adapter-build/spec.md)：shared core 生成與 adapter 邊界。

三技能完整語意、每個 detector、Tier-2 全部情境、完整報告互動、視口 feature branch 仍未涵蓋。
