# CloudBase 部署回执

- 时间（UTC）：2026-09-19 05:00:33
- Commit：c7e85fea7a985c527637d0bf1d584595931f5423
- CloudBase Environment：gamehub-d1g71qsoadd40adba
- CLI：Try the tcb ai command to start your AI full-stack development experience
- 公网域名：https://gamehub-d1g71qsoadd40adba-1300630036.tcloudbaseapp.com
- 首页 HTTP：200
- app.js HTTP：200
- style.css HTTP：200
- 刷新路径 HTTP：200
- 刷新路径内容包含“随机暗棋”：yes
- 总体结果：FAIL
- 失败阶段：Public browser acceptance
- 失败退出码：1

## 失败输出（已限制最后 20 行）

file:///home/runner/work/dark-chess/dark-chess/[eval1]:16
  throw new Error('Home page HTTP status: ' + (response?.status() ?? 'no response'));
        ^

Error: Home page HTTP status: 404
    at file:///home/runner/work/dark-chess/dark-chess/[eval1]:16:9

Node.js v24.20.0
