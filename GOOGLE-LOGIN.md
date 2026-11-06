# Ativar login com Google no Miraaqui

Integração implementada. Este guia registra como configurar ou recriar o cliente OAuth e as variáveis da Vercel. O botão aparece quando as três variáveis abaixo estão preenchidas e o callback é válido. Login e cadastro por senha continuam disponíveis.

## 1. Criar o cliente OAuth

No [Google Auth Platform](https://console.cloud.google.com/auth/overview), selecione um projeto da organização Caaqui ou crie um projeto dedicado, conforme a política da empresa.

1. Em **Branding**, configure o nome **Miraaqui**, o contato de suporte e os contatos responsáveis.
2. Em **Audience**, selecione **Internal** quando o projeto pertencer à organização Google Workspace da Caaqui. Se a opção não estiver disponível, confirme a organização com seu administrador; a API também valida o domínio corporativo.
3. Solicite somente `openid`, `email` e `profile`. O Miraaqui não pede acesso a Gmail, Drive ou outras APIs.
4. Em **Clients**, crie um cliente **Web application** chamado **Miraaqui — Produção**.
5. Adicione este **Authorized redirect URI**, exatamente:

   ```text
   https://miraaqui.caaqui.link/api/auth/google/callback
   ```

O fluxo usa redirecionamento pelo servidor; não exige origem JavaScript autorizada. Não utilize os endereços variáveis dos previews com o cliente de produção. Se o Workspace bloquear o aplicativo, peça ao administrador para aprovar o cliente nos controles de acesso a apps.

## 2. Configurar a Vercel

No projeto [Miraaqui — Environment Variables](https://vercel.com/lucassilva-1628s-projects/miraaqui/settings/environment-variables), configure em **Production**:

| Variável | Valor |
| --- | --- |
| `GOOGLE_CLIENT_ID` | Client ID gerado pelo Google |
| `GOOGLE_CLIENT_SECRET` | Client secret gerado pelo Google; salvar como segredo |
| `GOOGLE_REDIRECT_URI` | `https://miraaqui.caaqui.link/api/auth/google/callback` |

Insira o segredo diretamente na Vercel. Não envie no chat nem salve no repositório. As credenciais de acesso à infraestrutura não substituem esse cliente OAuth.

## 3. Migrar e publicar

A mudança de banco é aditiva: cria `oauth_states` e `oauth_identities`, sem alterar ou apagar contas, quadros, convites ou senhas existentes.

Com `DATABASE_URL` disponível no ambiente correto, execute `npm run db:migrate`. Valide `npm test` e `npm run build` e publique a nova versão na Vercel. Alterar as variáveis exige nova publicação para surtir efeito.

## 4. Validar com uma conta real

- Abra o domínio de produção e clique em **Entrar com Google**. Uma conta existente mantém nome, quadros e perfil.
- Tente uma conta pessoal ou de outro domínio: o acesso deve ser negado.
- Para uma pessoa nova, abra o link de convite e escolha Google. O convite é consumido uma única vez e a conta recebe perfil de Editor. Não é criada uma senha conhecida; nas próximas visitas, entre pelo Google.
- Confirme que contas suspensas/removidas continuam bloqueadas e que Somente visualização continua sem editar.
- Abra um link de quadro antes de entrar e confirme o retorno ao mesmo quadro. Teste sair e entrar novamente.

Após configurar e publicar, conclua a validação entrando com uma conta corporativa real. Os testes locais usam tokens assinados de teste e banco SQLite isolado; não usam contas reais ou o banco de produção.

## Desenvolvimento local

Crie um cliente separado com callback `http://localhost:4317/api/auth/google/callback` e configure as três variáveis em um arquivo ignorado, por exemplo `.env.google.local`. Execute `node --env-file=.env.google.local server.mjs` e abra `http://localhost:4317`. Sem `DATABASE_URL`, usa a base SQLite local. Nunca reutilize o banco de produção em testes.

## Controles aplicados

O SDK oficial valida assinatura, emissor, destinatário e validade do ID token. A aplicação exige `email_verified=true`, domínio Workspace (`hd`) exatamente `caaqui.com`, e-mail no mesmo domínio e `nonce` correspondente. O vínculo persistente usa o identificador Google `sub`; e-mail só associa uma conta existente após a identidade corporativa ter sido verificada. Uma conta já vinculada a outra identidade não é reassociada automaticamente.

O fluxo usa PKCE S256 e `state` descartável, vinculado ao navegador por cookie HttpOnly/SameSite=Lax e com validade de dez minutos. Código e tokens não são enviados ao frontend nem registrados em logs. A sessão interna mantém seu cookie HttpOnly/SameSite=Strict/Secure na Vercel. Não são solicitados tokens de atualização nem armazenados tokens Google.

Referências oficiais: [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect), [validação do ID token](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token), [SDK Node.js](https://github.com/googleapis/google-auth-library-nodejs).

## Fotos de perfil

A foto é sincronizada automaticamente em cada login Google. Ao entrar com senha ou retomar uma sessão existente, o Miraaqui tenta atualizar o perfil uma vez a cada 24 horas, antes de abrir o quadro, com OAuth silencioso (prompt=none e login_hint obtido do cadastro autenticado). Não há botão de sincronização nem redirecionamentos durante a edição. O quadro de origem é preservado e a tentativa usa replace para não criar um ciclo ao voltar no navegador.

A atualização automática exige uma sessão Miraaqui válida tanto no início quanto no retorno, comprovada pelo hash da sessão original no estado OAuth temporário (o cookie da sessão é SameSite=Strict). O subject Google e o e-mail verificado devem corresponder à conta original. Não há criação de usuário, troca de conta, papel ou sessão durante a sincronização. Uma tentativa concorrente ou malsucedida respeita o mesmo intervalo; se o Google exigir login ou consentimento, a aplicação volta ao quadro sem encerrar a sessão nem exibir erro de login. A autorização inicial do Google continua necessária quando a pessoa nunca autorizou o Miraaqui; o modo silencioso não contorna esse requisito.

Quando o ID token não traz foto, o servidor consulta o endpoint oficial UserInfo com o token temporário e exige o mesmo subject validado. Tokens Google não são armazenados. Falhas ou imagens inválidas preservam a foto anterior; na ausência de foto válida são exibidas as iniciais. São aceitas somente URLs HTTPS dos hosts de foto do Google. As imagens são usadas no perfil, lista de membros e presença dos quadros. O intervalo de atualização é registrado por usuário na tabela settings existente, sem migração de esquema.
