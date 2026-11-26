-- Ficha do vendedor = planilha "Acompanhamento de Visita" (pedido do José, 26/11/2026)
-- Campos novos: endereço, como chegou ("vinda de"), data do fechamento e a PROPOSTA
-- (crédito já existia; parcela, prazo, embutido %, lance com recurso próprio, prazo de contemplação, observações).
-- Pode rodar mais de uma vez.

alter table consorcio_inscricoes add column if not exists endereco text;
alter table consorcio_inscricoes add column if not exists vinda_de text;
alter table consorcio_inscricoes add column if not exists fechamento_data date;
alter table consorcio_inscricoes add column if not exists parcela numeric;
alter table consorcio_inscricoes add column if not exists prazo_meses int;
alter table consorcio_inscricoes add column if not exists embutido_pct numeric;
alter table consorcio_inscricoes add column if not exists lance_proprio numeric;
alter table consorcio_inscricoes add column if not exists prazo_contemplacao text;
alter table consorcio_inscricoes add column if not exists proposta_obs text;

-- Inscrever: mesma função (mesma assinatura), agora gravando os campos novos que vêm em p_extra
create or replace function consorcio_inscrever(
  p_evento uuid, p_nome text, p_telefone text, p_cidade text, p_interesse text,
  p_credito numeric, p_tem_trator boolean, p_aceite boolean, p_vendedor text,
  p_origem text default null, p_utm jsonb default null,
  p_extra jsonb default null   -- ficha do vendedor (temperatura, retorno, observação, proposta…)
) returns table (o_numero int, o_ja_inscrito boolean)
language plpgsql set search_path = public as $$
declare v_tel text := regexp_replace(coalesce(p_telefone, ''), '[^0-9]', '', 'g'); v_num int;
begin
  perform pg_advisory_xact_lock(hashtext('consorcio:' || p_evento::text));
  select i.numero into v_num from consorcio_inscricoes i where i.evento_id = p_evento and i.telefone_norm = v_tel;
  if found then
    -- já cadastrado: mantém o número; o que o vendedor preencheu agora atualiza a ficha (sem apagar o que já havia)
    update consorcio_inscricoes i set
      cidade             = coalesce(nullif(trim(p_cidade), ''), i.cidade),
      interesse          = coalesce(nullif(trim(p_interesse), ''), i.interesse),
      credito            = coalesce(p_credito, i.credito),
      tem_trator         = coalesce(p_tem_trator, i.tem_trator),
      vendedor           = coalesce(nullif(trim(p_vendedor), ''), i.vendedor),
      temperatura        = coalesce(nullif(p_extra->>'temperatura', ''), i.temperatura),
      usado_para_lance   = coalesce((p_extra->>'usado_para_lance')::boolean, i.usado_para_lance),
      usado_descricao    = coalesce(nullif(trim(p_extra->>'usado_descricao'), ''), i.usado_descricao),
      proximo_passo      = coalesce(nullif(trim(p_extra->>'proximo_passo'), ''), i.proximo_passo),
      proximo_passo_data = coalesce(nullif(p_extra->>'proximo_passo_data', '')::date, i.proximo_passo_data),
      observacao         = coalesce(nullif(trim(p_extra->>'observacao'), ''), i.observacao),
      endereco           = coalesce(nullif(trim(p_extra->>'endereco'), ''), i.endereco),
      vinda_de           = coalesce(nullif(trim(p_extra->>'vinda_de'), ''), i.vinda_de),
      fechamento_data    = coalesce(nullif(p_extra->>'fechamento_data', '')::date, i.fechamento_data),
      parcela            = coalesce((p_extra->>'parcela')::numeric, i.parcela),
      prazo_meses        = coalesce((p_extra->>'prazo_meses')::int, i.prazo_meses),
      embutido_pct       = coalesce((p_extra->>'embutido_pct')::numeric, i.embutido_pct),
      lance_proprio      = coalesce((p_extra->>'lance_proprio')::numeric, i.lance_proprio),
      prazo_contemplacao = coalesce(nullif(trim(p_extra->>'prazo_contemplacao'), ''), i.prazo_contemplacao),
      proposta_obs       = coalesce(nullif(trim(p_extra->>'proposta_obs'), ''), i.proposta_obs)
     where i.evento_id = p_evento and i.telefone_norm = v_tel;
    return query select v_num, true;
    return;
  end if;
  select coalesce(max(i.numero), 0) + 1 into v_num from consorcio_inscricoes i where i.evento_id = p_evento;
  insert into consorcio_inscricoes (evento_id, numero, nome, telefone, cidade, interesse, credito, tem_trator, aceite_lgpd, vendedor, origem, utm,
                                    temperatura, usado_para_lance, usado_descricao, proximo_passo, proximo_passo_data, observacao,
                                    endereco, vinda_de, fechamento_data, parcela, prazo_meses, embutido_pct, lance_proprio, prazo_contemplacao, proposta_obs)
  values (p_evento, v_num, trim(p_nome), trim(p_telefone), nullif(trim(p_cidade), ''), nullif(trim(p_interesse), ''),
          p_credito, p_tem_trator, coalesce(p_aceite, false), nullif(trim(p_vendedor), ''), nullif(trim(p_origem), ''), p_utm,
          nullif(p_extra->>'temperatura', ''), (p_extra->>'usado_para_lance')::boolean, nullif(trim(p_extra->>'usado_descricao'), ''),
          nullif(trim(p_extra->>'proximo_passo'), ''), nullif(p_extra->>'proximo_passo_data', '')::date, nullif(trim(p_extra->>'observacao'), ''),
          nullif(trim(p_extra->>'endereco'), ''), nullif(trim(p_extra->>'vinda_de'), ''), nullif(p_extra->>'fechamento_data', '')::date,
          (p_extra->>'parcela')::numeric, (p_extra->>'prazo_meses')::int, (p_extra->>'embutido_pct')::numeric, (p_extra->>'lance_proprio')::numeric,
          nullif(trim(p_extra->>'prazo_contemplacao'), ''), nullif(trim(p_extra->>'proposta_obs'), ''));
  return query select v_num, false;
