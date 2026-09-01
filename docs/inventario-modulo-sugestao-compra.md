# Inventário — antes do módulo de sugestão de pedido de compra

> **Data:** 2026-09-01
> **Fonte:** migrações em `sql/`, páginas em `src/app/(portal)/`, componentes em `src/components/`, workflows em `.github/workflows/`.
> O conector Supabase (MCP) não estava autorizado na sessão que gerou este doc, então o schema abaixo vem das migrações — as tabelas-base sincronizadas da Omie (`produtos`, `produto_tipo`, `Fornecedores`, `vendas_itens`, `recebimentos_nfe`) vivem no Supabase ao vivo (`citrhumdkfivdzbmayde`) e **não têm `CREATE TABLE` versionado no repo**; suas colunas foram inferidas de `ALTER`s e do uso no código.

---

## Parte 1 — Tabelas

Nota transversal: **nenhuma** tabela de estoque/recebimento em escopo tem RLS ligada nem FK formal (`REFERENCES`) — os vínculos (`id_receb`, `codigo_produto`, `responsavel_user_id`) são por convenção. Acesso é via API routes autenticadas + service-role key. Confirmado em `movimentacao-snapshots.sql` ("sem RLS") e `src/lib/estoque/supabase.ts`. Exceções com RLS ligada aparecem marcadas.

### Estoque e movimentação

**`estoque_movimentos`** — livro-razão de movimentos da Omie por item; base para reconciliar valor de estoque (CMC antes/depois). `sql/estoque-movimentos.sql`
- PK `mov_hash text`; `conta_omie`, `codigo_produto bigint`, `familia`, `grupo` (peca/maquina/ignorar), `data date`, `ano/mes int`, `cod_origem` (COM/VEN/AJU/REM/CTR/DVP/DCP/RRE), `des_origem`, `num_doc`, `qtde_anterior/atual`, `cmc_anterior/atual`, `qtde_entrada/saida`, `efeito`, `bucket`, `cancelado bool`, `sincronizado_em`.
- Índices: `(conta_omie, grupo, ano, mes)`, `(conta_omie, codigo_produto)`. RLS: não.
- ⚠️ `MovimentoEstoque` da Omie **não pagina** — cuidado ao reusar (`.order('mov_hash')` obrigatório para range estável).

**`estoque_movimentos_sync`** — checkpoint do backfill por produto. `sql/estoque-movimentos.sql`. PK `(conta_omie, codigo_produto)`; `ultima_data`, `movimentos int`.

**`estoque_familia_snapshot`** — snapshot mensal de valor por família. `sql/create-estoque-familia-snapshot.sql`. PK `(conta_omie, ano, mes, familia)`; `estoque_qtd`, `estoque_valor`. Índice `(ano, mes, conta_omie)`.

**`estoque_tipo_snapshot`** — snapshot mensal por "Tipo" (característica de Peças). `sql/create-estoque-tipo-snapshot.sql`. PK `(conta_omie, ano, mes, tipo)`; `estoque_qtd`, `estoque_valor`.

**`movimentacao_snapshots`** — snapshot compartilhável (hash) da tela Movimentação de Produto. `sql/movimentacao-snapshots.sql`. PK `hash`; `payload jsonb`, `expira_em` (+30d). Sem RLS (explícito).

### Recebimento de notas de fornecedor

> A fonte **`recebimentos_nfe`** (~14k linhas) NÃO é criada no repo — vive no Supabase externo. As migrações abaixo são a "camada nossa" por cima.

**`recebimento_meta`** — metadados (tipo manual + responsável + categoria) por `id_receb`. `sql/recebimentos-migration.sql` + `recebimentos-responsavel-cfop.sql`. `id bigserial` PK; `conta_omie`, `id_receb bigint`, `tipo` CHECK(almoxarifado/maquinas/pecas/pecas_garantia/combustivel), `tipo_manual bool`, `responsavel`, `codigo_categoria`, `responsavel_user_id uuid`, timestamps. UNIQUE `(conta_omie, id_receb)`; índices em conta/responsavel/user. Trigger touch. RLS: não.

**`recebimento_usuarios`** — pessoas para atribuição. `sql/recebimentos-migration.sql`. `id`, `conta_omie`, `email`, `nome`, `ativo`. UNIQUE `(conta_omie, nome)`.

**`recebimento_tipo_responsavel`** — mapa padrão tipo→usuário por conta. `sql/recebimentos-responsavel-cfop.sql`. UNIQUE `(conta_omie, tipo)`. Seeds (Jose Camargo, Vinicius Correa, Mariano).

