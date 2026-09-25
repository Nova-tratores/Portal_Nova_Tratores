# Inteligência Agrícola por CAR — Planejamento

> Plano de setembro/2026. Espelhado na aba **Inteligência por CAR** de `/dashboard-agro`
> (conteúdo em `src/lib/agro/plano-car.ts`). Nada disto está no banco ainda.

## 1. Objetivo e critério de sucesso

O objetivo é gerar, para cada imóvel rural (CAR) da área de atuação, um perfil com a cultura estimada, a área, o crédito rural recente e a oportunidade de máquina, e transformar isso em uma lista de prospecção priorizada dentro do portal.

O sistema funciona se cumprir três condições:

1. Acurácia de pelo menos 80% na cultura principal, medida contra clientes com cultura conhecida.
2. Pelo menos 60% das glebas SICOR da região atribuídas a um CAR.
3. Uso real: o vendedor trabalha a lista, e isso aparece em propostas abertas a partir dela.

Se a terceira condição falhar, o resto não importa.

## 2. Escopo

**Dentro:** municípios de atuação da concessionária (lista fechada na Fase 0), histórico de crédito dos últimos 3 a 5 anos e as culturas que o MapBiomas separa.

**Fora, por enquanto:** o estado inteiro, previsão de safra, produtividade estimada, identificação automática do dono do CAR e qualquer venda ou exposição desses dados para fora da empresa.

## 3. Arquitetura

```
[Fontes]                          [Pipeline offline - Python]              [Supabase PostGIS]         [Portal Next.js]
SICAR (shapefile/município) ──┐
MapBiomas Col.10 (GEE)      ──┼──> ingestão → limpeza → estatística ──> schema agro (tabelas) ──> views → ficha do CAR
SICOR microdados (BCB)      ──┤    zonal → cruzamento espacial →        + RPCs SECURITY DEFINER     mapa, lista de
IBGE PAM (checagem)         ──┘    score de confiança                                               prospecção, cockpit
Sentinel-2 (Fase 5)         ──────> modelo próprio (condicional)
```

Estas regras de arquitetura não são negociáveis:

- Nenhum processamento de raster roda no Railway ou no Next.js. A estatística zonal do MapBiomas roda no Google Earth Engine, e o resto em Python local.
- O pipeline grava com a service role através de um script versionado. O portal só lê views.
- Cada execução do pipeline gera um registro em `pipeline_execucao`, e todo dado derivado aponta para a execução que o criou. Assim você refaz, compara versões e desfaz.

## 4. Modelo de dados (schema `agro`)

```sql
-- Imóveis
car_imovel (cod_car PK, municipio_ibge, area_ha, modulos_fiscais, status_car, tipo_imovel,
            geom geometry(MultiPolygon,4674), geom_area_util, atualizado_em)
car_sobreposicao (cod_car_a, cod_car_b, area_sobreposta_ha, pct_a, pct_b)

-- Uso do solo (um CAR tem N linhas por safra/fonte)
dominio_cultura (codigo PK, nome, grupo, mapbiomas_classes int[], sicor_produtos text[])
uso_solo_car (cod_car, ano_safra, fonte, cultura_codigo, area_ha, pct_area_util,
              execucao_id, PK(cod_car, ano_safra, fonte, cultura_codigo))

-- Crédito
sicor_operacao (ref_bacen PK, ano_emissao, finalidade, produto, valor, area_financiada,
                municipio_ibge, programa, fonte_recurso)
sicor_gleba (id PK, ref_bacen FK, geom)
sicor_gleba_car (gleba_id, cod_car, pct_gleba_no_car, metodo)   -- resultado do cruzamento

-- Perfil consolidado (materializado, recalculado a cada execução)
car_perfil (cod_car PK, ano_safra, cultura_principal, area_cultura_ha, confianca,
            motivo_confianca, credito_12m, credito_36m, ultima_finalidade, score_oportunidade)

-- Ponte com o comercial (único ponto de escrita humana)
car_cliente_vinculo (cod_car, cliente_omie_id, origem, confirmado_por, confirmado_em)
car_validacao (cod_car, ano_safra, cultura_real, informado_por, informado_em, fonte)  -- verdade de campo

-- Configuração comercial (tabela, nunca hardcode)
oportunidade_regra (cultura_codigo, faixa_area_min, faixa_area_max, produto_sugerido, argumento, prioridade)

pipeline_execucao (id, fonte, versao, iniciado_em, concluido_em, linhas, observacao)
```

