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

/** Gera um token SSO auto-contido (base64 JSON). Suporta scopes de perfil e bancários. */
function generateSSOToken(user, scopes = ['profile', 'email']) {
  const cards = Array.isArray(user.paymentCards) ? user.paymentCards : (user.paymentCard ? [user.paymentCard] : []);
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
    scopes: Array.isArray(scopes) ? scopes : ['profile', 'email'],
    paymentCards: cards,
    paymentCard: cards[0] || null,
    banking: user.banking || (cards.length > 0 ? { hasBanking: true, balance: 0, currency: 'EUR', bankName: cards[0].brand } : null),
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

/**
 * Validação Bancária Oficial - Algoritmo de Luhn (ISO/IEC 7812)
 * Garante que o número de cartão existe matematicamente e não é falso.
 */
function validateLuhn(digits) {
  if (!digits || digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let shouldDouble = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits.charAt(i), 10);
    if (isNaN(digit)) return false;
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return (sum % 10) === 0;
}

/**
 * Deteta o emissor bancário real do cartão (IIN / BIN).
 * Rejeita cartões fictícios ou prefixos não autorizados.
 */
function detectRealBrand(cleanNumber) {
  if (/^4[0-9]{12}(?:[0-9]{3})?$/.test(cleanNumber)) return 'Visa';
  if (/^(?:5[1-5][0-9]{2}|222[1-9]|22[3-9][0-9]|2[3-6][0-9]{2}|27[01][0-9]|2720)[0-9]{12}$/.test(cleanNumber)) return 'Mastercard';
  if (/^3[47][0-9]{13}$/.test(cleanNumber)) return 'American Express';
  if (/^6(?:011|5[0-9]{2}|4[4-9][0-9])[0-9]{12}$/.test(cleanNumber)) return 'Discover';
  if (/^(5018|5020|5038|5893|6304|6759|6761|6762|6763)[0-9]{8,15}$/.test(cleanNumber)) return 'Maestro';
  if (/^(606282|3841)[0-9]{10,13}$/.test(cleanNumber)) return 'Hipercard';
  if (/^35(?:2[89]|[3-8][0-9])[0-9]{12}$/.test(cleanNumber)) return 'JCB';
  // Prefixo durante digitação
  if (/^4/.test(cleanNumber)) return 'Visa';
  if (/^(5[1-5]|2[2-7])/.test(cleanNumber)) return 'Mastercard';
  if (/^3[47]/.test(cleanNumber)) return 'American Express';
  if (/^6/.test(cleanNumber)) return 'Discover';
  return null;
}

/** Guarda a sessão activa no localStorage desta origem. */
function saveSession(user, scopes) {
  const token = generateSSOToken(user, scopes);
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
  if (user.banking && user.banking.hasBanking) {
    try {
      url.searchParams.set('sso_bank_name', user.banking.bankName || '');
      url.searchParams.set('sso_iban', user.banking.iban || '');
      url.searchParams.set('sso_balance', String(user.banking.balance || 0));
    } catch (e) {}
  }
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
  const rawScopes = ssoParams.get('scopes') || ssoParams.get('scope') || 'profile,email';
  const requestedScopes = rawScopes.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const requiresBanking = requestedScopes.some(s => s === 'banking' || s === 'financial' || s === 'financial_banking');

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



    // Mostra/oculta linha de permissão bancária de acordo com o pedido da app
    const ssoPermBankingRow = document.getElementById('ssoPermBankingRow');
    if (ssoPermBankingRow) {
      ssoPermBankingRow.style.display = requiresBanking ? 'flex' : 'none';
    }

    const ssoRequiredBankingPanel = document.getElementById('ssoRequiredBankingPanel');
    const ssoDefaultActionButtons = document.getElementById('ssoDefaultActionButtons');
    const ssoBankingActionButtons = document.getElementById('ssoBankingActionButtons');
    const ssoSaveBankingAndAuthBtn = document.getElementById('ssoSaveBankingAndAuthBtn');
    const ssoCancelBankingBtn = document.getElementById('ssoCancelBankingBtn');
    const ssoBankingAppName = document.getElementById('ssoBankingAppName');
    if (ssoBankingAppName) ssoBankingAppName.textContent = appDisplayName;

    // Função para registar a app nas Apps Associadas da conta do utilizador
    async function registerAuthorizedApp(userObj, scopes) {
      if (!userObj.authorizedApps) userObj.authorizedApps = [];
      const clientId = ssoParams.get('client_id') || ssoAppName || 'app_' + Date.now();
      const existingIdx = userObj.authorizedApps.findIndex(a => a.clientId === clientId || a.appName === appDisplayName);
      const appEntry = {
        clientId: clientId,
        appName: appDisplayName,
        appLogo: ssoAppLogo || null,
        authorizedAt: new Date().toISOString(),
        scopes: scopes,
        permissions: {
          readProfile: true,
          readEmail: true,
          readBanking: scopes.some(s => s === 'banking' || s === 'financial' || s === 'financial_banking'),
          readTransactions: scopes.some(s => s === 'banking' || s === 'financial' || s === 'financial_banking')
        }
      };
      if (existingIdx >= 0) {
        userObj.authorizedApps[existingIdx] = appEntry;
      } else {
        userObj.authorizedApps.push(appEntry);
      }
      await NaiDB.saveUser(userObj);
      saveSession(userObj, scopes);
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
    } else {
      if (ssoActiveAccount) ssoActiveAccount.style.display = 'none';
      if (ssoSwitchAccountWrapper) ssoSwitchAccountWrapper.style.display = 'none';
      if (ssoAllowBtnText) ssoAllowBtnText.textContent = 'Permitir acesso';
    }

    // ─── SSO Banking Panel: wizard 4 etapas compactas (Cartão → Banco → Morada → Fiscal) ───
    const ssoCardNumEl   = document.getElementById('ssoReqCardNum');
    const ssoCardExpEl   = document.getElementById('ssoReqCardExp');
    const ssoCardCvcEl   = document.getElementById('ssoReqCardCvc');
    const ssoCardHintEl  = document.getElementById('ssoReqCardBrandHint');
    const ssoBankStep1El = document.getElementById('ssoBankingStep1');
    const ssoBankStep2El = document.getElementById('ssoBankingStep2');
    const ssoBankStep3El = document.getElementById('ssoBankingStep3');
    const ssoBankStep4El = document.getElementById('ssoBankingStep4');
    const ssoBankTitleEl = document.getElementById('ssoBankingPanelTitle');
    const ssoBankBarEl   = document.getElementById('ssoBankBar');
    const ssoBankBar2El  = document.getElementById('ssoBankBar2');
    const ssoBankBar3El  = document.getElementById('ssoBankBar3');
    const ssoBankDot1El  = document.getElementById('ssoBankDot1');
    const ssoBankDot2El  = document.getElementById('ssoBankDot2');
    const ssoBankDot3El  = document.getElementById('ssoBankDot3');
    const ssoBankDot4El  = document.getElementById('ssoBankDot4');

    function setSSOBankStep(step) {
      if (ssoBankStep1El) ssoBankStep1El.style.display = step === 1 ? 'block' : 'none';
      if (ssoBankStep2El) ssoBankStep2El.style.display = step === 2 ? 'block' : 'none';
      if (ssoBankStep3El) ssoBankStep3El.style.display = step === 3 ? 'block' : 'none';
      if (ssoBankStep4El) ssoBankStep4El.style.display = step === 4 ? 'block' : 'none';

      const titles = {
        1: 'Dados do Cartão (1/4)',
        2: 'Conta Bancária (2/4)',
        3: 'Morada de Faturação (3/4)',
        4: 'Dados Fiscais & Finalizar (4/4)'
      };
      if (ssoBankTitleEl) ssoBankTitleEl.textContent = titles[step] || 'Dados Bancários';

      if (ssoBankDot1El) { ssoBankDot1El.style.background = '#0080ff'; ssoBankDot1El.style.color = '#fff'; }
      if (ssoBankDot2El) { ssoBankDot2El.style.background = step >= 2 ? '#0080ff' : 'rgba(0,128,255,0.15)'; ssoBankDot2El.style.color = step >= 2 ? '#fff' : '#0080ff'; }
      if (ssoBankDot3El) { ssoBankDot3El.style.background = step >= 3 ? '#0080ff' : 'rgba(0,128,255,0.15)'; ssoBankDot3El.style.color = step >= 3 ? '#fff' : '#0080ff'; }
      if (ssoBankDot4El) { ssoBankDot4El.style.background = step >= 4 ? '#0080ff' : 'rgba(0,128,255,0.15)'; ssoBankDot4El.style.color = step >= 4 ? '#fff' : '#0080ff'; }

      if (ssoBankBarEl)  ssoBankBarEl.style.width  = step >= 2 ? '100%' : '0%';
      if (ssoBankBar2El) ssoBankBar2El.style.width = step >= 3 ? '100%' : '0%';
      if (ssoBankBar3El) ssoBankBar3El.style.width = step >= 4 ? '100%' : '0%';
    }
    window.setSSOBankStep = setSSOBankStep;

    // Clicar em Permitir / Continuar
    if (ssoAllowBtn) {
      ssoAllowBtn.addEventListener('click', async () => {
        const curSession = getSession();
        if (curSession) {
          const freshUser = (await NaiDB.findUser(curSession.email)) || curSession;

          // Se a app exige dados bancários e o utilizador ainda não os tem registados:
          const hasFinancialSetup = Boolean((freshUser.banking && freshUser.banking.hasBanking) || (freshUser.paymentCards && freshUser.paymentCards.length > 0) || (freshUser.paymentCard && freshUser.paymentCard.number));
          if (requiresBanking && !hasFinancialSetup) {
            const ssoConsentInitialView = document.getElementById('ssoConsentInitialView');
            if (ssoConsentInitialView) ssoConsentInitialView.style.display = 'none';
            if (ssoRequiredBankingPanel) ssoRequiredBankingPanel.style.display = 'block';
            setSSOBankStep(1);
            showToast(`A aplicação ${appDisplayName} requer os seus dados bancários para o login.`, 'info');
            return;
          }

          // Concede acesso e associa a app à conta
          await registerAuthorizedApp(freshUser, requestedScopes);
          showToast(`Acesso concedido a ${appDisplayName}! A ligar...`, 'success');
          const token = generateSSOToken(freshUser, requestedScopes);
          setTimeout(() => sendAuthToExternalApp(token, freshUser), 700);
        } else {
          // Sem sessão ativa: abre tela de login/criar conta normal
          ssoAuthScreen.style.display = 'none';
          if (interactiveDisplay) interactiveDisplay.style.display = 'flex';
          showToast(`Acesso autorizado! Faça login ou crie conta para aceder a ${appDisplayName}`, 'info');
        }
      });
    }

      // Formatação ao vivo do número do cartão + hint de emissor
      if (ssoCardNumEl) {
        ssoCardNumEl.addEventListener('input', () => {
          const raw = ssoCardNumEl.value.replace(/\D/g, '').substring(0, 16);
          const parts = [];
          for (let i = 0; i < raw.length; i += 4) parts.push(raw.substring(i, i + 4));
          ssoCardNumEl.value = parts.join(' ');
          const issuer = detectRealBrand(raw);
          if (ssoCardHintEl) {
            if (issuer) {
              ssoCardHintEl.textContent = `✓ Emissor: ${issuer}`;
              ssoCardHintEl.style.color = '#10b981';
            } else if (raw.length >= 4) {
              ssoCardHintEl.textContent = '✗ Prefixo de cartão não reconhecido';
              ssoCardHintEl.style.color = '#ef4444';
            } else {
              ssoCardHintEl.textContent = '';
            }
          }
        });
      }
      if (ssoCardExpEl) {
        ssoCardExpEl.addEventListener('input', () => {
          const raw = ssoCardExpEl.value.replace(/\D/g, '').substring(0, 4);
          ssoCardExpEl.value = raw.length >= 2 ? raw.substring(0, 2) + '/' + raw.substring(2) : raw;
        });
      }

      // Etapa 1 -> Etapa 2 (Valida cartão de pagamento)
      const ssoBankNext1Btn = document.getElementById('ssoBankingNext1Btn');
      if (ssoBankNext1Btn) {
        ssoBankNext1Btn.addEventListener('click', () => {
          const cardNumRaw = (ssoCardNumEl?.value || '').replace(/\s+/g, '');
          const cardExp    = (ssoCardExpEl?.value || '').trim();
          const cardCvc    = (ssoCardCvcEl?.value || '').trim();
          const cardHolder = (document.getElementById('ssoReqCardHolder')?.value || '').trim();

          const issuer = detectRealBrand(cardNumRaw);
          if (!issuer) { showToast('Cartão não reconhecido. Insira um Visa, Mastercard, Amex, etc.', 'error'); ssoCardNumEl?.focus(); return; }
          if (!validateLuhn(cardNumRaw)) { showToast('Número de cartão inválido (falha na verificação bancária).', 'error'); ssoCardNumEl?.focus(); return; }

          const expParts = cardExp.split('/');
          const mm = parseInt(expParts[0], 10), yy = parseInt(expParts[1], 10);
          const nowY = new Date().getFullYear() % 100, nowM = new Date().getMonth() + 1;
          if (expParts.length !== 2 || isNaN(mm) || isNaN(yy) || mm < 1 || mm > 12 || yy < nowY || (yy === nowY && mm < nowM)) {
            showToast('Data de validade inválida ou expirada.', 'error'); ssoCardExpEl?.focus(); return;
          }
          if (cardCvc.length < 3) { showToast('CVC inválido (mínimo 3 dígitos).', 'error'); ssoCardCvcEl?.focus(); return; }
          if (!cardHolder || cardHolder.length < 3) { showToast('Nome do titular necessário.', 'error'); return; }

          setSSOBankStep(2);
        });
      }

      // Etapa 2 Navegação
      const ssoBankBack2Btn = document.getElementById('ssoBankingBack2Btn');
      if (ssoBankBack2Btn) ssoBankBack2Btn.addEventListener('click', () => setSSOBankStep(1));

      const ssoBankNext2Btn = document.getElementById('ssoBankingNext2Btn');
      if (ssoBankNext2Btn) ssoBankNext2Btn.addEventListener('click', () => setSSOBankStep(3));

      const ssoBankSkip2Btn = document.getElementById('ssoBankingSkip2Btn');
      if (ssoBankSkip2Btn) ssoBankSkip2Btn.addEventListener('click', () => setSSOBankStep(3));

      // Etapa 3 Navegação (Valida Morada)
      const ssoBankBack3Btn = document.getElementById('ssoBankingBack3Btn');
      if (ssoBankBack3Btn) ssoBankBack3Btn.addEventListener('click', () => setSSOBankStep(2));

      const ssoBankNext3Btn = document.getElementById('ssoBankingNext3Btn');
      if (ssoBankNext3Btn) {
        ssoBankNext3Btn.addEventListener('click', () => {
          const address    = (document.getElementById('ssoReqAddress')?.value   || '').trim();
          const postalCode = (document.getElementById('ssoReqPostalCode')?.value || '').trim();
          const city       = (document.getElementById('ssoReqCity')?.value       || '').trim();

          if (!address) { showToast('Endereço obrigatório.', 'error'); document.getElementById('ssoReqAddress')?.focus(); return; }
          if (!postalCode) { showToast('Código postal obrigatório.', 'error'); document.getElementById('ssoReqPostalCode')?.focus(); return; }
          if (!city) { showToast('Cidade obrigatória.', 'error'); document.getElementById('ssoReqCity')?.focus(); return; }

          setSSOBankStep(4);
        });
      }

      // Etapa 4 Navegação
      const ssoBankBack4Btn = document.getElementById('ssoBankingBack4Btn');
      if (ssoBankBack4Btn) ssoBankBack4Btn.addEventListener('click', () => setSSOBankStep(3));

      // Botão "GUARDAR & ENTRAR" — Validação final e Gravação
      if (ssoSaveBankingAndAuthBtn) {
        ssoSaveBankingAndAuthBtn.addEventListener('click', async () => {
          const cardNumRaw = (ssoCardNumEl?.value || '').replace(/\s+/g, '');
          const cardExp    = (ssoCardExpEl?.value || '').trim();
          const cardCvc    = (ssoCardCvcEl?.value || '').trim();
          const cardHolder = (document.getElementById('ssoReqCardHolder')?.value || '').trim();
          const issuer     = detectRealBrand(cardNumRaw);

          if (!issuer || !validateLuhn(cardNumRaw)) {
            showToast('Dados do cartão inválidos. Volte à etapa 1.', 'error');
            setSSOBankStep(1);
            return;
          }

          // Dados complementares da Etapa 1 (tipo, banco, iban, saldo)
          const cardType   = (document.getElementById('ssoReqCardType')?.value  || 'Débito').trim();
          const bankName   = (document.getElementById('ssoReqBankName')?.value  || '').trim();
          const rawBal     = parseFloat(document.getElementById('ssoReqBalance')?.value) || 0;
          const iban       = (document.getElementById('ssoReqIban')?.value      || '').trim();

          // Dados da morada e fiscais (Etapa 2)
          const country    = (document.getElementById('ssoReqCountry')?.value   || 'Portugal').trim();
          const address    = (document.getElementById('ssoReqAddress')?.value   || '').trim();
          const apartment  = (document.getElementById('ssoReqApartment')?.value || '').trim();
          const postalCode = (document.getElementById('ssoReqPostalCode')?.value || '').trim();
          const city       = (document.getElementById('ssoReqCity')?.value       || '').trim();
          const nif        = (document.getElementById('ssoReqNif')?.value        || '').trim();
          const phone      = (document.getElementById('ssoReqPhone')?.value      || '').trim();

          if (!address) { showToast('Endereço obrigatório.', 'error'); document.getElementById('ssoReqAddress')?.focus(); return; }
          if (!postalCode) { showToast('Código postal obrigatório.', 'error'); document.getElementById('ssoReqPostalCode')?.focus(); return; }
          if (!city) { showToast('Cidade obrigatória.', 'error'); document.getElementById('ssoReqCity')?.focus(); return; }

          const last4 = cardNumRaw.slice(-4);
          const newCard = {
            id:              'card_' + Date.now(),
            brand:           issuer,
            cardType:        cardType,
            cardNumberMasked: `•••• •••• •••• ${last4}`,
            last4,
            expiry:          cardExp,
            holder:          cardHolder.toUpperCase(),
            bankName:        bankName || issuer,
            iban:            iban || null,
            balance:         rawBal,
            billingAddress: {
              country,
              address,
              apartment,
              postalCode,
              city,
              nif: nif || null,
              phone: phone || null,
              formatted: [address, apartment, postalCode, city, country].filter(Boolean).join(', ')
            },
            isDefault: true,
            addedAt: new Date().toISOString()
          };

          const curSession = getSession() || existingSession;
          if (!curSession || !curSession.email) {
            showToast('Sessão não encontrada. Por favor inicie sessão.', 'error');
            return;
          }
          const freshUser = (await NaiDB.findUser(curSession.email)) || curSession;
          if (!Array.isArray(freshUser.paymentCards)) freshUser.paymentCards = [];
          freshUser.paymentCards.push(newCard);

          freshUser.banking = freshUser.banking || {};
          freshUser.banking.hasBanking = true;
          freshUser.banking.bankName   = bankName || issuer;
          freshUser.banking.iban       = iban || freshUser.banking.iban || null;
          freshUser.banking.balance    = rawBal > 0 ? rawBal : (freshUser.banking.balance || 0);
          freshUser.banking.currency   = 'EUR';
          freshUser.banking.nif        = nif || freshUser.banking.nif || null;
          freshUser.banking.phone      = phone || freshUser.banking.phone || null;
          freshUser.banking.linkedAt   = new Date().toISOString();

          await NaiDB.saveUser(freshUser);
          await registerAuthorizedApp(freshUser, requestedScopes);

          showToast('Dados bancários e cartão guardados com sucesso na sua conta!', 'success');
          const token = generateSSOToken(freshUser, requestedScopes);
          setTimeout(() => sendAuthToExternalApp(token, freshUser), 700);
        });
      }

      function closeBankingAndReturnToConsent() {
        if (ssoRequiredBankingPanel) ssoRequiredBankingPanel.style.display = 'none';
        const ssoConsentInitialView = document.getElementById('ssoConsentInitialView');
        if (ssoConsentInitialView) ssoConsentInitialView.style.display = 'block';
        if (ssoDefaultActionButtons) ssoDefaultActionButtons.style.display = 'flex';
      }

      if (ssoCancelBankingBtn) {
        ssoCancelBankingBtn.addEventListener('click', closeBankingAndReturnToConsent);
      }
      const ssoCancelBankingBtn1 = document.getElementById('ssoCancelBankingBtn1');
      if (ssoCancelBankingBtn1) {
        ssoCancelBankingBtn1.addEventListener('click', closeBankingAndReturnToConsent);
      }

      // Clicar em "Iniciar com outra conta": fecha o consentimento e abre a tela de login normal
      if (ssoSwitchAccountBtn) {
        ssoSwitchAccountBtn.addEventListener('click', () => {
          ssoAuthScreen.style.display = 'none';
          if (interactiveDisplay) interactiveDisplay.style.display = 'flex';
          showToast(`Inicie sessão para autorizar ${appDisplayName}`, 'info');
        });
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
  const totalSteps = 5;
  // Dados guardados em memória por passo (evita problema de inputs ocultos)
  let _savedRegData = {
    firstName: '',
    lastName: '',
    birth: '',
    gender: '',
    username: '',
    passHash: '',
    bankName: '',
    iban: '',
    balance: 0,
    hasBanking: false
  };

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
     4. STEPPER CONTROLLER — 5 PASSOS DE REGISTO (INCLUINDO CARTEIRA BANCÁRIA)
     ========================================================================== */
  function setRegisterStep(step) {
    if (step < 1 || step > totalSteps) return;
    currentStep = step;
    // Limpar dados guardados se voltar ao início
    if (step === 1) {
      _savedRegData = {
        firstName: '', lastName: '', birth: '', gender: '', username: '', passHash: '',
        bankName: '', iban: '', balance: 0, hasBanking: false
      };
    }

    // Atualiza badges em todas as barras de passos
    stepperBars.forEach(bar => {
      const steps = bar.querySelectorAll('.step-col');
      steps.forEach(s => {
        const num = parseInt(s.getAttribute('data-step'), 10);
        s.classList.toggle('active', num === currentStep);
      });
    });

    // Atualiza panes no formulário deslizante (1 a 5)
    for (let i = 1; i <= 5; i++) {
      const pane = document.getElementById(`sliderPaneStep${i}`);
      if (pane) pane.style.display = (i === currentStep) ? 'flex' : 'none';
    }

    // Atualiza panes no formulário lado a lado (1 a 5)
    for (let i = 1; i <= 5; i++) {
      const pane = document.getElementById(`sidePaneStep${i}`);
      if (pane) pane.style.display = (i === currentStep) ? 'flex' : 'none';
    }

    // Botões Anterior padrão (para passos 1 a 4)
    const btnSliderPrev = document.getElementById('btnSliderRegPrev');
    const btnSidePrev = document.getElementById('btnSideRegPrev');
    if (btnSliderPrev) btnSliderPrev.style.display = currentStep > 1 ? 'inline-flex' : 'none';
    if (btnSidePrev) btnSidePrev.style.display = currentStep > 1 ? 'inline-flex' : 'none';

    // Texto do Botão Submeter padrão
    if (btnSliderRegSubmit) {
      const label = btnSliderRegSubmit.querySelector('span');
      if (label) label.textContent = currentStep === totalSteps ? 'CRIAR CONTA' : 'SEGUINTE';
    }
    const btnSideRegSubmit = document.getElementById('btnSideRegSubmit');
    if (btnSideRegSubmit) {
      const label = btnSideRegSubmit.querySelector('span');
      if (label) label.textContent = currentStep === totalSteps ? 'CRIAR CONTA' : 'SEGUINTE';
    }

    // Controlo de visibilidade do Passo 5 (Carteira em 4 sub-etapas independentes)
    // Oculta a barra inferior para que nada seja cortado ou duplicado
    const sliderSubmitContainer = document.querySelector('#sliderRegisterPanel .btn-submit-container');
    const sideSubmitContainer = document.querySelector('.card-register-flow .btn-submit-wrapper') || document.querySelector('.card-register-flow .btn-submit-container');
    const sliderNavRow = document.querySelector('#sliderRegisterPanel .stepper-nav-row');
    const sideNavRow = document.querySelector('.card-register-flow .stepper-nav-row');

    if (currentStep === 5) {
      if (sliderSubmitContainer) sliderSubmitContainer.style.display = 'none';
      if (sideSubmitContainer) sideSubmitContainer.style.display = 'none';
      if (sliderNavRow) sliderNavRow.style.display = 'none';
      if (sideNavRow) sideNavRow.style.display = 'none';
      setRegisterBankSubStep('slider', 1);
      setRegisterBankSubStep('side', 1);
    } else {
      if (sliderSubmitContainer) sliderSubmitContainer.style.display = 'flex';
      if (sideSubmitContainer) sideSubmitContainer.style.display = 'flex';
      if (sliderNavRow) sliderNavRow.style.display = 'flex';
      if (sideNavRow) sideNavRow.style.display = 'flex';
    }
  }

  // ─── Sub-etapas compactas do Passo 5 da Criação de Conta (1 a 4) ───
  const currentRegBankSubStep = { slider: 1, side: 1 };

  function setRegisterBankSubStep(prefix, subStep) {
    currentRegBankSubStep[prefix] = subStep;

    for (let s = 1; s <= 4; s++) {
      const stepEl = document.getElementById(`${prefix}BankStep${s}`);
      if (stepEl) stepEl.style.display = (s === subStep) ? 'block' : 'none';

      const dotEl = document.getElementById(`${prefix}BankDot${s}`);
      if (dotEl) {
        dotEl.style.background = (s <= subStep) ? '#0080ff' : 'rgba(0,128,255,0.15)';
        dotEl.style.color = (s <= subStep) ? '#fff' : '#0080ff';
      }
    }

    const bar1 = document.getElementById(`${prefix}BankBar1`);
    const bar2 = document.getElementById(`${prefix}BankBar2`);
    const bar3 = document.getElementById(`${prefix}BankBar3`);
    if (bar1) bar1.style.width = subStep >= 2 ? '100%' : '0%';
    if (bar2) bar2.style.width = subStep >= 3 ? '100%' : '0%';
    if (bar3) bar3.style.width = subStep >= 4 ? '100%' : '0%';

    const titleEl = document.getElementById(`${prefix}BankTitle`);
    const titles = {
      1: 'Dados do Cartão (1/4)',
      2: 'Conta Bancária (2/4)',
      3: 'Morada de Faturação (3/4)',
      4: 'Dados Fiscais & Finalizar (4/4)'
    };
    if (titleEl) titleEl.textContent = titles[subStep] || 'Carteira';
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
     - Domínio próprio de e-mail: @nai.com (como Nai, Outlook e Sapo)
     - Armazenamento Seguro: Hashes SHA-256 com Salt (Web Crypto API)
     - Nuvem Gratuita da Nai: Cloud Firestore (Firebase Spark Plan) + Fallback Local
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

  // Inicialização segura do Nai Firebase Cloud Firestore & Analytics
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
      console.log('⚡ Base de Dados Nai Cloud Firestore conectada com sucesso! Projeto:', window.FIREBASE_CONFIG.projectId);
    } catch (err) {
      console.warn('Nai Firebase: inicialização em modo de espera local.', err);
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

      // 2. Sincronizar com a nuvem Nai Cloud Firestore se configurada
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
            paymentCards: Array.isArray(userToSave.paymentCards) ? userToSave.paymentCards : (userToSave.paymentCard ? [userToSave.paymentCard] : []),
            paymentCard: userToSave.paymentCard || (Array.isArray(userToSave.paymentCards) && userToSave.paymentCards[0] ? userToSave.paymentCards[0] : null),
            banking: userToSave.banking || { hasBanking: false, balance: 0, currency: 'EUR' },
            authorizedApps: userToSave.authorizedApps || [],
            createdAt: userToSave.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };

          await docRef.set(firestorePayload, { merge: true });
          console.log('✅ Utilizador completo sincronizado na Nuvem Nai Firestore:', normalizedEmail, firestorePayload);
        } catch (err) {
          console.error('❌ Erro ao sincronizar com Nai Firestore:', err.code || '', err.message || err);
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

      // 1. Consulta no Nai Cloud Firestore se ativo
      if (firestoreDb) {
        try {
          const docId = normalized.replace(/[/.]/g, '_');
          const docRef = firestoreDb.collection('nai_accounts').doc(docId);
          const doc = await docRef.get();
          if (doc.exists) {
            return doc.data();
          }
        } catch (err) {
          console.warn('Consulta ao Nai Firestore falhou, a recorrer a dados locais:', err);
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

    // --- VALIDAÇÃO PASSO 4: SENHA ---
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

      // Guardar hash da palavra-passe e avançar para o Passo 5 (Carteira)
      _savedRegData.passHash = await hashPassword(pass);
      setRegisterStep(5);
      showToast('Passo 5: Carteira e Dados Bancários (Opcional).', 'info');
      return;
    }


    // --- PASSO 5: CARTÃO / CARTEIRA & CRIAÇÃO DA CONTA (4 sub-etapas) ---
    if (currentStep === 5) {
      const sub = currentRegBankSubStep[mode] || 1;
      if (sub === 1) {
        validateAndAdvanceRegSubStep1(mode);
      } else if (sub === 2) {
        setRegisterBankSubStep(mode, 3);
      } else if (sub === 3) {
        validateAndAdvanceRegSubStep3(mode);
      } else if (sub === 4) {
        await submitRegistrationBanking(mode);
      }
      return;
    }
  }

  // Validação da Sub-etapa 5.1 (Cartão de Pagamento)
  function validateAndAdvanceRegSubStep1(mode) {
    const prefix = mode === 'slider' ? 'slider' : 'side';
    const cardNumEl    = document.getElementById(`${prefix}RegCardNum`);
    const cardExpEl    = document.getElementById(`${prefix}RegCardExp`);
    const cardCvcEl    = document.getElementById(`${prefix}RegCardCvc`);
    const cardHolderEl = document.getElementById(`${prefix}RegCardHolder`);

    const rawNum    = cardNumEl    ? cardNumEl.value.replace(/\s+/g, '') : '';
    const expVal    = cardExpEl    ? cardExpEl.value.trim()              : '';
    const cvcVal    = cardCvcEl    ? cardCvcEl.value.trim()              : '';
    const holderVal = cardHolderEl ? cardHolderEl.value.trim()           : '';

    const brand = detectRealBrand(rawNum);
    if (!brand) {
      showToast('Número de cartão inválido ou emitente não reconhecido.', 'error');
      if (cardNumEl) cardNumEl.focus();
      return false;
    }
    if (!validateLuhn(rawNum)) {
      showToast('Número de cartão inválido (falha na verificação Luhn).', 'error');
      if (cardNumEl) cardNumEl.focus();
      return false;
    }

    const expMatch = expVal.match(/^(\d{2})\/(\d{2})$/);
    if (!expMatch) {
      showToast('Introduza a validade no formato MM/AA.', 'error');
      if (cardExpEl) cardExpEl.focus();
      return false;
    }
    const expMonth = parseInt(expMatch[1], 10);
    const expYear  = 2000 + parseInt(expMatch[2], 10);
    const now      = new Date();
    if (expMonth < 1 || expMonth > 12 || expYear < now.getFullYear() ||
        (expYear === now.getFullYear() && expMonth < now.getMonth() + 1)) {
      showToast('O cartão está expirado ou a data de validade é inválida.', 'error');
      if (cardExpEl) cardExpEl.focus();
      return false;
    }

    const cvcLen = brand === 'American Express' ? 4 : 3;
    if (!cvcVal || cvcVal.length < cvcLen || !/^\d+$/.test(cvcVal)) {
      showToast(`O CVC deve ter ${cvcLen} dígitos para cartões ${brand}.`, 'error');
      if (cardCvcEl) cardCvcEl.focus();
      return false;
    }

    if (!holderVal || holderVal.length < 3) {
      showToast('Introduza o nome do titular do cartão (mín. 3 caracteres).', 'error');
      if (cardHolderEl) cardHolderEl.focus();
      return false;
    }

    setRegisterBankSubStep(mode, 2);
    return true;
  }

  // Validação da Sub-etapa 5.3 (Morada de Faturação)
  function validateAndAdvanceRegSubStep3(mode) {
    const prefix = mode === 'slider' ? 'slider' : 'side';
    const addressEl    = document.getElementById(`${prefix}RegAddress`);
    const postalCodeEl = document.getElementById(`${prefix}RegPostalCode`);
    const cityEl       = document.getElementById(`${prefix}RegCity`);

    const addressVal    = addressEl    ? addressEl.value.trim()    : '';
    const postalCodeVal = postalCodeEl ? postalCodeEl.value.trim() : '';
    const cityVal       = cityEl       ? cityEl.value.trim()       : '';

    if (!addressVal) {
      showToast('Introduza o endereço de faturação do cartão.', 'error');
      if (addressEl) addressEl.focus();
      return false;
    }
    if (!postalCodeVal) {
      showToast('Introduza o código postal.', 'error');
      if (postalCodeEl) postalCodeEl.focus();
      return false;
    }
    if (!cityVal) {
      showToast('Introduza a cidade.', 'error');
      if (cityEl) cityEl.focus();
      return false;
    }

    setRegisterBankSubStep(mode, 4);
    return true;
  }

  // Gravação final dos dados da Carteira e Finalização da Conta
  async function submitRegistrationBanking(mode) {
    const prefix = mode === 'slider' ? 'slider' : 'side';
    const cardNumEl    = document.getElementById(`${prefix}RegCardNum`);
    const cardExpEl    = document.getElementById(`${prefix}RegCardExp`);
    const cardCvcEl    = document.getElementById(`${prefix}RegCardCvc`);
    const cardHolderEl = document.getElementById(`${prefix}RegCardHolder`);

    const rawNum    = cardNumEl    ? cardNumEl.value.replace(/\s+/g, '') : '';
    const expVal    = cardExpEl    ? cardExpEl.value.trim()              : '';
    const cvcVal    = cardCvcEl    ? cardCvcEl.value.trim()              : '';
    const holderVal = cardHolderEl ? cardHolderEl.value.trim()           : '';

    const brand = detectRealBrand(rawNum);
    if (!brand || !validateLuhn(rawNum)) {
      showToast('Dados do cartão inválidos. Volte à etapa 1.', 'error');
      setRegisterBankSubStep(mode, 1);
      return;
    }

    // Morada
    const countryEl    = document.getElementById(`${prefix}RegCountry`);
    const addressEl    = document.getElementById(`${prefix}RegAddress`);
    const apartmentEl  = document.getElementById(`${prefix}RegApartment`);
    const postalCodeEl = document.getElementById(`${prefix}RegPostalCode`);
    const cityEl       = document.getElementById(`${prefix}RegCity`);

    const countryVal    = countryEl    ? countryEl.value.trim()    : 'Portugal';
    const addressVal    = addressEl    ? addressEl.value.trim()    : '';
    const apartmentVal  = apartmentEl  ? apartmentEl.value.trim()  : '';
    const postalCodeVal = postalCodeEl ? postalCodeEl.value.trim() : '';
    const cityVal       = cityEl       ? cityEl.value.trim()       : '';

    if (!addressVal || !postalCodeVal || !cityVal) {
      showToast('Por favor, preencha a morada de faturação.', 'error');
      setRegisterBankSubStep(mode, 3);
      return;
    }

    // Campos complementares
    const cardTypeEl   = document.getElementById(`${prefix}RegCardType`);
    const bankNameEl   = document.getElementById(`${prefix}RegBankName`);
    const balanceEl    = document.getElementById(`${prefix}RegBalance`);
    const ibanEl       = document.getElementById(`${prefix}RegIban`);
    const nifEl        = document.getElementById(`${prefix}RegNif`);
    const phoneEl      = document.getElementById(`${prefix}RegPhone`);

    const cardTypeVal  = cardTypeEl ? cardTypeEl.value.trim() : 'Débito';
    const bankNameVal  = bankNameEl ? bankNameEl.value.trim() : '';
    const balanceVal   = balanceEl ? (parseFloat(balanceEl.value) || 0) : 0;
    const ibanVal      = ibanEl ? ibanEl.value.trim() : '';
    const nifVal       = nifEl ? nifEl.value.trim() : '';
    const phoneVal     = phoneEl ? phoneEl.value.trim() : '';

    const last4 = rawNum.slice(-4);
    _savedRegData.paymentCard = {
      id:              `card_${Date.now()}`,
      brand,
      cardType:        cardTypeVal,
      last4,
      cardNumberMasked: `•••• •••• •••• ${last4}`,
      expiry:          expVal,
      holder:          holderVal.toUpperCase(),
      bankName:        bankNameVal || brand,
      iban:            ibanVal || null,
      balance:         balanceVal,
      billingAddress: {
        country:    countryVal,
        address:    addressVal,
        apartment:  apartmentVal,
        postalCode: postalCodeVal,
        city:       cityVal,
        nif:        nifVal || null,
        phone:      phoneVal || null,
        formatted:  [addressVal, apartmentVal, postalCodeVal, cityVal, countryVal].filter(Boolean).join(', ')
      },
      isDefault: true,
      addedAt:   new Date().toISOString()
    };

    _savedRegData.banking = {
      hasBanking: true,
      bankName: bankNameVal || brand,
      iban: ibanVal || null,
      balance: balanceVal,
      currency: 'EUR',
      nif: nifVal || null,
      phone: phoneVal || null
    };

    await finalizeAccountCreation(mode);
  }

  // Função final de gravação e inicialização da conta criada
  async function finalizeAccountCreation(mode = 'slider') {
    const fName    = _savedRegData.firstName || 'Utilizador';
    const lName    = _savedRegData.lastName  || '';
    const fullName = `${fName} ${lName}`.trim();
    const officialEmail = `${_savedRegData.username}@nai.com`;

    const genderMap = { 'M': 'Masculino', 'F': 'Feminino', 'O': 'Personalizado', 'N': 'Prefiro não dizer' };

    const paymentCards = [];
    if (_savedRegData.paymentCard) {
      paymentCards.push(_savedRegData.paymentCard);
    }

    const regBank = _savedRegData.banking || {};
    const newUser = {
      name: fullName,
      firstName: fName,
      lastName: lName,
      username: _savedRegData.username,
      domain: '@nai.com',
      birthDate: _savedRegData.birth,
      gender: _savedRegData.gender,
      genderLabel: genderMap[_savedRegData.gender] || _savedRegData.gender,
      email: officialEmail,
      passwordHash: _savedRegData.passHash,
      provider: 'nai',
      paymentCards,
      banking: {
        hasBanking: paymentCards.length > 0 || Boolean(regBank.hasBanking),
        bankName: regBank.bankName || (paymentCards.length > 0 ? paymentCards[0].brand : null),
        iban: regBank.iban || null,
        balance: typeof regBank.balance === 'number' ? regBank.balance : 0,
        currency: 'EUR',
        nif: regBank.nif || null,
        phone: regBank.phone || null,
        linkedAt: (paymentCards.length > 0 || regBank.hasBanking) ? new Date().toISOString() : null
      },
      authorizedApps: [],
      createdAt: new Date().toISOString()
    };

    await NaiDB.saveUser(newUser);

    // Limpar dados temporários após criação bem-sucedida
    _savedRegData = {
      firstName: '', lastName: '', birth: '', gender: '', username: '', passHash: '',
      paymentCard: null, banking: null
    };

    showToast(`Conta criada com sucesso! Bem-vindo, ${fName}! O seu e-mail é ${officialEmail}`, 'success');

    window.dispatchEvent(new CustomEvent('auth:register', { detail: newUser }));
    openSession(newUser);
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

  /* -------------------------------------------------------------------
     Passo 5 — Formatação, validação ao vivo e navegação das 4 sub-etapas
     (Slider e Side registration forms)
  ------------------------------------------------------------------- */
  function wireCardStep5(prefix, hintId) {
    const Cap = prefix.charAt(0).toUpperCase() + prefix.slice(1);
    const cardNumEl  = document.getElementById(`${prefix}RegCardNum`);
    const cardExpEl  = document.getElementById(`${prefix}RegCardExp`);
    const hintEl     = document.getElementById(hintId);

    if (cardNumEl) {
      cardNumEl.addEventListener('input', () => {
        // Formato grupos de 4 dígitos
        const raw = cardNumEl.value.replace(/\D/g, '').substring(0, 16);
        const parts = [];
        for (let i = 0; i < raw.length; i += 4) parts.push(raw.substring(i, i + 4));
        cardNumEl.value = parts.join(' ');

        // Feedback do emissor em tempo real
        const issuer = detectRealBrand(raw);
        if (hintEl) {
          if (issuer) {
            hintEl.textContent = `✓ Emissor: ${issuer}`;
            hintEl.style.color = '#10b981';
          } else if (raw.length >= 4) {
            hintEl.textContent = '✗ Prefixo de cartão não reconhecido';
            hintEl.style.color = '#ef4444';
          } else {
            hintEl.textContent = '';
          }
        }
      });
    }

    if (cardExpEl) {
      cardExpEl.addEventListener('input', () => {
        const raw = cardExpEl.value.replace(/\D/g, '').substring(0, 4);
        cardExpEl.value = raw.length >= 2 ? raw.substring(0, 2) + '/' + raw.substring(2) : raw;
      });
    }

    // Sub-etapa 1: Voltar para Senha, Seguinte para Banco, Saltar
    const back1 = document.getElementById(`btn${Cap}BankBack1`);
    if (back1) back1.addEventListener('click', () => setRegisterStep(4));

    const next1 = document.getElementById(`btn${Cap}BankNext1`);
    if (next1) next1.addEventListener('click', () => validateAndAdvanceRegSubStep1(prefix));

    const skip1 = document.getElementById(`btn${Cap}SkipBanking`);
    if (skip1) skip1.addEventListener('click', async () => {
      _savedRegData.paymentCard = null;
      _savedRegData.banking = null;
      await finalizeAccountCreation(prefix);
    });

    // Sub-etapa 2: Voltar para Cartão, Seguinte para Morada, Saltar Banco
    const back2 = document.getElementById(`btn${Cap}BankBack2`);
    if (back2) back2.addEventListener('click', () => setRegisterBankSubStep(prefix, 1));

    const next2 = document.getElementById(`btn${Cap}BankNext2`);
    if (next2) next2.addEventListener('click', () => setRegisterBankSubStep(prefix, 3));

    const skip2 = document.getElementById(`btn${Cap}BankSkip2`);
    if (skip2) skip2.addEventListener('click', () => setRegisterBankSubStep(prefix, 3));

    // Sub-etapa 3: Voltar para Banco, Seguinte para Fiscal
    const back3 = document.getElementById(`btn${Cap}BankBack3`);
    if (back3) back3.addEventListener('click', () => setRegisterBankSubStep(prefix, 2));

    const next3 = document.getElementById(`btn${Cap}BankNext3`);
    if (next3) next3.addEventListener('click', () => validateAndAdvanceRegSubStep3(prefix));

    // Sub-etapa 4: Voltar para Morada, Criar Conta, Saltar
    const back4 = document.getElementById(`btn${Cap}BankBack4`);
    if (back4) back4.addEventListener('click', () => setRegisterBankSubStep(prefix, 3));

    const finish = document.getElementById(`btn${Cap}BankFinish`);
    if (finish) finish.addEventListener('click', async () => {
      await submitRegistrationBanking(prefix);
    });

    const skip4 = document.getElementById(`btn${Cap}SkipBanking4`);
    if (skip4) skip4.addEventListener('click', async () => {
      _savedRegData.paymentCard = null;
      _savedRegData.banking = null;
      await finalizeAccountCreation(prefix);
    });
  }

  wireCardStep5('slider', 'sliderCardBrandHint');
  wireCardStep5('side',   'sideCardBrandHint');


  /* ==========================================================================
     7. INTEGRAÇÃO LOGIN COM O GOOGLE (GOOGLE SIGN-IN)
     ========================================================================== */
  // Configure o seu Nai Client ID aqui se desejar (ex: 'xxxx.apps.googleusercontent.com')
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
        name: payload.name || 'Utilizador Nai',
        email: payload.email,
        picture: payload.picture,
        provider: 'google',
        createdAt: new Date().toISOString()
      };

      saveUser(googleUser);
      showToast(`Bem-vindo, ${googleUser.name}! Sessão iniciada com a Nai.`, 'success');

      window.dispatchEvent(new CustomEvent('auth:google', { detail: googleUser }));
      window.dispatchEvent(new CustomEvent('auth:login', { detail: googleUser }));
      openSession(googleUser);
    } catch (err) {
      console.error('Erro ao ler token da Nai:', err);
      showToast('Erro ao autenticar com a Nai.', 'error');
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
      const choice = confirm('Deseja iniciar sessão com a conta Nai de teste?\n(Para usar a API real de produção, configure o GOOGLE_CLIENT_ID no script.js)');
      if (choice) {
        const demoGoogleUser = {
          name: 'Utilizador Nai',
          email: 'demo.google@gmail.com',
          provider: 'google',
          createdAt: new Date().toISOString()
        };
        saveUser(demoGoogleUser);
        showToast('Sessão iniciada com a Conta Nai!', 'success');
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

    // Se veio de uma app externa via SSO e requer dados bancários mas o utilizador não tem dados configurados:
    const hasFinancialSetup = Boolean((user.banking && user.banking.hasBanking) || (user.paymentCards && user.paymentCards.length > 0) || (user.paymentCard && user.paymentCard.number));
    if (isSSORequest && requiresBanking && !hasFinancialSetup) {
      if (ssoAuthScreen) {
        if (interactiveDisplay) interactiveDisplay.style.display = 'none';
        if (sideBySideDisplay)  sideBySideDisplay.style.display  = 'none';
        ssoAuthScreen.style.display = 'flex';
        const ssoConsentInitialView = document.getElementById('ssoConsentInitialView');
        if (ssoConsentInitialView) ssoConsentInitialView.style.display = 'none';
        const ssoRequiredBankingPanel = document.getElementById('ssoRequiredBankingPanel');
        if (ssoRequiredBankingPanel) ssoRequiredBankingPanel.style.display = 'block';
        if (typeof window.setSSOBankStep === 'function') window.setSSOBankStep(1);
        showToast(`A aplicação ${ssoAppName || 'externa'} necessita dos seus dados bancários para o acesso.`, 'info');
        return;
      }
    }

    // Se aberto em modo Popup por uma app externa (estilo Nai Sign-In Popup):
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
