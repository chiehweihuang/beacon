## Context

已核對 daily survey、triage、digest、SQLite 與 scanner regression 的直接入口及相關測試。
來源版本、驗證結果及限制見 verification.md；未全量審查每個 detector 或正式 reboot。
經驗系統的 CLI 核心已用合成資料驗證；不在此 repo 複製其私有文件、資料或本機設定。

## Goals / Non-Goals

目標：把既有報告轉成可驗證、可回復的改善，衡量修正成效與成本。
非目標：本輪改寫整個 Beacon、重建舊 queue、擴大抓站、改 UI gate、建立新模型服務或自動發布。

## Decisions

以下為待確認設計，不代表已部署：

1. 沿用現有 triage 的問題分類及 scanner regression，補最少的串接層。
   不另建一套平行問題庫；先核對既有識別碼與狀態轉移能否承載候選修正。
2. 每輪先選一個根因，在隔離 worktree 與資料副本完成重現及測試。
   保留正式 repo 的 dirty work，不從研究資料直接生成可公開 fixture。
3. 經驗系統負責證據、建議、採用與結果記錄；模型呼叫由外層 runner 負責。
   不能把 agent 自評冒充使用者接受，也不能以歷史匹配代替修正測試。
4. 先使用現有每日配額及 weekly 工作。優先級、退避和排程調整另需行為證據與明確決定。
5. 成果發布採明確檔案清單與目的地；私有資料維持 repo 外。Git ignore 不是唯一隔離措施。

## Acceptance

| ID | 情境與通過標準 | 驗證方法 |
|---|---|---|
| IC-01 | 同一來源重送不建立重複工作；來源 revision 改變可追溯 | 合成資料重播與版本變更測試 |
| IC-02 | 新測試在修正前因目標缺陷失敗，修正後通過 | 隔離副本 red/green，記錄版本與 exit code |
| IC-03 | 中斷後可續跑且不遺失工作、不重複發布；併發不雙重執行 | 各持久化邊界中斷及鎖衝突測試 |
| IC-04 | 原快照及報告不被覆寫；兩類變動比較互相區分 | 同引擎跨快照、同快照跨引擎 fixture |
| IC-05 | 未核准成果及私有原始資料不進發布集 | 合成敏感檔與未核准候選的拒絕測試 |
| IC-06 | 經驗接口失敗可辨識且可重試，不捏造接受或改善成效 | 離線接口 fixture 及故障注入 |
| IC-07 | 改善不破壞既有輸出；輸出不變不被誤稱準確度提升 | 既有回歸集加獨立標註樣本 |
| IC-08 | 原有 registry、digest、SQLite 可查到適用的新結果 | 隔離資料副本端到端驗收 |

所有驗收目前未執行。未取得真值的案例保持未知，不計入正確率。
度量：每週經驗證修正的根因數、發現到驗證時間、模型／人工成本、誤判及回歸數。
先建立基準；5–10 倍僅為待驗證目標，不是承諾或已取得成果。

## Risks / Trade-offs

- 測試自證與資料洩漏：以合成最小案例、保留樣本及獨立驗收降低風險。
- 佇列、共用鎖與補跑互相影響：復用現行機制前必須測試故障情境。
- 舊文件漂移：baseline 必須由程式及測試核對，不直接照抄版本過時文件。

## Open Questions

- 模型執行入口、每輪成本／時間上限與允許自動修改的範圍。
- 經驗系統的固定版本、接口與本機私有 store 配置。
- 成果發布的 repo／branch、檔案清單、頻率，以及人工審核與自動合併邊界。

這些決定未完成前，可以補規格及離線驗收設計，不啟動依賴它們的正式自動化。

## Proposed implementation boundary

先做「零額外模型呼叫的材料準備」，再接模型 runner。第一階段可先把原本需要人找的證據整理好，
而不用等夜間模型系統成熟。經驗核心與 Beacon 保持分開，透過 argv + JSON CLI 對接，不 import 私有核心內部模組。

