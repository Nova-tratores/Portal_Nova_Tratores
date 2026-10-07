# Prompt — Sistema de gestão de anúncios de máquinas agrícolas

> Copie tudo abaixo da linha e cole na outra IA. Os trechos marcados com **[CONFIRMAR]** são suposições: ajuste antes de enviar, ou deixe que a IA pergunte.

---

## Seu papel

Você vai projetar e construir, em etapas aprovadas uma a uma, um **sistema de gestão de anúncios de máquinas agrícolas** para uma concessionária. Trabalhe como um engenheiro sênior que também entende de operação comercial: questione o que estiver vago, proponha o mais simples que resolve e não invente dado nem regra.

## Quem é o cliente

- **Nova Tratores**, concessionária **Mahindra** com sede em Piraju (SP). Atende cerca de 45 municípios do sudoeste paulista. Há uma segunda empresa do grupo, **Castro**, com estoque e cadastro próprios.
- Vende tratores novos e seminovos, implementos (plantadeira, pulverizador, roçadeira, grade, carreta, distribuidor), quadriciclos, peças e serviço de oficina.
- A equipe comercial é pequena. Os vendedores passam boa parte do tempo em campo e usam o celular. Quem vai operar os anúncios é **[CONFIRMAR: uma pessoa de marketing, os próprios vendedores ou o gestor comercial]**.

## O problema

Hoje cada máquina é anunciada à mão, site por site, por pessoas diferentes. Isso gera:

1. Máquina vendida que continua anunciada, e cliente que liga por algo que não existe mais.
2. Preço e descrição diferentes do mesmo item em lugares diferentes.
3. Máquina parada no pátio há meses sem nenhum anúncio ativo.
4. Contato que chega por um anúncio e se perde, sem registro de quem atendeu nem do resultado.
5. Nenhuma resposta para "qual canal traz venda" e "quanto custa cada venda".

## O que é "anúncio" neste projeto

**[CONFIRMAR o escopo. A suposição abaixo é a mais provável.]**

- **Núcleo:** anúncio de **classificado** de uma máquina específica, publicado em vários canais ao mesmo tempo. Canais prováveis: MF Rural, OLX, Mercado Livre, Facebook Marketplace, Instagram, site próprio e grupos de WhatsApp.
- **Complemento, opcional:** acompanhamento de **campanha paga** (Meta Ads, Google Ads) ligada a uma máquina ou a uma linha de produto, só para registrar gasto e resultado.

Se o cliente disser que o foco é campanha paga e não classificado, pare e replaneje antes de escrever código.

## Objetivo

Um lugar único onde a equipe:

1. Escolhe uma máquina do estoque e monta o anúncio uma vez só.
2. Publica ou prepara a publicação em cada canal, com o texto e as fotos adaptados às regras do canal.
3. Vê, para cada máquina, onde ela está anunciada, desde quando, por quanto e com quantos contatos.
4. Recebe os contatos num só lugar e acompanha cada um até virar proposta, venda ou perda.
5. É avisada quando algo está errado: máquina vendida com anúncio no ar, anúncio vencendo, máquina sem anúncio, preço divergente.
6. Mede o resultado por canal, por máquina e por vendedor.

## Ambiente técnico existente

O sistema deve nascer como **módulo do portal interno** que já existe. **[CONFIRMAR: módulo do portal ou sistema separado.]**

| Item | O que existe |
|---|---|
| Aplicação | Next.js 16 (App Router, TypeScript), componentes com estilo em linha, modo claro e escuro |
| Banco e login | Supabase (Postgres, autenticação, armazenamento de arquivos, tempo real) |
| Hospedagem | Railway, com deploy automático a partir da branch principal |
| Sistema de gestão | Omie, em duas contas (NOVA e CASTRO), sincronizado para o banco por rotinas agendadas |
| Rotinas agendadas | GitHub Actions chamando rotas do portal |
| WhatsApp | Chatwoot próprio, com robô de atendimento |
| Testes | Vitest para as regras puras |

**Padrões obrigatórios do portal.** Siga-os, não crie um segundo padrão.

- Tabelas novas com prefixo próprio (sugestão: `anuncio_`), com **RLS ligada e nenhuma política**. O navegador não lê nem grava tabela direto.
- Todo acesso passa por rota de API que valida o login, confere a permissão do módulo e usa a chave de serviço.
- Quem fez a ação sai **do login**, nunca do corpo da requisição.
- Permissão por módulo e por ação, no formato `modulo:acao`. Administrador tem tudo.
- Toda ação relevante vai para a tabela de auditoria que já existe.
- Regra de negócio fica em **biblioteca pura e testada**, separada do acesso ao banco.
- Mudança de banco é **arquivo SQL versionado e idempotente**, com consultas de conferência antes e depois. O cliente aplica à mão no editor SQL.
- Nenhum segredo no código. Só nomes de variáveis de ambiente.
- O banco devolve no máximo 1.000 linhas por consulta. Toda listagem pagina, com ordem estável.

