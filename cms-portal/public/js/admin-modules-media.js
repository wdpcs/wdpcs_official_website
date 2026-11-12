'use strict';

window.AdminModulesMedia = (() => {
  const { esc, statusBadge, formatBytes, createRichEditor } = window.AdminUtils;

  const NOTICE_CATEGORIES = [
    ['general', 'General Notice'],
    ['agm', 'Annual General Body'],
    ['loan', 'Loan Scheme Update'],
    ['deposit', 'Deposit & Interest'],
    ['member', 'Member Welfare'],
    ['education', 'Education Awards'],
    ['rooms', 'Society Rooms'],
    ['holiday', 'Holiday Notice'],
    ['circulars', 'Official Circular']
  ];

  const GALLERY_CATEGORIES = [
    ['inauguration', 'Building Inauguration'],
    ['carehome', 'Care Home 2018'],
    ['meetings', 'General Body Meetings'],
    ['events', 'Member Welfare & Awards'],
    ['facilities', 'Facilities'],
    ['special', 'Special Events'],
    ['general', 'General']
  ];

  // =========================================================================
  // NOTICES & CIRCULARS
  // =========================================================================
  async function renderNotices(mount) {
    const canManage = window.AdminApp.hasPerm('notices:manage') || window.AdminApp.hasPerm('content:edit');
    const canPublish = window.AdminApp.hasPerm('notices:publish') || window.AdminApp.hasPerm('content:publish');
    const { notices } = await window.AdminApp.apiFetch('/api/admin/notices');

    function openNoticeModal(item = null) {
      let editor = null;
      window.AdminApp.openModal({
        title: item ? 'Edit Notice / Circular' : 'Publish / Draft New Notice',
        bodyHtml: `
          <div class="grid-2col">
            <div class="form-group"><label class="form-label">Title</label><input type="text" id="ntTitle" class="form-control" value="${esc(item ? item.title : '')}" required></div>
            <div class="form-group"><label class="form-label">Category</label>
              <select id="ntCategory" class="form-control">
                ${NOTICE_CATEGORIES.map(([v, l]) => `<option value="${v}" ${item && item.category === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group"><label class="form-label">Reference Number</label><input type="text" id="ntRef" class="form-control" value="${esc(item ? item.reference_number : '')}" placeholder="WDPCS/2026/..."></div>
            <div class="form-group"><label class="form-label">Publish Date</label><input type="date" id="ntPubDate" class="form-control" value="${esc(item ? item.publish_date : new Date().toISOString().slice(0, 10))}"></div>
            <div class="form-group"><label class="form-label">Expiry Date (Optional)</label><input type="date" id="ntExpDate" class="form-control" value="${esc(item && item.expiry_date ? item.expiry_date : '')}"></div>
            <div class="form-group"><label class="form-label">Attachment PDF (Optional)</label><input type="file" id="ntPdfFile" class="form-control" accept="application/pdf,.pdf"></div>
          </div>
          <div class="form-group">
            <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
              <input type="checkbox" id="ntFeatured" ${item && item.is_featured ? 'checked' : ''}>
              <span>Feature on Public Homepage Notice Strip</span>
            </label>
          </div>
          <div class="form-group"><label class="form-label">Short Summary (for notice cards &amp; search)</label><textarea id="ntSummary" class="form-control" rows="2">${esc(item ? item.summary : '')}</textarea></div>
          <div class="form-group"><label class="form-label">Full Notice Body (Rich Text)</label><div id="ntBodyRte"></div></div>
        `,
        footerButtons: [
          { label: 'Cancel', className: 'btn btn-secondary' },
          { label: 'Save Draft', className: 'btn btn-secondary', onClick: ({ close }) => saveNotice('Draft', close) },
          { label: 'Submit Approval', className: 'btn btn-warning', onClick: ({ close }) => saveNotice('Pending Approval', close) },
          ...(canPublish ? [{ label: 'Publish Live', className: 'btn btn-success', onClick: ({ close }) => saveNotice('Published', close) }] : [])
        ],
        onReady: () => {
          editor = createRichEditor({ mountId: 'ntBodyRte', initialHtml: item ? item.body_html : '<p></p>' });
        }
      });

      async function saveNotice(status, close) {
        try {
          const fd = new FormData();
          fd.append('title', document.getElementById('ntTitle').value.trim());
          fd.append('category', document.getElementById('ntCategory').value);
          fd.append('referenceNumber', document.getElementById('ntRef').value.trim());
          fd.append('publishDate', document.getElementById('ntPubDate').value);
          fd.append('expiryDate', document.getElementById('ntExpDate').value);
          fd.append('isFeatured', String(document.getElementById('ntFeatured').checked));
          fd.append('summary', document.getElementById('ntSummary').value.trim());
          fd.append('bodyHtml', editor.getHtml());
          fd.append('workflowStatus', status);
          const f = document.getElementById('ntPdfFile').files[0];
          if (f) fd.append('attachment', f);

          const url = item ? `/api/admin/notices/${item.id}` : '/api/admin/notices';
          await window.AdminApp.apiFetch(url, { method: item ? 'PUT' : 'POST', body: fd });
          window.AdminApp.showToast(`Notice saved (${status}).`);
          close();
          await renderNotices(mount);
        } catch (err) { window.AdminApp.showToast(err.message, 'error'); }
      }
    }

    mount.innerHTML = `
      <div class="page-header-bar">
        <div><h1 class="page-heading">Notices &amp; Circulars</h1><p class="page-welcome">Manage official circulars, AGM alerts, scholarship notices, and PDF attachments.</p></div>
        ${canManage ? '<button type="button" id="addNoticeBtn" class="btn btn-primary">+ Create Notice</button>' : ''}
      </div>
      <div class="panel-card">
        <div class="table-wrap">
          <table class="admin-table">
            <thead><tr><th>Title &amp; Reference</th><th>Category</th><th>Publish / Expiry</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              ${notices.map(n => `
                <tr>
                  <td>
                    <strong>${esc(n.title)}</strong>
                    <div style="font-size:12px;color:#64748b;">Ref: ${esc(n.reference_number || '-')} ${n.is_featured ? '&bull; Featured on Homepage' : ''} ${n.attachment_path ? '&bull; PDF Attached' : ''}</div>
                  </td>
                  <td>${esc(n.category)}</td>
                  <td style="white-space:nowrap;">${esc(n.publish_date)}${n.expiry_date ? `<br><span style="font-size:11.5px;color:#64748b;">Exp: ${esc(n.expiry_date)}</span>` : ''}</td>
                  <td>${statusBadge(n.workflow_status)}</td>
                  <td style="white-space:nowrap;">
                    ${canManage ? `<button type="button" class="btn btn-sm btn-secondary edit-nt-btn" data-id="${n.id}">Edit</button>` : ''}
                    ${canPublish && n.workflow_status !== 'Archived' ? `<button type="button" class="btn btn-sm btn-warning arch-nt-btn" data-id="${n.id}">Archive</button>` : ''}
                    ${canManage ? `<button type="button" class="btn btn-sm btn-danger del-nt-btn" data-id="${n.id}">Delete</button>` : ''}
                  </td>
                </tr>
              `).join('') || '<tr><td colspan="5">No notices created yet.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;

    const addBtn = document.getElementById('addNoticeBtn');
    if (addBtn) addBtn.addEventListener('click', () => openNoticeModal(null));
    mount.querySelectorAll('.edit-nt-btn').forEach(b => {
      const n = notices.find(x => x.id === Number(b.getAttribute('data-id')));
      if (n) b.addEventListener('click', () => openNoticeModal(n));
    });
    mount.querySelectorAll('.arch-nt-btn').forEach(b => {
      b.addEventListener('click', async () => {
        try {
          await window.AdminApp.apiFetch(`/api/admin/notices/${b.getAttribute('data-id')}`, { method: 'PUT', body: { workflowStatus: 'Archived' } });
          window.AdminApp.showToast('Notice archived.');
          await renderNotices(mount);
        } catch (err) { window.AdminApp.showToast(err.message, 'error'); }
      });
    });
    mount.querySelectorAll('.del-nt-btn').forEach(b => {
      b.addEventListener('click', async () => {
        if (!window.confirm('Delete this notice permanently?')) return;
        try {
          await window.AdminApp.apiFetch(`/api/admin/notices/${b.getAttribute('data-id')}`, { method: 'DELETE' });
          window.AdminApp.showToast('Notice deleted.');
          await renderNotices(mount);
        } catch (err) { window.AdminApp.showToast(err.message, 'error'); }
      });
    });
  }

  // =========================================================================
  // GALLERY MANAGEMENT (Drag & Drop Multi-Upload, Narration, Audio, Ordering)
  // =========================================================================
  async function renderGallery(mount) {
    const canManage = window.AdminApp.hasPerm('gallery:manage') || window.AdminApp.hasPerm('content:edit');
    const canPublish = window.AdminApp.hasPerm('gallery:publish') || window.AdminApp.hasPerm('content:publish');
    const { items } = await window.AdminApp.apiFetch('/api/admin/gallery');

    function imgUrl(p) {
      return p.startsWith('/cms-uploads/') ? p : `/${p.replace(/^\/+/, '')}`;
    }

    function openUploadModal() {
      let selectedFiles = [];
      let narrationEditor = null;

      window.AdminApp.openModal({
        title: 'Multi-Image Gallery Upload & Rich Narration',
        bodyHtml: `
          <div class="dropzone" id="galDropzone">
            <strong>Drag &amp; Drop Multiple Photos Here</strong> or click to browse<br>
            <span style="font-size:12px; color:#64748b;">Supports JPG, PNG, WebP (max 10 MB per photo). Auto-resized &amp; WebP-optimized on upload.</span>
            <input type="file" id="galFilesInput" multiple accept="image/jpeg,image/png,image/webp" style="display:none;">
          </div>
          <div id="galPreviewStrip" style="display:flex; gap:8px; flex-wrap:wrap; margin-top:12px;"></div>
          <div class="grid-2col" style="margin-top:12px;">
            <div class="form-group"><label class="form-label">Photo / Album Title</label><input type="text" id="galTitle" class="form-control" placeholder="Event or Milestone Title"></div>
            <div class="form-group"><label class="form-label">Gallery Category</label>
              <select id="galCategory" class="form-control">
                ${GALLERY_CATEGORIES.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group"><label class="form-label">Album Name</label><input type="text" id="galAlbum" class="form-control" value="Society Photo Archive"></div>
            <div class="form-group"><label class="form-label">Event Date</label><input type="date" id="galDate" class="form-control" value="${new Date().toISOString().slice(0, 10)}"></div>
          </div>
          <div class="form-group"><label class="form-label">Short Caption Summary</label><input type="text" id="galCaption" class="form-control" placeholder="Concise description displayed on card"></div>
          <div class="form-group"><label class="form-label">Detailed Event Narration (Rich Text)</label><div id="galNarrationRte"></div></div>
          <div class="form-group"><label class="form-label">Optional Audio Narration (MP3 / OGG / WAV / M4A)</label><input type="file" id="galAudioInput" class="form-control" accept="audio/*"></div>
          <label style="display:flex; align-items:center; gap:8px;"><input type="checkbox" id="galFeatured"> <span>Feature on Homepage Gallery Preview</span></label>
        `,
        footerButtons: [
          { label: 'Cancel', className: 'btn btn-secondary' },
          { label: 'Upload as Draft', className: 'btn btn-secondary', onClick: ({ close }) => doUpload('Draft', close) },
          ...(canPublish ? [{ label: 'Upload & Publish Live', className: 'btn btn-success', onClick: ({ close }) => doUpload('Published', close) }] : [])
        ],
        onReady: () => {
          narrationEditor = createRichEditor({ mountId: 'galNarrationRte', initialHtml: '<p></p>' });
          const dz = document.getElementById('galDropzone');
          const fi = document.getElementById('galFilesInput');
          const strip = document.getElementById('galPreviewStrip');

          function refreshPreviews(fileList) {
            selectedFiles = Array.from(fileList || []);
            strip.innerHTML = '';
            for (const f of selectedFiles) {
              const url = URL.createObjectURL(f);
              const box = document.createElement('div');
              box.style.cssText = 'width:90px; text-align:center; font-size:11px;';
              box.innerHTML = `<img src="${url}" style="width:90px; height:64px; object-fit:cover; border-radius:6px; border:1px solid #cbd5e1;"><div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(f.name)}</div>`;
              strip.appendChild(box);
            }
          }

          dz.addEventListener('click', () => fi.click());
          fi.addEventListener('change', () => refreshPreviews(fi.files));
          dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('dragover'); });
          dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
          dz.addEventListener('drop', (e) => {
            e.preventDefault();
            dz.classList.remove('dragover');
            if (e.dataTransfer && e.dataTransfer.files) refreshPreviews(e.dataTransfer.files);
          });
        }
      });

      async function doUpload(status, close) {
        if (!selectedFiles.length) {
          window.AdminApp.showToast('Please select or drop at least one image first.', 'error');
          return;
        }
        try {
          const fd = new FormData();
          for (const f of selectedFiles) fd.append('images', f);
          const audio = document.getElementById('galAudioInput').files[0];
          if (audio) fd.append('audio', audio);
          fd.append('title', document.getElementById('galTitle').value.trim());
          fd.append('category', document.getElementById('galCategory').value);
          fd.append('albumName', document.getElementById('galAlbum').value.trim());
          fd.append('eventDate', document.getElementById('galDate').value);
          fd.append('captionSummary', document.getElementById('galCaption').value.trim());
          fd.append('narrationHtml', narrationEditor.getHtml());
          fd.append('isFeatured', String(document.getElementById('galFeatured').checked));
          fd.append('workflowStatus', status);

          const res = await window.AdminApp.apiFetch('/api/admin/gallery/upload', { method: 'POST', body: fd });
          window.AdminApp.showToast(`Uploaded ${res.count} WebP-optimized photo(s) successfully.`);
          close();
          await renderGallery(mount);
        } catch (err) { window.AdminApp.showToast(err.message, 'error'); }
      }
    }

    function openEditGalleryModal(item) {
      let editor = null;
      window.AdminApp.openModal({
        title: `Edit Photo & Narration: ${item.title}`,
        bodyHtml: `
          <div style="display:flex; gap:14px; align-items:center; margin-bottom:14px;">
            <img src="${esc(imgUrl(item.thumbnail_path))}" alt="" style="width:120px; height:84px; object-fit:cover; border-radius:6px;">
            <div style="font-size:12.5px; color:#475569;">
              <strong>Current Size:</strong> ${item.width || '-'} x ${item.height || '-'} px &bull; ${formatBytes(item.file_size)}<br>
              ${item.audio_path ? `<strong>Audio Narration:</strong> ${esc(item.audio_filename || 'Attached')}` : 'No audio narration attached'}
            </div>
          </div>
          <div class="grid-2col">
            <div class="form-group"><label class="form-label">Photo Title</label><input type="text" id="edGalTitle" class="form-control" value="${esc(item.title)}"></div>
            <div class="form-group"><label class="form-label">Category</label>
              <select id="edGalCat" class="form-control">
                ${GALLERY_CATEGORIES.map(([v, l]) => `<option value="${v}" ${item.category === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group"><label class="form-label">Album Name</label><input type="text" id="edGalAlbum" class="form-control" value="${esc(item.album_name)}"></div>
            <div class="form-group"><label class="form-label">Event Date</label><input type="date" id="edGalDate" class="form-control" value="${esc(item.event_date)}"></div>
          </div>
          <div class="form-group"><label class="form-label">Caption Summary</label><input type="text" id="edGalCaption" class="form-control" value="${esc(item.caption_summary)}"></div>
          <div class="form-group"><label class="form-label">Rich Text Narration</label><div id="edGalNarrationRte"></div></div>
          <div class="grid-2col">
            <div class="form-group"><label class="form-label">Replace Photo (Optional)</label><input type="file" id="edGalImg" class="form-control" accept="image/jpeg,image/png,image/webp"></div>
            <div class="form-group"><label class="form-label">Upload / Replace Audio Narration</label><input type="file" id="edGalAudio" class="form-control" accept="audio/*"></div>
          </div>
          <label style="display:flex; align-items:center; gap:8px;"><input type="checkbox" id="edGalFeat" ${item.is_featured ? 'checked' : ''}> <span>Featured on Homepage</span></label>
        `,
        footerButtons: [
          { label: 'Cancel', className: 'btn btn-secondary' },
          { label: 'Save Draft', className: 'btn btn-secondary', onClick: ({ close }) => saveEdit('Draft', close) },
          ...(canPublish ? [{ label: 'Save & Publish', className: 'btn btn-success', onClick: ({ close }) => saveEdit('Published', close) }] : [])
        ],
        onReady: () => {
          editor = createRichEditor({ mountId: 'edGalNarrationRte', initialHtml: item.narration_html || '<p></p>' });
        }
      });

      async function saveEdit(status, close) {
        try {
          const fd = new FormData();
          fd.append('title', document.getElementById('edGalTitle').value.trim());
          fd.append('category', document.getElementById('edGalCat').value);
          fd.append('albumName', document.getElementById('edGalAlbum').value.trim());
          fd.append('eventDate', document.getElementById('edGalDate').value);
          fd.append('captionSummary', document.getElementById('edGalCaption').value.trim());
          fd.append('narrationHtml', editor.getHtml());
          fd.append('isFeatured', String(document.getElementById('edGalFeat').checked));
          fd.append('workflowStatus', status);
          const img = document.getElementById('edGalImg').files[0];
          if (img) fd.append('image', img);
          const aud = document.getElementById('edGalAudio').files[0];
          if (aud) fd.append('audio', aud);
          await window.AdminApp.apiFetch(`/api/admin/gallery/${item.id}`, { method: 'PUT', body: fd });
          window.AdminApp.showToast('Gallery item updated.');
          close();
          await renderGallery(mount);
        } catch (err) { window.AdminApp.showToast(err.message, 'error'); }
      }
    }

    mount.innerHTML = `
      <div class="page-header-bar">
        <div><h1 class="page-heading">Gallery &amp; Narration Management</h1><p class="page-welcome">Multi-image WebP upload with automatic thumbnails, rich narration, optional audio narration, and display order.</p></div>
        ${canManage ? '<button type="button" id="openGalUploadBtn" class="btn btn-primary">+ Upload Photos</button>' : ''}
      </div>
      <div class="gallery-admin-grid">
        ${items.map((g, idx) => `
          <article class="gallery-admin-card">
            <img src="${esc(imgUrl(g.thumbnail_path))}" alt="${esc(g.title)}" class="gallery-admin-thumb">
            <div class="gallery-admin-body">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size:11.5px; color:#64748b; font-weight:700;">#${idx + 1} &bull; ${esc(g.category)}</span>
                ${statusBadge(g.workflow_status)}
              </div>
              <strong style="font-size:13.5px;">${esc(g.title)}</strong>
              <div style="font-size:12px; color:#475569; flex:1;">${esc((g.caption_summary || '').slice(0, 100))}</div>
              ${g.audio_path ? `<div style="font-size:11px; color:#166534; font-weight:600;">&#9835; Audio Narration Attached</div>` : ''}
              ${canManage ? `
                <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:6px;">
                  <button type="button" class="btn btn-sm btn-secondary edit-gal-btn" data-id="${g.id}">Edit</button>
                  ${idx > 0 ? `<button type="button" class="btn btn-sm btn-secondary move-up-btn" data-idx="${idx}" title="Move earlier">&#8593;</button>` : ''}
                  <button type="button" class="btn btn-sm btn-danger del-gal-btn" data-id="${g.id}">Delete</button>
                </div>
              ` : ''}
            </div>
          </article>
        `).join('')}
      </div>
    `;

    const upBtn = document.getElementById('openGalUploadBtn');
    if (upBtn) upBtn.addEventListener('click', openUploadModal);
    mount.querySelectorAll('.edit-gal-btn').forEach(b => {
      const g = items.find(x => x.id === Number(b.getAttribute('data-id')));
      if (g) b.addEventListener('click', () => openEditGalleryModal(g));
    });
    mount.querySelectorAll('.move-up-btn').forEach(b => {
      b.addEventListener('click', async () => {
        const i = Number(b.getAttribute('data-idx'));
        if (i <= 0) return;
        const curr = items[i];
        const prev = items[i - 1];
        await window.AdminApp.apiFetch('/api/admin/gallery/reorder', {
          method: 'POST',
          body: { order: [{ id: curr.id, displayOrder: prev.display_order }, { id: prev.id, displayOrder: curr.display_order + 1 }] }
        });
        await renderGallery(mount);
      });
    });
    mount.querySelectorAll('.del-gal-btn').forEach(b => {
      b.addEventListener('click', async () => {
        if (!window.confirm('Delete this gallery item and its stored media files?')) return;
        await window.AdminApp.apiFetch(`/api/admin/gallery/${b.getAttribute('data-id')}`, { method: 'DELETE' });
        window.AdminApp.showToast('Gallery item removed.');
        await renderGallery(mount);
      });
    });
  }

  // =========================================================================
  // DOWNLOADS & APPLICATION FORMS (Versioned PDF + Santhwanam Policy)
  // =========================================================================
  async function renderDownloads(mount) {
    const canManage = window.AdminApp.hasPerm('downloads:manage') || window.AdminApp.hasPerm('content:edit');
    const canPublish = window.AdminApp.hasPerm('downloads:publish') || window.AdminApp.hasPerm('content:publish');
    const { documents } = await window.AdminApp.apiFetch('/api/admin/downloads');

    function openDocModal(doc = null) {
      const isSanth = doc && Boolean(doc.is_santhwanam_locked);
      window.AdminApp.openModal({
        title: doc ? `Update / Replace PDF: ${doc.title}` : 'Upload New Official Application Form',
        bodyHtml: `
          ${isSanth ? `<div class="alert alert-warn">Santhwanam Policy: You may update details or replace the official PDF for this approved form. Do NOT upload Santhwanam sub-rules.</div>` : ''}
          <div class="grid-2col">
            <div class="form-group"><label class="form-label">Document Title</label><input type="text" id="docTitle" class="form-control" value="${esc(doc ? doc.title : '')}" required></div>
            <div class="form-group"><label class="form-label">Category</label>
              <select id="docCat" class="form-control" ${isSanth ? 'disabled' : ''}>
                <option value="loan" ${doc && doc.category === 'loan' ? 'selected' : ''}>Loan Application Forms</option>
                <option value="deposit" ${doc && doc.category === 'deposit' ? 'selected' : ''}>Deposit &amp; Membership Forms</option>
                ${isSanth ? '<option value="santhwanam" selected>Welfare Scheme – Santhwanam</option>' : ''}
                <option value="other" ${doc && doc.category === 'other' ? 'selected' : ''}>Society Rooms &amp; Other Forms</option>
              </select>
            </div>
            <div class="form-group"><label class="form-label">Form Code</label><input type="text" id="docCode" class="form-control" value="${esc(doc ? doc.form_code : '')}" placeholder="WDPCS-..."></div>
            <div class="form-group"><label class="form-label">Version Number</label><input type="text" id="docVer" class="form-control" value="${esc(doc ? doc.version_number : '1.0')}"></div>
            <div class="form-group"><label class="form-label">Effective Date</label><input type="date" id="docEffDate" class="form-control" value="${esc(doc ? doc.effective_date : new Date().toISOString().slice(0, 10))}"></div>
            <div class="form-group"><label class="form-label">${doc ? 'Replace PDF File (Optional — Archives Old Version)' : 'Official PDF File (Required)'}</label><input type="file" id="docFile" class="form-control" accept="application/pdf,.pdf"></div>
          </div>
          <div class="form-group"><label class="form-label">Description</label><textarea id="docDesc" class="form-control" rows="2">${esc(doc ? doc.description : '')}</textarea></div>
          <div class="form-group"><label class="form-label">Search Tags &amp; Page Info</label><input type="text" id="docTags" class="form-control" value="${esc(doc ? doc.tags : '')}" placeholder="e.g. emergency loan malayalam form"></div>
          ${doc && doc.versions && doc.versions.length ? `
            <div style="margin-top:12px;">
              <strong>Archived Previous Versions:</strong>
              <ul style="font-size:12px; color:#475569; margin:6px 0 0; padding-left:18px;">
                ${doc.versions.map(v => `<li>v${esc(v.version_number)} — ${esc(v.original_filename)} (${esc(v.created_at)}) — ${esc(v.change_note)}</li>`).join('')}
              </ul>
            </div>
          ` : ''}
        `,
        footerButtons: [
          { label: 'Cancel', className: 'btn btn-secondary' },
          { label: 'Save Draft', className: 'btn btn-secondary', onClick: ({ close }) => saveDoc('Draft', close) },
          ...(canPublish ? [{ label: 'Save & Publish Live', className: 'btn btn-success', onClick: ({ close }) => saveDoc('Published', close) }] : [])
        ]
      });

      async function saveDoc(status, close) {
        try {
          const fd = new FormData();
          fd.append('title', document.getElementById('docTitle').value.trim());
          fd.append('category', document.getElementById('docCat').value);
          fd.append('formCode', document.getElementById('docCode').value.trim());
          fd.append('versionNumber', document.getElementById('docVer').value.trim());
          fd.append('effectiveDate', document.getElementById('docEffDate').value);
          fd.append('description', document.getElementById('docDesc').value.trim());
          fd.append('tags', document.getElementById('docTags').value.trim());
          fd.append('workflowStatus', status);
          const f = document.getElementById('docFile').files[0];
          if (f) fd.append('file', f);

          const url = doc ? `/api/admin/downloads/${doc.id}` : '/api/admin/downloads';
          await window.AdminApp.apiFetch(url, { method: doc ? 'PUT' : 'POST', body: fd });
          window.AdminApp.showToast(`Document updated (${status}).`);
          close();
          await renderDownloads(mount);
        } catch (err) { window.AdminApp.showToast(err.message, 'error'); }
      }
    }

    mount.innerHTML = `
      <div class="page-header-bar">
        <div><h1 class="page-heading">Application Forms &amp; Download Management</h1><p class="page-welcome">Upload, replace PDFs cleanly with archived version tracking, and organize member forms.</p></div>
        ${canManage ? '<button type="button" id="addDocBtn" class="btn btn-primary">+ Add Application Form</button>' : ''}
      </div>
      <div class="panel-card">
        <div class="table-wrap">
          <table class="admin-table">
            <thead><tr><th>Document Title &amp; Code</th><th>Category</th><th>Version</th><th>Size</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              ${documents.map(d => `
                <tr>
                  <td>
                    <strong>${esc(d.title)}</strong>
                    <div style="font-size:12px;color:#64748b;">Code: ${esc(d.form_code || '-')} ${d.is_santhwanam_locked ? '&bull; Locked Santhwanam Entry (Replace PDF Allowed)' : ''}</div>
                  </td>
                  <td>${esc(d.category)}</td>
                  <td>v${esc(d.version_number)}</td>
                  <td>${formatBytes(d.file_size)}</td>
                  <td>${statusBadge(d.workflow_status)}</td>
                  <td style="white-space:nowrap;">
                    <a href="${esc(d.file_path.startsWith('/') ? d.file_path : '/' + d.file_path)}" target="_blank" class="btn btn-sm btn-secondary">View PDF</a>
                    ${canManage ? `<button type="button" class="btn btn-sm btn-primary edit-doc-btn" data-id="${d.id}">Update / Replace</button>` : ''}
                    ${canManage && !d.is_santhwanam_locked ? `<button type="button" class="btn btn-sm btn-danger del-doc-btn" data-id="${d.id}">Delete</button>` : ''}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    const addBtn = document.getElementById('addDocBtn');
    if (addBtn) addBtn.addEventListener('click', () => openDocModal(null));
    mount.querySelectorAll('.edit-doc-btn').forEach(b => {
      const d = documents.find(x => x.id === Number(b.getAttribute('data-id')));
      if (d) b.addEventListener('click', () => openDocModal(d));
    });
    mount.querySelectorAll('.del-doc-btn').forEach(b => {
      b.addEventListener('click', async () => {
        if (!window.confirm('Delete this document permanently?')) return;
        try {
          await window.AdminApp.apiFetch(`/api/admin/downloads/${b.getAttribute('data-id')}`, { method: 'DELETE' });
          window.AdminApp.showToast('Document deleted.');
          await renderDownloads(mount);
        } catch (err) { window.AdminApp.showToast(err.message, 'error'); }
      });
    });
  }

  async function render(moduleKey, mount) {
    if (moduleKey === 'notices') return renderNotices(mount);
    if (moduleKey === 'gallery') return renderGallery(mount);
    if (moduleKey === 'downloads') return renderDownloads(mount);
  }

  return { render };
})();

