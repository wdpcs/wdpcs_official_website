'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const alertBox = document.getElementById('loginAlert');
  const loginForm = document.getElementById('loginForm');
  const mfaForm = document.getElementById('mfaForm');
  const forgotView = document.getElementById('forgotView');
  const togglePwdBtn = document.getElementById('togglePwdBtn');
  const pwdInput = document.getElementById('password');
  const loginSubmitBtn = document.getElementById('loginSubmitBtn');

  function showAlert(msg, type = 'error') {
    alertBox.textContent = msg;
    alertBox.className = `alert alert-${type}`;
    alertBox.style.display = 'block';
  }
  function clearAlert() {
    alertBox.style.display = 'none';
  }

  // If already authenticated, proceed cleanly to dashboard
  fetch('/api/admin/auth/me', { credentials: 'same-origin' })
    .then(r => { if (r.ok) window.location.replace('/dashboard.html'); })
    .catch(() => {});

  togglePwdBtn.addEventListener('click', () => {
    const isHidden = pwdInput.type === 'password';
    pwdInput.type = isHidden ? 'text' : 'password';
    togglePwdBtn.textContent = isHidden ? 'Hide' : 'Show';
    togglePwdBtn.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
  });

  document.getElementById('showForgotBtn').addEventListener('click', () => {
    clearAlert();
    loginForm.style.display = 'none';
    mfaForm.style.display = 'none';
    forgotView.style.display = 'block';
  });

  document.getElementById('backToLoginBtn').addEventListener('click', () => {
    clearAlert();
    forgotView.style.display = 'none';
    loginForm.style.display = 'block';
  });

  document.getElementById('backToLoginFromMfaBtn').addEventListener('click', () => {
    clearAlert();
    mfaForm.style.display = 'none';
    loginForm.style.display = 'block';
  });

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAlert();
    loginSubmitBtn.disabled = true;
    loginSubmitBtn.textContent = 'Authenticating...';

    try {
      const resp = await fetch('/api/admin/auth/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: document.getElementById('identifier').value.trim(),
          password: pwdInput.value
        })
      });
      const data = await resp.json();
      if (!resp.ok || !data.ok) {
        showAlert(data.error || 'Authentication failed.', 'error');
        return;
      }
      if (data.mfaRequired) {
        loginForm.style.display = 'none';
        mfaForm.style.display = 'block';
        document.getElementById('mfaCode').focus();
        return;
      }
      window.location.replace('/dashboard.html');
    } catch {
      showAlert('Unable to connect to the CMS server.', 'error');
    } finally {
      loginSubmitBtn.disabled = false;
      loginSubmitBtn.textContent = 'Sign In to Administration Portal';
    }
  });

  mfaForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAlert();
    try {
      const resp = await fetch('/api/admin/auth/mfa-verify', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: document.getElementById('mfaCode').value.trim() })
      });
      const data = await resp.json();
      if (!resp.ok || !data.ok) {
        showAlert(data.error || 'MFA verification failed.', 'error');
        return;
      }
      window.location.replace('/dashboard.html');
    } catch {
      showAlert('Network error during MFA verification.', 'error');
    }
  });

  document.getElementById('forgotRequestForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAlert();
    try {
      const resp = await fetch('/api/admin/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: document.getElementById('forgotIdentifier').value.trim() })
      });
      const data = await resp.json();
      if (!resp.ok) {
        showAlert(data.error || 'Request failed.', 'error');
        return;
      }
      let msg = data.message || 'Password reset token issued.';
      if (data.devResetToken) {
        document.getElementById('resetToken').value = data.devResetToken;
        msg += ` (Development token prefilled cleanly below.)`;
      }
      showAlert(msg, 'info');
    } catch {
      showAlert('Failed to send reset request.', 'error');
    }
  });

  document.getElementById('resetConfirmForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAlert();
    try {
      const resp = await fetch('/api/admin/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: document.getElementById('resetToken').value.trim(),
          newPassword: document.getElementById('resetNewPassword').value
        })
      });
      const data = await resp.json();
      if (!resp.ok || !data.ok) {
        showAlert(data.error || 'Password reset failed.', 'error');
        return;
      }
      forgotView.style.display = 'none';
      loginForm.style.display = 'block';
      showAlert('Password reset successfully. Sign in with your new password.', 'success');
    } catch {
      showAlert('Network error during password reset.', 'error');
    }
  });
});

