# Módulo Ajustes (`/ajustes`)

Migração do app **Omie CMC Garantia** (`back.novatratores.com`) para módulo nativo do Portal.
Mesmo Supabase do Portal (`citrhumdkfivdzbmayde`). Multi-conta NOVA/CASTRO por threading
explícito de `conta` (`'NOVA' | 'CASTRO'`; `undefined` = "Todas"). Permissão: `temAcesso('ajustes')`.

## Telas (`app/(portal)/ajustes/`)
- `/ajustes` — Dashboard CMC garantia (aplicar/reverter correção, resumo da semana)
- `/ajustes/historico` · `/ajustes/ajuste-custos`
- `/ajustes/negativos` · `/ajustes/recebimentos` · `/ajustes/notas`
- `/ajustes/correcao-contas` · `/ajustes/baixa-contas` · `/ajustes/caracteristicas`
- `/ajustes/inventario` · `/ajustes/inventario/contagem` · `/ajustes/relatorio-contagem`
- `/ajustes/pedidos` · `/ajustes/pedidos-antigos` · `/ajustes/encerramentos/[id]` · `/ajustes/saude-mensal`
- `/ajustes/mahindra` · `/ajustes/alertas`

## Jobs de background (worker-ready)
Estado em `ajustes_jobs` (Supabase), NÃO em memória — sobrevive a deploy. Disparados pela UI
(POST `iniciar` + polling de `status`). Tipos: `estoque-negativo`, `inventario-recalcular`,
`mahindra-gerar`, `caracteristicas-sync`, `verificacao-diaria`.

## Agendados — scheduler EXTERNO (NÃO instrumentation.ts)
As rotas abaixo são protegidas por `Authorization: Bearer ${CRON_SECRET}`. Estão **DORMENTES**
no cutover: existem mas só devem ser disparadas após validação. Configurar um scheduler externo
(Railway cron / GitHub Action / cron-job.org) apontando para cada uma. Sugestão de agenda:

| Rota | Quando (sugerido) | O que faz |
|------|-------------------|-----------|
| `GET /api/ajustes/cron/verificacao-diaria` | diário 06:00 BRT | varre contas, gera alertas (cmc_alertas) |
| `GET /api/ajustes/cron/home-prewarm` | diário 06:10 BRT | pré-aquece recebimentos/pedidos da home |
| `GET /api/ajustes/cron/inventario-diario` | diário 07:00 BRT | gera ciclo diário de contagem + freeze |
| `GET /api/ajustes/cron/relatorio-pedidos` | seg 07:00 BRT | e-mail (PDF) de pedidos abertos antigos |

## Env (Railway, serviço do Portal)
- Omie: `OMIE_APP_KEY_NOVA/SECRET_NOVA`, `OMIE_APP_KEY_CASTRO/SECRET_CASTRO` (CASTRO exige as suas).
- Regras: `CFOPS_GARANTIA`, `THRESHOLD_CUSTO_BAIXO`, `LOOKBACK_MESES`, `CACHE_TTL_SEG`.
- Recebimento: `RECEBIMENTO_CUSTO_ESTOQUE`, `RECEBIMENTO_ETAPA_CONCLUIDO`.
- Contas/caract: `CONTAS_THROTTLE_MS`, `CARACT_THROTTLE_MS`.
- Inventário: `INV_FREQ_A/B/C`, `INV_CAP_DIARIA`, `INV_ABC_LIMITE_A/B`, `INV_TOL_PCT/VALOR`, `INV_FAMILIAS_INCLUIR`.
- Alertas/relatório: `VERIFICACAO_HORA`, `HOME_PREWARM_TTL_HORAS`, `NEGATIVOS_CACHE_HORAS`,
  `RELATORIO_PEDIDOS_DIAS_MIN`, `RELATORIO_PEDIDOS_EMAIL_TO/CC/BCC`.
- E-mail SMTP: `SMTP_HOST/PORT/USER/PASS/FROM`, `SMTP_TLS_REJECT_UNAUTHORIZED`.
- Cron: `CRON_SECRET`.

## Pendências pós-migração
- Validação runtime das escritas no Omie (1 caso controlado por operação antes de liberar acesso amplo).
- Ligar o scheduler externo nos crons após validação.
- Repontar/remover o card "Back Nova" do dashboard do Portal quando o cutover for confirmado.
