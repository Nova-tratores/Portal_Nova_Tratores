-- Cheques de revisão Mahindra gerados pelo portal (um por OS de revisão).
-- Dados editáveis do cheque + link público por token (cliente assina pelo
-- celular) + assinaturas. RLS ON sem policy: tudo passa pelas rotas /api com
-- service role (padrão do questionário mkt_questionario_links).
create table if not exists public.revisao_cheques (
  id                      uuid primary key default gen_random_uuid(),
  os_id                   text not null unique,          -- Ordem_Servico.Id_Ordem (OS-0494)
  chassis                 text not null,
  horas                   int  not null,                 -- 50, 300, 600 ... 3000
  pagina                  int,                           -- página do talão (50h=15 ... 3000h=35)
  dados                   jsonb not null default '{}'::jsonb, -- campos do cheque (editáveis)
  token                   text not null unique,          -- link público (view + assinatura)
  assinatura_cliente_url  text,
  assinado_em             timestamptz,
  assinado_nome           text,
  assinado_ip             text,
  assinatura_tecnico_url  text,
  criado_por              text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists revisao_cheques_chassis_idx on public.revisao_cheques (chassis);

alter table public.revisao_cheques enable row level security;

create or replace function public.revisao_cheques_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists tg_revisao_cheques_touch on public.revisao_cheques;
create trigger tg_revisao_cheques_touch before update on public.revisao_cheques
  for each row execute function public.revisao_cheques_touch();

-- Bucket público onde ficam as assinaturas e PDFs: "revisoes" (já existe;
-- caminho cheques/<os_id>/...).
notify pgrst, 'reload schema';
