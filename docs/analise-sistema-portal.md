# Análise do Portal Nova Tratores — o sistema como um todo

> Gerado em 2026-09-02. Análise em 4 fases (profundidade → premissas → 30 ações → limites).
> Fundamentada em recon direta da base (contagens reais) + 3 explorações (camada Omie/crons,
> auth/permissões/módulos, saúde de engenharia). Números medidos, não estimados.

---

## Fase 1 — O sistema em profundidade

### O que é, em uma frase
Portal interno monolítico da Nova Tratores (Next.js 16 / React 19 / App Router, TS strict) que serve como **camada de inteligência e operação sobre o ERP Omie** — o Omie é a fonte de verdade transacional; o portal espelha, cruza, enriquece e opera em cima. Supabase é banco + auth; Railway é o runtime de produção.

### Escala real (medida)
- **615–618 rotas** `/api/*`, **142 páginas**, **285 libs**, **191 componentes**, **216 arquivos SQL**, **38 GitHub Actions**.
- Grande e maduro em *funcionalidade*, jovem em *fundações* (auth, testes, observabilidade). Cresceu por acreção de módulos.

### Componentes principais
1. **Espelho Omie → Supabase.** ~9 wrappers Omie independentes (um por módulo: `ajustes/omie.ts`, `estoque/omie.ts`, `pos/omie.ts`, `pos/sync-omie.ts`, `ppv/omie.ts`, `omie-massa/omie.ts`, `garantias/omie-faturamento.ts`, `financeiro/omie-contapagar.ts`, `dre-financeiro/omie-api.js`). Duas contas Omie (Nova / Castro) via `omie/contas.ts`. Tudo `fetch` POST direto, sem SDK.
2. **Motores analíticos.** DRE (`dre-financeiro/calc.js`, 2520 linhas), estoque (cruzamento por família, sugestão de compra, CMC, negativos), gestão de vendas, revisões-margem. É onde está o dinheiro.
3. **Operação POS/PPV.** OS → Requisição automática, catálogo de peças, etiquetas, orçamentos, garantias.
4. **Frota.** Abastecimento (CSV ∪ requisições), pendências (taxonomia Sistema›Subsistema›Componente), integração com Supabase de RH externo.
5. **Assistente Tratorilson.** Chat interno (OpenAI/Groq) + auto-atendimento WhatsApp via fork do ChatWoot (NovaZap) + Vigia das Câmeras (IA de visão).
6. **Governança.** Tickets, decisões, war-room, permissões, auditoria (audit_log, cmc_correcoes com HMAC).

### Fluxos-chave
- **Sync:** 38 GitHub Actions → `curl ${PORTAL_URL}/api/...` com `Bearer CRON_SECRET` → rota dispara sync **fire-and-forget** → grava Supabase via upsert. Frequências de 15min a diárias. Alguns schedulers vivem **in-process** (`instrumentation.ts`) porque crons do Vercel não disparam no Railway.
- **Leitura da UI:** páginas leem tabelas espelho do Supabase (rápido); algumas telas batem na Omie ao vivo (até 30s de espera sob rate-limit).
- **Auth:** login Supabase → sessão em **localStorage** → `useAuth` valida com `getUser()` → `usePermissoes` decide o que renderizar (cosmético). Rotas de API que se protegem chamam `autenticar()`/`exigirAdmin()` (validam JWT de verdade no servidor).

### Dependências externas (falha fora do seu controle)
Omie (2 contas, com bloqueio por consumo), OpenAI, Railway (1 instância), GitHub Actions, Supabase RH (projeto separado), fork ChatWoot em `c:\projetos\chatwoot` (fora deste repo), Gmail/SMTP, WhatsApp Meta (fora de produção), FIPE, ORS/Rotaexata.