Pontos de desenho que evitam retrabalho:

- `dominio_cultura` traduz os códigos do MapBiomas e os nomes de produto do SICOR para um vocabulário único. Sem essa tabela as fontes nunca conversam.
- `pct_area_util` é calculado sobre a área agrícola, já descontando vegetação nativa, APP e água. Se você usar a área total do CAR como base, uma fazenda de café com 40% de mata aparece como "60% café" e distorce tudo.
- Os vínculos com cliente e as validações só entram por RPCs `SECURITY DEFINER`, com RLS de leitura por papel, no padrão que o portal já usa.

## 5. Regras de negócio

**Cultura principal:** é a classe agrícola com maior área útil na safra mais recente, desde que ocupe pelo menos 30% da área útil. Abaixo disso, o CAR é classificado como "Diversificado".

**Confiança:**

| Nível | Condição |
|---|---|
| Alta | MapBiomas e SICOR concordam na mesma safra, ou há validação de campo |
| Média | Só uma fonte, com cultura ocupando ≥ 60% da área útil |
| Baixa | Só uma fonte com < 60%, fontes discordantes, ou CAR com sobreposição > 20% |

A tela mostra sempre o nível de confiança e a fonte. Um dado validado em campo sempre vence o dado estimado.

**Milho:** o MapBiomas não separa milho. Ele fica em "outras lavouras temporárias", e a safrinha some sob a soja. Até a Fase 5, milho só aparece via SICOR. Deixe isso explícito na interface e não invente milho.

**Atribuição gleba→CAR:** a gleba é atribuída ao CAR que contém pelo menos 50% da área dela. Se nenhum CAR passa disso, fica sem atribuição, que é melhor do que atribuir errado.

**Score de oportunidade:** uma soma ponderada simples e explicável, sem machine learning. Os componentes são área da cultura, crédito de investimento recente, ausência de compra na Nova (via vínculo com o Omie) e prioridade da regra. Pesos na tabela `oportunidade_regra`.

## 6. Fases

### Fase 0 — Levantamento e portões (1 semana)
- Fechar a lista de municípios com o comercial.
- Baixar o SICAR desses municípios e contar os imóveis, para saber o tamanho real do problema.
- **Portão crítico:** baixar os microdados do SICOR e confirmar se o arquivo de glebas tem coordenadas e produto utilizáveis na região. Se não tiver, a Fase 2 cai e o SICOR vira só dado agregado por município. Descubra isso antes de escrever qualquer código.
- Escrever o LIA (avaliação de legítimo interesse, LGPD) em uma página, explicando a finalidade, os dados usados, quem acessa e por quanto tempo.

**Entregável:** documento com os números de cada fonte e a decisão de seguir ou não com o SICOR.

### Fase 1 — Base CAR + MapBiomas (2 semanas)
- Script de ingestão do SICAR com normalização de geometria (SIRGAS 2000), remoção de duplicatas e cálculo de sobreposições.
- Script GEE com estatística zonal por CAR, para as últimas 3 coleções anuais. Já foi feito algo parecido, então reaproveitar.
- Carga no Supabase via migrations versionadas mais o script de carga.

**Portão:** somar a área por cultura em cada município e comparar com o IBGE PAM. Uma divergência acima de ±25% em uma cultura relevante é sinal de bug antes de ser sinal de dado.

