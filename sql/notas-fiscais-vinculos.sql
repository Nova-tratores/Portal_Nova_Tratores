-- =====================================================================
-- Cache de notas fiscais — VÍNCULOS: pedido de venda, OS, cliente e máquina
-- (15/10/2026). Complementa sql/notas-fiscais-cache.sql.
--
-- Deixa em notas_fiscais_docs, já resolvido, com quem cada nota de SAÍDA se
-- relaciona, para a tela /estoque/notas buscar por nº do pedido, nº da OS,
-- cliente (código Omie) e máquina (modelo + chassi):
--   NF-e  → pedido (n_id_pedido = cod_pedido da pasta) → OS que cita o pedido
--           (num_pedido_cli do mesmo cliente) ou PPV do portal → OS do portal;
--   NFS-e → OS (n_cod_os novo, senão os_nfse, senão num_nf da pasta) → pedido
--           citado na OS;
--   máquina = projeto da OS + chassis achados nos itens do PV / descrição da OS.
-- Nota de ENTRADA não tem vínculo (fica nula).
--
-- Rode no SQL Editor do Supabase. Idempotente. Sem ela: o portal segue como
-- antes (a RPC nova falha e o worker só loga; a busca por pedido/OS/máquina
-- devolve vazio). Depois de aplicar, a 1ª rodada do worker (10 min) ou o
-- botão "Indexar e guardar agora" preenchem os vínculos.
-- =====================================================================

-- 1) Colunas novas no índice --------------------------------------------
alter table notas_fiscais_docs
  add column if not exists parte_cod      bigint,   -- código do cliente na Omie
  add column if not exists pedido_num     text,     -- nº do pedido de venda (sem zeros à esquerda)
  add column if not exists pedido_cod     bigint,   -- id do pedido na Omie
  add column if not exists os_num         text,     -- nº da OS (sem zeros à esquerda)
  add column if not exists os_cod         bigint,   -- id da OS na Omie (quando conhecido)
  add column if not exists maquina        text,     -- "MODELO CHASSI | CHASSI2…" (texto livre p/ ilike)
  add column if not exists vinculo_origem text;     -- de onde veio o vínculo (depuração)

create index if not exists notas_fiscais_docs_pedido_idx on notas_fiscais_docs (conta_omie, pedido_num);
create index if not exists notas_fiscais_docs_os_idx     on notas_fiscais_docs (conta_omie, os_num);
create extension if not exists pg_trgm;
create index if not exists notas_fiscais_docs_maquina_trgm on notas_fiscais_docs using gin (maquina gin_trgm_ops);

-- 2) A NFS-e passa a guardar o id da OS que a Omie manda (OrdemServico.nCodigoOS)
alter table portal_nt_notas_saida add column if not exists n_cod_os bigint;
create index if not exists idx_notas_saida_os on portal_nt_notas_saida (conta_omie, n_cod_os);

-- 3) Chassis num texto livre -------------------------------------------
-- Duas regras, conferidas sobre os 9.849 PVs e 4.280 OS da pasta em 15/10/2026:
--  (a) token de 17 caracteres com pelo menos uma letra E um dígito (VIN/chassi
--      Mahindra "MBNYHBKYVNNJ02208", quadriciclo "LL8RET4W3P0G00312");
--  (b) depois de "nro de série" / "NR/S:" / "SÉRIE" / "CHASSI": token de 8+
--      caracteres com letra E dígito (carreta "T-28380/0925"). Sem a exigência
--      de letra+dígito e 8+ chars pegava código de peça ("84.424", "828217A").
-- p_projeto (ex.: "6075 MBNYHBKYVPNL02352") vai na frente; chassi já contido
-- nele não repete.
create or replace function notas_fiscais_chassis(p_projeto text, p_texto text)
returns text
language sql
immutable
as $$
  with tok as (
    select (regexp_matches(upper(coalesce(p_texto, '')), '\m((?=[A-Z0-9]*[A-Z])(?=[A-Z0-9]*\d)[A-Z0-9]{17})\M', 'g'))[1] as m
    union
    select (regexp_matches(upper(coalesce(p_texto, '')), '(?:N(?:RO|º|°)?\.?\s*DE\s*S[ÉE]RIE|NR/S:?|S[ÉE]RIE|CHASSIS?)[:\s]*((?=[A-Z0-9/.-]*[A-Z])(?=[A-Z0-9/.-]*\d)[A-Z0-9][A-Z0-9/.-]{7,})', 'g'))[1]
  )
  select nullif(concat_ws(' | ',
    nullif(upper(trim(coalesce(p_projeto, ''))), ''),
    (select string_agg(m, ' | ' order by m) from tok
      where m is not null and position(m in upper(coalesce(p_projeto, ''))) = 0)
  ), '');
$$;

