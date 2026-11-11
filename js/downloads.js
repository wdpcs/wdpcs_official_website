/**
 * WAYANAD DISTRICT POLICE CO-OPERATIVE SOCIETY LTD. NO. W 208
 * Downloads Library Filter & Search Handler
 */

document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('docSearchInput');
  const filterPills = document.querySelectorAll('.filter-pill');
  const docCards = document.querySelectorAll('.document-card');
  const countDisplay = document.getElementById('docResultsCount');
  const emptyState = document.getElementById('docEmptyState');

  let currentCategory = 'all';
  let currentSearch = '';

  function filterDocuments() {
    let visibleCount = 0;

    docCards.forEach(card => {
      const category = card.getAttribute('data-category');
      const title = (card.getAttribute('data-title') || '').toLowerCase();
      const desc = (card.getAttribute('data-desc') || '').toLowerCase();
      const tags = (card.getAttribute('data-tags') || '').toLowerCase();

      const matchesCategory = (currentCategory === 'all' || category === currentCategory);
      const matchesSearch = currentSearch === '' ||
        title.includes(currentSearch) ||
        desc.includes(currentSearch) ||
        tags.includes(currentSearch);

      if (matchesCategory && matchesSearch) {
        card.style.display = 'flex';
        visibleCount++;
      } else {
        card.style.display = 'none';
      }
    });

    if (countDisplay) {
      countDisplay.textContent = `${visibleCount} Document${visibleCount === 1 ? '' : 's'} Found`;
    }

    if (emptyState) {
      if (visibleCount === 0) {
        emptyState.style.display = 'block';
      } else {
        emptyState.style.display = 'none';
      }
    }
  }

  // Filter by search query
  if (searchInput) {
    let debounceTimer;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        currentSearch = e.target.value.trim().toLowerCase();
        filterDocuments();
      }, 100);
    });
  }

  // Filter by category pill
  filterPills.forEach(pill => {
    pill.addEventListener('click', () => {
      filterPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      currentCategory = pill.getAttribute('data-filter');
      filterDocuments();
    });
  });

  // Check URL query parameters for pre-selected category
  const urlParams = new URLSearchParams(window.location.search);
  const categoryParam = urlParams.get('category');
  if (categoryParam) {
    const targetPill = document.querySelector(`.filter-pill[data-filter="${categoryParam}"]`);
    if (targetPill) {
      targetPill.click();
    }
  }

  // Smoothly bring targeted document card into view after filter is applied
  if (window.location.hash) {
    const targetCard = document.querySelector(window.location.hash);
    if (targetCard && targetCard.style.display !== 'none') {
      setTimeout(() => {
        targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 60);
    }
  }
});