**`recebimento_entrada_log`** — log de "dar entrada" + correção de CMC. `sql/recebimentos-responsavel-cfop.sql`. `acao` CHECK(dar_entrada/correcao_cmc), `payload/resultado jsonb`, `user_id`. Índices conta+receb, created_at DESC.

**`recebimento_pendentes_cache`** — cache do payload de pendentes por conta+janela (sobrevive a redeploy). `sql/recebimento-pendentes-cache.sql`. UNIQUE `(conta_omie, janela_de, janela_ate)`; `payload jsonb`.

**`cfop_entrada_map`** — mapa aprendido "CFOP saída fornecedor → CFOP entrada aceito pela Omie". `sql/recebimento-cfop-entrada-map.sql` + `-ncm.sql` (adiciona `ncm`, `qtd`; unicidade passa a `(conta_omie, ncm, cfop_saida)`). `origem` (aprendido/manual).

**`recebimento_classificacao_responsavel`** — responsável pela classificação do robô. `sql/recebimento-classificacao-responsavel.sql`. PK `conta_omie`; seed Danilo Correa.

**`recebimento_auto_familia_log`** — auditoria do robô "sem família → Peças". `sql/recebimento-auto-familia-log.sql`. `codigo_produto`, `familia_de/para`, `valor_unit`, `tipo_sugerido`, `tarefa_loc_id`, `tarefa_tipo_id`.

### Cadastro de produtos / peças

**`produtos`** (minúscula) — **sem CREATE no repo**. Cache de produtos da Omie por conta. Colunas por uso: `codigo_produto`, `conta_omie`, `estoque`, `cmc`, `valor_estoque`, `valor_unitario`. `sql/produto-enriquecimento.sql` adiciona (lazy-fill): `ncm`, `descricao_detalhada`, `ultima_entrada_{data,fornecedor,nf,qtde,custo}`, `cfop_garantia text[]`, `ultimo_custo_garantia`, `enriquecido_em`. Sem RLS.

**`produto_tipo`** — **sem CREATE no repo**. Classificação manual "Tipo" + família (só família Peças). Colunas: `conta_omie`, `codigo_produto`, `tipo`, `familia`. Repopulado via `/api/estoque/admin/repopular-produto-tipo`.

**`produto_fiscal`** — perfil fiscal editável. `sql/produto-fiscal.sql`. PK `(conta_omie, codigo_produto)`; blocos ICMS/ST/IPI/PIS/COFINS. Sem RLS.

**`produto_observacoes`** — observação por SKU. `sql/produto-observacoes.sql`. PK `codigo text`. **RLS ligada** (SELECT p/ authenticated; escrita só service role).

**`Produtos_Completos`** — sync Omie. `migration-to-main.sql`. PK `id_omie`; `Codigo_Produto` (SKU), `Descricao_Produto`, `Preco_Unit/Venda`, `CMC`, `Empresa`, `Caracteristicas` (add em `alter-produtos-caracteristicas.sql`). ⚠️ Esse mesmo ALTER **removeu** `Marca`, `Familia`, `Estoque`, `Estoque_Minimo`, `Modelo` desta tabela.

**Catálogo (Jivo/Mahindra):** `catalogo_figuras`, `catalogo_pecas` (FK `figura_id→catalogo_figuras`), `catalogo_modelos` (com `familia`). `sql/catalogo.sql`, `catalogo-modelos.sql`, `catalogo-familia.sql`. Índices trgm. Sem RLS.

**`peca_unidades` / `peca_unidade_eventos`** — rastreio por unidade (QR). `sql/create-peca-unidades.sql`. `status` CHECK, timeline imutável. **RLS ligada** (SELECT authenticated; escrita service role).

### Fornecedores

**`Fornecedores`** — **sem CREATE no repo**. Só `ALTER`s: `add-fornecedores-email.sql` (`email`), `add-fornecedores-endereco.sql` (estado/cidade/cep/endereco/numero/bairro). ⚠️ coluna `numero` já existente = **telefone** do fornecedor. Sem RLS/índice nesses arquivos.
- **Fábrica/montadora de peças: não encontrado.** Só entidade "montadora" para e-mail de garantias (`add-montadora-*.sql`), não fornecedor de estoque.

### Notas de saída / serviços (contexto de saída)

