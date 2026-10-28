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

Os frames são organizadores visuais; mover um frame não move suas notas. Não há seleção múltipla, votação, componentes avançados, SSO corporativo, e-mail transacional, recuperação de senha, remoção de membros, permissões por quadro, aplicativo móvel nativo ou integrações com Miro/FigJam. O convite é uma credencial de acesso: compartilhe-o somente com o destinatário. Excluir um quadro é permanente. O SVG usa texto em foreignObject, suportado pelos navegadores modernos; alguns editores gráficos podem não mostrar esse texto.

O backup JSON exporta comentários para consulta; a importação restaura apenas objetos (até 500 por arquivo). Imagens: PNG, JPG, WebP e GIF até 2,5 MB. Esta versão não é uma substituição completa dos produtos citados e precisa de revisão da TI antes de receber dados sensíveis da companhia.

Para um backup completo, pare o servidor e copie toda a pasta `data` para um local protegido. Para restaurar, pare o serviço e substitua a pasta pelo backup. Não publique essa pasta nem a inclua em repositórios. O pacote original contém uma base vazia, pronta para a configuração pelo administrador.

## Configuração técnica

`PORT` (padrão 4317), `HOST` (padrão 127.0.0.1), `ELO_DATA_DIR` (pasta de armazenamento) e `ELO_SECURE_COOKIE=1` (cookies Secure para HTTPS). Execute `npm test` para validar autenticação, convites, acesso, sincronização, comentários, proteção de origem e persistência após reiniciar. Nenhum `npm install` é necessário.
