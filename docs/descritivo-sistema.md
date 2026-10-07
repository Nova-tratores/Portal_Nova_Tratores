# Portal Nova Tratores — Descritivo do sistema

> Levantado direto do código em 15/09/2026 (branch `main` + trabalho local não commitado).
> Contagens feitas por varredura de `src/`, `sql/` e `.github/workflows/`.

## 1. Números gerais

| Item | Total | Como foi contado |
|---|---:|---|
| Telas (páginas) | **192** | arquivos `page.tsx/js/jsx` em `src/app`, fora de `/api` |
| Rotas de API | **662** | arquivos `route.ts/js` em `src/app/api` |
| Tabelas e views usadas pelo app | **~295** | nomes distintos em `.from('...')` (300 nomes, descontando 3 buckets de storage e contando 17 views) |
| Tabelas com migration versionada | **179** | `CREATE TABLE` em `sql/` (237 arquivos de migration) |
| Views SQL | **17** | `CREATE VIEW` em `sql/` |
| Funções SQL (Postgres) | **34** | `CREATE FUNCTION` em `sql/` |
| RPCs chamadas pelo app | **17** | `.rpc('...')` em `src/` |
| Triggers | **27** | `CREATE TRIGGER` em `sql/` |
| Funções de biblioteca (TypeScript) | **1.424** | `export function` / `export const x = (` em `src/lib` (339 arquivos) |
| Componentes React | **273** | arquivos em `src/components` |
| Crons (GitHub Actions) | **41** | workflows em `.github/workflows` |
| Testes automatizados | **601** casos em 42 arquivos | vitest |
| Linhas de código | **~300 mil** | `.ts/.tsx/.js/.jsx` em `src/` |

Stack: Next.js 16 (App Router, TypeScript), Supabase (Postgres + Auth + Storage + Realtime), deploy no Railway. Integrações: Omie ERP, Gmail, OpenRouteService, Rotaexata (GPS), Chatwoot/NovaZap (WhatsApp), OpenAI (Tratorilson e visão), DVR Intelbras (Vigia das Câmeras), Supabase do RH.

Modelo de acesso: módulos em `portal_permissoes.modulos_permitidos` (módulo puro = acesso total; `modulo:acao` = granular), papéis Usuário / Admin / Dev. Catálogo dos módulos em `src/lib/permissoes/catalogo.ts`, agrupados na tela Admin em **Serviços, Peças, Financeiro, Comercial, Estoque, Frota, Ajustes, Outros**.

---

## 2. Os sistemas (módulos) e o uso de cada um

Os 192 telas e 662 rotas se distribuem em 8 grupos. Abaixo, cada sistema com telas, APIs e tabelas principais.

### 2.1 Serviços (faixa azul, layout `(portal)/(servicos)`)

| Sistema | Telas | APIs | Uso resumido | Tabelas principais |
|---|---|---:|---|---|
| **Pós-Vendas (OS)** `/pos` | 1 (Cards / Relação / Dashboard + mobile) | 47 | Ordens de serviço da oficina: criação, fases, técnicos, peças, alimentação, envio à Omie, PDF, NFS-e. Alimentação lançada na OS vira Requisição automática. | `Ordem_Servico`, `Ordem_Servico_Tecnicos`, `os_servicos_itens`, `os_nfse`, `os_mensal`, `logs_ppo`, `configuracoes_pos`, `pos_emails` |
| **Garantias** `/garantias`, `/g/[id]` | 2 | 36 | Solicitação de garantia (SG) à montadora, peças, anexos, aprovação/recusa, cobrança ao cliente, devoluções, e-mails. | `garantias`, `garantia_pecas`, `garantia_anexos`, `garantia_montadoras` |
| **Controle de Revisões** `/revisoes`, `/revisoes/mahindra` | 2 | 7 | Revisões periódicas dos tratores (50/300/600...), lembretes, e-mails, observações por trator. | `tratores`, `revisoes`, `Tratores_Revisao`, `revisao_lembretes`, `revisao_emails`, `revisao_destinatarios`, `trator_observacoes` |
| **Janela Mecânicos** `/mecanicos`, `/painel-mecanicos`, `/agenda-tecnicos` | 3 | 2 | Jornada e agenda dos mecânicos de campo, alertas, notificações push, ocorrências, resumo diário. | `agenda_tecnico`, `tecnico_veiculos`, `tecnico_caminhos`, `mecanico_alertas`, `mecanico_notificacoes`, `mecanico_ocorrencias`, `resumo_diario_tecnico`, `push_subscriptions` |
| **SAT Digital** `/sat` | 1 | 1 | Solicitações de atendimento técnico em Kanban (RPC `concluir_sat`). | `portal_sats` |
| **Mapeamento Técnico** `/mapa-geral` | 1 | 2 | Mapa de clientes, técnicos e rotas (GPS Rotaexata, geocode). | `GPS_Viagens`, `clientes_coordenadas`, `geocode_cache`, `mapa_config` |
| **Fotos Técnicos** `/fotos-tecnicos` | 1 | — | Fotos anexadas pelos técnicos em cada OS (bucket `anexos`). | storage |
| **Lousa Virtual** `/lousa` | 1 | — | Agenda semanal de serviços cruzando OS e pedidos PPV. | `Ordem_Servico`, `pedidos` |
| **Cronograma (Gantt)** `/cronograma/*` | 4 | 1 | Projetos com tarefas, dependências, baselines, calendários e recursos (motor CPM próprio, RPCs `cron_*`). | `projetos`, `tarefas`, `dependencias`, `baselines`, `baseline_tarefas`, `calendarios`, `calendario_excecoes`, `recursos`, `alocacoes`, `recorrencias` |
| **Inspeções / Ocorrências** | — | 4 | Inspeções de tratores e ocorrências de técnicos (e-mails). | `inspecoes`, `inspecao_emails`, `tecnico_ocorrencias`, `tecnico_justificativas` |

