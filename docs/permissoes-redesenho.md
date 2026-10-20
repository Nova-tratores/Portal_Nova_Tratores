# Redesenho das permissões de telas — registro das fases

> Roteiro aprovado pelo José em 13/10/2026: Fases 0–6, cada uma termina num gate. Nada avança sem aprovação explícita.
> Este arquivo é o registro: o que foi levantado, decidido e aplicado em cada fase.

## Fase 0 — Levantamento (13/10/2026, só leitura)

### Como é hoje

**Dados.** Uma linha por usuário em `portal_permissoes`:
- `user_id` (UNIQUE)
- `is_admin`, `is_dev` (Dev = Admin + extras)
- `categoria` (texto livre; é copiada para `financeiro_usu.funcao`)
- `modulos_permitidos text[]`
- `mecanico_role`, `mecanico_tecnico_nome`, `notif_silenciado`

O array mistura três formatos:
- `'pos'`: módulo inteiro, todas as ações menos as explícitas;
- `'estoque:notas'`: uma tela ou ação;
- `'frota:abastecimento:upload'`: três níveis.

Números em 13/10:
- 29 usuários, 7 admin, 5 dev, 66 chaves distintas.
- 12 usuários sem categoria.
- Contas desativadas em `financeiro_usu.ativo=false` ainda com módulos: Irneh, Mariano (conta antiga), Arthur.

**A tela não é uma entidade.** O caminho é sempre o mesmo: segmento da rota → id do módulo, e slug da sub-rota → ação (`pode(mod, slug)`). As listas de slugs vivem em:
- `estoque/paginas.ts`, `frota/paginas.ts`, ajustes e marketing (`paginas.ts`);
- `ACOES_POR_MODULO` em `lib/permissoes/catalogo.ts`;
- `TELAS` em `lib/dashboard/telas.ts`;
- `navItems` em `PortalLayout.tsx`;
- `systemToModulo` em `dashboard/page.tsx`;
- `MODULOS` em `admin/page.tsx`.

São seis listas que não conferem entre si. Por exemplo:
- `lousa` e `cronograma` não estão no Admin;
- o menu usa `mapa-geral` e a permissão usa `mapa`.

Inventário: 217 páginas em `(portal)` e 12 públicas.

**Onde é checado**

| Camada | Como |
|---|---|
| Middleware (`src/middleware.ts`) | Nenhuma checagem: só redireciona `/P/` |
| Páginas | No React, página a página ou no layout do módulo (`if (!pode) <SemPermissao/>`); não há gate central |
| API | `autenticar` (`lib/auth/server.ts`), `protegerRota`/`exigirPermissao`/`exigirAcessoModulo` (`lib/ajustes/permissao-server.ts`) e um helper por módulo (`temModuloFrota`, `guardarAgro`, `podePPV`…); cada um reimplementa a regra |
| RLS | `portal_pode(mod, acao)` (pni-03), `portal_pode_frota()`, `tickets_pode_ver`, `agro_tem_acesso`, `pops_eh_admin`, `war_room_nucleo` |
| Front | `usePermissoes` (`temAcesso`, `pode` → `permite()` em `lib/permissoes/explicitas.ts`) |

**Regras escondidas no código**
- **Central de Trabalho:** quem tem `tickets`, `tarefas` ou `cronograma` abre as três.
- **Pendências:** `pendencias` também passa para quem tem `frota`.
- **Ações explícitas:** `pos:faturar` e `pos:modelos_fiscais` não vêm com o módulo inteiro.
- **Financeiro:** a "faixa" (home-pecas × home-posvendas) é escolhida por `financeiro_usu.funcao`, não por permissão.

### Permissões soltas que são níveis da mesma tela