### Decisões implícitas (nunca escritas, mas assumidas em toda parte)
1. **Uma única instância no Railway.** Schedulers in-process e locks em memória (`let syncEmAndamento`) só funcionam com 1 réplica. Documentado como "manter 1 instância" — operacional, não garantido em código.
2. **Service role no backend em vez de RLS + auth por rota.** Velocidade de entrega escolhida sobre defesa em profundidade. 204 rotas instanciam service role; só ~117 checam identidade.
3. **Fire-and-forget é o modelo de background.** Contorna o limite de ~5min do Railway, ao custo de não haver retomada.
4. **Idempotência por upsert best-effort** em vez de transações/fila durável.
5. **"Modo natural" sem backfill** (OS→requisição, abastecimento): dados históricos só se corrigem quando o registro é tocado de novo.
6. **`@supabase/ssr` está instalado mas não usado** — a intenção de migrar para cookies existe, nunca foi feita.

---

## Fase 2 — Premissas e o que quebra se forem falsas

| # | Premissa | O que quebra se falsa | Prob. de ser falsa | Sinal de alerta |
|---|---|---|---|---|
| 1 | **Railway roda exatamente 1 instância** | Crons duplicados, locks em memória inúteis, 2 syncs disputando a mesma chave Omie → bloqueio por "consumo indevido"; dados duplicados | **Média** (basta ligar réplicas/autoscale) | Logs `[estoque scheduler]` duplicados; faultstring "consumo redundante" em massa |
| 2 | **Ninguém chama as URLs de API direto** | ~500 rotas com service role expõem/gravam dados sem auth nenhuma | **Alta** (URLs estão no bundle JS público) | Alterações sem autor no audit_log; acessos anônimos a `/api/clientes` |
| 3 | **RLS está ligada nas tabelas lidas do cliente** | Anon key (pública, num `data-attribute` do DOM) lê/grava direto o banco | **Média-alta** (RLS confirmada só em poucas tabelas) | Query do cliente devolvendo escopo alheio |
| 4 | **A Omie não bloqueia a conta** | Syncs param; retries sem teto travam; UI segura 30s | **Já aconteceu** ("API bloqueada") | faultstring "consumo indevido"; crons em 502/timeout |
| 5 | **Deploys são raros e fora das janelas de sync** | Fire-and-forget morre no meio, sem retomada; saldos ficam stale sem sinalização | **Alta** (deploy é automático no push do main) | Backfill que "nunca termina"; CMC/estoque divergente |
| 6 | **localStorage + getUser basta para identidade** | Bug do "usuário fantasma" (já ocorreu) | **Média** (recorrência) | "Parece que tem outro usuário logado" |
| 7 | **Upsert best-effort = consistência suficiente** | `syncProjetos` perde updates; espelho diverge do Omie sem flag | **Média** | Status de projeto Omie ≠ portal |
| 8 | **CRON_SECRET protege os crons** | Se vazar/faltar, qualquer um dispara syncs pesados (custo/DoS Omie) | **Baixa-média** | Execuções fora de horário |
| 9 | **OpenAI fica no orçamento (~US$10/mês)** | Spike do Vigia/Tratorilson estoura fatura ou suspende a chave → assistente e filtro-trator degradam | **Média** | 429 da OpenAI; fatura |
| 10 | **Memória de conversa do Tratorilson não precisa persistir** | Redeploy zera o contexto → bot "esquece" o cliente (bloqueia WhatsApp real) | **Certa** (é em memória do processo) | Cliente reclama que o bot recomeçou do zero |
| 11 | **Encoding ASCII só importa no wrapper de ajustes** | pos/ppv/omie-massa gravam acentos corrompidos em cadastros/OS reais na Omie | **Média** | "peÃ§a" em produto/OS criado por esses módulos |
| 12 | **strict + build cobrem regressões** | Sem testes, DRE/CMC/estoque regridem silenciosamente (tipo continua válido) | **Alta ao longo do tempo** | Números de DRE/estoque "mudaram" sem motivo |
| 13 | **Fork ChatWoot externo continua no ar e compatível** | NovaZap para; Tratorilson não atende WhatsApp | **Média** (fora do repo, sem versionamento junto) | Erros no `TratorilsonListener` |

---

## Fase 3 — 30 ações concretas

### 10 MELHORIAS (nova capacidade / elevar o teto)

