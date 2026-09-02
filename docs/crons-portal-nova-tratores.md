# Crons/Syncs do Portal Nova Tratores — para avaliação de ritmo

## Contexto técnico (importante para decidir o ritmo)
- **Portal**: Next.js hospedado no **Railway** (não tem cron nativo). Por isso os agendamentos são
  **GitHub Actions** que fazem um `curl` HTTP para uma rota `/api/.../cron/...` do portal (com header
  `Authorization: Bearer CRON_SECRET`). Cada rota executa o trabalho no servidor do portal.
- **Fuso**: os `cron:` são em **UTC**. Brasil (BRT) = **UTC − 3**. Abaixo mostro os dois.
- **Todos rodam de uma única origem** (o runner do GitHub Actions), então compartilham IP para efeitos
  de rate limit externo. As chaves de API externas (Omie NOVA/CASTRO) também são compartilhadas com
  ações manuais no portal.
- **Limites da API Omie** (por IP + App Key + Método): **4 req/s**, **240 req/min** por método
  (960/min por IP), **14.400/h**, **345.600/dia**, **4 simultâneas**, **100 registros/página**.
  🚨 **Bloqueio "consumo indevido" (HTTP 425)**: dispara após **10 requisições com ERRO** na mesma
  combinação IP+AppKey+Método e dura **30 min**; cada novo erro dentro da janela **reinicia/prorroga**.
  → O gargalo é **erro**, não velocidade.
- **Objetivo da avaliação**: sugerir um ritmo (frequência + horários) que mantenha os dados frescos o
  suficiente **sem** concentrar chamadas na Omie ao ponto de causar bloqueios, e deixando janelas
  livres para operações pontuais em massa (ex.: escrever "Tipo:" em ~4.000 produtos).

Legenda **Consome**: 🟠 Omie · 🚗 Rota Exata (telemetria frota) · 🏦 BCB (SELIC) · 🚙 Tabela FIPE ·
✉️ E-mail (Gmail/IMAP) · 🟦 Interno (só Supabase/portal). **Peso**: leve / médio / pesado.

---

## ESTOQUE — sincronização com a Omie (o grupo mais pesado na chave Omie)

| Cron | UTC (→ BRT) | Frequência | Consome | Peso | O que faz e sensibilidade |
|---|---|---|---|---|---|
| **estoque-sync-produtos** | `0 5` (02:00) | 1×/dia | 🟠 | pesado (40min) | Baixa o **cadastro completo** de produtos + estoque + gera snapshots mensais (por família e por Tipo). Base do /visual-estoque. Não precisa ser frequente — 1×/dia basta. |
| **estoque-sync-estoque** | `20 */3` (a cada 3h, :20) | 8×/dia | 🟠 | médio (20min) | Sync **rápido**: só atualiza saldo/CMC/valor das linhas já existentes. Mantém o saldo do pátio fresco entre os syncs completos. |
| **estoque-sync-incremental** | `5,35 9-23` (:05/:35, 06:05–20:35) | ~30×/dia | 🟠 | leve-médio (15min) | Puxa **vendas + OS do mês atual** (todas as contas) pra manter o dashboard "quente" em horário comercial. Alta frequência porque entram vendas o tempo todo de dia. |
| **estoque-sync-movimentos** | `20 5` (02:20) | 1×/dia | 🟠 | médio (10min) | Baixa o **livro-razão de movimentos** (`estoque_movimentos`) — usado para reconciliação e reconstrução histórica de estoque por Tipo. |
| **estoque-sync-compras** | `30 6` (03:30) | 1×/dia | 🟠 | médio (20min) | Sync incremental de **compras / notas de entrada**. |
| **estoque-sync-recebimentos** | `*/15 9-22` (a cada 15min, 06:00–19:45) | ~56×/dia | 🟠 | leve (15min) | Sync de **recebimentos NF-e**. Frequência muito alta em horário comercial. |
| **estoque-sync-remessas** | `15 7,16` (04:15 e 13:15) | 2×/dia | 🟠 | médio (30min) | Sync de **remessas** (máquinas em demonstração / Visual Estoque). |
| **estoque-backfill-cmc** | `45 5` (02:45) | 1×/dia | 🟠 | pesado (30min) | Recalcula/preenche o **CMC** (custo médio) dos produtos. |
| **estoque-enriquecer-notas** | `30 7` (04:30) | 1×/dia | 🟠 | médio (20min) | Enriquece as **notas de entrada** com emitente/categoria. |
| **estoque-snapshot-sugestao-compra** | `30 6` (03:30) | 1×/dia | 🟠/🟦 | leve (20min) | Congela o **snapshot da Sugestão de Compra** do dia. |
| **estoque-backfill-os-servicos** | `30 6` (03:30) | 1×/dia | 🟠 | pesado (60min) | Puxa **itens de serviço das OS** (backfill contínuo). |
| **estoque-sync-selic** | `30 10` (07:30) | 1×/dia | 🏦 | leve (10min) | Baixa a taxa **SELIC** do Banco Central (juros/financeiro). Não é Omie. |

