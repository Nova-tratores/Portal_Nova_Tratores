# Telas de inteligência de dados: correções, melhorias e ideias novas

Levantamento de 28/09/2026. Cobre as telas de inteligência geográfica, demográfica, comercial, de histórico de vendas, financeira e estratégica do portal, e o Dashboard Agro externo.

Este documento é um roteiro. Nenhuma tela ou rota foi alterada para produzi-lo.

## Como ler

**Situação da evidência**

| Marca | Significado |
|---|---|
| Produção | Conferido em produção em 28/09/2026, por chamada sem login |
| Código | Conferido no código, no arquivo e na linha indicados |
| Banco | Visto no código, mas depende do dado real. Falta confirmar no banco |
| Relato | Veio do levantamento automático e não foi reconferido linha a linha |

**Esforço:** P é até um dia, M é de dois a cinco dias, G é mais de uma semana. São estimativas.

## Conclusão central

Antes de criar telas novas, três fundações precisam existir. Quase toda ideia nova depende delas.

| Fundação | Problema de hoje | Efeito |
|---|---|---|
| Cliente único | O mesmo CPF ou CNPJ tem um código na conta NOVA e outro na CASTRO. Só duas telas juntam os dois (DRE › Clientes e o cockpit de atendimento). Várias telas identificam o cliente pelo nome. | Cliente contado duas vezes. Curva ABC, recompra e carteira saem erradas. |
| Venda válida única | Cada tela exclui coisas diferentes: pedido inválido, devolução, venda entre as lojas. Há cinco regras para separar peça de máquina. | O mesmo mês mostra faturamentos diferentes conforme a tela. |
| Leitura completa | O banco devolve no máximo 1.000 linhas por consulta. Dezenas de consultas pedem `.limit(50000)` sem paginar, e outras paginam sem ordem estável. | Indicadores somam dados cortados, sem aviso. |

---

## Parte 1 — Correções

### 1A. Segurança

A falta de login nas rotas já era conhecida como prioridade. O que segue é o recorte das telas de inteligência.

Contagem de rotas com alguma checagem de login, por busca de texto no código:

| Área | Com checagem | Total |
|---|---|---|
| DRE financeiro | 2 | 63 |
| Ajustes | 20 | 101 |
| Estoque | 27 | 111 |
| Visual Estoque | 5 | 18 |
| Propostas | 0 | 5 |
| Mapa | 0 | 2 |
| Supervisor de vendas | 2 | 5 |
| Feedbacks | 6 | 8 |
| War Room | 10 | 10 |
| Gestão de Vendas | 6 | 6 |
| Agro | 6 | 6 |

| # | Achado | Onde | Evidência | Esforço |
|---|---|---|---|---|
| S1 | O Dashboard Agro externo é público e usa a chave anônima do mesmo banco do portal. As políticas do esquema permitem à chave anônima inserir e apagar nas bases de lavoura, pecuária e relevo. | repositório `dashboard-agro-sp`: `index.html:638`, `supabase_schema.sql:66-107`, `server.js` | Produção (página responde 200 sem login) e Código. Falta confirmar no banco se as políticas estão ativas. | M |
| S2 | O iframe ignora a permissão do portal. Quem não tem o módulo abre o endereço do Railway direto. | `src/app/(portal)/dashboard-agro/page.tsx` | Produção | M |
| S3 | Rotas que gravam na Omie sem login: baixa de título, correção de custo médio, ajuste de custo e cadastro do cliente. | `src/app/api/ajustes/contas/baixar/route.ts`, `ajustes/aplicar-correcao/route.ts`, `ajustes/ajuste-custos/aplicar/route.ts`, `feedbacks/cliente-omie/route.ts` | Código (nenhuma checagem nos quatro arquivos) | P |
| S4 | Rotas de leitura sem login com dado sensível: DRE, supervisor de vendas e cadastro de clientes do mapa. A rota do mapa também aceita apagar cliente. | `src/app/api/dre-financeiro/*`, `supervisor-vendas/route.ts`, `mapa/clientes/route.ts:176` | Produção (duas rotas testadas responderam 200) e Código | M |
| S5 | O autor da correção vem do corpo da requisição. A assinatura registra um nome que qualquer pessoa pode informar. | `ajustes/aplicar-correcao/route.ts:11`, `ajustes/ajuste-custos/aplicar/route.ts:11`, `conferencia-custos/route.ts:103` | Código | P |
| S6 | Escrita por chamada de leitura: `?acao=pos_vendas_resolver` altera a visita. | `src/app/api/supervisor-vendas/route.ts:108` | Código | P |

