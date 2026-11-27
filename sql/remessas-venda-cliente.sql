-- Remessas: demonstração que vira venda NA CASA DO CLIENTE, sem a máquina voltar à loja (27/11/2026).
--
-- Fluxo (botão "Vendeu — fica com o cliente" na ficha da remessa de demonstração):
--   1. nota de entrada de volta SIMBÓLICA 1.913/2.913 (chave da remessa referenciada) → emitida
--   2. Pedido de Máquinas (PVM) criado a partir da PROPOSTA (obrigatória), com a máquina da remessa
--   3. remessa marcada "virou venda" com o nº do PVM
--   4. etapas que faltam do roteiro da OS da demonstração puladas ("vendida no cliente")
-- O andamento fica em remessas_vendas_cliente: se parar no meio, "Continuar" retoma da etapa gravada.
--
-- RLS ligado sem policy + REVOKE (tudo por /api/remessas com service role). Idempotente.
-- Rollback:
--   drop table if exists public.remessas_vendas_cliente;
--   alter table public.remessas_emissoes drop column if exists venda;
--   alter table public.pedidos_maquinas drop column if exists remessa_conta, drop column if exists remessa_id;

-- 1) o processo de venda no cliente (uma ativa por remessa)
create table if not exists public.remessas_vendas_cliente (
  id                  uuid primary key default gen_random_uuid(),
  conta_omie          text not null check (conta_omie in ('nova','castro')),
  id_remessa          bigint not null,                 -- a remessa de demonstração (5.912/6.912)
  proposta_id         bigint not null,                 -- "Formulario".id (sem FK, como em pedidos_maquinas)
  os_id               text,                            -- Ordem_Servico.Id_Ordem da demonstração (opcional)
  retorno_emissao_id  uuid,                            -- remessas_emissoes.id da volta simbólica
  pedido_maquina_id   bigint,                          -- pedidos_maquinas.id
  etapa               text not null default 'iniciada'
                      check (etapa in ('iniciada','volta_criada','volta_emitida','pedido_criado','concluida','cancelada')),
  erro                text,
  user_id             uuid,
  user_nome           text,
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now(),
  concluido_em        timestamptz
);
create unique index if not exists remessas_vendas_cliente_ativa_uk
  on public.remessas_vendas_cliente (conta_omie, id_remessa) where etapa <> 'cancelada';
create index if not exists remessas_vendas_cliente_pedido_idx
  on public.remessas_vendas_cliente (pedido_maquina_id);

alter table public.remessas_vendas_cliente enable row level security;
revoke all on public.remessas_vendas_cliente from anon, authenticated;

-- 2) a nota de volta feita por venda: ao emitir, a remessa vira "virou venda" (não "devolvida")
alter table public.remessas_emissoes add column if not exists venda boolean not null default false;

-- 3) o pedido de máquina sabe de qual demonstração veio
alter table public.pedidos_maquinas add column if not exists remessa_conta text
  check (remessa_conta is null or remessa_conta in ('nova','castro'));
alter table public.pedidos_maquinas add column if not exists remessa_id bigint;
create index if not exists pedidos_maquinas_remessa_idx on public.pedidos_maquinas (remessa_conta, remessa_id);

notify pgrst, 'reload schema';
