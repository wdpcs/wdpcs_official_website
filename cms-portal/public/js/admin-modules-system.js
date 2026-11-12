'use strict';

window.AdminModulesSystem = (() => {
  const { esc, statusBadge, formatBytes } = window.AdminUtils;

  async function renderUsers(mount) {
    const canManage = window.AdminApp.hasPerm('users:manage');
    const [{ users }, { roles }] = await Promise.all([
      window.AdminApp.apiFetch('/api/admin/users'),
      window.AdminApp.apiFetch('/api/admin/roles')
    ]);

    function openCreateUserModal() {
      window.AdminApp.openModal({
        title: 'Create Administrator Account',
        bodyHtml: `
          <div class="grid-2col">
            <div class="form-group"><label class="form-label">Full Name</label><input type="text" id="nuFull" class="form-control" required></div>
            <div class="form-group"><label class="form-label">Username</label><input type="text" id="nuUser" class="form-control" required></div>
            <div class="form-group"><label class="form-label">Official Email</label><input type="email" id="nuEmail" class="form-control" required></div>
            <div class="form-group"><label class="form-label">Assigned Role</label>
              <select id="nuRole" class="form-control">${roles.map(r => `<option value="${r.id}">${esc(r.name)}</option>`).join('')}</select>
            </div>
          </div>
          <div class="form-group"><label class="form-label">Temporary Initial Password (min 8 chars)</label><input type="password" id="nuPwd" class="form-control" minlength="8" required></div>
        `,
        footerButtons: [
          { label: 'Cancel', className: 'btn btn-secondary' },
          {
            label: 'Create User',
            className: 'btn btn-success',
            onClick: async ({ close }) => {
              try {
                await window.AdminApp.apiFetch('/api/admin/users', {
                  method: 'POST',
                  body: {
                    fullName: document.getElementById('nuFull').value.trim(),
                    username: document.getElementById('nuUser').value.trim(),
                    email: document.getElementById('nuEmail').value.trim(),
                    roleId: Number(document.getElementById('nuRole').value),
                    password: document.getElementById('nuPwd').value
                  }
                });
                window.AdminApp.showToast('Administrator account created.');
                close();
                await renderUsers(mount);
              } catch (err) { window.AdminApp.showToast(err.message, 'error'); }
            }
          }
        ]
      });
    }

    function openEditUserModal(u) {
      window.AdminApp.openModal({
        title: `Manage Account: ${u.username}`,
        bodyHtml: `
          <div class="form-group"><label class="form-label">Full Name</label><input type="text" id="euFull" class="form-control" value="${esc(u.full_name)}"></div>
          <div class="form-group"><label class="form-label">Email</label><input type="email" id="euEmail" class="form-control" value="${esc(u.email)}"></div>
          <div class="form-group"><label class="form-label">Role</label>
            <select id="euRole" class="form-control">${roles.map(r => `<option value="${r.id}" ${u.role_id === r.id ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select>
          </div>
          <label style="display:flex; align-items:center; gap:8px; margin-bottom:16px;">
            <input type="checkbox" id="euActive" ${u.is_active ? 'checked' : ''}> <span>Account Active</span>
          </label>
          <div style="border-top:1px solid #e2e8f0; padding-top:14px;">
            <label class="form-label">Admin Password Reset (Optional)</label>
            <div style="display:flex; gap:8px;">
              <input type="password" id="euResetPwd" class="form-control" placeholder="Enter new password (min 8 chars)">
              <button type="button" id="euDoResetBtn" class="btn btn-warning btn-sm">Reset Password</button>
            </div>
          </div>
        `,
        footerButtons: [
          { label: 'Cancel', className: 'btn btn-secondary' },
          {
            label: 'Save Account Changes',
            className: 'btn btn-primary',
            onClick: async ({ close }) => {
              try {
                await window.AdminApp.apiFetch(`/api/admin/users/${u.id}`, {
                  method: 'PUT',
                  body: {
                    fullName: document.getElementById('euFull').value.trim(),
                    email: document.getElementById('euEmail').value.trim(),
                    roleId: Number(document.getElementById('euRole').value),
                    isActive: document.getElementById('euActive').checked
                  }
                });
                window.AdminApp.showToast('User account updated.');
                close();
                await renderUsers(mount);
              } catch (err) { window.AdminApp.showToast(err.message, 'error'); }
            }
          }
        ],
        onReady: () => {
          document.getElementById('euDoResetBtn').addEventListener('click', async () => {
            try {
              await window.AdminApp.apiFetch(`/api/admin/users/${u.id}/reset-password`, {
                method: 'POST',
                body: { newPassword: document.getElementById('euResetPwd').value }
              });
              window.AdminApp.showToast(`Password reset for ${u.username}.`);
              document.getElementById('euResetPwd').value = '';
            } catch (err) { window.AdminApp.showToast(err.message, 'error'); }
          });
        }
      });
    }

    mount.innerHTML = `
      <div class="page-header-bar">
        <div><h1 class="page-heading">User Management</h1><p class="page-welcome">Create, assign roles, reset passwords, deactivate accounts, and audit login timestamps.</p></div>
        ${canManage ? '<button type="button" id="addUserBtn" class="btn btn-primary">+ Create Admin User</button>' : ''}
      </div>
      <div class="panel-card">
        <div class="table-wrap">
          <table class="admin-table">
            <thead><tr><th>User</th><th>Role</th><th>MFA</th><th>Last Login</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              ${users.map(u => `
                <tr>
                  <td><strong>${esc(u.full_name)}</strong><div style="font-size:12px;color:#64748b;">@${esc(u.username)} &bull; ${esc(u.email)}</div></td>
                  <td>${esc(u.role_name)}</td>
                  <td>${u.mfa_enabled ? '<span class="badge badge-published">Enabled</span>' : '<span class="badge badge-draft">Off</span>'}</td>
                  <td style="font-size:12px;">${esc(u.last_login_at || 'Never')}<br><span style="color:#64748b;">${esc(u.last_login_ip || '')}</span></td>
                  <td>${statusBadge(u.is_active ? 'Active' : 'Inactive')}</td>
                  <td>${canManage ? `<button type="button" class="btn btn-sm btn-secondary edit-usr-btn" data-id="${u.id}">Manage</button>` : 'View Only'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    const addBtn = document.getElementById('addUserBtn');
    if (addBtn) addBtn.addEventListener('click', openCreateUserModal);
    mount.querySelectorAll('.edit-usr-btn').forEach(b => {
      const u = users.find(x => x.id === Number(b.getAttribute('data-id')));
      if (u) b.addEventListener('click', () => openEditUserModal(u));
    });
  }

  async function renderRoles(mount) {
    const canManageRoles = window.AdminApp.hasPerm('roles:manage');
    const { roles, permissions } = await window.AdminApp.apiFetch('/api/admin/roles');

    mount.innerHTML = `
      <div class="page-header-bar">
        <div><h1 class="page-heading">Roles &amp; Permissions</h1><p class="page-welcome">Granular Role-Based Access Control matrix governing website modules and publishing approvals.</p></div>
      </div>
      <div class="panel-card">
        <div class="table-wrap">
          <table class="admin-table">
            <thead>
              <tr>
                <th>Permission Capability</th>
                ${roles.map(r => `<th style="text-align:center;">${esc(r.name)}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${permissions.map(p => `
                <tr>
                  <td><strong>${esc(p.module)}:</strong> ${esc(p.description)}<div style="font-size:11px;color:#64748b;"><code>${esc(p.code)}</code></div></td>
                  ${roles.map(r => {
                    const checked = r.permissionCodes.includes(p.code);
                    const disabled = !canManageRoles || r.slug === 'super_admin';
                    return `<td style="text-align:center;">
                      <input type="checkbox" class="role-perm-chk" data-role-id="${r.id}" data-code="${esc(p.code)}" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''}>
                    </td>`;
                  }).join('')}
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        ${canManageRoles ? `
          <div style="margin-top:16px; display:flex; gap:10px; flex-wrap:wrap;">
            ${roles.filter(r => r.slug !== 'super_admin').map(r => `
              <button type="button" class="btn btn-primary btn-sm save-role-btn" data-role-id="${r.id}">Save ${esc(r.name)} Permissions</button>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `;

    mount.querySelectorAll('.save-role-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const rid = Number(btn.getAttribute('data-role-id'));
        const codes = Array.from(mount.querySelectorAll(`.role-perm-chk[data-role-id="${rid}"]:checked`))
          .map(el => el.getAttribute('data-code'));
        try {
          await window.AdminApp.apiFetch(`/api/admin/roles/${rid}/permissions`, {
            method: 'PUT',
            body: { permissionCodes: codes }
          });
          window.AdminApp.showToast('Role permissions updated and logged.');
        } catch (err) { window.AdminApp.showToast(err.message, 'error'); }
      });
    });
  }

  async function renderAuditLogs(mount) {
    const { logs } = await window.AdminApp.apiFetch('/api/admin/audit-logs?limit=150');
    mount.innerHTML = `
      <div class="page-header-bar">
        <div><h1 class="page-heading">Activity &amp; Audit Logs</h1><p class="page-welcome">Immutable chronological log of logins, content updates, rate approvals, and security events.</p></div>
        <a href="/api/admin/audit-logs/export" class="btn btn-secondary">Export CSV Report</a>
      </div>
      <div class="panel-card">
        <div class="table-wrap">
          <table class="admin-table">
            <thead><tr><th>Timestamp</th><th>User</th><th>Role</th><th>Action</th><th>Module</th><th>Target</th><th>IP</th></tr></thead>
            <tbody>
              ${logs.map(l => `
                <tr>
                  <td style="font-size:12px; white-space:nowrap;">${esc(l.created_at)}</td>
                  <td><strong>${esc(l.username)}</strong></td>
                  <td>${esc(l.role_name)}</td>
                  <td><code>${esc(l.action)}</code></td>
                  <td>${esc(l.module)}</td>
                  <td>${esc(l.target_label || l.target_id || '-')}</td>
                  <td style="font-size:12px;">${esc(l.ip_address)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  async function renderSettings(mount) {
    const canManage = window.AdminApp.hasPerm('settings:manage');
    const [{ settings }, { backups }] = await Promise.all([
      window.AdminApp.apiFetch('/api/admin/settings'),
      canManage ? window.AdminApp.apiFetch('/api/admin/backups') : Promise.resolve({ backups: [] })
    ]);

    const map = {};
    for (const s of settings) map[s.setting_key] = s.setting_value;

    mount.innerHTML = `
      <div class="page-header-bar">
        <div><h1 class="page-heading">Settings &amp; Backups</h1><p class="page-welcome">Configure workflow approval requirements, canonical URLs, and manage SQLite + Media snapshot backups.</p></div>
      </div>
      <div class="grid-2col">
        <div class="panel-card">
          <div class="panel-title-row"><h2 class="panel-title">Publishing Workflow &amp; Portal Settings</h2></div>
          <div class="form-group">
            <label style="display:flex; align-items:center; gap:8px;">
              <input type="checkbox" id="setFinApproval" ${map.require_approval_financial === 'true' ? 'checked' : ''} ${!canManage ? 'disabled' : ''}>
              <span><strong>Require Approval Workflow</strong> before Interest Rate changes publish live</span>
            </label>
          </div>
          <div class="form-group">
            <label style="display:flex; align-items:center; gap:8px;">
              <input type="checkbox" id="setConApproval" ${map.require_approval_content === 'true' ? 'checked' : ''} ${!canManage ? 'disabled' : ''}>
              <span>Require Approval step for General Content updates</span>
            </label>
          </div>
          <div class="form-group"><label class="form-label">Admin Portal Canonical URL</label><input type="text" id="setAdminUrl" class="form-control" value="${esc(map.admin_portal_url || '')}" ${!canManage ? 'disabled' : ''}></div>
          <div class="form-group"><label class="form-label">Public Website Canonical URL</label><input type="text" id="setPublicUrl" class="form-control" value="${esc(map.public_site_url || '')}" ${!canManage ? 'disabled' : ''}></div>
          ${canManage ? '<button type="button" id="saveSettingsBtn" class="btn btn-primary">Save Settings</button>' : ''}
        </div>

        <div class="panel-card">
          <div class="panel-title-row">
            <h2 class="panel-title">Database &amp; Media Backups</h2>
            ${canManage ? '<button type="button" id="createBackupBtn" class="btn btn-success btn-sm">+ Create Backup Now</button>' : ''}
          </div>
          ${!canManage
            ? '<p>Backup operations are restricted to Super Administrators.</p>'
            : `
              <div class="table-wrap">
                <table class="admin-table">
                  <thead><tr><th>Snapshot</th><th>Size</th><th>Media</th><th>Download</th></tr></thead>
                  <tbody>
                    ${backups.map(b => `
                      <tr>
                        <td><strong>${esc(b.backupId)}</strong><div style="font-size:11.5px;color:#64748b;">By ${esc(b.createdBy)}</div></td>
                        <td>${formatBytes(b.dbSizeBytes)}</td>
                        <td>${b.uploadedFilesCount} files</td>
                        <td style="white-space:nowrap;">
                          <a href="/api/admin/backups/${esc(b.backupId)}/cms-export.json" class="btn btn-sm btn-secondary">JSON</a>
                          <a href="/api/admin/backups/${esc(b.backupId)}/wdpcs_cms.sqlite" class="btn btn-sm btn-primary">SQLite</a>
                        </td>
                      </tr>
                    `).join('') || '<tr><td colspan="4">No snapshots created yet. Click Create Backup Now.</td></tr>'}
                  </tbody>
                </table>
              </div>
            `}
        </div>
      </div>
    `;

    const saveBtn = document.getElementById('saveSettingsBtn');
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        try {
          await window.AdminApp.apiFetch('/api/admin/settings', {
            method: 'PUT',
            body: {
              settings: {
                require_approval_financial: String(document.getElementById('setFinApproval').checked),
                require_approval_content: String(document.getElementById('setConApproval').checked),
                admin_portal_url: document.getElementById('setAdminUrl').value.trim(),
                public_site_url: document.getElementById('setPublicUrl').value.trim()
              }
            }
          });
          window.AdminApp.showToast('System settings updated.');
        } catch (err) { window.AdminApp.showToast(err.message, 'error'); }
      });
    }

    const bkBtn = document.getElementById('createBackupBtn');
    if (bkBtn) {
      bkBtn.addEventListener('click', async () => {
        bkBtn.disabled = true;
        try {
          await window.AdminApp.apiFetch('/api/admin/backups', { method: 'POST', body: { note: 'Manual portal snapshot' } });
          window.AdminApp.showToast('Full database & media snapshot created safely.');
          await renderSettings(mount);
        } catch (err) { window.AdminApp.showToast(err.message, 'error'); }
        finally { bkBtn.disabled = false; }
      });
    }
  }

  async function render(moduleKey, mount) {
    if (moduleKey === 'users') return renderUsers(mount);
    if (moduleKey === 'roles') return renderRoles(mount);
    if (moduleKey === 'audit') return renderAuditLogs(mount);
    if (moduleKey === 'settings') return renderSettings(mount);
  }

  return { render };
})();