**`portal_nt_notas_saida`** (+ `_sync`) — espelho NF-e/NFS-e de saída. `sql/notas_saida_module.sql` + `notas-saida-pedido.sql`. PK `(conta_omie, tipo, n_cod_nf)`; ⚠️ conta em MAIÚSCULO aqui. Índices trgm cliente. **`os_servicos_itens`** — cache de itens de serviço de OS. `sql/os-servicos-itens.sql`.

### Não encontrado como tabela versionada
`vendas_itens`, `posicao_estoque`, `cmc_historico`, `recebimentos_nfe`, `produtos`, `produto_tipo`, `Fornecedores` — todas referenciadas mas vivem no Supabase externo `citrhumdkfivdzbmayde`, sem `CREATE TABLE` no repo.

---

## Parte 2 — Páginas

Gating: cada item de `src/app/(portal)/estoque/paginas.ts` tem `key` = slug da rota = chave de permissão (`estoque:<key>`), consumida por `EstoqueNav.tsx` e pelo gate `usePermissoes().pode('estoque', key)`. Conta NOVA/CASTRO/Todas via `ContaProvider`/`useConta` (`layout.tsx`).

| Rota | Arquivo | Faz | Lê de | Permissão |
|---|---|---|---|---|
| `/estoque` | `estoque/page.tsx` | busca produto: cadastro, estoque/custos, vendas, CMC, compras | `/api/estoque/buscar`, `/produtos/observacao`, `/estoque/cmc-historico` | `temAcesso('estoque')` |
| `/estoque/dashboard` | `dashboard/page.tsx` | dashboard Peças+Serviços / Máquinas, KPIs, drilldowns | `/api/estoque/dashboard` + subrotas | `pode('estoque','dashboard')` |
| `/estoque/cadastro-produto` | `cadastro-produto/page.tsx` | detalhe de produto (custos/margens, histórico CMC×venda) | `/api/estoque/produto-detalhe`, `/produto-historico` | `pode('estoque','cadastro-produto')` |
| `/estoque/movimentacao-produto` | `movimentacao-produto/page.tsx` | kardex ao vivo Omie + snapshot `?s=`, DANFE, PDF, CSV | `/api/ajustes/movimentacao*` | `pode('estoque','movimentacao-produto')` |
| `/estoque/notas-entrada` | `notas-entrada/page.tsx` | NF-e de fornecedores, contas a pagar, DANFE, CSV, jobs | `/api/estoque/notas-entrada*`, `/contas-pagar-nf`, `/danfe` | `pode('estoque','notas-entrada')` |
| `/estoque/recebimentos` | `recebimentos/page.tsx` | NF-e pendentes (Fase 2), dar entrada | `/api/ajustes/recebimentos*`, `.from('financeiro_usu')` | `estoque:recebimentos` **OU** `ajustes:recebimentos` |
| `/estoque/recebimentos-omie` | `recebimentos-omie/page.tsx` | espelho `recebimentos_nfe`, concluir/reabrir na Omie | `/api/estoque/recebimentos*`, `/omie-categorias` | `pode('estoque','recebimentos-omie')` |
| `/estoque/curva-abc` | `curva-abc/page.tsx` | **Pareto produto/cliente/família + aba Inativos**, CSV | `/api/estoque/curva-abc`, `/curva-abc/inativos` | `pode('estoque','curva-abc')` |
| `/estoque/giro-estoque` | `giro-estoque/page.tsx` | **giro = COGS anualizado ÷ valor estoque**, scatter, classes | `/api/estoque/giro-estoque` | `pode('estoque','giro-estoque')` |
| `/estoque/cruzamento-familia` | `cruzamento-familia/page.tsx` | estoque × entradas × saídas + Reconciliação | `/api/estoque/cruzamento-familia*`, `/perfil/ui-prefs` | ⚠️ `temAcesso('estoque')` (módulo, não a ação) |
| `/estoque/inteligencia-comercial` | `inteligencia-comercial/page.tsx` | 5 abas + **Sugestões sazonais / por produto** + mini-CRM | `/api/estoque/inteligencia-comercial*` | `pode('estoque','inteligencia-comercial')` |
| `/estoque/comissao` | `comissao/page.tsx` | comissões (config/pessoas/regras/serviços/vendas/custos) | `/api/estoque/comissao/*` | `pode('estoque','comissao')` |
| `/estoque/admin` | `admin/page.tsx` | categorias, meses zerados, popular cache, debug Omie | `/api/estoque/admin/*`, `/popular-cache` | `pode('estoque','admin')` |
| `/estoque/admin-cmc` | `admin-cmc/page.tsx` | enriquecer CMC, backfill modelo, auditoria CMC | `/api/estoque/admin/*`, `/backfill-modelo` | `pode('estoque','admin-cmc')` |
| `/estoque/ignorar-clientes` | `ignorar-clientes/page.tsx` | CRUD de CNPJs ignorados | `/api/estoque/ignorar-clientes*` | `pode('estoque','ignorar-clientes')` |
| `/requisicoes` | `requisicoes/page.tsx` | Kanban de requisições (inclui abastecimento/peças), realtime | `.from('Requisicao')`, `Fornecedores`, `financeiro_usu`… | `temAcesso('requisicoes')` + ações granulares |
| `/ppv` (+`/catalogo`,`/etiquetas`,`/unidades`,`/liberacao/[id]`) | `ppv/*` | pré-pedido de venda de peças, catálogo, rastreio QR | `/api/ppv/*`, `/api/pecas/unidades*` | `temAcesso('ppv')` + ações |

