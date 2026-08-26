# Projeção de Lucro de Revisões — Discussão e Modelo

> Documento de **entendimento/conceito** (ainda não é plano de implementação).
> Captura a discussão sobre transformar a planilha manual de "kits de revisão" numa
> ferramenta de **projeção de faturamento e lucro de pós-venda** por máquina vendida.
> Status: só entender/pensar. Nada a construir ainda.

## Contexto — de onde veio

O usuário compartilhou dois prints de uma planilha Excel:

- **Print 1 — planilha de margem dos kits de revisão.** Matriz **modelo de trator**
  (2025, 6075, 9500, 86-110…) × **marcos de horas** (50, 300, 600, 900, 1200, 1500,
  1800, 2100, 2400, 2700, 3000). Para cada revisão de cada modelo:
  - **Custo** = Σ (qtd × custo) das peças do kit
  - **Venda** = Σ (qtd × preço de venda) das peças
  - **Diferença / Margem** = Venda − Custo
  - **Mão de Obra** = valor de serviço por revisão (400, 600, 1000…)
  - **Sub Total** = Venda + Mão de Obra; à direita **Total/ano**, **Margem**, **Valor Ano**
  - `#N/A` / `#DIV/0!` = furos de fórmula (peça ou preço faltando).
- **Print 2 — equivalência das revisões.** As revisões **ciclam**: só as 5 primeiras
  (50/300/600/900/1200) são kits únicos; da 6ª em diante repetem —
  **1500≈300, 1800≈600, 2100≈900, 2400≈1200, 2700≈300, 3000≈600**.

Tabela de referência citada (Supabase): "produtos de revisões" (editor 89298), que no
código corresponde à tabela `revisoes`.

## Objetivo de negócio

A planilha **não é uma tabela de preços** — é uma ferramenta de **projeção de pós-venda**:
saber **quanto de lucro um trator pode gerar em revisões ao longo da vida**, para
**projetar o faturamento/lucro de revisões das novas máquinas vendidas**.

Lógica-base da projeção:

> **lucro de revisão por modelo × nº de máquinas daquele modelo vendidas = lucro de revisão projetado**

O número da planilha é o **potencial máximo (100% de adesão)**; a projeção realista aplica
uma **taxa de conversão** por revisão (tende a cair conforme as horas sobem: cliente some,
faz fora, atrasa).

## O que já existe no portal (não é greenfield)

- **Tabela `revisoes`** = os kits: `Trator`, `Cod_Trator`, `Horas`, `tipo`
  (revisao/manutencao/quadriciclo) e `Cod_Prod_1..15` / `Qtd1..15` (peças desnormalizadas).
- Cadastro/edição de kits: `src/components/ppv/ModalRevisoes.tsx`
- Importação de kit → orçamento: `src/components/orcamentos/ModalImportarKit.tsx`
- API CRUD dos kits: `src/app/api/ppv/revisoes/gerenciar/route.ts`
- Resolução de kit por trator+horas: `src/app/api/ppv/revisoes/route.ts`
- **Acompanhamento das máquinas vendidas**: `src/app/(portal)/revisoes/page.tsx`,
  tipo `Trator` (`src/lib/revisoes/types.ts`) com `Entrega`/`Modelo` + marcos de horas.
- **Previsão de próxima revisão**: `calcularPrevisao()` em `src/lib/revisoes/utils.ts`
  (estima data/horas da próxima revisão e flag `atrasada`).
- **Distância/deslocamento**: já há cálculo (`ORS_API_KEY` / Rotaexata) e os orçamentos
  já têm campo `deslocamento` e `mao_obra: {valorHora, horas}`.

### Fonte de dados de custo e venda das peças
- **Preço de venda**: `Produtos_Completos.Preco_Venda` (lido hoje nos fluxos de kit).
- **Custo (CMC)**: a tabela `Produtos_Completos` **já tem a coluna `CMC`** — só **não é
  lida** nos fluxos de revisão. Incluir no `select` é baixo esforço.
  - Decisão do usuário: **usar a coluna `CMC` de `Produtos_Completos`** como fonte de custo.
  - Alternativa mais confiável (não escolhida agora): Omie ao vivo via `PosicaoEstoque`,
    padrão de `src/app/api/estoque/produto-detalhe/route.ts` (custo por empresa NOVA/CASTRO).

### O que NÃO existe ainda
- A **regra de equivalência/ciclo do Print 2** (horas → kit) está documentada em
  `docs/tratorilson-whatsapp.md` mas **não tem código**. Hoje o usuário escolhe
  modelo+horas na mão.
- Fallbacks documentados: modelo `7095` → usa revisão do `9500`; modelo sem kit → genérico `2025`.

## Modelo de lucro refinado (regras trazidas pelo usuário)

A planilha é uma simplificação. Cada revisão tem **3 linhas de receita** e **3 de custo**:

| Linha | Receita | Custo |
|---|---|---|
| **Peças** | venda das peças | CMC das peças |
| **Mão de obra** | horas × **valor de venda da hora** — *exceto 50h e 900h (cortesia/garantia → receita 0)* | horas × **custo da hora do mecânico** |
| **Deslocamento** | sempre cobrado (km ida+volta × tarifa) | combustível + hora do técnico no trajeto |