> ⚠️ **Cluster pesado Omie**: 02:00–05:00 BRT (produtos, movimentos, cmc, compras, sugestão, os-serviços,
> prewarm, remessas, enriquecer) + os frequentes de dia (incremental :05/:35 e recebimentos */15).

---

## AJUSTES (Omie — estoque/negativos/classificação)

| Cron | UTC (→ BRT) | Frequência | Consome | Peso | O que faz |
|---|---|---|---|---|---|
| **ajustes-classificar-recebidos** | `0 8` e `0 13` (05:00 e 10:00) | 2×/dia | 🟠 | pesado (20min) | **Robô** que classifica produtos recém-recebidos (família Peças + abre tarefa). Faz bastante chamada Omie. |
| **ajustes-prewarm-recebimentos** | `0 7` (04:00) | 1×/dia | 🟠 | médio (30min) | Aquece o cache de **recebimentos pendentes** do dia. |
| **ajustes-scan-negativos** | `0 4` (01:00) | 1×/dia | 🟠/🟦 | leve (10min) | Varre **estoque negativo** e gera alertas. |
| **ajustes-sync-notas** | `40 */3` (a cada 3h, :40) | 8×/dia | 🟠 | leve-médio (15min) | Sync incremental de **notas de saída** (vendas). |

---

## DRE / FINANCEIRO

| Cron | UTC (→ BRT) | Frequência | Consome | Peso | O que faz |
|---|---|---|---|---|---|
| **dre-financeiro-sync** | `10 */3` (a cada 3h, :10) | 8×/dia | 🟠 | médio (15min) | Sync de **contas a pagar/receber** da Omie (financeiro). |
| **dre-financeiro-relatorio-lista** | `0 10 * * 1` (seg 07:00) | 1×/sem | ✉️/🟦 | leve | Gera e **envia por e-mail** o relatório semanal do DRE (Lista). |
| **financeiro-emails** | `0 12,16,20` (09/13/17h) | 3×/dia | ✉️ | leve | Lembretes de vencimento e respostas de e-mail do financeiro. |

---

## FROTA (telemetria — Rota Exata, não Omie)

| Cron | UTC (→ BRT) | Frequência | Consome | Peso | O que faz |
|---|---|---|---|---|---|
| **frota-sync-cadastro** | `10 6` (03:10) | 1×/dia | 🚗 | leve (15min) | Sync do **cadastro** de veículos (Rota Exata). |
| **frota-sync-eventos** | `0 9,21` (06:00 e 18:00) | 2×/dia | 🚗 | leve (15min) | Sync de **eventos** (multas / manutenções / custos). |
| **frota-fechar-dia** | `20 7` (04:20) | 1×/dia | 🚗/🟦 | médio (20min) | Fecha o dia dos veículos (ignição + paradas). |
| **frota-ocorrencias-auto** | `0 8` (05:00) | 1×/dia | 🚗/🟠 | leve (15min) | Gera ocorrências automáticas (multa/abastecimento/consumo). Abastecimento pode tocar Omie. |
| **frota-atualizar-fipe** | `30 8 5 * *` (dia 5, 05:30) | 1×/mês | 🚙 | leve (15min) | Atualiza o **valor FIPE** dos veículos. |

---

## COMERCIAL / ROTAS

