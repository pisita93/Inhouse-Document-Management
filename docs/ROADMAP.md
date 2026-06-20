# Roadmap

Status of the Inhouse Document Management System. This is the single source of
truth for what has shipped and what is planned. Detailed specs and plans live in
[`docs/superpowers/`](./superpowers/).

## Shipped

- **Phase 1 — DMS core.** Upload, list, preview, and delete documents.
  ([spec](./superpowers/specs/2026-05-16-inhouse-dms-phase1-design.md))
- **Phase 2 — Organization layer.** Categories, tags, FTS5 full-text search,
  filtering, and the admin/settings surface.
  ([spec](./superpowers/specs/2026-05-19-inhouse-dms-phase2-design.md))
- **Media upload.** Audio/video formats accepted; upload size limit raised to
  200 MB. ([spec](./superpowers/specs/2026-06-18-media-upload-design.md))
- **Backlog features.** Multi-tag filtering with AND/OR match, a manual
  orphan-file sweep (Settings → Maintenance), and browse-list thumbnails.
  ([spec](./superpowers/specs/2026-06-20-backlog-features-design.md),
  [plan](./superpowers/plans/2026-06-20-backlog-features.md))

## Phase 3 — Planned

> **Prerequisite:** finalize the Phase 2 schema before starting edit/versioning.
> The Phase 2 design notes that re-renaming columns after Phase 3 ships means
> another heavy migration, so schema sign-off gates this work.

- **Edit document metadata after upload.** Today mis-tagged documents must be
  deleted and re-uploaded.
- **Versioning / file replacement / revisions.**
- **Authentication & authorization.**
- **Rate limiting.**
- **Virus scanning** on upload.
- **HTTPS / nginx** reverse proxy (currently LAN-only, no HTTPS).
- **FX conversion** for financial documents.
- **Multi-language UI.**

## Backlog — Unscheduled

Not yet assigned to a phase.

_All previously-listed backlog items have shipped (see Shipped above)._
