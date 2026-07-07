# Segurança do Portal — Plano P1 e P2

> Plano de correção de segurança da Nova Tratores, escrito pra ser lido e usado como checklist.
> Base: auditoria de julho/2026 (sem auth no servidor, sem RLS, segredos no código).
> O **P0** (mais urgente) já foi feito. Este documento cobre o que falta: **P1** e **P2**.
>
> Legenda de status: ✅ feito · ⏳ falta · ⏭️ pulado (decisão do usuário)

---

> **Atualizado 2026-07-07 — trabalho PAUSADO num bom ponto.** Tudo abaixo marcado ✅ está no ar e com SQL aplicado. Retomar pela cauda do Trilho B e pelo restante do P2 (o SSRF do chat é o próximo, ~1 linha).

## Onde estamos

| Fase | O que é | Status |
|------|---------|--------|
| **P0** | Estancar o pior (auth de admin, segredos fora do código) | ✅ completo |
| **P1 · Trilho A** | Rotas de ação exigirem login | 🟡 principais feitas; `contas-pagar` pulado + cauda de rotas |
| **P1 · Trilho B** | RLS nas tabelas (fechar acesso pela anon key) | 🟢 6 áreas sensíveis trancadas; falta a cauda |
| **P2** | Endurecimento (SSRF, injeção, XSS, webhooks, etc.) | 🟡 injeção `.or()` e SSRF do boleto feitos; resto pendente |

**Áreas com RLS já ativo (Trilho B):** `portal_permissoes`, `audit_log`, `financeiro_usu`, `clientes_*`, `garantia_*`, `feedback_*` — ou seja, todo dado sensível/PII.

O problema de fundo que tudo isso resolve: hoje a **anon key** (chave pública, que vai pro navegador de todo mundo) dá acesso ao banco, e as rotas de API **não verificam quem está chamando**. P1 fecha isso; P2 tapa os buracos que sobram.

---

## P1 — Fechar o acesso indevido

Dois trilhos, feitos em fatias e testados entre cada uma.

### Trilho A — Rotas de ação que passam a exigir login

Rotas que qualquer um chamava sem login e que fazem coisas sérias. Correção: exigir o token no servidor (`src/lib/auth/server.ts`) + o navegador manda o token (`src/lib/auth/client.ts`).

| Rota | O que faz | Status |
|------|-----------|--------|
| `assistente/executar` | Cria OS / PPV / orçamento / requisição | ✅ |
| `push/send` | Dispara push pra base inteira | ✅ |
| `financeiro/enviar-boleto` | Baixa URLs + manda e-mail pelo Gmail | ✅ (allow-list de URL → P2) |
| `assistente/chat` | Assistente IA (confiava no "isAdmin" do navegador) | ✅ |
| `financeiro/contas-pagar/*` | Cria conta a pagar no Omie, altera CNPJ de fornecedor | ⏭️ **pulado** |

**Ponto de honestidade:** a auditoria encontrou que **nenhuma** das ~382 rotas de API valida o usuário. O Trilho A tratou só o subconjunto mais perigoso. Ainda há muitas rotas mutantes sem checagem (ex.: `tarefas`, máquina de estados de `garantias`, ocorrências de `mecanicos`, IDOR no `notif-prefs`). O princípio geral — *toda rota que escreve deve checar auth no servidor* — ainda precisa ser aplicado no restante, aos poucos. Já existe um helper pronto pra isso (`exigirAdmin`/`autenticar` em `src/lib/auth/server.ts`, e `exigirPermissao` no módulo Ajustes).

### Trilho B — RLS nas tabelas

Ligar Row Level Security pra que a anon key não leia/escreva direto no banco. Feito **uma tabela por vez** (trancar errado quebra telas).

**Molde usado** (replicar em cada tabela):
1. Mover a escrita do navegador pra uma rota de servidor (service role + login, gravando a identidade do token).
2. Migrar leitores server-side que usam anon → service role.
3. SQL: `ENABLE RLS` + `SELECT TO authenticated` (mata leitura anônima) + sem política de escrita pro cliente (ou escrita só na própria linha).

| Tabela | Conteúdo | Status |
|--------|----------|--------|
| `portal_permissoes` | Permissões (admin/dev) | ✅ (no P0) |
| `audit_log` | Log de auditoria | ✅ |
| `financeiro_usu` | Usuários (nome, e-mail, ativo) | ✅ |
| `portal_nt_clientes_*` | **PII de clientes** (nome, doc, chassi) | ✅ |
| `garantia_*` | Garantias | ✅ |
| `feedback_*` | CRM / feedback de clientes | ✅ |
| `requisicao_autorizacoes` | Aprovação de valor alto | ⏳ próximo |
| `cronograma.*` | Cronograma (permissões dão acesso ao papel **anônimo** — pior caso) | ⏳ |
| Cauda longa | `requisicoes`, `lousa_*`, `opa`, `sat`, `tecnico_*`, snapshots de estoque, `tratorilson_memoria`, `EnvioBoleto`, `catalogo_*`, `omie_*`, etc. | ⏳ |

