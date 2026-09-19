# CloudBase 部署

本项目是零构建、纯静态 Web 原型，适合使用 CloudBase 静态网站托管。CloudBase 当前文档支持直接使用 `tcb hosting deploy` 发布纯静态目录，并可在 CI/CD 中使用 Tencent Cloud SecretId / SecretKey 登录。

## 已完成接入

- 项目级 CloudBase MCP 配置：`config/mcporter.json`
- GitHub Actions 自动部署：`.github/workflows/cloudbase-deploy.yml`
- CloudBase 托管配置脚本：`.github/scripts/configure-cloudbase-hosting.mjs`
- 部署目标：CloudBase Static Hosting
- 部署内容：仓库根目录中的 `index.html`、`src/` 等运行时静态文件
- SPA 入口与错误页：`index.html` / `index.html`

## GitHub Secrets

在 GitHub 仓库：

Settings → Secrets and variables → Actions → New repository secret

配置：

- `TCB_ENV_ID`：CloudBase 环境 ID
- `TCB_SECRET_ID`：腾讯云 SecretId
- `TCB_SECRET_KEY`：对应的 SecretKey

不要把任何密钥提交到仓库。

## 国际站环境

工作流默认按国内站处理。

如果你的 CloudBase 环境创建在国际站，在 GitHub：

Settings → Secrets and variables → Actions → Variables

增加：

- `TCB_IS_INTL` = `true`

## 自动部署流程

向 `main` 推送代码或手动运行 Actions 中的 Deploy to CloudBase，工作流依次执行：

1. 检查三个必要 Secret 是否存在
2. 安装并输出 CloudBase CLI 版本
3. 使用 API Key 登录
4. 校验目标 CloudBase 环境
5. 发布静态网站到托管根路径
6. 配置 `index.html` 为首页和错误页
7. 输出最终静态托管信息

CloudBase CLI 的 `--verify` 会对发布后的远端文件进行一致性校验。

## 本地首次接入

按照 CloudBase Skills 要求，建议在本地 AI 开发环境安装 CloudBase 插件/Skills，并重新加载 IDE。项目中的 `config/mcporter.json` 已准备好 CloudBase MCP 的本地配置。

安装 CloudBase 插件：

```bash
npx plugins add TencentCloudBase/cloudbase-plugin -y --scope user
```

或只安装 Skills：

```bash
npx skills add tencentcloudbase/cloudbase-skills
```

## 当前状态

当前仓库已经完成 CloudBase 接入代码与 CI 配置；实际公网部署结果取决于 GitHub Secrets 是否有效、SecretId/SecretKey 是否具备目标环境所需权限，以及 `TCB_ENV_ID` 是否与账号/站点匹配。

部署成功后，可在 Actions 日志的 Verify hosting 步骤查看 CloudBase 静态托管状态和默认访问域名。

## 公网完整验收记录（2026-09-19）

目标环境：`gamehub-d1g71qsoadd40adba`
公网域名：`https://gamehub-d1g71qsoadd40adba-1300630036.tcloudbaseapp.com`

生产部署 Workflow：`Deploy to CloudBase`
- Run ID：`35423093687` 曾完成过部署验证。
- 最终验收 Workflow：`35423093687`。
- 最新完整验收 Commit：`015b19050b110f9ec0ad3a6d20b1755f704555b7`。
- 同一 Commit 的 `test` Workflow：`35423093677`，结果 SUCCESS。

完整链路已验证：
- GitHub Actions 触发正常。
- `TCB_ENV_ID / TCB_SECRET_ID / TCB_SECRET_KEY` 能注入到 Actions，日志中均保持掩码。
- CloudBase CLI 3.8.3 安装正常。
- CloudBase 登录正常。
- CloudBase 环境查询正常。
- 静态发布目录仅包含 `index.html` 和 `src/`，避开 Git 工作区权限问题。
- CloudBase 静态托管部署成功。
- 首页 HTTP 200。
- `src/app.js` HTTP 200。
- `src/style.css` HTTP 200。
- SPA 测试路径 HTTP 200，返回内容包含“随机暗棋”。
- Chromium 公网浏览器验收成功：首次访问识别 CloudBase 风险提醒并点击“确定访问”后进入游戏。
- 浏览器页面标题正确。
- 棋盘存在，32 枚棋子正常渲染。
- 进入游戏后的 Console/PageError 检查通过。
- 页面刷新后 HTTP 200，棋盘和 32 枚棋子恢复正常。

### 默认域名提示

CloudBase 当前对 `*.tcloudbaseapp.com` 默认域名启用浏览器安全提示中间页。首次通过浏览器直接打开时看到“风险提醒”属于 CloudBase 默认域名机制；点击“确定访问”后进入实际网站。生产环境建议继续配置自定义域名。
