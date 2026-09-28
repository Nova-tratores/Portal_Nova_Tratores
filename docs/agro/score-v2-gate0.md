# Score v2 — Gate 0 (reconhecimento, somente leitura)

> Executado em 28/09/2026 contra o banco de produção, sem alterar nada.
> Responde aos 7 itens do prompt-file "Score v2 e correções de base (1.1 a 1.6)" e lista as dúvidas que travam o Gate 1.

## 1. Inventário: nomes reais

Todas as tabelas estão no schema `public`, com **RLS ligado e nenhuma policy**. O navegador não lê nem escreve: todo acesso passa por rotas `/api/agro/*` do Next.js, que autenticam o usuário pelo token, checam o módulo `dashboard-agro` e usam a service role. **Não existem funções helper de RLS neste módulo** (ver dúvida D1).

| Conceito | Nome real | Colunas relevantes | Onde é usado |
|---|---|---|---|
| Imóvel | `agro_car_imovel` | `cod_car` PK, `municipio_ibge`, `municipio`, `area_ha`, `area_util_ha`, `modulos_fiscais`, `status_car` (AT/PE/CA/SU), `condicao`, `tipo_imovel`, `criado_sicar_em`, `geom` MultiPolygon 4674, `execucao_id` | todas as rotas |
| Perfil do imóvel (materializado) | `agro_car_perfil` | `cod_car` PK, `ano_safra`, `cultura_principal` (NULL = diversificado), `area_cultura_ha`, `pct_area_util`, `confianca`, `motivo_confianca` **texto**, `fonte_principal`, `credito_12m`, `credito_36m`, `credito_invest_36m`, `ultima_finalidade`, `ultimo_credito_em`, `score_oportunidade`, `score_detalhe` jsonb, `execucao_id` | view abaixo |
| View de leitura | `agro_v_car_perfil` | imóvel + perfil + `cultura_nome`, `cultura_grupo`, `vinculos` (contagem), `sobreposicao_pct` (máximo), `centroide` | `GET /api/agro/prospeccao` → `ProspeccaoCar.tsx`; `GET /api/agro/imovel/[cod]` → `FichaImovel.tsx`; cockpit |
| Uso do solo por safra | `agro_uso_solo_car` | PK (`cod_car`, `ano_safra`, `fonte`, `cultura_codigo`), `area_ha`, `pct_area_util` | ficha |
| Vocabulário de culturas | `agro_dominio_cultura` | `codigo` PK, `nome`, `grupo`, `mapbiomas_classes` int[], `sicor_produtos` text[] | filtros, ficha, regras |
| Operação de crédito | `agro_sicor_operacao` | PK (`ref_bacen`, `nu_ordem`), `dt_emissao`, `finalidade`, `produto`, `cultura_codigo`, `valor`, `area_financiada` | ficha |
| Gleba | `agro_sicor_gleba` | `id` PK, `ref_bacen`, `nu_ordem`, `area_ha`, `geom`, `municipio_ibge` | ficha |
| Gleba → imóvel | `agro_sicor_gleba_car` | PK (`gleba_id`, `cod_car`), `pct_gleba_no_car`, `metodo` | ficha, perfil |
| Sobreposição | `agro_car_sobreposicao` | PK (`cod_car_a`, `cod_car_b`) com `a < b`, `area_sobreposta_ha`, `pct_a`, `pct_b` | ficha; perfil (rebaixa confiança) |
| Regras de oportunidade | `agro_oportunidade_regra` | `cultura_codigo`, `faixa_area_min/max`, `produto_sugerido`, `argumento`, `prioridade`, `peso_area`, `peso_credito`, `peso_sem_compra`, `ativo` | `/api/agro/regras` → `RegrasOportunidade.tsx` |
| Vínculo | `agro_car_cliente_vinculo` | **PK (`cod_car`, `cliente_omie_id`)**, `cliente_nome`, `origem` (manual/sugerido/importado), `confirmado_por`, `confirmado_em` | ficha, cockpit |
| Sugestão de vínculo | `agro_car_vinculo_sugestao` | PK (`cod_car`, `cliente_ref`), `cliente_omie_id`, `n_presenciais`, `visita_ids`, `score`, `motivo`, `status` | `/api/agro/vinculos/sugestoes` → `VinculosSugeridos.tsx` |
| Validação de campo | `agro_car_validacao` | `cod_car`, `ano_safra`, `cultura_real`, `confirmou`, `informado_por` | ficha |
| Execuções | `agro_pipeline_execucao` | `id`, `fonte` (sicar/mapbiomas/sicor/ibge_pam/sentinel/perfil/crm), `versao`, `linhas`, `parametros` jsonb | scripts |

