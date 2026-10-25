# 規劃階段驗證

這是 evidence index；進度只更新 tasks.md。新管線尚未實作，IC-01～08 不因重用元件測試通過就全部判 PASS。

## 版本與隔離

- Beacon：`5fd4ac0d29aad37d3c6f3fc3fc2db764f8c16226`。測試使用固定 Git revision 副本，未混入主 checkout 的 13 項既存變更。
- 經驗核心：`9989bbd877318e10dbad717ecdfce56e07c0d80e`。獨立 checkout 無 source 修改；未建立真實 store 或登記私人來源。
- OpenSpec：1.14.3，官方 release 與 npm version 核對一致；獨立工具目錄安裝，使用 --ignore-scripts，未全域安裝。
- 私有 evidence run 標籤：`openspec-prep-20261024-061820`。本機 acceptance root 由操作者解析，不把絕對路徑或報告內容放進 repo。
- 營運腳本逐檔 hash：該 run 的 ops-source-hashes.json；驗收後比對正式腳本全部相同。
- 本輪沒有正式排程異動、外站抓取、額外模型呼叫、commit、push 或另一個 worktree 修改。

## 結果

| 檢查 | 方法與結果 | 證據（相對私有 evidence run） | 限制 |
|---|---|---|---|
| OpenSpec | `openspec validate --all --strict`，exit 0，5/5 | logs/openspec-validation.log | 結構檢查，不是行為驗收 |
| 營運既有契約 | 8 個既有 test files，exit 0，46/46 | logs/operations-tests.log | 合成資料；鎖測試不是正式重開機 |
| 評分與證據 | 6 個 test files，exit 0，153 pass / 1 skip | logs/scanner-tests.log | reader browser case 因隔離環境未自動找到 Playwright 而 skip；其餘資料契約有測 |
| Build | 19/19，build --check exit 0，65 outputs match | logs/build-contract.log | 固定 HEAD；不證明已安裝 hook 被宿主呼叫 |
| 本機瀏覽器流程 | flow-smoke，exit 0，1/1 | logs/local-browser-flow.log | loopback 成功／防護／失敗、舊 intake exhaustion、digest 歷史；不等於 daily CLI 全路徑 |
| 新營運整合探針 | exit 1，1 pass / 3 fail | logs/integration-probes.log | 失敗保持未修；見下節 |
| 擴充營運探針／候選 | 基準 exit 1（5 pass / 4 fail），隔離候選 exit 0（9/9）；候選既有營運測試 46/46 | logs/integration-probes-expanded.log、candidate-probes-expanded.log、candidate-operations-tests.log | 同一實作者驗證，非獨立 review；正式 runner 仍未修 |
| 經驗 CLI 接線 | experience-contract.py，exit 0；14 次 CLI 呼叫含預期 claim exit 3 | logs/experience-contract.log | 合成記錄；沒有 owner decision、真實 lesson 採用或效果證明 |
| 經驗核心全套 | 超過 300 秒 timeout，未完成 | logs/yume-tests.log | 沒有完整 suite 結果，不算 PASS |
| 經驗 queue／claim／check | 3 個直接相關 modules，28/28，exit 0 | logs/yume-focused-tests.log | 不取代全套或真實使用驗收 |
| 既有報告抽樣重跑 | 低／中／高分各 5 份，15 identical / 0 diff / 0 error，exit 0 | report-sample/selection.json、source-hashes.json、replay/summary.json | 回放一致性，不是人工真值 |
| SQLite 隔離重建 | 15 份報告的 null 日期 15→0；邏輯 audit 欄位及 finding 數相同，原件 hash 不變 | db-rebuild-sample.json | 只驗樣本；未遷移正式 DB、全歷史與 usage |

報告盤點在取得既有 shared lock 的短暫唯讀窗口完成：active survey 中 6,931 份有數值評分；
該 active survey 範圍缺報告或快照 0、不可解析報告 0。這不是所有歷史／所有 tier 的總數。
抽樣 source 保存在私人驗收副本，未進 Git；選取方式為分數及 id 排序，非隨機或代表性準確度樣本。

首次建立 repo 副本使用 git archive，因 export-ignore 缺少 core/test/tools，首次 scanner 指令未執行測試。
補齊固定 HEAD 的 tracked files 後才取得上表成功結果。此為副本準備失敗，不是 scanner 缺陷。

