# Financeiro novo: o que foi decidido e onde paramos (06/11/2026)

O objetivo é trabalhar o financeiro inteiro pelo portal e parar de usar o Omie para isso, como já acontece no POS. O Omie fica só para nota fiscal e contabilidade. Tudo que for lançado no portal também vai para o Omie pela API.

Nada desta conversa foi commitado nem publicado. Tudo está só no localhost.

## Páginas de estudo (artifacts privados)

- **Caminho das contas Omie → portal:** proposta em 4 etapas (cópia em tempo real, receber, pagar, banco). https://claude.ai/artifact/LKoNuHLajSsqwwbJpYoK5F
- **Mapa dos fluxos:** tudo o que acontece hoje no financeiro do Omie, separado em blocos com nome e código, com os números de 2026 da Nova e da Castro. https://claude.ai/artifact/Ku98P6nvU69mfZyrKqjMrJ

## Mapa dos fluxos

Toda conta passa pela mesma esteira: nasce → ganha forma de pagamento → vence → é paga ou recebida → é conferida com o banco.

| Área | Blocos |
|---|---|
| Compras | C1 Mercadoria para revenda · C2 Tratores Mahindra · C3 Uso e consumo · C4 Frete · C5 Serviço de terceiros · C6 Devolução ao cliente |
| Vendas (já existe no portal, **não montar**) | V1 Balcão · V2 Oficina · V3 Máquinas · V4 Garantia · V5 Campanhas · V6 Devolução de compra |
| Pessoas | P1 Folha · P2 Benefícios · P3 Comissões · P4 Viagens e alimentação |
| Contas do mês | F1 Fixas · F2 Impostos · F3 Bens e consórcios · F4 Marketing |
| Banco | B1 Empréstimos · B2 Antecipação de duplicatas · B3 Caixas e cartão · B4 Transferências e extrato · B5 Conciliação |

Achados:
- **Boleto de compra:** quase nunca está no Omie. Só 71 das 2.406 contas de compra de 2026 têm o código de barras. Os boletos estão em fotos no portal (Requisicao.boleto_fornecedor e finan_pagar.anexo_boleto) ou chegam por fora. A sugestão é usar o DDA do banco.
- **C2 Tratores:** as parcelas entram no Omie por repetição, sem a nota (266 de 293). Pode ser **floor plan**, o financiamento do estoque pelo banco ou pela Mahindra. Confirmar com o Henri.
- **C6:** R$ 4,9 milhões de "devoluções de venda" lançados por repetição, só na Nova. Perguntar ao José o que são.
- **Folha, benefícios e comissões:** lançados à mão no Omie, mais de 800 contas no ano. O portal já tem o RH e o cálculo das comissões.
- **"Vale Refeição":** não existe VR em cartão. A categoria guarda o pagamento direto aos restaurantes (cerca de 500 contas, R$ 74 mil em 12 meses, quase tudo pela Nicolly). Quem come são os técnicos e motoristas, pelas requisições de Alimentação do portal (362 requisições; Nicolas, Danilo, Gabriel e José Antonio são os que mais pedem). Pertence ao **P4**, não ao P2. Daria para gerar a conta a pagar direto da requisição.
- **Categorias estranhas:**
  - O "Vale Transporte" da Castro tem Alelo, CTF e Sem Parar, cerca de R$ 51 mil. CTF e Sem Parar são combustível e pedágio, então a categoria parece errada.
  - O Pet Shop Animal Feliz está lançado como Vale Refeição.
- **Antecipação (B2):** é lançada automaticamente pelos parceiros de crédito do Omie (Votorantim, ERG e FIDC Omie), já com boleto.

## Decidido

1. **Montar tudo, menos a área de Vendas**, que já existe no portal.
2. **O Financeiro novo cresce a partir do Caixa.**
   - O código do Caixa está organizado e no estilo novo: `src/components/financeiro/caixa/` (CaixaTela, comum.tsx, CalendarioCaixa, VencidosCaixa, ContasCliente).
   - Ele lê o espelho do Omie pelas rotas `/api/dre-financeiro/*`.
   - A única coisa que ele grava é a baixa (`/api/ajustes/contas/baixar`).
3. **Empresa escolhida uma vez, no topo:** "Nova · Castro · As duas", lembrada por pessoa e valendo para todas as telas.
   - "As duas" serve só para olhar.
   - Para lançar, pagar ou baixar é obrigatório escolher uma empresa.
   - Hoje cada tela tem o seu seletor, que começa em "Todas" e não é lembrado ao trocar de tela.
