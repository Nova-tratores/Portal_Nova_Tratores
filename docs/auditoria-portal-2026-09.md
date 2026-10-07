# Auditoria estruturada — Portal Nova Tratores

> Data: 2026-09-02 · Método: descrever → listar premissas → atacar premissas →
> classificar por consequência → melhorias/correções/reavaliações com custo → o que não consigo ver.
> Achados ancorados em `arquivo:linha` (levantados por varredura do código em 2026-09-01/02),
> não em autocrítica genérica. Onde diz "não sei", é limite real da análise (ver Fase 8).

---

## Fase 1 — Como o sistema funciona hoje (descrição antes do julgamento)

Monólito **Next.js 16 (App Router)** de **~230 mil linhas** em 1.274 arquivos: **615 rotas de API**, 142 páginas, 191 componentes, 285 libs, **216 arquivos SQL** sem runner de migration (estado do banco vive só no Supabase, aplicado à mão). Deploy automático do `main` para o Railway (**1 instância**, obrigatoriamente). **38 workflows** de GitHub Actions fazem `curl` em rotas `/api/**/cron/**`. Integração pesada com **Omie** (ERP) e Supabase (BD/auth/realtime). Velocidade: **957 commits em 90 dias**, equipe de ~3 pessoas. **37 arquivos de teste** no total.

O modelo de autorização **pretendido** é: leitura liberada por RLS `USING(true)`, escrita só por rota com service-role depois de checar admin. O helper existe e está correto em `src/lib/auth/server.ts:41` (`getUser(token)` no servidor, não `getSession`).

### Escala medida

| Métrica | Valor |
|---|---|
| Linhas em `src` | ~229.884 (1.274 arquivos .ts/.tsx) |
| Rotas de API (`route.ts`) | 615 (+3 `route.js`) |
| Handlers de escrita (POST/PUT/PATCH/DELETE) | 320 |
| Páginas (`page.tsx`) | 142 |
| Componentes | 191 |
| Libs | 285 |
| Migrations SQL | 216 (sem runner) |
| Workflows GitHub Actions (crons) | 38 |
| Arquivos de teste | 37 |
| Commits em 90 dias | 957 |
| Maiores arquivos | `clientes/page.tsx` 3.115 · `painel-mecanicos/BlocoVisaoGeral.tsx` 2.794 · `revisoes/page.tsx` 2.463 · `pos/OSDrawer.tsx` 2.339 |

---

## Fase 2 — As premissas em que o sistema depende para funcionar

Os problemas reais moram nas premissas não questionadas, não nos bugs.

- **P1.** "A autorização no frontend basta — ninguém chama a rota direto."
- **P2.** "As env vars (`CRON_SECRET`, `EMAIL_ENC_KEY`, `CMC_HMAC_SECRET`, tokens) estão setadas em produção."
- **P3.** "Nenhuma consulta importante passa de 1000 linhas" (o corte do PostgREST).
- **P4.** "`conta_omie` tem casing consistente por tabela."
- **P5.** "O processo do Railway não reinicia no meio de um job / durante uma conversa de WhatsApp."
- **P6.** "Roda sempre 1 instância" (schedulers in-process).
- **P7.** "A Omie responde, não bloqueia, e não é chamada em paralelo pelo mesmo cron."
- **P8.** "As migrations foram aplicadas na ordem certa antes do código que as usa subir."
- **P9.** "Um humano lembra de aplicar cada migration e setar cada segredo — não há automação."

---

## Fase 3 — Ataque às premissas + classificação por consequência

