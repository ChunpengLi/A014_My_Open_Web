# R2 setup

Bucket name:

```text
a014-my-open-web-uploads
```

Worker binding name:

```text
UPLOADS
```

This project uses R2 for both metadata and large uploaded files:

```text
app/firmware.json
app/options.json
app/users.json
app/sessions/*
uploads/*
```

Run:

```powershell
.\create_r2_bucket.cmd
```

Then import the original upload files:

```powershell
.\migrate_uploads_to_r2.cmd
```

If Cloudflare asks you to enable R2, go to:

```text
Storage & databases -> R2 -> Overview
```

R2 has free included monthly usage, but Cloudflare may still require billing setup.