## 已重現缺口

| ID | 根因與實際結果 | 最小修正方向（未套用） | 後續必驗 |
|---|---|---|---|
| GAP-01 | scanner 寫 metadata.date；db ingest 讀 audit_date。合成 daily 兩筆 DB date 都是 null | 讀正確欄位並保留舊格式相容性 | 新／舊 metadata、既有 DB backfill，不能只改新寫入 |
| GAP-02 | fresh() 在 parse 前記錄 mtime；壞 JSON 被略過但標記前進。修復且保留 mtime 後 DB 仍 score 20 而非 90 | parse 與 ingest 成功後才更新標記；壞檔保留可重試狀態 | 不只新資料，還須修復既有被誤標記 rows；保留交易 rollback |
| GAP-03 | triage 預設只選最新 complete day。若前一天在 daily 完成後、triage 前中斷，下一日完成後前一天被漏掉 | 依已處理日期／receipt 補齊，逐日重播且保持去重 | 兩日缺口、same-day 重送、舊日重播不覆蓋新狀態 |

共同重現命令見 validation/README.md。未改 production source；紅燈是實際驗收缺口，不是被略過的測試。

隔離修正候選在 evidence run 的 integration-fixes.candidate.patch；來源及候選 hash 在 candidate-hashes.json。
僅變更 db.mjs、triage-daily.mjs。候選通過日期相容、transaction rollback、usage replay、triage 中斷續跑及不補造舊觀察測試。
不得直接將候選判成 production 已修；後續需獨立 review、完整 DB 修復計畫及明確 promotion 授權。

## 驗收 ID 對照

- IC-01：既有 triage 同日去重、經驗 ingest replay 已測；新候選身分與跨系統去重未實作。
- IC-02：GAP-01～03 的基準 red 與隔離候選 green 已取得；非獨立 reviewer，未部署，不代表整條修正管線完成。
- IC-03：既有 daily 指定中斷點及 flock 通過；GAP-03 失敗，新 runner 故障矩陣未實作。
- IC-04：既有 daily 同版比較及 baseline timeout 測試通過；未驗新修正 runner 的歷史比較。
- IC-05：沒有發布實作或驗收；本輪沒有發布任何內容。
- IC-06：合成 CLI replay、claim exclusion、候選保留、零命中、changed evidence 通過；新 adapter failure injection 未實作。
- IC-07：固定 HEAD 的相關契約與 15 份 replay 通過；沒有新修正、沒有新準確度量測。
- IC-08：daily→registry→SQLite 與重複 sync 一致性通過；基準日期及壞檔修復失敗、隔離候選通過；正式資料 migration 未驗，不能判整項通過。

## 下一階段需定案，這輪不打斷使用者

1. 模型執行方式與成本上限。建議先完成零模型的材料準備，再選外層 runner；核心不增加模型呼叫。
2. 自動修改邊界。建議先只產出隔離 diff／測試證據，語意規則變更、合併與部署維持核准步驟。
3. 營運程式 source ownership 與成果發布目的地。建議可攜程式版本控制、私有設定與資料留外部；branch、頻率及檔案白名單仍需確定。

沒有為了等待這些決策而修改排程或啟動模型。Goal UI 的原狀態仍為 paused；本輪依使用者明確的三小時自主工作授權執行，未宣稱 UI goal 已恢復或整體 goal 已完成。

## 實作階段驗證（2026-10-25）

私有 evidence run 標籤：`improve-pipeline-20261025-172130`（acceptance root 由操作者解析）。Beacon worktree `beacon-improve`，分支 `feat/improvement-pipeline`，base master `0620219`；營運腳本 pristine 副本 40 檔逐檔 hash 與正式目錄相同（`evidence/ops-source-hashes.txt`）；經驗核心 `9989bbd`；OpenSpec 1.14.3 安裝於該 run 的 `tools/`，`validate --all --strict` 5/5。本輪沒有正式排程異動、外站抓取、模型呼叫、commit、push；正式腳本、正式 DB、正式 quality/ 均未變更，所有執行都在完整唯讀複本上。

### 任務 2.0：GAP-01～03 候選修正

