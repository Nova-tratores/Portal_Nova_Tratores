# Verificações — Fase 0 (setembro/2026)

> Gate F0 do plano de estabilização. Cada item cola aqui o resultado real (query/grep/painel).
> Legenda: ✅ feito · ⏳ em levantamento · 🔲 depende de você (painel/Supabase).

## Resumo do que trava a Fase 1
- **0.1 e 0.3** (Supabase) ainda **abertos** — o conector `supabase` não está autorizado nesta sessão. Autorizar via `/mcp` numa sessão interativa, ou colar o resultado das queries abaixo.
- Se **0.1** mostrar `contas_pagar`/`contas_receber` em aberto **> 1.000**, o Patrimônio já está truncado hoje e a tarefa **2.3 sobe pra Fase 1** (§6 do plano).

---

## 0.1 — Volume de títulos em aberto 🔲 (Supabase)
Rodar no SQL editor do Supabase do portal e colar a saída:
```sql
select 'pagar'  as t, count(*) from contas_pagar   where status = 'aberto'
union all
select 'receber' as t, count(*) from contas_receber where status = 'aberto';
```
**Resultado:** _(colar)_
**Decide:** se o Patrimônio está truncado no teto de 1.000 → prioriza 1.8 (paliativo) e 2.3.

---

## 0.2 — Casing real de `conta_omie` em `produto_tipo` 🔲 (Supabase)
```sql
select conta_omie, count(*) from produto_tipo group by 1 order by 2 desc;
```
**Resultado:** _(colar)_
**Decide:** quantos itens estão invisíveis pra ABC/Giro/Sugestão por casing divergente (`NOVA` vs `nova`). Alimenta a tarefa 1.9.

> Nota de código (já confirmada): `familias.ts:198` admite casing misto; `vendas-sync.ts:240` grava sem normalizar; filtros exatos `'NOVA'` em `giro.ts:122`, `curva-abc.ts:206/237`, `sugestao-compra/snapshot.ts:95`, `dashboard-listas.ts:339`. Ou seja: **se 0.2 retornar qualquer linha minúscula, há itens sumindo**.

---

## 0.3 — RLS por tabela e policies 🔲 (Supabase)
```sql
-- RLS ligado por tabela
select relname, relrowsecurity
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where nspname = 'public' and relkind = 'r'
order by 1;

-- Policies existentes
select schemaname, tablename, policyname, cmd, roles, qual, with_check
from pg_policies where schemaname = 'public' order by tablename, policyname;
```
**Resultado:** _(colar)_
**Alvos de atenção (do plano):**
- `requisicao_autorizacoes` — esperado ter policy `FOR ALL USING(true)` + `GRANT ALL TO anon` (`sql/dev-bloqueio-historico.sql:40-44`) → **tarefa 1.3**.
- `cmc_correcoes` — esperado **sem RLS** no repositório → **tarefa 1.4**.

---