| Premissa | O que quebra se for falsa | Probabilidade | Consequência |
|---|---|---|---|
| **P1** frontend basta | **213 das 320 rotas de escrita (67%) não têm nenhuma auth**; 131 usam service-role (ignoram RLS). Qualquer um cria cliente no Omie (`clientes/criar/route.ts:88`), envia garantia à fábrica, altera OS/pedido, aprova o desbloqueio de valor alto (`requisicao_autorizacoes` com policy `FOR ALL USING(true)` a anon em `sql/dev-bloqueio-historico.sql:40`). O próprio código admite isso em `src/lib/auth/server.ts:3`. | **Já é verdade** | **Crítica** |
| **P2** segredos setados | Rotas **fail-open**: se `CRON_SECRET` faltar no Railway, ficam públicas — `dre-financeiro/cron/sync/route.ts:18`, `revisoes/lembretes`, `pos/cron/gravar-gps:88`, `orcamentos/expirar:14`, `ajustes/notas/sync:12` (`if(!CRON_SECRET) return true`). `EMAIL_ENC_KEY` ausente → **quebra** o e-mail do financeiro (`cripto.ts:8`). `CMC_HMAC_SECRET` ausente → correção de estoque grava **sem assinatura**, só warn. | **Média** | **Alta** |
| **P3** <1000 linhas | **Patrimônio, KPIs da Home, saldo projetado, aderência, War Room** somam sobre `.limit(50000/100000)` que o PostgREST **corta em 1000** — o próprio código sabe disso (`calc.js:97`). Ex.: `calc.js:1347-1379` soma a receber/a pagar/estoque sem paginar. **Números financeiros subestimados silenciosamente.** | **Alta** (contas a pagar/receber passam de 1000 fácil) | **Crítica** |
| **P4** casing consistente | `produto_tipo` tem casing **misto** (o código admite: `familias.ts:198` "ora 'NOVA', ora 'nova'"). Filtros `.eq('conta_omie','NOVA')` exatos em `curva-abc.ts:206`, `giro.ts:122`, sugestão de compra → itens em minúsculo **somem** da classificação. | **Alta** | **Média-Alta** |
| **P5** processo não reinicia | Conversa de WhatsApp vive em `Map` na memória (`whatsapp.ts:35`); backfills/scans fire-and-forget morrem no deploy (`estoque/cron/sync-produtos:22`); status de job zera. | **Alta** (deploy ~10×/dia) | **Média** |
| **P6/P7** 1 instância / Omie ok | `instrumentation.ts:12` alerta: >1 instância = jobs Omie duplicados. Sem trava de concorrência (`docs/crons-respostas-duvidas.md`), crons de 15/30min re-varrem tudo e batem Omie em paralelo. Cliente de estoque **retenta dentro do bloqueio 425**, prorrogando-o. | **Média** | **Alta** (safety-net registra ~13 quedas em um fim de semana) |

---

## Fase 4 — 10 CORREÇÕES (*algo está errado HOJE*)

Custo por item: **esforço / risco de implementar / custo de não fazer nada**.

1. **Auth ausente em 213 rotas de escrita.** Aplicar `autenticar`/`exigirAdmin` (helper já existe). — *Esforço: alto (213 rotas); Risco: médio (pode quebrar chamadas legítimas do front — mitiga com um wrapper e rollout por módulo); Não fazer: qualquer pessoa na internet cria clientes no Omie, aprova bloqueios de valor, altera OS. É a falha #1.*
2. **`requisicao_autorizacoes` aberta a anon** (`sql/dev-bloqueio-historico.sql:40` `FOR ALL USING(true)` + `GRANT ALL TO anon`). Remover a policy de escrita, mover para rota service-role. — *Esforço: baixo; Risco: baixo; Não fazer: o bloqueio de despesa >R$500 é decorativo — burlável com a anon key pública.*
3. **`cmc_correcoes` sem RLS no repositório** (só há `ALTER ADD COLUMN`). Confirmar/criar RLS. — *Esforço: baixo; Risco: baixo; Não fazer: tabela de auditoria tamper-evident pode estar aberta a escrita pela anon — anula o HMAC.*
4. **Somas do Patrimônio/Home/Saldo/Aderência truncadas em 1000** (`calc.js:1347`, `:149`, `saldo-projetado:40`). Trocar `.limit()` por paginação com `.order()`. — *Esforço: médio; Risco: baixo; Não fazer: decisões financeiras sobre números errados-para-menos, sem aviso.*
5. **Rotas de cron fail-open** (`dre.../cron/sync:18` e ~6 outras com `if(CRON_SECRET && ...)`). Padronizar para fail-closed. — *Esforço: baixo; Risco: baixo; Não fazer: sem o secret setado, rotas de sync pesadas ficam públicas.*
6. **Lookups `.eq('conta_omie','NOVA')` em `produto_tipo` misto** → usar `.ilike`/normalizar na gravação (`vendas-sync.ts:240`). — *Esforço: médio; Risco: baixo; Não fazer: Curva ABC/Giro/Sugestão de Compra perdem itens silenciosamente.*
7. **Tokens hardcoded no Git** (`tratorilson-nt-6049`, `vigia-nt-6049` como fallback em `novazap/route.ts:16`, `cameras/vigia:22`). Remover fallback, exigir env. — *Esforço: baixo; Risco: baixo (setar a env antes); Não fazer: o segredo efetivo é público no repositório.*
8. **`selectPaginado`/`_paginar` sem `.order()`** (`calc.js:607`, `_paginar.ts:13`, `pos/supabase.ts:16`). Forçar chave estável no helper. — *Esforço: baixo (um ponto central); Risco: baixo; Não fazer: linhas pulam/repetem na virada de página → DSO/DPO e somas erradas.*
9. **`sync-nfs.yml` com URL hardcoded e rota sem auth** (job de 120min). — *Esforço: baixo; Risco: baixo; Não fazer: endpoint pesado exposto + acoplado a URL fixa.*
10. **Fallback `SERVICE_ROLE_KEY || ANON_KEY`** espalhado (~140 locais). Se a service key faltar, cai pra anon e escritas falham em silêncio via RLS. — *Esforço: médio; Risco: baixo; Não fazer: bug fantasma difícil de diagnosticar em produção.*

