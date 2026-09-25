# Fase 0 — Levantamento e portões (Inteligência Agrícola por CAR)

> Executado em 25/09/2026. Entregável da Fase 0 do plano em `docs/inteligencia-agricola-car-plano.md`:
> os números de cada fonte e a decisão de seguir ou não com o SICOR.
> Município-piloto do portão: **Piraju/SP (IBGE 3538808)** — sede da loja.

## 1. Fontes: o que existe, onde e como baixar

| Fonte | Onde | Acesso | Formato | Tamanho |
|---|---|---|---|---|
| SICOR glebas | `bcb.gov.br/htms/sicor/DadosBrutos/SICOR_GLEBAS.gz` | público, sem login | CSV `;` — **um PONTO por linha** (`REF_BACEN;NU_ORDEM;NU_IDENTIFICADOR;NU_INDICE_GLEBA;NU_INDICE_PONTO;VL_LATITUDE;VL_LONGITUDE;CGL_VL_ALTITUDE;ID_PONTO`), arquivo único com todos os anos | 2,1 GB gz |
| SICOR operações | `.../DadosBrutos/SICOR_OPERACAO_BASICA_ESTADO_<ano>.gz` | público | CSV `;`, uma operação por linha, 47 colunas (`CD_ESTADO`, `CD_EMPREENDIMENTO`, `VL_PARC_CREDITO`, `VL_AREA_FINANC`, `CD_PROGRAMA`, `CD_FONTE_RECURSO`, datas…) | 50–68 MB gz por ano |
| SICOR domínio | `bcb.gov.br/htms/sicor/Empreendimento.csv` | público | `CD_EMPREENDIMENTO` → finalidade / atividade / modalidade / **produto** (3.315 códigos) | 400 KB |
| SICAR imóveis | WFS `geoserver.car.gov.br/geoserver/sicar/wfs`, camada `sicar:sicar_imoveis_sp` | público, **sem captcha** (o site consultapublica exige) | GeoJSON, EPSG:4674, atributos `cod_imovel, status_imovel, area, condicao, cod_municipio_ibge, m_fiscal, tipo_imovel` | ~6 MB por município |
| Malha municipal | IBGE `servicodados.ibge.gov.br/api/v3/malhas/municipios/<ibge>` | público | GeoJSON | pequeno |
| MapBiomas | Google Earth Engine (coleção 10) | conta GEE | raster anual | — |
| IBGE PAM | SIDRA | público | tabela | — |

⚠️ **Nem as operações nem as glebas do SICOR trazem município.** A ligação gleba↔operação é por `REF_BACEN + NU_ORDEM`; o município só sai por recorte espacial das glebas (centróide dentro do polígono IBGE). Tentativas de nome do arquivo "complementar" (`SICOR_COMPLEM_*`) deram 404.

Gotcha do IBGE: **3538907 é Pirajuí**, Piraju é **3538808**.

## 2. SICAR — tamanho real do problema

Piraju (WFS, 25/09/2026):

| Métrica | Valor |
|---|---|
| Imóveis | 904 (863 ativos, 35 cancelados, 6 pendentes); 903 IRU + 1 AST |
| Área declarada somada | 159.129 ha — mas a malha IBGE de Piraju tem **50.356 ha** |
| Causa | 2 imóveis **cancelados** cobrem o município inteiro (52.080 ha cada) + sobreposições entre CARs ativos |
| Mediana / p90 de área | 18,0 ha / 138,7 ha |
| Faixas | <20 ha: 474 · 20–50: 186 · 50–100: 116 · 100–500: 112 · ≥500: 16 |
| Geometria | 0 sem geometria, 0 códigos duplicados |
| Condição (top) | "Analisado, aguardando atendimento a notificação" 308 · "Aguardando análise" 195 · … |

Decisões que saem daqui: filtrar `status_imovel='AT'` antes de qualquer soma; a tabela `car_sobreposicao` do plano é necessária (não é hipótese).

