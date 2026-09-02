# roamola-site

Coming-soon placeholder for roamola.com — a single static page served by nginx.

## Deployment

Built and run via the included `Dockerfile` (Coolify auto-detects it). nginx
listens on port 80 inside the container — Coolify's "Ports exposes" should be
`80`, and "Port mappings" should publish it to whatever host port your VPS
reverse-proxy panel expects for roamola.com.

## Local preview

```bash
docker build -t roamola-site .
docker run -p 8080:80 roamola-site
```

Visit http://localhost:8080.
