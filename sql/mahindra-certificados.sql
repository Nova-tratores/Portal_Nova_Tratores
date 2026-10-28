-- Certificados de garantia do portal de concessionárias da Mahindra (aba "Garantia"), espelhados
-- pelo robô do portal (lib/mahindra/portal-dealer-server.ts). Traz a DATA DA ENTREGA TÉCNICA: é dela
-- que a loja conta a entrega do trator (30/60/90 dias, revisões, previsão da 300 h) — José, 27/10/2026.
-- Escrita só pelo servidor (service role); RLS ligado sem policy.
-- Projeto Supabase: portal (citrhumdk…).
create table if not exists public.mahindra_certificados (
  item_id integer primary key,
  chassi text not null,
  status text,
  modelo text,
  rodagem text,
  motor text,
  bomba_injetora text,
  nf_mahindra text,
  horas_entrega numeric,
  bateria_serie text,
  bateria_marca text,
  proprietario text,
  documento text,
  telefone text,
  email text,
  cep text,
  endereco text,
  numero text,
  complemento text,
  cidade text,
  estado text,
  concessionaria text,
  entrega_tecnica boolean,
  responsavel_tecnico text,
  data_entrega date,
  nf_concessionaria text,
  data_nf_concessionaria date,
  banco text,
  linha_credito text,
  documentos jsonb not null default '[]'::jsonb,
  criado_no_portal text,
  sincronizado_em timestamptz not null default now()
);
create index if not exists mahindra_certificados_chassi on public.mahindra_certificados (chassi);

alter table public.mahindra_certificados enable row level security;
revoke all on public.mahindra_certificados from anon, authenticated;

notify pgrst, 'reload schema';