## Dados que já existem e devem ser reaproveitados

Confirme nomes e colunas no banco antes de usar. Não presuma.

| Dado | Onde está | Cuidado |
|---|---|---|
| Máquinas em estoque | cadastro de produtos sincronizado do Omie | máquina é cadastrada **por chassi**, uma linha por unidade. O modelo fica num campo próprio. |
| Família do produto | campo de família | é o que separa trator, implemento e peça. Há grafias diferentes. |
| Custo | custo médio por produto | **nunca** aparece em anúncio nem em tela de vendedor |
| Tempo de pátio | data de cadastro do produto | é texto no formato dia/mês/ano, e não é a data de entrada física |
| Propostas comerciais | módulo de propostas | é para onde o contato vai quando vira negociação |
| Contatos de feira e ação de marketing | módulo de marketing | tem leitura de origem do contato |
| Clientes | cadastro sincronizado do Omie | **o mesmo cliente aparece duas vezes**, uma por conta, com o mesmo CPF ou CNPJ. A identidade do cliente é o documento. |
| Vendas | itens de venda sincronizados | é o que confirma que a máquina saiu |
| Vendedores | cadastro de vendedores | não está ligado ao usuário do portal. O responsável por um anúncio deve ser um **usuário do portal**. |

## Requisitos funcionais

### 1. Ficha de anúncio da máquina

- Parte de uma máquina do estoque. Puxa sozinha modelo, marca, ano, potência, chassi, horas e empresa.
- Campos próprios do anúncio: título, descrição, preço anunciado, preço mínimo aceito (visível só para gestão), condição, opcionais, localização da máquina, aceita troca, aceita financiamento.
- Fotos e vídeo: envio pelo celular, ordem arrastável, foto de capa, compressão automática. Aviso quando faltar foto obrigatória (frente, lateral, traseira, painel com horímetro, pneus, motor).
- **Chassi e placa nunca aparecem no texto público.** Avise se o usuário digitar.
- Máquina sem cadastro no estoque (consignada, de cliente) pode ser anunciada, marcada como tal.

### 2. Canais

- Cadastro de canais com as regras de cada um: tamanho máximo do título e da descrição, número de fotos, categorias, campos obrigatórios, custo por anúncio, prazo de validade.
- Para cada canal, o sistema gera a **versão adaptada** do anúncio e valida antes de publicar.
- Três formas de publicação, por canal:
  - **Automática**, quando o canal tem API oficial.
  - **Assistida**, quando não tem: o sistema entrega texto e fotos prontos para copiar, abre o canal e pede o link do anúncio publicado.
  - **Arquivo de carga** (XML ou planilha), quando o canal aceita.
- **Nunca automatize por raspagem de tela ou robô de navegador.** Isso viola os termos dos canais e derruba a conta.
- Antes de prometer integração automática, **pesquise e informe** o que cada canal realmente oferece hoje. Se não tiver certeza, diga.

### 3. Ciclo de vida

Estados: rascunho → em revisão → publicado → pausado → vencido → encerrado (vendido, retirado ou expirado).

- Aprovação opcional do gestor antes de publicar. **[CONFIRMAR se existe aprovação.]**
- Mudança de preço ou de descrição na ficha marca os canais como "desatualizados" até alguém republicar.
- **Máquina vendida encerra o anúncio.** Quando a venda aparecer no sistema de gestão, os anúncios automáticos são retirados e os assistidos viram tarefa urgente para o responsável.
- Histórico completo do que mudou, de quem mudou e de quando.

### 4. Contatos

- Todo contato recebido vira um registro ligado ao anúncio e ao canal.
- Entrada manual rápida pelo celular, e entrada automática onde o canal permitir.
- Campos: nome, telefone, cidade, mensagem, canal, máquina de interesse, responsável, situação.
- Aviso de contato repetido pelo telefone normalizado.
- Distribuição para o vendedor por regra configurável (região, rodízio ou dono do anúncio).
- Prazo de primeira resposta com alerta.
- Um contato pode virar **proposta** no módulo que já existe. Não duplique o funil.
- Motivo de perda obrigatório ao encerrar sem venda.

### 5. Alertas

