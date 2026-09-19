# 原型实现说明 V0.4

## V1.2 规则修复

- 更正上一轮 Review：兵/卒在中国象棋中按照前进及过河后的横向方式移动和吃子，因此当前攻击判定不应把兵卒前进单独视为错误。
- 增加将死与和棋终局判定。
- 正常终局优先采用 `CHECKMATE` / `STALEMATE`；`CAPTURE_KING` 作为历史兼容或异常兜底。
- 阵营开局确定且公开；随机只改变本方真实棋子类型。
- 敌方暗棋可以直接被吃，身份默认不因被吃而公开。

## 安全与终局判定

`candidateTargets() → simulateMove() → isKingInCheck() → legalTargets() → movePiece()`

- 未翻开暗棋的行动依据：`originalType`。
- 已翻开棋子的行动依据：`actualType`。
- `isSquareAttacked()` 使用当前可执行的棋子规则判断攻击。
- `legalTargets()` 过滤所有自将和将帅照面走法。
- `hasAnyLegalAction()` 判断当前方是否存在合法移动；被将军时不把原地翻棋视为合法行动。
- `finishTurn()` 在每次合法移动或翻棋后检查下一方：被将军且无合法行动 → `CHECKMATE`；未被将军且无合法行动 → `STALEMATE`。

## 状态结果

- `outcome = null`：对局进行中。
- `outcome = CHECKMATE`：将死，`winner` 为攻击方。
- `outcome = STALEMATE`：无将且无合法行动，`winner = null`。
- `outcome = CAPTURE_KING`：历史兼容/异常兜底。

## UI

`src/app.js` 根据 `outcome` 显示将死胜负或和棋，避免 `winner = null` 时错误显示某一方获胜。