# Dashboard Agro — descritivo completo das funcionalidades

> Documento de contexto para estudar novas funcionalidades. Escrito para quem **não tem acesso ao código**.
> Estado em 28/09/2026. Tudo o que está descrito aqui existe e está em produção, salvo onde diz "pendente".

## 1. Quem usa e para quê

A **Nova Tratores** é uma concessionária Mahindra (tratores e implementos) com sede em **Piraju/SP**. A área de atuação são **45 municípios** do sudoeste paulista (de Itararé e Nova Campina, ao sul, a Ubirajara e Lupércio, ao norte; inclui Ourinhos, Avaré, Santa Cruz do Rio Pardo, Itaí, Taquarituba, Paranapanema). A rede tem outras "lojas" com territórios próprios: COMPER (74 municípios), Brutus (14), IGATU (14) e Livre (17).

O **Dashboard Agro** é o módulo de inteligência de mercado agrícola do portal interno da empresa (`portal.novatratores.com/dashboard-agro`). Ele responde a duas perguntas:

1. **Onde está o mercado?** Visão por **município**: produção, rebanho, parque de máquinas, relevo, clima, vendas.
2. **Para quem ligar?** Visão por **imóvel rural**: cada fazenda da região com cultura estimada, área, crédito rural recente e um score de oportunidade, virando lista de prospecção.

Usuários: equipe comercial (vendedores e quem faz ligação ativa), gestão e o responsável técnico pelo portal. O acesso é por permissão no portal (módulo "Dashboard Agro").

## 2. Estrutura: cinco guias

| Guia | Granularidade | O que é |
|---|---|---|
| **Dashboard** | Município | App anterior, embutido. 8 abas de análise municipal (SP + PR). |
| **Inteligência por CAR** | — | O plano do projeto e o andamento, para o time ler. |
| **Prospecção** | Imóvel | Lista de imóveis ordenada por score, com filtros e exportação. |
| **Mapa dos imóveis** | Imóvel | Polígonos dos imóveis coloridos por cultura, com as visitas dos vendedores. |
| **Vínculos** | Imóvel × cliente | Sugestões de qual cliente é dono de qual imóvel, para aceitar ou rejeitar. |

As guias "por imóvel" foram construídas em setembro/2026. A guia Dashboard é mais antiga e independente.

---

## 3. Parte A — visão por município (guia "Dashboard")

Página única com mapa e gráficos. Cobre **SP e PR** nos dados do IBGE; o resto só SP. Tem tema claro e escuro e link direto para um município.

### 3.1 Aba Mapa
- Mapa coroplético dos municípios. Borda colorida pela loja dona do território.
- **Dataset**: lavouras temporárias (2024), lavouras permanentes (2022), pecuária, ou **tempo de estrada a partir de Piraju**.
- **Variável** (lavouras): área plantada, área colhida, quantidade produzida, rendimento, valor da produção.
- **Filtro de loja**, com zoom automático no território.
- Controle deslizante que esmaece municípios abaixo de um valor (ou acima de X minutos de estrada).
- Chave **"Vendas de tratores"**: bolhas com o número de tratores que a empresa vendeu no município; clique lista modelo, cliente, data e vendedor.
- Painel "Top 20" da variável escolhida.
- Busca de município. Clique num município abre o raio-X dele (aba Intel. Município).
- **Tempo de estrada**: calculado por roteamento (OSRM) da sede até cada município, em 4 faixas (até 60, 60–120, 120–180, acima de 180 min).
- Função oculta de **ajuste de ponto**: permite marcar à mão o ponto de referência de um município (em vez do centro geométrico) e recalcula a rota.

### 3.2 Aba Intel. Loja
Para cada uma das 5 lojas: municípios de destaque numa cultura, rebanho ou tipo de máquina. Top 6 por área, produção, rendimento e valor; **valor de mercado estimado** (produção × preço da commodity); parque de máquinas da loja e participação no estado.

### 3.3 Aba Rank Máquinas
- **Parque instalado (censo LUPA/CATI 2016/17, só SP)**: tabela município × 20 máquinas-chave (trator, colhedeira, pulverizador, grades, arados, plantadeiras, irrigação, ensiladeira, roçadeira…), ordenável, com destaque para Top 10 e Top 50 do estado. Duelo entre duas lojas, máquina a máquina.
- **Registros novos (RENAGRO 2022–25)**: tratores e máquinas registrados, com filtros de potência (cv), marca, ano, loja e categoria. Mostra evolução anual, **participação de mercado por marca**, top 50 modelos, top 30 municípios e distribuição por loja.
- **Porte estimado de implementos**: reparte o parque de um implemento em pequeno/médio/grande conforme a potência dos tratores registrados no município.

