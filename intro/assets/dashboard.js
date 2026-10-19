/**
 * Account Services — Dashboard (pasta intro/)
 * ============================================================================
 * 1. Proteção: sem sessão válida não se abre o dashboard -> volta ao login.
 * 2. Conta: mostra o utilizador autenticado (foto/inicial + nome) no
 *    cabeçalho e o botão principal passa a indicar "Terminar sessão".
 * 3. Home (intro/index.html): a página guardada traz o nome, o e-mail e a foto
 *    da conta Nai com que foi aberta — passam a ser os da conta local.
 *
 * A sessão é a mesma que o auth.html grava no localStorage (chave abaixo),
 * por isso o login/criação de conta feitos no site abrem o dashboard.
 * ============================================================================
 */
(function () {
  'use strict';

  var SESSION_KEY = 'as_sso_session';   // chave gravada pelo script.js (auth.html)
  var LOGIN_PAGE = '../auth.html';      // página de login/criação de conta
  var HS_AUTO_EXPLODE_MS = 8000;        // Home: a estrela explode sozinha ao fim deste tempo
                                        // (mesmo sem o rato passar por cima dela)

  /* ------------------------------------------------------------------
     SESSÃO
  ------------------------------------------------------------------ */
  function getSession() {
    try {
      var raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      var payload = JSON.parse(decodeURIComponent(escape(atob(raw))));
      if (!payload || payload.v !== 1 || Date.now() > payload.exp) return null;
      return payload;
    } catch (e) {
      return null;
    }
  }

  function signOut() {
    try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
    window.location.href = LOGIN_PAGE;
  }

  var user = getSession();

  // Sem conta aberta não há dashboard.
  if (!user) {
    window.location.replace(LOGIN_PAGE);
    return;
  }

  /* ------------------------------------------------------------------
     UI DA CONTA
  ------------------------------------------------------------------ */
  var AVATAR_COLORS = ['#0b57d0', '#a142f4', '#12b5cb', '#e52592', '#f9ab00', '#34a853', '#d93025'];

  function firstName() {
    var name = (user.firstName || user.name || user.email || 'U').trim();
    return name.split(/\s+/)[0];
  }

  function buildAvatar(size) {
    var el = document.createElement('span');
    el.className = 'as-header-avatar';
    el.style.width = el.style.height = (size || 32) + 'px';

    if (user.picture) {
      var img = document.createElement('img');
      img.src = user.picture;
      img.alt = user.name || '';
      el.appendChild(img);
    } else {
      // cor fixa por conta, como na Nai
      var seed = (user.email || user.name || 'u');
      var sum = 0;
      for (var i = 0; i < seed.length; i++) sum += seed.charCodeAt(i);
      el.style.background = AVATAR_COLORS[sum % AVATAR_COLORS.length];
      el.textContent = firstName().charAt(0).toUpperCase();
    }
    return el;
  }

  /* ------------------------------------------------------------------
     GESTÃO COMPLETA DE DADOS DO UTILIZADOR & BANCO DE DADOS LOCAL
  ------------------------------------------------------------------ */
  function getFullUserData() {
    var merged = Object.assign({}, user);
    try {
      var raw = localStorage.getItem('nai_accounts_secure_v4');
      if (raw) {
        var list = JSON.parse(raw);
        var found = list.find(function(u) {
          return u.email && user.email && u.email.toLowerCase() === user.email.toLowerCase();
        });
        if (found) merged = Object.assign({}, user, found);
      }
    } catch (e) {}

    // Normalização completa de paymentCards
    if (!Array.isArray(merged.paymentCards) || merged.paymentCards.length === 0) {
      if (merged.paymentCard) {
        merged.paymentCards = [merged.paymentCard];
      } else if (merged.banking && Array.isArray(merged.banking.cards) && merged.banking.cards.length > 0) {
        merged.paymentCards = merged.banking.cards;
      } else {
        merged.paymentCards = [];
      }
    }
    return merged;
  }

  function saveFullUserData(updatedObj) {
    try {
      var raw = localStorage.getItem('nai_accounts_secure_v4');
      var list = raw ? JSON.parse(raw) : [];
      var idx = list.findIndex(function(u) {
        return u.email && updatedObj.email && u.email.toLowerCase() === updatedObj.email.toLowerCase();
      });
      if (idx >= 0) {
        list[idx] = Object.assign({}, list[idx], updatedObj);
      } else {
        list.push(updatedObj);
      }
      localStorage.setItem('nai_accounts_secure_v4', JSON.stringify(list));

      // Atualiza a sessão ativa
      var rawSess = localStorage.getItem(SESSION_KEY);
      if (rawSess) {
        var sess = JSON.parse(decodeURIComponent(escape(atob(rawSess))));
        var newSess = Object.assign({}, sess, updatedObj);
        localStorage.setItem(SESSION_KEY, btoa(unescape(encodeURIComponent(JSON.stringify(newSess)))));
      }

      // Sincronização em nuvem segura via Firestore se disponível
      if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length > 0) {
        try {
          var db = firebase.firestore();
          var docId = (updatedObj.email || '').toLowerCase().replace(/[^a-z0-9_]/g, '_');
          if (docId) {
            db.collection('nai_accounts').doc(docId).set(updatedObj, { merge: true });
          }
        } catch (fErr) {
          console.warn('Dashboard: sincronização Firestore:', fErr);
        }
      }
    } catch (e) {
      console.error('Erro ao guardar dados no Dashboard:', e);
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /* ------------------------------------------------------------------
     1. RENDERIZADOR: CARTEIRA E SUBSCRIÇÕES (PAYMENTS & SUBSCRIPTIONS)
     Design exato Google Wallet Escuro / Nai App Theme (Sem Mockups!)
  ------------------------------------------------------------------ */
  function renderPaymentsAndSubscriptions(fullUser) {
    var main = document.querySelector('.WxnH6c');
    if (!main) return;

    // Remove placeholders antigos da página Google estática
    var oldImage = main.querySelector('.QgNVwb');
    if (oldImage) oldImage.remove();
    var oldText = main.querySelector('.NR6PJd');
    if (oldText) oldText.remove();
    var oldBtn = main.querySelector('.FBldD');
    if (oldBtn) oldBtn.remove();
    var existingView = main.querySelector('.as-wallet-view-dark');
    if (existingView) existingView.remove();
    var existingOldWallet = main.querySelector('.as-wallet-container');
    if (existingOldWallet) existingOldWallet.remove();

    var cards = Array.isArray(fullUser.paymentCards) ? fullUser.paymentCards : [];
    var hasCards = cards.length > 0;
    var banking = fullUser.banking || {};
    var holder = fullUser.name || ((fullUser.firstName || '') + ' ' + (fullUser.lastName || '')).trim() || 'Titular da Conta';

    var container = document.createElement('div');
    container.className = 'as-wallet-view-dark';

    // 1. Caso NÃO CONFIGUREI cartão ainda (Imagem 1 Exata)
    if (!hasCards) {
      container.innerHTML = `
        <h1 class="as-wallet-title">Carteira e subscrições</h1>
        <h2 class="as-wallet-subtitle">Métodos de pagamento na Carteira da Nai</h2>
        <p class="as-wallet-desc">
          Os métodos de pagamento são guardados na Carteira da Nai e podem ser usados com o Nai Pay online, com o preenchimento automático, para pagamentos sem contacto e nos serviços Nai (como a Neuria e a Store)
        </p>
        <div class="as-wallet-actions-stack">
          <button type="button" class="as-wallet-action-row as-wallet-action-top" id="asBtnAddPaymentMethod">
            <div class="as-wallet-action-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="2" y="5" width="20" height="14" rx="3"></rect>
                <line x1="2" y1="10" x2="22" y2="10"></line>
                <line x1="17" y1="14" x2="17" y2="18"></line>
                <line x1="15" y1="16" x2="19" y2="16"></line>
              </svg>
            </div>
            <span>Adicionar método de pagamento</span>
          </button>
          <button type="button" class="as-wallet-action-row as-wallet-action-bottom" id="asBtnManagePaymentMethods">
            <span>Gerir métodos de pagamento</span>
          </button>
        </div>
      `;
      main.appendChild(container);

      var btnAdd = container.querySelector('#asBtnAddPaymentMethod');
      if (btnAdd) {
        btnAdd.addEventListener('click', function() {
          openAddCardModal(fullUser);
        });
      }

      var btnManage = container.querySelector('#asBtnManagePaymentMethods');
      if (btnManage) {
        btnManage.addEventListener('click', function() {
          openAddCardModal(fullUser);
        });
      }
      return;
    }

    // 2. Caso o utilizador JÁ TENHA CARTÕES reais registados
    var rawBalance = typeof banking.balance === 'number' ? banking.balance : (parseFloat(banking.balance) || 0);
    var formattedBalance = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(rawBalance);

    var cardsHtml = cards.map(function(c) {
      var brandClass = 'brand-' + (c.brand || 'visa').toLowerCase().replace(/\s+/g, '');
      var cardAddress = (c.billingAddress && c.billingAddress.formatted) ? c.billingAddress.formatted : ((c.address || '') + (c.city ? ' · ' + c.city : '') + (c.country ? ' · ' + c.country : ''));
      var cardTypeLabel = c.cardType ? c.cardType : 'Débito/Crédito';
      return `
        <div class="as-saved-card-cardview ${c.isDefault ? 'is-default' : ''}">
          <div class="as-cardview-top">
            <div class="as-cardview-brand">
              <span class="as-cardview-brand-icon ${brandClass}">${escapeHtml(c.brand || 'VISA')}</span>
              <span>${escapeHtml(c.brand || 'Cartão')} ${escapeHtml(cardTypeLabel)}</span>
            </div>
            ${c.isDefault ? '<span class="as-card-default-pill">Predefinido</span>' : ''}
          </div>

          <div class="as-cardview-num">•••• •••• •••• ${escapeHtml(c.last4 || '0000')}</div>

          <div class="as-cardview-info-grid">
            <div class="as-cardview-info-item">
              <div class="label">Titular do Cartão</div>
              <div class="value">${escapeHtml(c.holder || holder)}</div>
            </div>
            <div class="as-cardview-info-item">
              <div class="label">Validade</div>
              <div class="value">${escapeHtml(c.expiry || '--/--')}</div>
            </div>
            <div class="as-cardview-info-item">
              <div class="label">Morada Associada</div>
              <div class="value" title="${escapeHtml(cardAddress)}">${escapeHtml(c.city || (c.billingAddress && c.billingAddress.city) || 'Portugal')}${(c.country || (c.billingAddress && c.billingAddress.country)) ? ' · ' + escapeHtml(c.country || c.billingAddress.country) : ''}</div>
            </div>
          </div>

          <div class="as-cardview-actions-bar">
            ${!c.isDefault ? `<button type="button" class="as-card-btn-subtle" data-action="set-default" data-card-id="${c.id}">Definir como predefinido</button>` : ''}
            <button type="button" class="as-card-btn-danger" data-action="remove-card" data-card-id="${c.id}">Remover cartão</button>
          </div>
        </div>
      `;
    }).join('');

    // Dados Reais de Transações (sem simulações / sem dados inventados)
    var transactions = Array.isArray(banking.transactions) ? banking.transactions : [];
    var transactionsHtml = '';
    if (transactions.length > 0) {
      transactionsHtml = transactions.map(function(t) {
        var isPos = t.amount > 0;
        var amountStr = (isPos ? '+ ' : '- ') + Math.abs(t.amount).toFixed(2) + ' €';
        return `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.08);">
            <div>
              <div style="font-size: 14px; font-weight: 500; color: #ffffff;">${escapeHtml(t.description || 'Transação')}</div>
              <div style="font-size: 12px; color: #9aa0a6;">${escapeHtml(t.date || '')} · ${escapeHtml(t.category || 'Geral')}</div>
            </div>
            <div style="font-size: 14px; font-weight: 700; color: ${isPos ? '#81c995' : '#f28b82'};">${amountStr}</div>
          </div>
        `;
      }).join('');
    } else {
      transactionsHtml = '<div style="font-size: 13px; color: #9aa0a6; padding: 12px 0;">Sem transações registadas nesta conta.</div>';
    }

    // Dados Reais de Subscrições
    var subscriptions = Array.isArray(fullUser.subscriptions) ? fullUser.subscriptions : [];
    var subsHtml = '';
    if (subscriptions.length > 0) {
      subsHtml = subscriptions.map(function(s) {
        return `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.08);">
            <div>
              <div style="font-size: 14px; font-weight: 500; color: #ffffff;">${escapeHtml(s.name || 'Serviço')}</div>
              <div style="font-size: 12px; color: #9aa0a6;">Renovação: ${escapeHtml(s.renewalDate || '')} · ${escapeHtml(s.plan || '')}</div>
            </div>
            <div style="font-size: 14px; font-weight: 700; color: #ffffff;">${escapeHtml(s.price || '')}</div>
          </div>
        `;
      }).join('');
    } else {
      subsHtml = '<div style="font-size: 13px; color: #9aa0a6; padding: 12px 0;">Não tem subscrições ativas de momento.</div>';
    }

    // Saldo: só exibe bloco de saldo se o utilizador tiver configurado saldo real (> 0)
    var balanceSectionHtml = rawBalance > 0 ? `
      <div style="background: #1a1a20; border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 20px; margin-bottom: 16px;">
        <div style="font-size: 13px; font-weight: 500; color: #9aa0a6; text-transform: uppercase;">Saldo da Carteira Nai</div>
        <div style="font-size: 32px; font-weight: 700; color: #8ab4f8; margin: 8px 0;">${formattedBalance}</div>
        <div style="font-size: 12px; color: #81c995;">● Saldo Disponível</div>
      </div>
    ` : '';

    container.innerHTML = `
      <h1 class="as-wallet-title">Carteira e subscrições</h1>
      <h2 class="as-wallet-subtitle">Métodos de pagamento na Carteira da Nai</h2>
      <p class="as-wallet-desc">
        Os métodos de pagamento são guardados na Carteira da Nai e podem ser usados com o Nai Pay online, com o preenchimento automático, para pagamentos sem contacto e nos serviços Nai (como a Neuria e a Store)
      </p>

      <!-- Lista de Cartões Reais com Visual Premium -->
      <div class="as-saved-cards-list">
        ${cardsHtml}
      </div>

      <!-- Ação quando já existem cartões: Adicionar outro cartão -->
      <div style="margin: 16px 0 28px;">
        <button type="button" class="as-btn-add-card-secondary" id="asBtnAddPaymentMethod" style="display: inline-flex; align-items: center; gap: 8px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.15); color: #8ab4f8; padding: 10px 20px; border-radius: 999px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          <span>Adicionar outro cartão</span>
        </button>
      </div>

      <!-- Saldo da Conta Real (se existente) -->
      ${balanceSectionHtml}

      <!-- Transações e Subscrições Reais -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px;">
        <div style="background: #1a1a20; border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 20px;">
          <div style="font-size: 15px; font-weight: 600; color: #ffffff; margin-bottom: 12px;">Transações Recentes</div>
          ${transactionsHtml}
        </div>

        <div style="background: #1a1a20; border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 20px;">
          <div style="font-size: 15px; font-weight: 600; color: #ffffff; margin-bottom: 12px;">Subscrições & Pagamentos Periódicos</div>
          ${subsHtml}
        </div>
      </div>
    `;

    main.appendChild(container);

    // Eventos de Ação dos Cartões
    container.querySelectorAll('[data-action="set-default"]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var cardId = btn.getAttribute('data-card-id');
        fullUser.paymentCards.forEach(function(c) {
          c.isDefault = (c.id === cardId);
        });
        saveFullUserData(fullUser);
        renderPaymentsAndSubscriptions(fullUser);
      });
    });

    container.querySelectorAll('[data-action="remove-card"]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var cardId = btn.getAttribute('data-card-id');
        if (confirm('Tem a certeza de que pretende remover este método de pagamento da Carteira da Nai?')) {
          fullUser.paymentCards = fullUser.paymentCards.filter(function(c) { return c.id !== cardId; });
          if (fullUser.paymentCards.length === 0) {
            if (fullUser.banking) {
              fullUser.banking.hasBanking = false;
              fullUser.banking.cardNumber = null;
            }
          } else {
            var hasDefault = fullUser.paymentCards.some(function(c) { return c.isDefault; });
            if (!hasDefault) fullUser.paymentCards[0].isDefault = true;
          }
          saveFullUserData(fullUser);
          renderPaymentsAndSubscriptions(fullUser);
        }
      });
    });

    var btnAddMore = container.querySelector('#asBtnAddPaymentMethod');
    if (btnAddMore) {
      btnAddMore.addEventListener('click', function() {
        openAddCardModal(fullUser);
      });
    }

    var btnManageMore = container.querySelector('#asBtnManagePaymentMethods');
    if (btnManageMore) {
      btnManageMore.addEventListener('click', function() {
        var cardsArea = container.querySelector('.as-saved-cards-list');
        if (cardsArea) cardsArea.scrollIntoView({ behavior: 'smooth' });
      });
    }
  }

  /* ------------------------------------------------------------------
     MODAL EM 3 ETAPAS: ADICIONAR CARTÃO CRÉDITO/DÉBITO
     Etapa 1: Dados do Cartão (Número, Validade, CVC, Titular)
     Etapa 2: Morada de Faturação (País, Endereço, Apartamento, CP, Cidade)
     Etapa 3: Revisão & Termos (Pré-visualização do cartão e confirmação)
  ------------------------------------------------------------------ */
  function openAddCardModal(fullUser) {
    var existingModal = document.getElementById('asPaymentModalOverlay');
    if (existingModal) existingModal.remove();

    var defaultHolder = fullUser.name || ((fullUser.firstName || '') + ' ' + (fullUser.lastName || '')).trim() || '';
    var currentStep = 1;
    var totalSteps = 3;

    // Estado temporário mantido entre etapas
    var wizardData = {
      cardNumber: '',
      expiry: '',
      cvc: '',
      holder: defaultHolder,
      cardType: 'Débito',
      bankName: '',
      iban: '',
      balance: 0,
      country: 'Portugal',
      address: '',
      apartment: '',
      postalCode: '',
      city: '',
      nif: '',
      phone: ''
    };

    var modalOverlay = document.createElement('div');
    modalOverlay.className = 'as-payment-modal-overlay';
    modalOverlay.id = 'asPaymentModalOverlay';

    var cardBox = document.createElement('div');
    cardBox.className = 'as-payment-form-card';
    cardBox.setAttribute('role', 'dialog');
    cardBox.setAttribute('aria-labelledby', 'asModalTitle');
    modalOverlay.appendChild(cardBox);
    document.body.appendChild(modalOverlay);

    function closeModal() {
      modalOverlay.remove();
    }

    modalOverlay.addEventListener('click', function(e) {
      if (e.target === modalOverlay) closeModal();
    });

    // Validação estrita por algoritmo de Luhn (padrão bancário internacional ISO/IEC 7812)
    function validateLuhn(digits) {
      if (!digits || digits.length < 13 || digits.length > 19) return false;
      var sum = 0;
      var shouldDouble = false;
      for (var i = digits.length - 1; i >= 0; i--) {
        var digit = parseInt(digits.charAt(i), 10);
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

    // Detetar emissor bancário real do cartão (IIN / BIN)
    function detectRealBrand(cleanNumber) {
      if (/^4[0-9]{12}(?:[0-9]{3})?$/.test(cleanNumber)) return 'Visa';
      if (/^(?:5[1-5][0-9]{2}|222[1-9]|22[3-9][0-9]|2[3-6][0-9]{2}|27[01][0-9]|2720)[0-9]{12}$/.test(cleanNumber)) return 'Mastercard';
      if (/^3[47][0-9]{13}$/.test(cleanNumber)) return 'American Express';
      if (/^6(?:011|5[0-9]{2}|4[4-9][0-9])[0-9]{12}$/.test(cleanNumber)) return 'Discover';
      if (/^(5018|5020|5038|5893|6304|6759|6761|6762|6763)[0-9]{8,15}$/.test(cleanNumber)) return 'Maestro';
      if (/^(606282|3841)[0-9]{10,13}$/.test(cleanNumber)) return 'Hipercard';
      if (/^35(?:2[89]|[3-8][0-9])[0-9]{12}$/.test(cleanNumber)) return 'JCB';
      // Verificação de prefixo enquanto o utilizador digita
      if (/^4/.test(cleanNumber)) return 'Visa';
      if (/^(5[1-5]|2[2-7])/.test(cleanNumber)) return 'Mastercard';
      if (/^3[47]/.test(cleanNumber)) return 'American Express';
      if (/^6/.test(cleanNumber)) return 'Discover';
      return null; // Não é um cartão de crédito/débito bancário reconhecido!
    }

    function renderStepper() {
      var steps = [
        { num: 1, label: 'Cartão' },
        { num: 2, label: 'Morada' },
        { num: 3, label: 'Revisão' }
      ];

      var html = '<div class="as-step-indicator">';
      for (var i = 0; i < steps.length; i++) {
        var s = steps[i];
        var stateCls = '';
        if (s.num === currentStep) stateCls = 'active';
        else if (s.num < currentStep) stateCls = 'completed';

        html += `
          <div class="as-step-badge ${stateCls}">
            <span class="as-step-num">${s.num < currentStep ? '✓' : s.num}</span>
            <span>${s.label}</span>
          </div>
        `;
        if (i < steps.length - 1) {
          html += `<div class="as-step-divider ${s.num < currentStep ? 'completed' : ''}"></div>`;
        }
      }
      html += '</div>';
      return html;
    }

    function renderStep() {
      if (currentStep === 1) renderStep1();
      else if (currentStep === 2) renderStep2();
      else if (currentStep === 3) renderStep3();
    }

    /* ================================================================
       ETAPA 1: DADOS DO CARTÃO
    ================================================================ */
    function renderStep1() {
      cardBox.innerHTML = `
        <div class="as-modal-header">
          <button type="button" class="as-modal-back-btn" id="asBtnStep1Cancel" aria-label="Fechar">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
          <h2 class="as-modal-title" id="asModalTitle">Adicionar cartão (1/3)</h2>
        </div>

        ${renderStepper()}

        <div class="as-modal-content-box">
          <h3 class="as-modal-box-title">Dados do cartão crédito/débito</h3>
          <p class="as-modal-box-subtitle">Preencha os dados do cartão para pagamentos e preenchimento automático.</p>

          <!-- Número do cartão -->
          <div class="as-field-group">
            <div class="as-outlined-input-wrapper" id="asWrapCardNumber">
              <span class="as-input-icon-left">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="2" y="5" width="20" height="14" rx="3"></rect>
                  <line x1="2" y1="10" x2="22" y2="10"></line>
                </svg>
              </span>
              <input type="text" class="as-outlined-input" id="asInputCardNumber" placeholder="Número do cartão" maxlength="19" autocomplete="cc-number" value="${escapeHtml(wizardData.cardNumber)}">
              <span class="as-input-icon-right" title="O número presente na frente ou verso do cartão">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                  <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
              </span>
            </div>
            <div class="as-field-error-msg" id="asErrCardNumber">Número do cartão necessário (mínimo 13 dígitos)</div>
            <div class="as-field-subtext" id="asCardBrandHint" style="font-weight: 500; margin-top: 4px;"></div>
          </div>

          <!-- Validade, CVC & Tipo de Cartão -->
          <div class="as-field-row">
            <div class="as-field-group" style="flex: 1;">
              <div class="as-outlined-input-wrapper" id="asWrapExpiry">
                <input type="text" class="as-outlined-input" id="asInputExpiry" placeholder="MM/AA" maxlength="5" autocomplete="cc-exp" value="${escapeHtml(wizardData.expiry)}">
              </div>
              <div class="as-field-error-msg" id="asErrExpiry">Validade inválida (ex: 12/28)</div>
            </div>
            <div class="as-field-group" style="flex: 1;">
              <div class="as-outlined-input-wrapper" id="asWrapCvc">
                <input type="text" class="as-outlined-input" id="asInputCvc" placeholder="CVC / CVV" maxlength="4" autocomplete="cc-csc" value="${escapeHtml(wizardData.cvc)}">
                <span class="as-input-icon-right" title="Código de 3 ou 4 dígitos no verso do cartão">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                    <line x1="12" y1="17" x2="12.01" y2="17"></line>
                  </svg>
                </span>
              </div>
              <div class="as-field-error-msg" id="asErrCvc">CVC inválido (3-4 dígitos)</div>
            </div>
            <div class="as-field-group" style="flex: 1.2;">
              <div class="as-field-floating-container">
                <label class="as-floating-label" for="asSelectCardType">Tipo</label>
                <select class="as-floating-select" id="asSelectCardType">
                  <option value="Débito" ${wizardData.cardType === 'Débito' ? 'selected' : ''}>Débito</option>
                  <option value="Crédito" ${wizardData.cardType === 'Crédito' ? 'selected' : ''}>Crédito</option>
                </select>
              </div>
            </div>
          </div>

          <!-- Titular do cartão -->
          <div class="as-field-group">
            <div class="as-field-floating-container" id="asWrapHolder">
              <label class="as-floating-label" for="asInputHolder">Nome do titular do cartão</label>
              <input type="text" class="as-floating-input" id="asInputHolder" value="${escapeHtml(wizardData.holder)}" placeholder="Como gravado no cartão" autocomplete="cc-name">
            </div>
            <div class="as-field-error-msg" id="asErrHolder">Nome do titular necessário</div>
          </div>

          <!-- Banco e Saldo (Opcional) -->
          <div class="as-field-row" style="margin-top: 4px;">
            <div class="as-field-group" style="flex: 1.4;">
              <div class="as-field-floating-container">
                <label class="as-floating-label" for="asSelectBank">Banco (Opcional)</label>
                <select class="as-floating-select" id="asSelectBank">
                  <option value="" ${!wizardData.bankName ? 'selected' : ''}>Selecionar Banco</option>
                  <option value="Caixa Geral de Depósitos" ${wizardData.bankName === 'Caixa Geral de Depósitos' ? 'selected' : ''}>CGD</option>
                  <option value="Millennium BCP" ${wizardData.bankName === 'Millennium BCP' ? 'selected' : ''}>Millennium BCP</option>
                  <option value="Santander Totta" ${wizardData.bankName === 'Santander Totta' ? 'selected' : ''}>Santander</option>
                  <option value="Banco BPI" ${wizardData.bankName === 'Banco BPI' ? 'selected' : ''}>BPI</option>
                  <option value="Novo Banco" ${wizardData.bankName === 'Novo Banco' ? 'selected' : ''}>Novo Banco</option>
                  <option value="ActivoBank" ${wizardData.bankName === 'ActivoBank' ? 'selected' : ''}>ActivoBank</option>
                  <option value="Revolut Bank" ${wizardData.bankName === 'Revolut Bank' ? 'selected' : ''}>Revolut</option>
                  <option value="Outro Banco" ${wizardData.bankName === 'Outro Banco' ? 'selected' : ''}>Outro Banco</option>
                </select>
              </div>
            </div>
            <div class="as-field-group" style="flex: 1;">
              <div class="as-field-floating-container">
                <label class="as-floating-label" for="asInputBalance">Saldo em € (Opcional)</label>
                <input type="number" class="as-floating-input" id="asInputBalance" placeholder="0.00" min="0" step="0.01" value="${wizardData.balance > 0 ? wizardData.balance : ''}">
              </div>
            </div>
          </div>

          <!-- IBAN (Opcional) -->
          <div class="as-field-group">
            <div class="as-field-floating-container">
              <label class="as-floating-label" for="asInputIban">IBAN (Opcional)</label>
              <input type="text" class="as-floating-input" id="asInputIban" placeholder="Ex: PT50 0000 0000 ..." maxlength="34" value="${escapeHtml(wizardData.iban)}">
            </div>
          </div>
        </div>

        <div class="as-modal-actions">
          <button type="button" class="as-btn-text-modal" id="asBtnCancel1">Cancelar</button>
          <button type="button" class="as-btn-save-pill" id="asBtnNext1">Seguinte: Morada →</button>
        </div>
      `;

      var cardNumInput = cardBox.querySelector('#asInputCardNumber');
      var expiryInput = cardBox.querySelector('#asInputExpiry');
      var cvcInput = cardBox.querySelector('#asInputCvc');
      var holderInput = cardBox.querySelector('#asInputHolder');
      var cardTypeSelect = cardBox.querySelector('#asSelectCardType');
      var bankSelect = cardBox.querySelector('#asSelectBank');
      var balanceInput = cardBox.querySelector('#asInputBalance');
      var ibanInput = cardBox.querySelector('#asInputIban');

      cardBox.querySelector('#asBtnStep1Cancel').addEventListener('click', closeModal);
      cardBox.querySelector('#asBtnCancel1').addEventListener('click', closeModal);

      // Feedback em tempo real do emissor bancário
      cardNumInput.addEventListener('input', function() {
        var rawDigits = cardNumInput.value.replace(/\D/g, '').substring(0, 16);
        var parts = [];
        for (var i = 0; i < rawDigits.length; i += 4) {
          parts.push(rawDigits.substring(i, i + 4));
        }
        cardNumInput.value = parts.join(' ');
        cardBox.querySelector('#asWrapCardNumber').classList.remove('as-error');
        cardBox.querySelector('#asErrCardNumber').style.display = 'none';

        var detectedIssuer = detectRealBrand(rawDigits);
        var hintEl = cardBox.querySelector('#asCardBrandHint');
        if (hintEl) {
          if (detectedIssuer) {
            hintEl.textContent = 'Emissor bancário detetado: ' + detectedIssuer;
            hintEl.style.color = '#81c995';
          } else if (rawDigits.length >= 4) {
            hintEl.textContent = 'Aviso: Prefixo de cartão não corresponde a rede bancária autorizada.';
            hintEl.style.color = '#f28b82';
          } else {
            hintEl.textContent = '';
          }
        }
      });

      // Formatação da validade
      expiryInput.addEventListener('input', function() {
        var val = expiryInput.value.replace(/\D/g, '').substring(0, 4);
        if (val.length >= 2) {
          expiryInput.value = val.substring(0, 2) + '/' + val.substring(2);
        } else {
          expiryInput.value = val;
        }
        cardBox.querySelector('#asWrapExpiry').classList.remove('as-error');
        cardBox.querySelector('#asErrExpiry').style.display = 'none';
      });

      // Formatação CVC
      cvcInput.addEventListener('input', function() {
        cvcInput.value = cvcInput.value.replace(/\D/g, '').substring(0, 4);
        cardBox.querySelector('#asWrapCvc').classList.remove('as-error');
        cardBox.querySelector('#asErrCvc').style.display = 'none';
      });

      // Validação estrita da Etapa 1 (Verificação bancária real)
      cardBox.querySelector('#asBtnNext1').addEventListener('click', function() {
        var cleanNum = cardNumInput.value.replace(/\s+/g, '');
        var expiryVal = expiryInput.value.trim();
        var cvcVal = cvcInput.value.trim();
        var holderVal = holderInput.value.trim();

        var hasErr = false;
        var cardErrEl = cardBox.querySelector('#asErrCardNumber');

        // 1. Verificar emissor real do cartão
        var issuer = detectRealBrand(cleanNum);
        if (!issuer) {
          cardBox.querySelector('#asWrapCardNumber').classList.add('as-error');
          cardErrEl.textContent = 'Cartão não reconhecido: insira um cartão bancário válido (Visa, Mastercard, Amex, etc.).';
          cardErrEl.style.display = 'block';
          hasErr = true;
        } else if (!validateLuhn(cleanNum)) {
          // 2. Verificar autenticidade do número pelo Algoritmo de Luhn (ISO/IEC 7812)
          cardBox.querySelector('#asWrapCardNumber').classList.add('as-error');
          cardErrEl.textContent = 'Número de cartão inválido ou inexistente (falha na validação bancária).';
          cardErrEl.style.display = 'block';
          hasErr = true;
        } else {
          cardBox.querySelector('#asWrapCardNumber').classList.remove('as-error');
          cardErrEl.style.display = 'none';
        }

        // 3. Verificar validade futura
        var expParts = expiryVal.split('/');
        var mm = parseInt(expParts[0], 10);
        var yy = parseInt(expParts[1], 10);
        var nowYear = new Date().getFullYear() % 100;
        var nowMonth = new Date().getMonth() + 1;

        if (expParts.length !== 2 || isNaN(mm) || isNaN(yy) || mm < 1 || mm > 12 || expParts[1].length !== 2 ||
            yy < nowYear || (yy === nowYear && mm < nowMonth)) {
          cardBox.querySelector('#asWrapExpiry').classList.add('as-error');
          cardBox.querySelector('#asErrExpiry').style.display = 'block';
          hasErr = true;
        } else {
          cardBox.querySelector('#asWrapExpiry').classList.remove('as-error');
          cardBox.querySelector('#asErrExpiry').style.display = 'none';
        }

        // 4. Verificar CVC
        if (cvcVal.length < 3) {
          cardBox.querySelector('#asWrapCvc').classList.add('as-error');
          cardBox.querySelector('#asErrCvc').style.display = 'block';
          hasErr = true;
        } else {
          cardBox.querySelector('#asWrapCvc').classList.remove('as-error');
          cardBox.querySelector('#asErrCvc').style.display = 'none';
        }

        // 5. Verificar titular
        if (!holderVal || holderVal.length < 3) {
          cardBox.querySelector('#asWrapHolder').classList.add('as-error');
          cardBox.querySelector('#asErrHolder').style.display = 'block';
          hasErr = true;
        } else {
          cardBox.querySelector('#asWrapHolder').classList.remove('as-error');
          cardBox.querySelector('#asErrHolder').style.display = 'none';
        }

        if (hasErr) return;

        wizardData.cardNumber = cardNumInput.value;
        wizardData.expiry = expiryVal;
        wizardData.cvc = cvcVal;
        wizardData.holder = holderVal;
        wizardData.detectedBrand = issuer;
        wizardData.cardType = cardTypeSelect ? cardTypeSelect.value : 'Débito';
        wizardData.bankName = bankSelect ? bankSelect.value.trim() : '';
        wizardData.balance = balanceInput ? (parseFloat(balanceInput.value) || 0) : 0;
        wizardData.iban = ibanInput ? ibanInput.value.trim() : '';

        currentStep = 2;
        renderStep();
      });
    }

    /* ================================================================
       ETAPA 2: MORADA DE FATURAÇÃO
    ================================================================ */
    function renderStep2() {
      cardBox.innerHTML = `
        <div class="as-modal-header">
          <button type="button" class="as-modal-back-btn" id="asBtnBackToStep1" aria-label="Voltar à etapa 1">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
          </button>
          <h2 class="as-modal-title" id="asModalTitle">Morada de faturação (2/3)</h2>
        </div>

        ${renderStepper()}

        <div class="as-modal-content-box">
          <h3 class="as-modal-box-title">Endereço de faturação</h3>
          <p class="as-modal-box-subtitle">Introduza a morada associada a este cartão.</p>

          <!-- País/região -->
          <div class="as-field-group">
            <div class="as-field-floating-container">
              <label class="as-floating-label" for="asSelectCountry">País/região</label>
              <select class="as-floating-select" id="asSelectCountry">
                <option value="Portugal" ${wizardData.country === 'Portugal' ? 'selected' : ''}>Portugal</option>
                <option value="Espanha" ${wizardData.country === 'Espanha' ? 'selected' : ''}>Espanha</option>
                <option value="França" ${wizardData.country === 'França' ? 'selected' : ''}>França</option>
                <option value="Alemanha" ${wizardData.country === 'Alemanha' ? 'selected' : ''}>Alemanha</option>
                <option value="Reino Unido" ${wizardData.country === 'Reino Unido' ? 'selected' : ''}>Reino Unido</option>
                <option value="Brasil" ${wizardData.country === 'Brasil' ? 'selected' : ''}>Brasil</option>
                <option value="Estados Unidos" ${wizardData.country === 'Estados Unidos' ? 'selected' : ''}>Estados Unidos</option>
                <option value="Outro país" ${wizardData.country === 'Outro país' ? 'selected' : ''}>Outro país</option>
              </select>
            </div>
          </div>

          <!-- Endereço -->
          <div class="as-field-group">
            <div class="as-field-floating-container" id="asWrapAddress">
              <label class="as-floating-label" for="asInputAddress">Endereço (Rua, Número)</label>
              <input type="text" class="as-floating-input" id="asInputAddress" placeholder="Ex: Av. da Liberdade, 120" autocomplete="street-address" value="${escapeHtml(wizardData.address)}">
            </div>
            <div class="as-field-error-msg" id="asErrAddress">Endereço necessário</div>
          </div>

          <!-- Apartamento, suite, etc. -->
          <div class="as-field-group">
            <div class="as-field-floating-container">
              <label class="as-floating-label" for="asInputApartment">Apartamento, suite, etc.</label>
              <input type="text" class="as-floating-input" id="asInputApartment" placeholder="Ex: 3º Dto" autocomplete="address-line2" value="${escapeHtml(wizardData.apartment)}">
            </div>
            <div class="as-field-subtext">Opcional</div>
          </div>

          <!-- Código postal e Cidade -->
          <div class="as-field-row">
            <div class="as-field-group">
              <div class="as-field-floating-container" id="asWrapPostalCode">
                <label class="as-floating-label" for="asInputPostalCode">Código postal</label>
                <input type="text" class="as-floating-input" id="asInputPostalCode" placeholder="Ex: 1250-096" autocomplete="postal-code" value="${escapeHtml(wizardData.postalCode)}">
              </div>
              <div class="as-field-error-msg" id="asErrPostalCode">Código postal necessário</div>
            </div>
            <div class="as-field-group">
              <div class="as-field-floating-container" id="asWrapCity">
                <label class="as-floating-label" for="asInputCity">Cidade</label>
                <input type="text" class="as-floating-input" id="asInputCity" placeholder="Ex: Lisboa" autocomplete="address-level2" value="${escapeHtml(wizardData.city)}">
              </div>
              <div class="as-field-error-msg" id="asErrCity">Cidade necessária</div>
            </div>
          </div>

          <!-- NIF e Telefone (Opcionais) -->
          <div class="as-field-row" style="margin-top: 4px;">
            <div class="as-field-group">
              <div class="as-field-floating-container">
                <label class="as-floating-label" for="asInputNif">NIF / Contribuinte (Opcional)</label>
                <input type="text" class="as-floating-input" id="asInputNif" placeholder="Ex: 123456789" maxlength="15" value="${escapeHtml(wizardData.nif)}">
              </div>
            </div>
            <div class="as-field-group">
              <div class="as-field-floating-container">
                <label class="as-floating-label" for="asInputPhone">Telefone de Contacto (Opcional)</label>
                <input type="tel" class="as-floating-input" id="asInputPhone" placeholder="Ex: +351 912 345 678" maxlength="18" value="${escapeHtml(wizardData.phone)}">
              </div>
            </div>
          </div>
        </div>

        <div class="as-modal-actions">
          <button type="button" class="as-btn-text-modal" id="asBtnBack2">Anterior</button>
          <button type="button" class="as-btn-save-pill" id="asBtnNext2">Seguinte: Rever e Guardar →</button>
        </div>
      `;

      var countrySelect = cardBox.querySelector('#asSelectCountry');
      var addressInput = cardBox.querySelector('#asInputAddress');
      var aptInput = cardBox.querySelector('#asInputApartment');
      var postalInput = cardBox.querySelector('#asInputPostalCode');
      var cityInput = cardBox.querySelector('#asInputCity');
      var nifInput = cardBox.querySelector('#asInputNif');
      var phoneInput = cardBox.querySelector('#asInputPhone');

      function goBackToStep1() {
        wizardData.country = countrySelect.value;
        wizardData.address = addressInput.value.trim();
        wizardData.apartment = aptInput.value.trim();
        wizardData.postalCode = postalInput.value.trim();
        wizardData.city = cityInput.value.trim();
        wizardData.nif = nifInput ? nifInput.value.trim() : '';
        wizardData.phone = phoneInput ? phoneInput.value.trim() : '';
        currentStep = 1;
        renderStep();
      }

      cardBox.querySelector('#asBtnBackToStep1').addEventListener('click', goBackToStep1);
      cardBox.querySelector('#asBtnBack2').addEventListener('click', goBackToStep1);

      // Validação da Etapa 2
      cardBox.querySelector('#asBtnNext2').addEventListener('click', function() {
        var addrVal = addressInput.value.trim();
        var postalVal = postalInput.value.trim();
        var cityVal = cityInput.value.trim();

        var hasErr = false;

        if (!addrVal) {
          cardBox.querySelector('#asWrapAddress').classList.add('as-error');
          cardBox.querySelector('#asErrAddress').style.display = 'block';
          hasErr = true;
        } else {
          cardBox.querySelector('#asWrapAddress').classList.remove('as-error');
          cardBox.querySelector('#asErrAddress').style.display = 'none';
        }

        if (!postalVal) {
          cardBox.querySelector('#asWrapPostalCode').classList.add('as-error');
          cardBox.querySelector('#asErrPostalCode').style.display = 'block';
          hasErr = true;
        } else {
          cardBox.querySelector('#asWrapPostalCode').classList.remove('as-error');
          cardBox.querySelector('#asErrPostalCode').style.display = 'none';
        }

        if (!cityVal) {
          cardBox.querySelector('#asWrapCity').classList.add('as-error');
          cardBox.querySelector('#asErrCity').style.display = 'block';
          hasErr = true;
        } else {
          cardBox.querySelector('#asWrapCity').classList.remove('as-error');
          cardBox.querySelector('#asErrCity').style.display = 'none';
        }

        if (hasErr) return;

        wizardData.country = countrySelect.value;
        wizardData.address = addrVal;
        wizardData.apartment = aptInput.value.trim();
        wizardData.postalCode = postalVal;
        wizardData.city = cityVal;
        wizardData.nif = nifInput ? nifInput.value.trim() : '';
        wizardData.phone = phoneInput ? phoneInput.value.trim() : '';

        currentStep = 3;
        renderStep();
      });
    }

    /* ================================================================
       ETAPA 3: REVISÃO & CONFIRMAÇÃO
    ================================================================ */
    function renderStep3() {
      var cleanNum = wizardData.cardNumber.replace(/\s+/g, '');
      var brand = wizardData.detectedBrand || detectRealBrand(cleanNum) || 'Cartão Bancário';
      var last4 = cleanNum.substring(cleanNum.length - 4);
      var maskedNum = '•••• •••• •••• ' + last4;

      cardBox.innerHTML = `
        <div class="as-modal-header">
          <button type="button" class="as-modal-back-btn" id="asBtnBackToStep2" aria-label="Voltar à etapa 2">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
          </button>
          <h2 class="as-modal-title" id="asModalTitle">Revisão & Guardar (3/3)</h2>
        </div>

        ${renderStepper()}

        <div class="as-modal-content-box">
          <h3 class="as-modal-box-title">Confirmar dados do cartão & conta</h3>
          <p class="as-modal-box-subtitle">Reveja os detalhes antes de guardar na sua Carteira Nai.</p>

          <!-- Cartão Visual Realista -->
          <div class="as-card-preview-box">
            <div class="as-card-preview-top">
              <div class="as-card-chip-gold"></div>
              <span class="as-card-preview-brand-label">${escapeHtml(brand)} · ${escapeHtml(wizardData.cardType || 'Débito')}</span>
            </div>
            <div class="as-card-preview-num">${escapeHtml(maskedNum)}</div>
            <div class="as-card-preview-bottom">
              <div>
                <div class="as-card-preview-label">Titular</div>
                <div class="as-card-preview-val">${escapeHtml(wizardData.holder)}</div>
              </div>
              <div style="text-align: right;">
                <div class="as-card-preview-label">Validade</div>
                <div class="as-card-preview-val">${escapeHtml(wizardData.expiry)}</div>
              </div>
            </div>
          </div>

          <!-- Tabela de Revisão Completa -->
          <div class="as-review-details-table">
            <div class="as-review-details-row">
              <span class="as-review-details-label">Bandeira / Tipo:</span>
              <span class="as-review-details-val">${escapeHtml(brand)} (${escapeHtml(wizardData.cardType || 'Débito')})</span>
            </div>
            ${wizardData.bankName ? `
            <div class="as-review-details-row">
              <span class="as-review-details-label">Banco Associado:</span>
              <span class="as-review-details-val">${escapeHtml(wizardData.bankName)}</span>
            </div>
            ` : ''}
            ${wizardData.iban ? `
            <div class="as-review-details-row">
              <span class="as-review-details-label">IBAN:</span>
              <span class="as-review-details-val" style="font-family: monospace;">${escapeHtml(wizardData.iban)}</span>
            </div>
            ` : ''}
            ${wizardData.balance > 0 ? `
            <div class="as-review-details-row">
              <span class="as-review-details-label">Saldo Inicial:</span>
              <span class="as-review-details-val" style="color: #81c995; font-weight: 700;">${new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(wizardData.balance)}</span>
            </div>
            ` : ''}
            <div class="as-review-details-row">
              <span class="as-review-details-label">Morada:</span>
              <span class="as-review-details-val">${escapeHtml(wizardData.address)}${wizardData.apartment ? ', ' + escapeHtml(wizardData.apartment) : ''}</span>
            </div>
            <div class="as-review-details-row">
              <span class="as-review-details-label">Localidade:</span>
              <span class="as-review-details-val">${escapeHtml(wizardData.postalCode)} ${escapeHtml(wizardData.city)}, ${escapeHtml(wizardData.country)}</span>
            </div>
            ${wizardData.nif ? `
            <div class="as-review-details-row">
              <span class="as-review-details-label">NIF / Contribuinte:</span>
              <span class="as-review-details-val">${escapeHtml(wizardData.nif)}</span>
            </div>
            ` : ''}
            ${wizardData.phone ? `
            <div class="as-review-details-row">
              <span class="as-review-details-label">Telefone:</span>
              <span class="as-review-details-val">${escapeHtml(wizardData.phone)}</span>
            </div>
            ` : ''}
          </div>

          <!-- Termos Legais -->
          <div class="as-modal-terms">
            <p>
              O Nai Payments permite-lhe adicionar métodos de pagamentos e dados bancários à sua Conta Nai. Depois de adicionados, pode utilizá-los em vários serviços Nai e aplicações associadas.
            </p>
            <p>
              Ao continuar, cria uma conta do Nai Payments e aceita os <a href="#" onclick="return false;">Termos de Utilização</a> do Nai Payments. O <a href="#" onclick="return false;">Aviso de Privacidade</a> descreve como tratamos os seus dados.
            </p>
          </div>
        </div>

        <div class="as-modal-actions">
          <button type="button" class="as-btn-text-modal" id="asBtnBack3">Anterior</button>
          <button type="button" class="as-btn-save-pill" id="asBtnConfirmSave">Guardar cartão</button>
        </div>
      `;

      function goBackToStep2() {
        currentStep = 2;
        renderStep();
      }

      cardBox.querySelector('#asBtnBackToStep2').addEventListener('click', goBackToStep2);
      cardBox.querySelector('#asBtnBack3').addEventListener('click', goBackToStep2);

      // Guardar cartão definitivo com dados completos
      cardBox.querySelector('#asBtnConfirmSave').addEventListener('click', function() {
        var cleanNumber = wizardData.cardNumber.replace(/\s+/g, '');
        var cardBrand = wizardData.detectedBrand || detectRealBrand(cleanNumber) || 'Cartão Bancário';
        var cardLast4 = cleanNumber.substring(cleanNumber.length - 4);
        var maskedCardNum = '•••• •••• •••• ' + cardLast4;

        var isDefaultCard = (!Array.isArray(fullUser.paymentCards) || fullUser.paymentCards.length === 0);

        var newCard = {
          id: 'card_' + Date.now(),
          brand: cardBrand,
          cardType: wizardData.cardType || 'Débito',
          cardNumberMasked: maskedCardNum,
          last4: cardLast4,
          expiry: wizardData.expiry,
          holder: wizardData.holder,
          bankName: wizardData.bankName || cardBrand,
          iban: wizardData.iban || null,
          balance: wizardData.balance || 0,
          country: wizardData.country,
          address: wizardData.address,
          apartment: wizardData.apartment,
          postalCode: wizardData.postalCode,
          city: wizardData.city,
          nif: wizardData.nif || null,
          phone: wizardData.phone || null,
          isDefault: isDefaultCard,
          addedAt: new Date().toISOString()
        };

        if (!Array.isArray(fullUser.paymentCards)) fullUser.paymentCards = [];
        fullUser.paymentCards.push(newCard);

        // Atualiza banking com dados reais e completos
        fullUser.banking = fullUser.banking || {};
        fullUser.banking.hasBanking = true;
        fullUser.banking.bankName = wizardData.bankName || cardBrand;
        fullUser.banking.cardNumber = maskedCardNum;
        fullUser.banking.holder = wizardData.holder;
        if (wizardData.iban) fullUser.banking.iban = wizardData.iban;
        if (wizardData.balance > 0) fullUser.banking.balance = wizardData.balance;
        if (wizardData.nif) fullUser.banking.nif = wizardData.nif;
        if (wizardData.phone) fullUser.banking.phone = wizardData.phone;
        fullUser.banking.currency = 'EUR';
        fullUser.banking.updatedAt = new Date().toISOString();

        saveFullUserData(fullUser);
        closeModal();
        renderPaymentsAndSubscriptions(fullUser);
      });
    }

    renderStep();
  }

  /* ------------------------------------------------------------------
     2. RENDERIZADOR: INFORMAÇÕES PESSOAIS (PERSONAL INFO)
  ------------------------------------------------------------------ */
  function renderPersonalInfo(fullUser) {
    var main = document.querySelector('.WxnH6c');
    if (!main) return;

    var oldImage = main.querySelector('.QgNVwb'); if (oldImage) oldImage.remove();
    var oldText  = main.querySelector('.NR6PJd'); if (oldText)  oldText.remove();
    var oldBtn   = main.querySelector('.FBldD');  if (oldBtn)   oldBtn.remove();
    var oldWrap  = main.querySelector('.as-pi-wrap');      if (oldWrap)  oldWrap.remove();
    var oldWrap2 = main.querySelector('.as-pi-container'); if (oldWrap2) oldWrap2.remove();

    // ── Dados reais da conta ──────────────────────────────────────────
    var firstName  = fullUser.firstName || '';
    var lastName   = fullUser.lastName  || '';
    var name       = fullUser.name || (firstName + ' ' + lastName).trim() || 'Utilizador';
    var email      = fullUser.email || '';
    var username   = fullUser.username || (email ? email.split('@')[0] : '');
    var birthRaw   = fullUser.birthDate || '';
    var birth = birthRaw
      ? (function() {
          try { return new Date(birthRaw).toLocaleDateString('pt-PT', { day: 'numeric', month: 'long', year: 'numeric' }); }
          catch(e) { return birthRaw; }
        })()
      : null;
    var genderCode = fullUser.gender || '';
    var gender = fullUser.genderLabel
      || (genderCode === 'M' ? 'Masculino'
        : genderCode === 'F' ? 'Feminino'
        : genderCode === 'O' ? 'Personalizado'
        : 'Prefiro não divulgar');
    var genderDim = !genderCode || genderCode === 'N';

    var banking    = fullUser.banking || {};
    var hasBanking = Boolean(banking.hasBanking || (Array.isArray(fullUser.paymentCards) && fullUser.paymentCards.length > 0));
    var bankName   = banking.bankName || (Array.isArray(fullUser.paymentCards) && fullUser.paymentCards[0] ? fullUser.paymentCards[0].brand : null);
    var iban       = banking.iban || null;
    var balance    = typeof banking.balance === 'number' ? banking.balance : (parseFloat(banking.balance) || 0);
    var nif        = banking.nif || null;

    var card0      = (Array.isArray(fullUser.paymentCards) && fullUser.paymentCards[0]) || fullUser.paymentCard || null;
    var cardNum    = card0 ? (card0.cardNumberMasked || ('•••• •••• •••• ' + (card0.last4 || '????'))) : null;
    var cardHolder = card0 ? (card0.holder || name) : null;
    var cardExpiry = card0 ? (card0.expiry || null) : null;
    var cardBrand  = card0 ? (card0.brand || null) : null;
    var cardType   = card0 ? (card0.cardType || 'Débito') : null;

    var billing    = (card0 && card0.billingAddress) || null;
    var phone      = banking.phone || (billing && billing.phone) || null;
    var country    = (billing && billing.country) || 'Portugal';
    var city       = (billing && billing.city) || null;
    var postalCode = (billing && billing.postalCode) || null;
    var homeAddr   = billing
      ? [billing.address, billing.apartment, billing.postalCode, billing.city, billing.country].filter(Boolean).join(', ')
      : null;

    var createdAt = fullUser.createdAt
      ? new Date(fullUser.createdAt).toLocaleDateString('pt-PT', { day: 'numeric', month: 'long', year: 'numeric' })
      : null;
    var avatarInitial = name.charAt(0).toUpperCase();
    var avatarInner   = fullUser.picture
      ? `<img src="${escapeHtml(fullUser.picture)}" alt="${escapeHtml(name)}">`
      : `<span>${avatarInitial}</span>`;

    // ── Ícones SVG ───────────────────────────────────────────────────
    var CHV = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`;
    var I = {
      camera: `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`,
      person: `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
      tag:    `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>`,
      gender: `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="10" r="4"/><path d="M12 14v8M9 19h6"/></svg>`,
      email:  `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`,
      phone:  `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.1 11.9 19.79 19.79 0 0 1 1.03 3.27 2 2 0 0 1 3 1h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L7.09 8.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`,
      birth:  `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
      lang:   `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
      home:   `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
      pin:    `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`,
      card:   `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="3"/><line x1="2" y1="10" x2="22" y2="10"/></svg>`,
      bank:   `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="22" x2="21" y2="22"/><line x1="6" y1="18" x2="6" y2="11"/><line x1="10" y1="18" x2="10" y2="11"/><line x1="14" y1="18" x2="14" y2="11"/><line x1="18" y1="18" x2="18" y2="11"/><polygon points="12 2 2 7 22 7"/></svg>`,
      iban:   `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10h16M4 14h16M7 6v12M17 6v12"/></svg>`,
      nif:    `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="7" y1="8" x2="17" y2="8"/><line x1="7" y1="12" x2="13" y2="12"/></svg>`,
      lock:   `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
      shield: `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
      clock:  `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
      wallet: `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/></svg>`
    };

    // ── Helpers de HTML ───────────────────────────────────────────────
    function iw(icon, color) {
      return `<div class="as-pi-icon-wrap ${color}">${icon}</div>`;
    }
    function row(iconHtml, label, valueHtml) {
      return `<div class="as-pi-row">${iconHtml}<div class="as-pi-body"><div class="as-pi-label">${escapeHtml(label)}</div><div class="as-pi-val">${valueHtml}</div></div></div>`;
    }
    function v(t)  { return `<span>${escapeHtml(t)}</span>`; }
    function vm(t) { return `<span class="as-pi-val-muted">${escapeHtml(t)}</span>`; }
    function vb(t) { return `<span class="as-pi-val-blue">${escapeHtml(t)}</span>`; }
    function vg(t) { return `<span class="as-pi-val-green">${escapeHtml(t)}</span>`; }
    function tag(text, cls) { return `<span class="as-pi-status-tag ${cls}">${text}</span>`; }
    function section(title, secIcon, rows) {
      return `<div class="as-pi-section"><div class="as-pi-section-header">${secIcon}<span class="as-pi-section-title">${escapeHtml(title)}</span></div>${rows}</div>`;
    }

    // ── Provider strip: show only the provider used for this session ──
    var providerKey = String(fullUser.provider || 'nai').trim().toLowerCase();
    var providerAliases = {
      email: 'nai',
      password: 'nai',
      local: 'nai',
      'linkedin.com': 'linkedin',
      'facebook.com': 'facebook',
      ms: 'microsoft',
      microsoftaccount: 'microsoft'
    };
    providerKey = providerAliases[providerKey] || providerKey;
    var providerCatalog = {
      nai: {
        label: 'Nai',
        mark: '<img src="../favicon%20icon/Log%C3%B3tipo%20circular%20NAI%20azul-ciano.png" alt="" aria-hidden="true">'
      },
      google: {
        label: 'Google',
        mark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.35 12.23c0-.72-.06-1.42-.18-2.09H12v3.96h5.24a4.48 4.48 0 0 1-1.94 2.94v2.45h3.15c1.84-1.69 2.9-4.18 2.9-7.26Z"/><path fill="#34A853" d="M12 21.67c2.63 0 4.84-.87 6.45-2.36l-3.15-2.45c-.87.58-1.98.93-3.3.93-2.54 0-4.69-1.72-5.46-4.03H3.28v2.53A9.74 9.74 0 0 0 12 21.67Z"/><path fill="#FBBC05" d="M6.54 13.76A5.86 5.86 0 0 1 6.23 12c0-.61.11-1.2.31-1.76V7.71H3.28A9.74 9.74 0 0 0 2.25 12c0 1.57.38 3.05 1.03 4.29l3.26-2.53Z"/><path fill="#EA4335" d="M12 6.21c1.43 0 2.71.49 3.72 1.45l2.79-2.79C16.83 3.18 14.63 2.33 12 2.33a9.74 9.74 0 0 0-8.72 5.38l3.26 2.53C7.31 7.93 9.46 6.21 12 6.21Z"/></svg>'
      },
      microsoft: {
        label: 'Microsoft',
        mark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#f35325" d="M2 2h9.5v9.5H2z"/><path fill="#81bc06" d="M12.5 2H22v9.5h-9.5z"/><path fill="#05a6f0" d="M2 12.5h9.5V22H2z"/><path fill="#ffba08" d="M12.5 12.5H22V22h-9.5z"/></svg>'
      },
      linkedin: { label: 'LinkedIn', mark: '<strong>in</strong>' },
      facebook: { label: 'Facebook', mark: '<strong>f</strong>' }
    };
    var provider = providerCatalog[providerKey] || providerCatalog.nai;
    var providerMark = provider.mark;
    var providerStrip = `
      <div class="as-pi-signin">
        <div class="as-pi-signin-label">
          <span>Sessão iniciada com</span>
        </div>
        <div class="as-pi-provider-list">
          <span class="as-pi-provider-item is-active" title="${provider.label}" aria-label="${provider.label}">
            <span class="as-pi-provider-mark as-pi-provider-${providerKey}">${providerMark}</span>
            <span>${provider.label}</span>
          </span>
        </div>
      </div>`;

    // ── Render ────────────────────────────────────────────────────────
    var wrap = document.createElement('div');
    wrap.className = 'as-pi-wrap';
    wrap.innerHTML = `

      <!-- ═══ HERO CARD ═══ -->
      <div class="as-pi-hero">
        <div class="as-pi-hero-avatar">
          ${avatarInner}
          <div class="as-pi-hero-avatar-edit" title="Alterar foto de perfil">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </div>
        </div>
        <div class="as-pi-hero-info">
          <div class="as-pi-hero-name">${escapeHtml(name)}</div>
          <div class="as-pi-hero-username">@${escapeHtml(username)}</div>
          <div class="as-pi-hero-email">${escapeHtml(email)}</div>
          ${providerStrip}
        </div>
      </div>

      <div class="as-pi-details">
      <!-- ═══ SECÇÃO 1: IDENTIDADE ═══ -->
      ${section('Identidade', iw(I.person, 'as-pi-icon-blue'), [
        row(iw(I.camera,  'as-pi-icon-purple'), 'Imagem do perfil',
            `<span class="as-pi-inline-avatar">${avatarInner}</span>`),
        row(iw(I.person,  'as-pi-icon-blue'),   'Nome completo', v(name)),
        firstName ? row(iw(I.tag, 'as-pi-icon-teal'), 'Primeiro nome', v(firstName)) : '',
        lastName  ? row(iw(I.tag, 'as-pi-icon-teal'), 'Apelido',       v(lastName))  : '',
        username  ? row(iw(I.tag, 'as-pi-icon-grey'), 'Nome de utilizador', vb('@' + username)) : '',
        row(iw(I.gender,  'as-pi-icon-pink'),   'Género',
            genderDim ? vm(gender) : v(gender))
      ].join(''))}

      <!-- ═══ SECÇÃO 2: CONTACTO & ACESSO ═══ -->
      ${section('Contacto & Acesso', iw(I.email, 'as-pi-icon-green'), [
        row(iw(I.email, 'as-pi-icon-green'), 'E-mail oficial', vb(email)),
        row(iw(I.phone, 'as-pi-icon-teal'), 'Telemóvel',
            phone ? v(phone) : vm('Não definido')),
        row(iw(I.lang,  'as-pi-icon-blue'), 'Idioma', v('Português (Portugal)')),
        row(iw(I.pin,   'as-pi-icon-orange'), 'País / Região',
            v(country + (city ? ' · ' + city : '')))
      ].join(''))}

      <!-- ═══ SECÇÃO 3: DADOS PESSOAIS ═══ -->
      ${section('Dados Pessoais', iw(I.birth, 'as-pi-icon-orange'), [
        row(iw(I.birth, 'as-pi-icon-orange'), 'Data de nascimento',
            birth ? v(birth) : vm('Não especificada')),
        row(iw(I.home,  'as-pi-icon-teal'),   'Endereço de casa',
            homeAddr ? v(homeAddr) : vm('Não definido')),
        postalCode ? row(iw(I.pin, 'as-pi-icon-grey'), 'Código postal', v(postalCode)) : ''
      ].join(''))}

      <!-- ═══ SECÇÃO 4: CARTEIRA & SEGURANÇA ═══ -->
      ${section('Carteira & Segurança', iw(I.wallet, 'as-pi-icon-orange'), [
        row(iw(I.card,   'as-pi-icon-orange'), 'Cartão de pagamento',
            hasBanking && cardNum
              ? `${v(cardNum + (cardType ? ' · ' + cardType : ''))}&ensp;${tag('● Ativo', 'as-pi-status-ok')}`
              : `${vm('Sem cartão')}&ensp;${tag('Não configurado', 'as-pi-status-none')}`),
        cardHolder ? row(iw(I.person, 'as-pi-icon-grey'), 'Titular do cartão', v(cardHolder)) : '',
        cardExpiry ? row(iw(I.birth,  'as-pi-icon-grey'), 'Validade do cartão', v(cardExpiry)) : '',
        cardBrand  ? row(iw(I.tag,    'as-pi-icon-grey'), 'Emitente / Bandeira', v(cardBrand)) : '',
        bankName   ? row(iw(I.bank,   'as-pi-icon-blue'), 'Banco associado', v(bankName)) : '',
        iban       ? row(iw(I.iban,   'as-pi-icon-grey'), 'IBAN',
            `<span style="font-family:monospace;font-size:13px;">${escapeHtml(iban)}</span>`) : '',
        balance > 0 ? row(iw(I.wallet,'as-pi-icon-green'),'Saldo da carteira',
            vg(new Intl.NumberFormat('pt-PT',{style:'currency',currency:'EUR'}).format(balance))) : '',
        nif ? row(iw(I.nif,    'as-pi-icon-grey'), 'NIF / Contribuinte', v(nif)) : '',
        row(iw(I.shield, 'as-pi-icon-green'), 'Estado da conta',
            `${vg('Conta segura & encriptada')}&ensp;${tag('SHA-256 + Salt', 'as-pi-status-ok')}`),
        row(iw(I.lock,   'as-pi-icon-pink'),  'Palavra-passe',
            `${v('••••••••••••')}${createdAt ? `&ensp;<span class="as-pi-val-muted" style="font-size:12px;">Criada ${escapeHtml(createdAt)}</span>` : ''}`),
        createdAt ? row(iw(I.clock, 'as-pi-icon-grey'), 'Membro desde', v(createdAt)) : ''
      ].join(''))}
      </div>
    `;

    main.appendChild(wrap);
  }

  /* ------------------------------------------------------------------
     3. RENDERIZADOR: APPS ASSOCIADAS & SEGURANÇA (SECURITY)
  ------------------------------------------------------------------ */
  function renderSecurityAndConnectedApps(fullUser) {
    var main = document.querySelector('.WxnH6c');
    if (!main) return;

    var oldImage = main.querySelector('.QgNVwb');
    if (oldImage) oldImage.remove();
    var oldText = main.querySelector('.NR6PJd');
    if (oldText) oldText.remove();
    var oldBtn = main.querySelector('.FBldD');
    if (oldBtn) oldBtn.remove();

    var apps = fullUser.authorizedApps || [];

    // Se ainda não existirem apps autorizadas, adiciona exemplos para teste
    if (apps.length === 0) {
      apps = [
        {
          clientId: 'app_sso_test',
          appName: 'SSO Test App',
          authorizedAt: new Date(Date.now() - 3600000 * 24).toISOString(),
          scopes: ['profile', 'email'],
          permissions: { readProfile: true, readEmail: true, readBanking: false, readTransactions: false }
        },
        {
          clientId: 'app_fintech_gestao',
          appName: 'App de Gestão Financeira',
          authorizedAt: new Date(Date.now() - 3600000 * 4).toISOString(),
          scopes: ['profile', 'email', 'banking'],
          permissions: { readProfile: true, readEmail: true, readBanking: true, readTransactions: true }
        }
      ];
      fullUser.authorizedApps = apps;
      saveFullUserData(fullUser);
    }

    var container = document.createElement('div');
    container.style.marginTop = '24px';
    container.innerHTML = `
      <div style="background: #ffffff; border: 1px solid #dadce0; border-radius: 16px; padding: 22px; max-width: 900px; box-shadow: 0 1px 3px rgba(60,64,67,0.06);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <h2 style="font-size: 18px; font-weight: 700; color: #1f1f1f; margin: 0;">Aplicações com Acesso à Sua Conta (${apps.length})</h2>
          <a href="../sso-test.html" target="_blank" class="as-btn-outline" style="text-decoration: none;">Testar Novo Login SSO</a>
        </div>
        <p style="font-size: 13px; color: #5f6368; margin-bottom: 20px;">
          Estas aplicações externas têm autorização para ler dados da sua conta Nai. Pode rever, modificar permissões individuais ou remover o acesso a qualquer momento:
        </p>
        <div class="as-apps-list" id="asAppsContainer"></div>
      </div>
    `;

    main.appendChild(container);

    var listEl = container.querySelector('#asAppsContainer');

    apps.forEach(function(app, index) {
      var appEl = document.createElement('div');
      appEl.className = 'as-app-card';
      var formattedDate = app.authorizedAt ? new Date(app.authorizedAt).toLocaleString('pt-PT') : 'Ativo';
      var scopes = app.scopes || ['profile', 'email'];
      var perms = app.permissions || {
        readProfile: true,
        readEmail: true,
        readBanking: scopes.includes('banking'),
        readTransactions: scopes.includes('banking')
      };

      appEl.innerHTML = `
        <div class="as-app-header">
          <div class="as-app-info-group">
            <div class="as-app-logo">
              ${app.appLogo ? `<img src="${app.appLogo}" alt="${app.appName}">` : app.appName.charAt(0).toUpperCase()}
            </div>
            <div>
              <div class="as-app-title">${app.appName}</div>
              <div class="as-app-meta">Autorizado em ${formattedDate} · ID: <code>${app.clientId || 'ext_app'}</code></div>
            </div>
          </div>
          <div style="display: flex; gap: 8px; align-items: center;">
            <button type="button" class="as-btn-outline btn-toggle-perms" data-idx="${index}">Gerir Permissões</button>
            <button type="button" class="as-btn-danger btn-revoke-app" data-idx="${index}">Remover Acesso</button>
          </div>
        </div>

        <div class="as-scopes-tags">
          <span class="as-scope-tag">✓ Perfil (Nome & Foto)</span>
          <span class="as-scope-tag">✓ E-mail @nai.com</span>
          ${scopes.includes('banking') ? '<span class="as-scope-tag as-scope-banking">💳 Dados Bancários & Saldo</span>' : ''}
          ${scopes.includes('banking') ? '<span class="as-scope-tag as-scope-banking">📊 Histórico de Transações</span>' : ''}
        </div>

        <!-- Painel Expansível de Permissões Granulares -->
        <div class="as-permissions-panel" id="permPanel_${index}" style="display: none;">
          <h4 style="font-size: 13px; font-weight: 700; color: #202124; margin-bottom: 10px;">Modificar Permissões de Leitura:</h4>
          <div class="as-perm-item">
            <span>Ler Nome e Foto de Perfil</span>
            <label class="as-switch-toggle">
              <input type="checkbox" class="perm-chk-profile" ${perms.readProfile ? 'checked' : ''}>
              <span class="as-switch-slider"></span>
            </label>
          </div>
          <div class="as-perm-item">
            <span>Ler Endereço de E-mail Oficial (@nai.com)</span>
            <label class="as-switch-toggle">
              <input type="checkbox" class="perm-chk-email" ${perms.readEmail ? 'checked' : ''}>
              <span class="as-switch-slider"></span>
            </label>
          </div>
          <div class="as-perm-item">
            <span>Aceder aos Dados Bancários, Banco e Saldo em Conta</span>
            <label class="as-switch-toggle">
              <input type="checkbox" class="perm-chk-banking" ${perms.readBanking ? 'checked' : ''}>
              <span class="as-switch-slider"></span>
            </label>
          </div>
          <div class="as-perm-item">
            <span>Aceder ao Histórico de Transações da Carteira</span>
            <label class="as-switch-toggle">
              <input type="checkbox" class="perm-chk-transactions" ${perms.readTransactions ? 'checked' : ''}>
              <span class="as-switch-slider"></span>
            </label>
          </div>
          <div style="margin-top: 12px; text-align: right;">
            <button type="button" class="as-btn-action btn-save-perms" data-idx="${index}" style="padding: 4px 14px; font-size: 12px;">Guardar Alterações</button>
          </div>
        </div>
      `;

      listEl.appendChild(appEl);
    });

    // Eventos de Gerir Permissões e Revogar
    listEl.querySelectorAll('.btn-toggle-perms').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var idx = btn.getAttribute('data-idx');
        var panel = document.getElementById('permPanel_' + idx);
        if (panel) {
          panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        }
      });
    });

    listEl.querySelectorAll('.btn-save-perms').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var idx = parseInt(btn.getAttribute('data-idx'), 10);
        var panel = document.getElementById('permPanel_' + idx);
        if (panel && apps[idx]) {
          var pProf = panel.querySelector('.perm-chk-profile').checked;
          var pEmail = panel.querySelector('.perm-chk-email').checked;
          var pBank = panel.querySelector('.perm-chk-banking').checked;
          var pTrans = panel.querySelector('.perm-chk-transactions').checked;

          apps[idx].permissions = {
            readProfile: pProf,
            readEmail: pEmail,
            readBanking: pBank,
            readTransactions: pTrans
          };

          fullUser.authorizedApps = apps;
          saveFullUserData(fullUser);
          btn.textContent = 'Guardado!';
          setTimeout(function() { btn.textContent = 'Guardar Alterações'; }, 1500);
        }
      });
    });

    listEl.querySelectorAll('.btn-revoke-app').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var idx = parseInt(btn.getAttribute('data-idx'), 10);
        var appName = apps[idx] ? apps[idx].appName : 'esta aplicação';
        if (confirm(`Tem a certeza que deseja revogar o acesso de "${appName}" à sua conta?`)) {
          apps.splice(idx, 1);
          fullUser.authorizedApps = apps;
          saveFullUserData(fullUser);
          window.location.reload();
        }
      });
    });
  }

  function applyAccountToPage() {
    /* 1. Cabeçalho: o link da conta no topo (o HTML traz "Iniciar sessão") */
    var headerAccount = document.querySelector('#gb a[aria-label="Iniciar sessão"]');
    if (headerAccount) {
      headerAccount.classList.add('as-header-account');
      headerAccount.setAttribute('href', '#');
      headerAccount.removeAttribute('target');
      headerAccount.setAttribute('title', (user.name || '') + ' · ' + (user.email || ''));
      headerAccount.setAttribute('aria-label', 'Conta: ' + (user.name || ''));
      headerAccount.textContent = '';
      headerAccount.appendChild(buildAvatar(32));

      var nameEl = document.createElement('span');
      nameEl.className = 'gb_ne';
      nameEl.textContent = firstName();
      headerAccount.appendChild(nameEl);

      headerAccount.addEventListener('click', function (e) { e.preventDefault(); });
    }

    /* 2. Botão principal: fica "Terminar sessão" */
    var mainButton = document.querySelector('div.UywwFc-LgbsSe');
    if (mainButton) {
      var label = mainButton.querySelector('.UywwFc-vQzf8d');
      if (label) label.textContent = 'Terminar sessão';
      mainButton.style.cursor = 'pointer';
      mainButton.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        signOut();
      });
    }

    /* 3. Renderização Dinâmica dos Dados das Abas */
    var fullUser = getFullUserData();
    var path = window.location.pathname.toLowerCase();

    if (path.indexOf('payments-and-subscriptions') >= 0) {
      renderPaymentsAndSubscriptions(fullUser);
    } else if (path.indexOf('personal-info') >= 0) {
      renderPersonalInfo(fullUser);
    } else if (path.indexOf('security') >= 0) {
      renderSecurityAndConnectedApps(fullUser);
    }

    /* 4. Texto de introdução */
    var intro = document.querySelector('p.uhs5md');
    if (intro) {
      intro.textContent = intro.textContent.replace(
        'tem de iniciar sessão na sua conta',
        'a sua sessão está iniciada como ' + (user.name || user.email) +
          ' (' + (user.email || '') + ')'
      );
    }

    /* 4. Rede de segurança: nenhum link pode mandar o utilizador para a Nai.
          A Home (guardada com sessão aberta) traz o "Sair" de contas.google.com;
          o comportamento passa a ser o sign out local. */
    var external = document.querySelectorAll(
      'a[href*="ServiceLogin"], a[href*="accounts.google.com/Logout"], ' +
      'a[href*="accounts.google.com/SignOutOptions"]');
    for (var i = 0; i < external.length; i++) {
      (function (a) {
        a.addEventListener('click', function (e) {
          e.preventDefault();
          signOut();
        });
      })(external[i]);
    }

    /* 5. Página Home (intro/index.html)
       A página foi guardada com a sessão de outra conta Nai aberta, por isso
       traz o nome, o e-mail e a foto dessa conta no título e nos menus do
       cabeçalho. Aqui passa a mostrar a conta local: */
    applyHomeAccount();

    /* 5b. Home: a barra de pesquisa sobe do centro para o cabeçalho, junto do
       título e dos 3 ícones, deixando o centro só com o perfil. */
    moveSearchToHeader();

    /* 6. Home: centra a grande estrela ✦ por trás das informações da
       página (nome e e-mail). */
    positionHomeStar();
    window.addEventListener('resize', positionHomeStar);
    window.addEventListener('load', positionHomeStar);
    setTimeout(function () { moveSearchToHeader(); positionHomeStar(); }, 400);
    setTimeout(function () { moveSearchToHeader(); positionHomeStar(); }, 1200);

    /* 6b. Home: prepara o cartão publicitário da Neuria (fecho + CTA). */
    var neuriaAd = document.getElementById('neuriaAd');
    if (neuriaAd) {
      var neuriaClose = neuriaAd.querySelector('.neuria-ad__close');
      if (neuriaClose) {
        neuriaClose.addEventListener('click', function () {
          neuriaAd.hidden = true;
          neuriaAd.classList.remove('is-visible');
        });
      }
      var neuriaCta = neuriaAd.querySelector('[data-neuria-cta]');
      if (neuriaCta && neuriaCta.getAttribute('href') === '#') {
        /* ainda sem link real: evita saltar para o topo ao clicar. */
        neuriaCta.addEventListener('click', function (e) { e.preventDefault(); });
      }
    }
  }

  function applyHomeAccount() {
    var homeTitle = document.querySelector('h1.dnIVJb');
    if (!homeTitle) return;                       // só na Home

    var oldName = homeTitle.textContent.trim();
    /* O bloco pode ter mais do que uma linha .aZb0Yd (nome repetido + e-mail).
       O e-mail é a que contém "@". */
    var emailEl = null;
    var emailCands = document.querySelectorAll('.kYZvBb .aZb0Yd');
    for (var c = 0; c < emailCands.length; c++) {
      if (emailCands[c].textContent.indexOf('@') >= 0) { emailEl = emailCands[c]; break; }
    }
    var oldEmail = emailEl ? emailEl.textContent.trim() : '';
    var newName = (user.name || user.email || '').trim();
    var newEmail = (user.email || '').trim();

    function swap(str) {
      if (oldName) str = str.split(oldName).join(newName);
      if (oldEmail) str = str.split(oldEmail).join(newEmail);
      return str;
    }

    // texto (título, menus do cabeçalho, cartões)
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    var t, nodes = [];
    while ((t = walker.nextNode())) nodes.push(t);
    nodes.forEach(function (n) { n.nodeValue = swap(n.nodeValue); });

    // atributos visíveis (aria-label da conta no cabeçalho, etc.)
    var els = document.querySelectorAll('[aria-label],[title],[alt]');
    for (var i = 0; i < els.length; i++) {
      ['aria-label', 'title', 'alt'].forEach(function (a) {
        var v = els[i].getAttribute(a);
        if (v) els[i].setAttribute(a, swap(v));
      });
    }

    // fotos da conta guardada -> avatar local (círculo com a inicial)
    var photos = document.querySelectorAll('img[src*="googleusercontent"]');
    for (var k = 0; k < photos.length; k++) {
      var img = photos[k];
      var size = parseInt(img.getAttribute('width'), 10) ||
        Math.round(img.getBoundingClientRect().width) || 32;
      img.src = avatarDataUri(size);
      if (img.srcset) img.removeAttribute('srcset');
      img.alt = newName;
    }
  }

  /* Home: a barra de pesquisa (.AT4vnd) já vem no cabeçalho, movida estaticamente
     no próprio index.html (junto do título e dos 3 ícones), por isso aparece no
     topo desde o primeiro instante — sem o "salto" do meio para cima.
     Esta função fica só como rede de segurança: se a página voltar a colocar a
     barra no centro (ex.: re-render), volta a subi-la para o cabeçalho. */
  function moveSearchToHeader() {
    var search = null;
    var list = document.querySelectorAll('.AT4vnd');
    for (var i = 0; i < list.length; i++) {
      var r = list[i].getBoundingClientRect();
      if (r.width > 0 && r.height > 0) { search = list[i]; break; }  // ignora variantes escondidas
    }
    if (!search) return;
    var help = document.querySelector('#gb .gb_v.gb_Ce');            // botão "Ajuda"
    var group = help ? help.parentElement
                     : document.querySelector('#gb .gb_4d.gb_ce');  // faixa do meio do cabeçalho
    if (!group || group.contains(search)) return;                    // já lá está
    group.insertBefore(search, help || null);
    search.classList.add('in-header');
    document.body.classList.add('as-search-up');
  }

  /* Home: centra a estrela ✦ na área das informações (nome + e-mail) e no
     avatar (o "D" do ícone da conta), para as "contornar". Só actua se
     .home-star existir (apenas no index.html). Na primeira vez que a centra,
     também cria os pontinhos da estrela. */
  function positionHomeStar() {
    var star = document.querySelector('.home-star');
    if (!star) return;
    var els = document.querySelectorAll('h1.dnIVJb, .aZb0Yd, .BDdT4');
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, found = false;
    for (var i = 0; i < els.length; i++) {
      var r = els[i].getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;   // ignora as variantes escondidas
      found = true;
      if (r.left < minX) minX = r.left;
      if (r.top < minY) minY = r.top;
      if (r.right > maxX) maxX = r.right;
      if (r.bottom > maxY) maxY = r.bottom;
    }
    if (!found) return;
    var cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    star.style.left = cx + 'px';
    star.style.top = cy + 'px';
    star.__hsCx = cx;                    // centro (para o teste do rato)
    star.__hsCy = cy;
    buildHomeStar(star, cx, cy);
  }

  /* Home: gera a forma da estrela ✦ (só pontinhos brancos: contorno em 2 anéis,
     interior pouco denso e as 4 pontas) e transforma cada pontinho num <div>.
     Cada um arranca num canto do ecrã (--dx/--dy) e desliza devagar até ao seu
     lugar. A forma é idêntica à versão anterior em SVG (mesma semente). */
  function buildHomeStar(star, cx, cy) {
    if (star.getAttribute('data-hs-built')) return;
    star.setAttribute('data-hs-built', '1');

    var dots = homeStarDots();
    var size = star.offsetWidth || 700;
    var S = size / 1200;                       // 1200 (espaço da forma) -> px
    var vw = window.innerWidth, vh = window.innerHeight;
    var margin = 90;                           // começa um pouco fora do ecrã
    var tlX = cx - size / 2, tlY = cy - size / 2;
    var layers = [document.createElement('div'),
                  document.createElement('div'),
                  document.createElement('div')];
    for (var l = 0; l < 3; l++) {
      layers[l].className = 'hs-layer';
      star.appendChild(layers[l]);
    }

    /* RNG próprio para a explosão (não interfere com a forma da estrela). */
    var seed = 20260110;
    function rnd() { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; }

    var maxDc = 1;                             // maior distância ao centro
    for (var m = 0; m < dots.length; m++) {
      var dcm = Math.sqrt(Math.pow(dots[m][0] - 600, 2) + Math.pow(dots[m][1] - 600, 2));
      if (dcm > maxDc) maxDc = dcm;
    }

    var maxEnd = 0;                            // fim do último voo de entrada
    for (var i = 0; i < dots.length; i++) {
      var d = dots[i];
      var rpx = Math.max(d[2] * S, 0.75);
      var el = document.createElement('div');
      el.className = 'hs-dot';
      el.style.left = (d[0] * S - rpx) + 'px';
      el.style.top = (d[1] * S - rpx) + 'px';
      el.style.width = (rpx * 2) + 'px';
      el.style.height = (rpx * 2) + 'px';
      el.style.setProperty('--op', d[3]);

      /* canto de origem = quadrante do pontinho; o vetor (--dx/--dy) leva-o
         da posição final até esse canto (fora do ecrã). */
      var fcx = tlX + d[0] * S;                // posição final (centro), em página
      var fcy = tlY + d[1] * S;
      var cornerX = d[0] < 600 ? -margin : vw + margin;
      var cornerY = d[1] < 600 ? -margin : vh + margin;
      el.style.setProperty('--dx', (cornerX - fcx).toFixed(1) + 'px');
      el.style.setProperty('--dy', (cornerY - fcy).toFixed(1) + 'px');

      /* voo devagar, escalonado: os pontinhos partem em ondas (atrasos
         espalhados) para não estarem todos a voar ao mesmo tempo. */
      var delay = ((i * 71) % 23) / 23 * 2.0;
      var dur = 1.7 + ((i * 53) % 7) / 7 * 0.6;
      el.style.setProperty('--hs-delay', delay.toFixed(2) + 's');
      el.style.setProperty('--hs-dur', dur.toFixed(2) + 's');
      if (delay + dur > maxEnd) maxEnd = delay + dur;

      /* pulso em onda: o atraso cresce com a distância ao centro, por isso a
         onda viaja do centro para as pontas. */
      var dc = Math.sqrt(Math.pow(d[0] - 600, 2) + Math.pow(d[1] - 600, 2));
      el.style.setProperty('--hs-pulse-delay', (dc / maxDc * 1.2).toFixed(2) + 's');

      /* explosão: cada pontinho é lançado para fora numa direção aleatória, a
         uma distância grande (espalha-se por todo o ecrã) + atraso/duração
         variáveis para irem desaparecendo pouco a pouco. */
      var ang = rnd() * Math.PI * 2;
      var dist = (0.3 + rnd() * 0.7) * Math.max(vw, vh);
      el.style.setProperty('--ex', (Math.cos(ang) * dist).toFixed(1) + 'px');
      el.style.setProperty('--ey', (Math.sin(ang) * dist).toFixed(1) + 'px');
      el.style.setProperty('--hs-explode-delay', (rnd() * 0.7).toFixed(2) + 's');
      el.style.setProperty('--hs-explode-dur', (0.9 + rnd() * 0.6).toFixed(2) + 's');

      layers[i % 3].appendChild(el);
    }

    /* Quando o último pontinho chega, a estrela passa a "formada": começa o
       pulso em onda e liga-se a explosão ao rato. */
    setTimeout(function () {
      star.classList.add('is-formed');
      bindStarHover(star);
    }, Math.ceil(maxEnd * 1000) + 120);
  }

  /* Home: a estrela ✦ explode quando o rato passa por cima dela (a sua
     forma/pontos) — sem clicar — e também sozinha ao fim de
     HS_AUTO_EXPLODE_MS, mesmo que o rato nunca lá vá. Ao explodir, os
     pontinhos espalham-se pelo ecrã e vão desaparecendo, e a estrela NÃO volta
     a formar-se. O acerto é geométrico (sobre a super-elipse da estrela), por
     isso não bloqueia cliques nos elementos que ela cobre. */
  function bindStarHover(star) {
    if (star.getAttribute('data-hs-hover')) return;
    star.setAttribute('data-hs-hover', '1');
    var A = (star.offsetWidth || 700) * 0.5;   // meia-extensão até às pontas
    var P = 0.62;                              // mesma "gordura" da super-elipse
    function overStar(x, y) {
      var dx = Math.abs(x - (star.__hsCx || 0)) / A;
      var dy = Math.abs(y - (star.__hsCy || 0)) / A;
      return Math.pow(dx, P) + Math.pow(dy, P) <= 1;
    }
    function explode() {
      if (star.classList.contains('is-exploding')) return;   // só explode uma vez
      window.removeEventListener('mousemove', onMove);
      star.classList.add('is-exploding');
      showNeuriaAd();                                        // publicidade no canto inferior direito
      /* quando a explosão termina, esconde os pontinhos (já invisíveis) para
         poupar CPU — a estrela não volta. */
      setTimeout(function () { star.classList.add('is-gone'); }, 3200);
    }
    function onMove(e) {
      if (overStar(e.clientX, e.clientY)) explode();
    }
    window.addEventListener('mousemove', onMove, { passive: true });
    /* mesmo que o rato nunca vá lá, a estrela explode sozinha ao fim deste tempo. */
    setTimeout(explode, HS_AUTO_EXPLODE_MS);
  }

  /* Home: mostra o cartão publicitário da Neuria (canto inferior direito)
     quando a estrela explode. Começa com [hidden] para não aparecer antes. */
  function showNeuriaAd() {
    var ad = document.getElementById('neuriaAd');
    if (!ad || ad.classList.contains('is-visible')) return;
    ad.hidden = false;
    void ad.offsetWidth;                 // força reflow para a transição arrancar
    ad.classList.add('is-visible');
  }

  /* Home: coordenadas dos pontinhos da estrela (espaço 1200x1200, centrado em
     600,600). Mesma semente/forma da versão SVG anterior. */
  function homeStarDots() {
    var seed = 20260109;
    function rnd() { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; }
    var SIZE = 1200, C = SIZE / 2, R = 560, P = 0.62;
    function rb(phi) {
      var u = Math.abs(Math.cos(phi)), v = Math.abs(Math.sin(phi));
      return R * Math.pow(Math.pow(u, P) + Math.pow(v, P), -1 / P);
    }
    function inside(x, y) {
      var X = Math.abs(x - C) / R, Y = Math.abs(y - C) / R;
      return Math.pow(X, P) + Math.pow(Y, P) <= 1;
    }
    var dots = [];
    function add(x, y, r, op) { dots.push([x, y, r, op]); }

    var K = 170;                               // contorno (2 anéis)
    for (var ring = 0; ring < 2; ring++) {
      for (var i = 0; i < K; i++) {
        var phi = (i + ring * 0.5) / K * Math.PI * 2;
        var rr = rb(phi) * (ring === 0 ? 1 : 0.9);
        add(C + Math.cos(phi) * rr, C + Math.sin(phi) * rr,
            2 + rnd() * 1.6, 0.75 + rnd() * 0.25);
      }
    }
    var placed = 0, tries = 0;                 // interior (pouco denso)
    while (placed < 150 && tries < 40000) {
      tries++;
      var x = C + (rnd() * 2 - 1) * R;
      var y = C + (rnd() * 2 - 1) * R;
      if (!inside(x, y)) continue;
      add(x, y, 1.6 + rnd() * 1.4, 0.55 + rnd() * 0.45);
      placed++;
    }
    [[0, 1], [0, -1], [1, 0], [-1, 0]].forEach(function (d) {   // as 4 pontas
      add(C + d[0] * R * 0.93, C + d[1] * R * 0.93, 3.6, 1);
      add(C + d[0] * R * 0.80, C + d[1] * R * 0.80, 2.8, 0.95);
    });
    return dots;
  }

  /* Avatar local como data-URI (mantém o mesmo elemento/imagem do original) */
  function avatarDataUri(size) {
    var s = size || 32;
    var seed = user.email || user.name || 'u';
    var sum = 0;
    for (var i = 0; i < seed.length; i++) sum += seed.charCodeAt(i);
    var color = AVATAR_COLORS[sum % AVATAR_COLORS.length];
    var ch = encodeURIComponent(firstName().charAt(0).toUpperCase());
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="' + s + '" height="' + s +
      '" viewBox="0 0 ' + s + ' ' + s + '">' +
      '<circle cx="' + (s / 2) + '" cy="' + (s / 2) + '" r="' + (s / 2) + '" fill="' + color + '"/>' +
      '<text x="50%" y="50%" dy=".35em" text-anchor="middle" fill="#fff" ' +
      'font-family="Roboto,Arial,sans-serif" font-size="' + Math.round(s * 0.45) +
      '" font-weight="500">' + ch + '</text></svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyAccountToPage);
  } else {
    applyAccountToPage();
  }
})();
