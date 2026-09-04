# Verificações — Fase 0 (setembro/2026)

> Gate F0 do plano de estabilização. Cada item cola aqui o resultado real (query/grep/painel).
> Legenda: ✅ feito · ⏳ em levantamento · 🔲 depende de você (painel/Supabase).

## Resumo do que trava a Fase 1
- **0.1, 0.2, 0.11** ✅ fechados via script REST (`scripts/fase0-verificacoes.mjs`, service role key — o conector `supabase` MCP segue não autorizado, mas não é preciso).
- **0.3** ✅ fechado (SQL editor, 03/09) → 🔴🔴 **achado P1 CRÍTICO: o banco está aberto à anon key.** `anon` (chave pública do frontend) tem **GRANT ALL** em ~110 tabelas RLS-off (PII, comissão/salário, financeiro, auditoria — dá pra **TRUNCATE `audit_logs_vendas`**), e ainda há policies `TO public USING(true)` em tabelas RLS-on. É o item mais urgente do Gate F0. Remediação amarrada à 2.1 (auth middleware) — ver 0.3.
- **Achado 0.1 (revisado):** o Patrimônio **NÃO trunca no teto 1.000** (usa `selectPaginado`, que pagina em loop). O problema real é outro e pior: `selectPaginado` (`calc.js:607`) pagina **sem `.order()`** → sobre 26k linhas de `contas_pagar` repete/pula linhas → `a_pagar_aberto`/`a_receber_aberto` **instáveis/inflados** (bug `selectpaginado-sem-order`). A tarefa **2.3 continua necessária**, mas o alvo muda: **não** é "paginar o teto 1.000" (já pagina), é **pôr `.order()` estável** em `selectPaginado` (fix barato, alto impacto).

---

## 0.1 — Volume de títulos em aberto ✅ (via `scripts/fase0-verificacoes.mjs`, 03/09/2026)
> ⚠️ A coluna real é **`status_titulo`** (não `status`) e não há valor `'aberto'` — a query original do plano estava errada. "Em aberto" = `status_titulo NOT IN (PAGO, RECEBIDO, LIQUIDADO, CANCELADO)`, que é **exatamente o filtro que `calcularAberto` usa** (`calc.js:677`).

**Resultado (conta TODAS):**

| Tabela | Total | Em aberto (A VENCER + ATRASADO + VENCE HOJE) | Quebra `status_titulo` |
|---|---|---|---|
| `contas_pagar` | **26.010** | **961** | PAGO 25.012 · A VENCER 735 · ATRASADO 194 · CANCELADO 37 · VENCE HOJE 32 |
| `contas_receber` | **11.426** | **654** | RECEBIDO 10.328 · CANCELADO 444 · ATRASADO 357 · A VENCER 290 · VENCE HOJE 7 |

> (O proxy "sem `data_pagamento`" dava 11.997/4.433, mas é ruído: ~11k títulos `PAGO` têm `data_pagamento` nulo. Ignorar — o rótulo `status_titulo` é o autoritativo.)

**Decisão (revisada):** os títulos em aberto (**961/654**) estão **abaixo de 1.000** — então, mesmo numa consulta simples de página única, não haveria truncamento por esse recorte. **MAS** `calcularAberto` NÃO filtra no servidor: puxa a tabela **inteira** (26.010 linhas de pagar) via `selectPaginado` e filtra em JS depois (`calc.js:669-682`). `selectPaginado` (`calc.js:607-619`) usa `.range()` num loop **sem `.order()`** → paginação instável sobre 27 páginas → linhas repetidas/omitidas → **`a_pagar_aberto`/`a_receber_aberto` inflados/instáveis** (bug conhecido `selectpaginado-sem-order`). **Tarefa 2.3 = pôr `.order()` estável** (ex.: `.order('id')`/`.order('codigo_lancamento')`) em `selectPaginado` — e, de bônus, filtrar `status_titulo` no servidor pra puxar ~1k em vez de 26k. Vale para `calcularAberto`, `calcularEstoque` (`:634`) e `calcularFrota` (`:660`), todos sem `.order()`.

---

## 0.2 — Casing real de `conta_omie` em `produto_tipo` ✅ (via script, 03/09/2026)
**Resultado:** `NOVA` = **5.050**, `CASTRO` = **4.691**. **Nenhuma** linha minúscula ou casing divergente.