| 檢查 | 方法與結果 | 證據（相對 evidence run） | 限制 |
|---|---|---|---|
| 獨立 red/green | 非作者在新副本重現：pristine 探針 5/9（GAP-01、GAP-02、GAP-03 兩案紅），候選 v1 9/9 | evidence/gap-redgreen.json、logs/probe-pristine.log、probe-candidate.log | 合成 fixture |
| 獨立審查四輪 | v1 PASS WITH FIXES：I-1 舊日亂序重播會重開已修問題、I-2 一個壞歷史日永久卡住 triage、M-1 重播改寫舊 daily 快照、M-2 mtime 讀寫競態。v2 修正後新增 I-3：daily 檔 fallback 吞掉「快照已寫、issues 未寫」的中斷窗口。v3 修正後新增 I-4：舊版遷移只在記憶體推出已處理日，未持久化，第二次執行重播全部歷史日。v4 PASS，無 Critical/Important | review/review-candidate-patch.md、-v2.md、-v3.md、-v4.md；review/edge*.mjs | 審查者與實作者為不同 agent，皆非使用者 |
| 最終探針 | v4 18/18；v3 15/18；v2 13/18（前 13 項）；v1 9/13；pristine 6/13。新增測試 F1～F5、F2b、F2c 在前一版皆紅 | logs/probe-candidate-v4.log、probe-v3-newtests.log 等 | 探針檔已擴充到 18 項 |
| 既有營運測試 | 候選副本 `node --test` 54/55；flow-smoke 補 `BEACON_REPO`、`BEACON_CHROME`、`BEACON_PLAYWRIGHT_MODULE` 後通過，合計 55/55 | logs/ops-tests-candidate-v4.log、flow-smoke-candidate-v2.log | flow-smoke 用 loopback 測試站與已驗證 Chromium |
| 正式資料 dry-run | v4 在完整唯讀複本上預設 triage 連跑兩次：exit 0，`processed_dates` 兩次都是 22，12 個 issue 狀態零變動，22 個歷史 daily 快照 hash 前後全同。對照：v1 改寫了 2026-10-04 快照；v3 第二次執行重播 21 天並改寫 1 檔 | evidence/triage-v1-dryrun 起至 triage-v4-dryrun.json（含 22 檔 sha256） | 複本於執行前以 shared lock 短暫重抄 quality/ |
| 全量 SQLite 重建 | 以候選 db.mjs 在完整複本從零 sync（11～24 秒）：20,901／20,927 筆 audits，null date 20,927→0，與原 DB 以 (target_id, source, run) 對齊後 score、coverage、total_findings、engine、url 零不符，每筆 findings 數零不符。少 26 筆為 `run-2026-07-22-weekly`、`run-2026-07-27-weekly` 兩個來源目錄已不存在的 drift 列 | evidence/db-rebuild-full.json（v1、v2、v4 三次） | 未切換正式 DB；孤兒 26 列的處置待決 |

候選檔案只有 `db.mjs`、`triage-daily.mjs`（hash：evidence/candidate-v4-hashes.json；patch：evidence/integration-fixes.candidate-v4.patch，`patch --dry-run` 可套用於 pristine）。v4 內容：GAP-01 讀 `metadata.date ?? audit_date`；GAP-02 只在成功 ingest 後以讀檔前取得的 mtime 標記，非 plain object、`findings` 非陣列、`summary` 非物件的報告視為壞檔略過不標記；GAP-03 以 `processed_dates` 重播漏日，舊版遷移時把既有 daily 快照日期一次 seed 進欄位，重播舊日只在 `date >= last_date` 時重開已修問題，壞掉的中間日略過並以 exit 4 結束，最新日壞掉仍 exit 3。

未修的 minor：`run-job.mjs` 把子程序 exit 3、4 都收斂成 unit exit 1；壞掉的歷史日沒有「確認略過」機制，unit 會每天失敗；F1 只在 `date >= last_date` 重開，更早的回歸只反映在 `last_seen`；repo 內 `benchmark/drift-harness/db.mjs` 仍只讀 `audit_date`（不在營運路徑）。

### 任務 2.1～2.5：改善循環第一階段（零模型呼叫）

實作在 worktree：`tools/improvement/`（cli、state、evidence、select、reproduce、validate、ops、experience、publish，1140 行）、`test/improvement-*.test.mjs`（5 檔，1528 行，89 個測試）、契約 `plans/2026-10-25-improvement-loop.md`。全套 `node --test` 610/610；`build.mjs --check` 65 outputs match（tools/ 不在 build 與 plugin 範圍）。沒有新增依賴、沒有模型呼叫；狀態、證據、經驗 store 都在 repo 外，由 `--config` 指向；設定檔不進 repo。