-- 4) RPC: resolve os vínculos ------------------------------------------
-- p_desde = só notas emitidas a partir dessa data (o worker de 10 min passa
-- hoje − 120 dias; os crons e o botão passam null = tudo). Só grava a linha
-- que mudou (IS DISTINCT FROM).
create or replace function notas_fiscais_vincular(p_desde date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nfe  int := 0;
  v_nfse int := 0;
begin
  -- ---------------- NF-e de saída (peças/máquinas) ----------------
  with base as (
    select d.id, d.conta_omie, d.numero, d.parte_doc, s.cliente_codigo, s.n_id_pedido
    from notas_fiscais_docs d
    join portal_nt_notas_saida s
      on s.conta_omie = d.conta_omie and s.tipo = 'produto' and s.n_cod_nf = d.n_cod_nf
    where d.tipo = 'saida_produto'
      and (p_desde is null or d.data_emissao is null or d.data_emissao >= p_desde)
  ), pv as (
    select distinct on (b.id)
      b.id, p.cod_pedido, p.cod_cli, p.empresa, p.itens,
      nullif(ltrim(regexp_replace(coalesce(p.num_pedido, ''), '\D', '', 'g'), '0'), '') as num_pedido
    from base b
    join portal_nt_clientes_pv p
      on p.cod_pedido = b.n_id_pedido
     and (case when p.empresa ilike '%castro%' then 'CASTRO' else 'NOVA' end) = b.conta_omie
    order by b.id, p.updated_at desc nulls last
  ), os_a as (
    -- OS da pasta, mesmo cliente, cujo "nº do pedido do cliente" é este PV
    select distinct on (pv.id)
      pv.id, o.cod_os, o.projeto, o.descricao, o.servicos, 'num_pedido_cli' as origem,
      nullif(ltrim(regexp_replace(coalesce(o.num_os, ''), '\D', '', 'g'), '0'), '') as os_num
    from pv
    join portal_nt_clientes_os o
      on o.empresa = pv.empresa and o.cod_cli = pv.cod_cli
     and coalesce(o.cancelada, false) = false
     and o.num_pedido_cli ~ '^\s*0*\d+\s*$'
     and ltrim(trim(o.num_pedido_cli), '0') = pv.num_pedido
    where pv.num_pedido is not null
    order by pv.id, o.data_inclusao desc nulls last
  ), os_b as (
    -- PPV do portal que virou este pedido → OS do portal (mesmo CNPJ) → nº na Omie
    select distinct on (pv.id)
      pv.id, null::bigint as cod_os, os."Projeto" as projeto, os."Serv_Solicitado" as descricao, null::text as servicos, 'ppv' as origem,
      nullif(ltrim(regexp_replace(coalesce(os."Ordem_Omie", ''), '\D', '', 'g'), '0'), '') as os_num
    from pv
    join base b on b.id = pv.id
    join pedidos pp
      on nullif(ltrim(regexp_replace(coalesce(pp.pedido_omie, ''), '\D', '', 'g'), '0'), '') = pv.num_pedido
    join "Ordem_Servico" os
      on os."Id_Ordem" = pp."Id_Os"
     and nullif(ltrim(regexp_replace(coalesce(os."Ordem_Omie", ''), '\D', '', 'g'), '0'), '') is not null
     and regexp_replace(coalesce(os."Cnpj_Cliente", ''), '\D', '', 'g') = coalesce(b.parte_doc, '')
    where pv.num_pedido is not null
    order by pv.id, pp.id_pedido desc
  ), calc as (
    select b.id,
      b.cliente_codigo                                   as parte_cod,
      pv.cod_pedido                                      as pedido_cod,
      pv.num_pedido                                      as pedido_num,
      coalesce(oa.cod_os, ob.cod_os)                     as os_cod,
      coalesce(oa.os_num, ob.os_num)                     as os_num,
      notas_fiscais_chassis(coalesce(oa.projeto, ob.projeto),
        concat_ws(' ', pv.itens, coalesce(oa.descricao, ob.descricao), oa.servicos)) as maquina,
      case when pv.id is null then null
           else concat_ws('+', 'n_id_pedido', coalesce(oa.origem, ob.origem)) end  as vinculo_origem
    from base b
    left join pv   on pv.id = b.id
    left join os_a oa on oa.id = b.id
    left join os_b ob on ob.id = b.id
  )
  update notas_fiscais_docs d
     set parte_cod = c.parte_cod, pedido_cod = c.pedido_cod, pedido_num = c.pedido_num,
         os_cod = c.os_cod, os_num = c.os_num, maquina = c.maquina, vinculo_origem = c.vinculo_origem,
         atualizado_em = now()
    from calc c
   where c.id = d.id
     and row(d.parte_cod, d.pedido_cod, d.pedido_num, d.os_cod, d.os_num, d.maquina, d.vinculo_origem)
         is distinct from
         row(c.parte_cod, c.pedido_cod, c.pedido_num, c.os_cod, c.os_num, c.maquina, c.vinculo_origem);
  get diagnostics v_nfe = row_count;

  -- ---------------- NFS-e (serviço) ----------------
  with base as (
    select d.id, d.conta_omie, d.numero, d.parte_doc, s.cliente_codigo, s.n_cod_os, s.numero_int
    from notas_fiscais_docs d
    join portal_nt_notas_saida s
      on s.conta_omie = d.conta_omie and s.tipo = 'servico' and s.n_cod_nf = d.n_cod_nf
    where d.tipo = 'saida_servico'
      and (p_desde is null or d.data_emissao is null or d.data_emissao >= p_desde)
  ), os_cand as (
    -- (1) id da OS que a própria NFS-e traz
    select b.id, 1 as prio, 'n_cod_os' as origem, o.cod_os, o.num_os, o.empresa, o.cod_cli, o.projeto, o.descricao, o.servicos, o.num_pedido_cli
    from base b
    join portal_nt_clientes_os o
      on o.cod_os = b.n_cod_os
     and (case when o.empresa ilike '%castro%' then 'CASTRO' else 'NOVA' end) = b.conta_omie
    union all
    -- (2) cache os_nfse (nº da NFS-e por OS)
    select b.id, 2, 'os_nfse', o.cod_os, o.num_os, o.empresa, o.cod_cli, o.projeto, o.descricao, o.servicos, o.num_pedido_cli
    from base b
    join os_nfse n
      on n.conta_omie = b.conta_omie and coalesce(n.tem_nota, false)
     and nullif(regexp_replace(coalesce(n.nfse_num, ''), '\D', '', 'g'), '')::bigint = b.numero_int
    join portal_nt_clientes_os o on o.cod_os = n.ncod_os
    union all
    -- (3) nº da nota gravado na OS da pasta (mesmo cliente)
    select b.id, 3, 'num_nf', o.cod_os, o.num_os, o.empresa, o.cod_cli, o.projeto, o.descricao, o.servicos, o.num_pedido_cli
    from base b
    join portal_nt_clientes_os o
      on (case when o.empresa ilike '%castro%' then 'CASTRO' else 'NOVA' end) = b.conta_omie
     and o.cod_cli = b.cliente_codigo
     and nullif(ltrim(regexp_replace(coalesce(o.num_nf, ''), '\D', '', 'g'), '0'), '') = b.numero
  ), osx as (
    select distinct on (id) * from os_cand order by id, prio
  ), pvx as (
    select distinct on (x.id)
      x.id, p.cod_pedido,
      nullif(ltrim(regexp_replace(coalesce(p.num_pedido, ''), '\D', '', 'g'), '0'), '') as num_pedido
    from osx x
    join portal_nt_clientes_pv p
      on p.empresa = x.empresa and p.cod_cli = x.cod_cli
     and x.num_pedido_cli ~ '^\s*0*\d+\s*$'
     and nullif(ltrim(regexp_replace(coalesce(p.num_pedido, ''), '\D', '', 'g'), '0'), '') = ltrim(trim(x.num_pedido_cli), '0')
    order by x.id, p.updated_at desc nulls last
  ), calc as (
    select b.id,
      b.cliente_codigo as parte_cod,
      pvx.cod_pedido   as pedido_cod,
      pvx.num_pedido   as pedido_num,
      x.cod_os         as os_cod,
      nullif(ltrim(regexp_replace(coalesce(x.num_os, ''), '\D', '', 'g'), '0'), '') as os_num,
      notas_fiscais_chassis(x.projeto, concat_ws(' ', x.descricao, x.servicos)) as maquina,
      case when x.id is null then null
           else concat_ws('+', x.origem, case when pvx.id is null then null else 'num_pedido_cli' end) end as vinculo_origem
    from base b
    left join osx x   on x.id = b.id
    left join pvx     on pvx.id = b.id
  )
  update notas_fiscais_docs d
     set parte_cod = c.parte_cod, pedido_cod = c.pedido_cod, pedido_num = c.pedido_num,
         os_cod = c.os_cod, os_num = c.os_num, maquina = c.maquina, vinculo_origem = c.vinculo_origem,
         atualizado_em = now()
    from calc c
   where c.id = d.id
     and row(d.parte_cod, d.pedido_cod, d.pedido_num, d.os_cod, d.os_num, d.maquina, d.vinculo_origem)
         is distinct from
         row(c.parte_cod, c.pedido_cod, c.pedido_num, c.os_cod, c.os_num, c.maquina, c.vinculo_origem);
  get diagnostics v_nfse = row_count;

  return jsonb_build_object('nfe', v_nfe, 'nfse', v_nfse);
end;
$$;

revoke all on function notas_fiscais_vincular(date) from public, anon, authenticated;
grant execute on function notas_fiscais_vincular(date) to service_role;
comment on function notas_fiscais_vincular(date) is 'Resolve pedido/OS/cliente/máquina das notas de saída em notas_fiscais_docs. Só service role.';

notify pgrst, 'reload schema';

-- Conferência rápida depois de rodar:
-- select tipo, count(*) filter (where pedido_num is not null) pedido, count(*) filter (where os_num is not null) os,
--        count(*) filter (where maquina is not null) maquina, count(*) total from notas_fiscais_docs group by 1;
