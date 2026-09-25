// Conteúdo do planejamento "Inteligência Agrícola por CAR" (setembro/2026).
// Lib PURA: só dados, sem lógica. A aba "Inteligência por CAR" de /dashboard-agro
// renderiza isto; a fonte editável em prosa é docs/inteligencia-agricola-car-plano.md.
// Nada deste plano está no banco ainda — é o guia das próximas sessões (Fase 0 → 6).

export type Bloco =
  | { tipo: 'p'; texto: string }
  | { tipo: 'lista'; itens: string[]; numerada?: boolean }
  | { tipo: 'tabela'; cabecalho: string[]; linhas: string[][] }
  | { tipo: 'codigo'; texto: string }
  | { tipo: 'aviso'; texto: string }
  | { tipo: 'fases' }

export type Secao = { id: string; numero: number; titulo: string; blocos: Bloco[] }

export type Fase = {
  fase: string
  titulo: string
  duracao: string
  intro?: string
  itens: string[]
  portao?: string
  entregavel?: string
  tabela?: { cabecalho: string[]; linhas: string[][] }
  rodape?: string
}

export const PLANO_CAR_META = {
  titulo: 'Inteligência Agrícola por CAR',
  subtitulo: 'Planejamento · setembro/2026 · Fases 0–3 no banco, Fase 4 em andamento (guias Mapa e Vínculos)',
  docPath: 'docs/inteligencia-agricola-car-plano.md',
}

export const FASES: Fase[] = [
  {
    fase: '0',
    titulo: 'Levantamento e portões',
    duracao: '1 semana',
    itens: [
      'Fechar a lista de municípios com o comercial.',
      'Baixar o SICAR desses municípios e contar os imóveis, para saber o tamanho real do problema.',
      'Escrever o LIA (avaliação de legítimo interesse, LGPD) em uma página, explicando a finalidade, os dados usados, quem acessa e por quanto tempo.',
    ],
    portao:
      'Crítico. Baixar os microdados do SICOR e confirmar se o arquivo de glebas tem coordenadas e produto utilizáveis na região. Se não tiver, a Fase 2 cai e o SICOR vira só dado agregado por município. Descubra isso antes de escrever qualquer código.',
    entregavel: 'Documento com os números de cada fonte e a decisão de seguir ou não com o SICOR.',
  },
  {
    fase: '1',
    titulo: 'Base CAR + MapBiomas',
    duracao: '2 semanas',
    itens: [
      'Script de ingestão do SICAR com normalização de geometria (SIRGAS 2000), remoção de duplicatas e cálculo de sobreposições.',
      'Script GEE com estatística zonal por CAR, para as últimas 3 coleções anuais. Já foi feito algo parecido, então reaproveitar.',
      'Carga no Supabase via migrations versionadas mais o script de carga.',
    ],
    portao:
      'Somar a área por cultura em cada município e comparar com o IBGE PAM. Uma divergência acima de ±25% em uma cultura relevante é sinal de bug antes de ser sinal de dado.',
  },
  {
    fase: '2',
    titulo: 'SICOR',
    duracao: '2 semanas, condicionada à Fase 0',
    itens: [
      'Ingestão de operações e glebas dos últimos 3 a 5 anos, apenas para os municípios do escopo.',
      'Cruzamento espacial gleba→CAR, feito no PostGIS com índice GIST.',
      'Cálculo de credito_12m e credito_36m, e marcação de operações de investimento (que indicam compra de máquina ou benfeitoria).',
    ],
    portao:
      'Pelo menos 60% das glebas atribuídas. Abaixo disso, investigue a projeção e a precisão das coordenadas antes de seguir.',
  },
  {
    fase: '3',
    titulo: 'Validação',
    duracao: '1 a 2 semanas, em paralelo à Fase 4',
    itens: [
      'Levantar de 50 a 100 CARs de clientes com cultura conhecida. O vínculo desses é feito à mão, e é trabalho chato mas obrigatório.',
      'Montar a matriz de confusão por cultura.',
    ],
    portao:
      'Acurácia de 80% ou mais na cultura principal. Se não atingir, a tela sai só com os CARs de confiança alta, e a Fase 5 sobe de prioridade.',
  },
  {
    fase: '4',
    titulo: 'Portal',
    duracao: '2 semanas',
    itens: [
      'Mapa com os CARs coloridos por cultura, filtros por município, cultura, faixa de área, confiança e crédito recente.',
      'Ficha do CAR com o histórico de uso do solo por safra, o crédito, a fonte e a confiança de cada dado.',
      'Lista de prospecção ordenada por score, com exportação.',
      'Integração com o cockpit de atendimento: um cliente vinculado mostra o perfil do CAR na tela de ligação.',
      'Botões de feedback "cultura confirmada" e "cultura errada → qual é?", gravando em car_validacao. Isso transforma o uso diário em dado de treino e é o ativo mais valioso do projeto no longo prazo.',
    ],
  },
  {
    fase: '5',
    titulo: 'Modelo Sentinel-2 próprio',
    duracao: 'condicional, 3 a 4 semanas',
    intro:
      'Esta fase só acontece se a Fase 3 mostrar que ela é necessária, ou se separar milho e safrinha virar prioridade comercial.',
    itens: [
      'Os rótulos vêm das glebas SICOR e de car_validacao.',
      'A ferramenta é o WorldCereal custom via openEO, ou um Random Forest sobre séries temporais de NDVI do Sentinel-2. Comece pelo mais simples.',
      'O resultado entra como mais uma fonte em uso_solo_car. Nada no modelo de dados muda, e é por isso que ele foi desenhado assim.',
    ],
  },
  {
    fase: '6',
    titulo: 'Operação contínua',
    duracao: 'permanente',
    itens: [],
    tabela: {
      cabecalho: ['Fonte', 'Frequência', 'Como'],
      linhas: [
        ['SICOR', 'Mensal', 'GitHub Actions + script'],
        ['CAR', 'Trimestral', 'Manual, com script pronto'],
        ['MapBiomas', 'Anual (nova coleção)', 'Reprocessamento completo'],
        ['Perfil / score', 'Após cada carga', 'Recalcula car_perfil'],
      ],
    },
    rodape: 'Um monitor de "dado velho" alerta se alguma fonte passar do prazo esperado.',
  },
]

