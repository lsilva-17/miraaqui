# Miraaqui

Quadros colaborativos com notas, formas, conexões, desenho livre, imagens, modelos, comentários, presença e cursores compartilhados. Contas individuais e cadastro por convite de uso único. Todos os membros cadastrados acessam os quadros deste espaço.

## Executar localmente

Requer Node.js 24. Execute `npm ci`, `npm start` e abra http://localhost:4317. Sem `DATABASE_URL`, os dados ficam em `data/elo.sqlite`, fora do Git. Consulte `LEIA-ME.md` para ferramentas e atalhos.

## Hospedagem na Vercel

O frontend é servido de `public/` e a API de `api/index.mjs`. A Vercel usa PostgreSQL via Neon, conectado pela variável `DATABASE_URL`. Não use SQLite em `/tmp` para armazenamento permanente na hospedagem. O banco e suas credenciais não fazem parte deste repositório.

O projeto possui configurações em `vercel.json`. Instale as dependências com `npm ci`, verifique com `npm test` e `npm run build`. Depois de configurar o banco, execute `node --env-file=.env.local scripts/migrate.mjs` para aplicar o esquema inicial idempotente antes do primeiro deploy.

Para migrar uma instalação local para um banco remoto vazio, use `node --env-file=.env.local scripts/import-local.mjs CAMINHO-DA-BASE-SQLITE`. A importação é transacional, recusa destinos que já tenham contas e copia contas, configurações, quadros, objetos e comentários. Não copia sessões nem convites: os usuários devem entrar novamente e gerar novos convites pelo endereço publicado.

O cadastro público de administrador é bloqueado na Vercel por padrão. Para inicializar uma instalação completamente nova sem importação, configure `ELO_ADMIN_EMAIL` e um `ELO_SETUP_TOKEN` aleatório; forneça `setupToken` junto à requisição inicial de cadastro de administrador. Remova o token após a configuração. Nunca exponha o token no frontend nem em URLs.

Cadastro, login e sessões existentes aceitam somente e-mails cujo domínio seja exatamente `caaqui.com` (sem subdomínios ou sufixos parecidos). A verificação ocorre no servidor, incluindo a revalidação das conexões de colaboração. Convites de uso único continuam obrigatórios. Esta regra valida o domínio informado; a versão atual ainda não comprova a posse da caixa postal por e-mail ou SSO.

Cookies de sessão são HttpOnly, SameSite=Strict e Secure na Vercel. A API exige autenticação para ler e editar os quadros. A aplicação preserva o modelo de contas e senhas da instalação local; os logins de GitHub/Vercel administram a infraestrutura, não substituem o login do Miraaqui.

## Colaboração e limites

As alterações são registradas atomicamente junto aos objetos em PostgreSQL. As conexões SSE consultam o registro compartilhado e reconectam periodicamente; a colaboração funciona entre instâncias distintas. A atualização remota costuma levar aproximadamente 1,5 segundo, além da latência do banco. Ao alterar simultaneamente o mesmo objeto, prevalece a última escrita. Presença expira após 30 segundos sem atividade.

Com a ferramenta de seleção (V), arraste em uma área vazia para selecionar vários elementos. Shift adiciona elementos à seleção ou alterna um elemento clicado; Ctrl+A seleciona todos. Arraste um dos elementos selecionados para mover o conjunto. Duplicar, excluir, alterar cor e desfazer/refazer também funcionam em conjunto. O retângulo seleciona objetos que toca; frames são selecionados quando ficam completamente dentro dele, permitindo selecionar as notas em seu interior.

Clique no ícone de nota adesiva ou pressione N para abrir a paleta com 10 cores. Escolher uma cor cria imediatamente uma nota no centro da área visível do quadro. Para reaproveitar o tamanho e a cor de uma nota existente, mantenha Alt pressionado e arraste a nota: uma cópia sem texto é criada no destino, preservando a original. Um clique sem arrastar não cria cópia; Escape cancela o arraste. Desfazer remove a cópia criada.

A ferramenta de seta (L) também permite clicar no espaço vazio e arrastar para desenhar uma seta livre. Ela pode ser movida, selecionada por área, recolorida e excluída. As conexões presas aos blocos continuam disponíveis pelas bolinhas ou por dois cliques com a ferramenta L.

O visual utiliza a identidade da Caaqui: Poppins servido localmente, paleta laranja e neutra e logotipo oficial. A origem dos arquivos está em `BRAND-SOURCES.md`; as cores escolhidas pelos usuários para suas notas e os pontos azuis de conexão são preservados.

Ao selecionar um bloco, nota, texto, imagem ou frame, aparecem quatro bolinhas azuis afastadas do bloco, uma no centro de cada lado, com borda branca. Arraste qualquer uma até outro elemento para conectar a partir desse lado. Os círculos brancos dos cantos permitem redimensionar. A seta segue os elementos quando são movidos ou redimensionados. Também é possível clicar na bolinha e depois no destino, ou usar a ferramenta L. Soltar a seta no espaço vazio do quadro cria um card novo, centralizado no ponto de soltura e já conectado à origem. O card mantém tipo, cor e tamanho de notas e formas; a partir de texto, imagem ou frame é criada uma nota adesiva. Soltar sobre outro elemento conecta ao existente. Um único Desfazer remove o novo card e sua seta juntos; Escape cancela o gesto. Linhas e traços de caneta não têm bolinhas.

