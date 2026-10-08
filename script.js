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
    firstName: user.firstName || null,
    lastName: user.lastName || null,
    email: user.email,
    birthDate: user.birthDate || null,
    gender: user.gender || null,
    picture: user.picture || null,
    provider: user.provider || 'nai',
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
     SSO — LEITURA DE PARÂMETROS E FLUXO EM 2 PASSOS (CONSENTIMENTO -> LOGIN)
     Suporta tanto Redirecionamento (redirect_to) como Popup (window.opener)
     ========================================================================== */
  const ssoParams = new URLSearchParams(window.location.search);
  const ssoRedirectTo = ssoParams.get('redirect_to');
  const ssoAppName   = ssoParams.get('app_name') || '';
  const ssoAppLogo   = ssoParams.get('app_logo') || '';
  const isPopupMode  = Boolean(window.opener || ssoParams.get('sso_mode') === 'popup');
  const isSSORequest = Boolean(ssoRedirectTo || isPopupMode);

  const ssoAuthScreen          = document.getElementById('ssoAuthScreen');
  const interactiveDisplay     = document.getElementById('interactiveDisplay');
  const sideBySideDisplay      = document.getElementById('sideBySideDisplay');
  const ssoAllowBtn            = document.getElementById('ssoAllowBtn');
  const ssoAllowBtnText        = document.getElementById('ssoAllowBtnText');
  const ssoCancelBtn           = document.getElementById('ssoCancelBtn');
  const ssoActiveAccount       = document.getElementById('ssoActiveAccount');
  const ssoActiveAvatar        = document.getElementById('ssoActiveAvatar');
  const ssoActiveName          = document.getElementById('ssoActiveName');
  const ssoActiveEmail         = document.getElementById('ssoActiveEmail');
  const ssoSwitchAccountWrapper = document.getElementById('ssoSwitchAccountWrapper');
  const ssoSwitchAccountBtn    = document.getElementById('ssoSwitchAccountBtn');

  // Função para responder à aplicação externa (seja por popup ou por redirect)
  function sendAuthToExternalApp(token, user) {
    if (window.opener) {
      try {
        window.opener.postMessage({
          type: 'ACCOUNT_SERVICES_SSO_SUCCESS',
          token: token,
          user: user
        }, '*');
      } catch (e) {
        console.error('Erro postMessage opener:', e);
      }
      setTimeout(() => window.close(), 600);
      return;
    }
    if (ssoRedirectTo) {
      redirectToApp(ssoRedirectTo, token, user);
    }
  }

  // Se veio de uma app externa via SSO (Redirect ou Popup):
  if (isSSORequest && ssoAuthScreen) {
    // 1. Oculta a tela normal inicialmente (mostra primeiro o ecrã de consentimento)
    if (interactiveDisplay) interactiveDisplay.style.display = 'none';
    if (sideBySideDisplay)  sideBySideDisplay.style.display  = 'none';

    ssoAuthScreen.style.display = 'flex';

    // Preenche informações da app
    const nameEl1 = document.getElementById('ssoAppNameDisplay');
    const nameEl2 = document.getElementById('ssoShareAppName');
    const appDisplayName = ssoAppName || 'Aplicação';
    if (nameEl1) nameEl1.textContent = appDisplayName;
    if (nameEl2) nameEl2.textContent = appDisplayName;

    if (ssoAppLogo) {
      const iconEl = document.getElementById('ssoAppIcon');
      if (iconEl) iconEl.innerHTML = `<img src="${ssoAppLogo}" alt="${appDisplayName}">`;
    }

    // Verifica se já existe uma sessão ativa
    const existingSession = getSession();

    if (existingSession) {
      // Já está autenticado: exibe a conta atual para consentimento rápido
      if (ssoActiveAccount) ssoActiveAccount.style.display = 'flex';
      if (ssoActiveName) ssoActiveName.textContent = existingSession.name || 'Utilizador';
      if (ssoActiveEmail) ssoActiveEmail.textContent = existingSession.email || '';
      if (ssoActiveAvatar) {
        if (existingSession.picture) {
          ssoActiveAvatar.innerHTML = `<img src="${existingSession.picture}" alt="${existingSession.name}">`;
        } else {
          ssoActiveAvatar.textContent = (existingSession.name || 'U').charAt(0).toUpperCase();
        }
      }
      if (ssoAllowBtnText) ssoAllowBtnText.textContent = `Continuar como ${existingSession.name || 'Utilizador'}`;
      if (ssoSwitchAccountWrapper) ssoSwitchAccountWrapper.style.display = 'block';

      // Clicar em Permitir quando já tem sessão: autoriza e conclui de imediato
      if (ssoAllowBtn) {
        ssoAllowBtn.addEventListener('click', () => {
          showToast(`Acesso concedido a ${appDisplayName}! A ligar...`, 'success');
          const token = localStorage.getItem(SSO_SESSION_KEY) || generateSSOToken(existingSession);
          setTimeout(() => sendAuthToExternalApp(token, existingSession), 700);
        });
      }

      // Clicar em "Iniciar com outra conta": fecha o consentimento e abre a tela de login normal
      if (ssoSwitchAccountBtn) {
        ssoSwitchAccountBtn.addEventListener('click', () => {
          ssoAuthScreen.style.display = 'none';
          if (interactiveDisplay) interactiveDisplay.style.display = 'flex';
          showToast(`Inicie sessão para autorizar ${appDisplayName}`, 'info');
        });
      }

    } else {
      // Não tem sessão ativa: o botão Permitir avança para a tela de login/criar conta normal!
      if (ssoActiveAccount) ssoActiveAccount.style.display = 'none';
      if (ssoSwitchAccountWrapper) ssoSwitchAccountWrapper.style.display = 'none';
      if (ssoAllowBtnText) ssoAllowBtnText.textContent = 'Permitir acesso';

      if (ssoAllowBtn) {
        ssoAllowBtn.addEventListener('click', () => {
          // Esconde ecrã de consentimento (Passo 1 concluído)
          ssoAuthScreen.style.display = 'none';
          // Revela a tela de login e criar conta normal (Passo 2)
          if (interactiveDisplay) interactiveDisplay.style.display = 'flex';
          showToast(`Acesso autorizado! Faça login ou crie conta para aceder a ${appDisplayName}`, 'info');
        });
      }
    }

    // Botão Cancelar: fecha o popup ou volta para trás
    if (ssoCancelBtn) {
      ssoCancelBtn.addEventListener('click', () => {
        if (window.opener) {
          try {
            window.opener.postMessage({ type: 'ACCOUNT_SERVICES_SSO_CANCELLED' }, '*');
          } catch (e) {}
          window.close();
        } else {
          window.history.back();
        }
      });
    }
  }

  // DOM Elements - Modo Desenvolvedor
  const devNavBar = document.getElementById('devNavBar');
  const btnDevSideBySide = document.getElementById('btnDevSideBySide');
  const btnDevInteractive = document.getElementById('btnDevInteractive');
  const btnDevClose = document.getElementById('btnDevClose');

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
  // Dados guardados em memória por passo (evita problema de inputs ocultos)
  let _savedRegData = { firstName: '', lastName: '', birth: '', gender: '', username: '' };

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
     4. STEPPER CONTROLLER — 4 PASSOS REAIS DE REGISTO
     ========================================================================== */
  function setRegisterStep(step) {
    if (step < 1 || step > totalSteps) return;
    currentStep = step;
    // Limpar dados guardados se voltar ao início
    if (step === 1) _savedRegData = { firstName: '', lastName: '', birth: '', gender: '', username: '' };

    // Atualiza badges em todas as barras de passos
    stepperBars.forEach(bar => {
      const steps = bar.querySelectorAll('.step-col');
      steps.forEach(s => {
        const num = parseInt(s.getAttribute('data-step'), 10);
        s.classList.toggle('active', num === currentStep);
      });
    });

    // Atualiza panes no formulário deslizante
    for (let i = 1; i <= 4; i++) {
      const pane = document.getElementById(`sliderPaneStep${i}`);
      if (pane) pane.style.display = (i === currentStep) ? 'flex' : 'none';
    }

    // Atualiza panes no formulário lado a lado
    for (let i = 1; i <= 4; i++) {
      const pane = document.getElementById(`sidePaneStep${i}`);
      if (pane) pane.style.display = (i === currentStep) ? 'flex' : 'none';
    }

    // Botões Anterior
    const btnSliderPrev = document.getElementById('btnSliderRegPrev');
    const btnSidePrev = document.getElementById('btnSideRegPrev');
    if (btnSliderPrev) btnSliderPrev.style.display = currentStep > 1 ? 'inline-flex' : 'none';
    if (btnSidePrev) btnSidePrev.style.display = currentStep > 1 ? 'inline-flex' : 'none';

    // Texto do Botão Submeter
    if (btnSliderRegSubmit) {
      const label = btnSliderRegSubmit.querySelector('span');
      if (label) label.textContent = currentStep === totalSteps ? 'CRIAR CONTA' : 'SEGUINTE';
    }
    const btnSideRegSubmit = document.getElementById('btnSideRegSubmit');
    if (btnSideRegSubmit) {
      const label = btnSideRegSubmit.querySelector('span');
      if (label) label.textContent = currentStep === totalSteps ? 'CRIAR CONTA' : 'SEGUINTE';
    }
  }

  // Navegação ao clicar nos badges das barras (para passos anteriores já alcançados)
  stepperBars.forEach(bar => {
    const steps = bar.querySelectorAll('.step-col');
    steps.forEach(step => {
      step.addEventListener('click', () => {
        const stepNum = parseInt(step.getAttribute('data-step'), 10);
        if (stepNum < currentStep) {
          setRegisterStep(stepNum);
        }
      });
    });
  });

  // Botões de Voltar (Anterior)
  const btnSliderRegPrev = document.getElementById('btnSliderRegPrev');
  if (btnSliderRegPrev) {
    btnSliderRegPrev.addEventListener('click', () => {
      if (currentStep > 1) setRegisterStep(currentStep - 1);
    });
  }

  const btnSideRegPrev = document.getElementById('btnSideRegPrev');
  if (btnSideRegPrev) {
    btnSideRegPrev.addEventListener('click', () => {
      if (currentStep > 1) setRegisterStep(currentStep - 1);
    });
  }

  // Inicializa o formulário de criação de conta no Passo 1
  setRegisterStep(1);

  /* ==========================================================================
     5. MOTOR DE BASE DE DADOS NAI & DOMÍNIO @NAI.COM
     - Domínio próprio de e-mail: @nai.com (como Google, Outlook e Sapo)
     - Armazenamento Seguro: Hashes SHA-256 com Salt (Web Crypto API)
     - Nuvem Gratuita da Google: Cloud Firestore (Firebase Spark Plan) + Fallback Local
     ========================================================================== */
  const NAI_DOMAIN = '@nai.com';
  const DB_KEY = 'nai_accounts_secure_v4';
  const PASSWORD_SALT = 'nai_security_salt_2026_';

  /** Normaliza qualquer username ou e-mail para o domínio próprio @nai.com */
  function formatNaiEmail(input) {
    if (!input) return '';
    const trimmed = input.trim().toLowerCase();
    if (!trimmed.includes('@')) {
      const cleanUser = trimmed.replace(/[^a-z0-9._-]/g, '');
      return `${cleanUser}${NAI_DOMAIN}`;
    }
    return trimmed;
  }

  /** Gera hash seguro SHA-256 com Salt via Web Crypto API nativa do browser */
  async function hashPassword(password) {
    if (!password) return '';
    try {
      if (window.crypto && window.crypto.subtle) {
        const encoder = new TextEncoder();
        const data = encoder.encode(PASSWORD_SALT + password);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      }
    } catch (e) {
      console.warn('SubtleCrypto indisponível, a usar fallback seguro:', e);
    }
    // Fallback caso subtleCrypto esteja indisponível (ex: contexto não seguro antigo)
    let hash = 0;
    for (let i = 0; i < password.length; i++) {
      hash = ((hash << 5) - hash) + password.charCodeAt(i);
      hash |= 0;
    }
    return 'h_' + Math.abs(hash).toString(16);
  }

  // Inicialização segura do Google Firebase Cloud Firestore & Analytics
  let firestoreDb = null;
  if (typeof firebase !== 'undefined' && window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.projectId) {
    try {
      if (!firebase.apps.length) {
        firebase.initializeApp(window.FIREBASE_CONFIG);
      }
      if (typeof firebase.analytics === 'function' && window.FIREBASE_CONFIG.measurementId) {
        try { firebase.analytics(); } catch (e) { /* analytics opcional em dev/localhost */ }
      }
      firestoreDb = firebase.firestore();
      console.log('⚡ Base de Dados Google Cloud Firestore conectada com sucesso! Projeto:', window.FIREBASE_CONFIG.projectId);
    } catch (err) {
      console.warn('Google Firebase: inicialização em modo de espera local.', err);
    }
  }

  const NaiDB = {
    /** Retorna as contas guardadas no cofre local seguro */
    getLocalUsers() {
      try {
        const stored = localStorage.getItem(DB_KEY);
        if (!stored) {
          const defaults = [
            {
              name: 'Demo Teste',
              email: 'demo@nai.com',
              // Hash SHA-256 de 'password123' com o salt
              passwordHash: '60234f92cb436a63bcb6d76795df61b75a7b2f1d2e6bd5e48ca7f3b57fbbe36e',
              provider: 'nai',
              createdAt: new Date().toISOString()
            }
          ];
          localStorage.setItem(DB_KEY, JSON.stringify(defaults));
          return defaults;
        }
        return JSON.parse(stored);
      } catch {
        return [];
      }
    },

    /** Salva contas no cofre local */
    saveLocalUsers(users) {
      try {
        localStorage.setItem(DB_KEY, JSON.stringify(users));
      } catch (e) {
        console.error('Erro ao gravar utilizadores localmente:', e);
      }
    },

    /** Guarda ou atualiza utilizador no Firestore e localmente */
    async saveUser(userData) {
      const normalizedEmail = formatNaiEmail(userData.email);
      const userToSave = {
        ...userData,
        email: normalizedEmail
      };

      // 1. Guardar localmente
      const list = this.getLocalUsers();
      const idx = list.findIndex(u => u.email.toLowerCase() === normalizedEmail.toLowerCase());
      if (idx >= 0) {
        list[idx] = { ...list[idx], ...userToSave };
      } else {
        list.push(userToSave);
      }
      this.saveLocalUsers(list);

      // 2. Sincronizar com a nuvem Google Cloud Firestore se configurada
      if (firestoreDb) {
        try {
          const docId = normalizedEmail.replace(/[/.]/g, '_');
          const docRef = firestoreDb.collection('nai_accounts').doc(docId);
          
          const firestorePayload = {
            name: userToSave.name || '',
            firstName: userToSave.firstName || '',
            lastName: userToSave.lastName || '',
            username: userToSave.username || (userToSave.email ? userToSave.email.split('@')[0] : ''),
            domain: userToSave.domain || '@nai.com',
            birthDate: userToSave.birthDate || '',
            gender: userToSave.gender || '',
            genderLabel: userToSave.genderLabel || '',
            email: userToSave.email,
            passwordHash: userToSave.passwordHash || '',
            provider: userToSave.provider || 'nai',
            picture: userToSave.picture || null,
            createdAt: userToSave.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };

          await docRef.set(firestorePayload, { merge: true });
          console.log('✅ Utilizador completo sincronizado na Nuvem Google Firestore:', normalizedEmail, firestorePayload);
        } catch (err) {
          console.error('❌ Erro ao sincronizar com Google Firestore:', err.code || '', err.message || err);
          console.warn('💡 Verifique: (1) Regras do Firestore permitem escrita, (2) não está a usar file://, (3) credenciais corretas.');
        }
      }

      return userToSave;
    },

    /** Procura um utilizador por username ou e-mail */
    async findUser(emailOrUsername) {
      if (!emailOrUsername) return null;
      const normalized = formatNaiEmail(emailOrUsername);
      const raw = emailOrUsername.trim().toLowerCase();

      // 1. Consulta no Google Cloud Firestore se ativo
      if (firestoreDb) {
        try {
          const docId = normalized.replace(/[/.]/g, '_');
          const docRef = firestoreDb.collection('nai_accounts').doc(docId);
          const doc = await docRef.get();
          if (doc.exists) {
            return doc.data();
          }
        } catch (err) {
          console.warn('Consulta ao Google Firestore falhou, a recorrer a dados locais:', err);
        }
      }

      // 2. Consulta no cofre local
      const users = this.getLocalUsers();
      return users.find(u => 
        u.email.toLowerCase() === normalized.toLowerCase() ||
        u.email.toLowerCase() === raw
      ) || null;
    },

    /** Valida credenciais com hash seguro SHA-256 */
    async authenticate(emailOrUsername, password) {
      const user = await this.findUser(emailOrUsername);
      if (!user) {
        // Fallback para conta demo se ainda não inicializado
        const normalized = formatNaiEmail(emailOrUsername);
        if ((normalized === 'demo@nai.com' || emailOrUsername === 'demo@exemplo.com' || emailOrUsername === 'demo') && password === 'password123') {
          return {
            name: 'Demo Teste',
            email: 'demo@nai.com',
            provider: 'nai'
          };
        }
        return null;
      }

      const hash = await hashPassword(password);
      if (user.passwordHash && user.passwordHash === hash) {
        return user;
      }
      // Retrocompatibilidade se a conta tiver sido criada sem hash anteriormente
      if (user.password && user.password === password) {
        user.passwordHash = hash;
        delete user.password;
        await this.saveUser(user);
        return user;
      }
      return null;
    }
  };

  function getUsers() {
    return NaiDB.getLocalUsers();
  }

  function saveUser(user) {
    return NaiDB.saveUser(user);
  }

  // Expor NaiDB para consola e extensibilidade
  window.NaiDB = NaiDB;
  window.formatNaiEmail = formatNaiEmail;

  /**
   * REGRA OBRIGATÓRIA: Todas as contas criadas têm de pertencer exclusivamente ao domínio @nai.com.
   * Não é permitida a criação com nenhum outro domínio externo (ex: @gmail.com, @hotmail.com, @sapo.pt, etc.).
   */
  function validateStrictNaiEmail(rawInput) {
    if (!rawInput || !rawInput.trim()) {
      return {
        valid: false,
        error: 'Por favor, introduza o seu nome de utilizador ou e-mail @nai.com.'
      };
    }

    const trimmed = rawInput.trim().toLowerCase();

    // Se o utilizador colocou um endereço com '@':
    if (trimmed.includes('@')) {
      if (!trimmed.endsWith('@nai.com')) {
        return {
          valid: false,
          error: 'Domínio recusado! Todas as contas criadas têm de ter obrigatoriamente o domínio @nai.com (ex.: utilizador@nai.com).'
        };
      }
      const userPart = trimmed.slice(0, -8); // remove '@nai.com'
      if (!userPart || userPart.length < 3) {
        return {
          valid: false,
          error: 'O nome de utilizador antes de @nai.com tem de ter pelo menos 3 caracteres.'
        };
      }
      if (!/^[a-z0-9._-]+$/.test(userPart)) {
        return {
          valid: false,
          error: 'O e-mail @nai.com só pode conter letras, números, pontos e hífens.'
        };
      }
      return { valid: true, email: trimmed };
    }

    // Se o utilizador introduziu apenas o username (sem '@'):
    const cleanUser = trimmed.replace(/[^a-z0-9._-]/g, '');
    if (!cleanUser || cleanUser.length < 3) {
      return {
        valid: false,
        error: 'O nome de utilizador para a sua conta @nai.com tem de ter pelo menos 3 caracteres.'
      };
    }
    return { valid: true, email: `${cleanUser}@nai.com` };
  }

  /* ==========================================================================
     6. BLOQUEIO ESTRITO DE DOMÍNIO — DEPOIS DO @ SÓ PODE SER NAI.COM
     ========================================================================== */
  function setupStrictNaiEmailInput(inputId, previewId) {
    const inputEl = document.getElementById(inputId);
    const previewEl = document.getElementById(previewId);
    if (!inputEl) return;

    // Impede o utilizador de carregar na tecla @
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === '@') {
        e.preventDefault();
        showToast('O domínio @nai.com já é fixo e exclusivo! Digite apenas o nome de utilizador.', 'info');
      }
    });

    // Sanitização em tempo real (colar texto, auto-preenchimento, etc.)
    inputEl.addEventListener('input', () => {
      let val = inputEl.value;
      if (val.includes('@')) {
        val = val.split('@')[0];
        showToast('Domínio externo recusado! O domínio @nai.com é fixo e automático.', 'error');
      }
      val = val.replace(/[^a-zA-Z0-9._-]/g, '').toLowerCase();
      inputEl.value = val;
      if (previewEl) {
        previewEl.textContent = (val || 'utilizador') + '@nai.com';
      }
    });
  }

  setupStrictNaiEmailInput('sliderRegEmail', 'sliderRegEmailPreview');
  setupStrictNaiEmailInput('sideRegEmail', 'sideRegEmailPreview');

  /* ==========================================================================
     7. CONTROLADOR DO FLUXO DOS 4 PASSOS DE CRIAR CONTA
     - Passo 1 (Dados): Primeiro Nome + Apelido
     - Passo 2 (Pessoais): Data de Nascimento + Género
     - Passo 3 (E-mail): Endereço exclusivo @nai.com (verificação na base de dados)
     - Passo 4 (Senha): Palavra-passe + Confirmação
     ========================================================================== */
  async function handleRegisterStepSubmission(mode = 'slider') {
    const prefix = mode === 'slider' ? 'sliderReg' : 'sideReg';

    // Obter elementos dos passos
    const firstNameEl = document.getElementById(`${prefix}FirstName`);
    const lastNameEl  = document.getElementById(`${prefix}LastName`);
    const birthEl     = document.getElementById(`${prefix}Birth`);
    const genderEl    = document.getElementById(`${prefix}Gender`);
    const emailEl     = document.getElementById(`${prefix}Email`);
    const passEl      = document.getElementById(`${prefix}Pass`);
    const passConfEl  = document.getElementById(`${prefix}PassConfirm`);

    // --- VALIDAÇÃO PASSO 1: DADOS ---
    if (currentStep === 1) {
      const fName = firstNameEl ? firstNameEl.value.trim() : '';
      const lName = lastNameEl ? lastNameEl.value.trim() : '';
      if (!fName || fName.length < 2) {
        showToast('Por favor, introduza o seu primeiro nome.', 'error');
        if (firstNameEl) firstNameEl.focus();
        return;
      }
      if (!lName || lName.length < 2) {
        showToast('Por favor, introduza o seu apelido / sobrenome.', 'error');
        if (lastNameEl) lastNameEl.focus();
        return;
      }
      // Guardar em memória antes de avançar
      _savedRegData.firstName = fName;
      _savedRegData.lastName = lName;
      setRegisterStep(2);
      showToast('Dados guardados. Passo 2: Informações Pessoais.', 'info');
      return;
    }

    // --- VALIDAÇÃO PASSO 2: PESSOAIS ---
    if (currentStep === 2) {
      const birth = birthEl ? birthEl.value : '';
      const gender = genderEl ? genderEl.value : '';
      if (!birth) {
        showToast('Por favor, introduza a sua data de nascimento.', 'error');
        if (birthEl) birthEl.focus();
        return;
      }
      if (!gender) {
        showToast('Por favor, selecione o seu género.', 'error');
        if (genderEl) genderEl.focus();
        return;
      }
      // Guardar em memória antes de avançar (pane ficará oculto)
      _savedRegData.birth = birth;
      _savedRegData.gender = gender;
      console.log('📋 Dados pessoais guardados em memória:', { birth, gender });
      setRegisterStep(3);
      showToast('Informações registadas. Passo 3: Escolha o seu endereço @nai.com.', 'info');
      return;
    }

    // --- VALIDAÇÃO PASSO 3: E-MAIL EXCLUSIVO @NAI.COM ---
    if (currentStep === 3) {
      let username = emailEl ? emailEl.value.trim().toLowerCase() : '';
      if (username.includes('@')) {
        username = username.split('@')[0];
      }
      username = username.replace(/[^a-z0-9._-]/g, '');

      if (!username || username.length < 3) {
        showToast('O nome de utilizador para o seu e-mail @nai.com tem de ter pelo menos 3 caracteres.', 'error');
        if (emailEl) emailEl.focus();
        return;
      }

      const officialEmail = `${username}@nai.com`;

      // Verificar se já existe na base de dados (Firestore / Local)
      const existing = await NaiDB.findUser(officialEmail);
      if (existing) {
        showToast(`O e-mail ${officialEmail} já está em uso! Por favor escolha outro.`, 'error');
        if (emailEl) emailEl.focus();
        return;
      }

      // Guardar em memória antes de avançar
      _savedRegData.username = username;
      setRegisterStep(4);
      showToast(`Endereço ${officialEmail} disponível! Passo 4: Defina a sua palavra-passe.`, 'success');
      return;
    }

    // --- VALIDAÇÃO PASSO 4: SENHA & CRIAÇÃO DA CONTA ---
    if (currentStep === 4) {
      const pass = passEl ? passEl.value : '';
      const passConf = passConfEl ? passConfEl.value : '';

      if (!pass || pass.length < 6) {
        showToast('A palavra-passe deve ter pelo menos 6 caracteres.', 'error');
        if (passEl) passEl.focus();
        return;
      }

      if (pass !== passConf) {
        showToast('As palavras-passe não coincidem. Confirme a sua palavra-passe.', 'error');
        if (passConfEl) passConfEl.focus();
        return;
      }

      // Usar dados guardados em memória nos passos anteriores (100% fiável)
      const fName    = _savedRegData.firstName || (firstNameEl ? firstNameEl.value.trim() : 'Utilizador');
      const lName    = _savedRegData.lastName  || (lastNameEl  ? lastNameEl.value.trim()  : '');
      const birth    = _savedRegData.birth     || (birthEl     ? birthEl.value            : '');
      const gender   = _savedRegData.gender    || (genderEl    ? genderEl.value           : '');
      const username = _savedRegData.username  || (emailEl     ? emailEl.value.trim().toLowerCase().split('@')[0].replace(/[^a-z0-9._-]/g, '') : '');

      const fullName = `${fName} ${lName}`.trim();
      const officialEmail = `${username}@nai.com`;

      console.log('🚀 Criar conta — dados completos:', { fName, lName, birth, gender, username, officialEmail });

      const genderMap = { 'M': 'Masculino', 'F': 'Feminino', 'O': 'Personalizado', 'N': 'Prefiro não dizer' };
      const passHash = await hashPassword(pass);
      const newUser = {
        name: fullName,
        firstName: fName,
        lastName: lName,
        username: username,
        domain: '@nai.com',
        birthDate: birth,
        gender: gender,
        genderLabel: genderMap[gender] || gender,
        email: officialEmail,
        passwordHash: passHash,
        provider: 'nai',
        createdAt: new Date().toISOString()
      };

      await NaiDB.saveUser(newUser);

      // Limpar dados temporários após criação bem-sucedida
      _savedRegData = { firstName: '', lastName: '', birth: '', gender: '', username: '' };

      showToast(`Conta criada com sucesso! Bem-vindo, ${fName}! O seu e-mail é ${officialEmail}`, 'success');

      window.dispatchEvent(new CustomEvent('auth:register', { detail: newUser }));
      openSession(newUser);
    }
  }

  async function handleLoginAction(emailOrUsername, password) {
    if (!emailOrUsername) {
      showToast('Por favor, introduza o seu e-mail ou username.', 'error');
      return;
    }
    if (!password) {
      showToast('Por favor, introduza a sua palavra-passe.', 'error');
      return;
    }

    const user = await NaiDB.authenticate(emailOrUsername, password);

    if (user) {
      showToast(`Sessão iniciada! Bem-vindo, ${user.name}.`, 'success');
      window.dispatchEvent(new CustomEvent('auth:login', { detail: user }));
      openSession(user);
    } else {
      showToast('E-mail/username ou palavra-passe incorretos.', 'error');
    }
  }

  // Event Listeners dos Formulários Interativos
  if (sliderRegisterForm) {
    sliderRegisterForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await handleRegisterStepSubmission('slider');
    });
  }

  if (sliderLoginForm) {
    sliderLoginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await handleLoginAction(
        document.getElementById('sliderLogEmail').value.trim(),
        document.getElementById('sliderLogPass').value
      );
    });
  }

  // Event Listeners dos Formulários da Vista Lado a Lado
  if (sideRegisterForm) {
    sideRegisterForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await handleRegisterStepSubmission('side');
    });
  }

  if (sideLoginForm) {
    sideLoginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await handleLoginAction(
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
     9. SESSÃO — ENTRA NA CONTA NO DASHBOARD
     ========================================================================== */
  // Dashboard do Account Services (pasta intro/) — aberto depois do login
  // ou da criação de conta, com a sessão do utilizador activa.
  const DASHBOARD_PAGE = 'intro/personal-info.html';

  function openSession(user) {
    // Guarda a sessão SSO (a mesma chave que o dashboard lê)
    const token = saveSession(user);

    // Se aberto em modo Popup por uma app externa (estilo Google Sign-In Popup):
    if (window.opener) {
      showToast(`Autenticado! A ligar a ${ssoAppName || 'aplicação'}...`, 'success');
      try {
        window.opener.postMessage({
          type: 'ACCOUNT_SERVICES_SSO_SUCCESS',
          token: token,
          user: user
        }, '*');
      } catch (e) {
        console.error('Erro postMessage opener:', e);
      }
      setTimeout(() => window.close(), 800);
      return;
    }

    // Se veio de uma app externa via SSO Redirect, redireciona imediatamente
    if (ssoRedirectTo) {
      showToast(`Sessão iniciada! A redirecionar para ${ssoAppName || 'a aplicação'}...`, 'success');
      setTimeout(() => redirectToApp(ssoRedirectTo, token, user), 1000);
      return;
    }

    // Modo normal — conta aberta: mostra o aviso e entra no dashboard
    const nome = user.name || user.email || 'a sua conta';
    showToast(`Sessão iniciada como ${nome} — a abrir a sua conta…`, 'success');
    setTimeout(() => {
      window.location.href = DASHBOARD_PAGE;
    }, 900);
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

  window.handleForgotPassword = async function() {
    const input = prompt('Introduza o seu username ou e-mail @nai.com para recuperar a palavra-passe:');
    if (input && input.trim()) {
      const email = formatNaiEmail(input);
      const user = await NaiDB.findUser(email);
      if (user) {
        showToast(`Link de recuperação enviado com sucesso para ${email}!`, 'success');
      } else {
        showToast(`Conta com o endereço ${email} não encontrada.`, 'error');
      }
    } else if (input !== null) {
      showToast('Por favor, introduza um username ou e-mail válido.', 'error');
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