## 0.4 — Env vars no Railway 🔲 (painel Railway → Variables)
Conferir presença de: `CRON_SECRET`, `EMAIL_ENC_KEY`, `CMC_HMAC_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, e os tokens do NovaZap/Vigia.
**Resultado (presente/ausente):** _(preencher)_

> Nota de código: várias rotas de cron são **fail-open** quando `CRON_SECRET` falta (`dre-financeiro/cron/sync:18`, `dre-financeiro/cron/relatorio-lista`, `revisoes/lembretes/cron:9`, `pos/cron/gravar-gps:88`, `orcamentos/expirar:14`, `pos/lousa/notificar:11`, `ajustes/notas/sync:12`). Se `CRON_SECRET` estiver **ausente** no Railway, essas rotas estão **públicas agora** → urgência da tarefa 1.6.
> Tokens `tratorilson-nt-6049` / `vigia-nt-6049` têm **fallback versionado** no código (`assistente/novazap/route.ts:16`, `cameras/vigia/route.ts:22`) → tarefa 1.5 (remover + rotacionar).

---

## 0.5 — Réplicas e rede do Railway 🔲 (painel Railway → Settings/Networking)
- Réplicas atuais: _(preencher — o esperado/exigido é **1**)_
- Há WAF/allowlist na frente da API? _(preencher)_
**Decide:** validade de breaker/locks em memória (só valem com 1 instância) e gravidade da falta de auth (se a API está exposta na internet aberta).

---

## 0.6 — Quem usa o cliente Omie único ✅

**Cliente único** (com circuit-breaker por conta+método + rate limiter global ~3 req/s, aborta no 425 sem reenviar): `omieRequest` em [`src/lib/estoque/omie.ts`](../src/lib/estoque/omie.ts). Ele é o único que **não prorroga** o bloqueio 425.

**Usam o cliente único** (módulo Estoque e satélites): `estoque/produtos-sync.ts`, `movimentos-sync.ts`, `recebimentos.ts`, `compras-sync.ts`, `vendas-sync.ts`, `notas-entrada.ts`, `cmc-admin.ts`, `admin.ts`, `os.ts`, `comissao.ts`, `ajustes/familias.ts`, `ajustes/contas.ts`, `pos/enderecos.ts`, `visual-estoque/remessas-sync.ts`.

**NÃO usam — cada um tem `fetch` próprio pra Omie (candidatos a prorrogar 425):**

| Wrapper | Evidência | Risco |
|---|---|---|
| `ajustes/omie.ts` | define seu próprio `omieRequest` (`:52`, `fetch :69`) | escrita em massa (edições de característica/estoque) |
| `pos/omie.ts` | `fetch :125`; comentário do cliente único (`estoque/omie.ts:4-6`) avisa que é **single-account, só trata 429** | **cria OS/pedido REAL** |
| `pos/sync-omie.ts` | `fetch :29` | sync de projetos/OS |
| `ppv/omie.ts` | `fetch :87` | **cria pedido/fatura** no Omie |
| `omie-massa/omie.ts` | URLs próprias (`:12-14`), `fetch` próprio | **escrita em massa** (Tipo:, catálogo fiscal) |
| `garantias/omie-faturamento.ts` | `fetch :68` | **envia garantia à fábrica** |
| `financeiro/omie-contapagar.ts` | `fetch :55` | contas a pagar |
| `dre-financeiro/omie-api.js` | `omieRequest` próprio (`:83`) **com retry recursivo** (`:98`, `:110`) | ⚠️ **retenta dentro da janela do 425 → prorroga ativamente** |

Extras (fora dos 9 nomeados, também com fetch direto): `gestao-vendas/clientes-omie.ts`, `financeiro/despesas/omie.ts`, `feedbacks/api.ts`, `ppv/api.ts`, `ppv/caracteristicas.ts`, `ajustes/notas-sync.ts`, `ajustes/remessas.ts`, `ajustes/devolucao.ts`, `ajustes/descricoes.ts`.

**Conclusão:** só o módulo **Estoque** está coberto. Os 8 wrappers acima ainda podem prorrogar um 425 — `dre-financeiro/omie-api.js` é o pior (retry recursivo). Ordem de migração da tarefa **2.4**: `omie-massa` → `pos` → `ppv` → `financeiro` → `dre-financeiro` → `garantias` (o retry recursivo do dre justifica subir na fila).

---

## 0.7 — Schedulers in-process ✅

Fonte: [`src/instrumentation.ts`](../src/instrumentation.ts) (`register()`, roda 1× no boot). Não estão no inventário dos GitHub Actions:

| Job | Cadência | Gatilho | Condição |
|---|---|---|---|
| **safety-net** (não é job) | — | `process.on('unhandledRejection'/'uncaughtException')` → só loga, **engole a exceção** | sempre (`:27-35`) — alvo da tarefa 1.12 |
| **financeiro auto-sync (scanner)** | `setInterval` 5min + `setTimeout` 60s | POST `/api/financeiro/sync-os`, `/api/financeiro/sync-pecas?dias=3` | **DESLIGADO** por padrão; só com `SYNC_FINANCEIRO_AUTO=on` (`:53-64`) |
| **pasta-cliente sync-recente** | `setInterval` 5min + `setTimeout` 90s | GET `/api/clientes/sync-recente` | **SEMPRE LIGADO** (`:73-77`) — toca Omie |
| **tratorilson auto-processamento** | `setInterval` 10min + `setTimeout` 3min | `processarLoteRelatorios` | só `NODE_ENV=production` (`:86-98`) |
| **vigia de saúde dos crons** | `setInterval` 1h + `setTimeout` 15min | `checarSaudeCrons` (lê heartbeat) | só produção (`:104-116`); não toca Omie |

Observações: `sync-incremental` e `backfill-cmc` **já foram movidos** pra GitHub Actions (comentário `:42-45`). `pasta-cliente` e `tratorilson` **tocam a chave Omie** e **não passam por `comCronRun`** → entram na tarefa 1.2.

---

## 0.8 — Horários reais de deploy 🔲 (painel Railway → Deployments, últimos 14 dias)
Agrupar por hora BRT.
**Resultado:** _(preencher)_
**Decide:** se a cadeia noturna já é segura ou se deploys estão caindo em cima dos jobs longos.

---

## 0.9 — Chamadas de API sem Bearer ✅

**Não há wrapper de `fetch`** — há um montador de headers: **`authHeaders()`** em [`src/lib/auth/client.ts:13`](../src/lib/auth/client.ts#L13). É `'use client'`, assíncrono, pega o token via `supabase.auth.getSession()` e devolve `{ Authorization: 'Bearer <access_token>' }` (ou `{}` sem sessão). Uso idiomático: `fetch('/api/...', { headers: { ...(await authHeaders()) } })`. Contraparte no servidor: `autenticar(req)` em `src/lib/auth/server.ts`.

**Magnitude:** **229 arquivos** de front chamam `fetch('/api...')`; só **71** referenciam `authHeaders` → **~158 arquivos batem na API sem montar o Bearer**. ⚠️ Número é heurístico: vários dos 71 "protegidos" **misturam** chamadas com e sem `authHeaders`, então a contagem real de rotas descobertas é maior. **Ligar o middleware em modo `bloquear` sem o rollout em duas etapas (2.1) quebra muita tela** — o modo `observar` por 3 dias é obrigatório.

Módulos com fetch direto **sem** `authHeaders` (mais críticos):
- **DRE Financeiro** — módulo inteiro, nenhuma página usa `authHeaders` (`dre`, `movimentos`, `monitor`, `margens`, `composicao`, `calendario`, `analise-dre`, `fluxo`, `clientes`, `vendas-modelo`, `vencidos`, `rentabilidade`, `patrimonio`, `lucratividade`, `curva-saldo`, `aderencia`).
- **Estoque** — quase todas as páginas + `ComposicaoModal`, `RazaoDetalheModal`, `ContaProvider`.
- **Ajustes** — ~18 páginas (`remessas`, `pedidos`, `negativos`, `familias`, `historico`, `inventario`, `ajuste-custos`, `devolucao`, …).
- **Visual-estoque** — pátio, showroom, remessas, notas-entrada, margens, alertas.
- **Garantias / Orçamentos / POS / Propostas** — componentes de drawer/modais.
- **Clientes, Supervisor, Dashboard, Tarefas, Admin, Avisos, Agendamentos, Conferência-custos.**
- **Público/embarcado (sem sessão Supabase → 401 garantido):** `public/mapa-geral/js/*.js`, `public/bug-reporter.js`, `src/app/carrinho/[token]`, `src/app/chatwoot-app`, `src/app/tv-painel`, `src/app/p/[id]/*`.

---

## 0.10 — Clientes externos da API ✅ (exceções do middleware)

Precisam de exceção explícita em `src/lib/auth/publico.ts` (tarefa 2.1):

**Crons (~45 rotas `/api/**/cron/**`) — usam `Authorization: Bearer <CRON_SECRET>`, que NÃO é JWT.** Um middleware "exige JWT válido" **derruba toda a automação** se o CRON_SECRET não for tratado como exceção (validado por `exigirCron`, não por `getUser`). Confirmado o padrão em `estoque/cron/sync-incremental/route.ts:13-14`. Famílias: `estoque/cron/**` + `estoque/movimentos/cron`, `frota/cron/**`, `ajustes/cron/**`, `garantias/cron/**` + `garantias/emails/cron`, `financeiro/cron/**`, `pos/cron/**` + `pos/lousa/notificar` + `pos/ordens/auto-fase` + `pos/sync`, `dre-financeiro/cron/{sync,relatorio-lista}`, `war-room/cron/snapshot`, `tickets/cron/auto-fechar`, `pecas/unidades/cron/abate`, `carrinhos/cron/fechar-expirados`, `avisos/cron/publicar`, `revisoes/lembretes/cron`, `supervisor-vendas/cron/gravar-rotas`, `feedbacks/oportunidades/recomputar`, `clientes/{sync-recente,relatorio-semanal/gerar}`.

**Webhooks / dispositivos (auth próprio, não-JWT):**
- `whatsapp/webhook` — `hub.verify_token` (GET) + callback Meta (POST).
- `assistente/novazap` — header `x-tratorilson-token` (`route.ts:170-172`).
- `chatwoot/vincular` — `secret` no body vs `APP_SECRET` (`route.ts:36`).
- `clientes/webhook` (+ `/status`) — webhook Omie/externo.
- `feedbacks/cliente-omie` — callback.
- `cameras/vigia` **PUT** — `body.token === CAMERAS_TOKEN` (default `vigia-nt-6049`, `route.ts:22,178`); GET/POST usam `autenticar()`. `agendamentos/vigia` idem.

**Health:** `dre-financeiro/health`.
**Público (páginas/QR sem login):** `ppv/rastreio`, rotas consumidas por `src/app/p/[id]/*`, `carrinho/[token]`, e os JS de `public/mapa-geral/**`.

> Nota cruzada com 1.6: os crons hoje dependem de `Bearer <CRON_SECRET>`. A tarefa 1.6 (fail-closed) e a exceção do middleware (2.1) precisam usar **o mesmo** `exigirCron()` pra não haver dois caminhos.

---

## 0.11 — Migration `cron-runs.sql` aplicada 🔲 (Supabase) — código ✅

Migration existe: [`sql/cron-runs.sql`](../sql/cron-runs.sql). Tabela `cron_runs` com colunas **`iniciado_em`/`finalizado_em`** (atenção: o plano cita `inicio`/`fim` — os nomes reais são estes), `duracao_ms`, `status` (`rodando|ok|erro|pulado|bloqueio` — **não existe `abandonado` ainda**, alvo da tarefa 1.1), `bloqueio`, `detalhe`.

Helper `comCronRun` ([`src/lib/cron/observar.ts`](../src/lib/cron/observar.ts)) **degrada sem a tabela** (no-op via try/catch). A trava só pula se há run aberto **dentro** de `lockMinutos` — run que crashou fica `status='rodando'` sem `finalizado_em` pra sempre (lixo) → tarefa 1.1.

Verificar aplicação no Supabase:
```sql
select count(*) as total, count(*) filter (where finalizado_em is null) as abertos,
       max(iniciado_em) as ultimo
from cron_runs;
select distinct job from cron_runs order by 1;   -- alimenta 1.2 (quais jobs faltam)
```
**Resultado:** _(colar)_

---

## 0.12 — Custo OpenAI do mês 🔲 (painel OpenAI → Billing)
- Gasto do mês: _(preencher)_
- **Setar limite rígido de gasto** (independente do valor) — tarefa 1.13.

---

## Pendências abertas (§10 do plano)
- **Inventário de schedulers in-process:** ✅ fechado (0.7).
- **Lista de exceções do middleware:** ✅ fechada (0.9/0.10) — falta só confirmar com você se existe PWA de vendas em campo além do que foi mapeado.
- **Horários de deploy (0.8):** 🔲 aberto (painel Railway).
- **Percentis de duração por job:** só depois de `cron_runs` colher ≥ 5 dias úteis.

## O que falta pra fechar o Gate F0
Itens de **código: todos ✅** (0.6, 0.7, 0.9, 0.10, e 0.11-código). Falta o que só você acessa:
- **Supabase** (0.1, 0.2, 0.3, 0.11-real): autorizar `/mcp` interativo **ou** colar a saída das queries prontas acima.
- **Painéis**: 0.4 (Railway Variables), 0.5 (réplicas/rede), 0.8 (deploys), 0.12 (OpenAI billing + limite rígido).