**RPCs existentes** (todas `SECURITY DEFINER`, `search_path` fixo, `EXECUTE` revogado de anon/authenticated):
`agro_atribuir_glebas`, `agro_calcular_sobreposicoes`, `agro_corrigir_geometrias`, `agro_recalcular_area_util`, `agro_vincular_cliente`, `agro_validar_cultura`, `agro_sugerir_vinculos_por_visita`, `agro_decidir_sugestao`, `agro_mapa_municipios`, `agro_mapa_municipio`.

**Cálculo de confiança e de score: NÃO é RPC.** É o script Python `scripts/agro/calcular_perfil.py`, que roda no computador do responsável técnico, lê as tabelas pela REST e grava `agro_car_perfil`. Os limites (30%, 60%, 20%, fatores 1/0,85/0,6, teto de área 3) estão **fixos no script**. Só os três pesos e a prioridade vêm de `agro_oportunidade_regra`.

## 2. Como a sobreposição classifica "praticamente duplicata"

**Não classifica.** A tabela guarda só os percentuais. O número 1.286 que aparece na documentação veio de uma consulta minha, com o critério **"um dos lados ≥ 99%"**:

| Critério | Pares |
|---|---|
| Um lado ≥ 99% (o que gerou "1.286") | **1.286** |
| **Mútuo**: os dois lados ≥ 99% | **73** |
| Mútuo ≥ 95% | 349 |
| Mútuo ≥ 90% | 529 |
| Total de pares com sobreposição | 38.389 |

O critério de um lado só pega principalmente **imóvel pequeno inteiro dentro de um grande** (um sítio de 5 ha dentro de uma fazenda de 500 ha dá 100% de um lado e 1% do outro). Isso não é duplicata, é outro problema. Ver dúvida D2.

A sobreposição hoje só é calculada entre imóveis ativos **do mesmo município**.

## 3. Como a confiança registra o motivo

**Só texto livre**, montado por concatenação. Os motivos são distinguíveis por padrão de texto, e a classificação abaixo cobriu 100% dos 31.655 perfis, mas não há código:

| Confiança | Motivo (derivado do texto) | Imóveis |
|---|---|---|
| média | fonte única ≥ 60% | 10.539 |
| baixa | diversificado | 6.820 |
| baixa | fonte única < 60% | 5.263 |
| baixa | fonte única ≥ 60% **+ sobreposição alta** | 2.179 |
| baixa | diversificado + sobreposição alta | 1.932 |
| baixa | fonte única < 60% + sobreposição alta | 1.222 |
| média | café/cana só por satélite | 1.158 |
| alta | fontes concordam | 1.115 |
| baixa | fontes discordam | 653 |
| média | cultura veio só do crédito (satélite diversificado) | 389 |
| baixa | café/cana satélite + sobreposição alta | 165 |
| alta | fontes concordam + sobreposição alta | 118 |
| baixa | fontes discordam + sobreposição alta | 62 |
| baixa | cultura só do crédito + sobreposição alta | 40 |

Observações:
- **Um imóvel pode ter dois motivos ao mesmo tempo** (o motivo principal mais a sobreposição). Um código único por imóvel não basta. Ver dúvida D3.
- Existe um motivo que **não está na lista do prompt**: "cultura veio só do crédito, satélite diversificado" (429 imóveis). Ver dúvida D3.
- **Sobreposição alta é o que mais rebaixa**: 5.598 imóveis caíram para baixa só por ela. Parte disso deve sumir quando as duplicatas forem agrupadas.
- Os 8.752 diversificados estão **todos** em confiança baixa.

## 4. O crédito por imóvel guarda o id da operação?

