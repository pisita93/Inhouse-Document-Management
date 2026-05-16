# Inhouse Document Management

LAN-only receipt management system for a small office.
Built with Node.js, Express, React, SQLite (FTS5).
Deployed via Portainer on a Synology NAS.

## Quick start (development)

```bash
npm install
mkdir -p ./.local-data/db ./.local-data/file
DATA_DIR=$(pwd)/.local-data npm run dev:server   # API at :5900
npm run dev:client                                # Vite dev at :5173 (proxies /api)
```

Open http://localhost:5173.

## Testing

```bash
npm test                 # unit + integration
npm run test:coverage    # with coverage gate (≥ 80%)
npm run test:e2e         # playwright
```

## Production deploy (Synology + Portainer)

### One-time setup on the NAS

1. Create the data directory:
   ```bash
   mkdir -p /volume1/docker/Document-Management/db
   mkdir -p /volume1/docker/Document-Management/file
   ```
2. In Portainer, **Stacks → Add stack**.
3. Choose **Repository** as the build method:
   - Repository URL: `https://github.com/<your-org>/Inhouse-Document-Management.git`
   - Reference: `refs/heads/main`
   - Compose path: `docker-compose.yml`
4. Enable **GitOps updates** → choose **Webhook**. Copy the webhook URL.
5. In GitHub: **Settings → Webhooks → Add webhook**:
   - Payload URL: paste the Portainer webhook URL
   - Content type: `application/json`
   - Trigger: **Just the push event**
6. Click **Deploy the stack** in Portainer.

After this, every push to `main` redeploys the stack automatically.

### Access

The app runs on `http://<NAS-IP>:5900`. Any device on the office LAN can reach it.

## Backups

The bind-mounted folder `/volume1/docker/Document-Management` contains both
the SQLite database (`db/receipts.db`) and all uploaded files (`file/...`).
Backing up that one folder backs up everything.