| 階段 | 輸入與既有工具 | 新增的最小責任 | 完成判準 |
|---|---|---|---|
| 觀察 | 完成批次、quality issues、digest suspects | 補齊未 triage 日期；依根因分類候選 | 有來源 revision，漏日可重播 |
| 選題 | 既有問題及已標註樣本 | 先處理可重現的引擎／整合缺陷；DNS、TLS、bot 不直接判為 Beacon bug | 明確問題、反例、可測判準 |
| 準備 | 最少必要舊報告、快照與測試結果 | 生成不可變證據包及合成最小案例 | 私有原件未移入 repo；無來源不下結論 |
| 候選修正 | 隔離 source、副本與測試 | 外層 runner 產生 diff；每輪先限一個根因 | 修正前預期失敗、修正後通過，修改範圍符合授權 |
| 驗收 | 既有測試、scanner regression、人工標註集 | 分開報告相容性、性能及準確度；有意義的差異逐項解釋 | 不靠改 golden 消除回歸，不把穩定輸出當正確 |
| 經驗回饋 | CLI ingest / prepare / record / recall | 將結果寫成候選與後續 outcome | 未接受不回傳為 lesson；成本未知記 null |
| 發布 | 已核准 diff 與清理過的報告 | 明確檔案白名單及已確認 remote | 不含 store、usage、快照；發布與部署分開 |

初始排序建議：可重現的資料／引擎缺陷 → 已有真值支持的誤判 → 缺失報告 → 未標註異常。
分數高低與 findings 數只作抽樣線索，不當真值。每週 15 份檢查可採異常、零發現、正常案例各 5 份，
記錄抽樣 seed、已看過案例與標註引擎版本，讓後續輪替可追蹤；此為提案，未改既有排程。

### Evidence and replay identity

每個候選以 signature + 相關引擎 revision + 來源觀察的固定識別組合去重，不以整份會每日變動的 issues.json hash 當候選身分。
將最少必要觀察凍結成 repo 外的不可變證據檔，再提供給經驗系統；來源不再有效時，明確標失效，不靠舊複本冒充目前狀態。
檔案包含 source digests、採樣條件、observations、interpretations、unknowns、測試證據引用，且不夾帶可執行指令授權。
同一 observation 重送使用相同 operation_id 與 payload；內容修訂使用新 revision，舊結果保留。

每候選一個私有狀態檔：observed → prepared → reproduced → candidate → validated → awaiting-review。
published、deployed 另記實際動作 receipt，不因 validated 自動推進。
狀態需附相應證據才可前進；blocked／failed 保留原因與 retry eligibility，不以檔案存在判成功。
中斷續跑先核對來源及既有輸出 digest，完成的不可逆外部動作不得重送。
這個狀態只追 Beacon 修正工作；不複製經驗系統自己的 packet／lesson 狀態機。

### Locks and scheduled catch-up

複用營運 shared flock 只取得短時間一致的來源副本，不在模型推理期間占住每日收集鎖。
候選操作另有單 writer lock；寫入順序先保存操作意圖，再保存產物，最後標完成。
不能只用 timer 的 Persistent=true 宣稱歷史批次全部補回；需依完成批次清單與 receipts 找漏項。
外部經驗 claim 衝突或 stale claim 必須可見，不能自動 release 另一個 session 的 claim。

### Source ownership and promotion

建議可攜新串接程式放本 repo 的 tools/improvement/，本機路徑配置、工作狀態及原始證據放研究資料目錄之外部私有範圍。
目前既有營運腳本在 repo 外，是否移入版本控制及部署機制尚未定案；不能為方便就整批複製資料 workspace 入 Git。
可先用明確版本的腳本副本驗收。每次 promotion 核對來源 hash、測試版本、目的地、回復路徑及使用者授權。

### Integration defects to fix before automation

GAP-01 報告日期未進 SQLite、GAP-02 壞報告 mtime 過早標記、GAP-03 triage 漏日已由合成測試重現。
三者會破壞效果追蹤或讓問題消失於佇列，必須先修正並重驗，不能靠新增排程掩蓋。
本輪留下紅燈探針及私有隔離副本的綠燈候選 patch，未更動正式 runner；具體測試位於 validation/ops-contract.probe.mjs。
候選修正保留 mtime 快取的快速略過路徑，只在成功 ingest 後更新標記；日期支援 metadata.date 與舊 audit_date。
Triage 候選把 processed_dates 與 issues 一起原子保存；中斷後未記錄的日期重播，且不把今天缺報告的狀態補造為過去觀察。
既有錯誤快取及 null 日期不會僅因更新程式自動全部修復，需另作隔離重建及切換驗收；15 份樣本已驗，正式 DB 未切換。

## Rollback

本輪只有新增 openspec 文件，無 runtime 回復需求。
未來部署前須記錄原 runner／unit 版本及停止新管線的方法；保留舊資料與工作狀態，禁止靠刪除來源回復。
