-- =============================================================================
-- QR DA GARANTIA POR TRATOR — LOTES de adesivos impressos antes de ter trator.
--
-- Rodar DEPOIS de sql/garantia-qr-tratores.sql. Idempotente.
--
-- O painel gera um lote (ex.: 100 códigos) SEM trator; a gráfica imprime.
-- Na entrega, a equipe lê o adesivo com o celular e liga o código ao trator
-- (/garantias/vincular?c=<código>). Código livre = chassis vazio.
-- =============================================================================

alter table public.garantia_qr_tratores alter column chassis drop not null;
alter table public.garantia_qr_tratores add column if not exists lote text check (char_length(lote) <= 40);
alter table public.garantia_qr_tratores add column if not exists vinculado_em timestamptz;
alter table public.garantia_qr_tratores add column if not exists vinculado_por text;

create index if not exists garantia_qr_tratores_lote_idx
  on public.garantia_qr_tratores (lote, criado_em);

notify pgrst, 'reload schema';
