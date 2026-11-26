-- =====================================================================
-- Requisição: caixinha "FOI PAGO?" (José, 25/11/2026)
-- =====================================================================
-- Marcada no cartão da requisição. Com ela marcada, o PDF sai com o carimbo
-- verde PAGO no canto de cima, à direita. Guarda quem marcou e quando.
-- Rodar no Supabase (SQL Editor). Pode rodar de novo sem problema.
-- =====================================================================

ALTER TABLE "Requisicao" ADD COLUMN IF NOT EXISTS pago     boolean NOT NULL DEFAULT false;
ALTER TABLE "Requisicao" ADD COLUMN IF NOT EXISTS pago_em  timestamptz;
ALTER TABLE "Requisicao" ADD COLUMN IF NOT EXISTS pago_por text;
