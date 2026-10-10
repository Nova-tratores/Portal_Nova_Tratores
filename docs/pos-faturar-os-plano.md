# Faturar OS (NFS-e) pelo portal — plano consolidado (10/10/2026)

Origem: plano base revisado por 15 agentes independentes (5 avaliadores, 5 planos do zero, 5 sintetizadores).
Molde: faturamento do PPV (`src/lib/ppv/omie.ts` → `simularFaturamentoPPV` / `faturarPPVNoOmie`, `FaturarModal`, botão que morfa no `PPVDrawer`).

## Decisões do usuário (fixas)
1. OS com pedido de peças (PPV) no Omie: a janela oferece faturar junto (caixinha marcada).
2. O botão Faturar aparece quando a OS existe no Omie, em qualquer fase ("Enviar para Omie" → "Faturar" → "Faturado").
3. A forma de pagamento da cobrança vira as parcelas da OS no Omie antes de faturar (a janela mostra e deixa trocar).
4. Depois de faturar: data gravada, OS em "Concluída", tenta nº + PDF da NFS-e; se não veio, "aguardando" e a reconciliação completa.

Decisões da 2ª rodada (10/10/2026, depois da revisão):
5. Garantia e OS interna: bloqueadas na v1, com selo ("Garantia" / "Interna · sem nota").
6. Faturar exige a permissão explícita `pos:faturar` (o módulo POS inteiro não basta); peças junto exigem também `ppv:faturar`.
7. Parcelas contam do dia do faturamento (fuso de São Paulo); À vista vence no dia.
8. FaturarOS aceito → Concluída mesmo com NFS-e aguardando/rejeitada, com selo (cinza aguardando / vermelho rejeitada + motivo).
   Reenviar/cancelar a nota fica na Omie nesta versão.
Pendentes (padrão adotado até o José dizer o contrário): reconciliação só olha janela recente, sem mover OS
históricas; valor portal × Omie divergente = aviso com confirmação obrigatória; forma de pagamento do PV junto
não muda (só mostra); primeira OS real escolhida com o José.

## API Omie (docs conferidas em 10/10/2026)
- `/servicos/osp/`: `FaturarOS`, `ValidarOS` (não emite), `CancelarOS`, `ReenviarOS` → `{cCodStatus, cDescStatus}`.
- `/servicos/os/` `AlterarOS`: `Cabecalho.cCodParc` ("999" = manual) + `nQtdeParc` + `Parcelas[] {nParcela, dDtVenc, nValor, nPercentual, nDias}`.
  `ConsultarOS` (`Cabecalho.nValorTotal`, `cNumOS`, `cCodIntOS`, `InfoCadastro.cFaturada/cCancelada`), `StatusOS` (NFS-e).

## Correções que a revisão tornou obrigatórias (consenso 5/5)
1. **Identidade da OS** — NÃO consultar/faturar por `cCodIntOS = Id_Ordem`: `criarOSNoOmie` reenvia com
   `${Id_Ordem}-${Date.now()}` quando o código já existe e não grava esse código nem o `nCodOS`
   (`src/lib/pos/omie.ts:594-615`) → a consulta pode achar a OS ANTIGA. Resolver a OS e conferir
   `cNumOS == Ordem_Omie` (sem zeros) + padrão `^Id_Ordem(-\d+)?$`; todas as escritas por `nCodOS`.
   `criarOSNoOmie` passa a gravar `omie_ncodos` e `omie_ccodint`.
2. **Trava atômica no banco** antes de qualquer escrita no Omie (`UPDATE … WHERE faturado_omie_em IS NULL AND
   (faturando_desde IS NULL OR faturando_desde < now()-10min) RETURNING`); zero linhas = 409 "em andamento".
3. **Cliente Omie de escrita sem retentativa automática e com timeout** (o `omieCall` do POS reenvia sozinho em
   429/"consumo redundante"). Timeout/erro de rede → estado `desconhecido` + `ConsultarOS` para decidir; nunca
   refaturar às cegas.
4. **Sucesso = `cCodStatus` de aceite**, não só ausência de `faultstring`. Gravar a resposta crua no audit.
5. **Anti-duplicidade completa**: `cCancelada='S'` bloqueia; etapa ≥ 50 / `cFaturada='S'` nunca chama
   AlterarOS/FaturarOS de novo (vai para conferência da NFS-e); "faturada por fora" só carimba com nota
   confirmada e NÃO grava a forma de pagamento da janela.
