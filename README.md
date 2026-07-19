# Firmware Manage Web Public

这是把局域网固件/软件包管理 Web 迁移到 Cloudflare Worker + R2 的公网版本。

## 架构

- 静态前端：`public/`
- Worker API：`src/worker.js`
- 元数据：R2 中的 `app/firmware.json`、`app/options.json`
- 用户和会话：R2 中的 `app/users.json`、`app/sessions/*`
- 大文件：R2 中的 `uploads/*`

## 默认管理员

```text
用户名：lichunpeng
密码：Lcp12345
```

密码不会明文保存。Worker 首次启动时会用 PBKDF2-SHA256 单向哈希写入 R2。

## 本地检查

```powershell
npm run check
```

本地预览：

```powershell
npm run dev
```

## Cloudflare R2

创建 bucket：

```powershell
.\create_r2_bucket.cmd
```

bucket 名称：

```text
a014-my-open-web-uploads
```

Worker binding：

```text
Binding type: R2 bucket
Variable name: UPLOADS
Bucket: a014-my-open-web-uploads
```

## 迁移压缩包里的上传文件

`Firmware_Manage_Web_public.zip` 里的 `uploads/` 大约 360MB，不进入 GitHub。创建 R2 后运行：

```powershell
.\migrate_uploads_to_r2.cmd
```

它会把压缩包里的：

```text
Firmware_Manage_Web/uploads/*
```

上传到 R2：

```text
uploads/*
```

## 部署

```powershell
npm run deploy
```

或者推送到 GitHub，让 Cloudflare 自动部署。

## 登录与注册审批

1. 新用户在登录页用姓名全拼和密码提交注册申请。
2. 用户状态先是 `pending`，不能登录。
3. 管理员 `lichunpeng` 登录后点击右上角“用户审批”。
4. 点击“通过”后，该用户才能登录系统。
