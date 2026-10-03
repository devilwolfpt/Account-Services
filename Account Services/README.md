# 🔐 Account Services - Autenticação & Design UI

Interface moderna de autenticação (**Login & Criar Conta**), inspirada fielmente no design original com transição deslizante, iluminação néon, carrossel de testemunhos, formulário multi-etapas, **Login com o Google & Microsoft integrados** e **Modo Desenvolvedor via Barra de Favoritos**.

---

## 🌟 Modos de Apresentação

1. **Para o Utilizador Comum (Produção - Por Defeito)**:
   - Apresenta **apenas o Cartão Interativo Deslizante**.
   - Transição suave entre *"Iniciar sessão"* e *"Criar conta"*.
   - No painel *"Bem-vindo de volta!"*: o bloco de boas-vindas com título e botão fica elegantemente centrado no meio, e o popup roxo de testemunho ancorado em baixo!
   - Formulário multi-etapas funcional (*stepper* com 4 passos), validação e alternador de visibilidade de senha (*eye toggle*).
   - **Login com o Google e Microsoft ativos**: botões oficiais integrados com logótipos SVG nítidos.

2. **Para o Desenvolvedor (Ativado via Barra de Favoritos)**:
   - Exibe a **Vista Lado a Lado** com os dois cartões paralelos **100% idênticos à imagem do design**:
     - **Cartão 1**: *Bem-vindo de volta!* + formulário *Criar conta*.
     - **Cartão 2**: *Iniciar sessão* + painel centrado *Olá, amigo!*.

---

## 🌐 Como Funciona o Login Social (Google & Microsoft)

### 1. Google Sign-In
- **Modo Demonstração Rápido**: Ao clicar no ícone do Google, inicia de imediato com uma conta Google de teste.
- **Produção (Google Cloud)**: Defina a variável no ficheiro `script.js`:
  ```javascript
  window.GOOGLE_CLIENT_ID = 'SEU_CLIENT_ID.apps.googleusercontent.com';
  ```

### 2. Microsoft Sign-In (Entra ID / Azure / MSAL)
- **Modo Demonstração Rápido**: Ao clicar no ícone da Microsoft, autentica de imediato uma conta Microsoft de teste (`demo.user@outlook.com`).
- **Produção (Azure Portal / Microsoft Entra ID)**: Defina a variável no ficheiro `script.js`:
  ```javascript
  window.MICROSOFT_CLIENT_ID = 'SEU_MICROSOFT_APP_ID_AQUI';
  ```
- O SDK oficial `msal-browser` já se encontra importado e gerencia o popup oficial da Microsoft!

---

## 🔖 Como Usar o Bookmarklet na Barra de Favoritos

1. No seu navegador, crie um novo marcador na barra de favoritos com o nome: **`🛠️ Account Services Dev`**
2. No campo **URL**, cole este código:
   ```javascript
   javascript:(function(){if(typeof window.toggleDevMode==='function'){window.toggleDevMode();}else{alert('Abra a página do Account Services primeiro!');}})();
   ```
3. Ao visitar `index.html`, clique nesse favorito (ou prima `Ctrl + Shift + D`) para abrir instantaneamente a barra de ferramentas e a **Vista Lado a Lado do Design**!

---

## 📁 Ficheiros do Projeto

```
account services/
├── index.html     # Estrutura com modo utilizador, Google & Microsoft Sign-In e vista lado a lado dev
├── style.css      # Estilos exatos com fidelidade 1:1, gradientes e animações
├── script.js      # Controlador de transição, stepper, Google auth, Microsoft MSAL auth e dev-mode
└── README.md      # Instruções de utilização e integração
```
