# War Room (Fase 1) — Roteiro de verificação (demo = auditoria dos critérios de aceite)

> Passo a passo para validar o módulo com dados reais, **um item por critério de aceite**.
> Cada item: **Ação** · **Esperado** · **Onde conferir**. Rodar depois de aplicar
> `sql/create-war-room.sql`. O objetivo é auditar, não só "clicar e olhar".

## Pré-requisitos

1. **Migration aplicada** (`sql/create-war-room.sql`) — rodar antes os **dois pré-checks** do topo do arquivo:
   - `pg_get_constraintdef` do `tickets_eventos_tipo_check` **em produção** (montar o drop+add a partir dele, não da lista do repo);
   - confirmar que `tickets.tipo` **não** tem CHECK.
2. **Servidor no ar** (`npm run dev` local, ou produção). `BASE` = a URL dele.
3. **Quatro usuários de teste** (uuids de `financeiro_usu`), com o módulo `war-room` no Admin:
   - **ADMIN** — configura a lista.
   - **NUCLEO** — membro nível núcleo.
   - **MEMBRO** — membro nível membro (na lista).
   - **FORA** — **não** está na lista, mas será **dono** de uma ação.
4. **Tokens** (`access_token`) de cada um: DevTools → Application → `supabase.auth.token` → `access_token`.
5. Variáveis do Supabase à mão: `SUPABASE_URL`, `ANON_KEY` (para os testes de RLS via PostgREST).

Atalho: `scripts/war-room-smoke.sh` exercita as rotas rapidamente antes do roteiro formal.

---

## Bloco A — Corte de sensibilidade núcleo/membro (o coração)

### A1. Payload do membro NÃO traz dado de núcleo *(critério central)*
- **Ação:** logado como **MEMBRO**, abrir `/war-room`; na aba **Network**, inspecionar a resposta de `GET /api/war-room`.
- **Esperado:** o JSON **não** contém: `caixa_30d/60d/90d`, `volume_antecipado`, nenhum objeto em `ponte.fontes`, `definicoes: []`, e `ata` só com decisões ligadas às próprias ações. `snapshots_lite: true`.
- **Onde:** aba Network (o **payload**, não a tela). Confirmar campo a campo.

### A2. Payload do núcleo traz tudo
- **Ação:** logado como **NUCLEO**, mesma inspeção.
- **Esperado:** `snapshots` com `caixa_*`/`volume_antecipado`; `ponte.fontes` populado; `definicoes` populado; `ata` completa. `snapshots_lite: false`.
- **Onde:** aba Network.

### A3. Dono fora da lista vê só as próprias ações + versão lite
- **Ação:** logado como **FORA** (dono de 1 ação, fora da lista), abrir `/war-room` e inspecionar o payload.
- **Esperado:** `acoes` contém **apenas** as ações de que ele é dono/participante; sentinelas em versão lite; sem caixa/ponte/definições.
- **Onde:** aba Network + tela.

---

## Bloco B — Garantias no banco (não só na UI)

### B1. Snapshot fechado é imutável (trigger)
- **Ação:** com a reunião da semana **fechada**, no **SQL Editor do Supabase** (service role):
  ```sql
  update war_room_snapshots set margem_semana = 0 where fechado_em is not null;
  ```
- **Esperado:** `ERROR: Snapshot da semana ... já foi fechado e é imutável.`
- **Onde:** saída do SQL Editor. Prova de que a imutabilidade mora no Postgres.

### B2. Ata é append-only (trigger)
- **Ação:** no SQL Editor:
  ```sql
  update war_room_decisoes set descricao = 'x' where id = '<uma decisão>';
  delete from war_room_decisoes where id = '<uma decisão>';
  ```
- **Esperado:** ambas falham com `ERROR: Ata do War Room é imutável ...`.
- **Onde:** SQL Editor.

