# 原型实现说明

## 技术方案

V1 原型采用：

- HTML5
- CSS3
- 原生 JavaScript
- 零第三方依赖

原因：规则验证阶段重点是快速验证核心玩法，不先引入框架、构建链和后端。

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

其中：

- `side`：RED / BLACK
- `originalType`：初始标准位置类型
- `actualType`：真实类型
- `revealed`：是否已经翻开

## 状态机

```text
HIDDEN
  ├── revealInPlace ──> REVEALED
  └── moveByOriginalTypeAndReveal ──> REVEALED

REVEALED
  └── normalMove ──> REVEALED
```

## 原型刻意省略

- 联网同步
- 登录
- AI
- 持久化存档
- 完整音效
- 服务端防作弊
- 传统将军判定

## 下一阶段建议

1. 先做两人本地对战规则验证。
2. 再补移动动画、翻棋动画、吃子反馈。
3. 再加入悔棋/重开/回放。
4. 最后将游戏状态迁移到服务端，支持联网对战。