Região candidata (28 municípios em torno de Piraju, contados por WFS): **20.070 imóveis**. Detalhe:

| Município | IBGE | CAR | | Município | IBGE | CAR |
|---|---|---|---|---|---|---|
| Piraju | 3538808 | 904 | | Santa Cruz do Rio Pardo | 3546405 | 2.012 |
| Fartura | 3515400 | 1.294 | | Avaré | 3504503 | 1.329 |
| Sarutaiá | 3551207 | 247 | | Itaí | 3521804 | 1.287 |
| Tejupá | 3554201 | 635 | | Taquarituba | 3553807 | 1.259 |
| Timburi | 3554607 | 248 | | Itaporanga | 3522802 | 1.181 |
| Bernardino de Campos | 3506300 | 525 | | Paranapanema | 3535804 | 1.179 |
| Manduri | 3528601 | 597 | | São Pedro do Turvo | 3550506 | 1.281 |
| Óleo | 3533809 | 552 | | Cerqueira César | 3511409 | 979 |
| Taguaí | 3553005 | 415 | | Águas de Santa Bárbara | 3500550 | 594 |
| Ipaussu | 3520905 | 176 | | Arandu | 3503109 | 549 |
| Ourinhos | 3534708 | 516 | | Ribeirão do Sul | 3543204 | 532 |
| Chavantes | 3557204 | 160 | | Coronel Macedo | 3512605 | 498 |
| Canitar | 3510153 | 86 | | Salto Grande | 3545407 | 421 |
| Espírito Santo do Turvo | 3515194 | 221 | | Barão de Antonina | 3505005 | 393 |

A região imediata IBGE de Piraju é só Piraju, Fartura, Sarutaiá, Tejupá e Timburi (3.328 imóveis). **A lista fechada de municípios é decisão do comercial** — a tabela acima é o cardápio.

## 3. Portão SICOR — Piraju

Rodado em 25/09/2026 com `scripts/agro/sicor_portao_fase0.py` (glebas completas + operações SP 2019–2024). Saída bruta e CSV em `docs/agro/dados/`.

| Métrica | Valor |
|---|---|
| Pontos varridos no `SICOR_GLEBAS.gz` | 157.073.587 |
| Glebas na bbox de Piraju | 1.178 |
| Glebas com centróide **dentro** do município | **418** |
| …com polígono (≥3 pontos) | **418 (100%)** — nenhuma é ponto solto |
| …pontos por gleba | 5–20: 51% · 21–100: 49% |
| …precisão das coordenadas | **100% com ≥5 casas decimais (~1 m)** |
| …com operação em 2019–2024 | 260 (62%) — as outras 158 são de 2013–2018 (anos não baixados) |
| …área mediana da gleba | 24,2 ha |
| Cobertura estadual | só **33,4%** das operações SP de 2024 (17.738 de 53.144) têm alguma gleba |

Produto e finalidade vêm pela tabela `Empreendimento.csv` — funciona:

| | |
|---|---|
| Finalidade | Custeio 87% · Investimento 13% |
| Atividade | Agrícola 84% · Pecuária 16% |
| Produto (260 glebas com operação) | Soja 76 · Café 53 · Sorgo 37 · Bovinos 34 · Correção de solo 15 · Milho 10 · Trigo 8 · Cana 7 · Tomate 5 |
| Valor contratado (glebas em Piraju) | 2019 R$ 22,4 mi · 2020 9,3 · 2021 7,6 · 2022 13,2 · 2023 6,7 · **2024 R$ 35,6 mi** |

**Prévia do portão da Fase 2 (atribuição gleba→CAR)**, cruzando as 418 glebas com os 863 CARs ativos de Piraju (regra: ≥50% dos vértices dentro do mesmo CAR):