### 2.2 Peças (faixa laranja, `PecasNav`)

| Sistema | Telas | APIs | Uso resumido | Tabelas principais |
|---|---|---:|---|---|
| **PPV — Pedido de Venda** `/ppv` (+ Catálogo, Etiquetas, Unidades, Liberação) | 5 | 42 | Kanban/Lista/Relação/Dashboard de pedidos de peças; itens com custo (CMC); tarefas por pedido; faturamento e integração Omie; histórico de fase por trigger; etiquetas com QR e fila de impressão; relatório semanal por e-mail. | `pedidos`, `pedidos_status_hist`, `ppv_tarefas`, `ppv_tarefas_eventos`, `ppv_anexos`, `peca_unidades`, `peca_unidade_eventos`, `etiquetas_fila`, `etiquetas_folhas`, `Ordens_Omie`, `etapa_pedido` |
| **Catálogo de peças** `/ppv/catalogo` | 1 | 4 | Figuras explodidas por modelo, seções e peças clicáveis; ordem manual. | `catalogo_modelos`, `catalogo_figuras`, `catalogo_figura_modelos`, `catalogo_pecas`, `catalogo_marcas`, `catalogo_produtos`, `vw_catalogo_*` |
| **Orçamentos** `/orcamentos` | 1 | 6 | Orçamento com peças, mão de obra e deslocamento; gera OS ou PPV. | `orcamentos` |
| **Carrinhos** `/carrinho/[token]` | 1 | 6 | Lista de peças montada pelo técnico/cliente, vira PPV ou orçamento; auto-fecha por cron. | `carrinhos`, `carrinho_itens`, `carrinho_historico` |
| **Requisições** `/requisicoes`, `/requisicoes/imprimir/[id]` | 2 | (em `pecas`, `fornecedores`, `requisicoes`) | Kanban de requisições de compra/serviço das unidades (pedido → cotação → financeiro), mapa de cotações com 5 fornecedores + anexos, PDF, tags, lixeira, bloqueio > R$ 500 com aprovação do Dev, histórico por card. | `Requisicao`, `req_cotacao`, `req_usuarios`, `requisicao_tags`, `requisicao_grupos`, `requisicao_grupo_membros`, `requisicao_autorizacoes`, `Fornecedores`, `fornecedor_param`, `item_param` |

### 2.3 Financeiro (faixa verde)