---

## Fase 5 — 10 MELHORIAS (*torna melhor o que já funciona*)

1. **Fila persistente para jobs longos** (ex.: `pgmq`/tabela + worker) — hoje fire-and-forget morre no deploy. — *Esforço: alto; Risco: médio; Não fazer: syncs incompletos recorrentes.*
2. **Trava de concorrência por cron** (advisory lock / tabela `cron_runs`) — não existe (`docs/crons-respostas-duvidas.md`). — *Esforço: baixo; Risco: baixo; Não fazer: crons de 15/30min se atropelam no Omie.*
3. **Wrapper único de rota** (`withAuth(handler, {admin})`) para não repetir auth em 615 arquivos. — *Esforço: médio; Risco: baixo.*
4. **Um helper de query paginada obrigatório** que rejeite em runtime se faltar `.order()`. — *Esforço: baixo; Risco: baixo.*
5. **Persistir memória do WhatsApp no Supabase** (o `TODO` já está no código, `whatsapp.ts:32`). — *Esforço: médio; Risco: baixo.*
6. **Cursor incremental nos syncs Omie** em vez de re-varrer tudo a cada 15min. — *Esforço: alto; Risco: médio; Não fazer: custo/latência crescente.*
7. **Observabilidade de cron** (a tela `/agendamentos` já existe; ligar alertas ativos quando um cron falha 2×). — *Esforço: baixo; Risco: baixo.*
8. **Quebrar os god files** (`clientes/page.tsx` 3.115 linhas, `pos/OSDrawer.tsx` 2.339). — *Esforço: alto; Risco: médio (regressão visual); Não fazer: manutenção cada vez mais lenta.*
9. **Testes de contrato nos 10 cálculos financeiros críticos** (não "adicionar testes" genérico — especificamente Patrimônio, DSO/DPO, aderência, saldo projetado). — *Esforço: médio; Risco: baixo; Não fazer: refactors futuros quebram números sem ninguém notar.*
10. **Runner de migration versionado** (216 SQLs aplicados à mão hoje). — *Esforço: médio; Risco: médio; Não fazer: ver P8/P9.*

---

## Fase 6 — 10 REAVALIAÇÕES (*decisão que fazia sentido antes e talvez não faça mais*)

1. **"Auth só no frontend"** — fazia sentido no MVP interno; com 615 rotas e ações Omie/financeiras, virou passivo crítico. **Reavaliar agora.**
2. **"1 instância Railway para sempre"** — trava a escalabilidade porque os schedulers são in-process (`instrumentation.ts:12`). Reavaliar mover crons para fora do processo.
3. **`.limit(50000)` como "pega tudo"** — nasceu antes de perceber o corte do PostgREST. Hoje é uma armadilha sistêmica.
4. **Suprimir `uncaughtException` e seguir vivo** (`instrumentation.ts:32`) — resolveu as ~13 quedas, mas mantém o processo em estado possivelmente inconsistente. Reavaliar vs. deixar cair + restart limpo.
5. **216 SQLs soltos sem runner** — ok com 20; com 216 e status "aplicado?" na cabeça de uma pessoa, não escala.
6. **Casing livre de `conta_omie`** — reavaliar normalizar na entrada (constraint/trigger) em vez de defender em cada query.
7. **Monólito único** — 230k linhas, um deploy derruba tudo (WhatsApp, câmeras, financeiro juntos). Reavaliar isolar ao menos os workers.
8. **Fallback silencioso pra anon key** — decisão de conveniência que hoje esconde falhas de config.
9. **Cobertura de teste ~nula (37 arquivos / 615 rotas)** aceitável na fase de exploração; com o sistema operando dinheiro real, reavaliar.
10. **Tokens `*-nt-6049` versionados** — atalho de dev que virou risco permanente.

---

## Fase 7 — Três olhares (mudança de ponto de vista)