const ARQUITETURA = `[Fontes]                          [Pipeline offline - Python]              [Supabase PostGIS]         [Portal Next.js]
SICAR (shapefile/município) ──┐
MapBiomas Col.10 (GEE)      ──┼──> ingestão → limpeza → estatística ──> schema agro (tabelas) ──> views → ficha do CAR
SICOR microdados (BCB)      ──┤    zonal → cruzamento espacial →        + RPCs SECURITY DEFINER     mapa, lista de
IBGE PAM (checagem)         ──┘    score de confiança                                               prospecção, cockpit
Sentinel-2 (Fase 5)         ──────> modelo próprio (condicional)`

const SCHEMA_AGRO = `-- Imóveis
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

pipeline_execucao (id, fonte, versao, iniciado_em, concluido_em, linhas, observacao)`

export const PLANO_CAR: Secao[] = [
  {
    id: 'objetivo',
    numero: 1,
    titulo: 'Objetivo e critério de sucesso',
    blocos: [
      {
        tipo: 'p',
        texto:
          'O objetivo é gerar, para cada imóvel rural (CAR) da área de atuação, um perfil com a cultura estimada, a área, o crédito rural recente e a oportunidade de máquina, e transformar isso em uma lista de prospecção priorizada dentro do portal.',
      },
      { tipo: 'p', texto: 'O sistema funciona se cumprir três condições:' },
      {
        tipo: 'lista',
        numerada: true,
        itens: [
          'Acurácia de pelo menos 80% na cultura principal, medida contra clientes com cultura conhecida.',
          'Pelo menos 60% das glebas SICOR da região atribuídas a um CAR.',
          'Uso real: o vendedor trabalha a lista, e isso aparece em propostas abertas a partir dela.',
        ],
      },
      { tipo: 'aviso', texto: 'Se a terceira condição falhar, o resto não importa.' },
    ],
  },
  {
    id: 'escopo',
    numero: 2,
    titulo: 'Escopo',
    blocos: [
      {
        tipo: 'p',
        texto:
          'Dentro: municípios de atuação da concessionária (lista fechada na Fase 0), histórico de crédito dos últimos 3 a 5 anos e as culturas que o MapBiomas separa.',
      },
      {
        tipo: 'p',
        texto:
          'Fora, por enquanto: o estado inteiro, previsão de safra, produtividade estimada, identificação automática do dono do CAR e qualquer venda ou exposição desses dados para fora da empresa.',
      },
    ],
  },
  {
    id: 'arquitetura',
    numero: 3,
    titulo: 'Arquitetura',
    blocos: [
      { tipo: 'codigo', texto: ARQUITETURA },
      { tipo: 'p', texto: 'Estas regras de arquitetura não são negociáveis:' },
      {
        tipo: 'lista',
        itens: [
          'Nenhum processamento de raster roda no Railway ou no Next.js. A estatística zonal do MapBiomas roda no Google Earth Engine, e o resto em Python local.',
          'O pipeline grava com a service role através de um script versionado. O portal só lê views.',
          'Cada execução do pipeline gera um registro em pipeline_execucao, e todo dado derivado aponta para a execução que o criou. Assim você refaz, compara versões e desfaz.',
        ],
      },
    ],
  },
  {
    id: 'modelo-dados',
    numero: 4,
    titulo: 'Modelo de dados (schema agro)',
    blocos: [
      { tipo: 'codigo', texto: SCHEMA_AGRO },
      { tipo: 'p', texto: 'Pontos de desenho que evitam retrabalho:' },
      {
        tipo: 'lista',
        itens: [
          'dominio_cultura traduz os códigos do MapBiomas e os nomes de produto do SICOR para um vocabulário único. Sem essa tabela as fontes nunca conversam.',
          'pct_area_util é calculado sobre a área agrícola, já descontando vegetação nativa, APP e água. Se você usar a área total do CAR como base, uma fazenda de café com 40% de mata aparece como "60% café" e distorce tudo.',
          'Os vínculos com cliente e as validações só entram por RPCs SECURITY DEFINER, com RLS de leitura por papel, no padrão que o portal já usa.',
        ],
      },
    ],
  },
  {
    id: 'regras',
    numero: 5,
    titulo: 'Regras de negócio',
    blocos: [
      {
        tipo: 'p',
        texto:
          'Cultura principal: é a classe agrícola com maior área útil na safra mais recente, desde que ocupe pelo menos 30% da área útil. Abaixo disso, o CAR é classificado como "Diversificado".',
      },
      { tipo: 'p', texto: 'Confiança:' },
      {
        tipo: 'tabela',
        cabecalho: ['Nível', 'Condição'],
        linhas: [
          ['Alta', 'MapBiomas e SICOR concordam na mesma safra, ou há validação de campo'],
          ['Média', 'Só uma fonte, com cultura ocupando ≥ 60% da área útil'],
          ['Baixa', 'Só uma fonte com < 60%, fontes discordantes, ou CAR com sobreposição > 20%'],
        ],
      },
      {
        tipo: 'p',
        texto:
          'A tela mostra sempre o nível de confiança e a fonte. Um dado validado em campo sempre vence o dado estimado.',
      },
      {
        tipo: 'aviso',
        texto:
          'Milho: o MapBiomas não separa milho. Ele fica em "outras lavouras temporárias", e a safrinha some sob a soja. Até a Fase 5, milho só aparece via SICOR. Deixe isso explícito na interface e não invente milho.',
      },
      {
        tipo: 'p',
        texto:
          'Atribuição gleba→CAR: a gleba é atribuída ao CAR que contém pelo menos 50% da área dela. Se nenhum CAR passa disso, fica sem atribuição, que é melhor do que atribuir errado.',
      },
      {
        tipo: 'p',
        texto:
          'Score de oportunidade: uma soma ponderada simples e explicável, sem machine learning. Os componentes são área da cultura, crédito de investimento recente, ausência de compra na Nova (via vínculo com o Omie) e prioridade da regra. Pesos na tabela oportunidade_regra.',
      },
    ],
  },
  {
    id: 'fases',
    numero: 6,
    titulo: 'Fases',
    blocos: [{ tipo: 'fases' }],
  },
  {
    id: 'riscos',
    numero: 7,
    titulo: 'Riscos',
    blocos: [
      {
        tipo: 'tabela',
        cabecalho: ['Risco', 'Impacto', 'Mitigação'],
        linhas: [
          ['SICOR sem glebas utilizáveis', 'Perde a verdade de campo e o crédito por CAR', 'Descobrir na Fase 0; fallback para agregado por município'],
          ['CAR sujo (sobreposição, duplicata)', 'Área e cultura contadas em dobro', 'Tabela de sobreposição + confiança rebaixada'],
          ['Vínculo CAR↔cliente não acontece', 'Lista vira mapa bonito sem ação', 'Vínculo embutido no fluxo do vendedor, com meta de vínculos por semana'],
          ['Vendedor desconfia do dado', 'Abandono do módulo', 'Confiança sempre visível; lançar só com alta/média'],
          ['LGPD', 'Risco jurídico e reputacional', 'LIA, acesso restrito por papel, sem exportar dado de pessoa física para fora'],
          ['Um único mantenedor', 'Sistema morre se a pessoa sair', 'Pipeline documentado, fontes versionadas, entra no plano de continuidade'],
        ],
      },
    ],
  },
  {
    id: 'estimativa',
    numero: 8,
    titulo: 'Estimativa',
    blocos: [
      {
        tipo: 'p',
        texto:
          'A soma é de 9 a 12 semanas em meio período até a Fase 4 no ar, sem contar a Fase 5. O caminho crítico é o portão SICOR da Fase 0. O trabalho de vínculo manual da Fase 3 é o mais subestimado.',
      },
    ],
  },
  {
    id: 'primeiro-passo',
    numero: 9,
    titulo: 'Primeiro passo concreto',
    blocos: [
      {
        tipo: 'aviso',
        texto:
          'Esta semana: baixar os microdados do SICOR, filtrar um município de atuação e ver se as glebas têm geometria e produto. Esse resultado decide metade do plano.',
      },
    ],
  },
  {
    id: 'andamento',
    numero: 10,
    titulo: 'Andamento — Fase 0 (25/09/2026)',
    blocos: [
      {
        tipo: 'aviso',
        texto:
          'Portão SICOR: PASSOU nos 5 municípios da região imediata de Piraju. 1.657 glebas, 100% com polígono e precisão métrica, produto legível. Atribuição gleba→CAR entre 78% e 91% (o portão da Fase 2 pede 60%). Decisão: seguir com o SICOR.',
      },
      {
        tipo: 'tabela',
        cabecalho: ['Município', 'Glebas', 'Gleba→CAR', 'CARs com gleba', 'Culturas principais'],
        linhas: [
          ['Piraju', '418', '91%', '107 de 863', 'soja, café, sorgo, bovinos'],
          ['Fartura', '523', '81%', '152 de 1.249', 'café, bovinos, soja'],
          ['Sarutaiá', '197', '88%', '34 de 243', 'soja, milho, café'],
          ['Tejupá', '408', '91%', '96 de 611', 'café, soja, bovinos'],
          ['Timburi', '111', '78%', '28 de 220', 'café, bovinos, soja'],
        ],
      },
      {
        tipo: 'tabela',
        cabecalho: ['Fonte', 'O que se descobriu'],
        linhas: [
          ['SICOR glebas', 'Arquivo único público (2,1 GB), um ponto por linha, ligado à operação por REF_BACEN + NU_ORDEM. Não traz município: o recorte é espacial.'],
          ['SICOR operações', 'Um arquivo por ano; produto/finalidade via Empreendimento.csv. Só 33% das operações de SP em 2024 têm gleba — o SICOR cobre uma minoria dos imóveis (12–16% dos CARs em todos os municípios).'],
          ['SICAR', 'WFS oficial entrega os imóveis por código IBGE sem captcha. Piraju: 904 imóveis; 2 cancelados cobrem o município inteiro — filtrar status. 28 municípios candidatos = 20.070 imóveis.'],
          ['Sobreposição de CAR', '61% das glebas tocam mais de um CAR. A tabela car_sobreposicao é obrigatória.'],
          ['LIA (LGPD)', 'Rascunho pronto em docs/agro/lia-inteligencia-agricola-car.md; falta DPO e assinatura.'],
          ['Banco (25/09 à tarde)', 'Migration sql/agro-schema.sql APLICADA. Carga feita: 3.328 imóveis CAR (5 municípios) com 4.055 pares de sobreposição (136 quase duplicatas), 878 operações e 1.657 glebas SICOR; 1.589 glebas (96%) atribuídas a 304 CARs pelo PostGIS.'],
          ['MapBiomas sem Earth Engine', 'Coleção 10 lida do GeoTIFF público (COG) com rasterio: 15 s por safra. 2022–2024 gravados (25.235 linhas). Portão IBGE PAM: soja dentro de ±30%; café e cana ~50% abaixo onde o "mosaico de usos" domina (limitação da fonte). Mosaico nunca vira cultura principal.'],
          ['Perfil (safra 2024)', '3.186 CARs com cultura principal, confiança (alta 98 · média 851 · baixa 2.237), crédito 12/36 m rateado por gleba e score. Diversificado 1.195, pastagem 1.006, soja 475, café 274. agro_oportunidade_regra vazia: o comercial preenche produto sugerido e pesos.'],
          ['Escopo = 45 municípios da NOVA', 'Lista do filtro "Loja" do Dashboard Agro (docs/agro/municipios-nova.json). SICAR dos 45 carregado: 34.029 imóveis, 38.389 pares de sobreposição (33 geometrias inválidas corrigidas). MapBiomas e SICOR dos 45 em carga.'],
          ['Vínculo pelas visitas do CRM', 'Visita presencial com GPS dentro do CAR ativo vira SUGESTÃO de vínculo CAR↔cliente (guia "Vínculos"). Prévia: 151 de 247 visitas caem num CAR, 147 pares. Nada vira vínculo sem alguém aceitar.'],
        ],
      },
      {
        tipo: 'lista',
        itens: [
          'Fase 4 começou: guia "Mapa dos imóveis" (polígonos por cultura + visitas) e guia "Vínculos" (sugestões CAR↔cliente). Faltam: lista de prospecção por score, ficha completa do imóvel, validação de cultura no cockpit, regras de oportunidade preenchidas pelo comercial, LIA assinada.',
          'Relatório completo: docs/agro/fase0-levantamento.md. Scripts em scripts/agro/: sicor_portao_fase0.py, sicar_wfs_baixar.py, carregar_sicar.py, carregar_sicor.py, mapbiomas_zonal.py, calcular_perfil.py.',
        ],
      },
    ],
  },
]
