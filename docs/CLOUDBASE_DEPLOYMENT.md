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