| Métrica | Valor |
|---|---|
| Glebas atribuídas a um CAR | **380 (91%)** — o portão da Fase 2 pede 60% |
| Sem atribuição (<50%) | 37 (9%) |
| Sem nenhum CAR embaixo | 1 |
| Glebas cujos vértices tocam mais de um CAR | 253 (61%) — **sobreposição entre CARs é regra, não exceção** |
| CARs ativos com pelo menos uma gleba | **110 de 863 (13%)** |

### Decisão: SEGUIR com o SICOR (Fase 2 confirmada)

- As glebas têm geometria de qualidade (polígono, precisão métrica) e produto legível. O cruzamento espacial com o CAR funciona e passa folgado do portão de 60%.
- **Limitação clara:** o SICOR cobre uma minoria dos imóveis (13% dos CARs de Piraju têm gleba; 1/3 das operações de SP têm gleba). Ele NÃO é a fonte principal de cultura — é **verdade de campo parcial + crédito por CAR onde existe gleba**. A cultura principal continua vindo do MapBiomas; o SICOR sobe a confiança de "Média" para "Alta" quando concorda.
- Para os CARs sem gleba, o crédito entra só como agregado municipal (fallback previsto no plano). Vale checar na Fase 2 se as operações sem gleba trazem `CD_MUNICIPIO` em algum arquivo complementar que ainda não achamos.
- Milho aparece no SICOR (10 glebas) — confirma que ele é a única fonte de milho até a Fase 5.
- Sobreposição de CAR (61% das glebas tocam mais de um) reforça a tabela `car_sobreposicao` e a confiança "Baixa" para CAR com >20% sobreposto.

### 3.1 Portão nos vizinhos — região imediata IBGE de Piraju

Mesma passada (25/09/2026, uma varredura para os 5 municípios; CSV com WKT e CAR atribuído em `docs/agro/dados/glebas_regiao_imediata_sicor.csv`, 1.657 glebas):

| Município | Área (ha) | Glebas | Polígono | Com operação 2019–24 | CARs ativos | Gleba→CAR (≥50%) | CARs com gleba | Produtos principais |
|---|---|---|---|---|---|---|---|---|
| Piraju | 50.356 | 418 | 100% | 62% | 863 | **91%** | 107 (12%) | soja 29%, café 20%, sorgo 14%, bovinos 13% |
| Fartura | 42.826 | 523 | 100% | 79% | 1.249 | **81%** | 152 (12%) | café 43%, bovinos 38%, soja 10% |
| Sarutaiá | 14.127 | 197 | 100% | 54% | 243 | **88%** | 34 (14%) | soja 42%, milho 17%, café 16% |
| Tejupá | 29.547 | 408 | 100% | 60% | 611 | **91%** | 96 (16%) | café 40%, soja 29%, bovinos 11%, pimentão 6% |
| Timburi | 19.642 | 111 | 100% | 74% | 220 | **78%** | 28 (13%) | café 43%, bovinos 29%, soja 10% |

Crédito contratado nas glebas dos 5 municípios (só operações com gleba): 2019 R$ 38,0 mi · 2020 67,3 · 2021 67,5 · 2022 59,2 · 2023 46,1 · **2024 R$ 74,6 mi**. 1.433 glebas atribuídas a 417 CARs distintos.

Leitura: o portão de 60% passa nos cinco. A cobertura de CAR fica estável em 12–16% em todos — é a natureza da fonte, não um problema de Piraju. O perfil de cultura muda bastante de um município para o outro (Fartura/Timburi = café + pecuária; Sarutaiá = grãos), o que reforça a lista de prospecção por município e a regra de oportunidade por cultura.

### O que falta na Fase 0
- [ ] Lista fechada de municípios (comercial).
- [x] Portão nos vizinhos da região imediata — feito, passou nos 5.
- [ ] LIA revisada e assinada.
- [x] ~~Conta no Google Earth Engine~~ — desnecessária: MapBiomas lido do GeoTIFF público (COG) com rasterio.
- [x] Aplicar `sql/agro-schema.sql` — aplicada 25/09/2026, SICAR e SICOR dos 5 municípios carregados.

