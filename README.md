# 随机暗棋（Random Dark Chinese Chess）

一个基于标准中国象棋棋盘的暗棋变体原型。

## 当前规则核心

- 标准 9×10 中国象棋棋盘与标准初始位置。
- 双方帅/将从开局起公开；其余 15 枚棋子随机打乱后全部隐藏。
- 每枚暗棋保留“初始标准位置类型”和“真实棋子类型”两个概念。
- 当前回合可以原地翻开棋盘上的任意暗棋，可能是己方棋子，也可能是对方棋子。
- 只有己方暗棋可以按其初始标准位置对应的棋子类型移动，移动完成后立即翻开。
- 翻开后永久公开，并只能按真实棋子类型走法移动。
- 吃掉暗棋时默认不揭示其真实身份。
- 新增“不能送将”规则：任何落子后都不能让己方帅/将处于对方攻击范围，也不能造成将帅照面。
- 未翻开暗棋参与攻击判断时使用 `originalType`；翻开后使用 `actualType`。
- 正常胜负采用将军、应将、将死与和棋规则；吃帅/将仅保留为历史兼容/异常兜底。

## 原型

当前原型已经包含：

- 本地双人轮流对局；
- 原地翻棋动画；
- 暗棋移动后自动翻棋；
- 吃子缩退反馈；
- “不能送将”安全校验、将死与和棋终局判定；
- 可移动位置高亮；
- 对局日志；
- 可复现的对局种子；
- 桌面端与移动端自适应布局；
- reduced-motion 动画降级。

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
- 不能送将与将帅照面；
- 被将后的合法应对；
- 暗棋隐藏身份攻击判定；
- 纯函数状态更新；
- 固定种子可复现。

GitHub Actions 会在 push / pull request 时自动执行规则测试、coverage 与 Chromium E2E。

## 目录

```text
.
├── .github/
│   └── workflows/
│       └── test.yml
├── README.md
├── docs/
│   ├── RULES.md
│   └── IMPLEMENTATION.md
├── index.html
├── package.json
├── src/
│   ├── app.js
│   ├── game.js
│   └── style.css
└── tests/
    ├── game.test.js
    └── anti-self-check.test.js
```

## 原型定位

当前版本是本地双人（Hot Seat）规则验证原型，重点验证“位置类型 → 首次行动 → 翻开 → 真实类型接管”以及“不能送将”的核心规则循环。

如果进入联网对战阶段，需要把真实棋子身份放到服务端，避免浏览器端通过开发者工具直接查看对手暗棋的真实身份。

## CloudBase 部署

项目已接入 CloudBase 静态网站托管：

- MCP 项目配置：`config/mcporter.json`
- GitHub Actions 部署：`.github/workflows/cloudbase-deploy.yml`
- 部署说明：`docs/CLOUDBASE_DEPLOYMENT.md`
- 该原型为零构建静态站点，直接部署仓库根目录即可。

首次使用前，需要在 GitHub Actions Secrets 配置 `TCB_ENV_ID`、`TCB_SECRET_ID`、`TCB_SECRET_KEY`。配置完成后，推送到 `main` 会自动部署到 CloudBase。


<!-- CloudBase production deployment trigger -->

## V0.4 联网对战

当前 V0.4 第三阶段已经把 OnlineSession 正式接入实际棋盘 UI，支持：

- 创建房间、显示房间号、另一浏览器加入；
- 服务端权威翻棋、落子与胜负判定；
- 双浏览器 revision 同步；
- 网络错误、断线与重新连接；
- 对手暗棋 actualType 不进入客户端视图。

本地运行联网原型：

```bash
npm install
npm start
```

默认监听 127.0.0.1:8080，部署时通过 HOST / PORT 调整监听地址。

详细说明见 docs/V0.4_PHASE3.md。

## CloudBase 公网部署

当前公网架构为：

```text
浏览器
  ├── HTTPS → CloudBase Static Hosting
  └── WSS   → CloudBase CloudRun（dark-chess-online）
```

GitHub Actions 会在 main 推送时自动部署前端静态站点与 WebSocket 服务，并执行公网 HTTP + 浏览器验收。
