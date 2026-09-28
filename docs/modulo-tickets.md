# Módulo `/tickets` — Explicação e Funcionamento

> Motor interno de tickets da Nova Tratores. Este documento explica o que a tela faz,
> como o fluxo funciona e como o código está organizado.

## Visão geral

O `/tickets` é um **motor único de tickets internos**. A ideia central: cada assunto
(um problema, um pedido, uma tarefa) vira um "ticket" com **um responsável de cada vez**
(a "bola está com alguém") e uma **timeline imutável** — tudo que acontece fica registrado
e nunca se apaga.

Em cima desse mesmo motor roda um segundo tipo de ticket: a **Solicitação de Compras (SC)**,
com um fluxo de aprovações (alçadas).

O conceito base está documentado em `docs/conceito-sistema-tickets` (ADRs 001–007).

## Regra de ouro da arquitetura

O navegador **só lê** os dados (direto do Supabase, respeitando RLS com a anon key).
**Toda alteração** (criar, comentar, transferir, mudar status) passa obrigatoriamente pelas
rotas `/api/tickets/*`, que usam a chave de **service role**.

Por isso não existem policies de INSERT/UPDATE/DELETE para o usuário autenticado — só de
SELECT. Não há como escrever no banco pela UI direta; tudo é validado no servidor.

---

## As 4 visões da tela principal

Arquivo: `src/app/(portal)/tickets/page.tsx`

A lista de tickets tem quatro abas (selecionadas via query param `?aba=`):

| Visão | O que mostra |
|-------|--------------|
| **Fila** | Tickets em que **você é o responsável** (a bola está com você) |
| **Pedidos** | Tickets que **você abriu** (é o solicitante) |
| **Acompanhando** | Tickets em que você é **participante** mas não é o dono |
| **Gerencial** | Só admin — **tudo que está aberto**, ordenado pelo mais parado primeiro |

### Fila pessoal / plano de trabalho

Na visão **Fila** existe um plano de trabalho pessoal:

- **Arrastar para ordenar** (drag-and-drop HTML5, com fallback ▲▼ para mobile).
- Botão **"Mexendo agora"** (ícone de raio) — marca o ticket em que você está trabalhando.
- Isso é organização **pessoal**: não gera evento no ticket, não notifica ninguém e não
  altera a "última atividade". Persiste via `PUT /api/tickets/plano`.
- O drag-and-drop só fica ativo quando não há filtros/busca aplicados.

Ordenação da fila: "mexendo agora" no topo → ordem planejada → resto por última atividade.
A visão gerencial ordena pelo **mais parado primeiro**.

### Cada linha da lista mostra

`#numero`, título, responsável, solicitante, categoria, prazo (vermelho se vencido),
"dias sem movimento" (cor conforme a gravidade) e um badge de status.

Filtros disponíveis: busca de texto, chips de status ativos e checkbox "Incluir encerrados".
Botão **"Novo Ticket"** abre o modal de criação.

---

## O ciclo de vida de um ticket

```
aberto → em_andamento → (aguardando_terceiro / aguardando_interno) → resolvido → fechado
                                                                              ↘ cancelado
```

Os 7 estados: `aberto`, `em_andamento`, `aguardando_terceiro`, `aguardando_interno`,
`resolvido`, `fechado`, `cancelado`.

### Encerramento em dois estágios (proposital)

1. O **responsável** marca o ticket como **resolvido**.
2. Só o **solicitante** (quem abriu) **confirma o fechamento** — ou **contesta** (reabre para
   `em_andamento`), ou cancela.

Só o solicitante pode cancelar.

### Auto-fechamento (ADR-004)

Se o solicitante não se manifesta em **7 dias** (`AUTO_FECHAR_DIAS`), um cron fecha o ticket
sozinho. É executado pelo GitHub Actions (`.github/workflows/tickets-auto-fechar.yml`) chamando
`/api/tickets/cron/auto-fechar` (protegido por `x-cron-secret`). O fechamento fica registrado
como **evento do sistema** (`autor_id = null`).

---

## Detalhe do ticket

Arquivo: `src/app/(portal)/tickets/[id]/page.tsx`

A tela de detalhe responde "em que pé está?" e "com quem está a bola?".

- **Timeline ao vivo** (Supabase Realtime, canal `ticket-${id}`): o bloco "PEDIDO ORIGINAL"
  no topo é **imutável** (a `descricao` nunca muda). Abaixo, cada ação vira um evento com ícone
  e texto legível — comentários, transferências, mudanças de status, cobranças. Também recarrega
  ao focar a janela.
