# 隔離驗收準備

所有案例使用合成資料；不需要正式資料、不打外站、不執行模型、不寫 owner decision。
工具來源先固定版本；不要把 BEACON_OPS 指向正式資料目錄，請使用只有腳本的副本。
腳本本身會另建暫存 fixture、SQLite 與 home，結束後清除自己的 fixture。

POSIX shell：

```sh
BEACON_OPS=/path/to/copied-operational-scripts node --test openspec/changes/automated-improvement-pipeline/validation/ops-contract.probe.mjs
YUME_REPO=/path/to/reviewed-experience-checkout python3 -B openspec/changes/automated-improvement-pipeline/validation/experience-contract.py
```

第一個探針的 GAP-01～03 在目前 runner 預期為紅燈，不放進預設測試檔命名，避免把尚未授權實作的目標混入既有測試。
修正後同一份 probe 應全部通過；不得刪除失敗 assertion 來宣稱完成。
第二個 probe 只驗 CLI 接線與候選保留，不證明真實改善有效，也不代表已接受 lesson。

既有測試重用：營運 daily-survey、triage-daily、scanner-regression、run-job、schedule-plan、lock-catchup、runtime、registry-atomic。
flow-smoke 使用 loopback 測試網站，需明確指定已驗證 Chromium 與 Playwright module。
主 repo 重用 static-audit-scoring、scoring-properties、static-audit-detectors、golden-vectors、generate-report-category-disclosure、reader-task-audit、build-manifest、build-roundtrip。

避免使用 git archive 作為完整測試 source：本 repo 的 export-ignore 刻意排除 core、tools、test。
驗收副本須另外從固定 Git revision 取回這些 tracked files，不能把缺檔的執行失敗記為功能失敗。

結果、退出碼與已知限制集中在 ../verification.md，進度只在 ../tasks.md。
