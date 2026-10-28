# Miraaqui — espaço de colaboração

Uma primeira versão funcional de quadro colaborativo interno, inspirada nos recursos básicos do Miro e FigJam. Não requer assinatura do ChatGPT nem dependências externas. Requer Node.js 24 ou superior.

## Começar

1. Abra `Iniciar-Miraaqui.cmd` e acesse http://localhost:4317.
2. Cadastre a companhia e sua conta administradora. A primeira configuração cria o administrador; faça isso antes de abrir o serviço à rede.
3. Clique em **Convidar equipe**, gere um convite por pessoa e envie o link pelo canal interno da empresa. Cada convite pode ser usado uma vez e expira em sete dias.
4. Cada colega cria sua conta com o convite. Todos os membros cadastrados podem ver e editar todos os quadros desse espaço.

Para parar, pressione Ctrl+C na janela do servidor. Para iniciar novamente, abra o mesmo arquivo. Os dados permanecem na pasta `data`.

## Acesso pelos colegas

Encerre o servidor local e abra `Iniciar-na-rede.cmd` no computador que hospedará o Miraaqui. Use `ipconfig` para localizar o IPv4 desse computador. A equipe acessa `http://IP-DO-COMPUTADOR:4317` na mesma rede. Gere os links de convite usando esse endereço, para que não apontem para localhost. O computador precisa continuar ligado e o servidor aberto.

Se necessário, a TI deve permitir a porta 4317 somente na rede corporativa apropriada. O aplicativo não altera o firewall automaticamente. HTTP transmite os dados sem criptografia; use somente uma rede confiável para avaliação. Para uso corporativo permanente ou remoto, a TI deve colocar o serviço atrás de HTTPS e habilitar `ELO_SECURE_COOKIE=1`. Não exponha a porta diretamente à internet. Não há serviço em nuvem provisionado nesta entrega.

## Recursos implementados

- Painel de quadros com busca, criação, renomeação e exclusão.
- Modelos de brainstorming, planejamento e retrospectiva.
- Canvas com zoom, deslocamento, enquadramento, notas adesivas, texto, retângulos, elipses, losangos, frames, conectores, desenho livre e imagens.
- Mover, redimensionar, editar texto com duplo clique, alterar cor, duplicar, trazer à frente e excluir.
- Desfazer/refazer das ações na sessão atual; alterações salvas automaticamente no servidor.
- Atualizações ao vivo, cursores e presença dos usuários conectados, comentários compartilhados.
- Contas individuais, convites de uso único, senhas com scrypt, sessões com cookies HttpOnly e acesso autenticado nas APIs.
- Exportação SVG e JSON; importação dos objetos de um backup Miraaqui no quadro atual.
- Timer pessoal de cinco minutos.

## Atalhos

V seleciona; H ou espaço move a tela; N cria nota; T texto; R retângulo; O elipse; D losango; L conector; P caneta; F frame. Escolha a ferramenta e clique no quadro. Para conectar, clique em dois objetos. Arraste o canto inferior direito de um objeto selecionado para redimensionar. Ctrl+Z desfaz; Ctrl+Shift+Z refaz; Ctrl+D duplica; Delete exclui. Use roda/trackpad para mover a tela, Ctrl+roda para zoom e o botão ⛶ para enquadrar tudo. Ctrl+Enter finaliza a edição de texto.

## Operação e limites desta versão

O armazenamento é SQLite, na pasta `data`, com WAL. Um processo central atende aos navegadores via HTTP e eventos SSE. As alterações são enviadas por objeto; edições simultâneas em objetos diferentes são preservadas. Ao editar o mesmo objeto, prevalece a última alteração recebida pelo servidor. Não há mesclagem de texto por CRDT, edição offline ou histórico de versões. Uma alteração que não pôde ser salva é revertida e exibida como erro; não feche o quadro enquanto estiver salvando.

Na ferramenta V, clique e arraste no espaço vazio para selecionar vários elementos. Shift adiciona à seleção e Ctrl+A seleciona todos. É possível mover, duplicar, recolorir ou excluir o conjunto e desfazer/refazer a ação inteira. Selecione um bloco e arraste uma das quatro bolinhas azuis laterais até outro elemento para criar uma seta; ela acompanha o movimento e o redimensionamento dos blocos. Soltar a seta no espaço vazio cria um card novo, já conectado, no ponto de soltura. Desfazer remove esse card e sua seta juntos.

A ferramenta de seta (L) permite clicar no espaço vazio e arrastar para desenhar uma seta livre, que pode ser movida, recolorida e excluída.

O ícone de nota adesiva e a tecla N abrem uma paleta de 10 cores. Ao escolher uma cor, uma nota é criada no centro da área visível. Alt + arrastar uma nota cria outra do mesmo tamanho e cor, sem texto, sem mover a original. Desfazer remove a cópia; Escape cancela o gesto.

Os frames são organizadores visuais; mover somente um frame não move suas notas. Não há votação, componentes avançados, SSO corporativo, e-mail transacional, recuperação de senha, permissões por quadro, aplicativo móvel nativo ou integrações com Miro/FigJam. O convite é uma credencial de acesso: compartilhe-o somente com o destinatário. Excluir um quadro é permanente. O SVG usa texto em foreignObject, suportado pelos navegadores modernos; alguns editores gráficos podem não mostrar esse texto.

