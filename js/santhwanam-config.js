/**
 * WAYANAD DISTRICT POLICE CO-OPERATIVE SOCIETY LTD. NO. W 208
 * Santhwanam Welfare Scheme - Configurable Application & Request Form Links
 *
 * HOW TO UPDATE ONCE OFFICIAL SOCIETY PDFs ARE AVAILABLE:
 * 1. Place the verified PDF file(s) inside `assets/downloads/`
 *    (Do NOT upload or link any Santhwanam sub-rule document).
 * 2. Update `status` to 'available', provide the relative `pdfUrl`, and optionally
 *    set `meta` (e.g. 'PDF (2 Pages)').
 */

const SANTHWANAM_FORMS_CONFIG = {
  enrolmentApplication: {
    title: 'Santhwanam Welfare Scheme Application Form',
    description: 'For enrolment in the Santhwanam Welfare Scheme (സാന്ത്വനം ക്ഷേമപദ്ധതി – അംഗത്വ ഫോറം).',
    pdfUrl: 'assets/downloads/santhwanam-application-form.pdf',
    downloadFilename: 'Santhwanam-Welfare-Scheme-Application-WDPCS.pdf',
    status: 'available', // 'placeholder' | 'available'
    statusBadge: 'Placeholder — Pending Official PDF',
    availableBadge: 'Official Form Attached',
    metaText: 'Status: Verified Official PDF'
  },
  claimRequestForm: {
    title: 'Santhwanam Request for Treatment Aid',
    description: 'For requesting eligible medical treatment assistance under the Santhwanam Welfare Scheme (സാന്ത്വനം ചികിത്സാ ആനുകൂല്യ അപേക്ഷ).',
    pdfUrl: 'assets/downloads/santhwanam-claim-request-form.pdf',
    downloadFilename: 'Santhwanam-Treatment-Aid-Request-WDPCS.pdf',
    status: 'available', // 'placeholder' | 'available'
    statusBadge: 'Placeholder — Pending Official PDF',
    availableBadge: 'Official Form Attached',
    metaText: 'Status: Verified Official PDF'
  }
};

document.addEventListener('DOMContentLoaded', () => {
  if (typeof SANTHWANAM_FORMS_CONFIG === 'undefined') return;

  document.querySelectorAll('[data-santhwanam-view]').forEach(viewBtn => {
    const formKey = viewBtn.getAttribute('data-santhwanam-view');
    const cfg = SANTHWANAM_FORMS_CONFIG[formKey];
    if (cfg && cfg.status === 'available' && cfg.pdfUrl) {
      viewBtn.setAttribute('href', cfg.pdfUrl);
      viewBtn.style.display = 'inline-flex';
    } else {
      viewBtn.style.display = 'none';
    }
  });

  document.querySelectorAll('[data-santhwanam-form]').forEach(btn => {
    const formKey = btn.getAttribute('data-santhwanam-form');
    const cfg = SANTHWANAM_FORMS_CONFIG[formKey];
    if (!cfg) return;

    const card = btn.closest('.document-card, .santhwanam-form-card');

    if (cfg.status === 'available' && cfg.pdfUrl) {
      btn.setAttribute('href', cfg.pdfUrl);
      btn.setAttribute('download', cfg.downloadFilename || '');
      btn.classList.remove('js-placeholder-download');

      if (card) {
        const badge = card.querySelector('[data-santhwanam-status]');
        if (badge) {
          badge.className = 'badge-official';
          badge.style.cssText = 'font-size:10.5px; padding:1px 7px; background:rgba(46,168,105,0.15); color:#047857; border:1px solid rgba(46,168,105,0.3); border-radius:12px; font-weight:700;';
          badge.textContent = cfg.availableBadge;
        }
        const metaStatus = card.querySelector('[data-santhwanam-meta-status]');
        if (metaStatus) {
          metaStatus.innerHTML = 'Status: <strong style="color:#047857;">Verified Official PDF</strong>';
        }
      }
    } else {
      btn.setAttribute('data-doc-name', cfg.title);
      btn.classList.add('js-placeholder-download');
    }
  });
});