4. **Abas aprovadas:** Recebimentos · Hoje · Compras · Pessoas · Contas do mês · Banco · Calendário · Vencidos · Recibos · Notas fiscais.
   - **Hoje:** o que vence hoje, o que está vencido e o que entrou.
   - **Compras:** C1 a C6. **Pessoas:** P1 a P4. **Contas do mês:** F1 a F4. **Banco:** B1 a B5.
5. **Manter** o Kanban, os Recibos e as Notas fiscais.
6. **Os três Kanbans** (Financeiro, Pós-Vendas e Peças) estão certos assim e não devem ser unificados. A aba Painel já tinha saído em 05/11; as páginas home-* continuam no ar só para os links que abrem um card (`?id=`).
7. **O Kanban passou a se chamar "Recebimentos".**
   - Ele acompanha cada venda faturada da nota até o dinheiro entrar: Gerar boleto → Enviar para cliente → Aguardando cliente → Cliente sem boleto → Pago / Vencido (o Pós-Vendas cobra).
   - "Chamados" foi recusado como nome.
   - Feito no localhost em `src/components/financeiro/FinanceiroNav.js` e `src/lib/dashboard/telas.ts`. Os endereços não mudaram.

## Feito antes nesta mesma conversa (localhost, sem publicar)

- **Caixa:**
  - Abas Calendário, Vencidos e Baixar contas.
  - Curva de Saldo, Fluxo e a aba Ajustes saíram.
  - A aba Vencidos saiu da faixa para quem tem o Caixa.
- **Calendário:** opção 5, "um dia por vez". Hoje fica no centro, os dias passados à esquerda e os próximos à direita; o dia escolhido fica em destaque e os do lado mais apagados.
- **Vencidos:**
  - Contas agrupadas por cliente, pelo CPF/CNPJ, juntando a Nova e a Castro.
  - Juros de 6% ao mês, proporcionais aos dias de atraso, com a taxa editável.
  - Botão "Copiar cobrança".
- **Clique no cliente:** abre todas as contas dele, com a data do recebimento, com ou sem juros, e a conta corrente de cada empresa. O botão "Finalizar no Omie" faz a baixa de verdade. **A baixa real nunca foi testada: testar primeiro com uma conta pequena.**
- **Faixa do Financeiro:** a aba Painel saiu para todo mundo e os títulos das colunas do Kanban ficam presos ao rolar a tela.

## Pendências

- **Do José:**
  - Acesso de admin em developer.omie.com.br, nas duas empresas, para ligar os webhooks.
  - Definir quem pode baixar, desfazer a baixa e gerar boleto.
  - Decidir se a folha e as contas recorrentes passam a ser lançadas pelo portal.
  - Dizer qual banco tem DDA e como os boletos de compra chegam hoje.
  - Explicar o C2 (tratores sem nota) e o C6 (R$ 4,9 milhões em devoluções).
- **Ver o layout das telas do Omie:** o melhor caminho é ligar o Claude in Chrome já logado no Omie, só para olhar e tirar prints. Alternativas: prints do José ou a ajuda pública (ajuda.omie.com.br). De preferência com o Mariano ou a Nicolly junto.
- **Testes no localhost:** calendário, vencidos com juros, a baixa pelo "Finalizar" e a aba Recebimentos.

## Onde paramos

O **próximo passo** é uma página de teste do topo novo: a escolha da empresa (Nova · Castro · As duas) e as 10 abas. Ela deve mostrar 2 ou 3 jeitos de fazer, incluindo uma versão com Compras, Pessoas, Contas do mês e Banco agrupadas, para a faixa não ficar comprida. O José escolhe antes de qualquer tela ser mexida.

**Feito (06/11, localhost):** `/financeiro/teste-topo` (`src/app/(portal)/financeiro/teste-topo/page.tsx`) com 4 opções. 1: como está hoje. 2: as 10 abas numa faixa só, com a empresa no fim. 3: agrupadas em "Contas" (Compras, Pessoas, Contas do mês, Banco) e "Documentos" (Recibos, Notas), com uma segunda linha. 4: a empresa na frente, em botões grandes, e os grupos em menu. A empresa vale para as 4 opções e fica lembrada (no teste, pelo navegador; na versão de verdade, por pessoa). Mostra os vencidos reais de cada empresa e trava "Lançar conta" em "As duas". Rastreio e Relatório não estão nas 10 abas e ficaram em "Mais": falta o José dizer se ficam.