| Cron | UTC (→ BRT) | Frequência | Consome | Peso | O que faz |
|---|---|---|---|---|---|
| **sync-rotas-comercial** | `0 7` (04:00) | 1×/dia | 🚗/🟦 | médio (30min) | Grava as **rotas dos carros** do comercial (dia anterior). |
| **supervisor-salvar-rotas** | `30 4` (01:30) | 1×/dia | 🚗/🟦 | leve (15min) | Salva as **rotas do supervisor** de vendas do dia. |

---

## POS / SERVIÇOS / CLIENTES

| Cron | UTC (→ BRT) | Frequência | Consome | Peso | O que faz |
|---|---|---|---|---|---|
| **pos-auto-fase** | `40 8` (05:40) | 1×/dia | 🟦 | leve (10min) | Transições automáticas de **fase das OS** (POS). |
| **sync-nfs** | `0 8,15,20` (05/12/17h) | 3×/dia | 🟠/🟦 | pesado (120min) | Baixa **NFs** para as pastas de clientes (job longo). |
| **clientes-relatorio-semanal** | `0 11 * * 5` (sex 08:00) | 1×/sem | ✉️/🟦 | leve | Relatório semanal de clientes (sem NF), por e-mail. |
| **carrinhos-auto-fechar** | `30 9` (06:30) | 1×/dia | 🟦 | leve | Fecha **carrinhos** (PPV) expirados. |

---

## GARANTIAS / TICKETS / PEÇAS / AVISOS / WAR ROOM (majoritariamente interno)

| Cron | UTC (→ BRT) | Frequência | Consome | Peso | O que faz |
|---|---|---|---|---|---|
| **garantias-devolucoes** | `0 11` (08:00) | 1×/dia | 🟦 | leve | Alerta de **prazo de devolução** de peças de garantia. |
| **garantias-emails** | `30 10` e `0 15` (07:30 e 12:00) | 2×/dia | ✉️ | leve | Lê **respostas da fábrica** por e-mail. |
| **tickets-auto-fechar** | `20 9` (06:20) | 1×/dia | 🟦 | leve | Fecha **tickets** resolvidos há 7 dias. |
| **pecas-abate** | `*/30 * * * *` (a cada 30min, 24h) | 48×/dia | 🟦 | leve | Dá **baixa** nas unidades de peça rastreadas por etiqueta. Única que roda de madrugada continuamente (mas é Supabase). |
| **avisos-publicar** | `*/15 9-23` (a cada 15min, 06:00–20:45) | ~60×/dia | 🟦 | leve | Publica **avisos** agendados. |
| **war-room-snapshot** | `0 9 * * 1` (seg 06:00) | 1×/sem | 🟦 | leve | Snapshot semanal do **War Room**. |

---

## Jobs de backfill SEM cron (rodam manualmente / workflow_dispatch)
- **estoque-backfill-historico** → `/api/estoque/cron/backfill-snapshot` (timeout 15min). Backfill pontual de snapshots.
- **estoque-backfill-noturno** → `/api/estoque/cron/backfill-snapshot` (timeout **350min**). Backfill histórico grande, uso pontual.

---

## Resumo para a avaliação de ritmo
- **Concentração Omie**: quase tudo que consome Omie está espremido em **02:00–05:00 BRT** (diários) e nos
  **frequentes de dia** (incremental a cada 30min, recebimentos a cada 15min, + trios a cada 3h nos
  minutos :10/:20/:40). À noite, entre **~21:45 e ~00:00 BRT** só rodam os trios a cada 3h (leves).
- **Perguntas para a outra IA**: (a) dá pra **espalhar** o cluster das 02:00–05:00 para reduzir picos
  simultâneos na chave Omie? (b) `sync-recebimentos` (a cada 15min) e `sync-incremental` (a cada 30min)
  precisam mesmo dessa frequência, ou dá pra afrouxar sem perder frescor útil? (c) qual a melhor
  **janela livre** para operações de escrita em massa na Omie (ex.: aplicar "Tipo:" em ~4.000 produtos)
  sem colidir com os syncs? (d) faz sentido consolidar syncs redundantes (estoque rápido + incremental)?
