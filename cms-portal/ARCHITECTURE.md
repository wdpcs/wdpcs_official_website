# WDPCS Website Administration Portal & CMS — Architecture Guide

## 1. Overview & Isolation
This directory (`cms-portal/`) houses the **independent backend server, database, file storage, and Administration Portal** for **Wayanad District Police Co-operative Society Ltd. No. W 208**.

- **Strict Public Isolation**: No links to the admin portal appear anywhere in the public website's navigation, header, footer, `sitemap.xml`, `robots.txt`, or `js/search.js`.
- **Storage Isolation**: Runtime SQLite database, uploaded images/audio/PDFs, and automated backups live strictly inside gitignored `cms-portal/storage/` and `cms-portal/backups/`. They are never written into public repository asset folders (`../assets/`).
- **Graceful Public Integration**: Public pages optionally fetch strictly `Published` records from `/api/public/*`. If the backend is offline or unreachable (e.g., static GitHub Pages preview without API configured), every public page preserves its verified static HTML seamlessly.

## 2. Database Schema (`node:sqlite`)
Implemented in `src/db/database.js`:
1. `roles` & `permissions` — Role-Based Access Control (`super_admin`, `content_admin`, `financial_admin`, `viewer`)
2. `admin_users` — Salted `scrypt` password hashes, MFA TOTP secrets, lockout counters, active status
3. `sessions` — Server-side session tokens with idle & absolute expiry + CSRF binding
4. `password_resets` — Time-limited single-use SHA-256 hashed reset tokens
5. `website_content` — General Website Content & Homepage blocks (`Published` / `Draft` / `Pending Approval` / `Archived` + `draft_payload` / `published_payload` so edits never touch live public data until published)
6. `deposit_products` — 5 deposit schemes with rate fields, specs, and workflow status
7. `loan_products` — 5 loan products with ceilings, rates, tenures, repayment modes, and workflow status
8. `interest_rate_history` — Append-only historical ledger of all deposit & loan rate changes (`old_rate`, `new_rate`, `effective_from`, `effective_until`, `changed_by`, `approved_by`, `changed_at`)
9. `notices` — Notices & Circulars across 9 official categories, expiry dates, PDF attachments, featured flags
10. `gallery_images` — Multi-upload archive items with optimized WebP master, thumbnail, rich text narration, optional audio narration, category, ordering
11. `documents` & `document_versions` — Downloadable PDFs across 5 categories with version archiving and strict **Santhwanam 2-form & zero-subrule guardrail**
12. `faqs` — Categorized FAQs across all 6 public FAQ sections
13. `santhwanam_content` — Welfare scheme sections with server-side sub-rule blocking
14. `content_revisions` — Snapshot history per entity supporting safe Preview & Rollback
15. `audit_logs` — Append-only immutable trail enforced by SQLite `BEFORE UPDATE` / `BEFORE DELETE` `ABORT` triggers
16. `system_settings` — Approval workflow toggles, maintenance/site metadata, backup retention

## 3. Role Matrix
| Role | Access Scope |
|---|---|
| **Super Administrator** | Full control: all modules, publish & approve any item, users/roles/permissions, audit logs, system settings, DB/media backups |
| **Content Administrator** | General Content, Homepage, Notices & Circulars, Gallery & Narration, Downloads/Forms, FAQs, Santhwanam Content |
| **Financial Information Administrator** | Deposit Products, Loan Products, Interest Rate Management & Rate History |
| **Viewer** | Read-only inspection across dashboard, published/draft previews, rate history, and activity logs |

## 4. Production Deployment (`admin.wdpcs.in` / `api.wdpcs.in`)
1. Deploy `cms-portal/` on a persistent Node.js >= 24 host (Railway, Render with persistent disk, Fly.io volume, or Ubuntu VPS behind Nginx + Let's Encrypt).
2. Copy `.env.example` to `.env`, set strong `SESSION_SECRET` / `CSRF_SECRET`, set `NODE_ENV=production`, `COOKIE_SECURE=true`, `ALLOW_DEV_RESET_PREVIEW=false`, `ADMIN_BASE_URL=https://admin.wdpcs.in`, and `PUBLIC_SITE_ORIGINS=https://www.wdpcs.in`.
3. Run `npm install && npm run seed` once on the server (or set `ADMIN_INIT_PASSWORD` transiently during bootstrap and remove afterwards).
4. Start with `npm start` (or PM2/systemd). Mount persistent volumes to `/app/storage` and `/app/backups`.
5. In the public repository's `js/cms-config.js`, configure `window.WDPCS_CMS_CONFIG = { apiBaseUrl: 'https://api.wdpcs.in' }` (or leave auto-detection for localhost:8080 -> localhost:4000).