**Escolhido (06/11):** opção 4, mas **sem "As duas"**: sempre uma empresa, Nova ou Castro. Os botões levam a logo de cada empresa, tirada do Omie: `public/Logo_Nova.png` (já existia) e `public/Logo_Castro.png` (recortada de um print, 212×46). A página de teste agora mostra só essa versão; a empresa que não está escolhida fica cinza e apagada.

**Na faixa de verdade (06/11, localhost):** a logo da Nova passou a ser o T do Omie (`public/Logo_Nova_Omie.png`, recortado do print; a `Logo_Nova.png` segue para os outros usos).
- `FinanceiroTopoNovo.tsx`: para Dev e função Financeiro. Pós-Vendas e Peças seguem com a faixa antiga. Abas: Recebimentos · Hoje · Contas ▾ (Compras, Pessoas, Contas do mês, Banco) · Calendário · Vencidos · Documentos ▾ (Recibos, Notas fiscais) · Mais ▾ (Rastreio, Relatório, Baixar contas).
- `empresaFinanceiro.ts`: o `useEmpresaFinanceiro()` guarda a empresa por pessoa neste navegador e começa na Nova. Ainda não é salva no banco, então não acompanha a pessoa em outro computador.
- Calendário e Vencidos seguem a empresa do topo: o "Todas · Nova · Castro" de cada um saiu, e com ele o `SegConta`. As abas de dentro do Caixa também saíram.
- Hoje, Compras, Pessoas, Contas do mês e Banco: telas "em montagem" (`EmMontagem.tsx`) que mostram os blocos de cada uma.
- As outras telas (Recebimentos, Recibos, Notas fiscais) ainda não seguem a empresa do topo.

Depois, a ordem de montagem é:
1. O topo.
2. Hoje.
3. Compras com boleto.
4. Pessoas.
5. Contas do mês.
6. Banco.

Regras que valem sempre:
- Responder em português.
- Não fazer commit nem publicar sem o José pedir.
- Nunca usar `git add -A`, porque a pasta é compartilhada.
- Ao mandar SQL, dizer em qual projeto do Supabase rodar.
- Telas em tela cheia, sem negrito, sem letras maiúsculas e sem faixa lateral colorida nos cards.

## Aba Hoje (06/11, localhost)

- Tela: `src/components/financeiro/caixa/HojeCaixa.tsx`, aberta em `/financeiro/hoje` dentro do `CaixaTela`, que só deixa entrar Dev e Financeiro.
- Seis números no alto: a receber hoje, a pagar hoje, vencido a receber, vencido a pagar, o que entrou hoje e o que saiu hoje. Clicar num número desce até a lista dele.
- Três blocos, cada um com a receber à esquerda e a pagar à direita:
  - **Vence hoje:** o que está em aberto. O que já foi pago fica apagado no fim da lista.
  - **Vencido:** com os dias de atraso e um link para a aba Vencidos, onde estão os juros e a cobrança.
  - **Entrou e saiu hoje.**
- Cada lista mostra 8 contas, e "Ver todas" abre o resto.
- "O que entrou" usa a **data de pagamento dos títulos** (`/api/dre-financeiro/titulos?eixo=pagamento`, opção nova na rota), e não a tabela `movimentos_cc`. Os movimentos chegam com um ou dois dias de atraso e às vezes em dobro: o mesmo recebimento aparece como VENR e como BAXR.
- O espelho do Omie é atualizado a cada 3 horas. Uma baixa feita pelo portal aparece na hora.

## Aba Pessoas (06/11, localhost)

- Arquivos:
  - `src/lib/financeiro/pessoas.ts`: os blocos e as categorias do Omie de cada um.
  - `/api/dre-financeiro/pessoas?mes=AAAA-MM&conta=`: a rota da aba. Só lê.
  - `src/components/financeiro/caixa/PessoasCaixa.tsx`: a tela, em `/financeiro/pessoas`.
- Blocos e categorias:
  - **P1 Folha:** Salários, Adiantamento, Férias, Rescisões, INSS, FGTS e IRRF.
  - **P2 Benefícios:** Seguro de Vida, Vale Transporte, Assistência Médica e Outros Benefícios.
  - **P3 Comissões:** Comissões.
  - **P4 Viagens e alimentação:** Vale Refeição, Hospedagem, Passagens e Pedágio.
