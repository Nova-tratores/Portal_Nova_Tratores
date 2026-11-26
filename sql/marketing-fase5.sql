-- =====================================================================
-- MARKETING — Fase 5 do plano (funil único de leads), 23/11/2026
-- 5.1 Os pedidos do site (site_pedidos) passam a aparecer também como LEAD (mkt_leads, origem 'site'):
--     a tela Leads vira o funil único (site, roleta, feira, balcão, telefone…). A tela Pedidos continua
--     com os detalhes do financiamento. Lead não precisa mais de campanha (acao_id opcional).
-- 5.3 Hora da 1ª resposta (primeiro_contato_em) e marcador do alerta "lead sem resposta há 1 h".
-- Só acrescenta / afrouxa. Pode rodar mais de uma vez. Rodar no Supabase: SQL Editor → colar tudo → Run.
-- =====================================================================

alter table mkt_leads alter column acao_id drop not null;   -- lead do balcão/telefone/site não tem campanha
alter table mkt_leads add column if not exists origem text;                 -- (já criado pela roleta; aqui por garantia)
alter table mkt_leads add column if not exists pedido_id uuid references site_pedidos(id) on delete set null;
create unique index if not exists mkt_leads_pedido_uk on mkt_leads (pedido_id) where pedido_id is not null;
alter table mkt_leads add column if not exists primeiro_contato_em timestamptz;
alter table mkt_leads add column if not exists alerta_sem_resposta_em timestamptz;

-- 1ª resposta = quando o lead sai de "novo" pela primeira vez
create or replace function mkt_lead_primeiro_contato() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.qualificacao = 'novo' and new.qualificacao <> 'novo' and new.primeiro_contato_em is null then
    new.primeiro_contato_em := now();
  end if;
  return new;
end $$;
drop trigger if exists trg_lead_primeiro_contato on mkt_leads;
create trigger trg_lead_primeiro_contato before update of qualificacao on mkt_leads
  for each row execute function mkt_lead_primeiro_contato();

-- texto do lead montado do pedido do site
create or replace function mkt_texto_lead_pedido(p site_pedidos) returns text
language sql immutable set search_path = public as $$
  select concat_ws(' · ',
    'Pedido de proposta pelo site',
    case when p.interesse is not null then 'quer: ' || p.interesse end,
    case when p.linha is not null and p.linha <> 'nao-sei' then 'linha ' || p.linha end,
    case when p.valor is not null then 'financiar R$ ' || to_char(p.valor, 'FM999G999G990D00') end,
    case when p.usado then 'tem usado na troca' end,
    nullif(trim(p.obs), ''))
$$;

-- pedido novo do site → lead (e a situação do pedido acompanha no lead)
create or replace function mkt_pedido_para_lead() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into mkt_leads (acao_id, texto, nome, telefone, cidade, interesse, qualificacao, origem, pedido_id, capturado_em, capturado_por_nome, responsavel_nome)
  values (null, mkt_texto_lead_pedido(new), new.nome, new.telefone, new.cidade, new.interesse,
          new.status, 'site', new.id, new.criado_em, 'Site (pedido de proposta)', new.responsavel_nome)
  on conflict (pedido_id) where pedido_id is not null
  do update set
    -- o pedido não tem "qualificado": "em contato" vindo do pedido não rebaixa um lead já qualificado
    qualificacao = case when excluded.qualificacao = 'em_contato' and mkt_leads.qualificacao = 'qualificado' then mkt_leads.qualificacao else excluded.qualificacao end,
    responsavel_nome = coalesce(excluded.responsavel_nome, mkt_leads.responsavel_nome), atualizado_em = now()
   where (mkt_leads.qualificacao is distinct from excluded.qualificacao and not (excluded.qualificacao = 'em_contato' and mkt_leads.qualificacao = 'qualificado'))
      or mkt_leads.responsavel_nome is distinct from excluded.responsavel_nome;
  return new;
end $$;
drop trigger if exists trg_pedido_para_lead on site_pedidos;
create trigger trg_pedido_para_lead after insert or update of status, responsavel_nome on site_pedidos
  for each row execute function mkt_pedido_para_lead();

-- pedidos que já existem viram lead
insert into mkt_leads (acao_id, texto, nome, telefone, cidade, interesse, qualificacao, origem, pedido_id, capturado_em, capturado_por_nome, responsavel_nome)
select null, mkt_texto_lead_pedido(p), p.nome, p.telefone, p.cidade, p.interesse, p.status, 'site', p.id, p.criado_em, 'Site (pedido de proposta)', p.responsavel_nome
  from site_pedidos p
on conflict (pedido_id) where pedido_id is not null do nothing;

-- leads antigos da roleta/feira: marca a origem que faltava
update mkt_leads set origem = 'feira' where origem is null and acao_id is not null;

notify pgrst, 'reload schema';

-- Desfazer (se precisar):
-- drop trigger if exists trg_pedido_para_lead on site_pedidos; drop function if exists mkt_pedido_para_lead();
-- drop function if exists mkt_texto_lead_pedido(site_pedidos);
-- drop trigger if exists trg_lead_primeiro_contato on mkt_leads; drop function if exists mkt_lead_primeiro_contato();
-- delete from mkt_leads where origem = 'site' and pedido_id is not null;
-- (acao_id volta a ser obrigatório só se não houver lead sem campanha)