### Fase 2 — SICOR (2 semanas, condicionada à Fase 0)
- Ingestão de operações e glebas dos últimos 3 a 5 anos, apenas para os municípios do escopo.
- Cruzamento espacial gleba→CAR, feito no PostGIS com índice GIST.
- Cálculo de `credito_12m` e `credito_36m`, e marcação de operações de investimento (que indicam compra de máquina ou benfeitoria).

**Portão:** pelo menos 60% das glebas atribuídas. Abaixo disso, investigue a projeção e a precisão das coordenadas antes de seguir.

### Fase 3 — Validação (1 a 2 semanas, em paralelo à Fase 4)
- Levantar de 50 a 100 CARs de clientes com cultura conhecida. O vínculo desses é feito à mão, e é trabalho chato mas obrigatório.
- Montar a matriz de confusão por cultura.

**Portão:** acurácia de 80% ou mais na cultura principal. Se não atingir, a tela sai só com os CARs de confiança alta, e a Fase 5 sobe de prioridade.

### Fase 4 — Portal (2 semanas)
- Mapa com os CARs coloridos por cultura, filtros por município, cultura, faixa de área, confiança e crédito recente.
- Ficha do CAR com o histórico de uso do solo por safra, o crédito, a fonte e a confiança de cada dado.
- Lista de prospecção ordenada por score, com exportação.
- Integração com o cockpit de atendimento: um cliente vinculado mostra o perfil do CAR na tela de ligação.
- Botões de feedback "cultura confirmada" e "cultura errada → qual é?", gravando em `car_validacao`. Isso transforma o uso diário em dado de treino e é o ativo mais valioso do projeto no longo prazo.

### Fase 5 — Modelo Sentinel-2 próprio (condicional, 3 a 4 semanas)
Esta fase só acontece se a Fase 3 mostrar que ela é necessária, ou se separar milho e safrinha virar prioridade comercial.
- Os rótulos vêm das glebas SICOR e de `car_validacao`.
- A ferramenta é o WorldCereal custom via openEO, ou um Random Forest sobre séries temporais de NDVI do Sentinel-2. Comece pelo mais simples.
- O resultado entra como mais uma fonte em `uso_solo_car`. Nada no modelo de dados muda, e é por isso que ele foi desenhado assim.

### Fase 6 — Operação contínua

| Fonte | Frequência | Como |
|---|---|---|
| SICOR | Mensal | GitHub Actions + script |
| CAR | Trimestral | Manual, com script pronto |
| MapBiomas | Anual (nova coleção) | Reprocessamento completo |
| Perfil / score | Após cada carga | Recalcula `car_perfil` |

Um monitor de "dado velho" alerta se alguma fonte passar do prazo esperado.

## 7. Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| SICOR sem glebas utilizáveis | Perde a verdade de campo e o crédito por CAR | Descobrir na Fase 0; fallback para agregado por município |
| CAR sujo (sobreposição, duplicata) | Área e cultura contadas em dobro | Tabela de sobreposição + confiança rebaixada |
| Vínculo CAR↔cliente não acontece | Lista vira mapa bonito sem ação | Vínculo embutido no fluxo do vendedor, com meta de vínculos por semana |
| Vendedor desconfia do dado | Abandono do módulo | Confiança sempre visível; lançar só com alta/média |
| LGPD | Risco jurídico e reputacional | LIA, acesso restrito por papel, sem exportar dado de pessoa física para fora |
| Um único mantenedor | Sistema morre se a pessoa sair | Pipeline documentado, fontes versionadas, entra no plano de continuidade |

## 8. Estimativa

A soma é de 9 a 12 semanas em meio período até a Fase 4 no ar, sem contar a Fase 5. O caminho crítico é o portão SICOR da Fase 0. O trabalho de vínculo manual da Fase 3 é o mais subestimado.

## 9. Primeiro passo concreto

Esta semana: baixar os microdados do SICOR, filtrar um município de atuação e ver se as glebas têm geometria e produto. Esse resultado decide metade do plano.