### B3. Zero policy de escrita para `authenticated` (RLS)
- **Ação:** com o token de **qualquer** usuário (ex.: MEMBRO), tentar escrever via PostgREST:
  ```bash
  curl -s -o /dev/null -w "%{http_code}\n" -X POST "$SUPABASE_URL/rest/v1/war_room_ponte" \
    -H "apikey: $ANON_KEY" -H "Authorization: Bearer $TOKEN_MEMBRO" \
    -H "Content-Type: application/json" -d '{"nome":"hack","meta":1}'
  # repetir para war_room_acoes, war_room_snapshots, war_room_definicoes, war_room_decisoes, war_room_membros
  ```
- **Esperado:** `401`/`403` em **todas** (nenhuma policy de INSERT/UPDATE/DELETE). A escrita só existe via `/api/war-room/*` (service role).
- **Onde:** código HTTP de cada curl.

---

> ### ⚠️ Semana zero (para C/D/G)
> A ata é **append-only por design** — decisão de teste registrada fica no histórico para
> sempre. Então rode o ciclo (C/D/G) com itens prefixados **"TESTE —"** e **feche a reunião
> de teste na semana 03–09/ago** (a que o cron já criou). Ela vira a **"semana zero"** de
> validação, com os testes contidos nela; a primeira ata **oficial** começa limpa no snapshot
> seguinte. Melhor uma semana zero assumidamente de validação do que testes misturados na
> primeira ata real.

## Bloco C — Lista de acesso e promoção

### C1. Promoção a núcleo — acesso imediato, participação, log
- **Ação:** como **ADMIN**, em `/war-room/config`, promover **FORA** a **núcleo**. Sem novo login:
  1. como FORA, recarregar `/war-room` e inspecionar o payload;
  2. como FORA, abrir `/tickets/<ticket de uma ação war_room>`;
  3. no SQL Editor: `select * from war_room_membros_log where user_id = '<FORA>' order by created_at desc;`
- **Esperado:** (a) o payload agora traz tudo de núcleo **sem relogar**; (b) `/tickets/<id>` retorna a tela (não 404) e a timeline tem `participante_adicionado` (motivo "Entrou no núcleo do War Room"); (c) há uma linha `acao='add'`/`'update'`, `nivel='nucleo'` no `war_room_membros_log`.
- **Onde:** Network + tela do ticket + SQL.

### C2. Remoção corta o acesso imediatamente
- **Ação:** como ADMIN, remover FORA (botão lixeira). Como FORA, recarregar `/war-room`.
- **Esperado:** o payload volta à versão lite/própria **na hora** (sem cache de sessão que mantenha visibilidade). Linha `acao='remove'` no log.
- **Onde:** Network + SQL. *(No nosso contexto isso não é caso de borda.)*

---

## Bloco D — Ciclo da ação sobre o motor de tickets

### D1. Ação criada aparece na Fila do dono e no War Room
- **Ação:** como NUCLEO, criar uma ação (dono = MEMBRO). Como MEMBRO, abrir `/tickets?aba=fila` e `/war-room`.
- **Esperado:** a ação aparece na **Fila** do MEMBRO em `/tickets` (é um ticket) e no plano de ações do `/war-room` (link `#numero` → `/tickets/[id]`).
- **Onde:** as duas telas.

### D2. Status reflete sem código de sync + fechamento em 2 estágios
- **Ação:** como MEMBRO (dono), em `/tickets/[id]`, marcar **resolvido**. Como NUCLEO (solicitante), **confirmar e fechar**. Reabrir `/war-room`.
- **Esperado:** o status muda no `/war-room` sem qualquer sync (é o mesmo ticket); só o solicitante fecha (2 estágios).
- **Onde:** `/war-room` (coluna de status da ação).

### D3. Auto-fechar de 7 dias ignora `tipo='war_room'`
- **Ação:** inspecionar o filtro do cron (não precisa esperar 7 dias): `src/app/api/tickets/cron/auto-fechar/route.ts`.
- **Esperado:** a query tem `.neq('tipo', 'war_room')` — ações de recuperação só encerram com confirmação humana.
- **Onde:** o código (linha do `.neq`).

