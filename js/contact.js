/**
 * WAYANAD DISTRICT POLICE CO-OPERATIVE SOCIETY LTD. NO. W 208
 * WhatsApp Enquiry Facility Handler
 * Official Society WhatsApp: +91 8301995940 | Mailbox: wdpcs.208@gmail.com
 */

document.addEventListener('DOMContentLoaded', () => {
  const SOCIETY_WHATSAPP = '918301995940';

  const nameInput = document.getElementById('waName');
  const memberIdInput = document.getElementById('waMemberId');
  const categorySelect = document.getElementById('waCategory');
  const messageInput = document.getElementById('waMessage');
  const startChatBtn = document.getElementById('startWhatsAppChatBtn');

  // Simple Enquiry Form Redirect to WhatsApp
  if (startChatBtn) {
    startChatBtn.addEventListener('click', () => {
      const name = nameInput ? nameInput.value.trim() : '';
      const memberId = memberIdInput ? memberIdInput.value.trim() : '';
      const category = categorySelect ? categorySelect.value : 'General Enquiry';
      const message = messageInput ? messageInput.value.trim() : '';

      // Validate required fields
      if (!name) {
        alert('Please enter your name.');
        if (nameInput) nameInput.focus();
        return;
      }

      if (!message) {
        alert('Please enter your message or enquiry.');
        if (messageInput) messageInput.focus();
        return;
      }

      // Format clean, direct message for Society WhatsApp
      const lines = [
        '*Official Enquiry - WDPCS (W 208)*',
        `*Name:* ${name}`
      ];

      if (memberId) {
        lines.push(`*Member / Dept ID:* ${memberId}`);
      }

      if (category && category !== 'General Enquiry') {
        lines.push(`*Category:* ${category}`);
      }

      lines.push('');
      lines.push('*Message:*');
      lines.push(message);

      const waText = lines.join('\n');
      const waUrl = `https://wa.me/${SOCIETY_WHATSAPP}?text=${encodeURIComponent(waText)}`;

      // Open WhatsApp chat directly
      window.open(waUrl, '_blank', 'noopener,noreferrer');
    });
  }
});

