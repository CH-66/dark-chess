# 随机暗棋（Random Dark Chinese Chess）

一个基于标准中国象棋棋盘的暗棋变体原型。

## 当前规则核心

- 标准 9×10 中国象棋棋盘与标准初始位置。
- 双方帅/将从开局起公开；其余 15 枚棋子随机打乱后全部隐藏。
- 每枚暗棋保留“初始标准位置类型”和“真实棋子类型”两个概念。
- 暗棋首次行动可以：
  - 原地翻开；或
  - 按其初始标准位置对应的棋子类型移动，移动完成后立即翻开。
- 翻开后永久公开，并只能按真实棋子类型走法移动。
- 吃掉暗棋时默认不揭示其真实身份。
- V1.0 不采用传统将军/应将判定，吃掉对方帅/将即胜。

## 原型

当前原型已经包含：

- 本地双人轮流对局；
- 原地翻棋动画；
- 暗棋移动后自动翻棋；
- 吃子缩退反馈；
- 可移动位置高亮；
- 对局日志；
- 可复现的对局种子；
- 桌面端与移动端自适应布局；
- reduced-motion 动画降级。

## V0.4：本地体验打磨 + 联网对战架构

V0.4 的重点不是立即上线匹配系统，而是先把本地规则、UI 和未来网络层的边界固定下来：

- 保持 `src/game.js` 为纯规则核心；
- 为 LocalSession / OnlineSession 预留统一会话边界；
- 固定 command + revision + event 协议模型；
- 服务端权威判定；
- 对手暗棋真实身份只在服务端保存并按玩家视图过滤；
- 为断线重连、事件补偿、回放预留字段；
- 本地体验验收清单覆盖操作反馈、移动端、可访问性和对局信息。

详细设计见：

- `docs/V0.4_ARCHITECTURE.md`
- `docs/V0.4_ACCEPTANCE.md`

## 运行

这是零依赖静态原型。由于浏览器对 `file://` 下的 ES Module 有访问限制，建议通过静态服务器运行。

可以在仓库根目录启动任意静态服务器：

```bash
python3 -m http.server 8080
```

然后访问 http://localhost:8080/。

## 规则测试

安装 Node.js 20+ 后运行：

```bash
npm install
npm test
npm run test:coverage
```

## 浏览器完整交互验收

浏览器 E2E 使用 Playwright + Chromium，覆盖开局、固定 seed、选择暗棋、原地翻棋、暗棋移动后自动翻开、吃暗棋、吃帅/将、重新开局等完整交互链路：

```bash
npm run test:e2e
```

完整记录见 `docs/BROWSER_ACCEPTANCE.md`。

规则测试覆盖：

- 开局随机与标准位置；
- 暗棋首次行动类型；
- 原地翻棋；
- 七类棋子基础走法；
- 马腿、象眼、过河、炮架；
- 己方棋子阻挡；
- 吃暗棋与吃帅/将；
- 非回合方操作限制；
- 非法操作；
- 纯函数状态更新；
- 固定种子可复现。

GitHub Actions 会在 push / pull request 时自动执行规则测试、内建 coverage 与 Chromium E2E。

## 目录

```text
.
├── .github/
│   └── workflows/
│       └── test.yml
├── README.md
├── docs/
│   ├── RULES.md
│   ├── IMPLEMENTATION.md
│   ├── V0.4_ARCHITECTURE.md
│   └── V0.4_ACCEPTANCE.md
├── index.html
├── package.json
├── src/
│   ├── app.js
│   ├── game.js
│   └── style.css
└── tests/
    └── game.test.js
```

## 原型定位

当前 V0.4 已建立本地 Session 与最小联网对战服务端边界：本地模式仍可独立运行，联网模式由 WebSocket + Room + AuthoritativeGame 驱动。

联网实现必须由服务端维护真实棋子身份并执行权威规则判定，浏览器只能获得当前玩家有权看到的信息。
