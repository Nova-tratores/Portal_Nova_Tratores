## BRIEFING (para colar no Claude)

> Sou do Portal Nova Tratores (concessionária Mahindra; Next.js 16 App Router + TypeScript, Supabase,
> dados vindos da Omie, gráficos em **recharts 2**). Quero sua ajuda para **estruturar um prompt de
> implementação** para o Claude Code evoluir nossa tela `/estoque/dashboard` ("Dashboard de Vendas"),
> recuperando funções de uma tela antiga e propondo novas visualizações. Abaixo, o estado atual e o antigo.

### 1. Tela antiga (desativada na prática)
- Vivia num app separado (Express monolítico, `omie-consulta-estoque`, rota `/dashboard`, "Análise de Pós-Vendas"),
  mesmo banco Supabase. Em 17/06/2026 o módulo foi portado para o portal em TypeScript e o **painel de histórico
  não veio junto** — não houve decisão de remover, foi efeito colateral da reescrita.
- **Painel "Histórico desde Jan/2023"** (abria a partir de cada card de categoria):
  - Grade com **uma linha por ano** (mais recente em cima, cor por ano): 12 barras mensais com valor e nº de pedidos
    + 13ª coluna com **total anual e ticket médio**.
  - **Trimestre**: célula sob cada bloco de 3 meses com total do trimestre e variação %.
  - **Alternar comparação**: "vs Mês Ant." (mês×mês anterior, trimestre×trimestre anterior) ou
    "vs Ano Ant." (mesmo mês/trimestre do ano anterior).
  - **Menu Comparar** (séries sobrepostas na mesma grade, trimestres e totais empilhando N valores):
    Empresas (NOVA × CASTRO) · Categorias · Venda × CMC × Margem (sub-toggle Todos/Venda/CMC/Margem).
  - **Projeção do mês corrente** e previsão do próximo mês (barras esmaecidas); comparações proporcionais
    aos **dias úteis** decorridos.
  - Clique no mês → itens vendidos (busca, ordenação, CSV). Toggle Valor/Custo/Margem. Filtro de categoria.
- Cards: categorias de peças dinâmicas, Peças Diversas, Serviços, Total Peças, Total Geral.

### 2. Tela atual (`/estoque/dashboard`)
- **Filtros**: Período = mês (Jan..Dez) ou "Ano inteiro"; Ano (2023→atual); Conta Todas/NOVA/CASTRO
  (abre sempre em Todas); Categoria de peças; Métrica Venda/Custo/Margem. **Não há trimestre, intervalo
  customizado nem YTD como período.**
- **Duas visões** (`?v=`): **Peças + Serviços** e **Máquinas**.
- **KPIs Peças+Serviços**: Peças+Serviços (Δ mês ant. e ano ant., sparkline 12 m, selo "queda acentuada" < −50%);
  Total Peças (histórico / vendas / por categoria); Serviços (só OS com NFS-e; decomposição HR/KM/Outros e
  internos não somados); Entradas de Peças (+ razão compra/venda vs mediana 12 m, selo "acima do histórico" > 1,5×).
- **Comparações**: mês → vs mês anterior e vs mesmo mês do ano anterior; ano → só vs ano anterior.
  Mês corrente compara **period-to-date** (dia 1..hoje) em peças/compras; serviços não recortam (Δ "—").
  Δ cinza quando a base é pequena.
- **Gráfico 12 meses** (Peças Oficina / Peças Balcão / Serviços): Empilhado (com média), Agrupado, % Mix;
  mês corrente esmaecido "parcial"; tooltip com Δ MoM e YoY; duplo clique filtra o mês;
  "Comparar ▾" sobrepõe −1/−2 anos e desenha gráficos comparativos.
- **Drill-downs**: peças por categoria (cards com %, margem, Δ); histórico mensal desde 2023 (LineChart
  Venda/Custo, Valor×Qtd só em Serviços); tabela de vendas (ordenável, até 800 linhas, CSV total, popup do
  pedido, abrir DANFE); popup de Serviços (itens/por OS, chips HR/KM/Outros, nota/interno, impressão da OS,
  PDF da NFS-e); itens de entrada de peças.
- **Visão Máquinas**: KPI do período (unid, R$, ticket, Δ) + YTD; barras 12 meses; cards por família (top 8 + outras).

### 3. Dados disponíveis (mesmo banco)
- `vendas_itens` (peças e máquinas: data_pedido, tipo, família, categoria contábil, qtd, valor, `cmc_unitario`,
  cliente, conta_omie), `os_mensal` (serviços por mês: total, com nota, interno), `os_servicos_itens` + `os_nfse`
  (itens de OS, NFS-e), `notas_entrada` (entradas), `produtos`/`produto_tipo`/`cmc_historico` (custo e tipo),
  `portal_nt_clientes_cadastro_omie` (cliente).
- Agregação feita **no servidor** (rotas `/api/estoque/dashboard/*`, libs `src/lib/estoque/dashboard*.ts`).
- Ressalvas: cache por mês vindo da Omie (mês sem cache fica vazio até sincronizar); custo = CMC × qtd (CMC
  ausente conta 0 e infla margem); PostgREST corta em 1000 linhas (tudo é paginado); serviço só conta com NFS-e.

### 4. O que quero de você
1. Me ajude a decidir o escopo: o que recuperar da tela antiga (trimestre, grade ano×mês, toggle MoM/YoY,
   Comparar Empresas/Categorias/Venda×CMC×Margem, projeção por dias úteis) e que **novas** visualizações valem a
   pena (ex.: período customizado/YTD, comparação de dois períodos quaisquer, ranking de clientes/produtos,
   sazonalidade, metas, curva acumulada).
2. Faça perguntas que eu deva responder antes (usuários da tela, decisões de negócio).
3. Entregue um **prompt final para o Claude Code**, em português, organizado em fases pequenas e entregáveis,
   com critérios de aceite por fase, respeitando a tela atual (não quebrar o que funciona) e as ressalvas de dados.