---

## Bloco E — Snapshot e cron

### E1. Cron idempotente + pendentes de automação
- **Ação:** chamar duas vezes:
  ```bash
  curl -s -X POST -H "x-cron-secret: $CRON_SECRET" "$BASE/api/war-room/cron/snapshot"
  curl -s -X POST -H "x-cron-secret: $CRON_SECRET" "$BASE/api/war-room/cron/snapshot"
  ```
- **Esperado:** 1ª → `created: true` + `pendentes_automacao` listando `caixa_30d/60d/90d` (e `volume_antecipado` se a rota de antecipações não respondeu); 2ª → `created: false` (`motivo: "já existe"`). Um snapshot só na tabela.
- **Onde:** resposta JSON + `select count(*) from war_room_snapshots where semana_inicio = '<segunda>'`.

### E2. Caixa manual + faróis
- **Ação:** como NUCLEO, "Digitar caixa da semana" com `caixa_90d` negativo; salvar.
- **Esperado:** `origem.caixa_90d = 'manual'`; `farol_caixa` recalculado (vermelho se negativo). Tentar editar após **fechar** → recusado.
- **Onde:** payload + tela.

---

## Bloco F — Definições e retro-vínculo

### F1. Definição só vira `decidida` com decisão na ata
- **Ação:** como NUCLEO, criar definição; tentar `PUT /api/war-room/definicoes` com `status: 'decidida'`; depois registrar uma decisão com `definicao_id` apontando para ela.
- **Esperado:** o PUT com `decidida` é **recusado** ("registre a decisão na ata"); ao registrar a decisão com `definicao_id`, a definição passa a `decidida` (na mesma operação) e a decisão fica na ata imutável.
- **Onde:** resposta da API + tela (status da definição).

### F2. Retro-vínculo decisão→ação (exceção cirúrgica do trigger)
- **Ação:** registrar uma decisão **sem** ação; depois "Virar ação" nela. Tentar "virar" de novo. No SQL, tentar `update war_room_decisoes set acao_id = '<outra>' where id = '<a decisão>';`.
- **Esperado:** após virar, a decisão sai da **pauta caso (c)** ("decisão sem ação vinculada"); a rota recusa um 2º vínculo ("já está vinculada"); o `update` de troca de `acao_id` é **recusado pelo trigger**.
- **Onde:** pauta na tela + resposta da API + SQL Editor.

---

## Bloco G — Pauta congelada (lite vs completa)

### G1. Reunião fechada mostra a versão certa por nível
- **Ação:** com uma reunião **fechada**, inspecionar o `pauta_congelada` do último snapshot como **NUCLEO** e como **MEMBRO**.
- **Esperado:** NUCLEO vê a pauta **completa** (inclui itens de caixa/definições); MEMBRO vê a **lite** (sem esses itens) — mesmo campo `pauta_congelada`, fonte diferente pela RLS (view lite expõe `pauta_congelada_lite` sob esse nome).
- **Onde:** aba Network dos dois usuários + selo "reunião fechada" na tela.

---

## Resumo (marcar ao passar)

- [ ] A1 membro sem dado de núcleo no payload · [ ] A2 núcleo completo · [ ] A3 dono fora vê só o seu
- [ ] B1 snapshot imutável · [ ] B2 ata imutável · [ ] B3 zero escrita RLS
- [ ] C1 promoção: acesso imediato + participante/evento + log · [ ] C2 remoção corta na hora
- [ ] D1 ação na fila e no war-room · [ ] D2 status reflete + 2 estágios · [ ] D3 auto-fechar ignora war_room
- [ ] E1 cron idempotente + pendentes · [ ] E2 caixa manual + faróis
- [ ] F1 definição→decidida só com ata · [ ] F2 retro-vínculo + 2º UPDATE recusado
- [ ] G1 pauta congelada lite/completa por nível