O padrão de correção já existe: `guardarAgro` em `src/lib/agro/server.ts` e as rotas de gestão de vendas.

### 1B. Números errados

| # | Achado | Onde | Evidência | Esforço |
|---|---|---|---|---|
| N1 | Na Home do DRE, vencimentos de 7 dias, pontualidade e ciclo de caixa somam no máximo 1.000 linhas. | `src/lib/dre-financeiro/calc.js:153, 159, 174, 1351, 1363, 1373` | Código | P |
| N2 | A Home do DRE ignora o seletor de conta em quase todos os indicadores. | `calc.js:131` (`calcularKpisHome`) | Relato | P |
| N3 | O "Resultado do mês" fica congelado. O cache não tem prazo de validade. | `calc.js:1205`, `omie-api.js:1190` | Relato | P |
| N4 | Existem dois cálculos de ciclo de caixa, com resultados diferentes entre a Home e o Patrimônio. | `calc.js:1320` e `calc.js:754` | Código (as duas funções existem) | M |
| N5 | Inadimplência de mais de 90 dias e a lista de vencidos escondem o que venceu antes de 1º de janeiro. | `calc.js:78`, `calc.js:371` | Código | P |
| N6 | A frota entra inteira no patrimônio da NOVA e de novo no da CASTRO. | `calc.js:659` | Relato | P |
| N7 | War Room: margem e tratores da semana cortados em 1.000 linhas. "Tratores" inclui implemento e quadriciclo. Venda sem custo conta como 100% de margem. | `src/lib/war-room/snapshot.ts:94` | Código (o limite) e Relato (o restante) | M |
| N8 | Supervisor de vendas: o pipeline soma negócio já ganho. | `src/app/api/supervisor-vendas/route.ts:30, 47` | Código | P |
| N9 | Valor em texto como "1.329.900" vira 1,329. | `src/lib/marketing/custos.ts:18`, `src/components/propostas/ResumoPropostas.jsx:11`, leitor de valor do PPV | Código (marketing) e Relato (os outros dois) | P |
| N10 | O Relatório Geral de vendas perde pedidos quando a data vem com hora, ignora a loja escolhida e agrupa por nome. | `src/lib/gestao-vendas/server.ts:482` | Código (o filtro por texto) e Banco (se há data com hora) | M |
| N11 | Há duas previsões ponderadas de propostas, com valores diferentes no PDF e no Resumo. | `v_forecast` e `ResumoPropostas.jsx` | Relato | M |
| N12 | No dashboard de estoque, os cards tiram a venda entre lojas e a tendência não tira. | `src/lib/estoque/dashboard.ts` | Relato | P |
| N13 | A curva ABC por cliente não separa a conta nem tira a venda entre lojas. A outra loja do grupo aparece como cliente A. | `src/lib/estoque/curva-abc.ts` | Relato | P |
| N14 | No POS, as consultas de ordens e de histórico não paginam. Só as 1.000 mais recentes entram. | `src/app/api/pos/ordens/route.ts:158-159` | Código | P |
| N15 | O custo da frota conta requisição em qualquer situação. A tela de Abastecimento só conta as que chegaram ao financeiro. | `vw_frota_custos` | Relato | P |
| N16 | Crédito rural: a janela de 12 e 36 meses conta a partir de hoje, sobre dado que termina em 30/12/2024. | Score v2, relatório do Gate 2 | Banco (conferido em 28/09) | P |
| N17 | Dashboard Agro externo: a densidade de colhedeira nunca aparece, porque o código procura "Colheitadeira" e a lista usa "Colhedeira". | `index.html:3446` e `:3451` do repositório externo | Código | P |
| N18 | Dashboard Agro externo: rankings "SP" misturam o Paraná. O valor da pecuária soma total com subtotal. A "taxa de renovação" divide registros de 2022 a 2025 por um censo de 2016. | `index.html` do repositório externo | Relato | M |
| N19 | A sugestão de compra ignora o que já está pedido e a caminho. | `src/lib/estoque/sugestao-compra/snapshot.ts:142` | Código | M |

