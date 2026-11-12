/**
 * WAYANAD DISTRICT POLICE CO-OPERATIVE SOCIETY LTD. NO. W 208
 * Notices & Circulars Filtering, Search & Pagination Handler
 */

document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('noticeSearchInput');
  const yearSelect = document.getElementById('noticeYearSelect');
  const categoryPills = document.querySelectorAll('.notice-filter-pill');
  const countDisplay = document.getElementById('noticeCountDisplay');
  const emptyState = document.getElementById('noticesEmptyState');
  const loadMoreBtn = document.getElementById('noticesLoadMoreBtn');

  let currentCategory = 'all';
  let currentYear = 'all';
  let currentSearch = '';
  let visibleLimit = 6;

  function filterNotices() {
    const noticeCards = document.querySelectorAll('.notice-card-item');
    let matchingCards = [];

    noticeCards.forEach(card => {
      const category = card.getAttribute('data-category') || '';
      const year = card.getAttribute('data-year') || '';
      const title = (card.getAttribute('data-title') || '').toLowerCase();
      const desc = (card.getAttribute('data-desc') || '').toLowerCase();
      const ref = (card.getAttribute('data-ref') || '').toLowerCase();

      const matchesCat = (currentCategory === 'all' || category === currentCategory);
      const matchesYear = (currentYear === 'all' || year === currentYear);
      const matchesSearch = currentSearch === '' ||
        title.includes(currentSearch) ||
        desc.includes(currentSearch) ||
        ref.includes(currentSearch);

      if (matchesCat && matchesYear && matchesSearch) {
        matchingCards.push(card);
      } else {
        card.style.display = 'none';
      }
    });

    // Handle pagination limit
    matchingCards.forEach((card, index) => {
      if (index < visibleLimit) {
        card.style.display = 'flex';
      } else {
        card.style.display = 'none';
      }
    });

    if (countDisplay) {
      countDisplay.textContent = `${matchingCards.length} Notice${matchingCards.length === 1 ? '' : 's'} Found`;
    }

    if (emptyState) {
      emptyState.style.display = matchingCards.length === 0 ? 'block' : 'none';
    }

    if (loadMoreBtn) {
      if (matchingCards.length > visibleLimit) {
        loadMoreBtn.style.display = 'inline-flex';
      } else {
        loadMoreBtn.style.display = 'none';
      }
    }
  }

  window.wdpcsFilterNotices = filterNotices;

  if (searchInput) {
    let debounceTimer;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        currentSearch = e.target.value.trim().toLowerCase();
        visibleLimit = 6;
        filterNotices();
      }, 100);
    });
  }

  if (yearSelect) {
    yearSelect.addEventListener('change', (e) => {
      currentYear = e.target.value;
      visibleLimit = 6;
      filterNotices();
    });
  }

  categoryPills.forEach(pill => {
    pill.addEventListener('click', () => {
      categoryPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      currentCategory = pill.getAttribute('data-filter');
      visibleLimit = 6;
      filterNotices();
    });
  });

  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', () => {
      visibleLimit += 6;
      filterNotices();
    });
  }

  // Check URL query parameters
  const urlParams = new URLSearchParams(window.location.search);
  const catParam = urlParams.get('category');
  if (catParam) {
    const targetPill = document.querySelector(`.notice-filter-pill[data-filter="${catParam}"]`);
    if (targetPill) targetPill.click();
  }
});
