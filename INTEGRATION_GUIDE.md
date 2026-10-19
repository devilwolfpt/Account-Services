# 🚀 Guia de Integração Oficial — Account Services SSO

Bem-vindo ao ecossistema de autenticação e identidade **Account Services**! Este documento foi concebido para orientar tanto **Desenvolvedores Humanos** como **Modelos de Inteligência Artificial (IAs)** a implementar o serviço de login seguro, rápido e completo (incluindo dados de perfil e dados bancários/financeiros) em qualquer website, aplicação web ou sistema externo.

---

## 🤖 PROMPT PARA IA (Copiar e Colar em Qualquer IA)

> **Instruções para o Programador:** Copie e cole todo o bloco abaixo para qualquer IA (ChatGPT, Claude, Gemini, Copilot, Cursor, etc.) quando quiser que ela integre o Account Services no seu projeto:

```markdown
Age como um Desenvolvedor Web Sénior especialista em OAuth, SSO e Segurança Frontend.
Preciso que integres o sistema de login único "Account Services" (da rede Nai Identity) nesta aplicação web.

### 📌 Sobre o Account Services
O Account Services é um fornecedor de identidade SSO moderno com domínio exclusivo de e-mail (@nai.com), suporte a login via Popup (estilo Google/Nai Sign-In) e fluxo de consentimento granular com permissões (scopes) de Perfil e Dados Bancários/Financeiros.

### 📦 Biblioteca Oficial
A biblioteca cliente encontra-se disponível no ficheiro:
`sso-client.js` (ou hospedada em `https://devilwolfpt.github.io/Account-Services/sso-client.js`)

### 🛠️ Modos de Integração Requeridos

1. **Para Aplicações Padrão (Fóruns, Redes Sociais, Lojas, Blogs):**
   - Scopes solicitados: `['profile', 'email']`
   - O utilizador autoriza e partilha o seu Nome, Foto e E-mail oficial `@nai.com`.

2. **Para Aplicações Financeiras (Gestão de Dinheiro, FinTech, Carteiras):**
   - Scopes solicitados: `['profile', 'email', 'banking']`
   - Se a conta do utilizador ainda não tiver dados bancários cadastrados, o pop-up do Account Services solicita automaticamente o IBAN, Banco e Saldo em tempo real antes de concluir o login.
   - Após autorização, o callback `onLogin(user)` disponibiliza o objeto `user.banking` com `{ hasBanking: true, bankName, iban, balance, currency }`.

### 💻 Código de Exemplo que deves implementar:

```html
<!-- 1. Importar a Biblioteca Cliente -->
<script src="sso-client.js"></script>

<!-- 2. Botão de Login na Interface -->
<button id="btnLogin" class="btn-sso">Entrar com Account Services</button>

<!-- 3. Inicialização e Captura de Sessão -->
<script>
  AccountServicesSSO.init({
    appName: 'O Meu Projeto',                       // Nome da tua app apresentado no popup
    appLogo: 'https://meusite.com/assets/logo.png', // Opcional
    scopes: ['profile', 'email'],                    // Usa ['profile', 'email', 'banking'] para apps de finanças
    mode: 'popup',                                  // 'popup' (janela flutuante centralizada) ou 'redirect'
    onLogin: function(user) {
      console.log('✅ Utilizador autenticado com sucesso:', user);
      console.log('Nome:', user.name);
      console.log('E-mail oficial:', user.email);

      // Se for uma app financeira com scope 'banking':
      if (user.banking && user.banking.hasBanking) {
        console.log('💳 Banco:', user.banking.bankName);
        console.log('IBAN:', user.banking.iban);
        console.log('Saldo:', user.banking.balance, user.banking.currency);
      }

      // Atualiza a tua UI (exibe perfil, saldo, etc.)
    },
    onLogout: function() {
      console.log('ℹ️ Sessão terminada.');
    }
  });

  document.getElementById('btnLogin').addEventListener('click', function() {
    // Podes chamar login normal ou especificar scopes na chamada:
    AccountServicesSSO.login({
      scopes: ['profile', 'email', 'banking'] // caso seja uma ação que exija dados financeiros
    });
  });
</script>
```