Não há CRDT, edição offline, SSO, permissões por quadro, recuperação de senha ou histórico de versões. O timer é pessoal. Frames são organizadores visuais e não agrupam automaticamente o movimento das notas. Excluir um quadro é permanente. Faça backups no provedor do banco. Para liberar uso corporativo, confira o plano da Vercel: Hobby é limitado a uso pessoal não comercial.

Credenciais, bancos, arquivos temporários e materiais da empresa que não pertencem ao aplicativo são excluídos do Git e da publicação. `npm test` executa testes locais sem acessar a base da Vercel, salvo se você fornecer explicitamente `DATABASE_URL` ao processo.


Durante o arraste, Shift restringe o movimento a intervalos de 30° (incluindo horizontal e vertical), com guia visual do ângulo. Funciona para objetos individuais, seleções de vários objetos, cópias com Alt, criação de setas livres e posicionamento de novos cards a partir das bolinhas. Shift pode ser pressionado e solto durante o gesto. Shift + clique continua alternando a seleção. Conexões ancoradas acompanham seus blocos. Novas setas e traços são pretos; novos blocos e formas são brancos. A paleta de notas mantém as cores escolhidas e Alt copia a cor da nota de origem. Os objetos já salvos não são recoloridos.


O botão direito sobre elementos abre o menu de edição: agrupar/desagrupar (Ctrl+G / Ctrl+Shift+G), bloquear/desbloquear (Ctrl+Shift+L), fonte e texto, cor, copiar/recortar/colar dentro do Miraaqui, duplicar, ordenar à frente/atrás, alinhar e distribuir. Clique em um membro para selecionar o grupo; Ctrl+clique seleciona só aquele membro. A formatação é por elemento inteiro, com fonte (Poppins, Arial, Georgia ou monoespaçada), tamanho de 8 a 144, negrito, itálico, sublinhado, cor e alinhamentos horizontal e vertical. Grupos são planos; ainda não há grupos aninhados, rotação ou formatação de partes de uma mesma frase. Frames permanecem atrás dos demais elementos e a ordem das conexões é própria da camada de setas.

O bloqueio evita alterações, movimentação e exclusão acidentais e é validado no servidor. Qualquer editor cadastrado pode desbloquear; não é um bloqueio protegido por proprietário nem uma permissão de segurança. É possível copiar um objeto bloqueado para uma cópia desbloqueada. Grupos, bloqueios e estilos são salvos nos objetos e sincronizados entre colaboradores; as ações integram desfazer/refazer da sessão. Copiar/colar mantém os dados na memória desta aba, inclusive ao trocar de quadro; não é uma área de transferência entre abas ou aplicativos.

O botão Cor da barra inferior abre as mesmas 10 cores das notas e aceita cor personalizada pelo seletor ou código HEX. O botão Compartilhar copia o link do quadro; ele continua exigindo login @caaqui.com e cadastro por convite. Todos os membros cadastrados já têm acesso aos quadros. Convites gerados a partir de Compartilhar preservam o destino do quadro após o cadastro/login. Não há publicação anônima nem alteração de permissões por quadro.


Administradores encontram a gestão em Gerenciar membros: editar nome/e-mail corporativo, escolher perfil Administrador, Editor ou Somente visualização, suspender, reativar, remover e restaurar acesso. A remoção é reversível: a conta é marcada como removida e quadros/comentários são preservados. Suspensão/remoção e mudanças de e-mail/perfil revogam sessões existentes; a colaboração aberta é encerrada na próxima verificação do servidor. Alterações ficam no histórico administrativo. Não é permitido suspender/remover o próprio acesso nem deixar a equipe sem administrador ativo. Visualizadores podem consultar/copiar/exportar os quadros, mas não criar, editar, excluir ou comentar; o servidor aplica essa restrição. As permissões valem para todos os quadros, sem controle individual por quadro. A migração aditiva de banco usa `npm run db:migrate` e mantém os usuários existentes ativos com seu perfil anterior.

Ao selecionar uma seta, os dois círculos das extremidades permitem arrastar origem e destino. Soltar sobre um bloco ajusta a conexão para o ponto escolhido de sua borda; a âncora acompanha movimento e redimensionamento. Soltar no quadro desprende apenas a ponta movida, mantendo a outra conexão. Se ambas ficarem soltas, a seta torna-se livre. Shift mantém o encaixe em 30° nas pontas soltas; Escape cancela e desfazer/refazer recupera a ligação anterior. Elementos bloqueados e visualizadores não recebem controles editáveis.

Ao aproximar uma ponta das bolinhas azuis externas, o ímã encaixa a ligação no centro do lado correspondente, com destaque azul. A área de atração mantém o mesmo tamanho visual em qualquer zoom. Fora dessa faixa central, é possível escolher livremente outro ponto da borda; afastar a ponta do elemento a desprende. O encaixe também funciona ao criar uma ligação pelas bolinhas.