| # | Ação | Esforço | Risco |
|---|---|---|---|
| M1 | **Fachada Omie única** com fila global, rate-limit, retry com backoff+teto e encoding `\uXXXX` padronizado; os 9 wrappers passam a chamá-la | Alto | Médio |
| M2 | **Middleware de auth** cobrindo `/api` + wrapper obrigatório `exigir(modulo, acao)` por rota (reforça no servidor o que `usePermissoes` só decora) | Médio | Médio (quebra chamadas sem header) |
| M3 | **Migrar sessão para `@supabase/ssr` (cookies)** — já está no `package.json`; habilita proteção server-side real | Médio | Médio |
| M4 | **Fila de jobs durável** (tabela `job_queue` + worker com checkpoint) substituindo fire-and-forget; sobrevive a deploy | Alto | Baixo |
| M5 | **Observabilidade**: Sentry para erros + logger estruturado (hoje são 683 `console.*` soltos, zero APM) | Baixo-médio | Baixo |
| M6 | **Cache Omie unificado com TTL** para consultas de UI (some a espera de 30s sob rate-limit) | Médio | Baixo |
| M7 | **Testes golden** nos motores que mexem com dinheiro: DRE (`calc.js`), CMC, cruzamento-família — fixar entradas→saídas conhecidas | Médio | Baixo |
| M8 | **Helper único de resposta de API** (padroniza `{ error }`, status, e nunca vaza `e.message` cru) — hoje `error`×`erro`×`msg` coexistem | Baixo | Baixo |
| M9 | **Coluna `sincronizado_em/ok`** nas tabelas espelho + badge de staleness na UI (o dado velho hoje é invisível) | Médio | Baixo |
| M10 | **Persistir memória de conversa do Tratorilson** no Supabase — desbloqueia o WhatsApp real (hoje redeploy zera) | Médio | Baixo |

### 10 CORREÇÕES (defeitos concretos já identificados)

| # | Ação | Esforço | Risco |
|---|---|---|---|
| C1 | **Retry 429 sem teto** em `pos/sync-omie.ts:35-39` e `pos/omie.ts:132-136` → adicionar contador + limite (hoje pode travar indefinidamente sob bloqueio Omie) | Baixo | Baixo |
| C2 | **`syncProjetos` sem upsert** (`pos/sync-omie.ts:176-192`, read-then-insert) → trocar por `upsert onConflict`; hoje updates de status são perdidos | Baixo | Baixo |
| C3 | **`portal_permissoes` SELECT `USING(true)`** (`sql/p0-...:27-29`) → restringir a `authenticated`/próprio user; hoje o mapa de admins/permissões vaza para anônimo | Baixo | Médio (checar quem lê anon) |
| C4 | **Fallback `SERVICE_ROLE \|\| ANON`** (`auth/server.ts:20` e ~171 arquivos) → falhar explícito se a service key faltar (hoje degrada silenciosamente e insegura) | Baixo | Baixo |
| C5 | **Mutações sem auth**: `clientes/atualizar/route.ts:14` (só `autenticar`, sem `pode`), `clientes/criar/route.ts:88` (nenhum check) — e auditar as 229 rotas mutantes sem `autenticar` | Médio | Médio |
| C6 | **Encoding inconsistente**: aplicar o escape `\uXXXX` (só em `ajustes/omie.ts:67`) a todos os wrappers que **criam** cadastro/OS (pos, ppv, omie-massa) | Baixo | Baixo |
| C7 | **`omie-massa/omie.ts:19-33` sem retry algum** → tratar transientes ("Too many requests"/"consumo redundante") para não abortar o lote inteiro | Baixo | Baixo |
| C8 | **`.range()` sem `.order()` estável** (alerta em `abastecimento/requisicoes.ts:190`) → auditar todos os paginadores; sem ordem, somas pulam/repetem linhas | Baixo | Médio (dados errados hoje) |
| C9 | **Lock só em memória** (`produtos-sync.ts:31`) → advisory lock do Postgres ou linha de controle; hoje cron + botão manual rodam sync concorrente | Médio | Baixo |
| C10 | **anon key + URL em `data-attribute` do DOM** (`(portal)/layout.tsx:23-24`) → mover para endpoint autenticado do bug-reporter | Baixo | Baixo |