- **Cabeçalho**: título, "Bola com &lt;responsável&gt;", "pedido por &lt;solicitante&gt;",
  dias sem movimento e badge de status.
- **Botões de status**: aparecem conforme o papel do usuário e a transição permitida.
  Casos especiais: "Marcar resolvido" / "Confirmar e fechar" em verde; "Contestar (reabrir)"
  quando o solicitante devolve um resolvido para em_andamento.
- **Transferir**: passa a bola para outra pessoa **sem precisar de aceite** (ADR-003). O
  responsável anterior **continua participante** (não perde visibilidade) e o ticket sai da
  fila pessoal dele.
- **Pedir atualização ("cutucar")**: registra uma cobrança pública na timeline e notifica só
  o responsável. Não pode ser feito pelo próprio responsável.
- **Participantes permanentes**: entrar é fácil (comentar num ticket público já te inclui, ou
  ser adicionado/transferido). Ninguém sai por efeito colateral — só por **saída explícita**
  (`removido_em`). Solicitante e responsável atual **não podem** ser removidos.
- **Editar detalhes** (inline): prazo, categoria, terceiro envolvido. A **descrição de origem
  é imutável**.
- **Visibilidade**: privado (só envolvidos + admin) ou público. Só solicitante/admin alteram.

Comentários: Ctrl+Enter envia.

---

## Solicitação de Compras (SC) — a aba "Compras"

A SC é um `tipo` especial de ticket (`tipo='compras'`), não um sistema paralelo. Roda sobre o
mesmo motor com um **trilho de alçadas**.

```
vendedor → diretoria → financeiro → comprador → (PC emitido = concluída)
```

Arquivos:
- `src/app/(portal)/tickets/compras/page.tsx` — pipeline (kanban), uma coluna por etapa.
- `src/app/(portal)/tickets/compras/config/page.tsx` — configuração (só admin).
- `src/components/tickets/compras/PainelCompras.tsx` — painel de ações no detalhe.
- `src/components/tickets/FormSC.tsx` — modal de criação.

### Como funciona

- Cada etapa tem uma **pessoa fixa** (Diretoria, Financeiro, Comprador), configurada pelo admin
  numa config singleton.
- A tela de compras é um **kanban** com uma coluna por etapa (diretoria, financeiro, comprador,
  vendedor) + seção de "Encerradas recentemente".
- Cada card mostra `#numero`, dias parados, produto, cliente, valor total, responsável e flag
  "sinalizada" se houver bloqueio.
- Cada decisão (definir quantidade, aprovar/ressalva, devolver, reprovar, emitir PC, cancelar)
  vira um **evento imutável** na timeline — funciona como um "livro de decisões".
- Etapas terminais: `concluida` (PC emitido no Omie) e `cancelada`.

### Bloqueio suave

Se o valor total for acima do limite **ou** o estoque estiver acima do alvo, a SC é
**sinalizada** (avisa e registra), mas **não trava** o fluxo. Configurável (valor limite e
excesso de estoque) na tela de config.

---

## Estrutura de código

### Frontend — `src/app/(portal)/tickets/`

| Arquivo | Papel |
|---------|-------|
| `layout.tsx` | Guarda de permissão (`temAcesso('tickets')`) + barra de abas (Tickets / Compras) |
| `page.tsx` | Lista principal com as 4 visões + fila pessoal |
| `[id]/page.tsx` | Detalhe do ticket com timeline ao vivo |
| `compras/page.tsx` | Kanban das SCs |
| `compras/config/page.tsx` | Config da SC (admin) |

### Componentes — `src/components/tickets/`

| Arquivo | Papel |
|---------|-------|
| `StatusBadge.tsx` | Pílula colorida do status |
| `UserSelect.tsx` | Dropdown com busca de usuários ativos |
| `FormTicket.tsx` | Modal de criação de ticket genérico |
| `FormSC.tsx` | Modal de criação de SC |
| `compras/PainelCompras.tsx` | Ações do trilho da SC no detalhe |

### Rotas de API — `src/app/api/tickets/`

| Rota | Métodos | Papel |
|------|---------|-------|
| `route.ts` | GET / POST | Listagem por visão (+ contadores) e criação de ticket/SC |
| `[id]/route.ts` | GET | Detalhe (ticket + eventos + participantes). Retorna 404 se não pode ver |
| `[id]/acoes/route.ts` | POST | Todas as mutações do ticket genérico (despacha por `body.acao`) |
| `[id]/compras/route.ts` | POST | Trilho da SC (transições de etapa) |
| `plano/route.ts` | GET / PUT | Fila pessoal (ordem + "mexendo agora") |
| `compras/config/route.ts` | GET / PUT | Config singleton da SC (PUT só admin) |
| `cron/auto-fechar/route.ts` | GET / POST | Fechamento automático após 7 dias |