end $$;
revoke all on function consorcio_inscrever(uuid, text, text, text, text, numeric, boolean, boolean, text, text, jsonb, jsonb) from public, anon, authenticated;

-- Cadastro vira lead: o texto do lead agora leva também endereço, como chegou e a proposta
create or replace function consorcio_inscricao_para_lead() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_ev consorcio_eventos; v_lead uuid;
begin
  select * into v_ev from consorcio_eventos where id = new.evento_id;
  insert into mkt_leads (acao_id, texto, nome, telefone, cidade, interesse, qualificacao, origem, capturado_em, capturado_por_nome,
                         temperatura, proximo_contato, responsavel_nome, observacoes)
  values (
    v_ev.acao_id,
    concat_ws(' · ',
      'Consórcio no evento ' || v_ev.nome,
      'nº da sorte ' || lpad(new.numero::text, 3, '0'),
      case when new.vinda_de is not null then 'chegou por: ' || new.vinda_de end,
      case when new.endereco is not null then 'endereço: ' || new.endereco end,
      case when new.credito is not null then 'crédito de R$ ' || to_char(new.credito, 'FM999G999G990D00') end,
      case when new.parcela is not null then 'parcela R$ ' || to_char(new.parcela, 'FM999G999G990D00') || coalesce(' em ' || new.prazo_meses || ' meses', '') end,
      case when new.embutido_pct is not null then 'embutido ' || new.embutido_pct || '%' end,
      case when new.lance_proprio is not null then 'lance próprio R$ ' || to_char(new.lance_proprio, 'FM999G999G990D00') end,
      case when new.prazo_contemplacao is not null then 'contemplação prevista: ' || new.prazo_contemplacao end,
      case when new.tem_trator is true then 'já tem trator' when new.tem_trator is false then 'ainda não tem trator' end,
      case when new.usado_para_lance is true then 'tem usado para lance' || coalesce(' (' || new.usado_descricao || ')', '') end,
      case when new.proximo_passo is not null then 'retorno: ' || new.proximo_passo || coalesce(' em ' || to_char(new.proximo_passo_data, 'DD/MM'), '') end,
      case when new.fechamento_data is not null then 'fechou em ' || to_char(new.fechamento_data, 'DD/MM/YYYY') end,
      case when new.origem is not null then 'veio por: ' || new.origem end),
    new.nome, new.telefone, new.cidade, new.interesse, 'novo', 'feira', new.criado_em,
    coalesce('Estande: ' || nullif(trim(new.vendedor), ''), 'Página do consórcio (QR code)'),
    new.temperatura, new.proximo_passo_data, nullif(trim(new.vendedor), ''),
    nullif(concat_ws(E'\n', new.observacao, case when new.proposta_obs is not null then 'Proposta: ' || new.proposta_obs end), ''))
  returning id into v_lead;
  new.lead_id := v_lead;
  return new;
end $$;
