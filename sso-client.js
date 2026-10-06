/**
 * Account Services — SSO Client Library
 * ======================================
 * Inclui este ficheiro no teu site para ligar ao sistema SSO do Account Services.
 *
 * Uso básico:
 *   <script src="https://devilwolfpt.github.io/Account-Services/sso-client.js"></script>
 *   <script>
 *     AccountServicesSSO.init({
 *       appName: 'O Meu Site',
 *       appLogo: 'https://meusite.com/logo.png',   // opcional
 *       onLogin: function(user) {
 *         console.log('Utilizador autenticado:', user);
 *       },
 *       onLogout: function() {
 *         console.log('Sessão terminada');
 *       }
 *     });
 *   </script>
 */

(function (global) {
  'use strict';

  const SSO_ORIGIN = 'https://devilwolfpt.github.io/Account-Services/';
  const SESSION_KEY   = 'as_sso_session_cache';
  const TOKEN_VERSION = 1;

  /* -----------------------------------------------------------------------
     Utilitários de token
  ----------------------------------------------------------------------- */

  function decodeToken(token) {
    try {
      const payload = JSON.parse(decodeURIComponent(escape(atob(token))));
      if (!payload || payload.v !== TOKEN_VERSION) return null;
      if (Date.now() > payload.exp) return null;
      return payload;
    } catch {
      return null;
    }
  }

  function saveLocalSession(token, payload) {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ token, payload }));
    } catch {}
  }

  function loadLocalSession() {
    try {
      const stored = JSON.parse(localStorage.getItem(SESSION_KEY));
      if (!stored) return null;
      const payload = decodeToken(stored.token);
      if (!payload) { localStorage.removeItem(SESSION_KEY); return null; }
      return { token: stored.token, user: payload };
    } catch {
      return null;
    }
  }

  function clearLocalSession() {
    try { localStorage.removeItem(SESSION_KEY); } catch {}
  }

  /* -----------------------------------------------------------------------
     Leitura de parâmetros SSO do URL (após redirect de volta)
  ----------------------------------------------------------------------- */

  function readSSOFromURL() {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('sso_token');
    if (!token) return null;

    const payload = decodeToken(token);
    if (!payload) return null;

    // Guarda localmente e limpa o URL
    saveLocalSession(token, payload);
    const cleanUrl = window.location.href
      .replace(/([?&])sso_token=[^&]*/g, '$1')
      .replace(/([?&])sso_(name|email|provider|picture)=[^&]*/g, '$1')
      .replace(/[?&]$/, '')
      .replace(/\?&/, '?');
    window.history.replaceState({}, document.title, cleanUrl);

    return { token, user: payload };
  }

  /* -----------------------------------------------------------------------
     API pública
  ----------------------------------------------------------------------- */

  const AccountServicesSSO = {

    /**
     * Inicializa o SSO. Verifica se há sessão activa, token no URL ou escuta popup.
     * @param {object} options
     * @param {string}   options.appName   - Nome da tua app (mostrado no ecrã de autorização)
     * @param {string}   [options.appLogo] - URL do logo da tua app
     * @param {string}   [options.mode='popup'] - 'popup' (abre janela flutuante estilo Google) ou 'redirect'
     * @param {function} [options.onLogin]  - Chamado com o objecto `user` após login
     * @param {function} [options.onLogout] - Chamado após logout
     * @param {boolean}  [options.autoRedirect=false] - Se true, abre login imediatamente se não houver sessão
     */
    init: function (options = {}) {
      this._options = Object.assign({
        mode: 'popup',
        autoRedirect: false
      }, options);

      const self = this;

      // 1. Escuta mensagens de login via Popup (estilo Google Identity / postMessage)
      if (!this._listenerRegistered) {
        window.addEventListener('message', function (event) {
          if (event.data && event.data.type === 'ACCOUNT_SERVICES_SSO_SUCCESS') {
            const token = event.data.token;
            const user  = event.data.user;
            saveLocalSession(token, user);
            if (typeof self._options.onLogin === 'function') {
              self._options.onLogin(user);
            }
          }
        });
        this._listenerRegistered = true;
      }

      // 2. Verifica se há token SSO no URL (veio via redirect tradicional)
      const fromURL = readSSOFromURL();
      if (fromURL) {
        if (typeof this._options.onLogin === 'function') {
          this._options.onLogin(fromURL.user);
        }
        return fromURL.user;
      }

      // 3. Verifica sessão guardada localmente
      const local = loadLocalSession();
      if (local) {
        if (typeof this._options.onLogin === 'function') {
          this._options.onLogin(local.user);
        }
        return local.user;
      }

      // 4. Se configurado autoRedirect, inicia o login
      if (this._options.autoRedirect === true) {
        this.login();
      }

      return null;
    },

    /**
     * Resolve a URL base para o serviço de autenticação.
     */
    _getAuthUrl: function (params = {}) {
      const opts = this._options || {};
      const baseOrigin = opts.ssoOrigin || (
        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
          ? window.location.origin + '/auth.html'
          : SSO_ORIGIN
      );
      const url = new URL(baseOrigin);
      if (opts.appName) url.searchParams.set('app_name', opts.appName);
      if (opts.appLogo) url.searchParams.set('app_logo', opts.appLogo);

      for (const [k, v] of Object.entries(params)) {
        if (v) url.searchParams.set(k, v);
      }
      return url.toString();
    },

    /**
     * Inicia o fluxo de login (por popup ou redirect de acordo com as opções).
     */
    login: function (customOpts = {}) {
      const opts = Object.assign({}, this._options, customOpts);
      if (opts.mode === 'redirect') {
        this.redirect();
      } else {
        this.openPopup();
      }
    },

    /**
     * Abre uma janela flutuante popup no centro do ecrã (como o Google Sign-In).
     */
    openPopup: function () {
      const width = 960;
      const height = 620;
      const left = Math.max(0, (window.screen.width - width) / 2);
      const top  = Math.max(0, (window.screen.height - height) / 2);
      const url = this._getAuthUrl({ sso_mode: 'popup' });

      const popup = window.open(
        url,
        'account_services_auth_popup',
        `width=${width},height=${height},top=${top},left=${left},resizable=yes,scrollbars=yes,status=no`
      );

      if (popup) {
        popup.focus();
      } else {
        // Se o popup foi bloqueado pelo browser, recorre ao redirecionamento seguro
        console.warn('Popup bloqueado pelo browser. A recorrer a redirecionamento...');
        this.redirect();
      }
      return popup;
    },

    /**
     * Redireciona a página inteira para o Account Services (fluxo tradicional de redirect).
     */
    redirect: function () {
      const returnUrl = window.location.href.split('?')[0];
      const url = this._getAuthUrl({ redirect_to: returnUrl });
      window.location.href = url;
    },

    /**
     * Termina a sessão local e chama o callback onLogout.
     */
    logout: function (redirectToLogin = false) {
      clearLocalSession();
      const opts = this._options || {};
      if (typeof opts.onLogout === 'function') opts.onLogout();
      if (redirectToLogin) this.login();
    },

    /**
     * Devolve o utilizador actual, ou null se não houver sessão activa.
     */
    getUser: function () {
      const local = loadLocalSession();
      return local ? local.user : null;
    },

    /**
     * Devolve true se o utilizador estiver autenticado.
     */
    isLoggedIn: function () {
      return this.getUser() !== null;
    },

    /**
     * Renderiza um botão oficial 'Entrar com Account Services' em qualquer elemento HTML.
     * @param {string|HTMLElement} target - Seletor (ex: '#btn-login') ou elemento DOM
     * @param {object} [btnOpts] - Opções visuais do botão
     */
    renderButton: function (target, btnOpts = {}) {
      const el = typeof target === 'string' ? document.querySelector(target) : target;
      if (!el) return;

      const text = btnOpts.text || 'Iniciar sessão com Account Services';
      const theme = btnOpts.theme || 'gradient'; // 'gradient' ou 'dark'

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'as-sso-button';
      btn.style.cssText = `
        display: inline-flex;
        align-items: center;
        gap: 10px;
        padding: 10px 22px;
        border-radius: 9999px;
        border: none;
        background: ${theme === 'dark' ? '#0f172a' : 'linear-gradient(90deg, #0080ff 0%, #6b2cf5 100%)'};
        color: #ffffff;
        font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.02em;
        cursor: pointer;
        box-shadow: 0 4px 16px rgba(0, 128, 255, 0.35);
        transition: all 0.2s ease;
      `;

      btn.innerHTML = `
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="8" r="4" fill="#ffffff"/>
          <path d="M4 20c0-4 4-6 8-6s8 2 8 6" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/>
        </svg>
        <span>${text}</span>
      `;

      btn.onmouseenter = function () {
        btn.style.transform = 'translateY(-1.5px)';
        btn.style.boxShadow = '0 6px 22px rgba(0, 128, 255, 0.5)';
      };
      btn.onmouseleave = function () {
        btn.style.transform = 'translateY(0)';
        btn.style.boxShadow = '0 4px 16px rgba(0, 128, 255, 0.35)';
      };

      const self = this;
      btn.onclick = function () {
        self.login();
      };

      el.innerHTML = '';
      el.appendChild(btn);
    },

    origin: SSO_ORIGIN
  };

  global.AccountServicesSSO = AccountServicesSSO;

})(window);