- **Auditor cético:** "Onde está a prova de que quem chamou a rota tem direito?" → em 213 rotas, não está. O bloqueio de despesa e a auditoria HMAC são teatro se a tabela aceita escrita anon.
- **Funcionário que usa:** "Por que o Patrimônio não bate com a Omie?" → truncamento em 1000, e ele nunca vê um erro — só um número menor.
- **Quem herda isto em 3 anos:** "Quais das 216 migrations rodaram? Qual env var é obrigatória? Por que 1 instância?" → nada disso é executável; vive em `CLAUDE.md` e na memória de uma pessoa (P9 — a premissa mais frágil de todas).

---

## Fase 8 — O que eu NÃO consigo ver / o que você precisa verificar

Isto separa análise sólida de palpite.

1. **Estado real do banco.** Não sei quais das 216 migrations foram aplicadas, se `cmc_correcoes` tem RLS, se os ALTERs v2 de `frota_pendencias` (`km`, `responsavel`) rodaram. **Verificar no Supabase** (SQL editor) — isso valida ou derruba P8.
2. **Env vars reais no Railway.** Não vejo o painel. Confirmar se `CRON_SECRET`, `EMAIL_ENC_KEY`, `CMC_HMAC_SECRET` estão setados decide se as rotas fail-open estão públicas *agora*.
3. **Volume real das tabelas.** Se `contas_pagar`/`contas_receber` em aberto passam de 1.000 linhas, as somas do Patrimônio já estão erradas hoje. Um `count(*)` resolve.
4. **Casing real em `produto_tipo`.** `SELECT DISTINCT conta_omie FROM produto_tipo` diz quantos itens estão "invisíveis" para a Curva ABC.
5. **Se o Railway está mesmo em 1 instância.** Se autoescalou, há jobs Omie duplicados rodando.
6. **Superfície de rede.** Não sei se o Railway está atrás de algum WAF/allowlist que mitigue a ausência de auth. Provavelmente não, mas é a única coisa que separa "crítico" de "catastrófico" na Fase 4 item 1.

---

## Prioridade (se for fazer só três coisas)

