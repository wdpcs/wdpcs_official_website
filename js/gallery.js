/**
 * WAYANAD DISTRICT POLICE CO-OPERATIVE SOCIETY LTD. NO. W 208
 * Gallery Filtering & Lightbox Modal Handler with Mobile Touch Gestures
 */

document.addEventListener('DOMContentLoaded', () => {
  const filterPills = document.querySelectorAll('.gallery-filter-pill');
  const lightboxModal = document.getElementById('galleryLightbox');
  const lightboxImg = document.getElementById('lightboxImg');
  const lightboxCaption = document.getElementById('lightboxCaption');
  const lightboxCounter = document.getElementById('lightboxCounter');
  const closeBtn = document.querySelector('.lightbox-close-btn');
  const prevBtn = document.querySelector('.lightbox-nav-btn.prev');
  const nextBtn = document.querySelector('.lightbox-nav-btn.next');

  let activeList = [];
  let currentIndex = 0;

  // Update active items list dynamically (supports CMS hydration)
  function updateActiveList() {
    const galleryItems = document.querySelectorAll('.gallery-item');
    activeList = Array.from(galleryItems).filter(item => item.style.display !== 'none');
  }

  // Filter functionality
  filterPills.forEach(pill => {
    pill.addEventListener('click', () => {
      filterPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      const category = pill.getAttribute('data-gallery-filter');
      const galleryItems = document.querySelectorAll('.gallery-item');
      const albumSections = document.querySelectorAll('.gallery-album-section');

      galleryItems.forEach(item => {
        const itemCat = item.getAttribute('data-category');
        if (category === 'all' || itemCat === category) {
          item.style.display = 'block';
        } else {
          item.style.display = 'none';
        }
      });

      // Update album section visibility
      albumSections.forEach(section => {
        const sectionItems = section.querySelectorAll('.gallery-item');
        const hasVisible = Array.from(sectionItems).some(item => item.style.display !== 'none');
        section.style.display = hasVisible ? 'block' : 'none';
      });

      updateActiveList();
    });
  });

  updateActiveList();
  window.wdpcsRefreshGallery = updateActiveList;

  // Delegated Open Lightbox (works for static + dynamically injected CMS gallery items)
  document.addEventListener('click', (e) => {
    const item = e.target.closest('.gallery-item');
    if (!item) return;
    updateActiveList();
    currentIndex = activeList.indexOf(item);
    if (currentIndex !== -1) {
      showLightboxIndex(currentIndex);
    }
  });

  function showLightboxIndex(index) {
    if (!lightboxModal || !activeList[index]) return;

    const item = activeList[index];
    const imgSrc = item.getAttribute('data-full-img') || item.querySelector('img').getAttribute('src');
    const caption = item.getAttribute('data-caption') || item.querySelector('.gallery-caption').textContent;
    const narrationHtml = item.getAttribute('data-narration-html') || '';
    const audioSrc = item.getAttribute('data-audio-src') || '';

    if (lightboxImg) lightboxImg.src = imgSrc;
    if (lightboxCaption) {
      lightboxCaption.textContent = caption;
      // Render optional rich narration and audio narration cleanly below caption
      let extraEl = document.getElementById('lightboxCmsExtra');
      if (!extraEl && lightboxCaption.parentNode) {
        extraEl = document.createElement('div');
        extraEl.id = 'lightboxCmsExtra';
        extraEl.style.cssText = 'margin-top:8px; font-size:0.85rem; color:#cbd5e1;';
        lightboxCaption.parentNode.appendChild(extraEl);
      }
      if (extraEl) {
        extraEl.innerHTML = '';
        if (narrationHtml) {
          const textDiv = document.createElement('div');
          textDiv.innerHTML = narrationHtml;
          extraEl.appendChild(textDiv);
        }
        if (audioSrc) {
          const audio = document.createElement('audio');
          audio.controls = true;
          audio.src = audioSrc;
          audio.style.cssText = 'margin-top:8px; width:100%; max-width:360px; height:34px;';
          extraEl.appendChild(audio);
        }
      }
    }
    if (lightboxCounter) lightboxCounter.textContent = `${index + 1} of ${activeList.length}`;

    lightboxModal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function nextImage() {
    if (activeList.length === 0) return;
    currentIndex = (currentIndex + 1) % activeList.length;
    showLightboxIndex(currentIndex);
  }

  function prevImage() {
    if (activeList.length === 0) return;
    currentIndex = (currentIndex - 1 + activeList.length) % activeList.length;
    showLightboxIndex(currentIndex);
  }

  function closeLightbox() {
    if (!lightboxModal) return;
    lightboxModal.classList.remove('active');
    document.body.style.overflow = '';
  }

  if (closeBtn) closeBtn.addEventListener('click', closeLightbox);
  if (nextBtn) nextBtn.addEventListener('click', nextImage);
  if (prevBtn) prevBtn.addEventListener('click', prevImage);

  if (lightboxModal) {
    lightboxModal.addEventListener('click', (e) => {
      if (e.target === lightboxModal) closeLightbox();
    });

    // Touch Swipe Gestures for Mobile Lightbox
    let touchStartX = 0;
    let touchEndX = 0;
    let touchStartY = 0;
    let touchEndY = 0;

    lightboxModal.addEventListener('touchstart', (e) => {
      touchStartX = e.changedTouches[0].screenX;
      touchStartY = e.changedTouches[0].screenY;
    }, { passive: true });

    lightboxModal.addEventListener('touchend', (e) => {
      touchEndX = e.changedTouches[0].screenX;
      touchEndY = e.changedTouches[0].screenY;
      handleSwipe();
    }, { passive: true });

    function handleSwipe() {
      const diffX = touchEndX - touchStartX;
      const diffY = touchEndY - touchStartY;
      // Ensure horizontal swipe is dominant and above 40px threshold
      if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 40) {
        if (diffX < 0) {
          nextImage(); // Swipe left -> next image
        } else {
          prevImage(); // Swipe right -> previous image
        }
      }
    }
  }

  // Keyboard navigation
  document.addEventListener('keydown', (e) => {
    if (!lightboxModal || !lightboxModal.classList.contains('active')) return;

    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowRight') nextImage();
    if (e.key === 'ArrowLeft') prevImage();
  });
});
