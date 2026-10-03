/**
 * Account Services - Auth UI Controller
 * - Modo Normal (Utilizador Comum): Apenas o Cartão Interativo Deslizante.
 * - Modo Desenvolvedor: Ativado exclusivamente via Bookmarklet da Barra de Favoritos (ou atalho Ctrl+Shift+D).
 */

/* ==========================================================================
   SSO ENGINE — Account Services
   Gera tokens de sessão e redireciona para apps externas após login.
   ========================================================================== */
const SSO_SESSION_KEY = 'as_sso_session';
const SSO_TOKEN_VERSION = 1;

/** Gera um token SSO auto-contido (base64 JSON). Não criptográfico — adequado para sites estáticos. */
function generateSSOToken(user) {
  const payload = {
    v: SSO_TOKEN_VERSION,
    name: user.name,
    email: user.email,
    picture: user.picture || null,
    provider: user.provider || 'email',
    iat: Date.now(),
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 dias
  };
  return btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
}

/** Verifica e devolve o payload de um token SSO, ou null se inválido/expirado. */
function verifySSOToken(token) {
  try {
    const payload = JSON.parse(decodeURIComponent(escape(atob(token))));
    if (!payload || payload.v !== SSO_TOKEN_VERSION) return null;
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Guarda a sessão activa no localStorage desta origem. */
function saveSession(user) {
  const token = generateSSOToken(user);
  localStorage.setItem(SSO_SESSION_KEY, token);
  return token;
}

/** Lê a sessão activa, ou null se não existir/expirada. */
function getSession() {
  const token = localStorage.getItem(SSO_SESSION_KEY);
  if (!token) return null;
  return verifySSOToken(token);
}

/** Apaga a sessão activa. */
function clearSession() {
  localStorage.removeItem(SSO_SESSION_KEY);
}

/** Redireciona de volta para a app externa com o token SSO no URL. */
function redirectToApp(redirectUrl, token, user) {
  const url = new URL(redirectUrl);
  url.searchParams.set('sso_token', token);
  url.searchParams.set('sso_name', user.name || '');
  url.searchParams.set('sso_email', user.email || '');
  url.searchParams.set('sso_provider', user.provider || 'email');
  if (user.picture) url.searchParams.set('sso_picture', user.picture);
  window.location.href = url.toString();
}

// Expor funções SSO globalmente para uso externo
window.AccountServicesSSO = {
  getSession,
  clearSession,
  verifySSOToken,
  generateSSOToken
};

document.addEventListener('DOMContentLoaded', () => {

  /* ==========================================================================
     SSO — LEITURA DE PARÂMETROS E RETOMA DE SESSÃO
     ========================================================================== */
  const ssoParams = new URLSearchParams(window.location.search);
  const ssoRedirectTo = ssoParams.get('redirect_to');    // URL de retorno
  const ssoAppName   = ssoParams.get('app_name') || '';  // Nome da app
  const ssoAppLogo   = ssoParams.get('app_logo') || '';  // Logo da app (URL)

  // Mostra banner de consentimento se vier de uma app externa
  if (ssoRedirectTo) {
    const banner = document.createElement('div');
    banner.id = 'sso-consent-banner';
    banner.innerHTML = `
      <div class="sso-banner-inner">
        ${ssoAppLogo ? `<img src="${ssoAppLogo}" class="sso-app-logo" alt="${ssoAppName}">` : ''}
        <div class="sso-banner-text">
          <strong>${ssoAppName || 'Uma aplicação'}</strong> está a pedir acesso à tua conta.
          <span>Inicia sessão para continuar.</span>
        </div>
      </div>`;
    document.body.insertBefore(banner, document.body.firstChild);
  }

  // Retoma sessão automática se já estiver autenticado
  const existingSession = getSession();
  if (existingSession && ssoRedirectTo) {
    const token = localStorage.getItem(SSO_SESSION_KEY);
    redirectToApp(ssoRedirectTo, token, existingSession);
    return; // Não renderiza a página de login
  }

  // DOM Elements - Modo Desenvolvedor
  const devNavBar = document.getElementById('devNavBar');
  const btnDevSideBySide = document.getElementById('btnDevSideBySide');
  const btnDevInteractive = document.getElementById('btnDevInteractive');
  const btnDevClose = document.getElementById('btnDevClose');

  const interactiveDisplay = document.getElementById('interactiveDisplay');
  const sideBySideDisplay = document.getElementById('sideBySideDisplay');

  // DOM Elements - Modo Interativo Deslizante
  const authCard = document.getElementById('authCard');
  const sliderBtnToRegister = document.getElementById('sliderBtnToRegister');
  const sliderBtnToLogin = document.getElementById('sliderBtnToLogin');
  const sliderLinkToLogin = document.getElementById('sliderLinkToLogin');

  const sliderLoginForm = document.getElementById('sliderLoginForm');
  const sliderRegisterForm = document.getElementById('sliderRegisterForm');
  const btnSliderRegSubmit = document.getElementById('btnSliderRegSubmit');

  // Side-by-side forms
  const sideRegisterForm = document.getElementById('sideRegisterForm');
  const sideLoginForm = document.getElementById('sideLoginForm');

  // Steppers
  const stepperBars = document.querySelectorAll('.stepper-bar');
  let currentStep = 1;
  const totalSteps = 4;

  /* ==========================================================================
     1. CONTROLE DO MODO DESENVOLVEDOR (ATIVADO VIA BOOKMARKLET)
     ========================================================================== */
  let isDevMode = false;

  window.activateDevMode = function() {
    isDevMode = true;
    if (devNavBar) devNavBar.style.display = 'flex';
    document.body.classList.add('mode-dev-active');
    document.body.classList.remove('mode-user-production');
    
    // Por defeito ao ativar modo dev, vai para a Vista Lado a Lado (Design)
    showDevSideBySide();
    showToast('Modo Desenvolvedor Ativado!', 'info');
  };

  window.deactivateDevMode = function() {
    isDevMode = false;
    if (devNavBar) devNavBar.style.display = 'none';
    document.body.classList.remove('mode-dev-active');
    document.body.classList.add('mode-user-production');
    
    // Volta ao modo comum do utilizador
    if (interactiveDisplay) interactiveDisplay.style.display = 'flex';
    if (sideBySideDisplay) sideBySideDisplay.style.display = 'none';
    showToast('Modo Desenvolvedor Desativado.', 'info');
  };

  window.toggleDevMode = function() {
    if (isDevMode) window.deactivateDevMode();
    else window.activateDevMode();
  };

  function showDevSideBySide() {
    if (btnDevSideBySide) btnDevSideBySide.classList.add('active');
    if (btnDevInteractive) btnDevInteractive.classList.remove('active');
    if (sideBySideDisplay) sideBySideDisplay.style.display = 'flex';
    if (interactiveDisplay) interactiveDisplay.style.display = 'none';
  }

  function showDevInteractive() {
    if (btnDevInteractive) btnDevInteractive.classList.add('active');
    if (btnDevSideBySide) btnDevSideBySide.classList.remove('active');
    if (sideBySideDisplay) sideBySideDisplay.style.display = 'none';
    if (interactiveDisplay) interactiveDisplay.style.display = 'flex';
  }

  if (btnDevSideBySide) btnDevSideBySide.addEventListener('click', showDevSideBySide);
  if (btnDevInteractive) btnDevInteractive.addEventListener('click', showDevInteractive);
  if (btnDevClose) btnDevClose.addEventListener('click', window.deactivateDevMode);

  // Atalho de teclado para desenvolvedor: Ctrl + Shift + D
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
      e.preventDefault();
      window.toggleDevMode();
    }
  });

  // Ativação por URL se tiver ?dev=true
  if (window.location.search.includes('dev=true') || window.location.search.includes('dev=1')) {
    window.activateDevMode();
  }

  /* ==========================================================================
     2. MODO INTERATIVO (DESLIZANTE)
     ========================================================================== */
  function openRegisterSlider() {
    authCard.classList.add('right-panel-active');
  }

  function openLoginSlider() {
    authCard.classList.remove('right-panel-active');
  }

  if (sliderBtnToRegister) sliderBtnToRegister.addEventListener('click', openRegisterSlider);
  if (sliderBtnToLogin) sliderBtnToLogin.addEventListener('click', openLoginSlider);
  if (sliderLinkToLogin) sliderLinkToLogin.addEventListener('click', openLoginSlider);

  /* ==========================================================================
     3. ALTERNADOR DE PALAVRA-PASSE (EYE TOGGLE)
     ========================================================================== */
  const toggleEyeButtons = document.querySelectorAll('.btn-toggle-eye');
  toggleEyeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const box = btn.closest('.input-box, .custom-input-box');
      const input = box.querySelector('input');

      if (input.type === 'password') {
        input.type = 'text';
        btn.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
        `;
      } else {
        input.type = 'password';
        btn.innerHTML = `
          <svg class="eye-off-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m9.88 9.88 4.24 4.24m-6.36-2.12a9 9 0 0 1 12.24 0M1 1l22 22M3 13.5A10.05 10.05 0 0 1 2 12s3-7 10-7a9.74 9.74 0 0 1 5.39 1.61M21.82 13.5a10.05 10.05 0 0 1-1.82 2.5C18 18 15 19 12 19a9.7 9.7 0 0 1-4.39-1.05"></path>
          </svg>
        `;
      }
    });
  });

  /* ==========================================================================
     4. STEPPER CONTROLLER
     ========================================================================== */
  stepperBars.forEach(bar => {
    const steps = bar.querySelectorAll('.step-col');
    steps.forEach(step => {
      step.addEventListener('click', () => {
        const stepNum = parseInt(step.getAttribute('data-step'), 10);
        steps.forEach(s => s.classList.remove('active'));
        step.classList.add('active');
        currentStep = stepNum;
        updateStepperButtonText();
      });
    });
  });

  function updateStepperButtonText() {
    if (btnSliderRegSubmit) {
      const label = btnSliderRegSubmit.querySelector('span');
      if (label) label.textContent = currentStep === totalSteps ? 'CRIAR CONTA' : 'SEGUINTE';
    }
  }

  /* ==========================================================================
     5. BANCO DE DADOS LOCAL (LOCALSTORAGE)
     ========================================================================== */
  const DB_KEY = 'account_services_db_v3';

  function getUsers() {
    try {
      const stored = localStorage.getItem(DB_KEY);
      if (!stored) {
        const defaults = [
          { name: 'Demo Teste', email: 'demo@exemplo.com', password: 'password123' }
        ];
        localStorage.setItem(DB_KEY, JSON.stringify(defaults));
        return defaults;
      }
      return JSON.parse(stored);
    } catch {
      return [];
    }
  }

  function saveUser(user) {
    const list = getUsers();
    const idx = list.findIndex(u => u.email === user.email);
    if (idx >= 0) list[idx] = user;
    else list.push(user);
    localStorage.setItem(DB_KEY, JSON.stringify(list));
  }

  /* ==========================================================================
     6. SUBMISSÃO DE FORMULÁRIOS
     ========================================================================== */
  function handleRegisterAction(name, email, password) {
    if (!name) {
      showToast('Por favor, introduza o seu nome completo.', 'error');
      return false;
    }
    if (!email || !email.includes('@')) {
      showToast('Por favor, introduza um e-mail válido.', 'error');
      return false;
    }
    if (!password || password.length < 6) {
      showToast('A palavra-passe deve ter pelo menos 6 caracteres.', 'error');
      return false;
    }

    if (currentStep < totalSteps) {
      currentStep++;
      stepperBars.forEach(bar => {
        const steps = bar.querySelectorAll('.step-col');
        steps.forEach(s => {
          const num = parseInt(s.getAttribute('data-step'), 10);
          s.classList.toggle('active', num === currentStep);
        });
      });
      updateStepperButtonText();
      showToast(`Passo ${currentStep} ativado.`, 'info');
      return true;
    }

    const newUser = {
      name,
      email: email.toLowerCase().trim(),
      password,
      createdAt: new Date().toISOString()
    };

    saveUser(newUser);
    showToast(`Conta criada com sucesso! Bem-vindo, ${name}!`, 'success');

    window.dispatchEvent(new CustomEvent('auth:register', { detail: newUser }));
    openSession(newUser);
    return true;
  }

  function handleLoginAction(email, password) {
    if (!email || !email.includes('@')) {
      showToast('Por favor, introduza um e-mail válido.', 'error');
      return;
    }
    if (!password) {
      showToast('Por favor, introduza a sua palavra-passe.', 'error');
      return;
    }

    const users = getUsers();
    const normalized = email.toLowerCase().trim();
    const found = users.find(u => u.email === normalized && u.password === password);

    if (found) {
      showToast(`Sessão iniciada! Bem-vindo, ${found.name}.`, 'success');
      window.dispatchEvent(new CustomEvent('auth:login', { detail: found }));
      openSession(found);
    } else {
      showToast('E-mail ou palavra-passe incorretos.', 'error');
    }
  }

  // Event Listeners dos Formulários Interativos
  if (sliderRegisterForm) {
    sliderRegisterForm.addEventListener('submit', (e) => {
      e.preventDefault();
      handleRegisterAction(
        document.getElementById('sliderRegName').value.trim(),
        document.getElementById('sliderRegEmail').value.trim(),
        document.getElementById('sliderRegPass').value
      );
    });
  }

  if (sliderLoginForm) {
    sliderLoginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      handleLoginAction(
        document.getElementById('sliderLogEmail').value.trim(),
        document.getElementById('sliderLogPass').value
      );
    });
  }

  // Event Listeners dos Formulários da Vista Lado a Lado
  if (sideRegisterForm) {
    sideRegisterForm.addEventListener('submit', (e) => {
      e.preventDefault();
      handleRegisterAction(
        document.getElementById('sideRegName').value.trim(),
        document.getElementById('sideRegEmail').value.trim(),
        document.getElementById('sideRegPass').value
      );
    });
  }

  if (sideLoginForm) {
    sideLoginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      handleLoginAction(
        document.getElementById('sideLogEmail').value.trim(),
        document.getElementById('sideLogPass').value
      );
    });
  }

  /* ==========================================================================
     7. INTEGRAÇÃO LOGIN COM O GOOGLE (GOOGLE SIGN-IN)
     ========================================================================== */
  // Configure o seu Google Client ID aqui se desejar (ex: 'xxxx.apps.googleusercontent.com')
  window.GOOGLE_CLIENT_ID = window.GOOGLE_CLIENT_ID || '';

  function handleGoogleCredential(response) {
    try {
      const base64Url = response.credential.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));

      const payload = JSON.parse(jsonPayload);
      const googleUser = {
        name: payload.name || 'Utilizador Google',
        email: payload.email,
        picture: payload.picture,
        provider: 'google',
        createdAt: new Date().toISOString()
      };

      saveUser(googleUser);
      showToast(`Bem-vindo, ${googleUser.name}! Sessão iniciada com a Google.`, 'success');

      window.dispatchEvent(new CustomEvent('auth:google', { detail: googleUser }));
      window.dispatchEvent(new CustomEvent('auth:login', { detail: googleUser }));
      openSession(googleUser);
    } catch (err) {
      console.error('Erro ao ler token da Google:', err);
      showToast('Erro ao autenticar com a Google.', 'error');
    }
  }

  function triggerGoogleSignIn() {
    if (window.GOOGLE_CLIENT_ID && window.google && window.google.accounts) {
      window.google.accounts.id.initialize({
        client_id: window.GOOGLE_CLIENT_ID,
        callback: handleGoogleCredential
      });
      window.google.accounts.id.prompt();
    } else {
      // Modo Demonstração Rápido / Fallback Inteligente
      const choice = confirm('Deseja iniciar sessão com a conta Google de teste?\n(Para usar a API real de produção, configure o GOOGLE_CLIENT_ID no script.js)');
      if (choice) {
        const demoGoogleUser = {
          name: 'Utilizador Google',
          email: 'demo.google@gmail.com',
          provider: 'google',
          createdAt: new Date().toISOString()
        };
        saveUser(demoGoogleUser);
        showToast('Sessão iniciada com a Conta Google!', 'success');
        window.dispatchEvent(new CustomEvent('auth:google', { detail: demoGoogleUser }));
        window.dispatchEvent(new CustomEvent('auth:login', { detail: demoGoogleUser }));
        openSession(demoGoogleUser);
      }
    }
  }

  const btnGoogleLoginSlider = document.getElementById('btnGoogleLoginSlider');
  const btnGoogleLoginSide = document.getElementById('btnGoogleLoginSide');

  if (btnGoogleLoginSlider) btnGoogleLoginSlider.addEventListener('click', triggerGoogleSignIn);
  if (btnGoogleLoginSide) btnGoogleLoginSide.addEventListener('click', triggerGoogleSignIn);

  /* ==========================================================================
     8. INTEGRAÇÃO LOGIN COM A MICROSOFT (MICROSOFT ENTRA ID / MSAL)
     ========================================================================== */
  // Configure o seu Microsoft Client ID aqui se desejar (Azure Portal / Microsoft Entra ID)
  window.MICROSOFT_CLIENT_ID = window.MICROSOFT_CLIENT_ID || '';

  async function triggerMicrosoftSignIn() {
    if (window.MICROSOFT_CLIENT_ID && window.msal) {
      try {
        const msalConfig = {
          auth: {
            clientId: window.MICROSOFT_CLIENT_ID,
            redirectUri: window.location.href.split('#')[0]
          }
        };
        const msalApp = new msal.PublicClientApplication(msalConfig);
        if (msalApp.initialize) await msalApp.initialize();

        const loginResponse = await msalApp.loginPopup({
          scopes: ['User.Read', 'openid', 'profile', 'email']
        });

        const account = loginResponse.account;
        const msUser = {
          name: account.name || 'Utilizador Microsoft',
          email: account.username || account.email,
          provider: 'microsoft',
          createdAt: new Date().toISOString()
        };

        saveUser(msUser);
        showToast(`Bem-vindo, ${msUser.name}! Sessão iniciada com a Microsoft.`, 'success');
        window.dispatchEvent(new CustomEvent('auth:microsoft', { detail: msUser }));
        window.dispatchEvent(new CustomEvent('auth:login', { detail: msUser }));
        openSession(msUser);
      } catch (err) {
        console.error('Erro MSAL Microsoft:', err);
        showToast('Erro ao autenticar com a Microsoft.', 'error');
      }
    } else {
      // Modo Demonstração Rápido / Fallback Inteligente
      const choice = confirm('Deseja iniciar sessão com a conta Microsoft de teste?\n(Para usar a API real de produção com o Azure/Entra ID, configure o MICROSOFT_CLIENT_ID no script.js)');
      if (choice) {
        const demoMsUser = {
          name: 'Utilizador Microsoft',
          email: 'demo.user@outlook.com',
          provider: 'microsoft',
          createdAt: new Date().toISOString()
        };
        saveUser(demoMsUser);
        showToast('Sessão iniciada com a Conta Microsoft!', 'success');
        window.dispatchEvent(new CustomEvent('auth:microsoft', { detail: demoMsUser }));
        window.dispatchEvent(new CustomEvent('auth:login', { detail: demoMsUser }));
        openSession(demoMsUser);
      }
    }
  }

  const btnMicrosoftLoginSlider = document.getElementById('btnMicrosoftLoginSlider');
  const btnMicrosoftLoginSide = document.getElementById('btnMicrosoftLoginSide');

  if (btnMicrosoftLoginSlider) btnMicrosoftLoginSlider.addEventListener('click', triggerMicrosoftSignIn);
  if (btnMicrosoftLoginSide) btnMicrosoftLoginSide.addEventListener('click', triggerMicrosoftSignIn);

  /* ==========================================================================
     9. MODAL DE SESSÃO & HELPERS
     ========================================================================== */
  const sessionModal = document.getElementById('sessionModal');
  const modalBadge = document.getElementById('modalBadge');
  const modalUserName = document.getElementById('modalUserName');
  const modalUserEmail = document.getElementById('modalUserEmail');
  const modalUserAvatar = document.getElementById('modalUserAvatar');
  const modalProviderInfo = document.getElementById('modalProviderInfo');
  const modalCloseBtn = document.getElementById('modalCloseBtn');

  function openSession(user) {
    // Guarda a sessão SSO
    const token = saveSession(user);

    // Se veio de uma app externa via SSO, redireciona imediatamente
    if (ssoRedirectTo) {
      showToast(`Sessão iniciada! A redirecionar para ${ssoAppName || 'a aplicação'}...`, 'success');
      setTimeout(() => redirectToApp(ssoRedirectTo, token, user), 1200);
      return;
    }

    // Modo normal — mostra modal de confirmação
    if (!sessionModal) return;
    modalUserName.textContent = user.name || 'Utilizador';
    modalUserEmail.textContent = user.email;

    if (user.provider === 'google') {
      if (modalBadge) modalBadge.textContent = '✓ Autenticado via Google';
      if (modalProviderInfo) modalProviderInfo.innerHTML = '<p>Sessão iniciada através da sua <strong>Conta Google</strong>!</p>';
    } else if (user.provider === 'microsoft') {
      if (modalBadge) modalBadge.textContent = '✓ Autenticado via Microsoft';
      if (modalProviderInfo) modalProviderInfo.innerHTML = '<p>Sessão iniciada através da sua <strong>Conta Microsoft</strong>!</p>';
    } else {
      if (modalBadge) modalBadge.textContent = '✓ Autenticado com Sucesso';
      if (modalProviderInfo) modalProviderInfo.innerHTML = '<p>Autenticação concluída com sucesso!</p>';
    }

    if (user.picture) {
      modalUserAvatar.innerHTML = `<img src="${user.picture}" alt="${user.name}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
    } else if (user.provider === 'microsoft') {
      modalUserAvatar.innerHTML = `
        <svg viewBox="0 0 21 21" width="30" height="30">
          <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
          <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
          <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
          <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
        </svg>`;
    } else {
      modalUserAvatar.textContent = (user.name ? user.name.charAt(0) : 'U').toUpperCase();
    }

    sessionModal.classList.add('active');
  }

  // Logout global
  window.accountServicesLogout = function() {
    clearSession();
    window.dispatchEvent(new CustomEvent('auth:logout'));
    showToast('Sessão terminada.', 'info');
  };

  if (modalCloseBtn) {
    modalCloseBtn.addEventListener('click', () => {
      sessionModal.classList.remove('active');
    });
  }

  if (sessionModal) {
    sessionModal.addEventListener('click', (e) => {
      if (e.target === sessionModal) sessionModal.classList.remove('active');
    });
  }

  window.handleForgotPassword = function() {
    const input = prompt('Introduza o seu e-mail para recuperar a palavra-passe:');
    if (input && input.includes('@')) {
      showToast(`Link de recuperação enviado para: ${input}`, 'success');
    } else if (input !== null) {
      showToast('E-mail inválido.', 'error');
    }
  };

  window.scrollToLoginCard = function() {
    const el = document.getElementById('loginCardAnchor');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  window.simulateSwitchToLogin = function() {
    showDevInteractive();
    openLoginSlider();
  };

  window.simulateSwitchToRegister = function() {
    showDevInteractive();
    openRegisterSlider();
  };

  /* ==========================================================================
     9. TOAST NOTIFICATIONS
     ========================================================================== */
  window.showToast = function(msg, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.textContent = msg;
    container.appendChild(t);

    setTimeout(() => {
      t.style.opacity = '0';
      t.style.transform = 'translateX(100%)';
      t.style.transition = 'all 0.25s ease';
      setTimeout(() => t.remove(), 250);
    }, 3500);
  };
});