- A tela tem o mês com setas e quatro números (P1 a P4). Clicar num deles mostra as contas a pagar do Omie que vencem no mês, com a situação de cada uma: pago, vencida ou vence em tal dia.
- Ao lado fica o que o portal já sabe:
  - **P3:** as comissões do mês anterior, pela mesma regra do Controle de comissões da Gestão (status que valem e o pedido mais recente de cada técnico). A comissão de outubro é paga em novembro.
  - **P4:** as requisições de Alimentação do mês, em aberto ou já no Financeiro. A requisição não guarda a empresa, então aparecem as das duas.
  - **P1 e P2:** um texto com o que falta ligar, que é a folha do RH e os benefícios por pessoa.
- Ainda não lança nada no Omie. Esse é o próximo passo.
- Achado: nas contas que vencem em outubro e em novembro, não há nenhuma conta de "Comissões" no Omie, nem na Nova nem na Castro. Em outubro, as comissões calculadas no portal estão quase todas aguardando o diretor.

## Módulos dentro do Financeiro (06/11, localhost)

- O José decidiu: Compras, Pessoas, Contas do mês e Banco são **módulos dentro do Financeiro**, porque "tem muita coisa". Só Dev e função Financeiro têm acesso, sem permissão por pessoa.
- **Faixa:** o menu "Contas" saiu. A faixa ficou assim: Recebimentos · Hoje · Compras · Pessoas · Contas do mês · Banco · Calendário · Vencidos · Documentos ▾ · Mais ▾.
- **Abas de dentro:** cada módulo tem uma segunda linha de abas (`ModuloAbas.tsx`, com o visual das antigas abas do Caixa). O `CaixaTela` recebe essas abas pela prop `abas`.
- **Pessoas:** `/financeiro/pessoas/{folha,beneficios,comissoes,viagens}`. A tela fica no `layout.tsx`, então o mês escolhido e os dados não se perdem ao trocar de aba. `/financeiro/pessoas` leva para a Folha.
- **Compras, Contas do mês e Banco:** continuam "em montagem". Cada um ganha as suas abas quando for montado.

## Achados de 06/11

- **Salário "RH-SAL-11-2026":** é a previsão de salário que o RH lança no Omie para cada funcionário ao montar a folha planejada (`rh-nova-tratores/lib/folha-planejada.ts`). O vencimento é o fim do mês, e a observação é "Previsão salário mês/ano - nome".
- **Nome com acento estragado ("VinÃ­cius CÃ´rrea"):** o erro está no cadastro do fornecedor 2257082394 no próprio Omie. O portal conserta na hora de mostrar (`nomeDe` em `caixa/comum.tsx`). Corrigir o cadastro no Omie depende do ok do José.

## Menu de áreas (06/11, localhost) — substitui a faixa com os módulos

- O José explicou: "dividir em módulo" quer dizer **um menu dentro do Financeiro, com áreas, como o dashboard**. Vale só para Dev e função Financeiro. Pós-Vendas e Peças ficam como estavam: a área deles é a de Recebimentos, sem menu e sem as logos.
- **`/financeiro`:** Dev e Financeiro veem o menu (`MenuAreasFinanceiro.tsx`). Os outros continuam indo para o Kanban deles.
- **Faixa (`FinanceiroTopoNovo.tsx`):** logos Nova/Castro · "Áreas", que volta ao menu · as abas da área aberta. As listas "Documentos" e "Mais" saíram.
- **Áreas (`areasFinanceiro.ts`):**
  - Recebimentos: Recebimentos (kanban) e Rastreio.
  - Caixa: Hoje, Calendário, Vencidos e Baixar contas.
  - Compras: em montagem.
  - Pessoas: Folha, Benefícios, Comissões e Viagens e alimentação.
  - Contas do mês: em montagem.
  - Banco: em montagem.
  - Documentos: Recibos, Notas fiscais (só com `financeiro:notas`) e Relatório.
- Saíram o `ModuloAbas.tsx` (a segunda linha de abas) e a página `/financeiro/teste-topo`.
- **Visual do menu em teste:** o José achou o menu feio. `/financeiro/teste-areas` mostra 4 opções com os números reais da empresa escolhida:
  1. Como está hoje.
  2. Blocos coloridos, como o dashboard.
  3. Lista à esquerda e painel com as telas à direita.
  4. Cartões do mesmo tamanho, com as telas em lista.

  Falta o José escolher. Cada aba das áreas ganhou uma frase curta do que faz (`descricao` em `areasFinanceiro.ts`).

