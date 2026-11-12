'use strict';

window.AdminUtils = (() => {
  function esc(val) {
    return String(val ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function statusBadge(status) {
    const s = String(status || 'Draft');
    let cls = 'badge-draft';
    if (s === 'Published' || s === 'Active' || s === 'Approved') cls = 'badge-published';
    else if (s === 'Pending Approval' || s === 'Pending') cls = 'badge-pending';
    else if (s === 'Archived' || s === 'Inactive' || s === 'Rejected') cls = 'badge-archived';
    return `<span class="badge ${cls}">${esc(s)}</span>`;
  }

  function formatBytes(bytes) {
    const n = Number(bytes) || 0;
    if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(2)} MB`;
    if (n >= 1024) return `${Math.round(n / 1024)} KB`;
    return `${n} B`;
  }

  /**
   * Accessible WYSIWYG Rich Text Editor (Zero HTML coding needed for staff)
   */
  function createRichEditor({ mountId, initialHtml = '', maxChars = 15000 }) {
    const mount = typeof mountId === 'string' ? document.getElementById(mountId) : mountId;
    if (!mount) return null;

    mount.innerHTML = `
      <div class="rte-wrapper">
        <div class="rte-toolbar" role="toolbar" aria-label="Text formatting toolbar">
          <button type="button" class="rte-btn" data-cmd="formatBlock" data-val="H3" title="Section Heading">H3</button>
          <button type="button" class="rte-btn" data-cmd="formatBlock" data-val="H4" title="Subheading">H4</button>
          <button type="button" class="rte-btn" data-cmd="formatBlock" data-val="P" title="Paragraph">P</button>
          <button type="button" class="rte-btn" data-cmd="bold" title="Bold"><strong>B</strong></button>
          <button type="button" class="rte-btn" data-cmd="italic" title="Italic"><em>I</em></button>
          <button type="button" class="rte-btn" data-cmd="underline" title="Underline"><u>U</u></button>
          <button type="button" class="rte-btn" data-cmd="insertUnorderedList" title="Bullet List">&bull; List</button>
          <button type="button" class="rte-btn" data-cmd="insertOrderedList" title="Numbered List">1. List</button>
          <button type="button" class="rte-btn" data-action="link" title="Insert Safe Link">Link</button>
          <button type="button" class="rte-btn" data-cmd="removeFormat" title="Clear Formatting">Clear</button>
        </div>
        <div class="rte-area" contenteditable="true"></div>
        <div class="rte-footer">
          <span>Use toolbar controls above — unsafe scripts or formatting are stripped automatically.</span>
          <span class="rte-counter">0 words &bull; 0 chars</span>
        </div>
      </div>
    `;

    const area = mount.querySelector('.rte-area');
    const counter = mount.querySelector('.rte-counter');
    area.innerHTML = initialHtml || '<p></p>';

    function updateCounter() {
      const text = (area.textContent || '').trim();
      const words = text ? text.split(/\s+/).length : 0;
      counter.textContent = `${words} words • ${text.length}/${maxChars} chars`;
    }

    mount.querySelectorAll('.rte-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        area.focus();
        const action = btn.getAttribute('data-action');
        if (action === 'link') {
          const url = window.prompt('Enter destination URL (https://... or page.html):', 'https://');
          if (url && /^(https?:|mailto:|tel:|\/|[a-z0-9._-]+\.html)/i.test(url.trim())) {
            document.execCommand('createLink', false, url.trim());
          }
          return;
        }
        const cmd = btn.getAttribute('data-cmd');
        const val = btn.getAttribute('data-val') || null;
        document.execCommand(cmd, false, val);
        updateCounter();
      });
    });

    area.addEventListener('input', updateCounter);
    updateCounter();

    return {
      getHtml: () => area.innerHTML,
      setHtml: html => { area.innerHTML = html || ''; updateCounter(); }
    };
  }

  return { esc, statusBadge, formatBytes, createRichEditor };
})();