## 3.2 Carga no banco (25/09/2026, tarde) — Fase 1 e 2 começadas

Migration `sql/agro-schema.sql` **APLICADA** pelo usuário (verificada por REST: 11 tabelas + view, 16 culturas, RPC responde ao service role e recusa a anon). Ajuste aplicado em seguida: `security_invoker` + REVOKE na view (view roda como o dono e passava por cima do RLS).

| Execução | O que | Resultado |
|---|---|---|
| #1 `sicar` | `scripts/agro/carregar_sicar.py` — WFS → `agro_car_imovel` dos 5 municípios + `agro_calcular_sobreposicoes()` | 3.328 imóveis (3.186 AT, 121 CA, 21 PE); 4.055 pares de sobreposição, **535 com >20%** de um lado, **136 com ≥99%** (CAR dentro de CAR / duplicata) |
| #2 `sicor` | `scripts/agro/carregar_sicor.py` — CSV do portão + ops gz → `agro_sicor_operacao` (878) e `agro_sicor_gleba` (1.657) + `agro_atribuir_glebas()` | **1.589 glebas atribuídas (96%)** a **304 CARs** distintos; mediana de 99,4% da gleba dentro do CAR; por município 96–99% |

A regra do banco (≥50% da ÁREA da gleba dentro do CAR, por `ST_Intersection` em geography) atribui mais do que a prévia em Python (votação de vértices, 78–91%): a diferença são glebas que encostam na divisa de dois CARs. Operações por cultura no vocabulário: café 320 · pastagem/pecuária 256 · soja 148 · sorgo 23 · milho 22 · outras perenes 14 · cana 12 · trigo 9 · hortaliças 20 · feijão 5 · citros 4; 58 sem cultura de propósito (finalidade investimento: correção de solo, irrigação, armazém, cercas…).

Gotcha visto: o WFS filtrado por `cod_municipio_ibge=3538808` devolve imóveis cujo `cod_imovel` começa com outro município (ex. `SP-3506300-…` = Bernardino de Campos, mas `municipio` = Piraju): imóvel que cruza a divisa. O código do CAR NÃO é o município — usar sempre a coluna `municipio_ibge`.

## 3.3 MapBiomas sem Earth Engine + portão da Fase 1 (IBGE PAM)

A coleção 10 do MapBiomas é publicada como **GeoTIFF otimizado para nuvem** no GCS (`storage.googleapis.com/mapbiomas-public/initiatives/brasil/collection_10/lulc/coverage/brazil_coverage_<ano>.tif`, EPSG:4326, 30 m). Com `rasterio` + `/vsicurl/` a janela dos 5 municípios (1.918 × 2.007 px) vem por HTTP em ~4 s e a estatística zonal dos 3.186 CARs ativos leva ~15 s por ano no PC. **A conta no Google Earth Engine deixou de ser bloqueio.** Script: `scripts/agro/mapbiomas_zonal.py` (área útil = classes de uso agropecuário; grava `agro_uso_solo_car` e `agro_car_imovel.area_util_ha`).

**Portão da Fase 1** — área por classe no polígono inteiro do município (MapBiomas 2024) × área plantada do IBGE PAM 2024 (SIDRA 5457, dados em `docs/agro/dados/pam2024.json`):

| Município | Soja MB / PAM | Café MB / PAM | Cana MB / PAM | Mosaico de usos (MB) |
|---|---|---|---|---|
| Piraju | 10.105 / 14.000 (−28%) | 1.466 / 1.300 (+13%) | 2.849 / 4.000 (−29%) | 13.261 ha (26% do município) |
| Fartura | 3.719 / 5.176 (−28%) | 1.102 / 2.482 (−56%) | 365 / 1.700 (−79%) | 10.954 ha |
| Sarutaiá | 2.895 / 2.500 (+16%) | 862 / 1.700 (−49%) | 416 / 1.000 (−58%) | 3.944 ha |
| Tejupá | 5.399 / 4.450 (+21%) | 1.894 / 4.500 (−58%) | — | 7.347 ha |
| Timburi | 1.990 / 2.050 (−3%) | 754 / 835 (−10%) | 58 / 100 | 3.874 ha |