| Sistema | Telas | APIs | Uso resumido | Tabelas principais |
|---|---|---:|---|---|
| **Financeiro (Chamados NF)** `/financeiro/*` | 20 | 20 | Kanbans de NF/boletos por setor (Financeiro, Peças, Pós-Vendas), chamados RH, contas a pagar/receber, rastreio de notas, configurações de envio de e-mail por usuário (senha criptografada AES), histórico e logs. | `Chamado_NF` (tabela mais usada do portal, 94 refs), `EnvioBoleto`, `finan_pagar`, `finan_receber`, `finan_rh`, `financeiro_usu`, `financeiro_emails`, `financeiro_envio_config`, `titulo_comentarios` |
| **DRE Financeiro** `/dre-financeiro/*` | 18 | 63 | Demonstrativo integrado da Omie: DRE por competência/caixa, análise mês a mês, composição por natureza, fluxo (Sankey), curva de saldo, calendário, vencidos, ciclo de caixa, pontualidade, patrimônio, rentabilidade, lucratividade, margens por família, vendas por modelo, clientes, monitor de anomalias. Semáforo de saúde financeira na home. | `contas_pagar`, `contas_receber`, `contas_baixas`, `contas_correcoes`, `conta_corrente`, `movimentos_cc`, `dre_cache`, `qa_anomalias`, `qa_monitor_log`, `cp_patrimonio_snapshot`, `cp_sync_log`, `selic_cache`, `categorias_dashboard`, `omie_cache` |
| **War Room** `/war-room`, `/war-room/config` | 2 | 10 | Reunião semanal de gestão: snapshot dos indicadores (cron), pauta, decisões em ledger imutável por trigger, ações e membros. | `war_room_snapshots`, `war_room_definicoes`, `war_room_membros`, `war_room_membros_log`, `war_room_decisoes`, `war_room_acoes`, `war_room_ponte`, views `v_war_room_*` |

### 2.4 Comercial (vermelho/rosa)

| Sistema | Telas | APIs | Uso resumido | Tabelas principais |
|---|---|---:|---|---|
| **Proposta Comercial** `/propostas`, `/p/[id]` | 2 | 5 | Propostas de máquinas com PDF (bloco de assinatura por vendedor), QR Code, funil por status, previsão ponderada, tags, pedido de fábrica. | `Formulario` (+ `v_formulario`), `proposta_tags`, `Proposta_Fabrica`, `v_proposta_fabrica`, `motivo_perda`, `vendedores`, `Configuracoes` |
| **Feedbacks & CRM** `/feedbacks/*` | 9 | 8 | Fila e cockpit de atendimento por telefone (ligação com cronômetro, desfechos, roteiro por regra, humor/qualidade), CRM, RFM, oportunidades automáticas (revisão, peças, up-sell), agenda de retornos, relatórios de atendentes, contatos do WhatsApp lidos do NovaZap. | `feedback_registros`, `feedback_chamada`, `feedback_script`, `feedback_config_regras`, `feedback_oportunidades`, `feedback_clientes_info`, `oportunidade_motivo`, `oportunidade_contatos` |
| **Pastas Clientes** `/clientes/*` | 5 | 28 | Ficha 360º do cliente: OS, PVs, NFs, tratores, projetos, e-mails; ranking; relatórios semanais por e-mail; consulta e print da Omie. | `portal_nt_clientes_PRINCIPAL`, `portal_nt_clientes_cadastro_omie`, `portal_nt_clientes_os`, `portal_nt_clientes_pv`, `portal_nt_projetos_*`, `portal_nt_notas_*`, `clientes`, `Clientes_Omie`, `Clientes_Manuais`, `cliente_extras`, `cliente_etiquetas`, `cliente_etiqueta_map`, `clientes_relatorios_semanais`, `ignorar_clientes` |
| **Supervisor Vendas** `/supervisor-vendas` | 1 | 5 | Painel do supervisor: rotas e check-ins dos vendedores, visitas, mapa, alertas. | `rotas_vendedor`, `checkin_vendedor`, `visitas`, `vw_visitas_detalhadas`, `vw_negocios_detalhados`, `comercial_veiculos`, `rastreio_pontos_relatorio` |
| **Gestão de Vendas** `/gestao-vendas/*` | 7 | 6 | Resultado mensal por vendedor (NOVA/CASTRO/TODAS): vendas de máquinas com CMC editável, comissões, custos, regras, bônus, carimbos do PDF. | `vendas_itens`, `comissao_regras`, `comissao_pessoas`, `comissao_config`, `comissao_ajustes_vendas`, `comissao_ajustes_servicos`, `comissao_custos_vendedor`, `comissao_bonus_historico`, `gv_clientes_omie_cache`, `vendas_pedidos_invalidos` |
| **Vendas por Modelo** `/vendas-modelo` | 1 | (DRE) | Mesma tela do DRE liberável ao Comercial; receita e quantidade por modelo, grade anual, PDF, log de atividade. | `vendas_itens`, `produtos` |
| **Marketing & Eventos** `/marketing/*`, `/lead`, `/q/[token]` | 8 | 23 + 2 | Ações de marketing (feira, dia de campo, patrocínio, mídia): apoio de fábrica (co-op) com máquina de estados, custos híbridos, leads com captura mobile e fila offline, ROI, relatório de contrapartida em PDF, questionário pós-evento por link único sem login. | `mkt_acoes`, `mkt_apoios`, `mkt_custos`, `mkt_leads`, `mkt_acao_propostas`, `mkt_equipe`, `mkt_itens`, `mkt_realizadas`, `mkt_concorrentes`, `mkt_midias`, `mkt_avaliacoes`, `mkt_questionario_links`, `mkt_questionario_respostas` |
| **CRM (legado)** `/crm/*` | 6 | — | Telas antigas de funil/painel/roteiro/estoque, substituídas pelo Feedbacks & CRM. | — |

