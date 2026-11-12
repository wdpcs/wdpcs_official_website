/**
 * WAYANAD DISTRICT POLICE CO-OPERATIVE SOCIETY LTD. NO. W 208
 * Progressive CMS Public Content Hydration Client
 *
 * Fetches strictly Published non-expired records from /api/public/site-data.
 * Gracefully preserves existing verified static HTML if the CMS API is
 * offline, unconfigured, or unreachable.
 */
(function () {
  'use strict';

  var cfg = window.WDPCS_CMS_CONFIG || {};
  var apiBase = (cfg.apiBaseUrl || '').replace(/\/+$/, '');
  if (!apiBase) return;

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function sanitizeHtmlFragment(html) {
    if (!html) return '';
    var doc = new DOMParser().parseFromString('<div>' + html + '</div>', 'text/html');
    var root = doc.body.firstElementChild;
    if (!root) return '';
    root.querySelectorAll('script,style,iframe,object,embed,svg,form').forEach(function (el) { el.remove(); });
    root.querySelectorAll('*').forEach(function (el) {
      Array.from(el.attributes).forEach(function (attr) {
        if (/^on/i.test(attr.name) || (attr.name === 'href' && /^\s*javascript:/i.test(attr.value))) {
          el.removeAttribute(attr.name);
        }
      });
    });
    return root.innerHTML;
  }

  function resolveAssetUrl(p) {
    if (!p) return '#';
    if (/^https?:\/\//i.test(p)) return p;
    if (p.indexOf('/cms-uploads/') === 0) return apiBase + p;
    return p;
  }

  function formatDateDisplay(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso).slice(0, 10);
    return d.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: '2-digit' });
  }

  function formatFileSize(bytes) {
    var n = Number(bytes) || 0;
    if (n >= 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + ' MB';
    if (n >= 1024) return Math.round(n / 1024) + ' KB';
    return n + ' B';
  }

  function applyGeneralContacts(content) {
    var contactSec = content.general_contact && content.general_contact.data;
    if (!contactSec) return;

    // Footer & contact blocks: update hrefs cleanly where matching exact official patterns
    if (contactSec.telephone) {
      document.querySelectorAll('a[href^="tel:04936"]').forEach(function (a) {
        a.textContent = contactSec.telephone;
        a.setAttribute('href', 'tel:' + contactSec.telephone.replace(/\s+/g, ''));
      });
    }
    if (contactSec.email) {
      document.querySelectorAll('a[href^="mailto:"]').forEach(function (a) {
        a.textContent = contactSec.email;
        a.setAttribute('href', 'mailto:' + contactSec.email);
      });
    }

    // Contact page working hours card
    document.querySelectorAll('.contact-detail-row').forEach(function (row) {
      var h4 = row.querySelector('h4');
      if (!h4) return;
      var label = h4.textContent.toLowerCase();
      var p = row.querySelector('p');
      if (!p) return;
      if (label.indexOf('office working hours') !== -1 && contactSec.officeHours) {
        p.innerHTML = '<strong>' + esc(contactSec.officeHours) + '</strong><br><span style="font-size:0.815rem; color:var(--color-neutral-500);">' + esc(contactSec.officeHoursNote || '') + '</span>';
      }
    });
  }

  function hydrateServicesPage(data) {
    var path = window.location.pathname.toLowerCase();
    if (path.indexOf('services.html') === -1) return;

    var allProducts = (data.deposits || []).concat(data.loans || []);
    var byName = {};
    allProducts.forEach(function (p) {
      byName[p.product_name.toLowerCase()] = p;
    });

    // Update Loan Summary Table rows cleanly
    var loanTableRows = document.querySelectorAll('#loans table.spec-table tbody tr');
    loanTableRows.forEach(function (tr) {
      var tds = tr.querySelectorAll('td');
      if (tds.length < 4) return;
      var rawName = tds[0].textContent.replace(/^\d+\.\s*/, '').trim().toLowerCase();
      var match = byName[rawName];
      if (!match) return;
      if (match.max_amount) tds[1].textContent = match.max_amount;
      tds[2].innerHTML = '<strong>' + esc(match.interest_rate) + '</strong>' +
        '<div style="font-size:11px;color:var(--color-neutral-500);font-weight:500;">Effective: ' + esc(formatDateDisplay(match.effective_from)) + '</div>';
      if (match.tenure) tds[3].textContent = match.tenure;
    });

    // Update each Product Detail Card cleanly (Deposits + Loans)
    document.querySelectorAll('.service-item-card').forEach(function (card) {
      var titleEl = card.querySelector('.service-card-title');
      if (!titleEl) return;
      var p = byName[titleEl.textContent.trim().toLowerCase()];
      if (!p) return;

      // Update rate row if present in spec table
      card.querySelectorAll('table.spec-table tr').forEach(function (row) {
        var th = row.querySelector('th');
        var td = row.querySelector('td');
        if (!th || !td) return;
        var key = th.textContent.trim().toLowerCase();
        if (key === 'interest rate' || key === 'rate of interest') {
          td.innerHTML = '<strong>' + esc(p.interest_rate) + '</strong> (' + esc(p.rate_type) + ')';
        } else if (key === 'maximum amount' && p.max_amount) {
          td.innerHTML = '<strong>' + esc(p.max_amount) + '</strong>';
        } else if (key === 'tenure' && p.tenure) {
          td.innerHTML = '<strong>' + esc(p.tenure) + '</strong>';
        }
      });

      // Inject or update clean Effective From & Last Updated meta strip on service card
      var bodyEl = card.querySelector('.service-card-body');
      if (bodyEl) {
        var existingMeta = bodyEl.querySelector('.cms-rate-meta');
        if (!existingMeta) {
          existingMeta = document.createElement('div');
          existingMeta.className = 'cms-rate-meta';
          existingMeta.style.cssText = 'margin-top:12px; padding:8px 12px; background:var(--color-neutral-50); border:1px solid var(--color-neutral-200); border-radius:6px; font-size:12px; color:var(--color-neutral-600); display:flex; flex-wrap:wrap; gap:12px;';
          bodyEl.appendChild(existingMeta);
        }
        existingMeta.innerHTML =
          '<span><strong>Interest Rate:</strong> ' + esc(p.interest_rate) + '</span>' +
          '<span><strong>Effective From:</strong> ' + esc(formatDateDisplay(p.effective_from)) + '</span>' +
          (p.effective_until ? '<span><strong>Effective Until:</strong> ' + esc(formatDateDisplay(p.effective_until)) + '</span>' : '') +
          '<span><strong>Last Updated:</strong> ' + esc(formatDateDisplay(p.last_updated)) + '</span>';
      }
    });
  }

  function buildNoticeCardHtml(n) {
    var dt = new Date(n.publish_date);
    var day = isNaN(dt.getTime()) ? '01' : String(dt.getDate()).padStart(2, '0');
    var monthYear = isNaN(dt.getTime()) ? n.publish_date : dt.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    var year = isNaN(dt.getTime()) ? '2026' : String(dt.getFullYear());
    var pdfHtml = n.attachment_path
      ? '<a href="' + esc(resolveAssetUrl(n.attachment_path)) + '" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm notice-action-btn">View Official PDF &rarr;</a>'
      : '';
    return (
      '<article class="notice-card notice-card-item" data-category="' + esc(n.category) + '" data-year="' + esc(year) + '" data-title="' + esc(n.title) + '" data-desc="' + esc(n.summary) + '" data-ref="' + esc(n.reference_number || '') + '">' +
        '<div class="notice-date-box" aria-hidden="true"><span class="notice-day">' + esc(day) + '</span><span class="notice-month-year">' + esc(monthYear) + '</span></div>' +
        '<div class="notice-main-content">' +
          '<div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:4px; align-items:center;">' +
            '<span class="notice-badge-cat">' + esc(n.category.toUpperCase()) + '</span>' +
            (n.reference_number ? '<span class="notice-ref-code">' + esc(n.reference_number) + '</span>' : '') +
          '</div>' +
          '<h2 class="notice-card-title">' + esc(n.title) + '</h2>' +
          '<p class="notice-card-desc">' + esc(n.summary) + '</p>' +
        '</div>' +
        (pdfHtml ? '<div class="notice-actions" style="display:flex; align-items:center;">' + pdfHtml + '</div>' : '') +
      '</article>'
    );
  }

  function hydrateNotices(data) {
    var list = data.notices || [];
    if (!list.length) return;

    var path = window.location.pathname.toLowerCase();
    // Homepage featured strip
    if (path === '/' || path.endsWith('/index.html') || path === '/index.html') {
      var homeContainer = document.querySelector('#notices-section-title')
        ? document.querySelector('section[aria-labelledby="notices-section-title"] .notices-list')
        : null;
      if (homeContainer) {
        var featured = list.filter(function (n) { return n.is_featured; });
        var display = (featured.length ? featured : list).slice(0, 4);
        homeContainer.innerHTML = display.map(buildNoticeCardHtml).join('');
      }
    }

    // Notices full archive page
    var noticesContainer = document.getElementById('noticesListContainer');
    if (noticesContainer && path.indexOf('notices.html') !== -1) {
      noticesContainer.innerHTML = list.map(buildNoticeCardHtml).join('');
      if (typeof window.wdpcsFilterNotices === 'function') {
        window.wdpcsFilterNotices();
      }
    }
  }

  function hydrateGallery(data) {
    var items = data.gallery || [];
    if (!items.length) return;
    var path = window.location.pathname.toLowerCase();

    if (path.indexOf('gallery.html') !== -1) {
      // Inject or update dynamic CMS Gallery Archive section for newly uploaded photos
      var customItems = items.filter(function (g) { return String(g.image_path || '').indexOf('/cms-uploads/') === 0; });
      var mainContainer = document.querySelector('main#main-content .container');
      if (mainContainer && customItems.length > 0) {
        var cmsSec = document.getElementById('cmsGallerySection');
        if (!cmsSec) {
          cmsSec = document.createElement('div');
          cmsSec.id = 'cmsGallerySection';
          cmsSec.className = 'gallery-album-section';
          cmsSec.setAttribute('data-album', 'cms-updates');
          var introEl = mainContainer.querySelector('.gallery-section-intro');
          if (introEl && introEl.nextSibling) mainContainer.insertBefore(cmsSec, introEl.nextSibling);
          else mainContainer.appendChild(cmsSec);
        }
        cmsSec.innerHTML =
          '<div class="gallery-album-header">' +
            '<div class="gallery-album-title-group">' +
              '<span class="gallery-album-badge">Latest Society Gallery &bull; ' + customItems.length + ' Photograph(s)</span>' +
              '<h2 class="gallery-album-title">Recent Events &amp; Society Photo Archive</h2>' +
            '</div>' +
          '</div>' +
          '<div class="gallery-grid">' +
            customItems.map(function (g) {
              var fullSrc = resolveAssetUrl(g.image_path);
              var thumbSrc = resolveAssetUrl(g.thumbnail_path || g.image_path);
              var audioSrc = g.audio_path ? resolveAssetUrl(g.audio_path) : '';
              return (
                '<div class="gallery-item" data-category="' + esc(g.category) + '" data-full-img="' + esc(fullSrc) + '" data-caption="' + esc(g.title + (g.caption_summary ? ' — ' + g.caption_summary : '')) + '" data-narration-html="' + esc(sanitizeHtmlFragment(g.narration_html || '')) + '" data-audio-src="' + esc(audioSrc) + '">' +
                  '<div class="gallery-thumb-container">' +
                    '<img src="' + esc(thumbSrc) + '" alt="' + esc(g.title) + '" class="gallery-thumb-img" loading="lazy" decoding="async">' +
                    '<span class="gallery-overlay-badge">View High-Res</span>' +
                  '</div>' +
                  '<div class="gallery-info">' +
                    '<span class="gallery-category">' + esc(g.album_name || g.category) + '</span>' +
                    '<div class="gallery-caption">' + esc(g.title) + '</div>' +
                  '</div>' +
                '</div>'
              );
            }).join('') +
          '</div>';
      }
      if (typeof window.wdpcsRefreshGallery === 'function') {
        window.wdpcsRefreshGallery();
      }
    }
  }

  function rebindDownloadsFiltering() {
    var searchInput = document.getElementById('docSearchInput');
    var pills = document.querySelectorAll('.filter-pill');
    var countDisplay = document.getElementById('docResultsCount');
    var emptyEl = document.getElementById('noResultsState');
    var activeCat = 'all';
    var term = '';

    function applyFilter() {
      var cards = document.querySelectorAll('.document-card');
      var shown = 0;
      cards.forEach(function (card) {
        var cat = card.getAttribute('data-category') || '';
        var hay = (
          (card.getAttribute('data-title') || '') + ' ' +
          (card.getAttribute('data-desc') || '') + ' ' +
          (card.getAttribute('data-tags') || '')
        ).toLowerCase();
        var matchCat = activeCat === 'all' || cat === activeCat;
        var matchText = !term || hay.indexOf(term) !== -1;
        if (matchCat && matchText) {
          card.style.display = 'flex';
          shown += 1;
        } else {
          card.style.display = 'none';
        }
      });
      if (countDisplay) countDisplay.textContent = shown + ' Form' + (shown === 1 ? '' : 's') + ' Available';
      if (emptyEl) emptyEl.style.display = shown === 0 ? 'block' : 'none';
    }

    if (searchInput) {
      var cleanInput = searchInput.cloneNode(true);
      searchInput.parentNode.replaceChild(cleanInput, searchInput);
      cleanInput.addEventListener('input', function (e) {
        term = e.target.value.trim().toLowerCase();
        applyFilter();
      });
    }
    pills.forEach(function (p) {
      var cleanPill = p.cloneNode(true);
      p.parentNode.replaceChild(cleanPill, p);
      cleanPill.addEventListener('click', function () {
        document.querySelectorAll('.filter-pill').forEach(function (x) { x.classList.remove('active'); });
        cleanPill.classList.add('active');
        activeCat = cleanPill.getAttribute('data-category') || 'all';
        applyFilter();
      });
    });
    applyFilter();
  }

  function hydrateDownloads(data) {
    var path = window.location.pathname.toLowerCase();
    if (path.indexOf('downloads.html') === -1) return;
    var container = document.getElementById('documentsContainer');
    var docs = (data.documents || []).filter(function (d) {
      return !/sub[-\s]?rule/i.test(d.title + ' ' + d.description);
    });
    if (!container || !docs.length) return;

    // Enforce max 2 Santhwanam documents defensively
    var santhCount = 0;
    var filteredDocs = docs.filter(function (d) {
      if (d.category === 'santhwanam') {
        santhCount += 1;
        return santhCount <= 2;
      }
      return true;
    });

    container.innerHTML = filteredDocs.map(function (d) {
      var fileUrl = resolveAssetUrl(d.file_path);
      return (
        '<div class="document-card" data-category="' + esc(d.category) + '" data-title="' + esc(d.title) + '" data-desc="' + esc(d.description) + '" data-tags="' + esc(d.tags || '') + '">' +
          '<div class="document-icon-badge" aria-hidden="true">' +
            '<svg viewBox="0 0 24 24"><path d="M20 2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8.5 7.5c0 .83-.67 1.5-1.5 1.5H9v2H7.5V7H10c.83 0 1.5.67 1.5 1.5v1zm5 2c0 .83-.67 1.5-1.5 1.5h-2.5V7H15c.83 0 1.5.67 1.5 1.5v3zm4-3H19v1h1.5V11H19v2h-1.5V7h3v1.5z"/></svg>' +
            '<span class="document-type-label">PDF</span>' +
          '</div>' +
          '<div class="document-info">' +
            '<div style="display:flex; align-items:center; gap:8px; margin-bottom:4px; flex-wrap:wrap;">' +
              '<span class="document-category-tag">' + esc(d.category_tag || d.category) + '</span>' +
              '<span class="badge-official" style="font-size:10.5px; padding:1px 7px; background:rgba(46,168,105,0.15); color:#047857; border:1px solid rgba(46,168,105,0.3); border-radius:12px; font-weight:700;">Official Form (v' + esc(d.version_number) + ')</span>' +
            '</div>' +
            '<h2 class="document-title">' + esc(d.title) + '</h2>' +
            '<p class="document-desc">' + esc(d.description) + '</p>' +
            '<div class="document-meta">' +
              '<span>' + esc(d.page_info || 'PDF') + '</span><span>&bull;</span>' +
              '<span>Size: ' + esc(formatFileSize(d.file_size)) + '</span><span>&bull;</span>' +
              '<span>Effective: ' + esc(formatDateDisplay(d.effective_date)) + '</span>' +
            '</div>' +
          '</div>' +
          '<div class="document-actions">' +
            '<a href="' + esc(fileUrl) + '" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm">View PDF</a>' +
            '<a href="' + esc(fileUrl) + '" download="' + esc(d.slug) + '.pdf" class="btn btn-primary btn-sm">Download PDF</a>' +
          '</div>' +
        '</div>'
      );
    }).join('');

    rebindDownloadsFiltering();
  }

  function hydrateFaqs(data) {
    var path = window.location.pathname.toLowerCase();
    if (path.indexOf('faq.html') === -1) return;
    var faqs = data.faqs || [];
    if (!faqs.length) return;

    var byCat = {};
    faqs.forEach(function (f) {
      if (!byCat[f.category]) byCat[f.category] = [];
      byCat[f.category].push(f);
    });

    Object.keys(byCat).forEach(function (cat) {
      var titleEl = document.getElementById('faq-cat-' + cat);
      if (!titleEl) return;
      var section = titleEl.closest('.faq-category-section');
      var listWrap = section && section.querySelector('.faq-accordion-group');
      if (!listWrap) return;

      listWrap.innerHTML = byCat[cat].map(function (f, idx) {
        return (
          '<article class="faq-item' + (idx === 0 ? ' active' : '') + '">' +
            '<h3 style="margin:0;">' +
              '<button type="button" class="faq-header-btn" aria-expanded="' + (idx === 0 ? 'true' : 'false') + '">' +
                '<span>' + esc(f.question) + '</span>' +
                '<span class="faq-icon-toggle" aria-hidden="true">+</span>' +
              '</button>' +
            '</h3>' +
            '<div class="faq-collapse-body">' + sanitizeHtmlFragment(f.answer_html) + '</div>' +
          '</article>'
        );
      }).join('');
    });
  }

  function hydrateAboutAndGovernance(data) {
    var path = window.location.pathname.toLowerCase();
    if (path.indexOf('about.html') === -1) return;
    var gov = data.content && data.content.general_governance && data.content.general_governance.data;
    if (gov && Array.isArray(gov.directors) && gov.directors.length > 0) {
      var boardGrid = document.querySelector('.board-grid');
      if (boardGrid) {
        boardGrid.innerHTML = gov.directors.map(function (d) {
          var isPres = /president/i.test(d.role) && !/vice/i.test(d.role);
          var isVp = /vice president/i.test(d.role);
          var cardClass = isPres ? 'director-card executive-president' : (isVp ? 'director-card executive-vp' : 'director-card director-member');
          var roleClass = isPres ? 'director-role-tag role-president' : (isVp ? 'director-role-tag role-vp' : 'director-role-tag role-director');
          var cleanTel = String(d.phone || '').replace(/[^\d+]/g, '');
          var photoUrl = resolveAssetUrl(d.photo || 'assets/images/society-logo.svg');
          return (
            '<div class="' + cardClass + '">' +
              '<div class="director-avatar-wrap">' +
                '<img src="' + esc(photoUrl) + '" alt="' + esc(d.name + ' - ' + d.role) + '" class="director-avatar-img" width="130" height="130" loading="lazy">' +
              '</div>' +
              '<span class="' + roleClass + '">' + esc(d.role) + '</span>' +
              '<div class="director-name">' + esc(d.name) + '</div>' +
              (d.phone ? '<a href="tel:' + esc(cleanTel) + '" class="director-phone" style="display:inline-flex; align-items:center; justify-content:center;"><span>' + esc(d.phone) + '</span></a>' : '') +
            '</div>'
          );
        }).join('');
      }
      if (gov.secretary) {
        var secCard = document.querySelector('.executive-secretary');
        if (secCard) {
          var secImg = secCard.querySelector('.director-avatar-img');
          var secName = secCard.querySelector('.director-name');
          if (secImg && gov.secretary.photo) {
            secImg.src = resolveAssetUrl(gov.secretary.photo);
            if (gov.secretary.name) secImg.alt = gov.secretary.name + ' - Secretary';
          }
          if (secName && gov.secretary.name) secName.textContent = gov.secretary.name;
        }
      }
    }
  }

  function hydrateHomepageAndSanthwanam(data) {
    var path = window.location.pathname.toLowerCase();
    var homeCfg = data.content && data.content.homepage_management && data.content.homepage_management.data;
    if (homeCfg && (path === '/' || path.endsWith('/index.html') || path === '/index.html')) {
      var tickerEl = document.querySelector('.topbar-badge, .announcement-ticker-text');
      if (tickerEl && homeCfg.announcementBanner) {
        tickerEl.textContent = homeCfg.announcementBanner;
      }
      var aboutTitleEl = document.getElementById('about-preview-title');
      if (aboutTitleEl && homeCfg.aboutPreviewTitle) {
        var lead = aboutTitleEl.parentElement && aboutTitleEl.parentElement.querySelector('.section-lead');
        if (lead && homeCfg.aboutPreviewText) lead.textContent = homeCfg.aboutPreviewText;
      }
      var santhHeading = document.getElementById('santhwanam-home-heading');
      if (santhHeading && homeCfg.santhwanamHighlightText) {
        var card = santhHeading.closest('.santhwanam-home-card');
        var desc = card && card.querySelector('p');
        if (desc) desc.textContent = homeCfg.santhwanamHighlightText;
      }
    }

    if (path.indexOf('santhwanam.html') !== -1 && data.santhwanam) {
      var overview = data.santhwanam.santhwanam_overview && data.santhwanam.santhwanam_overview.data;
      if (overview) {
        var aboutSec = document.getElementById('about-santhwanam-title');
        var aboutContainer = aboutSec && aboutSec.closest('section');
        if (aboutContainer && Array.isArray(overview.introParagraphs)) {
          var pNodes = aboutContainer.querySelectorAll('.lead-intro-paragraph, .santhwanam-intro-text p');
          pNodes.forEach(function (node, i) {
            if (overview.introParagraphs[i]) node.textContent = overview.introParagraphs[i];
          });
        }
      }
    }
  }

  function runHydration() {
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, 2500) : null;

    fetch(apiBase + '/api/public/site-data', {
      method: 'GET',
      mode: 'cors',
      signal: controller ? controller.signal : undefined
    })
      .then(function (resp) {
        if (!resp.ok) throw new Error('CMS public endpoint unavailable');
        return resp.json();
      })
      .then(function (data) {
        if (!data || !data.ok) return;
        applyGeneralContacts(data.content || {});
        hydrateHomepageAndSanthwanam(data);
        hydrateAboutAndGovernance(data);
        hydrateServicesPage(data);
        hydrateNotices(data);
        hydrateGallery(data);
        hydrateDownloads(data);
        hydrateFaqs(data);
      })
      .catch(function () {
        // Graceful fallback: leave existing verified static HTML intact
      })
      .finally(function () {
        if (timer) clearTimeout(timer);
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runHydration);
  } else {
    runHydration();
  }
})();