### 3.4 Aba Vendas
Tabela dos tratores vendidos pela empresa: entrega, município, modelo, cliente, vendedor, chassi. Busca livre e filtro por vendedor.

### 3.5 Aba Análise Loja
Perfil econômico completo de uma loja: rebanhos, área plantada, valor das lavouras (declarado ao IBGE e estimado a mercado), top culturas, top 5 municípios por cultura e comparação com as outras lojas.

### 3.6 Aba Intel. Município
Raio-X de um município, com comparação lado a lado com outro:
- **Relevo** (declividade, altitude, classe) com selo de adequação a máquinas grandes.
- **Hidrologia** (estações, rios, bacias).
- **Pecuária** e **lavouras** com ranking.
- **Uso do solo** e **parque de máquinas** (hectares de lavoura por máquina).
- **Tratores: parque × registros novos**, com taxa de renovação e distribuição por faixa de potência.
- Top 5 municípios vizinhos.

### 3.7 Aba Intel. Cultura
Quem produz uma cultura: municípios produtores, área, produção, valor, participação de cada loja e ranking completo.

### 3.8 Aba Intel. Terreno
**Score de oportunidade por município**, somando pontos por regra:
- relevo plano pontua mais;
- área de lavoura grande pontua mais;
- **gap de máquinas**: muita lavoura para pouca colhedeira, pulverizador, plantadeira ou trator; pastagem grande sem roçadeira ou distribuidor de calcário; rio sem irrigação;
- clima (frio com pastagem e sem ensiladeira).

Cada gap vira uma "oportunidade" com urgência. Mostra ranking de municípios, oportunidades por tipo de equipamento e resumo por loja.

### 3.9 Limitações da Parte A
- Bases de anos diferentes misturadas: IBGE 2024 e 2022, censo de máquinas 2016/17, registros 2022–25, clima 2018–23.
- Preços de commodities fixos no código (março/2026), vários marcados como estimativa.
- Regras do score municipal fixas no código, sem fonte.
- Sem exportação de tabelas.
- Município do PR só tem dados do IBGE.
- O casamento de cidade das vendas é aproximado (texto livre).

---

## 4. Parte B — visão por imóvel rural ("Inteligência por CAR")

### 4.1 Conceitos

- **CAR** (Cadastro Ambiental Rural): registro público federal de cada imóvel rural, com o **polígono** da propriedade. É a unidade de análise.
- **Gleba**: no crédito rural, o talhão financiado. Cada operação de crédito registra no Banco Central o polígono da área onde o dinheiro será aplicado, junto com o produto (soja, café, bovinos…) e a finalidade (custeio, investimento).
- **Área útil**: área do imóvel usada para agropecuária, descontando mata nativa, APP e água. Toda porcentagem de cultura é sobre a área útil, não sobre a área total.
- **Cultura principal**: a cultura com maior área útil na safra mais recente, desde que ocupe ao menos 30%. Abaixo disso o imóvel é "Diversificado".
- **Vínculo**: ligação entre um imóvel e um cliente da Nova. Só existe quando uma pessoa confirma.

### 4.2 Fontes de dados (todas públicas, exceto as internas)

| Fonte | O que traz | Observação |
|---|---|---|
| SICAR (governo federal) | Polígono, área, situação de cada imóvel | 34.029 imóveis nos 45 municípios; 31.655 ativos |
| MapBiomas coleção 10 (satélite, 30 m) | Uso do solo por ano: soja, cana, café, citros, pastagem, silvicultura… | Safras 2022, 2023, 2024. **Não separa milho.** |
| SICOR (Banco Central) | Operações de crédito rural e glebas | 9.748 operações e 23.248 glebas na região, 2019–2024 |
| IBGE PAM | Área plantada por município | Usado só para conferir o satélite |
| Visitas do CRM (interno) | Localização GPS das visitas dos vendedores | 251 visitas desde abril/2026 |
| Cadastro de clientes (interno) | Clientes da Nova | Para o vínculo |

Não há nome, CPF ou contato do dono do imóvel vindos de fonte pública. O sistema **não identifica o dono automaticamente**.

### 4.3 O que o sistema calcula para cada imóvel

1. **Uso do solo por safra**: hectares de cada cultura dentro do polígono, em 2022, 2023 e 2024.
2. **Crédito rural**: operações cujas glebas caem dentro do imóvel (96% das glebas da região foram atribuídas a um imóvel). Soma dos últimos **12** e **36 meses**, com o **investimento** separado. Quando um contrato tem glebas em vários imóveis, o valor é **rateado pela área**.
3. **Sobreposição**: quanto o polígono se sobrepõe a outros CARs (38.389 pares na região; 1.286 são praticamente duplicatas).
4. **Cultura principal e grau de confiança**:

| Confiança | Condição |
|---|---|
| Alta | Satélite e crédito rural apontam a mesma cultura, **ou** alguém validou em campo |
| Média | Só uma fonte, com a cultura em 60% ou mais da área útil |
| Baixa | Só uma fonte abaixo de 60%, fontes discordantes, imóvel diversificado, ou mais de 20% de sobreposição |

   Regras adicionais: a classe "mosaico de usos" do satélite nunca vira cultura principal; café e cana vistos só pelo satélite ficam no máximo em confiança média (o satélite enxerga cerca de metade do café da região); validação de campo vence qualquer estimativa.

5. **Score de oportunidade**, soma explicável:

| Parcela | Pontos |
|---|---|
| Área da cultura | 1 a cada 100 ha, teto 3 |
| Crédito | 2 se teve investimento nos 36 meses; 1 se teve custeio nos 12 meses |
| Ainda não é cliente vinculado | 1 |
| Prioridade da regra comercial | 0,2 a 1 (0,5 sem regra) |

   Multiplicado pelo fator da confiança (alta 1 · média 0,85 · baixa 0,6). Hoje o máximo é 6,5. Os pesos e a prioridade vêm de uma tabela que o comercial preenche.

### 4.4 Números atuais (45 municípios, safra 2024)

| | |
|---|---|
| Imóveis ativos com perfil | 31.655 |
| Confiança | alta 1.233 · média 12.086 · baixa 18.336 |
| Cultura principal | soja 10.678 · diversificado 8.752 · pastagem/pecuária 7.390 · silvicultura 1.986 · cana 1.687 · café 526 · citros 199 |
| Com crédito nos 36 meses | 1.730 (332 com investimento) |
| Sugestões de vínculo pendentes | 139 |
| Vínculos confirmados | 0 (ninguém decidiu ainda) |

### 4.5 Guia Prospecção
- Lista dos imóveis ordenada por score. Por padrão mostra só confiança alta e média (13.319).
- **Filtros**: município, cultura (ou diversificado), confiança, área mínima e máxima, com crédito nos 36 meses, com investimento, com cliente / sem cliente / com sugestão pendente, código do CAR.
- **Ordenação** por qualquer coluna: score, município, cultura, confiança, área, área da cultura, crédito, investimento.
- Cada linha mostra o motivo da confiança por extenso e alerta de sobreposição.
- **Exportar CSV** do filtro (até 5.000 linhas). Não leva dado de pessoa física de fonte pública. Toda exportação fica registrada.
- Filtros lembrados no navegador. Paginação de 100.
- Botão **Regras de oportunidade**.

### 4.6 Ficha do imóvel (abre da lista e do mapa)
- Cultura principal, confiança, score, município, área, módulos fiscais, situação no SICAR.
- **Fonte** do dado e **motivo** da confiança.
- **Como o score foi calculado**, parcela por parcela.
- **Uso do solo por safra**: tabela cultura × ano.
- **Crédito rural**: totais de 12 e 36 meses, investimento, e tabela de operações (data, finalidade, produto, valor no imóvel).
- **Sobreposições** com outros CARs.
- **Visitas** dos vendedores registradas dentro do imóvel.
- Link para o **Google Maps** no centro do imóvel.
- **Ações**:
  - **Cultura confirmada** ou **Cultura errada → qual é?** Grava a verdade de campo, sobe a confiança para alta na hora e fica com o nome de quem informou.
  - **Vincular um cliente**: busca por nome, fazenda ou CPF/CNPJ no cadastro.
  - Remover vínculo.
  - Aceitar ou rejeitar sugestão de vínculo.
  - Atalho para o cockpit de atendimento do cliente vinculado.

### 4.7 Guia Mapa dos imóveis
- Escolhe o município; os imóveis aparecem como polígonos.
- **Cor** = cultura principal. **Opacidade** = confiança. **Borda azul** = tem cliente vinculado.
- **Pinos** = visitas dos vendedores.
- Legenda clicável que esconde culturas. Filtros de confiança mínima e "com crédito".
- Clique no polígono mostra o resumo e abre a ficha.

### 4.8 Guia Vínculos
- **Sugestão automática**: uma visita presencial com GPS que cai dentro do polígono de um imóvel sugere que o imóvel é daquele cliente.
- Tabela com cliente, imóvel, município, área, cultura, número de visitas, precisão do GPS, vendedor e o motivo.
- Score da sugestão: mais visitas e GPS preciso somam; imóvel visitado por mais de um cliente subtrai e é marcado em destaque.
- **Aceitar** ou **Rejeitar**, com confirmação. Nada vira vínculo sem uma pessoa decidir.
- Cabeçalho ordenável, filtros por situação, município e busca.

### 4.9 Integração com o cockpit de atendimento
O portal tem uma tela para quem faz ligação ativa (cockpit), com o histórico do cliente: máquinas, serviços, compras, atendimentos. Quando o cliente tem imóvel vinculado, aparece o bloco **"Imóvel rural (CAR)"** com cultura, confiança, área, crédito de 36 meses e investimento.

