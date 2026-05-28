# Inhouse Document Management

Inhouse DMS — internal document management for a small company.
LAN-only document store covering invoices, receipts, contracts, HR documents, and more.
Built with Node.js, Express, React, SQLite (FTS5).
Deployed via Portainer on a Synology NAS.

Documents are organised by **type**, **category**, and **tags**. Types and
categories are managed in `/settings` (admin); tags are created on the fly from
the upload form's chip input. Browse supports filtering and full-text search
that covers names, notes, tag names, and category names. Image and PDF
attachments preview inline on the document detail page.

## Quick start (development)

```bash
npm install
mkdir -p ./.local-data/db ./.local-data/file
DATA_DIR=$(pwd)/.local-data npm run dev:server   # API at :5900
npm run dev:client                                # Vite dev at :5173 (proxies /api)
```

Open http://localhost:5173.

## Admin

Navigate to `/settings` to manage the taxonomy in three tabs:

- **Document Types** — add new types (e.g. `tax_form`, `audit_letter`) with an
  optional **Requires Financial** flag. The flag is set at creation and is
  read-only afterwards; flipping it would silently invalidate every document
  already filed under the type.
- **Categories** — create, rename, disable, or delete categories. Disabling
  hides a category from the upload form but keeps it visible on documents that
  already use it. Deletion clears the foreign key on attached documents rather
  than removing the documents.
- **Tags** — list of every tag ever attached to a document, with usage counts.
  Tags are created on demand from the upload form's chip input (lowercased,
  case-insensitively unique).

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