6. **Sequência**: resolver OS → trava → `AlterarOS` (parcelas) → `ConsultarOS` de conferência (total, nº e soma das
   parcelas) → `ValidarOS` → `FaturarOS`. Divergiu = aborta sem emitir.
7. **Parcelas** em lib pura: Σ valor = total (centavos na última), Σ% = 100,00, data base no fuso de São Paulo,
   total vindo do `nValorTotal` do Omie (portal e Omie divergem — ex.: OS-0777). Sem forma escolhida, o botão
   trava (sem padrão "30 dias"). À vista: formato decidido após sonda (`999` com 1 parcela é o candidato).
8. **Concluir pelo caminho normal** (`aplicarMudancaFase` + `registrarAlimentacaoOS`), não PATCH cru — senão
   a alimentação não vai pro financeiro. PPVs marcados são faturados ANTES de concluir. Drawer recarrega do
   servidor.
9. **Garantia** (mesma regra do envio: `Tipo_Servico` OU linha em `garantias`) e **OS interna** bloqueadas na v1,
   com selo explicativo — a garantia ainda tem projeto/montadora definidos depois em /garantias.
10. **Reconciliação própria** no lugar do `omie-sync` (que grava em `Ordens_Omie`, filtra inclusão no ano, não
    tem auth nem cron): `reconciliarFaturamentoOS` por `nCodOS`, só conta Nova; gatilhos = abrir o drawer,
    botão, webhook de OS (`clientes/webhook`) e agendador interno (`instrumentation.ts`, interruptor por env).
    Só janela recente; NÃO move OS históricas em massa.
11. **NFS-e**: `nfse_numero`/`nfse_link` (só PDF no storage, regra do `resolverNfseDaOS`) na OS + espelho em
    `portal_nt_clientes_os`; extrair `buscarNfseDaOS` do webhook para `src/lib/clientes/nfse-omie.ts`.
12. **Permissões**: ação `pos:faturar` explícita (o módulo `pos` inteiro NÃO a concede); cada PPV marcado exige
    `ppv:faturar` no servidor; os `ppvIds` precisam pertencer à OS; autor vem da sessão; simular tem o mesmo gate.
13. **OS faturada protegida**: `PATCH /api/pos/ordens/[id]` e `/fase` recusam (409) mudar Status/valores/Ordem_Omie.
14. **Conta Nova fixa** para as chamadas da OS; a janela mostra a conta de cada PPV (Nova/Castro).
15. **Falha parcial visível**: OS faturada e PPV com erro → estado "peças pendentes" no drawer com "Tentar só este".

## Arquivos
- `sql/pos-faturamento.sql` (APLICAR ANTES do deploy; sem ela faturar = 503): `Ordem_Servico.{forma_pagamento,
  omie_ncodos, omie_ccodint, faturado_omie_em, faturado_por, faturando_desde, faturamento_status (CHECK:
  faturando|desconhecido|faturada|nfse_aguardando|nfse_autorizada|nfse_rejeitada|erro), faturamento_erro,
  nfse_numero, nfse_link}` + índice parcial dos pendentes.
- `src/lib/pagamento/parcelas.ts` (pura, compartilhável com o PPV) + testes.
- `src/lib/pos/faturamento-regras.ts` (pura: bloqueios, identidade, máquina de estados) + testes.
- `src/lib/pos/faturamento.ts` (servidor: `simularFaturamentoOS`, `faturarOSNoOmie`, `reconciliarFaturamentoOS`) +
  testes da orquestração com Omie mockado (máx. 1 FaturarOS por tentativa; timeout; concorrência 409;
  ValidarOS recusa; releitura divergente; cNumOS divergente; PPV falha).
- Rotas `POST /api/pos/ordens/[id]/faturar/simular`, `POST /api/pos/ordens/[id]/faturar`,
  `POST /api/pos/ordens/[id]/faturar/reconciliar`.
- `src/components/pos/FaturarOSModal.tsx` (estilo do FaturarModal; não refatorar o do PPV agora).
- `OSDrawer.tsx` (botão que morfa + selos), `PhaseAccordion.tsx`/`cobrar` (grava `forma_pagamento` na OS nos dois
  ramos), `catalogo.ts` (`pos:faturar`), `criarOSNoOmie` (grava `omie_ncodos`/`omie_ccodint`).

## Rollout
1. Interruptor `POS_FATURAR=off|dev|on` (padrão off).
2. Sonda só de leitura em OS reais (ConsultarOS/ValidarOS, sem gravar) — confirma identidade, totais, formato de parcelas.
3. Primeira OS real de valor baixo, sem PPV, com o José acompanhando na Omie; depois uma com PPV.
