# 問題演習の進み具合・本番並みの第3問・やめて戻る・解説の充実

**対象**: src/content/examFormats.ts, src/content/mockExam.ts, src/content/accountInfo.ts, src/engine/accounts.ts, src/game/training.ts, src/game/types.ts, src/game/logic.ts, src/components/PracticePanel.tsx, src/components/MethodCard.tsx（新規）, src/components/MockExamPanel.tsx, src/components/TrainingPanels.tsx, src/components/LessonView.tsx, src/components/ui.tsx, src/components/GameApp.tsx, src/game/practice.test.ts, SPEC.md

**変更内容**
- 進み具合：問題演習の成績を `practiceLog` に残し、形式の一覧に回数・最高・ガイドなしの最高を出した。ガイドなしで7割をこえた形式は緑の枠、ガイドつきだけなら金の枠。見出しに「ガイドなしで7割をこえた形式 x / 10」
- 本番並みの出題
  - 第3問の決算整理事項に、未処理事項（売掛金の振込の記帳漏れ／仮払金の旅費精算）・当座借越の振り替え・消費税の整理（未払消費税）・建物の減価償却・期中に買った備品の月割償却を足した（本番の第3問でよく出る項目）。貸借の調整は普通預金で行う
  - 勘定科目に「建物減価償却累計額」を足した
  - 第2問の勘定記入に、受取家賃・前受家賃（収益の側の経過勘定）を足した（3種類から出る）
- やめて戻る：苦手ドリル・模擬試験（開始前・試験中）・問題演習（下書き中・答案中）・試験対策から開いた講義に「やめて試験対策にもどる」を付けた。押し間違えないよう2回押して確かめる。途中の答えは捨てる（`quitTraining`）
- 解説の充実：形式ごとに「この問題で何をするのか（意義）」と「考え方（しくみ）」を書き、解き方の手順・よくある間違いとあわせて見せる（`MethodCard`）。模擬試験の見直しにも出し、まちがえた欄の求め方を一覧にした

**理由**
ユーザーの要望：問題演習の進捗がわかるように／試験対策の問題を本番と同程度の難易度・出題内容に／途中でやめて戻れるように／第2問・第3問の解説を、解き方だけでなく考え方や意義も含めて充実させる。

## 残作業
- 第1問（仕訳）の問題集・苦手ドリルの出題が本番の論点の比率に合っているかの点検はまだ
- 第2問の勘定記入は経過勘定の3種類だけ。固定資産（備品・減価償却累計額）や貸倒引当金の勘定記入は未対応