**Divergências:** `/estoque` e `cruzamento-familia` gateiam por módulo (`temAcesso`), não pela ação específica; `requisicoes/imprimir/[id]` e `ppv/etiquetas` não têm gate próprio na page.

---

## Parte 3 — Componentes reaproveitáveis

**Tabela ordenável genérica** — `src/components/abastecimento/TabelaOrdenavel.tsx`. Genérica sobre `<T>` apesar da pasta. Ordena por coluna (setas), filtro por coluna, sort locale pt-BR, "Mostrar mais" a cada 300. Props: `colunas: ColunaDef<T>[]`, `linhas`, `chaveLinha`, `carregando?`. `ColunaDef` = `{chave, titulo, direita?, valor, render}`.

**Toolkit de colunas** — `src/components/tabela/ConfigColunas.tsx`. Peças genéricas: `Sort`, `casaFiltroColuna` (numérico exato vs texto substring), `reconciliarOrdem` (ordem salva de colunas), `useIsTouch()`, seletor ocultar/reordenar colunas.

**PDF (servidor, pdfkit)** — padrão canônico `src/lib/ajustes/pdf-pedidos.ts` (clonado por `dre-financeiro/pdf-lista.ts`, `ajustes/pdf-movimentacao.ts`, `garantias/rat-pdf.ts`). Retorna Buffer, consumido por rotas `/api/**/pdf`. ⚠️ `serverExternalPackages:['pdfkit']` + `require().default`. Sem jsPDF/react-pdf/html2canvas no projeto.

**PDF (cliente, print)** — `src/components/requisicoes/TemplatePDF.tsx` (timbre nova/castro hardcoded). Props `{req, anexos?, onUpdate?, onPrint?}`.

**CSV** — mais próximo de genérico: `src/lib/financeiro/export.js` (`exportToPDF`/`exportToExcel`). Outros são por-tela.

**Chips de filtro: não há componente central** — só markup inline por feature (copiar de `requisicoes/Kanban.tsx`, `admin/PermissoesModulos.tsx`).

**Modais: não há wrapper genérico** — ~58 modais feature-specific. Reaproveitáveis-ish: pickers de busca (`ppv/ModalBuscaProduto.tsx`, `ModalBuscaCliente.tsx`, `ModalBuscaOS.tsx`) e o hook `src/hooks/useConfirm.js`.

### Padrão de permissões (para o módulo novo)
- **Hook** `src/hooks/usePermissoes.ts`: lê 1 linha de `portal_permissoes` por `user_id`. `temAcesso(modulo)` e `pode(modulo, acao?)`; `isAdmin = is_admin || is_dev`.
- **RLS** (`sql/p0-seguranca-rls-permissoes.sql`, `p1-rls-*.sql`): `portal_permissoes` e tabelas PII têm RLS com **SELECT `USING(true)`** e **nenhuma policy de escrita** → cliente não escreve; toda escrita via server route com `SUPABASE_SERVICE_ROLE_KEY` após checar admin.
- **Registro de módulo**: `const MODULOS` em `src/app/(portal)/admin/page.tsx` (~40 módulos) + um `paginas.ts` com `key:'<modulo>:<pagina>'`.
- **RPCs SECURITY DEFINER** (templates com checagem interna): cronograma (`create-cronograma-rpcs.sql`), war-room, tickets (`tickets_pode_ver`), opas (`resolver_opa`), sats (`concluir_sat`).
- **`audit_log`** (`sql/create-audit-log.sql`): `user_id UUID NOT NULL`, `user_nome NOT NULL`, `sistema`, `acao`, `entidade*`, `detalhes jsonb`. RLS SELECT-only. Escrita via hook `useAuditLog` → `POST /api/audit/log` (service role, **carimba `user_id` do token**, não do body).

