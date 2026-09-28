# Roteiro de visita e contato do vendedor (Dashboard Agro)

## Contexto

A Prospecção do Dashboard Agro diz **quais** imóveis rurais valem a abordagem, mas para aí: a única ação em lote é exportar CSV. Não existe forma de transformar a lista em trabalho de campo, nem de saber depois o que aconteceu com cada imóvel. O pedido é criar um roteiro que o vendedor siga para visitar pessoalmente e, quando houver telefone, ligar.

Decisões do usuário (28/09/2026):

1. **O gestor monta e atribui.** O vendedor só executa.
2. **O vendedor usa uma tela do portal no celular**, com registro do resultado de cada parada.
3. **Visita para todos, ligação só com vínculo.** O CAR não traz nome nem telefone do dono (a LIA proíbe dado pessoal de fonte pública). Imóvel vinculado a cliente da Nova ganha telefone, WhatsApp e atalho para o cockpit. Os demais entram só como visita.
4. **Execução depois do Gate 3 do Score v2.** O roteiro nasce sobre a lista nova, em que um item é um grupo de duplicatas ou um CAR avulso. Isto evita mandar o vendedor duas vezes ao mesmo imóvel.

**Pré-requisito:** Score v2 Gates 2 e 3 concluídos. Este plano não começa antes do "ok gate 3".

## O que o levantamento mostrou

| Tema | Situação hoje | Consequência |
|---|---|---|
| Cálculo de rota | `src/lib/pos/ors.ts` tem só rota entre 2 pontos e descarta a geometria | Estender para N pontos |
| Ordenação de paradas | Não existe (nem vizinho mais próximo, nem otimização) | Lib pura nova |
| Coordenada da loja | `OFICINA` em `src/lib/pos/ors.ts` | Reutilizar como origem padrão |
| Mapa | Leaflet via CDN; helper `carregarLeaflet` em `src/components/feedbacks/leaflet.ts` | Reutilizar |
| Seleção múltipla na Prospecção | Não existe | Acrescentar |
| Vendedor × usuário do portal | Sem ligação (`vendedores` não aponta para `financeiro_usu`) | Responsável do roteiro = **usuário do portal**, como em Frota → Pendências |
| Visita planejada | Não existe; `visitas` é do app do CRM e o portal só lê | Tabelas próprias `agro_roteiro*`; **nada é escrito em `visitas`** |
| Contato | Só via `agro_car_cliente_vinculo` → `portal_nt_clientes_PRINCIPAL` / cadastro Omie | Telefone lido na hora, nunca copiado do CAR |
| Tela satélite no celular | Padrão já usado em `/lead` e `/pendencias` | Mesmo padrão |

## Desenho

### 1. Banco — `sql/agro-roteiro.sql` (novo; usuário aplica no SQL Editor)

Mesmo padrão do módulo: tabelas em `public` com prefixo `agro_`, RLS ligada sem policy, EXECUTE revogado de `anon`/`authenticated`, acesso só pelas rotas. Arquivo idempotente, com pré e pós-checagem.