1. **Fechar as 213 rotas de escrita** (Fase 4 #1).
2. **Verificar os counts de `contas_*` e paginar as somas do Patrimônio** (Fase 4 #4 + Fase 8 #3).
3. **Fechar `requisicao_autorizacoes` / `cmc_correcoes`** (Fase 4 #2 e #3).

As três atacam premissas *já falsas hoje* (P1, P3), não hipotéticas.

---

## Anexo — Evidência detalhada por dimensão

### A. Segurança / auth

- **Contagens:** 615 rotas API; 320 handlers de escrita; **213 (~67%) sem nenhum mecanismo de auth**; ~131 dessas instanciam service-role (bypass de RLS); só ~117 usam o helper `autenticar`/`exigirAdmin`.
- **Modelo correto (referência):** `src/lib/auth/server.ts:41` (`autenticar` → `getUser(token)`), `:69` (`exigirAdmin`); rota exemplar `admin/permissoes/route.ts:20-22`.
- **`getSession` vs `getUser`:** a autorização de servidor **não** depende de `getSession` (usado só no cliente para montar o Bearer — `auth/client.ts:14`; comentário explícito em `useAuth.ts:87-90`). O risco real é a **ausência de checagem** nas 213 rotas, não o `getSession`.
- **Rotas sensíveis sem auth (exemplos):** `clientes/criar/route.ts:88` (cria cliente no Omie), `garantias/[id]/enviar-fabrica`, `.../refaturar-omie`, `.../solicitar-ressarcimento`, `.../finalizar`, `financeiro/contas-pagar/omie/*`, `financeiro/notificar`, `ppv/pedidos/*`, `pos/ordens/*`, `clientes/webhook`, `mapa/sync-omie`, `omie/sync/route.js`.
- **Tokens hardcoded:** `assistente/novazap/route.ts:16` (`tratorilson-nt-6049`), `cameras/vigia/route.ts:22` (`vigia-nt-6049`) — fallbacks versionados no Git.
- **RLS por tabela:** `portal_permissoes` (correto — `sql/p0-seguranca-rls-permissoes.sql`), `tickets` (correto — `sql/create-tickets.sql`), **`requisicao_autorizacoes` (ABERTA a anon — `sql/dev-bloqueio-historico.sql:40-44`)**, **`cmc_correcoes` (sem `CREATE TABLE`/RLS no repo — só `sql/cmc-correcoes-assinatura.sql`)**.

### B. Integridade de dados

- **Truncamento 1000 (soma sobre dado cortado):** `calc.js:149-160` (a receber/a pagar 7d), `:171-174` (aderência 30d), `:1347-1379` (Patrimônio: aReceber/aPagar/estoque), `:2360`; `saldo-projetado/route.ts:40-49`; `aderencia/route.ts:60-63`; `titulos/route.ts:67-70` (`.select('*').limit(1000)`); `war-room/snapshot.ts:90-127`; `ajustes/inventario.ts:204/297/300`. O código sabe do corte: `calc.js:97`, `fluxo/route.ts:76-79`, `composicao/route.ts:41`.
- **Paginação sem `.order()`:** `_paginar.ts:13`; `pos/supabase.ts:16-22`; `omie-massa/supabase.ts:16-24`; `calc.js:607-618` (`selectPaginado`) e chamadas `:634/660/669/707/727`; `dashboard-listas.ts:173-177`. Contraexemplos corretos: `fluxo/route.ts:86` (`.order('id')`), `sugestao-compra/snapshot.ts:62/83/95`.
- **Casing `conta_omie`:** `familias.ts:198` (admite casing misto, usa `.ilike`); `vendas-sync.ts:240-241` (grava sem normalizar); filtros exatos UPPERCASE em `giro.ts:122`, `curva-abc.ts:206/237`, `sugestao-compra/snapshot.ts:95`, `dashboard-listas.ts:339`; `supabase.ts:23-28` (`filtroConta` sem normalizar); `catalogo-caracteristicas.ts:118` vs `:132` (divergente no mesmo arquivo).
- **Estado em memória (perde no redeploy):** `whatsapp.ts:35` (`conversas` Map, com TODO em `:32`); `calc.js:128/2042/2214`; `omie-api.js:124/485/1127`; `monitors.js:46`; `ajustes/cache.ts:12`; `familias.ts:105`; caches Omie em `ppv/omie.ts`, `pos/omie.ts`, `financeiro/omie-contapagar.ts`, `financeiro/imapPool.ts:14`.

### C. Operação / deploy

- **Crons:** 38 workflows (`schedule` + `workflow_dispatch` → `curl` em `/api/**/cron/**`). Docs em `docs/crons-portal-nova-tratores.md` e `docs/crons-respostas-duvidas.md`. Dois estilos de header (`Authorization: Bearer` vs `x-cron-secret`). `sync-nfs.yml:19` **sem secret, URL hardcoded**, rota sem auth (job 120min). Frequências pesadas: `estoque-sync-recebimentos` a cada 15min, `estoque-sync-incremental` a cada 30min, sem cursor.
- **Env vars — comportamento se ausente:** `EMAIL_ENC_KEY` → **quebra** (`cripto.ts:8`); `CMC_HMAC_SECRET` → **sem assinatura, só warn** (`negativos.ts:211/229`); `GITHUB_TOKEN` → degrada (`agendamentos/status/route.ts:29-31`); `RH_SUPABASE_*` → degrada gracioso (`frota/rh.ts:20-28`); `WHATSAPP_*` → não envia (`whatsapp.ts:9-13`).
- **`CRON_SECRET` fail-open vs fail-closed:** fail-CLOSED em `estoque/cron/*`, `ajustes/cron/*`, `war-room/cron/snapshot:27`, `tickets/cron/auto-fechar:19`. **Fail-OPEN** em `dre-financeiro/cron/sync:18`, `dre-financeiro/cron/relatorio-lista`, `revisoes/lembretes/cron:9`, `pos/cron/gravar-gps:88`, `orcamentos/expirar:14`, `pos/lousa/notificar:11`, `ajustes/notas/sync:12`.
- **Jobs fire-and-forget (morrem no deploy):** `estoque/cron/sync-produtos:22-25`; `estoque/cron/backfill-os-servicos:27-28` (status em memória `os-backfill.ts:23`); `dre-financeiro/cron/sync:42-44` (`movimentos_cc`); `ajustes/estoque-negativo/iniciar:13` (persiste em `ajustes_jobs`, mas o worker é o próprio processo); schedulers in-process em `instrumentation.ts:59/76/95/113`. Sem trava de concorrência (`docs/crons-respostas-duvidas.md:71` — não há `cron_runs`).
- **Safety-net:** `instrumentation.ts:27-35` — `unhandledRejection`/`uncaughtException` só logam `[safety-net] ... (processo segue vivo)`; motivação documentada `:21-26` (~13 quedas em 18-19/07/2026). Alerta `:12-14`: >1 instância = jobs duplicados.
- **Migrations acopladas ao código:** `cmc-correcoes-assinatura.sql` (código já grava `sig`/payload — `negativos.ts:227/231`); `frota-pendencias.sql` (⚠️ conferir ALTERs v2 `km`/`responsavel`); `dev-bloqueio-historico.sql` (`is_dev`); `create-tickets.sql`. Sem runner: 216 SQLs aplicados à mão.
