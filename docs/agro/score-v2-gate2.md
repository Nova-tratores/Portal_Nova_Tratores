# Score v2 · Gate 2 — duas listas (Conquista × Base instalada)

Estado em 28/09/2026: **concluído, aguardando "ok gate 2"**. Migration aplicada, execução #17 publicada sobre o perfil #16. A tela continua no score v1.

Gates anteriores: [gate 0](score-v2-gate0.md) e [gate 1](score-v2-gate1.md).

## 1. O que foi entregue

| Peça | Arquivo |
|---|---|
| Migration (idempotente, com pré e pós-checagem) | `sql/agro-score-v2-gate2.sql` |
| Cálculo e relatório | `scripts/agro/recalcular_score_v2.py` |

Objetos criados no banco: 12 parâmetros, tabelas `agro_score_item` e `agro_cliente_maquina`, funções `agro_score_iniciar`, `agro_score_municipio`, `agro_score_publicar`, `agro_calcular_cliente_maquina`, e as visões `agro_v_score_item`, `agro_v_calibracao_area` e `agro_v_comparacao_v1_v2`.

O score v1 (`agro_car_perfil.score_oportunidade`) não foi alterado. O parâmetro `score_versao_padrao` vale 1.

## 2. Interpretações do texto

| Ponto | O que foi feito |
|---|---|
| Direção da prioridade | No banco, 1 é a mais importante. Então 1 vale 2,0 e 5 vale 0,4. Sem regra vale 1. |
| Faixa de área da regra comercial | Igual ao v1: usa a área da cultura, não a área útil. |
| Cliente duplicado no cadastro | Cada cliente aparece nas contas NOVA e CASTRO com o mesmo CPF ou CNPJ. A identidade do cliente é o documento. |
| Município do trator | Igualdade exata, como na decisão 5. Aceitar o município no começo do texto é o parâmetro `trator_cidade_por_prefixo`, desligado. |
| Idade do trator | Duas fontes: vendas por código (desde 2022) e controle de revisões por nome (desde 2019). Vale a data mais recente. A ficha avisa quando a origem é o nome. |
| Famílias de implemento | Lista em parâmetro, mais ampla que a função `categoriaMaquina` do portal. |
| Parcela sem dado | Sai da soma e o score é renormalizado. A coluna `ausentes` diz qual faltou. |

Ligação trator × cliente medida no controle de revisões (306 tratores):

| Critério | Tratores ligados |
|---|---|
| Decisão 5 ao pé da letra, cliente identificado pelo código | 2 |
| Decisão 5 com cliente identificado pelo documento (adotado) | 107 |
| Idem, aceitando o município no começo do texto | 113 |

## 3. Relatório (execução #17)

### Distribuição do score de Conquista

31.316 itens. A lista de Base instalada tem 0 itens, porque não há vínculo decidido.

| Medida | Score |
|---|---|
| Mínimo | 1,13 |
| Percentil 10 | 2,25 |
| Percentil 25 | 2,27 |
| Mediana | 4,17 |
| Percentil 75 | 5,61 |
| Percentil 90 | 6,41 |
| Percentil 99 | 7,50 |
| Máximo | 8,75 |

| Faixa | Itens |
|---|---|
| 0 a 2 | 1.339 |
| 2 a 4 | 13.460 |
| 4 a 6 | 9.680 |
| 6 a 8 | 6.590 |
| 8 a 10 | 247 |

O máximo é 8,75 porque não há regra comercial cadastrada: a parcela de prioridade vale 1 de 2 pontos para todos.

### Bônus de crédito

| Situação | Itens |
|---|---|
| Sem crédito localizável no SICOR | 27.268 |
| Com crédito, sem bônus | 3.716 |
| Bônus de 1,0 (investimento em 36 meses) | 332 |
| Bônus de 0,5 (custeio em 12 meses) | 0 |

Ordenar por score mais bônus troca 33 dos 500 primeiros.

### Comparação dos 500 primeiros, v1 × v2

Só 54 itens estão nas duas listas.

| Faixa de área útil | v1 | v2 |
|---|---|---|
| 5 a 20 ha | 1 | 18 |
| 20 a 100 ha | 37 | 357 |
| 100 a 300 ha | 40 | 116 |
| 300 a 1.000 ha | 350 | 9 |
| Acima de 1.000 ha | 72 | 0 |