### 2.5 Estoque (cinza-prata, `EstoqueNav`)

| Sistema | Telas | APIs | Uso resumido | Tabelas principais |
|---|---|---:|---|---|
| **Consulta Estoque (Omie)** `/estoque/*` | 17 | 111 | Maior sistema em APIs. Dashboard de vendas (peças, serviços, máquinas, YoY), curva ABC, giro, CMC, comissão de peças, cruzamento por família (estoque × entrada × saída com reconciliação pelo razão), inteligência comercial (compras, clientes, RFM), sugestão de compra, movimentação por produto (kardex), notas de entrada (DANFE, descrições), recebimentos e espelho Omie, cadastro de produto, configuração de compras. Alimentado por ~12 crons de sync com a Omie. | `produtos`, `Produtos_Completos`, `produtos_caracteristicas`, `produto_tipo`, `produto_fiscal`, `produto_observacoes`, `familias`, `vendas_itens`, `compras_itens`, `notas_entrada`, `recebimentos_nfe`, `recebimento_*`, `movimentacoes`, `movimentacao_produtos`, `movimentacao_snapshots`, `estoque_movimentos`, `cmc_historico`, `cmc_alertas`, `cmc_correcoes`, `cmc_sync_log`, `sugestao_compra_snapshot`, `pedido_compra`, `pedido_compra_item`, `outras_entradas`, `cfop`, `cfop_entrada_map`, `codigo_fiscal`, `cenario_fiscal`, `conferencia_custo_maquinas`, `cache_controle`, `omie_usuarios` |
| **Visual Estoque** `/visual-estoque/*` | 8 | 18 | Showroom virtual de máquinas: pátio, showroom, remessas, notas de entrada, margens, alertas, frota (port do app Express legado). | `equipamentos`/`Equipamentos`, `remessas`, `painel_alertas`, `revisoes` (margem) |
| **Conferência de Custos** `/conferencia-custos` | 1 | 1 | Conferência do custo real das máquinas do pátio e demo. | `conferencia_custo_maquinas` |
| **Consulta Omie** `/consulta-omie` | 1 | 1 | Consulta direta de produto/cliente na Omie. | — |

### 2.6 Frota (azul-escuro, `FrotaNav`)

| Sistema | Telas | APIs | Uso resumido | Tabelas principais |
|---|---|---:|---|---|
| **Frota** `/frota/*` | 14 | 37 | Veículos (ficha, FIPE, documentos, responsável), abastecimento (CSV do cartão ∪ requisições; heatmap, km/L, PDF por departamento), multas, avarias, manutenções, paradas, checklists, custos (TCO), mapa/geocercas, motoristas (mesclados com o RH), pendências com taxonomia Sistema › Subsistema › Componente e sincronização automática (cadastro, checklist, requisição, OS, Opa). | `frota_veiculos`, `frota_veiculos_alias`, `frota_responsaveis`, `frota_motoristas`, `frota_multas`, `frota_avarias`, `frota_documentos`, `frota_paradas`, `frota_dias`, `frota_odometro`, `frota_geocercas`, `frota_equipamentos`, `frota_pendencias`, `frota_componentes`, `veiculo_checklist`, `veiculo_checklist_itens`, `abastecimentos`, `abastecimento_lotes`, `Placas`, `SupaPlacas`, `cad_trator`, `cad_autopropelido`, `departamento`, views `vw_frota_*` |
| **Pendências Frota** `/pendencias` | 1 | (Frota) | Módulo mobile satélite para abrir pendências com foto sem o módulo Frota inteiro. | `frota_pendencias` |
| **Abastecimento (legado)** `/abastecimento`, `/abastecimento/flex` | 2 | 7 | Rotas antigas do dashboard de abastecimento (o real é `/frota/abastecimento`). | `abastecimentos` |