## Contas do mês (06/11, localhost) e a tela comum das áreas de blocos

- **Tela comum:** `src/components/financeiro/caixa/ModuloContasTela.tsx` tem o mês com setas, um número por bloco, as contas do Omie do bloco e um painel "no portal" que cada área passa. Pessoas (`PessoasCaixa.tsx`) e Contas do mês (`ContasDoMesCaixa.tsx`) usam essa tela.
- **Leitura comum no servidor:** `lib/financeiro/modulosContas-server.ts` (`lerContasModulo`). Os blocos ficam em `lib/financeiro/modulosContas.ts`.
- **Contas do mês:** `/financeiro/contas-do-mes/{fixas,impostos,bens,marketing}`, com a rota `/api/dre-financeiro/contas-do-mes`.
  - **F1 Fixas:** Aluguel, Água e Esgoto, Energia Elétrica, Telefonia, Sistemas e Informática, Contabilidade, Advogados, Despesas Jurídicas/Honorários, Seguros, Documentação e Despesas com Contratos.
  - **F2 Impostos:** IPVA, IPVA/Licenciamento, Multa/Licenciamento Veicular, IRPJ, Contribuição Social, IPTU, ISS, PIS e as duas Taxas de Licença.
  - **F3 Bens e consórcios:** Consórcio Veículos, Veículos, Máquinas e Equipamentos, Equipamentos de Informática e Móveis e Utensílios.
  - **F4 Marketing:** Marketing, Brindes, Bonificações, Doações e Folhetos.
  - O IOF ficou de fora porque é do banco (B1).
- **Painel ao lado:** as contas que se repetem todo mês, filtradas pelo bloco, pela empresa e pelo mês, com a situação de cada uma: não veio, ainda no prazo ou veio. Os dados vêm da rota `/api/financeiro/recorrentes`, a mesma do lembrete do Mariano, que só olha o mês atual e os dois anteriores.
- **Números de novembro:**
  - Nova: F1 R$ 21.555, F3 R$ 21.666 e F4 R$ 1.971.
  - Castro: F1 R$ 300 e F3 R$ 23.589.
- **Ainda em montagem:** Compras, que depende das respostas sobre os boletos, e Banco.

## Banco (06/11, localhost)

- **Abas:** `/financeiro/banco/{emprestimos,antecipacoes,tarifas,contas-correntes}`, com a rota `/api/dre-financeiro/banco`.
  - **B1 Empréstimos:** Pagamento de Empréstimos, Juros sobre Empréstimos e IOF.
  - **B2 Antecipações:** a mesma categoria "Pagamento de Empréstimos", separada pelo parceiro (Votorantim, ERG e o fundo do Omie). Para isso, `BlocoModulo` ganhou o campo `fornecedores`.
  - **B4 Tarifas e multas:** Tarifas Bancárias e Multas.
- **Painel ao lado:**
  - B1 e B4: quanto vai para cada banco no mês.
  - B2: as operações de antecipação do mês (valor cheio, juros, líquido e taxa), da rota `/movimentos/antecipacoes` do DRE.
- **Aba Contas correntes (`ContasCorrentesCaixa.tsx`):** um cartão por conta corrente (bancos, caixa, caixinha, cartão e contas do Omie) com o que entrou e saiu no mês. Clicar mostra os movimentos.
- **Conciliação (B5):** não dá ainda, porque o extrato do banco não chega ao portal.
- **Novembro:**
  - Nova: B1 R$ 59.303, B2 R$ 34.297 e B4 R$ 540.
  - Castro: B1 R$ 64.818 e B2 R$ 7.007.

## Conserto: movimentos contados em dobro (06/11, localhost)

- O Omie devolve duas linhas para o mesmo dinheiro: o título quitado (VENR, COMP, CTEP, MANP, APIP, RPTR/RPTP) e a baixa dele (BAXR/BAXP), com mesmo valor, conta e dia. A rota `/api/dre-financeiro/movimentos` somava as duas.
- Em outubro, na Nova, isso dava **R$ 1,01 mi a mais nas entradas** (R$ 2,54 mi mostrados) e **R$ 919 mil a mais nas saídas**. Na Castro, R$ 67 mil e R$ 142 mil.
- Agora, quando um título tem baixa, conta só a baixa (`emDobroTirados` na resposta). Isso corrige também a tela **DRE › Movimentações CC**, que já está publicada com o erro.
