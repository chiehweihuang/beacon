## Why

Beacon 已有報告、每日收集及問題分類，但從重複問題到可重現案例、修正與效果驗證仍需串接。
目標是增加單位時間內經驗證的改善，優先運用既有報告；增加擷取數量本身不算改善。

## What Changes

- 建立以問題根因為單位的改善佇列，沿用既有分類與回歸工具。
- 在隔離環境重現、產生修正候選、驗證，再保留可追溯結果。
- 對接外部私有經驗系統，保存適用條件、反例與使用結果；不將模型執行塞入其離線核心。
- 區分網站變動與引擎變動；保留歷史及中斷續跑能力。
- 發布只處理核准且清理過的成果，不包含研究原始資料。

本提案是設計草案；新增文件不授權執行模型、變更正式排程、commit、push 或部署。

## Capabilities

### New Capabilities
- `improvement-cycle`: 從證據到修正候選、驗收及經驗回饋的可追溯循環。

### Modified Capabilities
無既存 OpenSpec capability；既有行為盤點另見 ../../baseline-inventory.md。
本輪不改每日配額與 weekly 工作，不介入另一批視口與 hook 變更。

## Impact

預期涉及研究 runner、品質問題輸出、scanner regression、隔離 worktree 與成果發布。
實際程式入口與部署位置待核對；研究資料和經驗 store 必須位於 Git repo 外。
不新增中央服務或自訂工作流框架，先重用已有工具。