**Sim, de forma derivável.** O caminho é `agro_sicor_gleba_car.cod_car` → `gleba_id` → `agro_sicor_gleba (ref_bacen, nu_ordem)` → `agro_sicor_operacao`. O id da operação é o par (`ref_bacen`, `nu_ordem`).

O que `agro_car_perfil` guarda são só as **somas** já rateadas. O rateio é por área das glebas da operação que caem no imóvel. Para consolidar um grupo sem dupla contagem basta somar a fração das glebas distintas do grupo por operação, o que é possível com os dados atuais.

## 5. Dados de base instalada

| Fonte | Cliente | Chassi | Data | Serve? |
|---|---|---|---|---|
| `tratores` (controle de revisões) | **nome em texto** (`Cliente`) | `Chassis` | `Entrega` (texto, dd/mm/aaaa, desde 2019) | Única com chassi e data de venda. Ligação só por nome. |
| `vendas_itens` (gestão de vendas) | **código Omie** (`codigo_cliente` + `conta_omie`) | não tem | `data_pedido` | Liga por código, distingue trator de implemento pela `familia`. Histórico só de ~2024 em diante. |
| `pedidos_venda_relatorio` | nome em texto | não (às vezes no nome do projeto) | `data_emissao` | Implementos por `itens_enriquecidos[].familia`. Ligação por nome. |
| `portal_nt_projetos_chassis` | código Omie | sim | **não tem data de venda** | É o **último cliente que levou o chassi à oficina**, não o comprador. |
| `Formulario` (propostas) | nome + CPF/CNPJ | não | `status_desde` | Venda = status `Concluida-Vendido`. Sem chassi. |

**Qualidade medida em `tratores`** (306 linhas): cliente preenchido em 301, chassi em 304, entrega em 299. O nome do cliente casa com o cadastro (`portal_nt_clientes_PRINCIPAL`, 6.304 clientes) por **igualdade de nome normalizado em 180 casos, 58%**. O próprio código do portal registra, em comentários, que essa tabela tem nome divergente e chassi errado.

**Implementos vendidos por cliente existem**, em `vendas_itens` (por código) e em `pedidos_venda_relatorio` (por nome), com a família do produto dizendo o que é trator e o que é implemento (função `categoriaMaquina` do módulo de gestão de vendas). Cobrem só de ~2024 para cá.

Não existe tabela que ligue **chassi vendido → cliente por código**. Ver dúvida D5.

## 6. Onde ficam as peças de UI

| Peça | Arquivo | Detalhe |
|---|---|---|
| Filtro padrão da Prospecção | `src/components/dashboard-agro/ProspeccaoCar.tsx`, constante `FILTROS_PADRAO` | `confianca: 'alta,media'`. Salvo no navegador em `localStorage['agro-prospeccao-filtros']`. O filtro é aplicado no servidor em `src/app/api/agro/prospeccao/route.ts` (`.in('confianca', …)`). |
| "Como o score foi calculado" | `FichaImovel.tsx`, bloco `<details>`; texto gerado por `explicarScore()` em `src/lib/agro/prospeccao.ts` | Lê `score_detalhe` (jsonb) do perfil. |
| Aceitar sugestão de vínculo | `VinculosSugeridos.tsx` (`decidir`) e `FichaImovel.tsx` (bloco "Sugestão") | `POST /api/agro/vinculos/sugestoes` → RPC `agro_decidir_sugestao` → `agro_vincular_cliente`. |
| Vincular manualmente | `FichaImovel.tsx` | `POST /api/agro/imovel/[cod]` com `acao: 'vincular'`. |
| Mapa | `MapaCar.tsx` | `GET /api/agro/mapa` → RPC `agro_mapa_municipio`. |
| Exportação | `gerarCSVProspeccao()` em `src/lib/agro/prospeccao.ts` | Teto de 5.000 linhas na rota. |
| Bloco do cockpit | `src/lib/feedbacks/atendimento/contexto.ts` (fonte `car`) e `Cockpit.tsx` | Liga por `cliente_omie_id IN codigos_omie`. |

## 7. Contagens atuais (linha de base para comparar depois)