Leitura (não é bug: o total pelo polígono do município bate com a soma por CAR):
- **Soja** fica dentro ou na borda da tolerância de ±25% (Piraju e Fartura em −28%). PAM conta área *plantada* e o MapBiomas área *ocupada* em pixel de 30 m; parte da diferença é metodológica.
- **Café e cana ficam ~50% abaixo do PAM** em Fartura, Sarutaiá e Tejupá — justamente onde a classe **"mosaico de usos"** (21) é enorme. O MapBiomas não separa o café de sítio pequeno da pastagem em volta: cai tudo em mosaico. Isso é limitação da fonte, prevista no plano ("as culturas que o MapBiomas separa").
- **Milho** não existe no MapBiomas (PAM: 3.850 ha em Piraju, 1.994 em Fartura) — confirma que milho só entra via SICOR até a Fase 5.

Decisões que saem do portão:
1. **Mosaico nunca vira "cultura principal"**: CAR dominado por mosaico é "Diversificado" com confiança Baixa, e é o alvo natural do SICOR e da validação de campo.
2. **Café e cana estimados só pelo MapBiomas ficam no máximo em confiança Média**; "Alta" exige SICOR concordando ou validação.
3. Seguir para o cálculo do perfil com essas regras; a Fase 5 (modelo próprio) sobe de prioridade se o comercial quiser café bem separado.

## 3.4 Uso do solo e perfil no banco (25/09/2026, fim do dia)

| Execução | O que | Resultado |
|---|---|---|
| #3 `mapbiomas` | `scripts/agro/mapbiomas_zonal.py` 2022–2024 | 25.235 linhas em `agro_uso_solo_car` (3.186 CARs × 3 safras × culturas); `area_util_ha` preenchida |
| #4 `perfil` | `scripts/agro/calcular_perfil.py` safra 2024 | 3.186 perfis: confiança **alta 98 · média 851 · baixa 2.237**; cultura principal: diversificado 1.195, pastagem 1.006, soja 475, café 274, silvicultura 135, cana 51; 151 CARs com crédito nos 36 meses, 33 com investimento |

Regras aplicadas (ver docstring do script): mosaico nunca é principal; café/cana só por MapBiomas ficam em média; validação de campo vence tudo; sobreposição >20% rebaixa para baixa; **crédito rateado pela área das glebas** da operação (um contrato de R$ 12 mi com glebas em vários CARs estava sendo contado inteiro em cada CAR — corrigido, virou R$ 1,2 mi no CAR certo). Score = área + crédito + "ainda não é cliente" + prioridade da regra, × fator da confiança; `agro_oportunidade_regra` ainda está vazia (pesos padrão 1/1/1, prioridade 0,5) — **é o comercial que preenche**.

Por que 70% "baixa": 1.195 CARs são diversificados (mosaico ou nenhuma cultura ≥30%) e a maioria dos CARs pequenos tem só o MapBiomas como fonte. É o retrato honesto da fonte; a lista de prospecção sai ordenada por score e mostra a confiança sempre. Vínculo com cliente e validação de campo (Fase 4) são o que sobe esse número.

## 3.5 Escopo = os 45 municípios da NOVA (25/09/2026, fim do dia)

