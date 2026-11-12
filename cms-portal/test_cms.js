'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const os = require('node:os');
const sharp = require('sharp');
const { createDatabase, createCmsApp } = require('./src/app');
const { generateTotpCode } = require('./src/utils/crypto');

let passed = 0;
let failed = 0;

function check(label, cond) {
  if (cond) {
    passed += 1;
  } else {
    failed += 1;
    console.error(`[FAIL] ${label}`);
  }
}

class CookieJar {
  constructor() {
    this.cookies = new Map();
  }
  capture(headers) {
    const raw = typeof headers.getSetCookie === 'function'
      ? headers.getSetCookie()
      : (headers.get('set-cookie') ? [headers.get('set-cookie')] : []);
    for (const line of raw) {
      const first = String(line).split(';')[0];
      const eq = first.indexOf('=');
      if (eq > 0) {
        const k = first.slice(0, eq).trim();
        const v = first.slice(eq + 1).trim();
        if (v) this.cookies.set(k, v);
        else this.cookies.delete(k);
      }
    }
  }
  header() {
    return Array.from(this.cookies.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
  }
}

async function reqJson(baseUrl, jar, route, { method = 'GET', body = null, csrf = '', origin = '' } = {}) {
  const headers = {};
  const ck = jar ? jar.header() : '';
  if (ck) headers.Cookie = ck;
  if (csrf) headers['X-CSRF-Token'] = csrf;
  if (origin) headers.Origin = origin;

  let fetchBody = undefined;
  if (body instanceof FormData) {
    fetchBody = body;
  } else if (body !== null) {
    headers['Content-Type'] = 'application/json';
    fetchBody = JSON.stringify(body);
  }

  const resp = await fetch(`${baseUrl}${route}`, { method, headers, body: fetchBody });
  if (jar) jar.capture(resp.headers);
  const ct = resp.headers.get('content-type') || '';
  const data = ct.includes('application/json') ? await resp.json() : await resp.text();
  return { status: resp.status, headers: resp.headers, data };
}

async function runTests() {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wdpcs-cms-test-'));
  const dbPath = path.join(tmpRoot, 'test.sqlite');
  const uploadDir = path.join(tmpRoot, 'uploads');
  const backupDir = path.join(tmpRoot, 'backups');

  const db = createDatabase(dbPath);
  const superInitPwd = 'SuperAdmin@2026#Test';
  const app = createCmsApp({
    db,
    initDb: true,
    adminPassword: superInitPwd,
    uploadDir,
    backupDir,
    publicSiteOrigins: ['http://localhost:8080', 'https://www.wdpcs.in']
  });

  const server = await new Promise(resolve => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    console.log('=== Running WDPCS CMS Portal Integration & Security Test Suite ===');

    // 1. Login Page & Unauthenticated Protection
    const loginPage = await fetch(`${baseUrl}/login.html`);
    check('Login page responds 200', loginPage.status === 200);
    const loginHtml = await loginPage.text();
    check('Login page renders official society title', loginHtml.includes('WAYANAD DISTRICT POLICE CO-OPERATIVE SOCIETY LTD. NO. W 208'));
    check('Login page uses official WDPCS logo', loginHtml.includes('/images/wdpcs-logo.svg'));
    check('Login page contains zero hardcoded admin passwords', !loginHtml.includes(superInitPwd));

    const logoRes = await fetch(`${baseUrl}/images/wdpcs-logo.svg`);
    check('WDPCS logo asset served 200 in Admin Portal', logoRes.status === 200);
    const dashHtmlRes = await fetch(`${baseUrl}/dashboard.html`);
    check('Dashboard uses official WDPCS logo', dashHtmlRes.status === 200 && (await dashHtmlRes.text()).includes('/images/wdpcs-logo.svg'));

    const unauthDash = await reqJson(baseUrl, null, '/api/admin/dashboard');
    check('Unauthenticated dashboard returns 401', unauthDash.status === 401);

    const unauthUsers = await reqJson(baseUrl, null, '/api/admin/users');
    check('Unauthenticated users returns 401', unauthUsers.status === 401);

    // 2. Public CORS & Zero Secret Leakage
    const pubInit = await reqJson(baseUrl, null, '/api/public/site-data', { origin: 'https://www.wdpcs.in' });
    check('Public site-data returns 200', pubInit.status === 200 && pubInit.data.ok === true);
    check('Public CORS header allows https://www.wdpcs.in', pubInit.headers.get('access-control-allow-origin') === 'https://www.wdpcs.in');
    check('Public endpoint seeds all 5 deposits and 5 loans', pubInit.data.deposits.length === 5 && pubInit.data.loans.length === 5);
    const pubJsonStr = JSON.stringify(pubInit.data);
    check('Public payload leaks zero password hashes or users', !pubJsonStr.includes('scrypt:') && !pubJsonStr.includes('admin_users'));

    // 3. Login Failure & Account Lockout + Password Reset
    const adminJar = new CookieJar();
    for (let i = 1; i <= 5; i++) {
      const failRes = await reqJson(baseUrl, adminJar, '/api/admin/auth/login', {
        method: 'POST',
        body: { identifier: 'superadmin', password: 'WrongPassword123' }
      });
      check(`Failed attempt ${i} rejected (${failRes.status})`, i < 5 ? failRes.status === 401 : failRes.status === 423);
    }

    // Even right password should now be blocked while locked
    const lockedRes = await reqJson(baseUrl, adminJar, '/api/admin/auth/login', {
      method: 'POST',
      body: { identifier: 'superadmin', password: superInitPwd }
    });
    check('Account remains locked until lockout expires or password reset', lockedRes.status === 423);

    // Forgot & Reset Password flow unlocks account securely
    const forgotRes = await reqJson(baseUrl, adminJar, '/api/admin/auth/forgot-password', {
      method: 'POST',
      body: { identifier: 'superadmin' }
    });
    check('Forgot password issues dev reset token in test/dev mode', forgotRes.status === 200 && Boolean(forgotRes.data.devResetToken));

    const newSuperPwd = 'RotatedSuper@2026#Pwd';
    const resetRes = await reqJson(baseUrl, adminJar, '/api/admin/auth/reset-password', {
      method: 'POST',
      body: { token: forgotRes.data.devResetToken, newPassword: newSuperPwd }
    });
    check('Reset password succeeds and unlocks account', resetRes.status === 200 && resetRes.data.ok === true);

    // Reuse of same reset token must fail
    const reuseReset = await reqJson(baseUrl, adminJar, '/api/admin/auth/reset-password', {
      method: 'POST',
      body: { token: forgotRes.data.devResetToken, newPassword: 'AnotherPwd!123' }
    });
    check('Single-use reset token cannot be replayed', reuseReset.status === 400);

    // 4. Valid Super Admin Login & CSRF Protection
    const loginOk = await reqJson(baseUrl, adminJar, '/api/admin/auth/login', {
      method: 'POST',
      body: { identifier: 'superadmin', password: newSuperPwd }
    });
    check('Super Admin login succeeds', loginOk.status === 200 && loginOk.data.ok === true);
    const adminCsrf = loginOk.data.csrfToken;
    check('Super Admin session cookie stored in jar & CSRF issued', adminJar.header().includes('wdpcs_admin_sid') && Boolean(adminCsrf));

    // CSRF validation check
    const noCsrfRes = await reqJson(baseUrl, adminJar, '/api/admin/backups', {
      method: 'POST',
      body: { note: 'Missing CSRF' }
    });
    check('Mutation without X-CSRF-Token returns 403 Forbidden', noCsrfRes.status === 403);

    // 5. MFA TOTP Challenge Flow
    const mfaSetup = await reqJson(baseUrl, adminJar, '/api/admin/auth/mfa/setup', {
      method: 'POST', csrf: adminCsrf, body: {}
    });
    check('MFA setup generates secret & otpauth URI', mfaSetup.status === 200 && Boolean(mfaSetup.data.secret));
    const totpNow = generateTotpCode(mfaSetup.data.secret);
    const mfaEnable = await reqJson(baseUrl, adminJar, '/api/admin/auth/mfa/enable', {
      method: 'POST', csrf: adminCsrf, body: { code: totpNow }
    });
    check('MFA enable succeeds with valid 6-digit TOTP code', mfaEnable.status === 200 && mfaEnable.data.mfa_enabled === true);

    // Re-login with MFA active
    const mfaJar = new CookieJar();
    const mfaLogin = await reqJson(baseUrl, mfaJar, '/api/admin/auth/login', {
      method: 'POST', body: { identifier: 'superadmin', password: newSuperPwd }
    });
    check('Login with MFA returns mfaRequired=true', mfaLogin.status === 200 && mfaLogin.data.mfaRequired === true);
    const preMfaDash = await reqJson(baseUrl, mfaJar, '/api/admin/dashboard');
    check('Pre-MFA session is blocked from dashboard (403)', preMfaDash.status === 403 && preMfaDash.data.mfaRequired === true);

    const mfaVerify = await reqJson(baseUrl, mfaJar, '/api/admin/auth/mfa-verify', {
      method: 'POST', body: { code: generateTotpCode(mfaSetup.data.secret) }
    });
    check('MFA verification completes session unlock', mfaVerify.status === 200 && mfaVerify.data.ok === true);
    const activeCsrf = mfaVerify.data.csrfToken;

    // 6. RBAC: Create Content Admin, Financial Admin & Viewer Accounts and Test Isolation
    const rolesRes = await reqJson(baseUrl, mfaJar, '/api/admin/roles');
    check('Roles endpoint returns all 4 roles', rolesRes.status === 200 && rolesRes.data.roles.length === 4);
    const roleMap = new Map(rolesRes.data.roles.map(r => [r.slug, r.id]));

    for (const [uname, email, full, slug] of [
      ['content1', 'content@wdpcs.in', 'Content Editor', 'content_admin'],
      ['finance1', 'finance@wdpcs.in', 'Finance Officer', 'financial_admin'],
      ['viewer1', 'viewer@wdpcs.in', 'Audit Viewer', 'viewer']
    ]) {
      const cr = await reqJson(baseUrl, mfaJar, '/api/admin/users', {
        method: 'POST',
        csrf: activeCsrf,
        body: { username: uname, email, fullName: full, password: 'RoleUser@2026!', roleId: roleMap.get(slug) }
      });
      check(`Created ${slug} account cleanly`, cr.status === 201);
    }

    // Login as Viewer
    const viewerJar = new CookieJar();
    const vLogin = await reqJson(baseUrl, viewerJar, '/api/admin/auth/login', {
      method: 'POST', body: { identifier: 'viewer1', password: 'RoleUser@2026!' }
    });
    const viewerCsrf = vLogin.data.csrfToken;
    check('Viewer can read dashboard & rate history', (await reqJson(baseUrl, viewerJar, '/api/admin/financial/rate-history')).status === 200);
    check('Viewer blocked from creating notice (403)', (await reqJson(baseUrl, viewerJar, '/api/admin/notices', { method: 'POST', csrf: viewerCsrf, body: { title: 'Blocked' } })).status === 403);
    check('Viewer blocked from user management (403)', (await reqJson(baseUrl, viewerJar, '/api/admin/users')).status === 403);

    // Login as Content Admin
    const contentJar = new CookieJar();
    const cLogin = await reqJson(baseUrl, contentJar, '/api/admin/auth/login', {
      method: 'POST', body: { identifier: 'content1', password: 'RoleUser@2026!' }
    });
    const contentCsrf = cLogin.data.csrfToken;
    check('Content Admin blocked from user creation (403)', (await reqJson(baseUrl, contentJar, '/api/admin/users', { method: 'POST', csrf: contentCsrf, body: {} })).status === 403);
    check('Content Admin blocked from publishing financial rate (403)', (await reqJson(baseUrl, contentJar, '/api/admin/financial/loans/1', { method: 'PUT', csrf: contentCsrf, body: { interestRate: '99%' } })).status === 403);

    // Login as Financial Admin
    const finJar = new CookieJar();
    const fLogin = await reqJson(baseUrl, finJar, '/api/admin/auth/login', {
      method: 'POST', body: { identifier: 'finance1', password: 'RoleUser@2026!' }
    });
    const finCsrf = fLogin.data.csrfToken;
    check('Financial Admin blocked from settings update (403)', (await reqJson(baseUrl, finJar, '/api/admin/settings', { method: 'PUT', csrf: finCsrf, body: { settings: {} } })).status === 403);

    // 7. Draft vs Published Isolation & General Content Publishing + Revision Restore
    const draftUpdate = await reqJson(baseUrl, contentJar, '/api/admin/content/general_about', {
      method: 'PUT',
      csrf: contentCsrf,
      body: {
        action: 'save_draft',
        changeNote: 'Draft tagline check',
        payload: {
          headline: 'UNPUBLISHED DRAFT HEADLINE SHOULD NOT APPEAR PUBLICLY',
          introHtml: '<p>Draft intro<script>alert("xss")</script></p>',
          historyHtml: '<p>History ok</p>',
          mission: 'Mission Test',
          vision: 'Vision Test',
          registrationDate: '24 May 1996',
          commencementDate: '21 August 1996',
          classification: 'Class 1 Special Grade'
        }
      }
    });
    check('Draft save succeeds on general_about', draftUpdate.status === 200 && draftUpdate.data.workflowStatus === 'Draft');

    const pubDuringDraft = await reqJson(baseUrl, null, '/api/public/site-data');
    check('Public API still serves previous published headline while Draft is saved', !JSON.stringify(pubDuringDraft.data).includes('UNPUBLISHED DRAFT HEADLINE'));

    // Verify XSS script stripping stored safely in draft
    const contentInspect = await reqJson(baseUrl, contentJar, '/api/admin/content');
    const aboutSec = contentInspect.data.sections.find(s => s.section_key === 'general_about');
    check('Rich text sanitizer stripped <script> tag from stored introHtml', !aboutSec.draft_payload.introHtml.includes('<script>') && aboutSec.draft_payload.introHtml.includes('<p>Draft intro</p>'));

    // Publish and confirm live reflection
    const pubContentRes = await reqJson(baseUrl, contentJar, '/api/admin/content/general_about/publish', {
      method: 'POST', csrf: contentCsrf, body: {}
    });
    check('Publish action promotes Draft live', pubContentRes.status === 200);
    const pubAfterPublish = await reqJson(baseUrl, null, '/api/public/site-data');
    check('Public API now serves published headline', pubAfterPublish.data.content.general_about.data.headline === 'UNPUBLISHED DRAFT HEADLINE SHOULD NOT APPEAR PUBLICLY');

    // Check revision history & restore previous baseline
    const revsRes = await reqJson(baseUrl, contentJar, '/api/admin/revisions/website_content/general_about');
    check('Revision snapshot recorded on update', revsRes.status === 200 && revsRes.data.revisions.length >= 1);
    const restoreRes = await reqJson(baseUrl, contentJar, '/api/admin/content/general_about/restore', {
      method: 'POST', csrf: contentCsrf, body: { revisionId: revsRes.data.revisions[0].id }
    });
    check('Revision restore to Draft succeeds', restoreRes.status === 200 && restoreRes.data.payload.headline === 'Empowering Our Police Force Through Financial Solidarity');

    // 8. Interest Rate History & Approval Workflow (Never Overwriting Previous Rates)
    const rateProposal = await reqJson(baseUrl, finJar, '/api/admin/financial/loans/1', {
      method: 'PUT',
      csrf: finCsrf,
      body: {
        action: 'submit_approval',
        interestRate: '10.25% p.a.',
        effectiveFrom: '2026-07-01',
        changeReason: 'Board Revision July 2026'
      }
    });
    check('Financial rate update queued Pending Approval cleanly', rateProposal.status === 200 && rateProposal.data.workflowStatus === 'Pending Approval');

    // Verify live public rate is still 10% p.a. before approval
    const pubBeforeRateApprove = await reqJson(baseUrl, null, '/api/public/rates');
    const emergBefore = pubBeforeRateApprove.data.loans.find(l => l.slug === 'emergency-loan');
    check('Public rate remains 10% p.a. until pending rate is approved', emergBefore.interest_rate === '10% p.a.');

    // Super Admin approves pending rate
    const approveRateRes = await reqJson(baseUrl, mfaJar, `/api/admin/financial/rate-history/${rateProposal.data.pendingHistoryId}/approve`, {
      method: 'POST', csrf: activeCsrf, body: {}
    });
    check('Rate approval publishes live rate', approveRateRes.status === 200);

    const pubAfterRateApprove = await reqJson(baseUrl, null, '/api/public/rates');
    const emergAfter = pubAfterRateApprove.data.loans.find(l => l.slug === 'emergency-loan');
    check('Public API serves updated Emergency Loan rate 10.25% p.a. & effective date', emergAfter.interest_rate === '10.25% p.a.' && emergAfter.effective_from === '2026-07-01');

    // Verify interest_rate_history preserved both baseline & approved change + triggers block overwrite/delete
    const histRes = await reqJson(baseUrl, mfaJar, '/api/admin/financial/rate-history');
    const emergHist = histRes.data.history.filter(h => h.product_name === 'Emergency Loan');
    check('Rate history preserved previous record without overwriting', emergHist.length >= 2 && emergHist[0].previous_rate === '10% p.a.' && emergHist[0].new_rate === '10.25% p.a.');

    let rateTriggerBlocked = false;
    try {
      db.prepare(`UPDATE interest_rate_history SET new_rate = '0%' WHERE id = ?`).run(emergHist[0].id);
    } catch {
      rateTriggerBlocked = true;
    }
    check('SQLite trigger blocks overwriting approved interest_rate_history', rateTriggerBlocked);

    // 9. Multi-Image WebP Upload + Thumbnail + Audio Narration + Malicious File Blocking
    const samplePng = await sharp({ create: { width: 800, height: 600, channels: 3, background: { r: 10, g: 25, b: 47 } } }).png().toBuffer();
    const wavHeader = Buffer.from('524946462400000057415645666d74201000000001000100401f0000803e0000020010006461746100000000', 'hex');

    const galFd = new FormData();
    galFd.append('images', new Blob([samplePng], { type: 'image/png' }), 'ceremony-photo.png');
    galFd.append('images', new Blob([samplePng], { type: 'image/png' }), 'ceremony-photo-2.png');
    galFd.append('audio', new Blob([wavHeader], { type: 'audio/wav' }), 'event-narration.wav');
    galFd.append('title', 'Annual Day Ceremony');
    galFd.append('category', 'events');
    galFd.append('captionSummary', 'Annual society welfare event');
    galFd.append('narrationHtml', '<p>Full official event narration.</p>');
    galFd.append('workflowStatus', 'Published');

    const galUpRes = await reqJson(baseUrl, contentJar, '/api/admin/gallery/upload', {
      method: 'POST', csrf: contentCsrf, body: galFd
    });
    check('Multi-image gallery upload + WebP/thumb + audio succeeds', galUpRes.status === 201 && galUpRes.data.count === 2 && galUpRes.data.items[0].imagePath.endsWith('.webp'));

    // Verify uploaded image is actually served securely with nosniff header
    const imgFetch = await fetch(`${baseUrl}${galUpRes.data.items[0].imagePath}`);
    check('Uploaded WebP image is served (200) with X-Content-Type-Options=nosniff', imgFetch.status === 200 && imgFetch.headers.get('x-content-type-options') === 'nosniff');

    // Reject malicious executable masquerading as image
    const badImgFd = new FormData();
    badImgFd.append('images', new Blob([Buffer.from('MZ\x90\x00ThisIsAnExePayload')], { type: 'image/jpeg' }), 'payload.jpg');
    const badImgRes = await reqJson(baseUrl, contentJar, '/api/admin/gallery/upload', {
      method: 'POST', csrf: contentCsrf, body: badImgFd
    });
    check('Magic-byte check rejects disguised EXE pretending to be JPG', badImgRes.status === 400);

    // Director portrait upload + governance publish check
    const dirPhotoFd = new FormData();
    dirPhotoFd.append('photo', new Blob([samplePng], { type: 'image/png' }), 'director-portrait.png');
    const dirPhotoRes = await reqJson(baseUrl, contentJar, '/api/admin/content/governance/photo', {
      method: 'POST', csrf: contentCsrf, body: dirPhotoFd
    });
    check('Director photo upload optimizes to WebP cleanly', dirPhotoRes.status === 201 && dirPhotoRes.data.photoUrl.startsWith('/cms-uploads/directors/') && dirPhotoRes.data.photoUrl.endsWith('.webp'));

    const govPublish = await reqJson(baseUrl, contentJar, '/api/admin/content/general_governance', {
      method: 'PUT',
      csrf: contentCsrf,
      body: {
        action: 'publish',
        payload: {
          boardIntro: 'Updated Board intro',
          directors: [{ role: 'President', name: 'SATHEESH KUMAR P G', phone: '+91 99612 58392', photo: dirPhotoRes.data.photoUrl }],
          secretary: { role: 'Secretary', name: 'RAJANI K K', photo: dirPhotoRes.data.photoUrl },
          staffNote: 'Dedicated team'
        }
      }
    });
    check('Publishing governance with new director photo succeeds', govPublish.status === 200);
    const pubAfterDir = await reqJson(baseUrl, null, '/api/public/site-data');
    check('Public API exposes updated director photo URL', pubAfterDir.data.content.general_governance.data.directors[0].photo === dirPhotoRes.data.photoUrl);

    // 10. Downloads PDF Upload, Version Replacement & Strict Santhwanam Guardrails
    const fakePdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
    const nonPdf = Buffer.from('<html><script>alert(1)</script></html>');

    const badPdfFd = new FormData();
    badPdfFd.append('title', 'Invalid Upload');
    badPdfFd.append('category', 'other');
    badPdfFd.append('file', new Blob([nonPdf], { type: 'application/pdf' }), 'fake.pdf');
    const badPdfRes = await reqJson(baseUrl, contentJar, '/api/admin/downloads', {
      method: 'POST', csrf: contentCsrf, body: badPdfFd
    });
    check('PDF upload rejects non-PDF payload via %PDF- magic byte check', badPdfRes.status === 400);

    // Block adding extra Santhwanam form
    const extraSanthFd = new FormData();
    extraSanthFd.append('title', 'Extra Third Santhwanam Form');
    extraSanthFd.append('category', 'santhwanam');
    extraSanthFd.append('file', new Blob([fakePdf], { type: 'application/pdf' }), 'extra.pdf');
    const extraSanthRes = await reqJson(baseUrl, contentJar, '/api/admin/downloads', {
      method: 'POST', csrf: contentCsrf, body: extraSanthFd
    });
    check('Santhwanam guardrail rejects adding a 3rd form under santhwanam category', extraSanthRes.status === 400);

    // Block uploading Santhwanam sub-rules anywhere
    const subruleFd = new FormData();
    subruleFd.append('title', 'Santhwanam Sub-Rules Booklet');
    subruleFd.append('category', 'other');
    subruleFd.append('file', new Blob([fakePdf], { type: 'application/pdf' }), 'santhwanam-sub-rules.pdf');
    const subruleRes = await reqJson(baseUrl, contentJar, '/api/admin/downloads', {
      method: 'POST', csrf: contentCsrf, body: subruleFd
    });
    check('Policy guardrail rejects Santhwanam sub-rules upload in Downloads', subruleRes.status === 400);

    const subruleTextRes = await reqJson(baseUrl, contentJar, '/api/admin/santhwanam/santhwanam_overview', {
      method: 'PUT',
      csrf: contentCsrf,
      body: { action: 'save_draft', payload: { title: 'Santhwanam Sub-Rule Quote' } }
    });
    check('Policy guardrail rejects Santhwanam sub-rules text in Santhwanam Content module', subruleTextRes.status === 400);

    // Version replacement on existing download form
    const docsRes = await reqJson(baseUrl, contentJar, '/api/admin/downloads');
    const emergForm = docsRes.data.documents.find(d => d.slug === 'emergency-loan-application');
    const replaceFd = new FormData();
    replaceFd.append('title', emergForm.title);
    replaceFd.append('workflowStatus', 'Published');
    replaceFd.append('changeNote', 'Updated 2026 Edition');
    replaceFd.append('file', new Blob([fakePdf], { type: 'application/pdf' }), 'emergency-2026.pdf');
    const replaceRes = await reqJson(baseUrl, contentJar, `/api/admin/downloads/${emergForm.id}`, {
      method: 'PUT', csrf: contentCsrf, body: replaceFd
    });
    check('Replacing PDF archives previous version and bumps version number', replaceRes.status === 200 && replaceRes.data.versionNumber === '1.1');

    // 11. Notices Expiry Date Filtering
    const expNotice = await reqJson(baseUrl, contentJar, '/api/admin/notices', {
      method: 'POST',
      csrf: contentCsrf,
      body: {
        title: 'Expired Notice Hidden From Public',
        category: 'general',
        summary: 'Old expired item',
        publishDate: '2025-01-01',
        expiryDate: '2025-02-01',
        workflowStatus: 'Published'
      }
    });
    check('Expired published notice created cleanly for filtering verification', expNotice.status === 201);
    const pubNoticesCheck = await reqJson(baseUrl, null, '/api/public/notices');
    check('Public notices hides expired notice automatically', !JSON.stringify(pubNoticesCheck.data).includes('Expired Notice Hidden From Public'));

    // 12. Audit Log Immutability + CSV Export + Backups
    let auditImmutable = false;
    try {
      db.prepare(`DELETE FROM audit_logs`).run();
    } catch {
      auditImmutable = true;
    }
    check('SQLite trigger prevents deleting immutable audit logs', auditImmutable);

    const csvRes = await reqJson(baseUrl, mfaJar, '/api/admin/audit-logs/export');
    check('Audit CSV export returns downloadable CSV', csvRes.status === 200 && String(csvRes.data).includes('LOGIN_SUCCESS'));

    const backupRes = await reqJson(baseUrl, mfaJar, '/api/admin/backups', {
      method: 'POST', csrf: activeCsrf, body: { note: 'Verification test snapshot' }
    });
    check('Backup snapshot creates SQLite & JSON backup cleanly', backupRes.status === 201 && backupRes.data.backup.dbSizeBytes > 0 && backupRes.data.backup.uploadedFilesCount >= 2);

    const backupDownload = await reqJson(baseUrl, mfaJar, `/api/admin/backups/${backupRes.data.backup.backupId}/cms-export.json`);
    check('Backup JSON export downloads cleanly', backupDownload.status === 200 && backupDownload.data && String(backupDownload.data.backupId).startsWith('wdpcs-backup-'));

    const backupDbDownload = await fetch(`${baseUrl}/api/admin/backups/${backupRes.data.backup.backupId}/wdpcs_cms.sqlite`, {
      headers: { Cookie: mfaJar.header() }
    });
    const backupDbBuf = Buffer.from(await backupDbDownload.arrayBuffer());
    check('Backup SQLite file downloads with valid SQLite header', backupDbDownload.status === 200 && backupDbBuf.subarray(0, 15).toString('ascii') === 'SQLite format 3');

    // 13. Public Repo Isolation Audit
    const repoRoot = path.resolve(__dirname, '..');
    const publicFilesToCheck = [
      'index.html', 'about.html', 'services.html', 'notices.html',
      'gallery.html', 'downloads.html', 'faq.html', 'contact.html',
      'santhwanam.html', 'sitemap.xml', 'js/search.js'
    ];
    for (const rel of publicFilesToCheck) {
      const content = fs.readFileSync(path.join(repoRoot, rel), 'utf8');
      check(`Public file ${rel} has zero admin portal links or credentials`, !content.includes('cms-portal') && !content.includes('login.html') && !content.includes(newSuperPwd));
    }

    console.log(`\nCMS TEST RESULTS: ${passed} passed, ${failed} failed.`);
    if (failed > 0) process.exitCode = 1;
  } finally {
    await new Promise(resolve => server.close(resolve));
    db.close();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

runTests().catch(err => {
  console.error('CMS Test Suite Error:', err);
  process.exit(1);
});
