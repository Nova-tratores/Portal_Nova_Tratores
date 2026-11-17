-- Requisição só vai ao Diretor se estiver completa (José, 17/11/2026). Rodar no projeto citrhumdkfivdzbmayde (portal).
-- Substitui só a função do gatilho (o resto de sql/autorizacoes-requisicao.sql continua igual). Idempotente.
create or replace function req_autorizacao_trg() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r       portal_autorizacao_regras%rowtype;
  v       numeric;
  v_old   numeric;
  falta   text[];
  cnpj_os text;
  -- quem chama: o navegador vem como anon/authenticated; o servidor como service_role; SQL Editor sem JWT (null) conta como servidor.
  -- (current_user não serve: com security definer ele é sempre o dono da função)
  servidor boolean := coalesce(auth.role(), 'service_role') = 'service_role';
begin
  select * into r from portal_autorizacao_regras where assunto = 'requisicao_compra';
  if not found or not r.ativo then return new; end if;
  if coalesce(new.origem, '') = 'auto_alimentacao_os' then return new; end if;

  -- só o servidor decide (autorizar/recusar) e grava o valor autorizado
  if tg_op = 'UPDATE' and not servidor then
    if new.autorizacao_status in ('autorizada', 'recusada') and new.autorizacao_status is distinct from old.autorizacao_status then
      raise exception 'Só o Diretor ou um Dev autoriza a requisição #%', new.id using hint = 'REQ_AUTORIZACAO';
    end if;
    new.autorizacao_valor  := old.autorizacao_valor;
    new.autorizacao_por    := old.autorizacao_por;
    new.autorizacao_por_id := old.autorizacao_por_id;
    new.autorizacao_em     := old.autorizacao_em;
    new.autorizacao_obs    := old.autorizacao_obs;
  end if;

  if tg_op = 'INSERT' and not servidor then
    new.autorizacao_status := null; new.autorizacao_valor := null; new.autorizacao_por := null;
    new.autorizacao_por_id := null; new.autorizacao_em := null; new.autorizacao_obs := null;
  end if;

  -- trava (só para o navegador; o servidor move ao decidir):
  --   esperando/recusada não muda de fase — só lixeira, ou recusada → "pedir de novo" (volta para completa aguardando);
  --   as fases "completa" (Aguardando autorização) e "recusada" (Não autorizadas) são do sistema, ninguém arrasta para elas.
  if tg_op = 'UPDATE' and not servidor and new.status is distinct from old.status and coalesce(new.status, '') <> 'lixeira' then
    if old.autorizacao_status = 'aguardando'
       or (old.autorizacao_status = 'recusada' and not (new.autorizacao_status = 'aguardando' and new.status = 'completa')) then
      raise exception 'A requisição #% está esperando a autorização do Diretor e não pode mudar de fase', new.id using hint = 'REQ_AUTORIZACAO';
    end if;
    if new.status = 'recusada' or (new.status = 'completa' and coalesce(new.autorizacao_status, '') <> 'aguardando') then
      raise exception 'A fase de autorização é automática (requisição #%)', new.id using hint = 'REQ_AUTORIZACAO';
    end if;
  end if;

  v := req_valor_num(new.valor_despeza);
  v_old := case when tg_op = 'UPDATE' then req_valor_num(old.valor_despeza) else null end;

  if coalesce(new.status, '') = 'lixeira' then
    null; -- na lixeira não pede nada
  elsif v >= r.limite and r.limite > 0
        and (tg_op = 'INSERT' or v is distinct from v_old)
        -- tolerância de 10% sobre o autorizado (frete, reajuste) — José, 17/11/2026
        and (new.autorizacao_valor is null or v > new.autorizacao_valor * 1.10) then
    if coalesce(new.autorizacao_status, '') <> 'aguardando' then
      new.autorizacao_status := 'aguardando';
      new.autorizacao_pedida_em := now();
    end if;
  elsif v < r.limite and new.autorizacao_status in ('aguardando', 'recusada') then
    -- baixou o valor para menos do limite: não precisa mais e sai da fase de autorização
    new.autorizacao_status := null;
    new.autorizacao_pedida_em := null;
    if new.status in ('completa', 'recusada') then new.status := 'pedido'; end if;
  end if;

  -- esperando autorização = fase "Aguardando autorização" (status completa) enquanto estiver aberta
  if new.autorizacao_status = 'aguardando' and coalesce(new.status, 'pedido') in ('pedido', 'completa', 'aguardando', 'recusada', '') then
    new.status := 'completa';
  end if;

  -- para ir ao Diretor a requisição tem que estar completa (José, 17/11/2026): o que, onde, valor, quem pede,
  -- para quem; se for para cliente, a OS, o cliente com CPF/CNPJ, o projeto/trator e a OS ser desse cliente
  if new.autorizacao_status = 'aguardando'
     and (tg_op = 'INSERT' or old.autorizacao_status is distinct from 'aguardando') then
    falta := array_remove(array[
      case when coalesce(btrim(new.titulo), '') = '' then 'o que é (título)' end,
      case when coalesce(btrim(new.fornecedor), '') = '' then 'onde comprar (fornecedor)' end,
      case when coalesce(btrim(new.solicitante), '') = '' then 'quem pede' end,
      case when coalesce(btrim(new.setor), '') = '' then 'para quem (setor destino)' end,
      case when new.setor = 'Trator-Cliente' and coalesce(btrim(new.ordem_servico), '') = '' then 'a OS' end,
      case when new.setor = 'Trator-Cliente' and (coalesce(btrim(new.cliente), '') = '' or regexp_replace(coalesce(new.cliente_cnpj, ''), '\D', '', 'g') = '')
           then 'o cliente escolhido do cadastro (com CPF/CNPJ)' end,
      case when new.setor = 'Trator-Cliente' and coalesce(btrim(new.projeto_codigo), '') = '' and coalesce(btrim(new."Chassis_Modelo"), '') = ''
           then 'o projeto / trator' end
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

  -- avisa o Diretor e os Devs quando entra na fila
  if new.autorizacao_status = 'aguardando'
     and (tg_op = 'INSERT' or old.autorizacao_status is distinct from 'aguardando') then
    insert into portal_notificacoes (user_id, tipo, titulo, descricao, link)
    select p.user_id, 'requisicao',
           'Requisição #' || coalesce(new.id::text, '') || ' de R$ ' || replace(to_char(v, 'FM999999990.00'), '.', ',') ||' para autorizar',
           coalesce(new.titulo, '') || coalesce(' — ' || nullif(new.solicitante, ''), '') || coalesce(' · ' || nullif(new.autorizacao_motivo, ''), ''),
           '/empresa?area=autorizacoes'
      from portal_permissoes p
     where (p.is_diretor is true or p.is_dev is true
            -- quem recebeu "Autorizar requisições" na Visão da empresa (Admin) também é avisado (17/11/2026)
            or 'empresa:autorizar-requisicoes' = any(coalesce(p.modulos_permitidos, '{}')))
       and p.user_id is not null;
  end if;

  return new;
end $$;