### 1C. Rotinas que não rodam ou falham em silêncio

| # | Achado | Evidência | Esforço |
|---|---|---|---|
| R1 | Patrimônio diário, monitor de qualidade, pedidos inválidos e cadastro de clientes só atualizam por botão. | Relato | P cada |
| R2 | A verificação diária de alertas está marcada como dormente. | Relato | P |
| R3 | O e-mail semanal do DRE pode estar desligado desde 04/09. | Banco | P |
| R4 | A tela de agendamentos não cobre os 42 agendamentos do repositório. | Código (42 arquivos) e Relato (a cobertura) | M |
| R5 | A sincronização do DRE responde "aceito" sempre. O GitHub marca sucesso mesmo com falha. | Relato | M |

### 1D. Sobras

| # | Achado | Evidência |
|---|---|---|
| D1 | `/crm/*` tem seis telas de demonstração, acessíveis pelo endereço. | Código (as pastas existem) e Relato (o conteúdo) |
| D2 | O mapa geral chama seis rotas que não existem: `stats/regional`, `stats/resumo`, `ranking-vendedores`, `alertas-inativos`, `regioes` e `equipamento-tipos`. | Código |
| D3 | `v_fila_acao`, `v_funil_tempo_por_fase` e `proposta_status_hist` foram criadas e nenhum código as usa. | Código |
| D4 | O Dashboard Agro externo tem cerca de 615 linhas comentadas. | Código (`index.html:5057-5673`) |

---

## Parte 2 — Melhorias nas telas que existem

| # | Melhoria | Base que já existe | Esforço |
|---|---|---|---|
| M1 | Selo de frescor em todo indicador: fonte, data da carga e aviso de dado velho | `agro_pipeline_execucao`, `cron_runs` | M |
| M2 | Relatório de motivo de perda e de perda para concorrente, por vendedor, modelo e município | `Formulario.motivo_perda_id`, `concorrente` | P |
| M3 | Taxa de conversão e tempo de ciclo no Resumo de propostas | `proposta_status_hist` | M |
| M4 | Fila de ação do vendedor: o que contatar hoje | `v_fila_acao`, pronta e sem tela | P |
| M5 | Vencidos por cliente em faixas de atraso, incluindo anos anteriores | `contas_receber` | P |
| M6 | Uma só taxa de juros em todas as telas de capital parado | rotina `estoque-sync-selic` | P |
| M7 | Custo total da frota com depreciação, imposto e seguro | tabela FIPE mensal | M |
| M8 | Giro e cobertura de estoque por família, não só por item | `src/lib/estoque/giro.ts` | P |
| M9 | Vendas por Modelo: faixas de potência vindas do cadastro, e indicadores seguindo a busca | `produtos.modelo` | M |
| M10 | Código do município no cadastro do cliente e na venda | hoje tudo casa pelo nome da cidade | M |
| M11 | Alerta ativo quando uma rotina financeira falha | `heartbeat.ts`, que hoje vigia uma rotina | P |

---

## Parte 3 — Ideias novas

Cada ideia cruza fontes que hoje não conversam.

### Geográfica e de mercado

| # | Ideia | O que responde | Depende de | Esforço |
|---|---|---|---|---|
| G1 | Penetração por município: tratores vendidos pela Nova, tratores registrados e imóveis rurais | Onde a Nova é forte e onde há mercado sem presença | M10 | M |
| G2 | Mapa de espaço em branco: municípios com muito imóvel de perfil ideal e poucas visitas e vendas | Para onde mandar o vendedor | Score v2, Gate 3 | M |
| G3 | Radar de mudança de uso: pasto que virou lavoura entre 2022 e 2024, por imóvel | Quem vai precisar de máquina nova | três safras já carregadas | P |
| G4 | Raio de atendimento por tempo de estrada, das duas lojas | Custo de deslocamento e fronteira entre lojas | rota com várias paradas | M |
| G5 | Território por vendedor e municípios sem visita há N dias | Cobertura da carteira | visitas do CRM | P |
| G6 | Base instalada no mapa: trator vendido, idade e revisão pendente | Roteiro de pós-venda | Cliente único | M |

