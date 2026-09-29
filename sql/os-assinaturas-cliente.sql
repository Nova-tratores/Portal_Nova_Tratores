-- Assinatura do cliente por OS (qualquer tipo de serviço): link público por
-- token, assinatura em PNG no bucket "revisoes" (cheques/<os_id>/...), com
-- prova (nome, data/hora, IP, GPS, aparelho). A OS de revisão espelha a
-- assinatura no cheque (revisao_cheques). RLS ON sem policy: só /api.
create table if not exists public.os_assinaturas_cliente (
  id                   uuid primary key default gen_random_uuid(),
  os_id                text not null unique,           -- Ordem_Servico.Id_Ordem
  token                text not null unique,
  assinatura_url       text,
  assinado_em          timestamptz,
  assinado_nome        text,
  assinado_ip          text,
  assinado_geo         jsonb,                          -- {lat, lng, precisao_m, obtido_em}
  assinado_dispositivo jsonb,                          -- {modelo, plataforma, versao, ua, tela}
  criado_por           text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

alter table public.os_assinaturas_cliente enable row level security;

create or replace function public.os_assinaturas_cliente_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists tg_os_assinaturas_cliente_touch on public.os_assinaturas_cliente;
create trigger tg_os_assinaturas_cliente_touch before update on public.os_assinaturas_cliente
  for each row execute function public.os_assinaturas_cliente_touch();

notify pgrst, 'reload schema';
