-- Autorizações do Diretor — Requisições acima de R$ 200 (José, 17/11/2026)
-- Rodar no projeto citrhumdkfivdzbmayde (portal). Idempotente.
--
-- Regra (decisões do José):
--   * requisição de R$ 200 ou mais precisa da autorização do Diretor ou de um Dev;
--   * só as NOVAS (criadas depois que a regra liga) ou uma antiga cujo VALOR for alterado para ≥ limite;
--   * enquanto espera fica na fase "Aguardando autorização" (status completa, nome novo da fase 2) e NÃO muda de fase;
--     autorizada → "Aguardando nota do fornecedor" (status aguardando); recusada → fase oculta "Não autorizadas"
--     (status recusada) com o motivo de quem negou; dali só lixeira ou "pedir de novo". Anexar continua liberado;
--   * autorizada vale até o fim; se o valor passar 10% do autorizado, volta a pedir;
--   * Alimentação criada pela OS (origem auto_alimentacao_os) fica de fora.
-- A trava de fase mora AQUI (gatilho), então vale para o cartão, o arrastar no quadro e os robôs.
-- Autorizar/recusar só pelo servidor (service_role) — o navegador não consegue se autorizar.

-- 1) regras por assunto (o limite é editável na aba Autorizações da Visão da empresa)
create table if not exists portal_autorizacao_regras (
  assunto        text primary key,
  setor          text not null,
  titulo         text not null,
  limite         numeric not null default 0,
  ativo          boolean not null default true,
  desde          timestamptz not null default now(),
  atualizado_por text,
  atualizado_em  timestamptz not null default now()
);
alter table portal_autorizacao_regras enable row level security;
drop policy if exists "autorizacao_regras_ler" on portal_autorizacao_regras;
create policy "autorizacao_regras_ler" on portal_autorizacao_regras for select to authenticated using (true);
revoke insert, update, delete on portal_autorizacao_regras from anon, authenticated;

insert into portal_autorizacao_regras (assunto, setor, titulo, limite)
values ('requisicao_compra', 'Requisições', 'Requisição de R$ 200 ou mais', 200)
on conflict (assunto) do nothing;

-- 2) colunas na requisição
alter table "Requisicao" add column if not exists autorizacao_status    text;         -- null | aguardando | autorizada | recusada
alter table "Requisicao" add column if not exists autorizacao_valor     numeric;      -- valor que foi autorizado
alter table "Requisicao" add column if not exists autorizacao_pedida_em timestamptz;
alter table "Requisicao" add column if not exists autorizacao_motivo    text;         -- explicação de quem pediu (opcional)
alter table "Requisicao" add column if not exists autorizacao_por       text;
alter table "Requisicao" add column if not exists autorizacao_por_id    uuid;
alter table "Requisicao" add column if not exists autorizacao_em        timestamptz;
alter table "Requisicao" add column if not exists autorizacao_obs       text;         -- recado do Diretor
create index if not exists requisicao_autorizacao_status_idx on "Requisicao" (autorizacao_status) where autorizacao_status is not null;

-- 3) valor em texto ("1.234,56", "1234.56", "R$ 200") → número
create or replace function req_valor_num(v text) returns numeric
language plpgsql immutable as $$
declare s text;
begin
  s := regexp_replace(coalesce(v, ''), '[^0-9,.\-]', '', 'g');
  if s = '' then return 0; end if;
  if position(',' in s) > 0 then s := replace(replace(s, '.', ''), ',', '.'); end if;
  return s::numeric;
exception when others then return 0;
end $$;

-- 4) gatilho
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

drop trigger if exists req_autorizacao on "Requisicao";
create trigger req_autorizacao before insert or update on "Requisicao"
  for each row execute function req_autorizacao_trg();

-- conferir: select assunto, limite, ativo, desde from portal_autorizacao_regras;