---

## Parte 4 — Jobs e rotinas agendadas

- **GitHub Actions** (37 workflows; `curl` → `PORTAL_URL` + `Bearer CRON_SECRET`). Relevantes ao escopo:
  - **Robô classifica recebidos** — `ajustes-classificar-recebidos.yml` (08h + 13h UTC) → `/api/ajustes/cron/classificar-recebidos` → grava `portal_tarefas`, `recebimento_auto_familia_log`.
  - `estoque-sync-recebimentos.yml` (`*/15 9-22h`) → upsert `recebimentos_nfe`, atualiza `produtos.valor_unitario`, `recebimento_meta`.
  - `estoque-sync-produtos.yml` (05h) → upsert `produtos`. `estoque-sync-compras.yml` (06h30, `?meses=3`) → `compras_itens`. `estoque-sync-movimentos.yml` (05h20) → `estoque_movimentos`. Mais: sync-estoque, sync-incremental, sync-remessas, sync-selic, enriquecer-notas, backfill-cmc, backfill-os-servicos.
  - `ajustes-prewarm-recebimentos.yml` (07h) → cache de pendentes + minera `cfop_entrada_map`. `ajustes-scan-negativos.yml` (04h).
  - ⚠️ `snapshot-estoque` (snapshot mensal por família) tem rota mas **nenhum workflow apontando** — só disparo manual.
- **pg_cron / edge functions: não encontrado.** Só a tabela `cron_heartbeat` (`sql/cron-heartbeat.sql`), que não agenda nada — cada job carimba, vigia in-process lê.
- **Railway**: nixpacks, sem worker separado. Schedulers **in-process** em `src/instrumentation.ts` (1 instância só): financeiro auto-sync (5min, off por padrão), sync pasta-cliente (5min), robô Pós-Vendas (10min, prod), vigia de saúde dos crons (1h).
- **Alvos de cron**: rotas `/api/**/cron/**` checam `Bearer CRON_SECRET`.

---

## Parte 5 — Lacunas (não existe no projeto)

1. **Pedido de compra / sugestão de compra — não encontrado.** Nenhuma tabela, rota, lib ou integração Omie. `IncluirPedidoCompra` não existe. Única ocorrência de "pedido de compra" é `numero_pedido_compra` lido de `inf_adic` de NF em `clientes/sync/route.ts` (metadado informativo). "Pedidos" no portal = PPV/orçamentos de **venda**, não compra.
2. **Parâmetros de reposição por item — não encontrado.** Nenhum armazenamento de estoque mínimo editável, ponto de pedido, estoque de segurança, lead time ou múltiplo de embalagem. `estoque_minimo` só é **lido ao vivo da Omie** (PosicaoEstoque, `src/lib/estoque/omie.ts:109`) para exibição — nem persistido nem editável; `alter-produtos-caracteristicas.sql` até **removeu** `Estoque_Minimo` de `Produtos_Completos`.
3. **Curva ABC não é persistida.** A feature existe (rota + `src/lib/estoque/curva-abc.ts`), mas é **calculada em tempo real** (Pareto ≤80% A / ≤95% B / resto C) a partir de `vendas_itens`, `Produtos_Completos`, `produto_tipo`, `produtos`. Não há coluna/tabela de classe ABC.
4. **Fábrica / fornecedor de peças estruturado — parcial.** Existe `Fornecedores` (sem CREATE no repo, só endereço/email), mas sem tabela de fábrica/montadora de peças, sem lead time por fornecedor, sem vínculo item↔fornecedor preferencial.
5. **Componentes ausentes p/ reuso direto:** wrapper genérico de Modal, componente de chips de filtro. Existem tabela ordenável e helpers de PDF/CSV reaproveitáveis.

### Para o módulo novo, isto já dá base
Livro-razão (`estoque_movimentos`) e snapshots para consumo histórico; giro e curva ABC calculados; classificação de recebidos automatizada. **Faltará criar**: armazenamento de parâmetros de reposição por item, entidade de pedido de compra e (se for enviar à Omie) descobrir se há API de pedido de compra — hoje inexistente no código.

### Pendência de verificação
Colunas exatas de `produtos`, `produto_tipo`, `Fornecedores` e `vendas_itens` estão **inferidas** (tabelas sem CREATE no repo). Para o schema real, rodar o `information_schema.columns` no SQL editor do Supabase e completar.