| | |
|---|---|
| Imóveis (CARs) carregados | 34.029 |
| Ativos | 31.655 |
| Ativos com perfil | 31.655 |
| Confiança | alta 1.233 · média 12.086 · baixa 18.336 |
| Cultura principal | soja 10.678 · diversificado 8.752 · pastagem 7.390 · silvicultura 1.986 · cana 1.687 · café 526 · outras temporárias 300 · citros 199 |
| Vínculos | **1** (uma sugestão foi aceita depois do descritivo; o prompt diz 0) |
| Sugestões | 138 pendentes · 1 aceita · 0 rejeitadas |
| Regras de oportunidade | 0 |
| Validações de campo | 0 |
| Execuções | 14, das quais 6 ficaram sem fechamento (cargas interrompidas por queda de rede em 25/09) |

---

## Dúvidas que travam o Gate 1

**D1 — Padrão de segurança.** O prompt pede "RLS com as funções helper já usadas no módulo". Este módulo não tem helpers de RLS: usa RLS ligado sem policy e acesso só pelas rotas de API com service role. Proponho **manter esse padrão** (é o mesmo do módulo de Marketing do portal) e ler "todo acesso passa por RPC com checagem de permissão" como "toda rota checa a permissão do módulo". Confirma?

**D2 — Critério de duplicata.** O "1.286" é de um lado só e mistura duplicata com imóvel contido em outro. Pelo critério mútuo são 73 (≥ 99%), 349 (≥ 95%) ou 529 (≥ 90%) pares. Qual limiar mútuo usar como padrão? Minha sugestão é **95% mútuo, parametrizável**. E o imóvel pequeno inteiro dentro de um grande fica **fora** do agrupamento, certo? Ele continua rebaixando a confiança do pequeno por sobreposição, o que pune exatamente o sítio pequeno. Se quiser tratar isso, precisa de regra própria.

**D3 — Motivo como código.** Um imóvel tem hoje até dois motivos (principal + sobreposição). Proponho **motivo principal (código) + lista de rebaixadores (array de códigos)**. E falta um código para o caso "cultura veio só do crédito rural, satélite diversificado": sugiro `fonte_unica_sicor`. O filtro padrão do Gate 3 ("baixa cujo único motivo seja diversificado ou fonte única abaixo de 60") passaria a significar "sem rebaixador".

**D4 — Onde roda o recálculo.** Hoje confiança e score são calculados num **script Python fora do banco**. O prompt pede RPC e que mudar um parâmetro dispare o recálculo. Dá para portar para SQL, mas há uma restrição real: RPC pesada chamada pela API **estoura o limite de tempo de instrução** do Supabase (aconteceu com a atribuição de glebas e com a área útil, que tiveram de rodar no SQL Editor). Opções: (a) RPC em SQL processando **um município por chamada**, com a rota orquestrando os 45; (b) recálculo em Node na rota, em lotes. Prefiro (a). Confirma?

**D5 — Idade do trator na Base instalada.** A única fonte com data de venda e chassi liga o cliente **por nome**, e só 58% casam. A fonte que liga por código não tem chassi e só cobre de 2024 em diante. Proponho usar `tratores` por nome normalizado, **marcando a parcela como "ligação por nome"** na ficha, e tratar como ausente quando não casar. "Sem implemento comprado" sairia de `vendas_itens` por código, com o aviso de que o histórico começa em 2024. Aceita essa qualidade de dado ou prefere deixar as duas parcelas de fora nesta rodada?

**D6 — Aplicação das migrations.** O banco de produção não está acessível pelo conector desta sessão. Até aqui o fluxo foi: eu escrevo a migration, você aplica no SQL Editor, eu confiro pela API. Os gates seguem assim?

**D7 — Vínculo existente.** Já há 1 vínculo aceito. Ele migra como `proprietario`, conforme o prompt, ou você quer revisar o tipo dele?

**D8 — Agrupamento entre municípios.** A sobreposição só foi calculada dentro do mesmo município. Duplicatas entre municípios vizinhos (imóvel cadastrado duas vezes, uma em cada) não seriam detectadas. Recalcular entre municípios custa mais processamento. Entra neste gate ou fica de fora?