### 2.7 Ajustes (`/ajustes/*`, port do "Omie CMC Garantia")

| Telas | APIs | Uso resumido | Tabelas principais |
|---|---:|---|---|
| 24 | 101 + 4 (omie-massa) | Ferramentas de correção do estoque/Omie: estoque negativo (scan noturno + correção assinada por HMAC), ajuste de custos, histórico de CMC, características (Tipo, Sistema/Subsistema, sinalizações, ordenação, auditoria e reversão), descrições, famílias, inventário (ciclos, contagens, ajustes, relatório), localização física, notas, pedidos antigos e encerramento informal, remessas, devolução triangular, correção e baixa de contas, alertas, saúde mensal, Mahindra, alteração em massa na Omie. | `cmc_correcoes`, `cmc_estoque_ultima_varredura`, `inventario_ciclos`, `inventario_contagens`, `inventario_ajustes`, `inventario_tarefas`, `localizacao_conferida`, `caracteristicas_sinalizacoes`, `caracteristicas_ok`, `pedidos_encerrados_informais`, `remessas`, `ajustes_jobs`, `recebimento_auto_familia_log`, `recebimento_classificacao_responsavel` |

### 2.8 Outros / transversais

| Sistema | Telas | APIs | Uso resumido | Tabelas principais |
|---|---|---:|---|---|
| **Dashboard (home)** `/dashboard`, `/` | 2 | — | Cards dos sistemas por grupo, filtrados pelas permissões do usuário. | `portal_permissoes` |
| **Administração** `/admin` | 1 | 3 | Usuários, papéis (Usuário/Admin/Dev), módulos e ações granulares. | `portal_permissoes` |
| **Tickets** `/tickets`, `/tickets/[id]` | 2 | 6 | Pedidos internos entre setores: fila, timeline imutável, transferência, participantes, vínculo com requisições, auto-fechamento em 7 dias. | `tickets`, `tickets_participantes`, `tickets_eventos`, `tickets_vinculos`, `tickets_plano` |
| **Opa** `/opa` | 1 | 1 | Ocorrências e "coisas fora do lugar" visíveis a todos até resolver (RPC `resolver_opa`); pode abrir pendência de frota. | `portal_opas`, `portal_opas_anexos`, `portal_opas_views` |
| **Avisos** `/avisos` | 1 | 2 | Comunicados gerais com anexos, confirmação de leitura e publicação agendada. | `portal_avisos`, `portal_avisos_lidos`, `portal_avisos_anexos`, `avisos_gerais`, `avisos_gerais_confirmados` |
| **Tarefas** `/tarefas`, `/meu-painel` | 2 | 4 | Tarefas entre usuários e painel pessoal. | `portal_tarefas` |
| **Tratorilson (IA)** `/tratorilson`, chat flutuante | 1 | 4 + 4 (assistente) + 1 (whatsapp) + 1 (chatwoot) | Assistente com OpenAI/Groq no portal e no WhatsApp (via NovaZap): busca trator, orçamento de revisão, deslocamento, transcrição de áudio; log e solicitações. | `tratorilson_log`, `tratorilson_config`, `tratorilson_solicitacoes` |
| **Chat interno + notificações** | (header) | 2 (push) | Chats entre usuários (Realtime), notificações in-app, push. | `portal_chats`, `portal_chat_membros`, `portal_chat_leitura`, `mensagens_chat`, `portal_mensagens`, `portal_notificacoes`, `push_subscriptions` |
| **Auditoria / Atividades** `/atividades` | 1 | 1 | Log de ações por sistema (`useAuditLog`). | `audit_log`, `portal_logs` |
| **Agendamentos** `/agendamentos` | 1 | 2 | Status dos 41 crons via GitHub Actions API + heartbeat. | `cron_runs`, `cron_heartbeat` |
| **Dev → Envios de e-mail** `/dev/envios-email` | 1 | 2 | Configuração no banco dos relatórios que saem por e-mail (destinatários, ativo, histórico). | `email_envios_config`, `email_envios_log` |
| **Vigia das Câmeras** (modal no menu) | — | 1 | Eventos do DVR reportados por script local; canal 5 filtrado por IA de visão (trator). | `cameras_eventos`, JSONs no storage |
| **Tela dividida** `/split`, **TV** `/tv-painel`, **Dashboard Agro** `/dashboard-agro`, **Chatwoot app** `/chatwoot-app` | 4 | — | Dois sistemas lado a lado; painel de TV; dashboard do segmento agro; painel embutido no NovaZap. | — |
| **Login / senha / perfil** `/login`, `/resetar-senha` | 2 | 2 (perfil) + 1 (portal-token) | Autenticação Supabase, avatar, token de acesso externo. | `financeiro_usu`, bucket `avatars` |
| **Público** | — | 2 (publico) + 1 (versao) + 1 (rh) + 1 (figurinhas) | Rotas sem login (proposta pública, versão do build, leitura do RH). | `rh_funcionarios`, `rh_documentos` (Supabase do RH) |

