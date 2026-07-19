# My Open Web

一个极简静态网站，适合用 GitHub + Cloudflare Pages 做第一次公网发布。

## 本地命令

```powershell
npm run check
```

可选本地预览：

```powershell
npm run dev
```

第一次运行 `npm run dev` 时，`npx` 会临时下载 Cloudflare Wrangler。

## Cloudflare Pages 设置

推荐使用 Cloudflare Pages 的 Git 集成。这样每次推送到 GitHub 的 `main` 分支，Cloudflare 会自动构建并部署。

创建 Pages 项目时使用这些配置：

| 配置项 | 值 |
| --- | --- |
| Framework preset | None |
| Production branch | `main` |
| Build command | `npm run build` |
| Build output directory | `public` |
| Root directory | 留空 |

部署完成后，Cloudflare 会给你一个 `*.pages.dev` 的免费公网网址。

## 你需要注册或付费的地方

- GitHub 账号：需要注册。公开仓库通常免费即可。
- Cloudflare 账号：需要注册。这个纯静态站点可以先用 Free 计划。
- 域名：可选。没有域名也能用 Cloudflare 提供的 `*.pages.dev` 地址；如果想用自己的 `.com`、`.cn` 等域名，需要购买域名并按 Cloudflare 指引配置 DNS。
- Cloudflare 付费计划：当前第一版不需要。以后如果需要更多构建额度、团队能力、动态函数额度或高级服务，再考虑升级。

## 首次上线步骤

1. 在 GitHub 创建一个新仓库。
2. 在本目录执行：

```powershell
git init
git add .
git commit -m "Initial public website"
git branch -M main
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git push -u origin main
```

3. 登录 Cloudflare，进入 Workers & Pages，创建 Pages 项目。
4. 选择 Import an existing Git repository，并授权 Cloudflare 访问刚创建的 GitHub 仓库。
5. 使用上面的 Pages 设置，开始首次部署。
6. 后续只要修改文件、提交并推送到 `main`，Cloudflare 会自动部署新版本。
