-- Autorização: a requisição de R$ 200+ NÃO é barrada (José, 17/11/2026: "não bloqueia, só não deixa passar de
-- aguardando autorização, aí espera o usuário pedir a autorização, senão não libera para as outras fases").
-- Novo estado autorizacao_status = falta_pedir: entra na fase "Aguardando autorização" (status completa), pode editar
-- à vontade, NÃO avisa ninguém e NÃO cobra informação. Quando a pessoa clica "Pedir autorização" vira aguardando
-- (aí confere se está completa e avisa os escolhidos). Rodar no projeto citrhumdkfivdzbmayde (portal). Versão ATUAL.
alter table "Requisicao" add column if not exists autorizacao_para uuid[];

create or replace function req_autorizacao_trg() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r portal_autorizacao_regras%rowtype; v numeric; v_old numeric; falta text[]; cnpj_os text;
  servidor boolean := coalesce(auth.role(), 'service_role') = 'service_role';
begin
  select * into r from portal_autorizacao_regras where assunto = 'requisicao_compra';
  if not found or not r.ativo then return new; end if;
  if coalesce(new.origem, '') = 'auto_alimentacao_os' then return new; end if;

  if tg_op = 'UPDATE' and not servidor then
    if new.autorizacao_status in ('autorizada', 'recusada') and new.autorizacao_status is distinct from old.autorizacao_status then
      raise exception 'Só o Diretor ou um Dev autoriza a requisição #%', new.id using hint = 'REQ_AUTORIZACAO';
    end if;
    new.autorizacao_valor := old.autorizacao_valor; new.autorizacao_por := old.autorizacao_por;
    new.autorizacao_por_id := old.autorizacao_por_id; new.autorizacao_em := old.autorizacao_em; new.autorizacao_obs := old.autorizacao_obs;
  end if;
  if tg_op = 'INSERT' and not servidor then
    if coalesce(new.autorizacao_status, '') <> 'aguardando' then new.autorizacao_status := null; end if;
    new.autorizacao_valor := null; new.autorizacao_por := null;
    new.autorizacao_por_id := null; new.autorizacao_em := null; new.autorizacao_obs := null;
  end if;

  if tg_op = 'UPDATE' and not servidor and new.status is distinct from old.status and coalesce(new.status, '') <> 'lixeira' then
    if old.autorizacao_status in ('aguardando', 'falta_pedir')
       or (old.autorizacao_status = 'recusada' and not (new.autorizacao_status = 'aguardando' and new.status = 'completa')) then
      raise exception 'A requisição #% precisa da autorização (peça no cartão) antes de mudar de fase', new.id using hint = 'REQ_AUTORIZACAO';
    end if;
    if new.status = 'recusada' or (new.status = 'completa' and coalesce(new.autorizacao_status, '') not in ('aguardando', 'falta_pedir')) then
      raise exception 'A fase de autorização é automática (requisição #%)', new.id using hint = 'REQ_AUTORIZACAO';
    end if;
  end if;

  v := req_valor_num(new.valor_despeza);
  v_old := case when tg_op = 'UPDATE' then req_valor_num(old.valor_despeza) else null end;
  if coalesce(new.status, '') = 'lixeira' then
    null;
  elsif v >= r.limite and r.limite > 0 and (tg_op = 'INSERT' or v is distinct from v_old)
        and (new.autorizacao_valor is null or v > new.autorizacao_valor * 1.10) then
    if coalesce(new.autorizacao_status, '') not in ('aguardando', 'falta_pedir') then
      new.autorizacao_status := 'falta_pedir'; new.autorizacao_pedida_em := null;
    end if;
  elsif v < r.limite and new.autorizacao_status in ('aguardando', 'recusada', 'falta_pedir') then
    new.autorizacao_status := null; new.autorizacao_pedida_em := null;
    if new.status in ('completa', 'recusada') then new.status := 'pedido'; end if;
  end if;
  if new.autorizacao_status in ('aguardando', 'falta_pedir') and coalesce(new.status, 'pedido') in ('pedido', 'completa', 'aguardando', 'recusada', '') then
    new.status := 'completa';
  end if;

  if new.autorizacao_status = 'aguardando' and (tg_op = 'INSERT' or old.autorizacao_status is distinct from 'aguardando') then
    new.autorizacao_pedida_em := now();
    falta := array_remove(array[
      case when coalesce(btrim(new.titulo), '') = '' then 'o que é (título)' end,
      case when coalesce(btrim(new.fornecedor), '') = '' then 'onde comprar (fornecedor)' end,
      case when coalesce(btrim(new.solicitante), '') = '' then 'quem pede' end,
      case when coalesce(btrim(new.setor), '') = '' then 'para quem (setor destino)' end,
      case when new.setor = 'Trator-Cliente' and coalesce(btrim(new.ordem_servico), '') = '' then 'a OS' end,
      case when new.setor = 'Trator-Cliente' and (coalesce(btrim(new.cliente), '') = '' or regexp_replace(coalesce(new.cliente_cnpj, ''), '\D', '', 'g') = '') then 'o cliente escolhido do cadastro (com CPF/CNPJ)' end,
      case when new.setor = 'Trator-Cliente' and coalesce(btrim(new.projeto_codigo), '') = '' and coalesce(btrim(new."Chassis_Modelo"), '') = '' then 'o projeto / trator' end
    ], null);
    if new.setor = 'Trator-Cliente' and coalesce(btrim(new.ordem_servico), '') <> '' and regexp_replace(coalesce(new.cliente_cnpj, ''), '\D', '', 'g') <> '' then
      select regexp_replace(coalesce(o."Cnpj_Cliente", ''), '\D', '', 'g') into cnpj_os from "Ordem_Servico" o where o."Id_Ordem" = new.ordem_servico limit 1;
      if coalesce(cnpj_os, '') <> '' and cnpj_os <> regexp_replace(new.cliente_cnpj, '\D', '', 'g') then
        falta := falta || 'a OS é de outro cliente (confira a OS e o cliente)';
      end if;
    end if;
    if coalesce(array_length(falta, 1), 0) > 0 then
      raise exception 'Para pedir a autorização do Diretor falta: %', array_to_string(falta, ', ') using hint = 'REQ_AUTORIZACAO';
    end if;
  end if;

  -- aviso: quando entra na fila ou quando trocam para quem foi pedido; só os escolhidos (vazio = todos que autorizam)
  if new.autorizacao_status = 'aguardando'
     and (tg_op = 'INSERT' or old.autorizacao_status is distinct from 'aguardando' or new.autorizacao_para is distinct from old.autorizacao_para) then
    insert into portal_notificacoes (user_id, tipo, titulo, descricao, link)
    select p.user_id, 'requisicao',
           'Requisição #' || coalesce(new.id::text, '') || ' de R$ ' || replace(to_char(v, 'FM999999990.00'), '.', ',') || ' para autorizar',
           coalesce(new.titulo, '') || coalesce(' — ' || nullif(new.solicitante, ''), '') || coalesce(' · ' || nullif(new.autorizacao_motivo, ''), ''),
           '/empresa?area=autorizacoes'
      from portal_permissoes p
     where p.user_id is not null
       and case when coalesce(cardinality(new.autorizacao_para), 0) > 0
                then p.user_id = any(new.autorizacao_para)
                else (p.is_diretor is true or p.is_dev is true or 'empresa:autorizar-requisicoes' = any(coalesce(p.modulos_permitidos, '{}')))
           end;
  end if;
  return new;
end $$;
