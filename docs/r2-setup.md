# R2 setup

Bucket name:

```text
a014-my-open-web-uploads
```

Worker binding name:

```text
UPLOADS
```

## Create the bucket

Run:

```powershell
.\create_r2_bucket.cmd
```

If Wrangler asks you to log in, complete the Cloudflare browser login. If Cloudflare asks you to enable R2, go to:

```text
Storage & databases -> R2 -> Overview
```

Complete the R2 checkout/subscription flow. R2 has free included monthly usage, but Cloudflare may still require billing setup.

## Bind the bucket to the Worker

In Cloudflare Dashboard:

```text
Workers & Pages -> a014-my-open-web -> Settings -> Bindings -> Add binding
```

Use:

```text
Binding type: R2 bucket
Variable name: UPLOADS
Bucket: a014-my-open-web-uploads
```

This gives Worker code access to the bucket as `env.UPLOADS`.
