-- TESTE da autorização (R$ 200) — NADA fica gravado: termina com um erro de propósito que desfaz tudo.
-- Rodar no projeto citrhumdkfivdzbmayde (portal), no SQL Editor (Ctrl+A antes de rodar). Versão "falta pedir" (17/11/2026).
select set_config('teste.res', '', false), set_config('teste.id', '', false);

create or replace function public.teste_autorizacao_anota(passo text, esperado text, obtido text) returns void language sql as $$
  select set_config('teste.res', current_setting('teste.res', true)
    || case when obtido = esperado then 'OK ' else 'FALHOU ' end || passo
    || ' (esperado: ' || esperado || ' / obtido: ' || coalesce(obtido, 'null') || ') | ', false);
$$;
grant execute on function public.teste_autorizacao_anota(text, text, text) to authenticated;

update portal_autorizacao_regras set ativo = true where assunto = 'requisicao_compra';

set role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated"}', false);

do $$
declare v_id bigint; v_inc bigint; r record;
begin
  -- incompleta: cria normal (não barra), mas pedir a autorização é barrado
  insert into "Requisicao" (titulo, tipo, solicitante, status, valor_despeza, setor)
  values ('TESTE INCOMPLETA', 'Outros', 'Teste', 'pedido', '250,00', 'Trator-Cliente') returning id into v_inc;
  select status, autorizacao_status into r from "Requisicao" where id = v_inc;
  perform public.teste_autorizacao_anota('0a. incompleta cria (falta pedir)', 'completa/falta_pedir', r.status || '/' || coalesce(r.autorizacao_status, 'null'));
  begin
    update "Requisicao" set autorizacao_status = 'aguardando' where id = v_inc;
    perform public.teste_autorizacao_anota('0b. incompleta pedir autorização', 'barrado', 'passou');
  exception when others then
    perform public.teste_autorizacao_anota('0b. incompleta pedir autorização', 'barrado', 'barrado');
  end;

  insert into "Requisicao" (titulo, tipo, solicitante, status, valor_despeza, fornecedor, setor)
  values ('TESTE AUTORIZACAO', 'Outros', 'Teste', 'pedido', '250,00', 'FORNECEDOR TESTE', 'Oficina') returning id into v_id;
  perform set_config('teste.id', v_id::text, false);
  select status, autorizacao_status into r from "Requisicao" where id = v_id;
  perform public.teste_autorizacao_anota('1. cria de R$ 250', 'completa/falta_pedir', r.status || '/' || coalesce(r.autorizacao_status, 'null'));

  begin
    update "Requisicao" set status = 'aguardando' where id = v_id;
    perform public.teste_autorizacao_anota('2. mover de fase sem pedir', 'barrado', 'passou');
  exception when others then
    perform public.teste_autorizacao_anota('2. mover de fase sem pedir', 'barrado', 'barrado');
  end;

  update "Requisicao" set autorizacao_status = 'aguardando' where id = v_id;
  select status, autorizacao_status into r from "Requisicao" where id = v_id;
  perform public.teste_autorizacao_anota('3. pede a autorização', 'completa/aguardando', r.status || '/' || coalesce(r.autorizacao_status, 'null'));

  begin
    update "Requisicao" set autorizacao_status = 'autorizada' where id = v_id;
    perform public.teste_autorizacao_anota('4. navegador se autorizar', 'barrado', 'passou');
  exception when others then
    perform public.teste_autorizacao_anota('4. navegador se autorizar', 'barrado', 'barrado');
  end;

  update "Requisicao" set valor_despeza = '150,00' where id = v_id;
  select status, autorizacao_status into r from "Requisicao" where id = v_id;
  perform public.teste_autorizacao_anota('5. baixa para R$ 150', 'pedido/null', r.status || '/' || coalesce(r.autorizacao_status, 'null'));

  update "Requisicao" set valor_despeza = '250,00' where id = v_id;
  update "Requisicao" set autorizacao_status = 'aguardando' where id = v_id;
  select status, autorizacao_status into r from "Requisicao" where id = v_id;
  perform public.teste_autorizacao_anota('6. volta para R$ 250 e pede de novo', 'completa/aguardando', r.status || '/' || coalesce(r.autorizacao_status, 'null'));
end $$;

reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', false);
update "Requisicao" set autorizacao_status = 'autorizada', autorizacao_valor = 250, autorizacao_por = 'Teste', autorizacao_em = now()
 where id = current_setting('teste.id')::bigint;
select public.teste_autorizacao_anota('7. Diretor autoriza', 'completa/autorizada', status || '/' || coalesce(autorizacao_status, 'null'))
  from "Requisicao" where id = current_setting('teste.id')::bigint;

set role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated"}', false);
do $$
declare v_id bigint := current_setting('teste.id')::bigint; r record;
begin
  update "Requisicao" set valor_despeza = '270,00' where id = v_id;
  select status, autorizacao_status into r from "Requisicao" where id = v_id;
  perform public.teste_autorizacao_anota('8. nota de R$ 270 (dentro dos 10%)', 'completa/autorizada', r.status || '/' || coalesce(r.autorizacao_status, 'null'));
  begin
    update "Requisicao" set status = 'aguardando' where id = v_id;
    select status into r from "Requisicao" where id = v_id;
    perform public.teste_autorizacao_anota('9. aprovada segue para Aguardando nota', 'aguardando', r.status);
  exception when others then
    perform public.teste_autorizacao_anota('9. aprovada segue para Aguardando nota', 'aguardando', 'barrado: ' || sqlerrm);
  end;
  update "Requisicao" set valor_despeza = '300,00' where id = v_id;
  select status, autorizacao_status into r from "Requisicao" where id = v_id;
  perform public.teste_autorizacao_anota('10. nota de R$ 300 (passou dos 10%)', 'completa/falta_pedir', r.status || '/' || coalesce(r.autorizacao_status, 'null'));
  begin
    update "Requisicao" set status = 'lixeira' where id = v_id;
    select status into r from "Requisicao" where id = v_id;
    perform public.teste_autorizacao_anota('11. pode ir para a lixeira', 'lixeira', r.status);
  exception when others then
    perform public.teste_autorizacao_anota('11. pode ir para a lixeira', 'lixeira', 'barrado: ' || sqlerrm);
  end;
end $$;

reset role;
select public.teste_autorizacao_anota('12. aviso no sino (só quando pediu)', 'sim',
  case when count(*) > 0 then 'sim' else 'não' end)
  from portal_notificacoes
 where link = '/empresa?area=autorizacoes' and titulo like 'Requisição #' || current_setting('teste.id') || ' %';

do $$ begin
  raise exception 'RESULTADO DO TESTE (nada foi gravado): %', current_setting('teste.res');
end $$;
