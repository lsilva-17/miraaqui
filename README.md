# Miraaqui

Quadros colaborativos com notas, formas, conexões, desenho livre, imagens, modelos, comentários, presença e cursores compartilhados. Contas individuais e cadastro por convite de uso único. Todos os membros cadastrados acessam os quadros deste espaço.

## Executar localmente

Requer Node.js 24. Execute `npm ci`, `npm start` e abra http://localhost:4317. Sem `DATABASE_URL`, os dados ficam em `data/elo.sqlite`, fora do Git. Consulte `LEIA-ME.md` para ferramentas e atalhos.

## Hospedagem na Vercel

O frontend é servido de `public/` e a API de `api/index.mjs`. A Vercel usa PostgreSQL via Neon, conectado pela variável `DATABASE_URL`. Não use SQLite em `/tmp` para armazenamento permanente na hospedagem. O banco e suas credenciais não fazem parte deste repositório.

O projeto possui configurações em `vercel.json`. Instale as dependências com `npm ci`, verifique com `npm test` e `npm run build`. Depois de configurar o banco, execute `node --env-file=.env.local scripts/migrate.mjs` para aplicar o esquema inicial idempotente antes do primeiro deploy.

Para migrar uma instalação local para um banco remoto vazio, use `node --env-file=.env.local scripts/import-local.mjs CAMINHO-DA-BASE-SQLITE`. A importação é transacional, recusa destinos que já tenham contas e copia contas, configurações, quadros, objetos e comentários. Não copia sessões nem convites: os usuários devem entrar novamente e gerar novos convites pelo endereço publicado.

O cadastro público de administrador é bloqueado na Vercel por padrão. Para inicializar uma instalação completamente nova sem importação, configure `ELO_ADMIN_EMAIL` e um `ELO_SETUP_TOKEN` aleatório; forneça `setupToken` junto à requisição inicial de cadastro de administrador. Remova o token após a configuração. Nunca exponha o token no frontend nem em URLs.

Cookies de sessão são HttpOnly, SameSite=Strict e Secure na Vercel. A API exige autenticação para ler e editar os quadros. A aplicação preserva o modelo de contas e senhas da instalação local; os logins de GitHub/Vercel administram a infraestrutura, não substituem o login do Miraaqui.

## Colaboração e limites

As alterações são registradas atomicamente junto aos objetos em PostgreSQL. As conexões SSE consultam o registro compartilhado e reconectam periodicamente; a colaboração funciona entre instâncias distintas. A atualização remota costuma levar aproximadamente 1,5 segundo, além da latência do banco. Ao alterar simultaneamente o mesmo objeto, prevalece a última escrita. Presença expira após 30 segundos sem atividade.

Não há CRDT, edição offline, SSO, permissões por quadro, recuperação de senha ou histórico de versões. O timer é pessoal. Frames são organizadores visuais e não agrupam o movimento das notas. Excluir um quadro é permanente. Faça backups no provedor do banco. Para liberar uso corporativo, confira o plano da Vercel: Hobby é limitado a uso pessoal não comercial.

Credenciais, bancos, arquivos temporários e materiais da empresa que não pertencem ao aplicativo são excluídos do Git e da publicação. `npm test` executa testes locais sem acessar a base da Vercel, salvo se você fornecer explicitamente `DATABASE_URL` ao processo.
