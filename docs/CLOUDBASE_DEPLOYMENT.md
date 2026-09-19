# CloudBase 部署

本项目是零构建、纯静态 Web 原型，适合使用 CloudBase 静态网站托管。

## 已完成接入

- 项目级 CloudBase MCP 配置：config/mcporter.json
- GitHub Actions 自动部署：.github/workflows/cloudbase-deploy.yml
- 部署目标：CloudBase Static Hosting
- 部署内容：仓库根目录中的 index.html、src/ 等运行时静态文件

## GitHub Secrets

在 GitHub 仓库 Settings → Secrets and variables → Actions 中配置：

- TCB_ENV_ID：CloudBase 环境 ID
- TCB_SECRET_ID：用于 CI/CD 的腾讯云 API Key ID
- TCB_SECRET_KEY：对应的 API Key

不要把任何密钥提交到仓库。

## 自动部署

向 main 推送代码会触发 CloudBase 部署；也可以在 GitHub Actions 中手动运行 Deploy to CloudBase。

当前项目没有构建步骤，因此不需要 dist/。

## 本地首次接入

按照 CloudBase Skills 要求，建议在本地 AI 开发环境安装 CloudBase 插件/Skills，并重新加载 IDE。项目中的 config/mcporter.json 已准备好 CloudBase MCP 的本地配置。

安装 CloudBase 插件：
npx plugins add TencentCloudBase/cloudbase-plugin -y --scope user

或只安装 Skills：
npx skills add tencentcloudbase/cloudbase-skills

## 验证

部署成功后，在 Actions 日志的 Verify hosting 步骤查看 CloudBase 静态托管信息和默认域名。
