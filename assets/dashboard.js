/**
 * Account Services — Dashboard (pasta intro/)
 * ============================================================================
 * 1. Proteção: sem sessão válida não se abre o dashboard -> volta ao login.
 * 2. Conta: mostra o utilizador autenticado (foto/inicial + nome) no
 *    cabeçalho e o botão principal passa a indicar "Terminar sessão".
 * 3. Home (intro/index.html): a página guardada traz o nome, o e-mail e a foto
 *    da conta Google com que foi aberta — passam a ser os da conta local.
 *
 * A sessão é a mesma que o auth.html grava no localStorage (chave abaixo),
 * por isso o login/criação de conta feitos no site abrem o dashboard.
 * ============================================================================
 */
(function () {
  'use strict';

  var SESSION_KEY = 'as_sso_session';   // chave gravada pelo script.js (auth.html)
  var LOGIN_PAGE = '../auth.html';      // página de login/criação de conta

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
      // cor fixa por conta, como na Google
      var seed = (user.email || user.name || 'u');
      var sum = 0;
      for (var i = 0; i < seed.length; i++) sum += seed.charCodeAt(i);
      el.style.background = AVATAR_COLORS[sum % AVATAR_COLORS.length];
      el.textContent = firstName().charAt(0).toUpperCase();
    }
    return el;
  }

  function applyAccountToPage() {
    /* 1. Cabeçalho: o link da conta no topo (o HTML traz "Iniciar sessão")
          passa a ser a conta aberta (foto + nome) */
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

    /* 2. Botão principal: fica "Terminar sessão" (com sessão aberta é ele
          que aparece) e termina a sessão ao clicar */
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

    /* 3. Texto de introdução: o marcador comum aos 5 intros
          ("… tem de iniciar sessão na sua conta") passa a mostrar a conta
          que está aberta. Cada página tem o marcador uma única vez. */
    var intro = document.querySelector('p.uhs5md');
    if (intro) {
      intro.textContent = intro.textContent.replace(
        'tem de iniciar sessão na sua conta',
        'a sua sessão está iniciada como ' + (user.name || user.email) +
          ' (' + (user.email || '') + ')'
      );
    }

    /* 4. Rede de segurança: nenhum link pode mandar o utilizador para a Google.
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
       A página foi guardada com a sessão de outra conta Google aberta, por isso
       traz o nome, o e-mail e a foto dessa conta no título e nos menus do
       cabeçalho. Aqui passa a mostrar a conta local: */
    applyHomeAccount();
  }

  function applyHomeAccount() {
    var homeTitle = document.querySelector('h1.dnIVJb');
    if (!homeTitle) return;                       // só na Home

    var oldName = homeTitle.textContent.trim();
    var emailEl = document.querySelector('.kYZvBb .aZb0Yd');
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