| Tela | Hoje | Proposta |
|---|---|---|
| /estoque/notas | `estoque:notas` + `estoque:notas-xml` | ver + baixar |
| /pos | `pos` + `pos:faturar` (explícita) + `pos:modelos_fiscais` (explícita, tela própria) | ver/editar + ação faturar; modelos-fiscais vira tela |
| /ppv | `ppv:faturar` (normal) | ação faturar (tornar explícita, como no POS?) |
| /conhecimento | `editar`, `publicar` | editar < aprovar |
| /painel-mecanicos | `aprovar_requisicao`, `recusar_requisicao` | aprovar |
| /ajustes/pedidos, /ajustes/remessas | `pedidos:encerrar`, `remessas:fechar` | editar |
| /frota/* | `X` + `X:editar`, `abastecimento:upload` | ver < editar |
| /marketing | `relatorio:enviar` (manda e-mail para fora) | ação explícita |
| /pops | `pops:admin`, `pops:executar` | ver < executar < administrar |
| CRUD genérico (requisições, orçamentos, propostas, avisos, tarefas) | criar/editar/excluir/mover_fase… | editar (granularidade fina só onde alguém a usa hoje — ver Gate 2) |

### Checagens só no front (sem proteção no back)

1. **A chave anônima, sem login, lê dados.** Testado em 13/10 com a anon key: devolvem linhas `finan_pagar`, `finan_rh`, `Chamado_NF`, `Formulario`, `Requisicao`, `orcamentos`, `tratores`, `portal_opas`, `Ordem_Servico`, `pedidos` e o próprio `portal_permissoes` (policy `USING (true)`). Fechadas: Frota, PNI, POPs, Tickets, Agro.
2. **387 de 760 rotas `/api` não têm nenhuma checagem de usuário.** Busca ampla: nem `autenticar`, nem token, nem cron secret. Exemplos: quase todo `dre-financeiro/*`, `garantias/*` (inclusive a rota principal), metade de `pos/*` (`ordens`, `fase`, `omie`), `estoque/admin/*`, `ajustes/pedidos|inventario|remessas`, `clientes/sync*`, `visual-estoque/mover`. Além disso, `perfil/notif-prefs` e `perfil/ui-prefs` aceitam `user_id` do corpo.
3. **Cerca de 25 rotas checam só o login, não o módulo:** `ajustes/caracteristicas/*`, `ajustes/localizacao`, `financeiro/enviar-boleto`, `tratorilson/*`, `pos/ordens/[id]/assinatura`…
4. **O servidor ignora as ações explícitas.** `exigirPermissao`, `protegerRota` e `exigirAcessoModulo` deixam passar `pos:faturar` para quem tem só `pos`. O faturamento escapa porque usa `permite()`.
5. **Páginas sem gate nenhum:**
   - todo `/financeiro/*` menos a raiz e `novo-*`;
   - `/crm/*`, `/cronograma/*`, `/clientes/relatorios`, `/clientes/projeto`, `/agenda-tecnicos`, `/meu-painel`, `/requisicoes/imprimir/[id]`.

### Proposta de esquema ajustada ao que existe

```
telas(id 'estoque.notas', nome, categoria_menu, responsavel, ativo)
tela_rotas(tela_id, padrao)          -- uma tela pode ter várias rotas
conjuntos(id, nome, tipo departamento|pacote)
conjunto_telas(conjunto_id, tela_id, nivel)
usuario_conjuntos(user_id, conjunto_id)
usuario_overrides(user_id, tela_id, nivel, tipo extra|bloqueio, expira_em, motivo NOT NULL, criado_por, criado_em)
tem_permissao(tela, nivel) SECURITY DEFINER sobre auth.uid()  +  view permissoes_efetivas(user, tela, nivel, origem)
```

- **Níveis:** `ver < editar < gerir`, em hierarquia.
- **Ações sensíveis** (`pos.faturar`, `estoque.notas.xml`, `marketing.relatorio-enviar`…) viram telas-filhas sem rota, e por isso nunca vêm com o módulo.
- **Ficam em `portal_permissoes`:** `is_admin`/`is_dev`, `mecanico_role` e `notif_silenciado`.
- **Backfill:** conjunto por departamento + extras individuais, com diff zero contra a regra de `permite()`.
- **"Quem tem acesso a esta página" (só Dev):** botão no cabeçalho que lê `permissoes_efetivas` pela rota atual (via `tela_rotas`). Entra no fim da Fase 2, só leitura.

### Gate 0 — decisões do José (13/10/2026)
1. **Henri e Vinicius:** não são a mesma pessoa. A conta "Irneh" (hf.hioni@) é do Henri, assim como "Henri Irneh" (financeiro@).
2. **Empresa:** fica fora do vínculo usuário–conjunto. Hoje nada separa NOVA × CASTRO.
3. **Fase 3 dividida:**
   - **3a:** função nova + helpers + RLS das tabelas lidas pelo navegador;
   - **3b:** as 387 rotas sem guarda, módulo a módulo.
4. **Esquema e níveis:** aprovados.

## Fase 1 — Análise de uso corrigida (13/10/2026)

**Script:** `scripts/permissoes-uso-cruzamento.mjs`. Veio do `c.mjs`, agora busca os dados sozinho via curl. Rodar com `node scripts/permissoes-uso-cruzamento.mjs [--dias 90] [--json f]`.

**O que corrigiu:**
- **Contas do Henri:** as duas contas contam como T.I. A conta "Irneh" tinha categoria Pós Vendas e era ela que inflava o setor.
- **Uso pontual:** passou a ser "todos os dias numa janela de 7 dias **e** parou há mais de 7 dias". Assim, quem só aparece no monitor (desde 07/10) não é descartado.
- **Nomes do audit_log:** são comparados sem espaços nas pontas e sem sufixo entre parênteses.

**Os 2 registros "sem dono" da Fase 6:** são do Vinicius. O rastreio do PPV gravou em 26/08 o id zerado e o nome "Vinicius Correa (cancelamento do PPV)".

**Limites da amostra** (por isso "sem uso" ≠ "não usa"):
- O `audit_log` cobre bem só requisições, financeiro, POS, PPV, conhecimento e propostas.
- O monitor de páginas tem 6 dias.
- Reavaliar em ~06/11.

### Gate 1 — aprovado pelo José (13/10/2026)
Ajustes aceitos nos templates v1:
- Comercial ganha PPV (nível ver).
- Painel Omie sai do Pós-Vendas.
- Lousa e Mecânicos ficam no Pós-Vendas como "a validar".
- Feedbacks fica no Pós-Vendas.
- Peças segue rascunho.
- Propostas fica no Comercial.

## Fase 2 — Esquema + migração sem mudança de acesso (14/10/2026)

**Migration:** `sql/permissoes-v2.sql`. Só acrescenta, é idempotente e nenhum código de produção lê dela ainda.
- **Tabelas:**
  - `perm_telas` (id = a chave que o código já usa; `explicita`; `responsavel`);
  - `perm_tela_rotas` (rota → tela + `alternativas` para as páginas com "OU");
  - `perm_conjuntos` (`departamento|pacote`), `perm_conjunto_telas`;
  - `perm_usuario_conjuntos`, `perm_usuario_overrides` (`extra|bloqueio`, `expira_em`, motivo obrigatório).
- **Regra única:** `perm_efetivas(user, tela?)`, SECURITY DEFINER. Em volta dela:
  - `tem_permissao(tela, nivel)` para o logado;
  - `tem_permissao_de` (só service role);
  - a view `permissoes_efetivas`: cada um vê o seu, admin e service role veem todos, anon é revogado.
- **Herança:**
  - `gerir` desce para tudo o que está dentro, menos as telas explícitas;
  - ter algo dentro dá `ver` no pai;
  - bloqueio vence e desce;
  - override vencido é ignorado;
  - admin/dev = tudo.
- **RLS:** todas as tabelas `perm_*` com escrita só para admin (`perm_eh_admin()`). O catálogo é lido por qualquer logado. Vínculos e overrides: só os próprios.

**Backfill:** `scripts/permissoes-v2-sync.ts` (sem `--gravar` só simula). Lib pura `src/lib/permissoes/backfill.ts`.
- Um departamento por categoria de hoje, com o que todos dela já têm em comum.
- O resto vira extra, com motivo de backfill.
- Chave desconhecida vira tela "Legado": `financeiro:editar_cards` e `patrimonio`, que nenhum código usa.
- Simulação de 14/10: 233 telas, 170 rotas, 5 departamentos, 224 extras. **Diff local = 0** (29 usuários × 233 telas).

**Diff contra o banco:** `scripts/permissoes-v2-diff.ts` compara a regra de hoje (as funções reais `permite`/`podeTelaFrota`/`podeTelaMarketing`) com a view do banco. Sai com código 1 se houver qualquer diferença.

**Espelho e testes:** `src/lib/permissoes/resolver.ts` é uma cópia em TypeScript da função SQL, só para testes e diff. O portal não decide nada por ele. `__tests__/permissoes-v2.test.ts` tem 20 testes, incluindo ~90 mil comparações sorteadas contra a regra de hoje.
- **Única diferença conhecida e aceita:** quem tem só uma ação de 3 níveis (`ajustes:pedidos:encerrar`) passa a ter `ver` na tela do meio (`ajustes:pedidos`). Frota e Marketing já funcionavam assim. Hoje ninguém tem uma chave dessas sem a tela do meio.

**Painel "Quem acessa" (só Dev):**
- Botão no canto inferior esquerdo de toda página (`components/permissoes/QuemAcessa.tsx`) e rota `GET /api/permissoes/quem-acessa?rota=`.
- Mostra a tela da rota, as alternativas e quem tem e quem não tem acesso, com origem, nível e selos DEV/ADMIN/INATIVO.
- Põe hoje × v2 lado a lado e marca em vermelho quem diverge.
- Sem a migration, mostra só a regra de hoje.
- Catálogo de telas e rotas em `src/lib/permissoes/telas.ts`. Ele espelha o gate que cada página faz hoje, conferido página a página em 13/10.

**Achado ao montar o painel:** quem tem qualquer coisa do módulo Financeiro abre o DRE inteiro, porque o layout do DRE aceita `temAcesso('financeiro')`. Isso inclui Danilo, Larissa, Nicolly e Pollyane. É a regra de hoje e entra na revisão da Fase 5.

### Fase 2 — ajuste "só Dev" (14/10/2026)
- O `main` ganhou, por outra sessão, `ACOES_SO_DEV` (`pos:faturar`, `pos:cancelar_faturamento`, `pos:substituir_omie`): Dev tem sempre; admin comum só se a ação for marcada para ele. Também `financeiro:editar_cards` virou explícita.
- O backfill gravado com o código antigo deu **21 diferenças** contra o `main`, todas nessas telas. Ninguém foi afetado, porque nada lê a v2 ainda.
- Correção: `sql/permissoes-v2-02-so-dev.sql` (coluna `perm_telas.so_dev` + `perm_efetivas` com Dev × admin comum) e espelho/testes com `Papel {admin, dev}`. Diff local com o código do `main`: 0 (29 × 241).
- Lição: rodar sync/diff **sempre a partir do `main` atualizado**. O catálogo de telas sai do código, e uma regra nova em `explicitas.ts` muda o resultado.
- `sql/permissoes-v2-02-so-dev.sql` **APLICADA 15/10/2026**. Backfill regravado a partir do `main` 8c699076. **Diff contra o banco = 0** (29 × 241 = 6.989 comparações).
- **Teste de segurança com usuários reais (15/10):**
  - Usuário comum (Mecânico Teste): lê o catálogo, não vê vínculos nem extras de outros, a RLS barra quando ele tenta se dar acesso, `tem_permissao_de` de outra pessoa é negado e `tem_permissao('pos')` dá false.
  - Dev: `tem_permissao('pos:faturar')` dá true.
  - **Achado:** a view `permissoes_efetivas` negava o próprio resultado ao usuário logado, porque o EXECUTE de função dentro de view é conferido para quem consulta. Corrigido em `sql/permissoes-v2-03-view-propria.sql` com `perm_efetivas_visiveis()`, sem parâmetro de usuário.
- `sql/permissoes-v2-03-view-propria.sql` **APLICADA 15/10/2026**. Novo teste com usuários reais:
  - O usuário comum vê só a própria linha na view (0 sem nada; com um extra temporário em `estoque:notas`, vê `estoque:notas` e `estoque` por herança).
  - `estoque:notas-xml` continua negado.
  - O extra vencido de `pos` é ignorado.
  - Chamar `perm_efetivas(<outro>)` dá "permission denied".
  - Anônimo é negado.
  - O Dev vê todos.
  - Extra de teste apagado.
- Build limpo no worktree (`C:/wt_perm`, `npm ci` próprio — com `node_modules` em junction o Turbopack recusa: "Symlink node_modules is invalid").

## Fase 3a — checagens na v2 + modo sombra (15/10/2026)

### Mapeamento de quem lê o banco com a chave pública (antes de fechar RLS)

**Apps de fora no mesmo Supabase:**

| App | Chave | Usa sem login (anon) |
|---|---|---|
| Proposta-Comercial (SPA antigo, último commit 02/2026) | anon no código | Clientes, Configuracoes, Equipamentos, Formulario, Proposta_Fabrica, cad_trator, storage `equipamentos` |
| Dashboard Agro externo | anon no código (`index.html`, `upload.html`, scripts Python) | `tratores`, `lupa_*`, `municipio_*`, `hidrologia_municipio`, `temperatura_municipio`, `renagro_registros`, `pecuaria`, `lavouras_*` + RPCs `lupa_*`/`distinct_culturas*` |
| NT_Mecanicos (app dos técnicos) | anon + login; as rotas do servidor dele usam anon puro | anon: Clientes, checkin_diario, frota_donos_relatorio, rastreio_pontos_relatorio, maxspeed_tile_cache, push_subscriptions, tecnico_veiculos. Logado: Ordem_Servico, Requisicao, garantias*, portal_permissoes, portal_notificacoes, pedidos, financeiro_usu… |
| CRM (vendas-pwa) | anon + login (authenticated) | — (precisa de policy para authenticated: visitas, negocios, vendedores, Clientes, catalogo_*…) |
| gestao-vendas (antigo) | anon + login | — (comissao_*, vendas_itens, clientes, produtos…) |
| Contas a Pagar (antigo, portado para /dre-financeiro) | anon no servidor | contas_pagar, contas_receber, notas_entrada, produtos, vendas_itens, dre_cache… — confirmar se ainda roda no Railway |
| Omie CMC Garantia (antigo) | service role | não é afetado por RLS |

O Chatwoot fork e o vigia de câmeras não estão nesta máquina. Pelo CLAUDE.md, os dois falam com a API do portal, não direto com o Supabase.

**Páginas públicas do portal que usam anon no navegador:**
- `/tv-painel`: `portal_permissoes`, `Ordem_Servico`, `agenda_visao`, `tecnico_caminhos`, `tecnico_veiculos`.
- `public/bug-reporter.js`: INSERT em `bug_reports` e upload no bucket `bug-reports`, sempre como anon.
- `public/mapa-geral/*`: chave anon no código; dentro do portal herda a sessão.
- Todo o resto (`/q`, `/assinar`, `/cheque`, `/garantia`, `/e`, `/carrinho`, `/g`, `/p`) passa por `/api` com service role.

**O portal pelo navegador:** cerca de 105 tabelas/views/buckets, muitas gravadas direto do navegador. O Financeiro grava `Chamado_NF`, `finan_pagar` (também a partir de Requisições), `finan_receber`, `finan_rh`, `EnvioBoleto` e `mensagens_chat`, e escuta Realtime nelas.

**Consequência:** fechar tabela por tabela, conferindo esta lista; nunca `revoke` em massa do anon. Antes de tocar em `portal_permissoes`, `Ordem_Servico`, `tecnico_*` ou `tratores`, mover a `/tv-painel` e o bug-reporter para `/api` e combinar o NT_Mecanicos e o Dashboard Agro.

### Etapa 1 — Financeiro sem anon
- `sql/permissoes-v2-05-financeiro-sem-anon.sql`: só `REVOKE ALL … FROM anon` em `Chamado_NF`, `finan_pagar`, `finan_receber`, `finan_rh`, `EnvioBoleto` e `mensagens_chat`.
- Antes: todas, menos `EnvioBoleto`, devolviam linhas ao anon. Usuário logado não muda.
- A restrição por módulo vem depois. Hoje até o "Mecânico Teste", sem módulo nenhum, lê essas tabelas, e as sub-páginas do Financeiro não têm gate. Restringir tira acesso de gente logada, então entra no relatório de impacto da Fase 5.

### Modo sombra nas rotas
- `sql/permissoes-v2-04-sombra.sql`: `perm_sombra` (agregado por dia × usuário × tela × rota × resultado antigo/v2) + RPC `perm_sombra_registrar`.
- `src/lib/permissoes/sombra.ts` (puro, 4 testes) e `sombra-server.ts`: cache de 60 s das telas efetivas por usuário, buffer e flush de 60 s no `instrumentation.ts`.
- Os três helpers genéricos (`exigirPermissao`, `exigirAcessoModulo`, `protegerRota`, 67 rotas) passam pelo `decidirPermissao`.
- `PERM_V2`:
  - `sombra` (padrão em produção): a regra antiga decide e a v2 é registrada;
  - `on`: a v2 decide e a antiga vira a sombra; se o banco falhar, cai na antiga;
  - `off`: nada.
- **Divergências esperadas** (bugs da regra antiga que a v2 corrige):
  - as ações explícitas e só-Dev (`pos:faturar`…) passam na regra antiga para quem tem `pos` puro;
  - `exigirPermissao(modulo)` sem ação nega quem só tem `modulo:x`.

### Leitura da sombra e espelho automático (20/10/2026)
- **5 dias de sombra (15–20/10):** 2.000 checagens, 10 pessoas, 81 rotas; 97% iguais.
- **As 57 divergências eram cópia velha, não erro de regra:**
  - 55: tela `estoque:dashboard-maquinas`, criada por outra sessão depois do catálogo gravado;
  - 2: `estoque:notas` da Larissa, dada no Admin em 19/10.
  - 7 usuários foram editados depois do backfill e a v2 não acompanhava.
  - `pos:faturar` não apareceu porque o faturamento pelo portal segue desligado.
- **Espelho** (`src/lib/permissoes/espelho-server.ts`, plano puro `planejarEspelho` em `backfill.ts`, 5 testes):
  - **Quando roda:** catálogo de telas e rotas do código + usuários 1 min depois do boot; usuários a cada 10 min; e o usuário salvo no Admin logo depois do POST `/api/admin/permissoes`.
  - **O que toca:** só o que o backfill criou (vínculo de departamento com `criado_por` nulo e extras com `MOTIVO_BACKFILL`).
  - **Departamento:** só entra quem tem todas as telas dele; ninguém ganha acesso.
  - **Chave inválida:** é ignorada e logada, não derruba a rodada.
  - **Desligar:** `PERM_ESPELHO=off`, ou `PERM_V2=off`.
  - **Na mão:** `npx tsx --env-file=.env.local scripts/permissoes-v2-espelhar.ts`.
- **1ª rodada (20/10):** acertou 7 de 30 usuários. Catálogo com 256 telas e 181 rotas. **Diff = 0** (30 × 256 = 7.680).
- `is_diretor` (coluna nova, de outra sessão) só autoriza comissão dos técnicos, não libera tela: fica fora da v2.
- **Quando o Admin novo (Fase 4) for a fonte, o espelho sai** (`PERM_ESPELHO=off`).