**Decisão:** **não há itens sumindo por casing** em `produto_tipo` hoje. A tarefa **1.9 não é urgente por este vetor** — os filtros exatos `'NOVA'`/`'CASTRO'` batem com o dado real. Fica só a **prevenção** (normalizar na escrita, `vendas-sync.ts:240`) pra não regredir; não bloqueia a Fase 1.

> Nota de código (mantida como prevenção): `familias.ts:198` admite casing misto; `vendas-sync.ts:240` grava sem normalizar; filtros exatos `'NOVA'` em `giro.ts:122`, `curva-abc.ts:206/237`, `sugestao-compra/snapshot.ts:95`, `dashboard-listas.ts:339`. Como 0.2 voltou 100% maiúsculo, o risco é **latente** (uma escrita futura minúscula sumiria), não **ativo**.

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
### Resultado (A) — RLS por tabela (03/09/2026, ⏳ parcial: faltam policies+grants)
Rodada a query (A). **~110 tabelas do `public` estão com `relrowsecurity = false`.** RLS off só é buraco **se** o papel `anon`/`authenticated` tiver grant (query C pendente), mas o conjunto sensível é grande:

- **Financeiro sem RLS:** `contas_receber` (⚠️ inconsistente — `contas_pagar` está **true**), `despesas`, `finan_pagar`, `finan_receber`, `finan_rh`, `conta_corrente`, `contas_baixas`, `contas_correcoes`, `movimentacoes`, `movimentacao_produtos`, `cmc_historico`, `notas_entrada`, `outras_entradas`, `vendas_itens`, `vendas_categoria_mensal`, `audit_logs_vendas`, `os_mensal`.
- **Comissão/salário sem RLS:** `comissao_pessoas`, `comissao_custos_vendedor`, `comissao_regras`, `comissao_config`, `comissao_bonus_historico`, `comissao_ajustes_servicos`, `comissao_ajustes_vendas`.
- **Clientes/fornecedores (PII) sem RLS:** `Clientes_Omie`, `Cliente_Manual`, `Clientes_Manuais`, `clientes_info`, `clientes_vendas`, `ignorar_clientes`, `Fornecedores`.
- **Comunicação interna sem RLS:** `mensagens_chat`, `portal_chats`, `portal_chat_membros`, `portal_chat_leitura`, `portal_mensagens`, `portal_notificacoes`, `portal_lembretes`, `portal_logs`, `portal_tarefas`.
- **Propostas/pedidos sem RLS:** `pedidos`, `orcamentos`, `proposta_anexos`, `proposta_itens`, `proposta_status_hist`, `proposta_tags`, `req_cotacao`.
- **Ativos sem RLS:** `Placas`, `maquinas`, `tratores`, `cad_trator`, `cad_autopropelido`, `maquinas_localizacao`, `gps_rastreador`.

**Contra a expectativa do plano:**
- `requisicao_autorizacoes` → RLS = **true** (não false). A brecha da **1.3**, se houver, está na *policy* → depende da query (B).
- `cmc_correcoes` → RLS = **true** (o plano esperava **sem RLS**). Expectativa da **1.4** invertida — provável que a 1.4 caia; confirmar pela policy (B).

**Falta:** **(B) policies** e **(C) grants em tabelas RLS-off** (queries no chat/abaixo). Só com (C) dá pra separar "P1 exposto de fato" de "RLS-off inofensivo".

```sql
-- (C) quais tabelas RLS-off têm grant pros papéis públicos = superfície real de ataque
select t.relname as tabela, g.grantee,
       string_agg(distinct g.privilege_type, ',' order by g.privilege_type) as privs
from pg_class t
join pg_namespace n on n.oid = t.relnamespace
join information_schema.role_table_grants g
  on g.table_name = t.relname and g.table_schema = 'public'
where n.nspname = 'public' and t.relkind = 'r'
  and t.relrowsecurity = false and g.grantee in ('anon','authenticated')
group by 1,2 order by 1,2;
```
### Resultado (B) — policies (03/09/2026) 🔴 ACHADO P1
O papel `public` inclui **`anon`** (chave pública do bundle). Policies `TO public USING(true)` = **acesso sem login**. Duas classes de exposição:

**🔴 CRUD/escrita total ao anon (RLS "on" é teatro — a policy libera tudo):**
- `Ordens_Omie` — policies nomeadas `anon_insert`/`anon_read`/`anon_update` (`{public}`, wc/qual = `true`).
- `Equipamentos`, `Formulario`, `Proposta_Fabrica`, `abastecimentos`, `abastecimento_lotes`, `agenda_notas`, `agenda_visao` — `ALL {public} true/true`.
- `GPS_Viagens`, `Tecnicos` (UPDATE aberto!), `checkin_diario`, `checkin_vendedor`, `comentarios_supervisor`, `comercial_veiculos` — CRUD `{public} true`.
- `comissoes_os_relatorio`, `despesa_descontos_relatorio`, `config_vendedores_relatorio`, **todos os `cache_*_relatorio`** — `allow_all ALL {public} true/true` → **comissão/despesa/relatórios lidos e gravados por qualquer um com a anon key**.

**🟠 Leitura de negócio ao anon:** `clientes_vendas`, `clientes_relatorios_semanais` (`SELECT {public} true`).

**🟢 Padrão correto (referência p/ o fix):** `catalogo_*_write`/`configuracoes_write` → `EXISTS(supervisores WHERE auth_uid=auth.uid())`; `financeiro_usu` → `auth.uid()=id`; `decisoes` → `decisoes_pode_ver()`; `frota_*`/`feedback_*`/`caracteristicas_*`/`etiquetas_*` → `{authenticated}` (exige login).

> Regra de leitura: `{authenticated}` exige login; `{public} qual=true` **não** (anon entra); `{public} qual=(auth.role()='authenticated')` exige login (o filtro barra anon). ⚠️ (B) veio **truncada** no chat (parou em `frota_dias`) — o padrão já está claro, mas rodar de novo com `\copy`/CSV pra pegar a lista completa das `{public} true`.

**Conclusão 0.3:** o banco está **amplamente aberto à anon key** (classe RLS-off da query A **+** classe policy-`{public} true` da B). Isto **valida o P1 de segurança do plano** e vai além da 1.3/1.4 pontuais: é um **retrofit de RLS/policies em massa** (tarefa nova, candidata a subir de fase). Fix = trocar `{public} true` por `{authenticated}` + policy por papel real (modelo `supervisores`/`portal_permissoes`). **Não** virar RLS a seco sem o rollout de auth (2.1) — quebra as telas que hoje usam a anon key direto.

### Resultado (C) — grants em tabelas RLS-off (03/09/2026) 🔴🔴 P1 CRÍTICO
O papel **`anon`** (chave pública, no bundle do frontend) tem **`DELETE, INSERT, SELECT, UPDATE, TRUNCATE, REFERENCES, TRIGGER`** em **TODAS** as tabelas com RLS off. Com RLS desligado não há policy pra barrar — o grant manda. Amostra confirmada (a lista segue em ordem alfabética; o padrão é idêntico linha a linha):
- **PII:** `Clientes_Omie`, `Cliente_Manual`, `Clientes_Manuais`, `Fornecedores`, `clientes_info`, `clientes_vendas` — anon lê/escreve/apaga.
- **Salário/comissão:** `comissao_config`, `comissao_custos_vendedor`, `comissao_bonus_historico`, `comissao_ajustes_servicos`, `comissao_ajustes_vendas`.
- **Financeiro/auditoria:** `cmc_historico`, `audit_logs_vendas` (anon pode **TRUNCATE** o log de auditoria → destrói tamper-evidence), e pela ordem ainda `contas_receber`, `despesas`, `finan_*`, `movimentacoes`, `notas_entrada`, `vendas_itens`.
- **Operacional:** `Requisicao`, `Ordem_Servico`, `Projeto`, `Placas`, `cad_trator`, etc.

**VEREDITO 0.3 (fechado):** o banco está **aberto de fato à anon key** por dois caminhos somados — (1) RLS-off + `anon` GRANT ALL (C) e (2) RLS-on + policy `TO public USING(true)` (B). Qualquer pessoa com a chave pública (que sai no JS) **lê, grava, apaga e trunca** dados de clientes (PII/LGPD), comissão/salário, financeiro e auditoria. Isto **eleva** o P1 do plano: não é só a 1.3/1.4 — é um **retrofit de segurança em massa**.