---

## 3. Tabelas — visão por domínio

Total de **~295 tabelas/views** referenciadas (300 nomes distintos; `anexos`, `avatars` e `requisicoes` são buckets). As 10 mais usadas no código:

| Tabela | Refs | Uso |
|---|---:|---|
| `Chamado_NF` | 94 | Chamados de nota fiscal / boleto do Financeiro |
| `financeiro_usu` | 90 | Cadastro de usuários do portal (nome, e-mail, setor, ativo, avatar) |
| `vendas_itens` | 71 | Itens vendidos (Omie): base de dashboards, DRE, gestão de vendas |
| `produtos` | 70 | Cadastro de produtos/peças (Omie), CMC, família, tipo |
| `Requisicao` | 57 | Requisições de compra/serviço |
| `portal_permissoes` | 48 | Módulos e papéis por usuário |
| `frota_veiculos` | 45 | Ficha dos veículos da frota |
| `portal_nt_clientes_os` | 39 | OS por cliente (Pastas Clientes) |
| `portal_nt_clientes_cadastro_omie` | 39 | Cadastro de clientes espelhado da Omie |
| `portal_nt_clientes_PRINCIPAL` / `Ordem_Servico` | 37 | Índice de clientes / OS do Pós-Vendas |

Distribuição aproximada por domínio (nomes distintos):

| Domínio | Qtd | Prefixos / exemplos |
|---|---:|---|
| Estoque / Omie (produtos, vendas, compras, recebimentos, CMC, fiscal) | ~55 | `produtos*`, `vendas_*`, `notas_entrada`, `recebimento*`, `cmc_*`, `cfop*`, `inventario_*` |
| Frota | ~28 | `frota_*`, `veiculo_checklist*`, `abastecimento*`, `Placas`, `vw_frota_*` |
| Comercial (clientes, propostas, vendas, comissões, supervisor) | ~40 | `portal_nt_clientes_*`, `Formulario`, `comissao_*`, `rotas_vendedor`, `visitas` |
| Feedbacks & CRM | ~9 | `feedback_*`, `oportunidade_*` |
| Marketing | 13 | `mkt_*` |
| Financeiro + DRE | ~30 | `Chamado_NF`, `finan_*`, `contas_*`, `movimentos_cc`, `dre_cache`, `qa_*`, `cp_*` |
| War Room | 7 + 4 views | `war_room_*`, `v_war_room_*` |
| Serviços (OS, garantias, revisões, mecânicos, SAT, cronograma) | ~45 | `Ordem_Servico*`, `os_*`, `garantia*`, `revisao*`, `tratores`, `mecanico_*`, `tecnico_*`, `projetos`, `tarefas`, `baselines` |
| Peças (PPV, catálogo, carrinhos, etiquetas, requisições) | ~30 | `pedidos*`, `ppv_*`, `peca_unidade*`, `etiquetas_*`, `catalogo_*`, `carrinho*`, `Requisicao`, `req_*`, `requisicao_*` |
| Portal transversal (auth, permissões, chat, avisos, opas, tickets, audit, crons, e-mail) | ~40 | `portal_*`, `tickets*`, `avisos_*`, `audit_log`, `cron_*`, `email_envios_*`, `tratorilson_*`, `cameras_eventos` |

