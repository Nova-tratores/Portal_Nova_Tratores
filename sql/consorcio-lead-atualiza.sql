-- Ficha do vendedor editada = lead da campanha atualizado (pedido do José, 26/11/2026:
-- "todos os leads têm que ir para os leads da campanha").
-- Antes: o lead nascia no cadastro (gatilho before insert), mas o "Editar cliente" só mudava a ficha.
-- Agora: um gatilho depois de cada atualização da ficha reescreve o lead — só os campos que MUDARAM na ficha,
-- para não apagar o que o Marketing anotou no lead (qualificação e status nunca são tocados).
-- Também (26/11): vendedor_id = o usuário do portal que fez a ficha (o vendedor agora entra com o perfil).
-- Pode rodar mais de uma vez.

alter table consorcio_inscricoes add column if not exists vendedor_id uuid;

-- o texto do lead num lugar só (cadastro e edição usam o mesmo)
create or replace function consorcio_texto_lead(i consorcio_inscricoes, p_evento text) returns text
language sql immutable as $$
  select concat_ws(' · ',
    'Consórcio no evento ' || p_evento,
    'nº da sorte ' || lpad(i.numero::text, 3, '0'),
    case when i.vinda_de is not null then 'chegou por: ' || i.vinda_de end,
    case when i.endereco is not null then 'endereço: ' || i.endereco end,
    case when i.credito is not null then 'crédito de R$ ' || to_char(i.credito, 'FM999G999G990D00') end,
    case when i.parcela is not null then 'parcela R$ ' || to_char(i.parcela, 'FM999G999G990D00') || coalesce(' em ' || i.prazo_meses || ' meses', '') end,
    case when i.embutido_pct is not null then 'embutido ' || i.embutido_pct || '%' end,
    case when i.lance_proprio is not null then 'lance próprio R$ ' || to_char(i.lance_proprio, 'FM999G999G990D00') end,
    case when i.prazo_contemplacao is not null then 'contemplação prevista: ' || i.prazo_contemplacao end,
    case when i.tem_trator is true then 'já tem trator' when i.tem_trator is false then 'ainda não tem trator' end,
    case when i.usado_para_lance is true then 'tem usado para lance' || coalesce(' (' || i.usado_descricao || ')', '') end,
    case when i.proximo_passo is not null then 'retorno: ' || i.proximo_passo || coalesce(' em ' || to_char(i.proximo_passo_data, 'DD/MM'), '') end,
    case when i.fechamento_data is not null then 'fechou em ' || to_char(i.fechamento_data, 'DD/MM/YYYY') end,
    case when i.origem is not null then 'veio por: ' || i.origem end)
$$;

create or replace function consorcio_obs_lead(i consorcio_inscricoes) returns text
language sql immutable as $$
  select nullif(concat_ws(E'\n', i.observacao, case when i.proposta_obs is not null then 'Proposta: ' || i.proposta_obs end), '')
$$;

-- cadastro novo: o mesmo de antes, agora usando as funções acima
create or replace function consorcio_inscricao_para_lead() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_ev consorcio_eventos; v_lead uuid;
begin
  select * into v_ev from consorcio_eventos where id = new.evento_id;
  insert into mkt_leads (acao_id, texto, nome, telefone, cidade, interesse, qualificacao, origem, capturado_em, capturado_por_nome,
                         temperatura, proximo_contato, responsavel_nome, observacoes)
  values (v_ev.acao_id, consorcio_texto_lead(new, v_ev.nome), new.nome, new.telefone, new.cidade, new.interesse, 'novo', 'feira', new.criado_em,
          coalesce('Estande: ' || nullif(trim(new.vendedor), ''), 'Página do consórcio (QR code)'),
          new.temperatura, new.proximo_passo_data, nullif(trim(new.vendedor), ''), consorcio_obs_lead(new))
  returning id into v_lead;
  new.lead_id := v_lead;
  return new;
end $$;

-- ficha editada: atualiza o lead (só o que mudou na ficha)
create or replace function consorcio_inscricao_atualiza_lead() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_ev consorcio_eventos;
begin
  if new.lead_id is null then return new; end if;
  select * into v_ev from consorcio_eventos where id = new.evento_id;
  update mkt_leads l set
    texto            = consorcio_texto_lead(new, v_ev.nome),
    nome             = case when new.nome        is distinct from old.nome        then new.nome        else l.nome end,
    cidade           = case when new.cidade      is distinct from old.cidade      then new.cidade      else l.cidade end,
    interesse        = case when new.interesse   is distinct from old.interesse   then new.interesse   else l.interesse end,
    temperatura      = case when new.temperatura is distinct from old.temperatura then new.temperatura else l.temperatura end,
    proximo_contato  = case when new.proximo_passo_data is distinct from old.proximo_passo_data then new.proximo_passo_data else l.proximo_contato end,
    responsavel_nome = case when new.vendedor    is distinct from old.vendedor    then nullif(trim(new.vendedor), '') else l.responsavel_nome end,
    capturado_por_id = case when new.vendedor_id is distinct from old.vendedor_id then new.vendedor_id else l.capturado_por_id end,
    capturado_por_nome = case when new.vendedor is distinct from old.vendedor and nullif(trim(new.vendedor), '') is not null
                              then 'Estande: ' || trim(new.vendedor) else l.capturado_por_nome end,
    observacoes      = case when new.observacao is distinct from old.observacao or new.proposta_obs is distinct from old.proposta_obs
                            then consorcio_obs_lead(new) else l.observacoes end
   where l.id = new.lead_id;
  return new;
end $$;

drop trigger if exists trg_consorcio_atualiza_lead on consorcio_inscricoes;
create trigger trg_consorcio_atualiza_lead after update on consorcio_inscricoes
  for each row when (old is distinct from new) execute function consorcio_inscricao_atualiza_lead();