### Comercial e histórico de vendas

| # | Ideia | O que responde | Depende de | Esforço |
|---|---|---|---|---|
| C1 | Ficha completa do cliente: máquinas, implementos, peças, serviços, propostas, ligações e imóvel, das duas contas | Tudo sobre o cliente numa tela | Cliente único | G |
| C2 | Ciclo de troca do trator: idade da máquina, horímetro das revisões e histórico de troca | Quem está na hora de trocar | controle de revisões | M |
| C3 | Venda cruzada: cliente com trator e sem implemento, ou com máquina e sem peça nem serviço há meses | Oportunidade por cliente | Cliente único, Venda válida | M |
| C4 | Coorte e recompra: dos clientes de cada ano, quantos voltaram | Retenção | Cliente único | M |
| C5 | Valor do cliente ao longo do tempo, com margem | Quem vale o esforço | custo médio preenchido | M |
| C6 | Risco de abandono com nota, no lugar das regras fixas de 90 dias e 6 meses | Quem está esfriando | histórico de compras e ordens | M |
| C7 | Funil único, no lugar dos três que coexistem | Um número só de previsão | decisão de qual fica | G |
| C8 | Origem do negócio até a nota: feira, contato, proposta e venda faturada | Retorno real do marketing | vínculo entre contato e proposta | M |

### Financeira e estratégica

| # | Ideia | O que responde | Depende de | Esforço |
|---|---|---|---|---|
| F1 | Projeção de caixa de 13 semanas, com saldo bancário real e probabilidade de recebimento pelo histórico do cliente | Vai faltar caixa, e quando | movimentos bancários, pontualidade por cliente | G |
| F2 | Orçado e realizado por linha do DRE | Desvio do plano | tabela de orçamento, nova | M |
| F3 | Ponto de equilíbrio, separando custo fixo de variável | Quanto vender para empatar | classificação das categorias | M |
| F4 | Resultado por linha de negócio: máquinas, peças, oficina e garantia | Qual linha sustenta a loja | rateio que já existe | M |
| F5 | Concentração de receita: parcela dos 5 e 10 maiores clientes e fornecedores ao longo do tempo | Dependência | Cliente único | P |
| F6 | Rentabilidade por vendedor, incluindo peças e serviço da carteira | Vendedor que traz cliente lucrativo | Cliente único | M |
| F7 | Custo do pátio por máquina: dias parada, juros e valor, com alerta antes de virar prejuízo | O que liquidar primeiro | simulador de liquidação | P |
| F8 | Cenários de juros, prazo e volume de tratores sobre o caixa | Sensibilidade | F1 | M |
| F9 | War Room alimentado sozinho, com o caixa vindo de F1 | Reunião com número | F1 | P |

### Transversal

| # | Ideia | O que responde | Esforço |
|---|---|---|---|
| T1 | Painel de confiança dos dados: fonte, data, cobertura e divergência conhecida de cada indicador | Posso confiar neste número? | M |
| T2 | Dicionário único de indicadores: uma definição de faturamento, margem, cliente ativo e máquina | Por que duas telas divergem | M |

---

## Ordem recomendada

| Onda | Conteúdo | Por quê |
|---|---|---|
| 0 | S1, S3, S5, S6 | Escrita aberta em produção |
| 1 | Leitura completa (N1, N7, N14), cliente único, venda válida única e T2 | Tudo depende disto |
| 2 | Demais correções de número e as rotinas | Confiança no que já existe |
| 3 | M1, M2, M3, M4, M5 | O dado já existe, falta a tela |
| 4 | C1, G1, G2, F1, C2 | Decisão comercial e de caixa |
| 5 | Demais ideias | Conforme a prioridade do negócio |

O Gate 3 do Score v2 e o roteiro de visitas seguem fila própria e alimentam G2, G4 e G6.

## Conferência feita em produção

| Chamada sem login | Resposta |
|---|---|
| `https://dashboard-agro-sp-production.up.railway.app/` | 200 |
| `https://portal.novatratores.com/api/supervisor-vendas?acao=kpis` | 200 |
| `https://portal.novatratores.com/api/dre-financeiro/home/kpis` | 200 |

Foram só chamadas de leitura. Nenhuma rota de escrita foi testada.