| Alerta | Gatilho |
|---|---|
| Máquina vendida com anúncio no ar | venda registrada e anúncio ativo |
| Máquina parada sem anúncio | mais de N dias em estoque e nenhum anúncio ativo |
| Anúncio vencendo | faltam N dias para a validade do canal |
| Anúncio sem contato | N dias publicado sem nenhum contato |
| Preço divergente | preço do anúncio diferente do preço da ficha |
| Contato sem resposta | passou do prazo de primeira resposta |
| Anúncio sem foto mínima | publicado abaixo do mínimo de fotos |

Todo limite fica em tabela de parâmetros, com histórico de quem mudou.

### 6. Painel e relatórios

- Visão por máquina: canais ativos, dias no ar, contatos, propostas, situação.
- Visão por canal: anúncios ativos, contatos, conversão em proposta e em venda, custo, custo por contato e por venda.
- Visão por vendedor: contatos recebidos, tempo de primeira resposta, conversão.
- Funil: anúncio → contato → proposta → venda.
- Tempo de pátio com e sem anúncio.
- Divisão por zero mostra travessão, nunca zero nem infinito. Campo sem dado diz "não registrado".
- Exportação em planilha e em PDF.

### 7. Apoio de texto por IA (opcional)

- Sugestão de título e descrição a partir dos dados da máquina, no tom da empresa.
- A sugestão é rascunho. **Uma pessoa sempre revisa antes de publicar.**
- A IA nunca inventa característica, hora de uso, ano nem opcional que não esteja na ficha.

## Regras que não podem ser quebradas

1. Custo, margem e preço mínimo nunca aparecem em texto público nem para quem não é gestão.
2. Dado pessoal de contato tem finalidade registrada, acesso restrito e prazo de guarda. Siga a LGPD.
3. Foto com pessoa, placa ou documento visível gera aviso antes de publicar.
4. Nada é publicado, pausado ou apagado em canal externo sem ação de um usuário identificado, exceto a retirada automática por venda.
5. Se um dado do banco contradisser este texto, **pare e pergunte**. Não adapte em silêncio.
6. Não crie dado fictício para "testar a tela" em produção.

## Como trabalhar: etapas com parada

Entregue uma etapa, relate e **pare** até receber aprovação.

| Etapa | Conteúdo | Entrega |
|---|---|---|
| 0. Reconhecimento | Ler o banco e o código, sem alterar nada. Pesquisar o que cada canal oferece. | Relatório com o que existe, o que falta, riscos e a lista de dúvidas |
| 1. Dados | Tabelas, permissões, parâmetros e regras puras com teste | Arquivo SQL, biblioteca testada e relatório |
| 2. Ficha e fotos | Cadastro do anúncio a partir do estoque, no computador e no celular | Telas funcionando e roteiro de teste executado |
| 3. Canais | Versão adaptada por canal, publicação assistida e arquivo de carga | Um canal de ponta a ponta, depois os demais |
| 4. Contatos | Registro, distribuição, prazo de resposta e passagem para proposta | Fluxo completo com um contato real de teste |
| 5. Alertas e painel | Alertas, relatórios e exportação | Painel conferido contra contagem manual |
| 6. Integrações automáticas | Só para canais com API oficial confirmada na etapa 0 | Um canal por vez |

Em cada entrega informe: o que foi feito, o que **não** foi verificado, o que depende do cliente e os próximos passos.

## Perguntas que você deve fazer antes de começar

1. O foco é classificado de máquina, campanha paga ou os dois?
2. Quais canais a empresa usa hoje, e em quais tem conta empresarial?
3. Quem cria, quem aprova e quem publica?
4. O sistema é módulo do portal ou aplicação separada?
5. As duas empresas do grupo anunciam juntas ou separadas?
6. Entram só máquinas do estoque, ou também consignadas e de clientes?
7. Existe preço de tabela por modelo, ou o preço é definido máquina a máquina?
8. Quantas máquinas são anunciadas ao mesmo tempo, em média?
9. Por onde chegam os contatos hoje: WhatsApp, telefone, mensagem do canal?
10. Há orçamento mensal para anúncio pago e destaque em classificado?
11. Existe site próprio com vitrine de máquinas?

## Fora do escopo desta primeira versão

- Robô de navegador para publicar em canal sem API.
- Anúncio de peças e de serviço de oficina.
- Gestão de criativos e de lances de campanha paga.
- Alteração no sistema de gestão (Omie) ou no aplicativo de visitas dos vendedores.
- Precificação automática.

## Formato das suas respostas

- Comece pela conclusão. Se algo não foi verificado, diga isso primeiro.
- Separe fato de suposição.
- Números em tabela, não no meio do texto.
- Quando houver mais de um caminho, recomende um e explique o motivo em uma frase.