| Cultura | v1 | v2 |
|---|---|---|
| Soja | 227 | 240 |
| Pastagem | 39 | 147 |
| Cana | 95 | 77 |
| Silvicultura | 98 | 0 |
| Citros | 38 | 14 |
| Café | 3 | 22 |

| Confiança | v1 | v2 |
|---|---|---|
| Alta | 124 | 500 |
| Média | 364 | 0 |
| Baixa | 12 | 0 |

### Os 20 primeiros da Conquista

Todos têm score 8,75, confiança alta, e parcelas de 4,00 (área), 2,00 (cultura) e 1,00 (prioridade).

| # | Município | Área útil | Cultura | Bônus |
|---|---|---|---|---|
| 1 | Águas de Santa Bárbara | 171,8 ha | citros | 0 |
| 2 | Águas de Santa Bárbara | 97,9 ha | citros | 1,0 |
| 3 | Águas de Santa Bárbara | 254,0 ha | citros | 0 |
| 4 | Águas de Santa Bárbara | 70,8 ha | pastagem | 0 |
| 5 | Alvinlândia | 213,9 ha | café | 0 |
| 6 | Angatuba | 39,9 ha | pastagem | 0 |
| 7 | Angatuba | 41,3 ha | pastagem | 1,0 |
| 8 | Angatuba | 99,6 ha | pastagem | 0 |
| 9 | Angatuba | 27,6 ha | pastagem | 1,0 |
| 10 | Angatuba | 112,8 ha | pastagem | 1,0 |
| 11 | Angatuba | 30,8 ha | pastagem | 0 |
| 12 | Angatuba | 37,1 ha | pastagem | 0 |
| 13 | Angatuba | 159,6 ha | pastagem | 0 |
| 14 | Avaré | 43,9 ha | citros | 0 |
| 15 | Avaré | 47,0 ha | citros | 0 |
| 16 | Barão de Antonina | 132,6 ha | pastagem | 0 |
| 17 | Barão de Antonina | 29,7 ha | pastagem | 0 |
| 18 | Barão de Antonina | 29,9 ha | pastagem | 0 |
| 19 | Barão de Antonina | 30,6 ha | pastagem | 0 |
| 20 | Barão de Antonina | 26,4 ha | pastagem | 0 |

Os códigos dos imóveis saem de `python scripts/agro/recalcular_score_v2.py --so-relatorio 17`.

### Calibração da curva

A visão devolve 0 imóveis e percentis nulos. É o esperado sem vínculos.

## 4. Achados que pedem decisão

1. **Janela do crédito.** A última operação do SICOR carregada é de 30/12/2024. As janelas de 12 e 36 meses contam a partir de hoje, então o bônus de custeio nunca é dado e o de investimento só enxerga 16 meses. Proposta: contar a janela a partir da data do dado mais recente, em parâmetro.
2. **Empate no topo.** 164 itens têm score 8,75. A ordem entre eles hoje é o código do imóvel, o que favorece municípios no começo do alfabeto. Proposta para o Gate 3: desempate pelo bônus de crédito e depois pela área útil.
3. **Score em poucos degraus.** Sem regras comerciais, 25% dos itens ficam entre 2,25 e 2,27. O cadastro de regras é o que separa os itens.
4. **Confiança pesa muito.** Os 500 primeiros são todos de confiança alta. Um imóvel de confiança média chega no máximo a 7,44.

## 5. Verificação

| Verificação | Resultado |
|---|---|
| Sintaxe SQL e PL/pgSQL | 34 comandos e 5 funções sem erro |
| Migration aplicada | conferida pela API: 21 parâmetros, tabelas e visões presentes |
| Curva de área | 3 ha = 0; 12,5 ha = 0,5; 100 ha = 1; 650 ha = 0,625; 5.000 ha = 0,25 |
| Data inválida (31/02/2019) | devolve nulo |
| Chave anônima | tabela devolve vazio; função devolve permissão negada |
| Cálculo | 45 de 45 municípios pela API, cerca de 1 segundo cada |
| Conferência com cálculo independente em Python | 31.316 itens; diferença máxima de 0,01, de arredondamento |
| Score v1 | 31.655 linhas, intocado |
| Base instalada com dado real | **não verificada**: não há vínculo |

## 6. Pendência registrada

A venda de trator precisa gravar o código do cliente. Enquanto isso não acontece, tratores vendidos antes de 2022 só ligam ao cliente por nome.