### 4.10 Regras de oportunidade
Cadastro, feito pelo comercial, de: cultura, faixa de área, **produto sugerido** (ex.: um modelo de trator), **argumento do vendedor**, prioridade (1 a 5) e pesos do score. Ainda está vazio.

### 4.11 Governança
- **Rastreabilidade**: cada carga de dados é uma "execução" numerada; todo dado aponta para a execução que o gerou.
- **Auditoria**: exportações, vínculos, validações e mudanças de regra ficam registrados com usuário e data.
- **Privacidade**: acesso só por permissão; nenhum dado é lido direto pelo navegador no banco. Existe um rascunho de avaliação de legítimo interesse (LGPD) aguardando assinatura da direção.

---

## 5. Como os dados são atualizados

Hoje é **manual**, rodado no computador do responsável técnico, em scripts:

| Etapa | Frequência pretendida |
|---|---|
| Baixar imóveis do SICAR e calcular sobreposições | Trimestral |
| Ler o MapBiomas e calcular uso do solo por imóvel | Anual (nova coleção) |
| Baixar o SICOR, recortar glebas e atribuir a imóveis | Mensal |
| Gerar sugestões de vínculo pelas visitas | Mensal |
| Recalcular perfil e score | Após cada carga |

Não há agendamento nem alerta de "dado velho" ainda.

## 6. Limitações conhecidas da Parte B

1. **O crédito cobre poucos imóveis**: só uma em cada três operações de SP tem gleba registrada; 12 a 16% dos imóveis têm alguma gleba. "Sem crédito" significa "sem crédito localizável".
2. **Milho invisível no satélite**: só aparece quando há crédito de milho. A safrinha some sob a soja.
3. **Café e cana subestimados** pelo satélite onde há muito "mosaico de usos".
4. **58% dos imóveis têm confiança baixa**, a maioria pequenos ou diversificados.
5. **Dono do imóvel desconhecido**: o vínculo depende de visita registrada ou de alguém informar.
6. **Score sem regras comerciais**: enquanto a tabela de regras estiver vazia, ordena por área e crédito com pesos iguais.
7. **Acurácia não medida**: o plano pede 80% de acerto na cultura principal, medido contra 50 a 100 imóveis de cultura conhecida. A medição sai das validações feitas na ficha, que ainda não começaram.
8. **Sobreposição de CARs é comum** e rebaixa a confiança.
9. As duas partes do dashboard **não conversam**: a visão municipal e a visão por imóvel usam bases separadas e scores diferentes.

## 7. O que está pendente ou previsto

- O comercial **usar**: decidir as 139 sugestões, validar culturas, preencher regras.
- **Agendar o pipeline** e alertar dado velho.
- **Medir a acurácia** com as validações.
- **Modelo próprio com Sentinel-2** (condicional): separar milho e safrinha, usando glebas e validações como rótulo.
- Confirmar formalmente a lista dos 45 municípios e assinar a avaliação de LGPD.

## 8. Ativos de dados disponíveis para novas funcionalidades

Para quem for propor ideias, isto já existe e pode ser cruzado:

**Por imóvel**: polígono, área, área útil, módulos fiscais, situação no SICAR · uso do solo em 3 safras (dá para ver mudança de cultura) · operações de crédito com data, finalidade, produto e valor · sobreposições · visitas com data, vendedor e resumo · cliente vinculado · validações de campo.

**Por município**: produção e valor de todas as culturas · rebanhos · parque de máquinas por tipo · registros de tratores novos por marca, modelo e potência · relevo, clima, hidrologia · tempo de estrada até a sede · tratores vendidos pela empresa.

**Do portal (outros módulos)**: clientes com histórico de compras, serviços e máquinas · propostas comerciais e funil · ordens de serviço · calendário de revisões dos tratores vendidos · registro de ligações e atendimentos · visitas dos vendedores com GPS · rastreamento dos veículos da frota.

## 9. Perguntas em aberto para o estudo

1. Como transformar a lista em **rotina do vendedor** (carteira por vendedor, meta semanal, roteiro de visita)?
2. Como usar a **mudança de cultura entre safras** (pasto virando soja, por exemplo) como gatilho de venda?
3. Como usar o **investimento recente** e o **vencimento do custeio** para escolher o momento da ligação?
4. Como unir a visão **municipal** (gap de máquinas, participação de mercado) com a visão **por imóvel**?
5. Como descobrir o **dono** dos imóveis de maior score sem ferir a LGPD?
6. Como aproveitar o **parque de tratores já vendidos** (revisões, idade da máquina) junto com o perfil do imóvel?
7. Que **indicadores de resultado** provam que a lista gera proposta e venda?
