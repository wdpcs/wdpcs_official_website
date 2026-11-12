'use strict';

window.AdminApp = (() => {
  const { esc, statusBadge } = window.AdminUtils;

  const state = {
    user: null,
    permissions: new Set(),
    csrfToken: '',
    idleTimeoutMs: 60 * 60 * 1000,
    activeModule: 'dashboard',
    lastActivityAt: Date.now()
  };

  const MODULE_NAMES = {
    dashboard: 'Dashboard',
    general: 'General Content',
    homepage: 'Homepage Management',
    deposits: 'Deposit Information',
    loans: 'Loan Information',
    rates: 'Interest Rate Management',
    notices: 'Notices & Circulars',
    gallery: 'Gallery Management',
    faqs: 'FAQ Management',
    downloads: 'Application Forms & Downloads',
    santhwanam: 'Santhwanam Management',
    users: 'User Management',
    roles: 'Roles & Permissions',
    audit: 'Activity Logs',
    settings: 'Settings & Backups'
  };

  function hasPerm(code) {
    if (!state.user) return false;
    if (state.user.role_slug === 'super_admin') return true;
    return state.permissions.has(code);
  }

  function showToast(msg, type = 'success') {
    const el = document.getElementById('globalToast');
    if (!el) return;
    el.textContent = msg;
    el.className = `alert alert-${type}`;
    el.style.display = 'block';
    clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(() => { el.style.display = 'none'; }, 5500);
  }

  async function apiFetch(url, opts = {}) {
    state.lastActivityAt = Date.now();
    const method = (opts.method || 'GET').toUpperCase();
    const headers = Object.assign({}, opts.headers || {});
    if (method !== 'GET' && method !== 'HEAD') {
      headers['X-CSRF-Token'] = state.csrfToken;
    }
    if (opts.body && !(opts.body instanceof FormData) && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
      if (typeof opts.body !== 'string') opts.body = JSON.stringify(opts.body);
    }

    const resp = await fetch(url, {
      ...opts,
      method,
      headers,
      credentials: 'same-origin'
    });
    if (resp.status === 401) {
      window.location.replace('/login.html');
      throw new Error('Session expired');
    }
    const contentType = resp.headers.get('content-type') || '';
    const data = contentType.includes('application/json') ? await resp.json() : await resp.text();
    if (!resp.ok || (data && data.ok === false)) {
      throw new Error((data && data.error) || `Request failed (${resp.status})`);
    }
    return data;
  }

  function openModal({ title, bodyHtml, footerButtons = [], onReady = null }) {
    const backdrop = document.getElementById('adminModalBackdrop');
    document.getElementById('adminModalTitle').textContent = title;
    const bodyEl = document.getElementById('adminModalBody');
    const footerEl = document.getElementById('adminModalFooter');
    bodyEl.innerHTML = bodyHtml;
    footerEl.innerHTML = '';

    for (const btnCfg of footerButtons) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = btnCfg.className || 'btn btn-secondary';
      b.textContent = btnCfg.label;
      b.addEventListener('click', () => {
        if (btnCfg.onClick) btnCfg.onClick({ close: closeModal, bodyEl, buttonEl: b });
        else closeModal();
      });
      footerEl.appendChild(b);
    }
    backdrop.classList.add('open');
    if (onReady) onReady(bodyEl);
  }

  function closeModal() {
    document.getElementById('adminModalBackdrop').classList.remove('open');
  }

  async function renderDashboardHome(mount) {
    const data = await apiFetch('/api/admin/dashboard');
    document.getElementById('pendingNotifyCount').textContent = String(data.summary.pendingApproval || 0);

    mount.innerHTML = `
      <div class="page-header-bar">
        <div>
          <h1 class="page-heading">Website Administration Dashboard</h1>
          <p class="page-welcome">Welcome to the Wayanad District Police Co-operative Society Website Administration Portal.</p>
        </div>
        <div style="font-size:12.5px; color:#475569;">
          Logged in as <strong>${esc(state.user.full_name)}</strong> &bull; ${esc(state.user.role_name)}
        </div>
      </div>

      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-label">Total Published Notices</div>
          <div class="kpi-value">${data.summary.publishedNotices}</div>
        </div>
        <div class="kpi-card accent">
          <div class="kpi-label">Total Gallery Images</div>
          <div class="kpi-value">${data.summary.galleryImages}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Total Downloads</div>
          <div class="kpi-value">${data.summary.totalDownloads}</div>
        </div>
        <div class="kpi-card accent">
          <div class="kpi-label">Published Service Information</div>
          <div class="kpi-value">${data.summary.publishedServices}</div>
        </div>
        <div class="kpi-card gold">
          <div class="kpi-label">Draft Content</div>
          <div class="kpi-value">${data.summary.draftContent}</div>
        </div>
        <div class="kpi-card warn">
          <div class="kpi-label">Pending Content for Approval</div>
          <div class="kpi-value">${data.summary.pendingApproval}</div>
        </div>
      </div>

      <div class="panel-card">
        <div class="panel-title-row">
          <h2 class="panel-title">Quick Actions</h2>
          <span style="font-size:12px; color:#64748b;">Select a workspace shortcut</span>
        </div>
        <div class="quick-actions-grid">
          <button type="button" class="btn btn-primary" data-jump="rates">Update Interest Rates</button>
          <button type="button" class="btn btn-success" data-jump="notices">Publish New Notice</button>
          <button type="button" class="btn btn-primary" data-jump="gallery">Upload Gallery Images</button>
          <button type="button" class="btn btn-secondary" data-jump="downloads">Manage Downloads</button>
          <button type="button" class="btn btn-secondary" data-jump="general">Edit Website Content</button>
          <button type="button" class="btn btn-secondary" data-jump="faqs">Manage FAQs</button>
        </div>
      </div>

      <div class="grid-2col">
        <div class="panel-card">
          <div class="panel-title-row">
            <h2 class="panel-title">Recent Updates (Interest Rates)</h2>
            <button type="button" class="btn btn-sm btn-secondary" data-jump="rates">View All</button>
          </div>
          <div class="table-wrap">
            <table class="admin-table">
              <thead><tr><th>Product</th><th>New Rate</th><th>Effective</th><th>Status</th></tr></thead>
              <tbody>
                ${data.recentRates.map(r => `
                  <tr>
                    <td><strong>${esc(r.product_name)}</strong><div style="font-size:11.5px;color:#64748b;">Prev: ${esc(r.previous_rate)}</div></td>
                    <td>${esc(r.new_rate)}</td>
                    <td>${esc(r.effective_from)}</td>
                    <td>${statusBadge(r.approval_status)}</td>
                  </tr>
                `).join('') || '<tr><td colspan="4">No rate updates yet.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>

        <div class="panel-card">
          <div class="panel-title-row">
            <h2 class="panel-title">Recently Published Notices</h2>
            <button type="button" class="btn btn-sm btn-secondary" data-jump="notices">Manage Notices</button>
          </div>
          <div class="table-wrap">
            <table class="admin-table">
              <thead><tr><th>Notice Title</th><th>Date</th><th>Status</th></tr></thead>
              <tbody>
                ${data.recentNotices.map(n => `
                  <tr>
                    <td><strong>${esc(n.title)}</strong></td>
                    <td style="white-space:nowrap;">${esc(n.publish_date)}</td>
                    <td>${statusBadge(n.workflow_status)}</td>
                  </tr>
                `).join('') || '<tr><td colspan="3">No notices available.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>

        <div class="panel-card">
          <div class="panel-title-row">
            <h2 class="panel-title">Recently Uploaded Gallery Images</h2>
            <button type="button" class="btn btn-sm btn-secondary" data-jump="gallery">Open Gallery</button>
          </div>
          <div style="display:flex; flex-direction:column; gap:10px;">
            ${data.recentImages.map(img => `
              <div style="display:flex; align-items:center; gap:12px; padding:8px; border:1px solid #e2e8f0; border-radius:8px;">
                <img src="${esc(img.thumbnail_path.startsWith('/') ? img.thumbnail_path : '/' + img.thumbnail_path)}" alt="" style="width:54px; height:42px; object-fit:cover; border-radius:4px; background:#e2e8f0;">
                <div style="flex:1; min-width:0;">
                  <div style="font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(img.title)}</div>
                  <div style="font-size:12px; color:#64748b;">${esc(img.category)}</div>
                </div>
                ${statusBadge(img.workflow_status)}
              </div>
            `).join('') || '<p>No gallery items yet.</p>'}
          </div>
        </div>

        <div class="panel-card">
          <div class="panel-title-row">
            <h2 class="panel-title">Recent Administrative Activities</h2>
            <button type="button" class="btn btn-sm btn-secondary" data-jump="audit">Full Audit Log</button>
          </div>
          <div class="table-wrap">
            <table class="admin-table">
              <thead><tr><th>User</th><th>Action</th><th>Module</th><th>Time</th></tr></thead>
              <tbody>
                ${data.recentActivities.map(a => `
                  <tr>
                    <td><strong>${esc(a.username)}</strong></td>
                    <td>${esc(a.action)}</td>
                    <td>${esc(a.module)}</td>
                    <td style="font-size:11.5px; color:#64748b;">${esc(a.created_at)}</td>
                  </tr>
                `).join('') || '<tr><td colspan="4">No logged activities.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    mount.querySelectorAll('[data-jump]').forEach(btn => {
      btn.addEventListener('click', () => navigateTo(btn.getAttribute('data-jump')));
    });
  }

  function openProfileModal() {
    openModal({
      title: 'Administrator Profile, Password & 2FA Security',
      bodyHtml: `
        <div class="panel-card" style="margin-bottom:14px;">
          <div><strong>Full Name:</strong> ${esc(state.user.full_name)}</div>
          <div><strong>Username:</strong> ${esc(state.user.username)} &bull; <strong>Email:</strong> ${esc(state.user.email)}</div>
          <div><strong>Assigned Role:</strong> ${esc(state.user.role_name)}</div>
          <div><strong>Last Login:</strong> ${esc(state.user.last_login_at || 'Current session')}</div>
        </div>

        <form id="changeOwnPwdForm" class="panel-card">
          <h4 style="margin-top:0;">Change Password</h4>
          <div class="form-group">
            <label class="form-label">Current Password</label>
            <input type="password" id="ownCurrPwd" class="form-control" required>
          </div>
          <div class="form-group">
            <label class="form-label">New Password (min 8 characters)</label>
            <input type="password" id="ownNewPwd" class="form-control" minlength="8" required>
          </div>
          <button type="submit" class="btn btn-primary btn-sm">Update My Password</button>
        </form>

        <div class="panel-card">
          <h4 style="margin-top:0;">Multi-Factor Authentication (TOTP)</h4>
          <p style="font-size:13px; color:#475569;">Status: <strong>${state.user.mfa_enabled ? 'Enabled (Authenticator App Required)' : 'Optional / Currently Disabled'}</strong></p>
          <div id="mfaSetupArea"></div>
          ${state.user.mfa_enabled
            ? `<div style="display:flex; gap:8px; margin-top:8px;">
                 <input type="password" id="disableMfaPwd" class="form-control" placeholder="Confirm password to disable MFA">
                 <button type="button" id="disableMfaBtn" class="btn btn-danger btn-sm">Disable MFA</button>
               </div>`
            : `<button type="button" id="startMfaSetupBtn" class="btn btn-success btn-sm">Set Up Authenticator MFA</button>`}
        </div>
      `,
      footerButtons: [{ label: 'Close', className: 'btn btn-secondary' }],
      onReady: (bodyEl) => {
        bodyEl.querySelector('#changeOwnPwdForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          try {
            await apiFetch('/api/admin/auth/change-password', {
              method: 'POST',
              body: {
                currentPassword: bodyEl.querySelector('#ownCurrPwd').value,
                newPassword: bodyEl.querySelector('#ownNewPwd').value
              }
            });
            showToast('Your password has been updated successfully.');
            e.target.reset();
          } catch (err) {
            showToast(err.message, 'error');
          }
        });

        const setupBtn = bodyEl.querySelector('#startMfaSetupBtn');
        if (setupBtn) {
          setupBtn.addEventListener('click', async () => {
            try {
              const res = await apiFetch('/api/admin/auth/mfa/setup', { method: 'POST', body: {} });
              bodyEl.querySelector('#mfaSetupArea').innerHTML = `
                <div class="alert alert-info" style="margin-top:8px;">
                  Add this TOTP Secret Key to Google Authenticator / Microsoft Authenticator:<br>
                  <code style="font-size:14px; font-weight:700;">${esc(res.secret)}</code>
                </div>
                <div style="display:flex; gap:8px;">
                  <input type="text" id="verifyMfaCodeInput" class="form-control" placeholder="Enter 6-digit code">
                  <button type="button" id="confirmMfaEnableBtn" class="btn btn-success btn-sm">Verify & Enable</button>
                </div>
              `;
              bodyEl.querySelector('#confirmMfaEnableBtn').addEventListener('click', async () => {
                try {
                  await apiFetch('/api/admin/auth/mfa/enable', {
                    method: 'POST',
                    body: { code: bodyEl.querySelector('#verifyMfaCodeInput').value.trim() }
                  });
                  state.user.mfa_enabled = true;
                  showToast('MFA enabled successfully for future logins.');
                  closeModal();
                } catch (err) {
                  showToast(err.message, 'error');
                }
              });
            } catch (err) {
              showToast(err.message, 'error');
            }
          });
        }

        const disableBtn = bodyEl.querySelector('#disableMfaBtn');
        if (disableBtn) {
          disableBtn.addEventListener('click', async () => {
            try {
              await apiFetch('/api/admin/auth/mfa/disable', {
                method: 'POST',
                body: { password: bodyEl.querySelector('#disableMfaPwd').value }
              });
              state.user.mfa_enabled = false;
              showToast('MFA disabled on your account.');
              closeModal();
            } catch (err) {
              showToast(err.message, 'error');
            }
          });
        }
      }
    });
  }

  async function navigateTo(moduleKey) {
    if (!MODULE_NAMES[moduleKey]) moduleKey = 'dashboard';
    state.activeModule = moduleKey;

    document.querySelectorAll('#sidebarNav .nav-item').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-module') === moduleKey);
    });
    document.getElementById('breadcrumbs').innerHTML = `Admin Portal &rsaquo; <strong>${esc(MODULE_NAMES[moduleKey])}</strong>`;

    if (window.innerWidth <= 900) {
      document.getElementById('adminSidebar').classList.remove('mobile-open');
    }

    const mount = document.getElementById('moduleMount');
    mount.innerHTML = `<div class="panel-card">Loading ${esc(MODULE_NAMES[moduleKey])}...</div>`;

    try {
      if (moduleKey === 'dashboard') return await renderDashboardHome(mount);
      if (['general', 'homepage', 'deposits', 'loans', 'rates', 'santhwanam', 'faqs'].includes(moduleKey)) {
        return await window.AdminModulesContent.render(moduleKey, mount);
      }
      if (['notices', 'gallery', 'downloads'].includes(moduleKey)) {
        return await window.AdminModulesMedia.render(moduleKey, mount);
      }
      if (['users', 'roles', 'audit', 'settings'].includes(moduleKey)) {
        return await window.AdminModulesSystem.render(moduleKey, mount);
      }
    } catch (err) {
      mount.innerHTML = `<div class="alert alert-error">${esc(err.message || 'Unable to load module.')}</div>`;
    }
  }

  async function boot() {
    try {
      const session = await apiFetch('/api/admin/auth/me');
      state.user = session.user;
      state.permissions = new Set(session.permissions || []);
      state.csrfToken = session.csrfToken;
      state.idleTimeoutMs = session.idleTimeoutMs || state.idleTimeoutMs;

      document.getElementById('currentUserName').textContent = state.user.full_name;
      document.getElementById('currentUserRole').textContent = state.user.role_name;
    } catch {
      return;
    }

    // Bind sidebar & topbar navigation
    document.querySelectorAll('#sidebarNav .nav-item').forEach(btn => {
      btn.addEventListener('click', () => navigateTo(btn.getAttribute('data-module')));
    });

    document.getElementById('sidebarToggleBtn').addEventListener('click', () => {
      const sb = document.getElementById('adminSidebar');
      if (window.innerWidth <= 900) sb.classList.toggle('mobile-open');
      else sb.classList.toggle('collapsed');
    });

    document.getElementById('quickJumpInput').addEventListener('change', (e) => {
      const val = e.target.value.trim().toLowerCase();
      const found = Object.entries(MODULE_NAMES).find(([, label]) => label.toLowerCase() === val);
      if (found) {
        navigateTo(found[0]);
        e.target.value = '';
      }
    });

    document.getElementById('pendingNotifyBtn').addEventListener('click', () => navigateTo('rates'));
    document.getElementById('profileSecurityBtn').addEventListener('click', openProfileModal);
    document.getElementById('adminModalClose').addEventListener('click', closeModal);
    document.getElementById('adminModalBackdrop').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) closeModal();
    });

    document.getElementById('logoutBtn').addEventListener('click', async () => {
      try {
        await apiFetch('/api/admin/auth/logout', { method: 'POST', body: {} });
      } catch {}
      window.location.replace('/login.html');
    });

    // Track user activity for client idle timeout awareness
    ['click', 'keydown'].forEach(evt => {
      document.addEventListener(evt, () => { state.lastActivityAt = Date.now(); }, { passive: true });
    });
    setInterval(() => {
      if (Date.now() - state.lastActivityAt > state.idleTimeoutMs) {
        window.location.replace('/login.html');
      }
    }, 30000);

    await navigateTo('dashboard');
  }

  document.addEventListener('DOMContentLoaded', boot);

  return {
    state,
    hasPerm,
    showToast,
    apiFetch,
    openModal,
    closeModal,
    navigateTo
  };
})();