| 檢查 | 方法與結果 | 證據（相對 evidence run） | 限制 |
|---|---|---|---|
| 獨立審查五輪 | 第一輪 6 Important（loop 自行跑 yume upgrade、nothing_to_dream 當成功、packet 誤認、location 無行號永遠 unexplained、非 finding 欄位差異不擋、缺版本與 patch 綁定）；第二輪 3 Important（多候選 locator 衝突、packet_mismatch 後永久卡住、混合 packet 假成功）；第三輪 1 Important（run 被可重試 failed 候選餓死）；第四輪 PASS；真實資料矩陣 S4b 隨後發現 R1 只修一半（failed 候選每次仍被重選、其他候選餓死），補上「非 failed 先選、失敗三次後不可重試」後第五輪 PASS，無 Critical/Important | review/review-loop.md、-2.md、-3.md、-4.md、-5.md | 審查者在真實 akegarasu CLI 上以拋棄式 store 獨立重現多候選情境 |
| 真實資料情境矩陣 | 在完整唯讀複本上以 verify/run-matrix.sh 跑 11 個情境全部通過（最終一輪 4 分 13.8 秒，含 S4b 輪替與 S4c 重試上限）：S0 正式 issues 的 11 個外部類全排除、無候選；S1 注入的 `rules-diff:main-landmark-missing` 以調整過的引擎重現（5 例 1→0），以 master 引擎驗證 target fixed、相容性 5/5 identical、unexplained 空、tests exit 0、accuracy unknown；S1b 7 個人工標註採用（n 7、correct 7、agreement 1）；S1c 負向對照把壞引擎當修復 → passed:false、not-fixed；S2 重跑不重複；S3 prepare 中斷續跑 digest 相同；S4 scanner 不存在 → failed 可重試，鎖競爭 exit 3、stale lock 只回報不偷；S5 缺 snapshot 的例子略過並記錄、全缺為帶原因的 blocked；S6 改動凍結檔 → exit 2、evidence.invalid；S7 store 不可寫 → failed、不捏造；S8 兩候選記錄、重跑 replayed、pending 2、recall 空 | verify/results.json、verify/README.md、verify/run-matrix.sh、verify/out/、verify/injected-examples.json | 正常路徑為合成注入：正式 issues 目前沒有可選的引擎缺陷，7,102 份 survey 報告全為同一引擎 @19。矩陣過程中發現並修正 D2（scanner 失敗被歸為 blocked）、D3（已 validated 候選忽略 --labels）、R1 第二半（failed 候選餓死其他候選） |
| 經驗系統真實接線 | pinned 9989bbd；store 由操作者以 init、upgrade --to 2、--to 3 建到 format 3。單候選、兩候選、三候選（同 signature 接替）與 wedge 情境（A 在 ingest 後中斷、A2、A、B）全部記錄，重跑皆 replayed，queue 0 pending；`status --pending` 列出候選，`recall` 回空 | evidence/experience-real-smoke.json、verify-exp/experience-real-*.json | 沒有任何 owner decision；lesson 候選未被接受，不可 recall；採用後的 use／outcome 回饋路徑未演練 |
| 人工準確度判讀 | 獨立 agent 逐頁閱讀 7 個真實快照（只以 id 稱呼），判 `main-landmark-missing` 7/7 correct，每筆附依據（0 個 main 元素、0 個 role=main、頁面有實際內文、main 只出現在 class/id） | verify/labels.json | 7 例、1 個 key、非隨機；是 agent 判讀，不是使用者接受，未寫入經驗系統 |

IC 對照（審查者第五輪）：IC-01、02、03、05、06、07 已覆蓋；IC-04 部分（同引擎跨快照比較由 daily survey 產生，此階段明確標為 unverified）；IC-08 名義（單元測試用假 triage；矩陣 S1 在 ops 複本上以真 `triage-daily.mjs set` 寫入 issues.json、STATUS.md、quality/improvement/<id>.json；SQLite 未寫入）。