- **`agro_roteiro`**: `id`, `titulo`, `data_prevista`, `responsavel_user_id` (uuid), `responsavel_nome` (snapshot), `origem_lat`/`origem_lng` (padrão = loja), `status` (`rascunho` | `atribuido` | `em_andamento` | `concluido` | `cancelado`), `distancia_km`, `tempo_min`, `geometria` (jsonb, traçado do ORS; nulo se o ORS falhar), `execucao_id` (execução publicada de onde saíram os itens), `criado_por`, `criado_em`, `atribuido_em`, `concluido_em`, `observacao`.
- **`agro_roteiro_parada`**: `id`, `roteiro_id`, `ordem`, `item` (cod_car do representante), `lat`/`lng` (centroide), snapshot para a tela não depender da lista (`municipio`, `area_util_ha`, `cultura_principal`, `confianca`, `score`, `cliente_omie_id`, `cliente_nome`), `resultado` (`pendente` | `visitado` | `nao_encontrado` | `sem_interesse` | `reagendar` | `ligou`), `resultado_obs`, `contato_nome`, `contato_telefone`, `cultura_informada`, `foto_path`, `registro_lat`/`registro_lng`/`registro_precisao`, `registrado_por`, `registrado_em`. `UNIQUE (roteiro_id, item)`.
- **RPCs `SECURITY DEFINER` com `search_path` fixo**, todas chamando `agro_exigir_acesso` (já existe, do Gate 1):
  - `agro_roteiro_criar(p_titulo, p_data, p_responsavel_user_id, p_responsavel_nome, p_itens jsonb, p_usuario, p_user_id)` — exige gestão. Devolve o id e a lista de itens que **já estão em outro roteiro aberto** (aviso, não bloqueio).
  - `agro_roteiro_reordenar`, `agro_roteiro_atribuir`, `agro_roteiro_cancelar` — gestão.
  - `agro_roteiro_registrar_parada(p_parada_id, p_resultado, ..., p_user_id)` — exige que `p_user_id` seja o **responsável do roteiro** ou gestão. Primeira parada registrada muda o roteiro para `em_andamento`; última pendente resolvida muda para `concluido`.
- Função nova `agro_tem_acesso_roteiro(p_user_id)`: módulo `roteiro-agro` **ou** acesso ao Dashboard Agro.

### 2. Lib pura — `src/lib/agro/roteiro.ts` (+ testes)

- `ordenarParadas(origem, paradas)`: vizinho mais próximo seguido de 2-opt, sobre distância em linha reta. Reutiliza `distanciaKm` de `src/lib/pos/rastreamento.ts`.
- `resumoRoteiro`, `linkNavegacao(lat, lng)` (`https://www.google.com/maps/dir/?api=1&destination=lat,lng`), `RESULTADOS_PARADA` com rótulos e cores, `podeRegistrar(roteiro, userId, ehGestor)`.
- Testes em `src/lib/agro/__tests__/roteiro.test.ts`: ordem estável, roteiro de 0, 1 e 2 paradas, 2-opt desfaz cruzamento, link correto, regras de permissão.

### 3. ORS com várias paradas — `src/lib/pos/ors.ts`

Função nova `calcularRotaMulti(pontos)`: mesmo endpoint `POST /v2/directions/driving-car`, com N coordenadas e `radiuses: -1` em todas (pino no meio da fazenda). Devolve distância, tempo e **geometria**. As funções existentes não mudam. Falha do ORS devolve `null`; o roteiro segue com a estimativa em linha reta, marcada como estimativa na tela.

### 4. Rotas — `src/app/api/agro/roteiros/`

Padrão de `src/lib/agro/server.ts` (`guardarAgro`, `logAgro`, `erroAgro`).

| Rota | Quem | O que faz |
|---|---|---|
| `GET /api/agro/roteiros` | gestão | lista com filtros de status, responsável e período |
| `POST /api/agro/roteiros` | gestão | cria: ordena as paradas, chama o ORS, grava via RPC |
| `GET/PATCH /api/agro/roteiros/[id]` | gestão | detalhe, reordenar, atribuir, cancelar |
| `GET /api/agro/roteiros/meus` | responsável | roteiros atribuídos ao usuário da sessão |
| `POST /api/agro/roteiros/[id]/paradas/[paradaId]` | responsável | registra o resultado |
| `GET /api/agro/roteiros/usuarios` | gestão | usuários ativos do portal para o seletor (com foto) |

O telefone do cliente vinculado é lido na hora em `GET .../meus`, pelo mesmo caminho do cockpit (`src/lib/feedbacks/atendimento/contexto.ts`), e **não é gravado** na parada.

### 5. Telas