Observações importantes:
- **179 tabelas têm `CREATE TABLE` versionado** em `sql/`. As demais (~115) são **legado AppSheet/Omie** ou criadas à mão no Supabase (ex.: `Chamado_NF`, `Requisicao`, `req_cotacao`, `Formulario`, `Ordem_Servico`, `Produtos_Completos`, `Clientes_Omie`) — sem migration e, em boa parte, sem RLS (ver memória "RLS: banco aberto à anon key").
- Nomes com maiúscula (`Chamado_NF`, `Requisicao`, `Formulario`) são herança do AppSheet; os novos seguem `snake_case` com prefixo de domínio.
- `conta_omie` é minúscula em `produtos`/snapshots e MAIÚSCULA no resto.

---

## 4. Funções

### 4.1 Funções SQL (34) e RPCs (17 chamadas pelo app)

| Grupo | Funções | Uso |
|---|---|---|
| Feedbacks / cockpit | `feedback_iniciar_chamada`, `feedback_encerrar_chamada`, `feedback_cancelar_chamada` (RPCs, SECURITY DEFINER), `feedback_chamada_recontar`, `feedback_chamada_touch`, `feedback_script_touch`, `feedback_touch_atualizado_em` | Ciclo da ligação com efeitos no CRM/oportunidade; contadores e `updated_at` por trigger |
| Cronograma | `cron_criar_projeto`, `cron_criar_tarefa`, `cron_atualizar_tarefa`, `cron_criar_dependencia`, `cron_remover_dependencia`, `cron_salvar_baseline`, `cron_remover_baseline`, `cron_registrar_progresso`, `cron_gerar_ocorrencias`, `cron_aplicar_recalculo` (RPCs), `cronograma` | Escrita transacional do Gantt |
| Frota | `frota_norm_placa`, `frota_parse_valor`, `frota_placa_de_numplaca`, `frota_resolver_placa`, `frota_touch` | Normalização de placa/valor e `updated_at` |
| War Room | `war_room_na_lista`, `war_room_nucleo`, `wr_decisoes_bloqueia_mutacao`, `wr_snapshot_imutavel_apos_fechar` | Controle de acesso e imutabilidade do ledger |
| Serviços / Peças | `concluir_sat`, `resolver_opa`, `set_servico_interno` (RPCs), `proximo_numero_sg_montadora` (RPC), `set_garantia_numero`, `set_peca_unidade_numero`, `trg_ppv_status_hist`, `trg_status_hist`, `trg_proposta_recalc`, `trg_sync_convertido` | Numeração sequencial, histórico de fase, recálculo de proposta |
| Portal | `criar_permissao_padrao`, `tickets_pode_ver`, `requisicao_normalizar_solicitante`, `receb_touch_updated_at`, `fn_relatorio_atualizado`, `nt_nome_pessoa`, `nt_num` | Permissão padrão no 1º login, RLS de tickets, helpers de texto/número |

Mais 27 triggers ligados a essas funções (histórico de status do PPV, `updated_at`, numeração, ledger do War Room, contadores de chamadas).

### 4.2 Funções TypeScript de biblioteca (1.424 exports em `src/lib`)

| Pasta | Arquivos | O que concentra |
|---|---:|---|
| `estoque` | 38 | Sync Omie (produtos, vendas, compras, recebimentos, movimentos), CMC, cruzamento por família, sugestão de compra, dashboards |
| `ajustes` | 35 | Negativos, correções, inventário, características, remessas, devolução, Omie em massa |
| `feedbacks` | 34 | Cockpit (performance, previsão de revisão, roteiro, histórico do cliente, telefone), RFM, oportunidades |
| `financeiro` | 24 | Chamados NF, boletos, e-mails, criptografia de senhas de envio |
| `ppv` | 20 | Relação/dashboard, relatório por e-mail, etiquetas (HTML/Code128), kits |
| `frota` | 19 | Pendências e motor de sync, RH, abastecimento, FIPE, checklists |
| `pos` | 18 | Alimentação OS→Requisição, ORS (rotas), relação/dashboard, Omie OS |
| `dre-financeiro` | 17 | DRE, fluxo, composição, saúde financeira, vendas por modelo + PDF |
| `marketing` | 14 | ROI, custos, contrapartida (PDF), questionário |
| `garantias` | 14 | Fluxo da SG, PDF, e-mails, devoluções |
| `visual-estoque` | 13 | Port do app legado (pátio, showroom, remessas, alertas) |
| `cronograma`, `abastecimento` | 10 cada | Motor CPM; parse e agregações de abastecimento |
| `pecas`, `requisicoes`, `permissoes`, `omie`, `ocorrencias`, `gestao-vendas`, `chatwoot`, `assistente` | 4–7 cada | Catálogo, autorização de valor alto, catálogo de permissões, cliente Omie, contatos do NovaZap, IA (provider + persona) |
| `war-room`, `tickets`, `revisoes`, `propostas`, `email`, `auth`, `omie-massa`, `charts`, `agendamentos`, `server` | 2–3 cada | Snapshot semanal, vínculos, lembretes, assinatura do PDF, envios configuráveis, sessão, status de crons |
| raiz | 8 | `supabase.ts`, `whatsapp.ts`, `cripto.ts`, `texto.ts`, `busca-segura.ts`, `url-segura.ts`, `tecnico-utils.ts`, `push-mecanicos.ts` |

