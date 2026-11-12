/**
 * WAYANAD DISTRICT POLICE CO-OPERATIVE SOCIETY LTD. NO. W 208
 * FAQ Accordion Interaction Handler
 */

document.addEventListener('DOMContentLoaded', () => {
  // Delegated handler supports both static and dynamically hydrated CMS FAQs
  document.addEventListener('click', (e) => {
    const button = e.target.closest('.faq-header-btn');
    if (!button) return;

    const parentItem = button.closest('.faq-item');
    const isExpanded = button.getAttribute('aria-expanded') === 'true';

    button.setAttribute('aria-expanded', String(!isExpanded));
    if (parentItem) {
      parentItem.classList.toggle('active', !isExpanded);
    }
  });
});
