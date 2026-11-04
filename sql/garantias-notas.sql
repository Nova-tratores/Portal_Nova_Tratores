-- Garantias: notas fiscais vinculadas + checklist "reposta × paga" por peça.
-- Idempotente. Rodar no SQL Editor do Supabase do portal.
--
-- garantia_notas: vínculo garantia ↔ nota (decisão humana sobre a sugestão).
--   papel 'reembolso' = NFS-e que a Nova emite contra a montadora (notas_fiscais_docs.id);
--     uma NFS-e pode cobrir várias garantias (DRVG da Mahindra).
--   papel 'pecas'     = nota de ENTRADA da montadora com as peças repostas (CFOP x.949;
--     notas_entrada.id, e o doc do cache de PDF quando existir).
--   status 'vinculada' = confirmada; 'descartada' = "não é esta" (some das sugestões).
-- garantia_pecas.forma_reembolso: a fábrica REPÕE a peça ('reposta', chega numa nota
--   x.949, às vezes 4–5 meses depois) ou PAGA na NFS-e ('paga'). NULL = usa a sugestão.

create table if not exists public.garantia_notas (
  id            uuid primary key default gen_random_uuid(),
  garantia_id   uuid not null references public.garantias(id) on delete cascade,
  papel         text not null check (papel in ('reembolso', 'pecas')),
  doc_id        bigint,
  entrada_id    bigint,
  numero        text,
  data_emissao  date,
  valor         numeric(14,2),
  status        text not null default 'vinculada' check (status in ('vinculada', 'descartada')),
  origem        text not null default 'sugerida' check (origem in ('sugerida', 'manual')),
  criado_por    text,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint garantia_notas_tem_nota check (doc_id is not null or entrada_id is not null)
);

create unique index if not exists garantia_notas_unica
  on public.garantia_notas (garantia_id, papel, coalesce(doc_id, 0), coalesce(entrada_id, 0));
create index if not exists garantia_notas_doc on public.garantia_notas (doc_id) where doc_id is not null;

alter table public.garantia_notas enable row level security;
revoke all on public.garantia_notas from anon, authenticated;

alter table public.garantia_pecas add column if not exists forma_reembolso text;
alter table public.garantia_pecas drop constraint if exists garantia_pecas_forma_reembolso_check;
alter table public.garantia_pecas add constraint garantia_pecas_forma_reembolso_check
  check (forma_reembolso is null or forma_reembolso in ('reposta', 'paga'));

notify pgrst, 'reload schema';