### 4.3 Rotas de API (662 handlers) por área

| Área | Rotas | Área | Rotas |
|---|---:|---|---:|
| estoque | 111 | feedbacks | 8 |
| ajustes | 101 | revisoes / abastecimento | 7 cada |
| dre-financeiro | 63 | tickets / orcamentos / gestao-vendas / carrinhos | 6 cada |
| pos | 47 | supervisor-vendas / propostas / pecas | 5 cada |
| ppv | 42 | tratorilson / tarefas / omie-massa / catalogo / assistente | 4 cada |
| frota | 37 | inspecoes / admin | 3 cada |
| garantias | 36 | q, push, publico, produtos, perfil, observacoes, mapa, fornecedores, dev, avisos, agendamentos | 2 cada |
| clientes | 28 | whatsapp, versao, sat, rh, portal-token, painel-mecanicos, opa, omie, ocorrencias, mecanicos, lembretes, figurinhas, cronograma, conferencia-custos, chatwoot, cameras, audit | 1 cada |
| marketing | 23 | | |
| financeiro | 20 | | |
| visual-estoque | 18 | | |
| war-room | 10 | | |

### 4.4 Crons (41 workflows no GitHub Actions)

| Grupo | Workflows | Frequência típica |
|---|---|---|
| Estoque / Omie (13) | sync-produtos, sync-estoque, sync-incremental, sync-movimentos, sync-compras, sync-recebimentos, sync-remessas, sync-selic, backfill-cmc, backfill-historico, backfill-noturno, backfill-os-servicos, enriquecer-notas, snapshot-sugestao-compra | de 15 min a diário |
| Ajustes (4) | classificar-recebidos, prewarm-recebimentos, scan-negativos, sync-notas | diário / 3 h |
| Frota (5) | atualizar-fipe (mensal), fechar-dia, ocorrencias-auto, sync-cadastro, sync-eventos | diário |
| Serviços (5) | pos-auto-fase, pos-separar-pecas, garantias-devolucoes, garantias-emails, sync-nfs | diário |
| Peças (3) | pecas-abate (30 min), ppv-relatorio-lista (seg), carrinhos-auto-fechar | — |
| Financeiro (4) | dre-financeiro-sync (3 h), dre-financeiro-relatorio-lista (seg), financeiro-emails, war-room-snapshot (seg) | — |
| Comercial (4) | clientes-relatorio-semanal (sex), sync-rotas-comercial, supervisor-salvar-rotas, marketing-apoios-vencendo (seg) | — |
| Portal (2) | avisos-publicar (15 min), tickets-auto-fechar | — |

---

## 5. Ressalvas da contagem

- "Tabela" aqui = nome passado ao `.from()`; inclui 17 views e pode incluir nome repetido por grafia (`equipamentos` × `Equipamentos`, `requisicoes` bucket × tabela).
- 5 migrations aparecem no `CLAUDE.md` como **pendentes de confirmar** no Supabase: `req-cotacao-anexos`, `opa-vinculo-veiculo`, `marketing-questionario`, `ppv-status-hist`, `cron-runs`.
- Telas em `/crm/*` e `/abastecimento/*` são legadas (substituídas por `/feedbacks` e `/frota/abastecimento`) e ainda contam nas 192.
- ~392 das rotas de API não validam sessão (ver memória "Sessão/auth do portal"); o descritivo não muda isso, só registra.
