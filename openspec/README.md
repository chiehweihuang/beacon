# Beacon OpenSpec

本次初始化只新增規劃文件，不改變 Beacon 行為、排程或 hook。

- [自動改善管線提案](changes/automated-improvement-pipeline/proposal.md)
- [設計與待決策事項](changes/automated-improvement-pipeline/design.md)
- [唯一任務進度](changes/automated-improvement-pipeline/tasks.md)
- [既有功能盤點](baseline-inventory.md)
- [驗證結果與已知缺口](changes/automated-improvement-pipeline/verification.md)

`specs/` 用於已核對的既有行為；`changes/` 用於尚未落地的變更。
目前已建立 audit-evidence、research-daily、research-results、adapter-build 四個有界 baseline，尚非完整產品規格。
不把新管線的目標寫成已實作功能。
既有文件繼續有效；如有衝突，記錄證據與差異，不以自動生成文字覆蓋。

結構依 OpenSpec 官方 spec-driven 文件手動建立：
https://github.com/Fission-AI/OpenSpec/blob/main/docs/concepts.md
https://github.com/Fission-AI/OpenSpec/blob/main/docs/customization.md

本次以獨立工具目錄中的 OpenSpec 1.14.3 執行 `openspec validate --all --strict`，5 個項目通過。
沒有變更全域 PATH、安裝 agent slash commands 或修改 runtime hook。
CLI 格式驗證通過不代表改善管線已實作或已部署。