**Sequência de remediação (sem quebrar o portal, que hoje usa a anon key direto):**
1. **2.1 primeiro** — subir o middleware de auth (modo `observar` 3 dias → `bloquear`) pra API virar a porta única. Enquanto o front fala com PostgREST via anon, **não dá** pra revogar/trancar sem quebrar tela.
2. Migrar as telas que batem direto no PostgREST pra passar pela API (ou por client autenticado com sessão real).
3. Só então: **`REVOKE`** write do `anon` nas tabelas sensíveis + **ligar RLS** com policy por papel real (modelo `EXISTS(supervisores…)` / `portal_permissoes`), começando por PII → financeiro → comissão → auditoria.
4. `audit_logs_vendas`/`cmc_historico`: tirar `TRUNCATE`/`DELETE` do anon **imediatamente** (baixo risco de quebrar tela; alto risco se explorado).

> Cruza com memória `auth-sessao-portal` (getSession não valida; ~392/420 rotas sem auth): a API fraca **+** o banco aberto = a anon key é efetivamente admin. Os dois têm que ser fechados juntos (2.1 destrava o resto).

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

## 0.11 — Migration `cron-runs.sql` aplicada ✅ (via script, 03/09/2026) — código ✅
**Resultado real:** tabela `cron_runs` **existe e está APLICADA** (colunas reais confirmadas: `id, job, iniciado_em, finalizado_em, duracao_ms, status, requisicoes, erros, bloqueio, detalhe`).
- `total = 24` runs · `abertos (finalizado_em null) = 2` · `último = 2026-09-03T10:04:32Z`.
- **Jobs distintos (8):** `ajustes-sync-notas`, `estoque-backfill-cmc`, `estoque-sync-compras`, `estoque-sync-estoque`, `estoque-sync-incremental`, `estoque-sync-movimentos`, `estoque-sync-produtos`, `estoque-sync-recebimentos`.

**Decisões:**
- **Tarefa 1.1 confirmada:** há **2 runs órfãos** (`status='rodando'` sem `finalizado_em`) = lixo de crash. Precisa do faxineiro que marca `abandonado` runs velhos sem fim.
- **Tarefa 1.2 confirmada (quais jobs faltam):** só **Estoque + `ajustes-sync-notas`** passam por `comCronRun`. **Faltam** os schedulers in-process que tocam Omie (`pasta-cliente sync-recente`, `tratorilson`) — do 0.7 — e todos os demais crons de GitHub Actions (frota, garantias, financeiro, pos, dre, war-room, tickets, etc.). São os alvos de envolver com `comCronRun`.

---

### (histórico) Notas de código do 0.11

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
- **Código: todos ✅** (0.6, 0.7, 0.9, 0.10, 0.11-código).
- **Supabase via script REST: ✅** 0.1, 0.2, 0.11-real fechados por `scripts/fase0-verificacoes.mjs` (03/09/2026). Rerodável a qualquer momento.
- **Supabase que falta:** só **0.3** (RLS/policies) — precisa de `pg_catalog`, fora do PostgREST. Rodar as duas queries do bloco 0.3 no **SQL editor do Supabase** (ou autorizar o MCP `supabase` numa sessão interativa) e colar.
- **Painéis (só você):** 0.4 (Railway Variables), 0.5 (réplicas/rede), 0.8 (deploys), 0.12 (OpenAI billing + limite rígido).

### Placar Gate F0
| Item | Status |
|---|---|
| 0.1 volume títulos | ✅ (961 pagar / 654 receber em aberto; achado real = `selectPaginado` sem `.order()`) |
| 0.2 casing produto_tipo | ✅ (100% maiúsculo — sem itens sumindo) |
| 0.3 RLS/policies | ✅ 🔴 **P1 CRÍTICO** — banco aberto à anon key (RLS-off + anon GRANT ALL; e policies `{public} true`) |
| 0.4 env Railway | 🔲 (painel) |
| 0.5 réplicas/rede | 🔲 (painel) |
| 0.6 cliente Omie único | ✅ |
| 0.7 schedulers in-process | ✅ |
| 0.8 horários deploy | 🔲 (painel) |
| 0.9 fetch sem Bearer | ✅ |
| 0.10 clientes externos API | ✅ |
| 0.11 cron_runs aplicada | ✅ (aplicada; 2 órfãos → 1.1; 8 jobs → 1.2) |
| 0.12 custo OpenAI | 🔲 (painel) |