O usuário apontou que a lista de municípios já existe: é o filtro **Loja = NOVA (45)** do Dashboard Agro externo (app no Railway, constante `LOJA_MUNICIPIOS.NOVA` no HTML). Extraída e resolvida para códigos IBGE em **`docs/agro/municipios-nova.json`** (45/45 resolvidos; pendente só a confirmação formal do comercial). Vai de Itararé/Nova Campina (sul) a Ubirajara/Lupércio (norte), incluindo Ourinhos, Avaré, Santa Cruz do Rio Pardo, Itaí, Paranapanema, Taquarituba.

Carga estendida aos 40 municípios que faltavam:

| Execução | O que | Resultado |
|---|---|---|
| #5/#6 `sicar` | WFS → `agro_car_imovel` dos 40 | **30.701 imóveis** (total 34.029 nos 45). Sobreposição caiu em Arandu: **SICAR entrega polígonos inválidos** (GEOS TopologyException). Patch `sql/agro-schema-fix-geometrias.sql` (aplicado): `agro_corrigir_geometrias()` consertou **33 imóveis**; as funções de cruzamento ganharam `ST_MakeValid`. Sobreposições recalculadas nos 45 em seguida. |
| `sicor` (portão 45) | Passada única do `SICOR_GLEBAS.gz` para os 45 municípios (`docs/agro/dados/portao_nova45_saida.txt`, CSV `glebas_nova45_sicor.csv`) | **23.248 glebas**, 100% polígono. Gleba→CAR (prévia por vértices) entre 76% e 97% em 43 municípios; Salto Grande 59% e Canitar 50% (4 glebas). Maiores: Itararé 1.934, Santa Cruz do Rio Pardo 1.877, Itaberá 1.705, Taquarituba 1.613, Paranapanema 1.513, Palmital 1.274, Itaí 1.367. |
| #7 `mapbiomas` | zonal 2022–2024 dos 40 novos (28.469 CARs ativos; janela 7.779 × 8.323 px, 9 s por ano) | 231.615 linhas (total 256.850). A gravação da `area_util_ha` em 8 threads **saturou o Supabase** junto com as sobreposições (timeouts) — retomada com `--apenas-area-util` e 4 threads. |
| sobreposições 45 | `agro_calcular_sobreposicoes` por município (exec #6) | **38.389 pares**, 1.286 com ≥99%; Angatuba 2.074, Bofete 2.159, Palmital 2.030, Santa Cruz 1.992. Sem erros após o patch. |

## 3.6 Vínculo CAR↔cliente sugerido pelas visitas do CRM (25/09/2026, noite)

O app `crm.novatratores.com.br` grava a localização das visitas dos vendedores no mesmo Supabase (`visitas`; view `vw_visitas_detalhadas`). Pré-check:

| | |
|---|---|
| Visitas | 251 desde 25/04/2026; 240 presenciais com GPS; precisão mediana 34 m, p90 89 m, máx 1.809 m |
| Chave do cliente | `visitas.propriedade_id → portal_nt_clientes_PRINCIPAL.id` (ex.: 61407 = "Faz Tijuco Preto", `id_omie` 990001054); `pessoa_ids` é a pessoa física visitada |
| Prévia local (GeoJSON dos 45 municípios) | **151 das 247 visitas com GPS caem num CAR ativo** (61%); 147 pares CAR×cliente, 120 CARs, 127 clientes; 21 CARs visitados por mais de um cliente; 11 visitas em CAR sobreposto |

Decisão do usuário: só **sugestão** — nada vira vínculo confirmado sem humano. Entregue:
- `sql/agro-visitas-vinculo.sql`: tabela `agro_car_vinculo_sugestao` (status pendente/aceita/rejeitada), função `agro_sugerir_vinculos_por_visita()` (ST_Contains da visita presencial no CAR ativo, GPS ≤ 150 m, não retroativa; score explicável: +1 por visita até 3, +1 GPS ≤ 30 m, −1 CAR com vários clientes, −0,5 cliente com >3 CARs; não reabre o que foi decidido), RPC `agro_decidir_sugestao()` (aceitar chama `agro_vincular_cliente` com origem `sugerido`), view `agro_v_vinculo_sugestao` com `security_invoker`.
- `scripts/agro/sugerir_vinculos_visitas.py` (execução `fonte='crm'`), `calcular_perfil.py` passa a expor `sugestoes_pendentes` no `score_detalhe`.
- Rota `GET/POST /api/agro/vinculos/sugestoes` (primeira `/api/agro/*`; gate `dashboard-agro`) e guia **Vínculos** em `/dashboard-agro?tab=vinculos` com Aceitar/Rejeitar.

**Primeira rodada (25/09, execução #13, migration aplicada):** **139 sugestões** pendentes, 116 CARs, 123 clientes, 20 CARs visitados por mais de um cliente. Por município: Fartura 38, Tejupá 33, Taguaí 25, Piraju 11, Taquarituba 10, Timburi 7, Ourinhos 5. Por vendedor: Pedro Favaro 124, Leonardo Abrantes 9, Dougras Bomfim 6. Scores 1–3 (poucas visitas repetidas ainda). Guia testada no dev: lista, filtros e confirmação inline.

## 3.7 Fase 4 começou: guia "Mapa dos imóveis" (25/09/2026, noite)

- `sql/agro-mapa.sql` (usuário aplica): `agro_mapa_municipios()` (lista + contagens + centro) e `agro_mapa_municipio(ibge, tol)` — FeatureCollection dos CARs ativos do município com polígonos **simplificados no banco** (`ST_SimplifyPreserveTopology`, 0,00005° ≈ 5 m; Piraju inteiro tinha 5,8 MB), perfil, cliente vinculado, sugestões pendentes, sobreposição, e as visitas do CRM que caem nos imóveis.
- Rota `GET /api/agro/mapa[?municipio=]` (gate `dashboard-agro`, service role) e guia `/dashboard-agro?tab=mapa` (`components/dashboard-agro/MapaCar.tsx`, Leaflet do unpkg como no Supervisor): seletor de município (lembra o último), polígonos coloridos por cultura principal (opacidade = confiança, borda azul = cliente vinculado), legenda clicável que esconde culturas, filtros de confiança mínima e "com crédito 36 m", pins das visitas, popup com perfil/crédito/score/cliente.
- Guia "Vínculos" ganhou cabeçalho ordenável (A→Z / Z→A em toda coluna; empate desempata por score).

## 4. LIA

Rascunho em `docs/agro/lia-inteligencia-agricola-car.md` — falta DPO, avaliação e assinatura da direção.

## 5. Scripts e migration

- `scripts/agro/sicor_portao_fase0.py` — varre o `SICOR_GLEBAS.gz` (stdin) UMA vez para N municípios (`--municipios`, malhas IBGE baixadas e cacheadas), recorta por polígono, junta operações + produto, faz a prévia gleba→CAR se houver `--car-dir`, imprime o relatório por município + resumo e grava CSV com WKT. Só biblioteca padrão; ~25 min por passada.
- `scripts/agro/sicar_wfs_baixar.py` — conta/baixa imóveis CAR por município via WFS (usa `curl`: o urllib do Python falha no TLS do geoserver).
- `scripts/agro/carregar_sicar.py` — WFS → `agro_car_imovel` (upsert por `cod_car`, EWKT) + sobreposições; `scripts/agro/carregar_sicor.py` — CSV do portão + ops gz → operações e glebas + atribuição. Os dois abrem uma linha em `agro_pipeline_execucao`. Escrevem via PostgREST com o service role do `.env.local`.
- `sql/agro-schema.sql` — migration da Fase 1 (**aplicada 25/09/2026**): tabelas `agro_*` em `public`, PostGIS 4674, `agro_pipeline_execucao`, funções de atribuição gleba→CAR (≥50%) e de sobreposição, RPCs de vínculo/validação, view `agro_v_car_perfil`, seed do vocabulário de culturas.
