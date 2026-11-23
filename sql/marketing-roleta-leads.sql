-- =====================================================================
-- MARKETING — quem gira a roleta vira lead da campanha (revisão da tela de campanha, 23/11/2026)
-- "A roleta teve 6 participantes, mas Leads = 0": o contato se perdia.
-- Gatilho no banco: toda inscrição numa roleta ligada a uma campanha (campanhas.acao_id) cria um lead nela;
-- quando o prêmio sai, o texto do lead é atualizado. Vale para qualquer caminho (site, teste, importação).
-- Também converte as inscrições que já existem (as 6 da Black Friday). Pode rodar mais de uma vez.
-- Rodar no Supabase: SQL Editor → colar tudo → Run.
-- =====================================================================

-- de onde o lead veio (a Fase 5 do plano usa a mesma coluna: site, feira, roleta, post, anúncio…)
alter table mkt_leads add column if not exists origem text;
-- liga o lead à inscrição da roleta (um lead por inscrição)
alter table mkt_leads add column if not exists participacao_id uuid references campanha_participacoes(id) on delete set null;
create unique index if not exists mkt_leads_participacao_uk on mkt_leads (participacao_id) where participacao_id is not null;

-- texto do lead montado da inscrição
create or replace function mkt_texto_lead_roleta(p campanha_participacoes) returns text
language sql immutable set search_path = public as $$
  select concat_ws(' · ',
    'Girou a roleta (' || case p.setor when 'posvendas' then 'Pós-vendas' when 'pecas' then 'Peças' when 'vendas' then 'Vendas' else p.setor end || ')',
    case when p.premio_nome is not null then 'ganhou: ' || p.premio_nome end,
    case when p.tem_trator then 'tem trator' || coalesce(' ' || p.modelo, '') else 'não tem trator' end,
    case when p.codigo is not null then 'código ' || p.codigo end)
$$;

create or replace function mkt_roleta_para_lead() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_acao uuid;
begin
  select acao_id into v_acao from campanhas where id = new.campanha_id;
  if v_acao is null then return new; end if;              -- roleta sem campanha: nada a fazer
  insert into mkt_leads (acao_id, texto, nome, cidade, interesse, qualificacao, origem, participacao_id, capturado_em, capturado_por_nome)
  values (v_acao, mkt_texto_lead_roleta(new), new.nome, new.cidade,
          case when new.tem_trator then coalesce('Tem ' || new.modelo, 'Tem trator') end,
          'novo', 'roleta', new.id, new.criado_em, 'Roleta do site')
  on conflict (participacao_id) where participacao_id is not null
  do update set texto = excluded.texto, nome = excluded.nome, cidade = excluded.cidade, interesse = excluded.interesse, atualizado_em = now();
  return new;
end $$;

drop trigger if exists trg_roleta_para_lead on campanha_participacoes;
create trigger trg_roleta_para_lead
  after insert or update of premio_nome, nome, cidade on campanha_participacoes
  for each row execute function mkt_roleta_para_lead();

-- converte as inscrições que já existem (só das roletas ligadas a uma campanha)
insert into mkt_leads (acao_id, texto, nome, cidade, interesse, qualificacao, origem, participacao_id, capturado_em, capturado_por_nome)
select c.acao_id, mkt_texto_lead_roleta(p), p.nome, p.cidade,
       case when p.tem_trator then coalesce('Tem ' || p.modelo, 'Tem trator') end,
       'novo', 'roleta', p.id, p.criado_em, 'Roleta do site'
  from campanha_participacoes p
  join campanhas c on c.id = p.campanha_id
 where c.acao_id is not null
on conflict (participacao_id) where participacao_id is not null do nothing;

notify pgrst, 'reload schema';

-- Desfazer (se precisar):
-- drop trigger if exists trg_roleta_para_lead on campanha_participacoes;
-- drop function if exists mkt_roleta_para_lead(); drop function if exists mkt_texto_lead_roleta(campanha_participacoes);
-- delete from mkt_leads where origem = 'roleta';
-- alter table mkt_leads drop column if exists participacao_id, drop column if exists origem;