### 10 REAVALIAÇÕES (decisões a questionar)

| # | Questão | Esforço p/ mudar | Risco de manter |
|---|---|---|---|
| R1 | **Service role no backend em vez de RLS + auth por rota** — é o buraco central de segurança. Vale um plano de migração faseado | Alto | **Alto** |
| R2 | **1 instância no Railway como premissa arquitetural** (schedulers + locks in-process). Externalizar crons/locks tira a fragilidade | Alto | Médio |
| R3 | **9 wrappers Omie duplicados** — consolidar (M1) vs custo de tocar tudo | Alto | Médio |
| R4 | **Fire-and-forget + `maxDuration` como padrão de background** — migrar para fila (M4) | Alto | Baixo |
| R5 | **"Testes são luxo dado o ritmo"** — reavaliar dado que DRE/estoque/CMC movem decisões de dinheiro | Médio (cultura) | Médio |
| R6 | **Arquivos monolito** (`clientes/page.tsx` 3115 linhas, `calc.js` 2520, `BlocoVisaoGeral.tsx` 2794) — custo crescente de revisão/erro | Alto | Médio |
| R7 | **"Modo natural" sem backfill** — decidir por feature se o buraco de histórico é aceitável | Variável | Baixo-médio |
| R8 | **Fork ChatWoot fora do repo/versionamento** — dependência de produção sem CI/rastreio junto | Médio | Médio |
| R9 | **Vercel + Railway ao mesmo tempo** (CLAUDE.md cita ambos; crons só rodam no Railway) — qual é a fonte de verdade? | Baixo (decisão) | Médio |
| R10 | **`modulos_permitidos` como array de strings `modulo:acao`** — reavaliar vs modelo relacional quando o nº de módulos (~34) e ações crescer | Médio | Baixo |

---

## Fase 4 — Limites da análise e o que preciso de você

### O que eu não consigo avaliar daqui (e por quê)
1. **Estado real de RLS por tabela.** O MCP do Supabase não está autorizado nesta sessão. Sem isso, a premissa #3 (a mais perigosa) fica em aberto. → **Preciso:** autorizar o conector Supabase, ou colar o resultado de `SELECT relname, relrowsecurity FROM pg_class ...` + as policies.
2. **Config real do Railway** — nº de réplicas/autoscale, memória, histórico de OOM. Valida/derruba a premissa #1 e explica as ~13 quedas de julho. → **Preciso:** print do painel Railway (instâncias + métricas de memória).
3. **Perfil de tráfego Omie** — chamadas/dia, se a conta já encosta no limite. → **Preciso:** métricas/logs de rate-limit, se houver.
4. **Se as URLs de API já foram acessadas indevidamente** — não tenho logs de acesso de produção. → **Preciso:** logs do Railway/Supabase.
5. **Custo real da OpenAI hoje** (premissa #9). → **Preciso:** dashboard de billing.
6. **Quais das 216 migrations foram REALMENTE aplicadas** — várias na memória estão marcadas "PENDE"/"falta aplicar". → **Preciso:** confirmar no banco (ou autorizar o MCP).
7. **Frequência real de deploy vs janelas de sync** (premissa #5) e se `[safety-net]` aparece nos logs. → **Preciso:** histórico de deploy + grep dos logs.
8. **Estado do fork ChatWoot** (versão, divergência do upstream) — está fora deste repo.

### A pergunta que muda a priorização de tudo
*O que dói mais hoje* — (a) risco de segurança/vazamento, (b) confiabilidade dos números (DRE/estoque), ou (c) velocidade de entregar features? A Fase 3 muda de ordem conforme a resposta.

**Palpite pela evidência:** **R1 / M2 / M3 (segurança) e C1–C2 / M4 (confiabilidade dos syncs) são o núcleo.** Mas só você sabe se algo já está queimando.
