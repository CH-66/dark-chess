# 原型实现说明 V0.3

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

其中最关键的规则是：

> 暗棋第一次行动使用 `originalType`；翻开后立即切换为 `actualType`。

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

- 联网同步
- 登录/账号体系
- AI 对手
- 服务端保存对局
- 服务端防作弊
- 完整音效
- 传统将军/应将体系

## 后续路线

### V0.4：完整本地对战体验

- 悔棋。
- 回放。
- 对局导出/导入。
- 战绩与统计。
- 更完整的动画时序。
- 音效与静音开关。

### V0.4：可发布 Web 版本

- GitHub Pages / 静态部署。
- 分享对局种子。
- 更完善的移动端触控。
- 首屏操作说明。

### V1.0：联网对战

- 服务端维护真实棋子身份。
- 客户端只接收当前玩家允许看到的信息。
- 房间与匹配。
- 断线重连。
- 对局记录与回放。
- 服务端权威规则判定。