Por favor analisa a estrutura do meu projeto e aplica a integração com base no exemplo acima, garantindo validação de sessão ativa na inicialização (`AccountServicesSSO.isLoggedIn()`) e tratamento limpo de logout.
```

---

## 👨‍💻 Guia Passo a Passo para Desenvolvedores Humanos

### 1. Incluir a Biblioteca no HTML
Adicione a tag `<script>` na sua página antes do código da aplicação:
```html
<script src="sso-client.js"></script>
```
*(Se estiver em domínios diferentes, a biblioteca resolve automaticamente a origem do Account Services ou pode passar `ssoOrigin: 'https://seu-servidor/auth.html'` no `init`).*

---

### 2. Inicializar o Serviço no JavaScript
Chame `AccountServicesSSO.init(options)` no carregamento da página:

```javascript
AccountServicesSSO.init({
  appName: 'Gestor Financeiro Pro',
  clientId: 'minha_app_financeira',
  scopes: ['profile', 'email', 'banking'],
  mode: 'popup', // 'popup' é recomendado para experiência nativa idêntica ao Google
  onLogin: function(user) {
    atualizarInterfaceComUtilizador(user);
  },
  onLogout: function() {
    voltarAoEcraDeLogin();
  }
});
```

---

### 3. Disparar o Início de Sessão
Ligue a função `AccountServicesSSO.login()` a qualquer botão ou evento:
```javascript
// Login padrão:
AccountServicesSSO.login();

// Ou especificando scopes no momento do clique:
AccountServicesSSO.login({
  scopes: ['profile', 'email', 'banking']
});
```

---

### 4. Estrutura do Objeto `user` Recebido

```json
{
  "name": "João Silva",
  "firstName": "João",
  "lastName": "Silva",
  "email": "joaosilva@nai.com",
  "birthDate": "1998-05-12",
  "gender": "M",
  "picture": null,
  "provider": "nai",
  "scopes": ["profile", "email", "banking"],
  "banking": {
    "hasBanking": true,
    "bankName": "Caixa Geral de Depósitos",
    "iban": "PT50 0035 0123 4567 8901 2345 6",
    "balance": 2450.00,
    "currency": "EUR"
  },
  "exp": 1792345678000
}
```

---

### 5. Métodos Úteis da Biblioteca

| Método | Descrição |
|---|---|
| `AccountServicesSSO.init(options)` | Inicializa o cliente SSO, verifica token no URL e escuta mensagens do popup. |
| `AccountServicesSSO.login(customOpts)` | Abre o popup (ou redireciona) para o ecrã de autorização. |
| `AccountServicesSSO.logout(redirectToLogin)` | Termina a sessão na aplicação local. |
| `AccountServicesSSO.getUser()` | Retorna o utilizador atualmente autenticado ou `null`. |
| `AccountServicesSSO.isLoggedIn()` | Retorna `true` se existir uma sessão válida. |
| `AccountServicesSSO.hasBankingAccess()` | Retorna `true` se o utilizador concedeu acesso aos dados bancários. |
| `AccountServicesSSO.getBankingData()` | Retorna `{ bankName, iban, balance, currency }` ou `null`. |
| `AccountServicesSSO.renderButton(target, opts)` | Desenha um botão oficial estilizado num elemento HTML. |

---

### 6. Como Funciona a Gestão no Dashboard do Utilizador
Sempre que uma aplicação externa é autorizada pelo utilizador:
1. Fica registada na conta da base de dados e surge na **TAB Segurança (Aplicações Associadas)** (`intro/security.html`).
2. O utilizador pode **gerir permissões individuais** (ligar/desligar permissão de perfil, e-mail, saldo ou transações) ou **remover o acesso da app** com um clique.
3. Na **TAB Carteira e Subscrições** (`intro/payments-and-subscriptions.html`), o utilizador vê o saldo em tempo real, cartão Nai Pay, transações e subscrições ativas.
