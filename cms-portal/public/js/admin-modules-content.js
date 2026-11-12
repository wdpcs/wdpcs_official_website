'use strict';

window.AdminModulesContent = (() => {
  const { esc, statusBadge, createRichEditor } = window.AdminUtils;

  async function renderRevisionsModal(entityType, entityId, restoreEndpoint) {
    const data = await window.AdminApp.apiFetch(`/api/admin/revisions/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`);
    window.AdminApp.openModal({
      title: `Revision History (${entityId})`,
      bodyHtml: data.revisions.length === 0
        ? '<p>No saved revisions recorded yet.</p>'
        : `<div class="table-wrap"><table class="admin-table">
            <thead><tr><th>Version</th><th>Note</th><th>By</th><th>Date</th><th>Action</th></tr></thead>
            <tbody>
              ${data.revisions.map(rev => `
                <tr>
                  <td><strong>${esc(rev.version_label)}</strong></td>
                  <td>${esc(rev.change_note || '-')}</td>
                  <td>${esc(rev.created_by_name)}</td>
                  <td>${esc(rev.created_at)}</td>
                  <td>
                    ${restoreEndpoint
                      ? `<button type="button" class="btn btn-sm btn-warning restore-rev-btn" data-rev-id="${rev.id}">Restore Draft</button>`
                      : '<span style="color:#64748b;font-size:12px;">Snapshot</span>'}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table></div>`,
      footerButtons: [{ label: 'Close', className: 'btn btn-secondary' }],
      onReady: (bodyEl) => {
        if (!restoreEndpoint) return;
        bodyEl.querySelectorAll('.restore-rev-btn').forEach(btn => {
          btn.addEventListener('click', async () => {
            try {
              await window.AdminApp.apiFetch(restoreEndpoint, {
                method: 'POST',
                body: { revisionId: Number(btn.getAttribute('data-rev-id')) }
              });
              window.AdminApp.showToast('Revision restored to Draft. Review and Publish when ready.');
              window.AdminApp.closeModal();
              await window.AdminApp.navigateTo(window.AdminApp.state.activeModule);
            } catch (err) {
              window.AdminApp.showToast(err.message, 'error');
            }
          });
        });
      }
    });
  }

  async function renderGeneralOrHomepage(moduleKey, mount) {
    const canEdit = window.AdminApp.hasPerm('content:edit');
    const canPublish = window.AdminApp.hasPerm('content:publish');
    const res = await window.AdminApp.apiFetch('/api/admin/content');
    const wantedKeys = moduleKey === 'homepage'
      ? ['homepage_management']
      : ['general_about', 'general_contact', 'general_governance'];
    const sections = res.sections.filter(s => wantedKeys.includes(s.section_key));

    mount.innerHTML = `
      <div class="page-header-bar">
        <div>
          <h1 class="page-heading">${moduleKey === 'homepage' ? 'Homepage Content Management' : 'General Website Content'}</h1>
          <p class="page-welcome">${moduleKey === 'homepage'
            ? 'Manage featured announcement banner, homepage about preview, Santhwanam highlight, and display counts.'
            : 'Update About the Society, Mission, Vision, History, Classification, Board of Directors, Staff, Contact Details & Office Hours.'}</p>
        </div>
      </div>
      <div id="contentSectionsWrap"></div>
    `;

    const wrap = mount.querySelector('#contentSectionsWrap');
    for (const sec of sections) {
      const card = document.createElement('div');
      card.className = 'panel-card';
      const payload = sec.draft_payload || {};

      let fieldsHtml = '';
      if (sec.section_key === 'general_about') {
        fieldsHtml = `
          <div class="form-group"><label class="form-label">Headline</label><input type="text" class="form-control fld" data-k="headline" value="${esc(payload.headline || '')}"></div>
          <div class="form-group"><label class="form-label">Introduction (Rich Text)</label><div id="rte_${sec.section_key}_intro"></div></div>
          <div class="form-group"><label class="form-label">Society History (Rich Text)</label><div id="rte_${sec.section_key}_history"></div></div>
          <div class="grid-2col">
            <div class="form-group"><label class="form-label">Mission Statement</label><textarea class="form-control fld" data-k="mission" rows="3">${esc(payload.mission || '')}</textarea></div>
            <div class="form-group"><label class="form-label">Vision Statement</label><textarea class="form-control fld" data-k="vision" rows="3">${esc(payload.vision || '')}</textarea></div>
          </div>
          <div class="grid-2col">
            <div class="form-group"><label class="form-label">Registration Date</label><input type="text" class="form-control fld" data-k="registrationDate" value="${esc(payload.registrationDate || '')}"></div>
            <div class="form-group"><label class="form-label">Commencement Date</label><input type="text" class="form-control fld" data-k="commencementDate" value="${esc(payload.commencementDate || '')}"></div>
          </div>
          <div class="form-group"><label class="form-label">Society Classification</label><input type="text" class="form-control fld" data-k="classification" value="${esc(payload.classification || '')}"></div>
        `;
      } else if (sec.section_key === 'general_contact') {
        fieldsHtml = `
          <div class="grid-2col">
            <div class="form-group"><label class="form-label">Address Line 1</label><input type="text" class="form-control fld" data-k="addressLine1" value="${esc(payload.addressLine1 || '')}"></div>
            <div class="form-group"><label class="form-label">Address Line 2</label><input type="text" class="form-control fld" data-k="addressLine2" value="${esc(payload.addressLine2 || '')}"></div>
            <div class="form-group"><label class="form-label">Office Telephone</label><input type="text" class="form-control fld" data-k="telephone" value="${esc(payload.telephone || '')}"></div>
            <div class="form-group"><label class="form-label">Official Mobile / WhatsApp</label><input type="text" class="form-control fld" data-k="mobile" value="${esc(payload.mobile || '')}"></div>
            <div class="form-group"><label class="form-label">Official Email</label><input type="text" class="form-control fld" data-k="email" value="${esc(payload.email || '')}"></div>
            <div class="form-group"><label class="form-label">Office Hours</label><input type="text" class="form-control fld" data-k="officeHours" value="${esc(payload.officeHours || '')}"></div>
          </div>
          <div class="form-group"><label class="form-label">Holiday / Working Hours Note</label><input type="text" class="form-control fld" data-k="officeHoursNote" value="${esc(payload.officeHoursNote || '')}"></div>
        `;
      } else if (sec.section_key === 'general_governance') {
        const dirs = Array.isArray(payload.directors) ? payload.directors : [];
        const resolveImg = p => (!p ? '/images/wdpcs-logo.svg' : (p.startsWith('/') ? p : '/' + p));
        const secPhoto = (payload.secretary && payload.secretary.photo) || 'assets/images/secretary-rajani-k-k.jpg?v=2';
        fieldsHtml = `
          <div class="form-group"><label class="form-label">Board Introduction</label><textarea class="form-control fld" data-k="boardIntro" rows="2">${esc(payload.boardIntro || '')}</textarea></div>
          <div class="form-group">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; flex-wrap:wrap; gap:8px;">
              <label class="form-label" style="margin:0;">Board of Directors Members (Photo, Role, Name &amp; Phone)</label>
              ${canEdit ? `<button type="button" class="btn btn-sm btn-primary add-dir-btn">+ Add Director</button>` : ''}
            </div>
            <div class="directors-list" style="display:flex; flex-direction:column; gap:8px;">
              ${dirs.map((d, i) => `
                <div class="dir-row" data-idx="${i}" data-photo="${esc(d.photo || '')}">
                  <div class="dir-photo-cell">
                    <img src="${esc(resolveImg(d.photo))}" alt="${esc(d.name || 'Director')}" class="dir-thumb-img">
                    ${canEdit ? `
                      <input type="file" class="dir-photo-input" accept="image/jpeg,image/png,image/webp" style="display:none;">
                      <button type="button" class="btn btn-sm btn-secondary change-dir-photo-btn">Photo</button>
                    ` : ''}
                  </div>
                  <input type="text" class="form-control dir-role" value="${esc(d.role)}" placeholder="Role (e.g. Director)">
                  <input type="text" class="form-control dir-name" value="${esc(d.name)}" placeholder="Full Name">
                  <input type="text" class="form-control dir-phone" value="${esc(d.phone)}" placeholder="Phone">
                  ${canEdit ? `<button type="button" class="btn btn-sm btn-danger remove-dir-btn" title="Remove member">&times;</button>` : '<span></span>'}
                </div>
              `).join('')}
            </div>
          </div>
          <div class="panel-card" style="padding:14px; margin-bottom:14px; background:#f8fafc;">
            <label class="form-label">Executive Administration — Secretary &amp; Staff</label>
            <div class="grid-2col" style="align-items:center;">
              <div style="display:flex; align-items:center; gap:12px;">
                <div class="sec-photo-wrap" data-photo="${esc(secPhoto)}" style="display:flex; align-items:center; gap:8px;">
                  <img src="${esc(resolveImg(secPhoto))}" alt="Secretary" class="dir-thumb-img sec-thumb-img">
                  ${canEdit ? `
                    <input type="file" class="sec-photo-input" accept="image/jpeg,image/png,image/webp" style="display:none;">
                    <button type="button" class="btn btn-sm btn-secondary change-sec-photo-btn">Change Photo</button>
                  ` : ''}
                </div>
                <div style="flex:1;"><label class="form-label">Secretary Name</label><input type="text" class="form-control fld" data-k="secretaryName" value="${esc((payload.secretary && payload.secretary.name) || '')}"></div>
              </div>
              <div class="form-group" style="margin:0;"><label class="form-label">Staff Information Note</label><input type="text" class="form-control fld" data-k="staffNote" value="${esc(payload.staffNote || '')}"></div>
            </div>
          </div>
        `;
      } else if (sec.section_key === 'homepage_management') {
        fieldsHtml = `
          <div class="form-group"><label class="form-label">Top Announcement Ticker Text</label><input type="text" class="form-control fld" data-k="announcementBanner" value="${esc(payload.announcementBanner || '')}"></div>
          <div class="form-group"><label class="form-label">About Society Preview Title</label><input type="text" class="form-control fld" data-k="aboutPreviewTitle" value="${esc(payload.aboutPreviewTitle || '')}"></div>
          <div class="form-group"><label class="form-label">About Society Preview Summary</label><textarea class="form-control fld" data-k="aboutPreviewText" rows="2">${esc(payload.aboutPreviewText || '')}</textarea></div>
          <div class="form-group"><label class="form-label">Santhwanam Homepage Highlight Title</label><input type="text" class="form-control fld" data-k="santhwanamHighlightTitle" value="${esc(payload.santhwanamHighlightTitle || '')}"></div>
          <div class="form-group"><label class="form-label">Santhwanam Homepage Highlight Summary</label><textarea class="form-control fld" data-k="santhwanamHighlightText" rows="2">${esc(payload.santhwanamHighlightText || '')}</textarea></div>
        `;
      }

      card.innerHTML = `
        <div class="panel-title-row">
          <div>
            <h2 class="panel-title">${esc(sec.title)}</h2>
            <span style="font-size:12px; color:#64748b;">Version v${sec.version_number} &bull; Last updated: ${esc(sec.updated_at)}</span>
          </div>
          <div style="display:flex; gap:8px; align-items:center;">
            ${statusBadge(sec.workflow_status)}
            <button type="button" class="btn btn-sm btn-secondary preview-sec-btn">Preview</button>
            <button type="button" class="btn btn-sm btn-secondary rev-sec-btn">Revisions</button>
          </div>
        </div>
        <div class="sec-fields">${fieldsHtml}</div>
        ${canEdit ? `
          <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:14px; padding-top:12px; border-top:1px solid #e2e8f0; align-items:center;">
            <input type="text" class="form-control sec-note" style="max-width:260px;" placeholder="Change note (optional)">
            <button type="button" class="btn btn-secondary btn-sm save-sec-btn" data-action="save_draft">Save Draft</button>
            <button type="button" class="btn btn-warning btn-sm save-sec-btn" data-action="submit_approval">Submit for Approval</button>
            ${canPublish ? `<button type="button" class="btn btn-success btn-sm save-sec-btn" data-action="publish">Publish Live</button>` : ''}
          </div>
        ` : `<div class="alert alert-info" style="margin-top:12px;">Read-only access (${esc(window.AdminApp.state.user.role_name)}).</div>`}
      `;

      wrap.appendChild(card);

      let introEditor = null;
      let historyEditor = null;
      if (sec.section_key === 'general_about') {
        introEditor = createRichEditor({ mountId: `rte_${sec.section_key}_intro`, initialHtml: payload.introHtml || '' });
        historyEditor = createRichEditor({ mountId: `rte_${sec.section_key}_history`, initialHtml: payload.historyHtml || '' });
      }

      if (sec.section_key === 'general_governance' && canEdit) {
        const bindDirectorRowEvents = (rowEl) => {
          const fileInput = rowEl.querySelector('.dir-photo-input');
          const btn = rowEl.querySelector('.change-dir-photo-btn');
          const img = rowEl.querySelector('.dir-thumb-img');
          const remBtn = rowEl.querySelector('.remove-dir-btn');
          if (btn && fileInput) {
            btn.addEventListener('click', () => fileInput.click());
            fileInput.addEventListener('change', async () => {
              const file = fileInput.files && fileInput.files[0];
              if (!file) return;
              const origLabel = btn.textContent;
              btn.disabled = true;
              btn.textContent = '...';
              try {
                const fd = new FormData();
                fd.append('photo', file);
                const up = await window.AdminApp.apiFetch('/api/admin/content/governance/photo', { method: 'POST', body: fd });
                rowEl.setAttribute('data-photo', up.photoUrl);
                if (img) img.src = up.photoUrl;
                window.AdminApp.showToast('Director photo uploaded! Save Draft or Publish Live to update the public page.');
              } catch (err) {
                window.AdminApp.showToast(err.message, 'error');
              } finally {
                btn.disabled = false;
                btn.textContent = origLabel;
                fileInput.value = '';
              }
            });
          }
          if (remBtn) {
            remBtn.addEventListener('click', () => {
              if (card.querySelectorAll('.dir-row').length <= 1) {
                window.AdminApp.showToast('At least one Board member entry must remain.', 'warn');
                return;
              }
              rowEl.remove();
            });
          }
        };

        card.querySelectorAll('.dir-row').forEach(bindDirectorRowEvents);

        const addDirBtn = card.querySelector('.add-dir-btn');
        const listEl = card.querySelector('.directors-list');
        if (addDirBtn && listEl) {
          addDirBtn.addEventListener('click', () => {
            const newRow = document.createElement('div');
            newRow.className = 'dir-row';
            newRow.setAttribute('data-photo', '');
            newRow.innerHTML = `
              <div class="dir-photo-cell">
                <img src="/images/wdpcs-logo.svg" alt="New Director" class="dir-thumb-img">
                <input type="file" class="dir-photo-input" accept="image/jpeg,image/png,image/webp" style="display:none;">
                <button type="button" class="btn btn-sm btn-secondary change-dir-photo-btn">Photo</button>
              </div>
              <input type="text" class="form-control dir-role" value="Director" placeholder="Role">
              <input type="text" class="form-control dir-name" value="" placeholder="Full Name">
              <input type="text" class="form-control dir-phone" value="" placeholder="Phone">
              <button type="button" class="btn btn-sm btn-danger remove-dir-btn" title="Remove member">&times;</button>
            `;
            listEl.appendChild(newRow);
            bindDirectorRowEvents(newRow);
          });
        }

        const secWrap = card.querySelector('.sec-photo-wrap');
        const secFile = card.querySelector('.sec-photo-input');
        const secBtn = card.querySelector('.change-sec-photo-btn');
        const secImg = card.querySelector('.sec-thumb-img');
        if (secBtn && secFile && secWrap) {
          secBtn.addEventListener('click', () => secFile.click());
          secFile.addEventListener('change', async () => {
            const file = secFile.files && secFile.files[0];
            if (!file) return;
            secBtn.disabled = true;
            try {
              const fd = new FormData();
              fd.append('photo', file);
              const up = await window.AdminApp.apiFetch('/api/admin/content/governance/photo', { method: 'POST', body: fd });
              secWrap.setAttribute('data-photo', up.photoUrl);
              if (secImg) secImg.src = up.photoUrl;
              window.AdminApp.showToast('Secretary photo uploaded! Save Draft or Publish Live to apply.');
            } catch (err) {
              window.AdminApp.showToast(err.message, 'error');
            } finally {
              secBtn.disabled = false;
              secFile.value = '';
            }
          });
        }
      }

      function gatherPayload() {
        const out = Object.assign({}, payload);
        card.querySelectorAll('.fld').forEach(el => {
          out[el.getAttribute('data-k')] = el.value.trim();
        });
        if (introEditor) out.introHtml = introEditor.getHtml();
        if (historyEditor) out.historyHtml = historyEditor.getHtml();
        if (sec.section_key === 'general_governance') {
          out.directors = Array.from(card.querySelectorAll('.dir-row')).map((row) => ({
            role: row.querySelector('.dir-role').value.trim(),
            name: row.querySelector('.dir-name').value.trim(),
            phone: row.querySelector('.dir-phone').value.trim(),
            photo: row.getAttribute('data-photo') || ''
          }));
          const secWrap = card.querySelector('.sec-photo-wrap');
          out.secretary = Object.assign({}, payload.secretary || {}, {
            name: out.secretaryName || (payload.secretary && payload.secretary.name),
            photo: (secWrap && secWrap.getAttribute('data-photo')) || (payload.secretary && payload.secretary.photo) || ''
          });
          delete out.secretaryName;
        }
        return out;
      }

      card.querySelector('.preview-sec-btn').addEventListener('click', () => {
        const previewData = gatherPayload();
        window.AdminApp.openModal({
          title: `Live Content Preview — ${sec.title}`,
          bodyHtml: `<pre style="white-space:pre-wrap; font-family:inherit; background:#f8fafc; padding:14px; border-radius:8px; border:1px solid #e2e8f0;">${esc(JSON.stringify(previewData, null, 2))}</pre>`,
          footerButtons: [{ label: 'Close Preview', className: 'btn btn-secondary' }]
        });
      });

      card.querySelector('.rev-sec-btn').addEventListener('click', () => {
        renderRevisionsModal('website_content', sec.section_key, canEdit ? `/api/admin/content/${sec.section_key}/restore` : null);
      });

      card.querySelectorAll('.save-sec-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          try {
            const action = btn.getAttribute('data-action');
            const changeNote = card.querySelector('.sec-note').value.trim();
            await window.AdminApp.apiFetch(`/api/admin/content/${sec.section_key}`, {
              method: 'PUT',
              body: { action, changeNote, payload: gatherPayload() }
            });
            window.AdminApp.showToast(`${sec.title}: ${action === 'publish' ? 'Published live!' : (action === 'submit_approval' ? 'Submitted for approval.' : 'Draft saved.')}`);
            await renderGeneralOrHomepage(moduleKey, mount);
          } catch (err) {
            window.AdminApp.showToast(err.message, 'error');
          }
        });
      });
    }
  }

  async function renderFinancialModule(moduleKey, mount) {
    const canEdit = window.AdminApp.hasPerm('financial:edit');
    const canPublish = window.AdminApp.hasPerm('financial:publish');
    const [{ deposits, loans }, { history }] = await Promise.all([
      window.AdminApp.apiFetch('/api/admin/financial/products'),
      window.AdminApp.apiFetch('/api/admin/financial/rate-history')
    ]);

    const pendingHistory = history.filter(h => h.approval_status === 'Pending');
    const showDeposits = moduleKey === 'deposits' || moduleKey === 'rates';
    const showLoans = moduleKey === 'loans' || moduleKey === 'rates';

    function openEditRateModal(type, item) {
      const target = item.draft_payload || item;
      window.AdminApp.openModal({
        title: `Edit ${type === 'deposit' ? 'Deposit' : 'Loan'} Scheme: ${item.product_name}`,
        bodyHtml: `
          <div class="alert alert-info">
            Updating the Interest Rate never overwrites previous rate history. All changes retain Effective Date, Change Timestamp, Updated By, and Approved By.
          </div>
          <form id="rateEditForm">
            <div class="grid-2col">
              <div class="form-group"><label class="form-label">Product Name</label><input type="text" id="finProdName" class="form-control" value="${esc(target.product_name)}" required></div>
              <div class="form-group"><label class="form-label">Current / New Interest Rate</label><input type="text" id="finRate" class="form-control" value="${esc(target.interest_rate)}" required></div>
              <div class="form-group"><label class="form-label">Rate Type</label><input type="text" id="finRateType" class="form-control" value="${esc(target.rate_type)}" required></div>
              <div class="form-group"><label class="form-label">Status</label>
                <select id="finStatus" class="form-control">
                  <option value="Active" ${target.status === 'Active' ? 'selected' : ''}>Active</option>
                  <option value="Inactive" ${target.status === 'Inactive' ? 'selected' : ''}>Inactive</option>
                </select>
              </div>
              <div class="form-group"><label class="form-label">Effective From</label><input type="date" id="finEffFrom" class="form-control" value="${esc(target.effective_from)}" required></div>
              <div class="form-group"><label class="form-label">Effective Until (Optional)</label><input type="date" id="finEffUntil" class="form-control" value="${esc(target.effective_until || '')}"></div>
              ${type === 'deposit'
                ? `<div class="form-group"><label class="form-label">Minimum Deposit</label><input type="text" id="finMinAmt" class="form-control" value="${esc(target.min_amount || '')}"></div>`
                : `<div class="form-group"><label class="form-label">Maximum Loan Amount</label><input type="text" id="finMaxAmt" class="form-control" value="${esc(target.max_amount || '')}"></div>`
              }
              <div class="form-group"><label class="form-label">Tenure</label><input type="text" id="finTenure" class="form-control" value="${esc(target.tenure || '')}"></div>
            </div>
            ${type === 'loan' ? `
              <div class="grid-2col">
                <div class="form-group"><label class="form-label">Repayment Mode</label><input type="text" id="finRepay" class="form-control" value="${esc(target.repayment_mode || '')}"></div>
                <div class="form-group"><label class="form-label">Required Documents</label><input type="text" id="finReqDocs" class="form-control" value="${esc(target.required_documents || '')}"></div>
              </div>` : ''}
            <div class="form-group"><label class="form-label">Eligibility</label><input type="text" id="finElig" class="form-control" value="${esc(target.eligibility || '')}"></div>
            <div class="form-group"><label class="form-label">Description</label><textarea id="finDesc" class="form-control" rows="2">${esc(target.description || '')}</textarea></div>
            <div class="form-group"><label class="form-label">Reason / Circular Ref for Audit Trail</label><input type="text" id="finReason" class="form-control" placeholder="e.g. Board Resolution No. ... / Annual Review"></div>
          </form>
        `,
        footerButtons: [
          { label: 'Cancel', className: 'btn btn-secondary' },
          ...(canEdit ? [
            {
              label: 'Save Draft',
              className: 'btn btn-secondary',
              onClick: async ({ close }) => { await submitRateForm('save_draft', close); }
            },
            {
              label: 'Submit for Approval',
              className: 'btn btn-warning',
              onClick: async ({ close }) => { await submitRateForm('submit_approval', close); }
            }
          ] : []),
          ...(canPublish ? [
            {
              label: 'Publish Live Immediately',
              className: 'btn btn-success',
              onClick: async ({ close }) => { await submitRateForm('publish', close); }
            }
          ] : [])
        ]
      });

      async function submitRateForm(action, close) {
        try {
          const body = {
            action,
            forceDirectPublish: action === 'publish',
            productName: document.getElementById('finProdName').value.trim(),
            interestRate: document.getElementById('finRate').value.trim(),
            rateType: document.getElementById('finRateType').value.trim(),
            status: document.getElementById('finStatus').value,
            effectiveFrom: document.getElementById('finEffFrom').value,
            effectiveUntil: document.getElementById('finEffUntil').value || null,
            tenure: document.getElementById('finTenure').value.trim(),
            eligibility: document.getElementById('finElig').value.trim(),
            description: document.getElementById('finDesc').value.trim(),
            changeReason: document.getElementById('finReason').value.trim()
          };
          if (type === 'deposit') body.minAmount = document.getElementById('finMinAmt').value.trim();
          else {
            body.maxAmount = document.getElementById('finMaxAmt').value.trim();
            body.repaymentMode = document.getElementById('finRepay').value.trim();
            body.requiredDocuments = document.getElementById('finReqDocs').value.trim();
          }

          const ep = type === 'deposit' ? `/api/admin/financial/deposits/${item.id}` : `/api/admin/financial/loans/${item.id}`;
          await window.AdminApp.apiFetch(ep, { method: 'PUT', body });
          window.AdminApp.showToast(`Saved "${body.productName}" (${action}).`);
          close();
          await renderFinancialModule(moduleKey, mount);
        } catch (err) {
          window.AdminApp.showToast(err.message, 'error');
        }
      }
    }

    mount.innerHTML = `
      <div class="page-header-bar">
        <div>
          <h1 class="page-heading">${moduleKey === 'deposits' ? 'Deposit Information' : (moduleKey === 'loans' ? 'Loan Information' : 'Interest Rate Management')}</h1>
          <p class="page-welcome">Manage Deposit &amp; Loan schemes, effective dates, approval queue, and complete immutable Interest Rate History.</p>
        </div>
      </div>

      ${pendingHistory.length > 0 ? `
        <div class="panel-card" style="border-left:4px solid #d97706;">
          <div class="panel-title-row">
            <h2 class="panel-title">Pending Rate Approvals (${pendingHistory.length})</h2>
          </div>
          <div class="table-wrap">
            <table class="admin-table">
              <thead><tr><th>Product</th><th>Previous Rate</th><th>Proposed Rate</th><th>Effective From</th><th>Submitted By</th><th>Action</th></tr></thead>
              <tbody>
                ${pendingHistory.map(p => `
                  <tr>
                    <td><strong>${esc(p.product_name)}</strong> (${esc(p.product_type)})</td>
                    <td>${esc(p.previous_rate)}</td>
                    <td><strong>${esc(p.new_rate)}</strong></td>
                    <td>${esc(p.effective_from)}</td>
                    <td>${esc(p.changed_by_name)}</td>
                    <td>
                      ${canPublish ? `
                        <button type="button" class="btn btn-sm btn-success approve-rate-btn" data-id="${p.id}">Approve &amp; Publish</button>
                        <button type="button" class="btn btn-sm btn-danger reject-rate-btn" data-id="${p.id}">Reject</button>
                      ` : '<span class="badge badge-pending">Awaiting Approver</span>'}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      ` : ''}

      ${showDeposits ? `
        <div class="panel-card">
          <div class="panel-title-row"><h2 class="panel-title">Deposit Products (5 Categories)</h2></div>
          <div class="table-wrap">
            <table class="admin-table">
              <thead><tr><th>Product Name</th><th>Interest Rate</th><th>Rate Type</th><th>Effective From</th><th>Last Updated</th><th>Status</th><th>Action</th></tr></thead>
              <tbody>
                ${deposits.map(d => `
                  <tr>
                    <td><strong>${esc(d.product_name)}</strong><div style="font-size:12px;color:#64748b;">Min: ${esc(d.min_amount)}</div></td>
                    <td><strong>${esc(d.interest_rate)}</strong></td>
                    <td>${esc(d.rate_type)}</td>
                    <td>${esc(d.effective_from)}${d.effective_until ? ` to ${esc(d.effective_until)}` : ''}</td>
                    <td style="font-size:12px;">${esc(d.last_updated)}</td>
                    <td>${statusBadge(d.workflow_status)}</td>
                    <td>${canEdit || canPublish ? `<button type="button" class="btn btn-sm btn-primary edit-dep-btn" data-id="${d.id}">Edit / Rate</button>` : 'Read-Only'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      ` : ''}

      ${showLoans ? `
        <div class="panel-card">
          <div class="panel-title-row"><h2 class="panel-title">Loan Products (5 Categories)</h2></div>
          <div class="table-wrap">
            <table class="admin-table">
              <thead><tr><th>Product Name</th><th>Max Amount</th><th>Interest Rate</th><th>Effective From</th><th>Last Updated</th><th>Status</th><th>Action</th></tr></thead>
              <tbody>
                ${loans.map(l => `
                  <tr>
                    <td><strong>${esc(l.product_name)}</strong><div style="font-size:12px;color:#64748b;">${esc(l.tenure)} &bull; ${esc(l.repayment_mode)}</div></td>
                    <td>${esc(l.max_amount)}</td>
                    <td><strong>${esc(l.interest_rate)}</strong></td>
                    <td>${esc(l.effective_from)}${l.effective_until ? ` to ${esc(l.effective_until)}` : ''}</td>
                    <td style="font-size:12px;">${esc(l.last_updated)}</td>
                    <td>${statusBadge(l.workflow_status)}</td>
                    <td>${canEdit || canPublish ? `<button type="button" class="btn btn-sm btn-primary edit-loan-btn" data-id="${l.id}">Edit / Rate</button>` : 'Read-Only'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      ` : ''}

      <div class="panel-card">
        <div class="panel-title-row">
          <h2 class="panel-title">Immutable Interest Rate Change History</h2>
          <span style="font-size:12px; color:#64748b;">Previous records are never overwritten</span>
        </div>
        <div class="table-wrap">
          <table class="admin-table">
            <thead><tr><th>Product</th><th>Previous Rate</th><th>New Rate</th><th>Effective Date</th><th>Updated By</th><th>Approved By</th><th>Approval</th><th>Timestamp</th></tr></thead>
            <tbody>
              ${history.map(h => `
                <tr>
                  <td><strong>${esc(h.product_name)}</strong> <span style="font-size:11px;color:#64748b;">(${esc(h.product_type)})</span></td>
                  <td>${esc(h.previous_rate)}</td>
                  <td><strong>${esc(h.new_rate)}</strong></td>
                  <td>${esc(h.effective_from)}</td>
                  <td>${esc(h.changed_by_name)}</td>
                  <td>${esc(h.approved_by_name || '-')}</td>
                  <td>${statusBadge(h.approval_status)}</td>
                  <td style="font-size:11.5px;">${esc(h.changed_at)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    mount.querySelectorAll('.edit-dep-btn').forEach(b => {
      const item = deposits.find(x => x.id === Number(b.getAttribute('data-id')));
      if (item) b.addEventListener('click', () => openEditRateModal('deposit', item));
    });
    mount.querySelectorAll('.edit-loan-btn').forEach(b => {
      const item = loans.find(x => x.id === Number(b.getAttribute('data-id')));
      if (item) b.addEventListener('click', () => openEditRateModal('loan', item));
    });
    mount.querySelectorAll('.approve-rate-btn').forEach(b => {
      b.addEventListener('click', async () => {
        try {
          await window.AdminApp.apiFetch(`/api/admin/financial/rate-history/${b.getAttribute('data-id')}/approve`, { method: 'POST', body: {} });
          window.AdminApp.showToast('Interest rate change approved and published live!');
          await renderFinancialModule(moduleKey, mount);
        } catch (err) { window.AdminApp.showToast(err.message, 'error'); }
      });
    });
    mount.querySelectorAll('.reject-rate-btn').forEach(b => {
      b.addEventListener('click', async () => {
        try {
          await window.AdminApp.apiFetch(`/api/admin/financial/rate-history/${b.getAttribute('data-id')}/reject`, { method: 'POST', body: {} });
          window.AdminApp.showToast('Proposed rate change rejected.', 'warn');
          await renderFinancialModule(moduleKey, mount);
        } catch (err) { window.AdminApp.showToast(err.message, 'error'); }
      });
    });
  }

  async function renderSanthwanam(mount) {
    const canEdit = window.AdminApp.hasPerm('santhwanam:manage') || window.AdminApp.hasPerm('content:edit');
    const canPublish = window.AdminApp.hasPerm('santhwanam:publish') || window.AdminApp.hasPerm('content:publish');
    const { sections } = await window.AdminApp.apiFetch('/api/admin/santhwanam');

    mount.innerHTML = `
      <div class="page-header-bar">
        <div>
          <h1 class="page-heading">Santhwanam Welfare Scheme Management</h1>
          <p class="page-welcome">Edit scheme introduction, lifetime premium info (₹500), medical &amp; death benefits, and 3-step access guide.</p>
        </div>
      </div>
      <div class="alert alert-warn">
        <strong>Society Policy Enforcement:</strong> Santhwanam sub-rules are strictly prohibited from being uploaded, quoted, or published on the website. Only the two official Santhwanam forms are managed under Downloads.
      </div>
      <div id="santhWrap"></div>
    `;

    const wrap = mount.querySelector('#santhWrap');
    for (const sec of sections) {
      const p = sec.draft_payload || {};
      const card = document.createElement('div');
      card.className = 'panel-card';

      let inner = '';
      if (sec.section_key === 'santhwanam_overview') {
        inner = `
          <div class="grid-2col">
            <div class="form-group"><label class="form-label">Scheme Title</label><input type="text" class="form-control fld" data-k="title" value="${esc(p.title || '')}"></div>
            <div class="form-group"><label class="form-label">Tagline</label><input type="text" class="form-control fld" data-k="tagline" value="${esc(p.tagline || '')}"></div>
            <div class="form-group"><label class="form-label">Lifetime Premium Display</label><input type="text" class="form-control fld" data-k="lifetimePremiumAmount" value="${esc(p.lifetimePremiumAmount || '')}"></div>
            <div class="form-group"><label class="form-label">Premium Subtitle</label><input type="text" class="form-control fld" data-k="lifetimePremiumNote" value="${esc(p.lifetimePremiumNote || '')}"></div>
          </div>
          <div class="form-group"><label class="form-label">Scheme Introduction Paragraphs (One per line)</label>
            <textarea class="form-control fld-lines" data-k="introParagraphs" rows="4">${esc((p.introParagraphs || []).join('\n'))}</textarea>
          </div>
        `;
      } else if (sec.section_key === 'santhwanam_benefits') {
        inner = `
          <div class="grid-2col">
            <div>
              <div class="form-group"><label class="form-label">Medical Assistance Title</label><input type="text" class="form-control fld" data-k="medicalTitle" value="${esc(p.medicalTitle || '')}"></div>
              <div class="form-group"><label class="form-label">Medical Description</label><textarea class="form-control fld" data-k="medicalDescription" rows="3">${esc(p.medicalDescription || '')}</textarea></div>
              <div class="form-group"><label class="form-label">Medical Checklist (One item per line)</label><textarea class="form-control fld-lines" data-k="medicalChecklist" rows="3">${esc((p.medicalChecklist || []).join('\n'))}</textarea></div>
            </div>
            <div>
              <div class="form-group"><label class="form-label">Death Benefit Title</label><input type="text" class="form-control fld" data-k="deathTitle" value="${esc(p.deathTitle || '')}"></div>
              <div class="form-group"><label class="form-label">Death Benefit Description</label><textarea class="form-control fld" data-k="deathDescription" rows="3">${esc(p.deathDescription || '')}</textarea></div>
              <div class="form-group"><label class="form-label">Death Claim Checklist (One item per line)</label><textarea class="form-control fld-lines" data-k="deathChecklist" rows="3">${esc((p.deathChecklist || []).join('\n'))}</textarea></div>
            </div>
          </div>
        `;
      } else {
        inner = `
          <div class="form-group"><label class="form-label">In-Person Administration Notice</label>
            <textarea class="form-control fld" data-k="importantNotice" rows="3">${esc(p.importantNotice || '')}</textarea>
          </div>
        `;
      }

      card.innerHTML = `
        <div class="panel-title-row">
          <h2 class="panel-title">${esc(sec.section_title)}</h2>
          <div style="display:flex; gap:8px; align-items:center;">
            ${statusBadge(sec.workflow_status)}
            <button type="button" class="btn btn-sm btn-secondary rev-btn">Revisions</button>
          </div>
        </div>
        ${inner}
        ${canEdit ? `
          <div style="display:flex; gap:10px; margin-top:12px;">
            <button type="button" class="btn btn-secondary btn-sm santh-save-btn" data-action="save_draft">Save Draft</button>
            <button type="button" class="btn btn-warning btn-sm santh-save-btn" data-action="submit_approval">Submit for Approval</button>
            ${canPublish ? `<button type="button" class="btn btn-success btn-sm santh-save-btn" data-action="publish">Publish Live</button>` : ''}
          </div>
        ` : ''}
      `;
      wrap.appendChild(card);

      card.querySelector('.rev-btn').addEventListener('click', () => {
        renderRevisionsModal('santhwanam_content', sec.section_key, null);
      });

      card.querySelectorAll('.santh-save-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const out = Object.assign({}, p);
          card.querySelectorAll('.fld').forEach(el => { out[el.getAttribute('data-k')] = el.value.trim(); });
          card.querySelectorAll('.fld-lines').forEach(el => {
            out[el.getAttribute('data-k')] = el.value.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
          });
          try {
            await window.AdminApp.apiFetch(`/api/admin/santhwanam/${sec.section_key}`, {
              method: 'PUT',
              body: { action: btn.getAttribute('data-action'), payload: out }
            });
            window.AdminApp.showToast(`Santhwanam section updated.`);
            await renderSanthwanam(mount);
          } catch (err) { window.AdminApp.showToast(err.message, 'error'); }
        });
      });
    }
  }

  async function renderFaqs(mount) {
    const canManage = window.AdminApp.hasPerm('faqs:manage') || window.AdminApp.hasPerm('content:edit');
    const canPublish = window.AdminApp.hasPerm('faqs:publish') || window.AdminApp.hasPerm('content:publish');
    const { faqs } = await window.AdminApp.apiFetch('/api/admin/faqs');

    function openFaqModal(item = null) {
      let editor = null;
      window.AdminApp.openModal({
        title: item ? 'Edit FAQ Item' : 'Add New FAQ',
        bodyHtml: `
          <div class="grid-2col">
            <div class="form-group">
              <label class="form-label">FAQ Category</label>
              <select id="faqCat" class="form-control">
                ${['general', 'deposits', 'loans', 'docs', 'rooms', 'santhwanam'].map(c =>
                  `<option value="${c}" ${item && item.category === c ? 'selected' : ''}>${c.toUpperCase()}</option>`
                ).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Display Order</label>
              <input type="number" id="faqOrder" class="form-control" value="${item ? item.display_order : 1}">
            </div>
          </div>
          <div class="form-group"><label class="form-label">Question</label><input type="text" id="faqQuestion" class="form-control" value="${esc(item ? item.question : '')}" required></div>
          <div class="form-group"><label class="form-label">Answer</label><div id="faqAnswerRte"></div></div>
        `,
        footerButtons: [
          { label: 'Cancel', className: 'btn btn-secondary' },
          { label: 'Save Draft', className: 'btn btn-secondary', onClick: ({ close }) => saveFaq('Draft', close) },
          ...(canPublish ? [{ label: 'Save & Publish', className: 'btn btn-success', onClick: ({ close }) => saveFaq('Published', close) }] : [])
        ],
        onReady: () => {
          editor = createRichEditor({ mountId: 'faqAnswerRte', initialHtml: item ? item.answer_html : '<p></p>' });
        }
      });

      async function saveFaq(status, close) {
        try {
          const body = {
            category: document.getElementById('faqCat').value,
            displayOrder: Number(document.getElementById('faqOrder').value) || 0,
            question: document.getElementById('faqQuestion').value.trim(),
            answerHtml: editor.getHtml(),
            workflowStatus: status
          };
          if (item) await window.AdminApp.apiFetch(`/api/admin/faqs/${item.id}`, { method: 'PUT', body });
          else await window.AdminApp.apiFetch('/api/admin/faqs', { method: 'POST', body });
          window.AdminApp.showToast(`FAQ saved (${status}).`);
          close();
          await renderFaqs(mount);
        } catch (err) { window.AdminApp.showToast(err.message, 'error'); }
      }
    }

    mount.innerHTML = `
      <div class="page-header-bar">
        <div><h1 class="page-heading">FAQ Management</h1><p class="page-welcome">Organize frequently asked questions across all 6 member categories.</p></div>
        ${canManage ? '<button type="button" id="addFaqBtn" class="btn btn-primary">+ Add FAQ</button>' : ''}
      </div>
      <div class="panel-card">
        <div class="table-wrap">
          <table class="admin-table">
            <thead><tr><th>Category</th><th>Question</th><th>Order</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              ${faqs.map(f => `
                <tr>
                  <td><strong>${esc(f.category)}</strong></td>
                  <td>${esc(f.question)}</td>
                  <td>${f.display_order}</td>
                  <td>${statusBadge(f.workflow_status)}</td>
                  <td style="white-space:nowrap;">
                    ${canManage ? `<button type="button" class="btn btn-sm btn-secondary edit-faq-btn" data-id="${f.id}">Edit</button>` : ''}
                    ${canManage ? `<button type="button" class="btn btn-sm btn-danger del-faq-btn" data-id="${f.id}">Delete</button>` : ''}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    const addBtn = document.getElementById('addFaqBtn');
    if (addBtn) addBtn.addEventListener('click', () => openFaqModal(null));
    mount.querySelectorAll('.edit-faq-btn').forEach(b => {
      const f = faqs.find(x => x.id === Number(b.getAttribute('data-id')));
      if (f) b.addEventListener('click', () => openFaqModal(f));
    });
    mount.querySelectorAll('.del-faq-btn').forEach(b => {
      b.addEventListener('click', async () => {
        if (!window.confirm('Delete this FAQ entry permanently?')) return;
        try {
          await window.AdminApp.apiFetch(`/api/admin/faqs/${b.getAttribute('data-id')}`, { method: 'DELETE' });
          window.AdminApp.showToast('FAQ deleted.');
          await renderFaqs(mount);
        } catch (err) { window.AdminApp.showToast(err.message, 'error'); }
      });
    });
  }

  async function render(moduleKey, mount) {
    if (moduleKey === 'general' || moduleKey === 'homepage') return renderGeneralOrHomepage(moduleKey, mount);
    if (moduleKey === 'deposits' || moduleKey === 'loans' || moduleKey === 'rates') return renderFinancialModule(moduleKey, mount);
    if (moduleKey === 'santhwanam') return renderSanthwanam(mount);
    if (moduleKey === 'faqs') return renderFaqs(mount);
  }

  return { render };
})();

