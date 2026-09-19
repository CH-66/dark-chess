# 原型实现说明 V0.4

## V1.2 规则 Review 修复

- 完成“不能送将”规则的边界 Review，并统一为当前 V1.2 规则口径。
- 中国象棋兵/卒按自身走法吃子；本轮 Review 对“兵卒前进不是攻击”的判断已更正，不作为缺陷处理。
- 新增将死与和棋状态：CHECKMATE / STALEMATE，并保留 CAPTURE_KING 作为历史兼容或异常兜底。
- 明确阵营开局即确定且公开，随机只在本方 15 枚非帅/将棋子内部进行。
- 明确敌方暗棋可以直接被吃，身份默认不因被吃自动公开。
- 翻棋提交后同样执行下一方的终局检测，因为翻棋可能改变公开攻击能力。


## 技术方案

- HTML5
- CSS3
- 原生 JavaScript ES Modules
- Node.js 原生 test runner
- GitHub Actions
- 零第三方运行时依赖

当前阶段优先验证游戏规则和交互，不引入前端框架、构建系统或后端服务。

## 数据模型

棋子对象核心字段：

```js
{
  id,
  side,
  x,
  y,
  originalType,
  actualType,
  revealed,
  alive
}
```

- `side`：RED / BLACK
- `x`, `y`：棋盘坐标
- `originalType`：初始标准位置对应的棋子类型
- `actualType`：真实棋子类型
- `revealed`：是否已经翻开
- `alive`：是否仍在棋盘上

## 游戏状态机

```text
HIDDEN
  ├── revealInPlace ───────────────> REVEALED
  └── moveByOriginalTypeAndReveal -> REVEALED

REVEALED
  └── normalMove ─────────────────> REVEALED

任意状态
  └── capture king ────────────────> GAME_OVER
```

其中最关键的两条规则是：

> 暗棋第一次行动使用 `originalType`；翻开后立即切换为 `actualType`。

> 任何落子完成后的局面都必须保证己方帅/将没有受到攻击。

## 不能送将的实现

规则引擎拆成“候选走法”和“安全走法”两层，避免攻击判断与回合合法性互相污染。

```text
candidateTargets()
      ↓
simulateMove()
      ↓
isKingInCheck()
      ↓
legalTargets()
      ↓
movePiece()
```

- `candidateTargets()`：只计算棋子按照当前可执行类型的基础走法，不检查回合。
- `simulateMove()`：复制局面并模拟移动、吃子以及暗棋移动后的翻开。
- `isSquareAttacked()`：判断一个格点是否受到指定阵营攻击。
- `isKingInCheck()`：定位该方帅/将并调用攻击判定。
- `legalTargets()`：过滤掉所有模拟后会让己方帅/将被攻击的目标。

攻击类型规则：

- 未翻开暗棋使用 `originalType`；
- 已翻开棋子使用 `actualType`；
- 帅/将除一步攻击外，还检查同列无子遮挡的“将帅照面”。

因此前端高亮不会出现“送将”目标，而 `movePiece()` 最终也通过 `legalTargets()` 再次校验。

## V1.2 终局实现

规则引擎继续采用：

```text
candidateTargets()
      ↓
simulateMove()
      ↓
isKingInCheck()
      ↓
legalTargets()
      ↓
finishTurn()
```

- hasAnyLegalAction()：判断指定阵营当前是否存在合法行动。
- 被将军时，原地翻棋不计入合法行动。
- 未被将军时，未翻开暗棋的原地翻棋属于合法行动。
- finishTurn() 在每次合法移动或翻棋后检查下一方。
- 被将军且无合法行动 → CHECKMATE。
- 未被将军且无合法行动 → STALEMATE。
- 测试辅助局面缺少帅/将时，不推断终局，避免单元测试的局部棋盘污染真实规则。

## 当前已实现

- 标准 9×10 棋盘。
- 双方标准16枚棋子随机身份。
- 帅/将开局明牌。
- 暗棋原地翻开。
- 暗棋按原始位置类型移动并自动翻开。
- 七类棋子基础走法。
- 马腿、象眼、炮架、兵过河等规则。
- 吃子与吃帅/将胜利。
- 吃掉暗棋不自动公开身份。
- 目标位置高亮。
- 翻棋、落子、吃子动画。
- 移动日志。
- 固定种子复现同一随机布局。
- 移动端响应式界面。
- `prefers-reduced-motion` 动画降级。
- 规则单元测试与 GitHub Actions。

## 测试策略

`tests/game.test.js` 以纯函数状态层为核心，不依赖浏览器环境。

测试重点：

1. 初始棋子数量和随机布局。
2. 暗棋 originalType / actualType 身份切换。
3. 七类棋子合法走法。
4. 阻挡、炮架、过河、九宫等边界。
5. 吃暗棋与吃帅/将。
6. 非法操作与回合控制。
7. 状态更新不修改旧对象。
8. 固定种子可复现。

## 当前刻意省略

- 登录/账号体系
- AI 对手
- 服务端保存对局
- 服务端防作弊
- 完整音效
- 重复局面、长将、长捉等复杂竞技规则

## 后续路线

V0.4 继续完成本地与联网体验；联网版本必须由服务端复用同一套规则核心，并确保隐藏身份不进入对手视图。
