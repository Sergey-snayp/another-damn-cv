# Data backups

## Current snapshot

Created **2 November 2026, 14:10:49 (America/Vancouver)**.

- Archive: `backups/current-state_2026-11-02_14-10-49.tar.gz`
- Unpacked copy: `backups/current-state_2026-11-02_14-10-49/`
- Full instructions: `RESTORE.md` inside that folder/archive.
- Code at capture: `8ea69216b76e9bc197e67fc9e7a1e8fdec3cb213`.

The snapshot contains the full saved PostgreSQL database, including 3 CVs,
4 CV versions, 3 jobs, profile/contact data, experience, education, skills,
application attachments, and saved interview preparation. Present local `.env`
files and the Prisma schema are included too.

It was restored successfully into a separate temporary database. All 16 public
tables were checked, and the temporary database was removed. The live database
was left in place. `manifest.json` records table counts, migrations and checksums.

## Restore later

1. Extract the archive if the unpacked folder is missing.
2. Follow its `RESTORE.md` to restore into a fresh database using PostgreSQL 17
   in the existing Docker container.
3. Stop the backend, point `backend/.env` at that restored database, and restart.
4. If running newer code, apply its migrations with `npx prisma migrate deploy`
   from `backend` after changing the database connection.

Restoring into a fresh database keeps the previous database available. Do not
restore this dump into a populated database.

Backups contain private account data and local configuration. `backups/` is
excluded from Git; keep a copy of the archive outside the project before deleting
the project folder.

Only saved app data is captured. Unsaved browser drafts, browser view preferences
and CV theme choices are not included. The app does not retain original uploaded
CV files, and this backup does not copy Claude credentials outside the project.
