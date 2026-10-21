-- Senha do cartão Veloe fora do cadastro do veículo (21/10/2026).
-- Antes: frota_veiculos.senha_cartao_veloe, legível por qualquer um com a Frota
-- (inclusive direto pelo navegador). Agora: tabela fechada (RLS sem policy),
-- lida só pela rota /api/frota/veiculos/[placa]/senha-veloe, que registra no
-- audit_log quem viu (acao 'ver_senha_veloe') e quem alterou.
create table if not exists public.frota_veiculo_segredos (
  veiculo_id uuid primary key references public.frota_veiculos(id) on delete cascade,
  senha_cartao_veloe text,
  atualizado_em timestamptz not null default now(),
  atualizado_por text
);
alter table public.frota_veiculo_segredos enable row level security;
revoke all on public.frota_veiculo_segredos from anon, authenticated;

-- copia as senhas que existem e apaga do cadastro (a coluna fica, vazia, para
-- não quebrar quem faz select('*'))
insert into public.frota_veiculo_segredos (veiculo_id, senha_cartao_veloe, atualizado_por)
select id, senha_cartao_veloe, 'migração'
from public.frota_veiculos
where coalesce(senha_cartao_veloe, '') <> ''
on conflict (veiculo_id) do update set senha_cartao_veloe = excluded.senha_cartao_veloe;

update public.frota_veiculos set senha_cartao_veloe = null where senha_cartao_veloe is not null;

notify pgrst, 'reload schema';
