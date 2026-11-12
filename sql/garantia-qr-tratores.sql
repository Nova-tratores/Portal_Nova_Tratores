-- =============================================================================
-- QR DA GARANTIA POR TRATOR (adesivo de 30 × 30 mm).
--
-- Cada trator ganha UM código curto e aleatório (6 letras/números sem os que
-- se confundem). Todas as cópias do adesivo daquele trator levam o mesmo código.
-- O QR abre HTTPS://PORTAL.NOVATRATORES.COM/GARANTIA/<código>: a página pública
-- da garantia já aparece com o modelo, a data de entrega e as revisões dele.
--
-- O código NÃO é o chassi de propósito: não dá para adivinhar o de outro trator.
-- Escrita e leitura só pelo servidor (service role): RLS ligada sem policy.
-- Rodar no SQL Editor do Supabase. Idempotente.
-- =============================================================================

create table if not exists public.garantia_qr_tratores (
  codigo        text primary key check (codigo ~ '^[234679ACDEFGHJKMNPQRTUVWXY]{6}$'),
  chassis       text not null unique check (char_length(chassis) between 4 and 40),
  criado_em     timestamptz not null default now(),
  criado_por    text,
  baixado_em    timestamptz,
  downloads     integer not null default 0
);

alter table public.garantia_qr_tratores enable row level security;
revoke all on public.garantia_qr_tratores from anon, authenticated;

-- Leitura do adesivo vira evento do painel (valor = código).
alter table public.garantia_cliente_eventos drop constraint if exists garantia_cliente_eventos_tipo_check;
alter table public.garantia_cliente_eventos add constraint garantia_cliente_eventos_tipo_check check (tipo in (
  'visita', 'pergunta_rapida', 'faq', 'busca', 'busca_sem_resultado',
  'whatsapp', 'consulta_trator', 'duvida_enviada', 'salvou_celular', 'qr_trator'));
create index if not exists garantia_cliente_eventos_qr_idx
  on public.garantia_cliente_eventos (valor) where tipo = 'qr_trator';

notify pgrst, 'reload schema';