> **Padrão que acelera daqui pra frente:** os clients compartilhados `@/lib/pos/supabase`, `@/lib/ppv/supabase` e o novo `@/lib/server/supabase-admin.ts` usam `SERVICE_ROLE || ANON` — no servidor viram service role (ignoram RLS), no navegador degradam pra anon. Então os leitores de servidor já estão cobertos, e cada tabela nova costuma ser só o SQL de RLS (rodar **uma por vez** com `SET lock_timeout='5s'` — senão dá deadlock com o app em uso).

> Este trilho é o mais trabalhoso — são **dezenas** de tabelas. Prioridade: as que têm PII de cliente e as que dão acesso anônimo explícito.

---

## P2 — Endurecimento

Buracos pontuais, independentes do RLS.

### 1. SSRF (Server-Side Request Forgery) — 🟡 boleto feito, chat falta
`financeiro/enviar-boleto` ✅ (helper `src/lib/url-segura.ts` bloqueia URLs internas antes do fetch). **Falta o `assistente/chat`** (`coordsDoLink` baixa URL do usuário) — é só aplicar o mesmo `urlSegura`, ~1 linha.

### 2. Injeção de filtro `.or()` — ✅ feito
Helper `src/lib/busca-segura.ts` (`sanitizarFiltro`) aplicado em inspecoes+revisoes (os UPDATEs destrutivos), garantias/buscar-os/emails/os-elegiveis, sat/clientes, mapa/clientes, orcamentos, pos/lousa, catalogo.

### 3. Webhook do WhatsApp sem assinatura ⏳
O `POST /api/whatsapp/webhook` não valida a assinatura da Meta (`WHATSAPP_APP_SECRET`). Quem souber a URL manda mensagens falsas e **gasta crédito de IA / de mensagens**, e faz o número da empresa responder a qualquer telefone.
**Correção:** validar o HMAC `X-Hub-Signature-256`. (Só urgente se o WhatsApp já estiver ativo.)

### 4. Uploads sem validação ⏳
Anexos (garantias, fotos de técnico) não validam tipo/tamanho e vão pra bucket **público** com content-type escolhido pelo cliente — um `.html` malicioso vira **XSS hospedado no domínio confiável**.
**Correção:** validar tipo/tamanho, forçar content-type no servidor, buckets privados.

### 5. XSS via `dangerouslySetInnerHTML` ⏳
Telas que renderizam **e-mail recebido** (`revisoes`) e assinaturas do banco como HTML cru → script injetado roda na sessão de quem abre.
**Correção:** sanitizar o HTML antes de renderizar.

### 6. Usuário inativado continua com acesso ⏳
Inativar um usuário só o desloga no navegador; o **token dele continua válido** até expirar, então ele ainda pode falar com o banco/rotas.
**Correção:** revogar a sessão de verdade (server-side) ao inativar.

### 7. Login sem rate limiting ⏳
Sem limite de tentativas nem trava. **Correção:** rate limiting no login.

### 8. Crons "fail-open" ⏳ (baixo — já protegido na prática)
5 rotas de cron só exigem o segredo *se* `CRON_SECRET` existir. Como confirmamos que o `CRON_SECRET` **está setado**, elas já exigem o header hoje. Falta só religar o modo "fail-closed" como proteção extra caso o segredo seja removido no futuro. **Sem urgência.**

---

## Decisão pendente (sua)

**Rotação de segredos** — os segredos do Omie e a `service_role` do Supabase estão no **histórico do git**. Você optou por **não rotacionar** por ora (repositório privado). Fica registrado como decisão consciente; enquanto não rotacionar, quem tiver acesso ao histórico tem essas chaves. Rotacionar é a única forma de "queimar" o valor vazado.

---

## Ordem sugerida ao retomar

1. **SSRF do chat** (P2 nº 1) — ~1 linha, helper `urlSegura` já existe. Fecha o item.
2. **Trilho B — cauda** (`requisicao_autorizacoes`, `cronograma`, `lousa`, `opa`, `sat`, snapshots, etc.) — rápido por tabela (só SQL, uma por vez com `lock_timeout`).
3. **P1 Trilho A restante** — aplicar `autenticar`/`exigirAdmin` nas outras rotas mutantes (tarefas, garantias state-machine, mecanicos, notif-prefs IDOR, `contas-pagar` pulado…).
4. **Restante do P2** — WhatsApp HMAC (se for pra produção), uploads/XSS, revogar JWT de inativo, rate limiting.