O backup JSON exporta comentários para consulta; a importação restaura apenas objetos (até 500 por arquivo). Imagens: PNG, JPG, WebP e GIF até 2,5 MB. Esta versão não é uma substituição completa dos produtos citados e precisa de revisão da TI antes de receber dados sensíveis da companhia.

Para um backup completo, pare o servidor e copie toda a pasta `data` para um local protegido. Para restaurar, pare o serviço e substitua a pasta pelo backup. Não publique essa pasta nem a inclua em repositórios. O pacote original contém uma base vazia, pronta para a configuração pelo administrador.

## Configuração técnica

`PORT` (padrão 4317), `HOST` (padrão 127.0.0.1), `ELO_DATA_DIR` (pasta de armazenamento) e `ELO_SECURE_COOKIE=1` (cookies Secure para HTTPS). Execute `npm test` para validar autenticação, convites, acesso, sincronização, comentários, proteção de origem e persistência após reiniciar. Nenhum `npm install` é necessário.


O acesso aceita somente e-mails @caaqui.com, com verificação no servidor para cadastro, login e sessões existentes. Convites continuam obrigatórios; ainda não há confirmação de posse da caixa postal por e-mail ou SSO.


Durante o arraste, Shift restringe o movimento a intervalos de 30° (incluindo horizontal e vertical), com guia visual do ângulo. Funciona para objetos individuais, seleções de vários objetos, cópias com Alt, criação de setas livres e posicionamento de novos cards a partir das bolinhas. Shift pode ser pressionado e solto durante o gesto. Shift + clique continua alternando a seleção. Conexões ancoradas acompanham seus blocos. Novas setas e traços são pretos; novos blocos e formas são brancos. A paleta de notas mantém as cores escolhidas e Alt copia a cor da nota de origem. Os objetos já salvos não são recoloridos.


O botão direito sobre elementos abre o menu de edição: agrupar/desagrupar (Ctrl+G / Ctrl+Shift+G), bloquear/desbloquear (Ctrl+Shift+L), fonte e texto, cor, copiar/recortar/colar dentro do Miraaqui, duplicar, ordenar à frente/atrás, alinhar e distribuir. Clique em um membro para selecionar o grupo; Ctrl+clique seleciona só aquele membro. A formatação é por elemento inteiro, com fonte (Poppins, Arial, Georgia ou monoespaçada), tamanho de 8 a 144, negrito, itálico, sublinhado, cor e alinhamentos horizontal e vertical. Grupos são planos; ainda não há grupos aninhados, rotação ou formatação de partes de uma mesma frase. Frames permanecem atrás dos demais elementos e a ordem das conexões é própria da camada de setas.

O bloqueio evita alterações, movimentação e exclusão acidentais e é validado no servidor. Qualquer editor cadastrado pode desbloquear; não é um bloqueio protegido por proprietário nem uma permissão de segurança. É possível copiar um objeto bloqueado para uma cópia desbloqueada. Grupos, bloqueios e estilos são salvos nos objetos e sincronizados entre colaboradores; as ações integram desfazer/refazer da sessão. Copiar/colar mantém os dados na memória desta aba, inclusive ao trocar de quadro; não é uma área de transferência entre abas ou aplicativos.

O botão Cor da barra inferior abre as mesmas 10 cores das notas e aceita cor personalizada pelo seletor ou código HEX. O botão Compartilhar copia o link do quadro; ele continua exigindo login @caaqui.com e cadastro por convite. Todos os membros cadastrados já têm acesso aos quadros. Convites gerados a partir de Compartilhar preservam o destino do quadro após o cadastro/login. Não há publicação anônima nem alteração de permissões por quadro.


Administradores encontram a gestão em Gerenciar membros: editar nome/e-mail corporativo, escolher perfil Administrador, Editor ou Somente visualização, suspender, reativar, remover e restaurar acesso. A remoção é reversível: a conta é marcada como removida e quadros/comentários são preservados. Suspensão/remoção e mudanças de e-mail/perfil revogam sessões existentes; a colaboração aberta é encerrada na próxima verificação do servidor. Alterações ficam no histórico administrativo. Não é permitido suspender/remover o próprio acesso nem deixar a equipe sem administrador ativo. Visualizadores podem consultar/copiar/exportar os quadros, mas não criar, editar, excluir ou comentar; o servidor aplica essa restrição. As permissões valem para todos os quadros, sem controle individual por quadro. A migração aditiva de banco usa `npm run db:migrate` e mantém os usuários existentes ativos com seu perfil anterior.

Ao selecionar uma seta, os dois círculos das extremidades permitem arrastar origem e destino. Soltar sobre um bloco ajusta a conexão para o ponto escolhido de sua borda; a âncora acompanha movimento e redimensionamento. Soltar no quadro desprende apenas a ponta movida, mantendo a outra conexão. Se ambas ficarem soltas, a seta torna-se livre. Shift mantém o encaixe em 30° nas pontas soltas; Escape cancela e desfazer/refazer recupera a ligação anterior. Elementos bloqueados e visualizadores não recebem controles editáveis.