未修的 minor：`--write-ops` 不檢查 ops 是否為隔離複本（操作者負責）；外來 pending packet 多於 `yume.maxPackets`（預設 10）時為可重試的 packet_not_delivered；D3 補標註只替換 accuracy，不寫 history；第四輪的經驗測試在程式之後才補寫（審查者的真實 CLI 探針獨立覆蓋同一行為）。

Open Questions（任務 1.5）仍未定：模型 runner 與成本上限、發布目的地與白名單、營運腳本的版本控制歸屬。本輪依 design 的「先做零模型的材料準備」邊界執行，沒有為等待這些決定而啟動任何正式自動化；待決清單在私有 evidence run 的 decisions-pending.md。


## 下一步部署所需操作（未執行，需使用者授權）

適用對象：正式營運目錄的 `db.mjs`、`triage-daily.mjs` 與 `beacon-lab.db`。全程在 `flock --exclusive <ops>/.schedule.lock` 下進行，避開 05:00 JST intake 與週一 08:15／08:45 的 drift、digest；systemd unit 與 timer 不改。

1. 前置：確認三個 Beacon service 都 inactive；記錄現行兩個檔案與 DB 的 sha256（pristine 值見 `evidence/candidate-v4-hashes.json`）。
2. 備份：把 `db.mjs`、`triage-daily.mjs`、`beacon-lab.db`、`quality/` 整個複製到 `<ops>/../backup-<date>/`。
3. 套用：在 `<ops>` 執行 `patch -p1 --dry-run < integration-fixes.candidate-v4.patch`，成功後去掉 `--dry-run` 套用；核對兩個檔案的 sha256 等於 v4 值。
4. 探針：`BEACON_OPS=<ops> node --test <repo>/openspec/changes/automated-improvement-pipeline/validation/ops-contract.probe.mjs` 應 18/18（探針只讀腳本，寫入都在暫存目錄）。
5. DB 重建（就地重建，`ingested.path` 才會是正式絕對路徑）：`mv beacon-lab.db beacon-lab.db.bak`，`node db.mjs sync`（隔離複本量測 11～24 秒），預期輸出 `audits 20901`、`findings 440664`、`ledger 8`。
6. 孤兒 drift 列（26 筆，來源目錄已不存在，若決定保留）：在新 DB 上 `ATTACH 'beacon-lab.db.bak' AS b;` 先 `INSERT INTO audits(target_id,url,source,run,date,engine,score,coverage,total_findings) SELECT target_id,url,source,run,date,engine,score,coverage,total_findings FROM b.audits a WHERE NOT EXISTS (SELECT 1 FROM audits m WHERE m.target_id=a.target_id AND m.source=a.source AND m.run=a.run);` 再 `INSERT INTO findings(audit_id,key,category,severity,wcag,line) SELECT m.audit_id,f.key,f.category,f.severity,f.wcag,f.line FROM b.findings f JOIN b.audits a ON f.audit_id=a.audit_id JOIN audits m ON m.target_id=a.target_id AND m.source=a.source AND m.run=a.run WHERE a.run IN ('run-2026-07-22-weekly','run-2026-07-27-weekly');`。這 26 列的 `date` 仍為 null，因為來源 JSON 已不在。
7. 驗證 DB：`node db.mjs q "SELECT COUNT(*) FROM audits WHERE date IS NULL"` 應為 26（保留孤兒）或 0（不保留）；`SELECT COUNT(*) FROM audits` 為 20927 或 20901。
8. 首次 triage：`node triage-daily.mjs`，預期 exit 0、stdout 只有最新日結果、`quality/issues.json` 新增 `processed_dates` 22 項、12 個 issue 狀態不變；比對 `quality/daily/*.json` 22 檔 sha256 與備份相同。再跑一次，結果與 `processed_dates` 應相同。
9. 回復路徑：在同一把 lock 下，把備份的兩個檔案、`beacon-lab.db.bak`（改回 `beacon-lab.db`）與 `quality/` 整個複製回去；`sha256sum` 核對等於第 1 步記錄的值。不刪任何來源資料。
10. 觀察：下一次 05:00 intake 後檢查 `journalctl --user -u beacon-intake`：triage 若以 exit 4 結束表示有被略過的壞歷史日（資料未遺失，會每天重試），exit 3 表示最新日本身壞掉。

第 5 到 7 步可改為「只套腳本、不重建」，此時既有 20,927 列的 `date` 維持 null，直到各報告被重新 audit 才會更新；兩種做法都是使用者的選擇。
