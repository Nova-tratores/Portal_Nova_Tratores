-- Recibos → Omie (José, 03/11/2026). Projeto Supabase do PORTAL (citrhumdk…). Rodar uma vez, depois de sql/recibos.sql.
-- Ao emitir com "Lançar no Omie": 'pagamos' vira conta a pagar já paga; 'recebemos' vira conta a receber já recebida.
-- Categoria e conta corrente são escolhidas na tela. Se o Omie falhar, o recibo fica emitido com omie_erro
-- e a lista Emitidos mostra "Tentar de novo" (o código de integração REC-… impede lançamento duplicado).

SET lock_timeout = '5s';

ALTER TABLE public.recibos
  ADD COLUMN IF NOT EXISTS omie_lancar            boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS omie_categoria         text,
  ADD COLUMN IF NOT EXISTS omie_categoria_nome    text,
  ADD COLUMN IF NOT EXISTS omie_conta_corrente    bigint,
  ADD COLUMN IF NOT EXISTS omie_conta_nome        text,
  ADD COLUMN IF NOT EXISTS omie_codigo_lancamento bigint,
  ADD COLUMN IF NOT EXISTS omie_baixado_em        timestamptz,
  ADD COLUMN IF NOT EXISTS omie_erro              text;
