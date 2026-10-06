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
     * Inicializa o SSO. Verifica se há sessão activa ou token no URL.
     * @param {object} options
     * @param {string}   options.appName   - Nome da tua app (mostrado na página de login)
     * @param {string}   [options.appLogo] - URL do logo da tua app
     * @param {function} [options.onLogin]  - Chamado com o objecto `user` após login
     * @param {function} [options.onLogout] - Chamado após logout
     * @param {boolean}  [options.autoRedirect=true] - Redireciona automaticamente se não houver sessão
     */
    init: function (options = {}) {
      this._options = options;

      // 1. Verifica se há token SSO no URL (veio da página de login)
      const fromURL = readSSOFromURL();
      if (fromURL) {
        if (typeof options.onLogin === 'function') {
          options.onLogin(fromURL.user);
        }
        return fromURL.user;
      }

      // 2. Verifica sessão guardada localmente
      const local = loadLocalSession();
      if (local) {
        if (typeof options.onLogin === 'function') {
          options.onLogin(local.user);
        }
        return local.user;
      }

      // 3. Sem sessão — redireciona para a página de login (se autoRedirect não for false)
      if (options.autoRedirect !== false) {
        this.login();
      }

      return null;
    },

    /**
     * Redireciona para a página de login do Account Services.
     */
    login: function () {
      const opts = this._options || {};
      const loginUrl = new URL(SSO_ORIGIN);
      loginUrl.searchParams.set('redirect_to', window.location.href.split('?')[0]);
      if (opts.appName)  loginUrl.searchParams.set('app_name', opts.appName);
      if (opts.appLogo)  loginUrl.searchParams.set('app_logo', opts.appLogo);
      window.location.href = loginUrl.toString();
    },

    /**
     * Termina a sessão local e chama o callback onLogout.
     * @param {boolean} [redirectToLogin=false] - Redireciona para login após logout
     */
    logout: function (redirectToLogin = false) {
      clearLocalSession();
      const opts = this._options || {};
      if (typeof opts.onLogout === 'function') opts.onLogout();
      if (redirectToLogin) this.login();
    },

    /**
     * Devolve o utilizador actual, ou null se não houver sessão.
     * @returns {{ name, email, picture, provider, exp } | null}
     */
    getUser: function () {
      const local = loadLocalSession();
      return local ? local.user : null;
    },

    /**
     * Devolve true se houver uma sessão válida.
     */
    isLoggedIn: function () {
      return this.getUser() !== null;
    },

    /**
     * URL base do Account Services (para referência).
     */
    origin: SSO_ORIGIN
  };

  global.AccountServicesSSO = AccountServicesSSO;

})(window);