- **Prospecção** (`src/components/dashboard-agro/ProspeccaoCar.tsx`): caixa de seleção por linha e barra "N selecionados → Criar roteiro". Teto de 25 paradas por roteiro. Imóvel já em roteiro aberto mostra selo.
- **Guia nova "Roteiros"** em `/dashboard-agro?tab=roteiros` (`RoteirosAgro.tsx`), só para gestão: lista, e modal de montagem com mapa (traçado e paradas numeradas), setas para reordenar, seletor de responsável com foto, data, e resumo de km e tempo. Depois de atribuído, mostra o andamento por parada.
- **Tela do vendedor** `/roteiro` (módulo satélite `roteiro-agro`, mobile-first, padrão de `/lead`): roteiro do dia, paradas na ordem, botão **Navegar**, botões **Ligar** e **WhatsApp** quando há vínculo (`linkWhatsapp` de `src/lib/feedbacks/telefone.ts`), atalho **Cockpit**, e **Registrar resultado** com observação, contato obtido no local, cultura vista e foto opcional (`anexos/agro/roteiros/`). **Fila offline em `localStorage`**, como no `/lead`: área rural tem pouco sinal.
- Módulo `roteiro-agro` no catálogo do Admin, no menu e em `systemToModulo` do dashboard. Card fora do `systemToModulo` aparece para todo mundo (gotcha registrado no CLAUDE.md).

### 6. O que o resultado da visita alimenta

Nada é automático; tudo passa por confirmação humana.

- **Cultura informada** → oferece ao gestor "validar cultura" pela RPC existente `agro_validar_cultura` com fonte `visita`.
- **Contato obtido** → fica na parada. Na tela do gestor aparece "vincular a cliente", pelo fluxo de vínculo tipado do Gate 1.
- **Sem interesse** → o item ganha selo na Prospecção e sai da seleção por padrão durante um prazo em parâmetro (`roteiro_sem_interesse_dias`, em `agro_parametro`).

### 7. Auditoria e privacidade

- Criar, atribuir, cancelar e registrar parada vão para o `audit_log` (sistema `dashboard-agro`).
- Atualizar `docs/agro/lia-inteligencia-agricola-car.md`: o contato colhido em visita é dado pessoal fornecido pelo próprio titular, de uso interno. Registrar finalidade e retenção.

### 8. Documentação

`docs/agro/roteiro-visitas.md`, seção no `CLAUDE.md` e memória do projeto.

## Fora do escopo

- Escrever em `visitas` ou alterar o app do CRM.
- Otimização com janelas de horário ou vários vendedores ao mesmo tempo.
- Ligar `vendedores` a usuário do portal.
- Criar oportunidade no cockpit a partir do roteiro: exigiria ampliar o CHECK de `feedback_oportunidades.regra`. O atalho para o cockpit do cliente vinculado já funciona.
- Envio automático do roteiro por WhatsApp ou e-mail.

## Entrega em duas etapas

| Etapa | Conteúdo | Parada para aprovação |
|---|---|---|
| A | Migration, lib pura com testes, ORS multi, rotas, seleção na Prospecção e guia Roteiros | Gestor consegue montar e atribuir |
| B | Tela `/roteiro` no celular, registro de resultado, fila offline, retorno para o gestor | Ciclo completo |

## Verificação

1. **Migration**: pré e pós-checagem no arquivo; conferência pela API com service role; chave anônima recebe lista vazia nas tabelas e permissão negada nas RPCs.
2. **Testes**: `npx vitest run src/lib/agro` com os testes novos de `roteiro.ts`.
3. **Build**: `npm run build`.
4. **Montagem (Playwright, dev local)**: em `/dashboard-agro?tab=prospeccao`, selecionar 5 imóveis de Piraju, criar roteiro, conferir ordem, km e traçado no mapa (Leaflet usa canvas: conferir por texto e captura de tela). Reordenar e atribuir.
5. **Conflito**: criar um segundo roteiro com um imóvel repetido e conferir o aviso.
6. **Vendedor (Playwright em largura de celular)**: abrir `/roteiro` com o usuário responsável, registrar "visitado" com observação, conferir a mudança de status do roteiro. Outro usuário sem ser o responsável recebe 403.
7. **Offline**: cortar a rede no navegador, registrar uma parada, religar e conferir que a fila foi enviada.
8. **ORS fora do ar**: sem `ORS_API_KEY`, o roteiro é criado com estimativa em linha reta e a tela avisa.
9. **Auditoria**: conferir as linhas no `audit_log`.
10. **Deploy**: conferir o status no Railway antes de dizer que está no ar.