**Lucro da revisão = margem peças + margem mão de obra + margem deslocamento − descontos/vouchers.**

### Regras específicas
1. **50h e 900h: cliente NÃO paga a hora trabalhada** (cortesia/garantia). A empresa
   ainda **paga o mecânico** → nessas revisões a mão de obra é **custo puro** (prejuízo de
   mão de obra); o lucro vem só das peças e do deslocamento. Precisa ser marcado, senão a
   projeção fica otimista demais.
2. **Deslocamento é cobrado em TODA revisão** e é **variável por cliente** (às vezes
   centenas de km ida e volta), não por modelo. Logo a projeção "por máquina" precisa da
   **localização de cada máquina vendida**, não só do modelo.
3. **Hora do mecânico tem dois valores**: **custo da hora** (o que a empresa paga) e
   **valor bruto de venda da hora** (o que cobra do cliente). A diferença só é lucro real
   se a hora estiver **ocupada**.

### Ócio / ociosidade (camada separada)
Não é "por revisão" — é **capacidade da oficina**. Mecânico pago por 8h/dia mas faturando
5h → 3h de ócio = perda fixa. Dois olhares a separar:
- **Lucro por máquina/revisão** (o da planilha).
- **Produtividade da oficina**: quanto da hora paga vira hora faturada. O ócio come a
  margem agregada mesmo quando cada revisão isolada "dá lucro".
- Projeção deve pensar em **capacidade**: nº de mecânicos × horas/dia vs. horas de revisão
  que a carteira de máquinas gera. Se a demanda projetada > capacidade, o limite é a oficina.

## Voucher / cupom de revisão na venda (módulo novo)

Ideia: no ato da **venda do trator**, o **vendedor emite cupom(ns) de desconto** de revisão.
Não existe no portal. Precisaria, no mínimo:
- **Entidade voucher**: código, tipo (% ou R$), o que cobre (peças / mão de obra /
  deslocamento / revisão inteira), quais revisões (ex.: só a 1ª, ou 50h+300h), validade
  (data/horas), vínculo ao **chassi + cliente + venda/vendedor**.
- **Resgate**: consumir o voucher no orçamento/OS da revisão (o módulo de orçamentos já
  tem `itens` + `mao_obra` + `deslocamento` — ponto natural de aplicação).
- **Efeito na projeção**: reduz a **receita** esperada, mas tende a **aumentar a adesão**
  (cliente volta porque já tem desconto). Entra como alavanca de cenário: sem voucher
  (conversão X, margem cheia) vs. com voucher (mais conversão, margem menor).

## Arquitetura em camadas (visão do sistema completo)

1. **Custo/venda por kit** — peças via `CMC` + `Preco_Venda`; base pronta em `revisoes`.
2. **Parâmetros de serviço** — valor-venda e custo da hora do mecânico, tarifa de
   deslocamento por km, regra "50h/900h sem mão de obra".
3. **Projeção por máquina vendida** — modelo → sequência de revisões (equivalência do
   Print 2) → receita/lucro, distribuído no tempo via `calcularPrevisao`, ajustado por
   distância do cliente e taxa de conversão.
4. **Capacidade / ócio** — horas de revisão projetadas vs. capacidade da oficina.
5. **Vouchers** — emissão na venda + resgate + simulação de cenário.

## Perguntas em aberto (dirigem o escopo da v1)

- **(a) Parâmetros de hora e deslocamento**: valores de custo e venda da hora do mecânico
  e tarifa de deslocamento por km — de onde saem? Parâmetro fixo, por empresa, ou já
  existem em algum lugar do portal?
- **(b) Taxa de conversão por revisão**: chute inicial, ou há histórico real (OS faturadas
  por máquina) para calibrar?
- **(c) Voucher**: prioridade da v1 ou fica para depois da projeção básica funcionar?
- **(d) Alvo da v1**: (a) só a tela que reproduz a planilha (lucro potencial por modelo),
  ou (b) a projeção completa cruzando com máquinas vendidas + tempo?

## Arquivos-chave (referência)

- `src/app/api/ppv/revisoes/gerenciar/route.ts` — CRUD dos kits (tabela `revisoes`)
- `src/app/api/ppv/revisoes/route.ts` — resolve kit por trator+horas (hoje só `Preco_Venda`)
- `src/app/api/ppv/produtos/route.ts` — busca produto (hoje só `Preco_Venda`, `CMC` disponível)
- `src/components/ppv/ModalRevisoes.tsx` — editor de kits
- `src/components/orcamentos/ModalImportarKit.tsx` — importa kit → orçamento
- `src/lib/revisoes/types.ts` / `utils.ts` — marcos de horas + `calcularPrevisao`
- `src/app/(portal)/revisoes/page.tsx` — acompanhamento das máquinas vendidas
- `src/app/api/estoque/produto-detalhe/route.ts` — padrão de custo (CMC) + venda por código
- `docs/tratorilson-whatsapp.md` — regras documentadas de horas→kit / equivalência / fallbacks