Ações do `[id]/acoes/route.ts`: `comentar`, `transferir`, `status`, `pedir_atualizacao`,
`participante_add`, `participante_remover`, `visibilidade`, `editar`.

### Lib de negócio — `src/lib/tickets/`

| Arquivo | Papel |
|---------|-------|
| `constantes.ts` | Tipos, `STATUS_INFO`, máquina de transições, helpers (client+server) |
| `server.ts` | Regras no servidor: `podeVer`, `garantirParticipante`, `registrarEvento`, `notificarTicket`, `validarTransicao` |
| `compras.ts` | Tipos e funções puras da SC (etapas, transições, `proximoResponsavel`) |
| `compras-server.ts` | `carregarConfigCompras`, `avaliarBloqueio` |

---

## Banco de dados

### Tabelas principais — `sql/create-tickets.sql`

- **`tickets`** — o ticket em si: `numero` (legível, único), `tipo` (default `generico`),
  `titulo`, `descricao` (imutável), `categoria`, `status`, `visibilidade`, `prazo`,
  `terceiro_envolvido`, `solicitante_id`, `responsavel_id`, `payload` (jsonb),
  `resolvido_em`, `fechado_em`, `ultima_atividade_em`.
- **`tickets_participantes`** — quem está envolvido. Saída só explícita via `removido_em`.
  `UNIQUE(ticket_id, user_id)`.
- **`tickets_eventos`** — a **timeline append-only**. `autor_id` (NULL = sistema), `tipo`,
  `payload` (jsonb), `created_at`. Nunca se edita nem apaga.

### Visibilidade

Função SQL `tickets_pode_ver(p_ticket)` (SECURITY DEFINER): enxerga o ticket quem for público,
solicitante, responsável, participante ativo, ou admin/dev. As policies de RLS (só SELECT)
usam essa função.

### Realtime

`tickets_eventos` é adicionada à publicação `supabase_realtime` para a timeline ao vivo.

### SC — `sql/create-tickets-compras.sql`

- Adiciona a coluna **`sc_etapa`** a `tickets`.
- Recria o CHECK de `tickets_eventos.tipo` para incluir os eventos da SC (`sc_criada`,
  `qtd_alterada`, `parecer_financeiro`, `pc_emitido`).
- Cria **`tickets_compras_config`** (singleton): as três pessoas fixas + limiares de bloqueio.

### Fila pessoal — `sql/create-tickets-plano.sql`

- **`tickets_plano`**: PK `(user_id, ticket_id)`, `posicao`, `atual` (bool). Índice único
  parcial garante no máximo um "mexendo agora" por usuário. RLS: SELECT só do próprio.

---

## Conceitos-chave (resumo)

- **Responsável único ("a bola")**: cada ticket tem um dono de cada vez. Transferência é direta,
  sem aceite; o anterior continua participante.
- **Timeline imutável (append-only)**: o coração do sistema. A descrição de origem nunca muda;
  toda ação vira um evento. Renderizada ao vivo via Realtime.
- **Participantes permanentes**: entrar é fácil; sair só é explícito.
- **Encerramento em 2 estágios**: responsável resolve → solicitante confirma o fechamento
  (ou contesta/cancela). Auto-fecha em 7 dias.
- **4 visões**: fila / pedidos / acompanhando / gerencial (admin).
- **Notificações**: via `portal_notificacoes` (sino), nunca ao autor da ação, respeitando o
  silenciamento do módulo `tickets`.
- **SC**: um tipo de ticket com trilho de alçadas (vendedor → diretoria → financeiro →
  comprador). Bloqueio suave por valor alto ou excesso de estoque.

### Detalhes de acesso a dados

- Nomes/avatares dos usuários vêm da tabela **`financeiro_usu`** (`id`, `nome`, `avatar_url`,
  `ativo`), não de `auth.users` diretamente.
- Permissão do módulo: `temAcesso('tickets')` no client e `temModuloTickets` no server.

---

## Estado atual (deploy)

- **v1 deployado na `main`** (commit 97b9cfe, 10/07/2026); migration `sql/create-tickets.sql`
  já aplicada no Supabase.
- Notificações in-app funcionando (tipo `tickets`).
- **SC (v2)** desenhada e implementada — confirmar se já está publicada em produção.
