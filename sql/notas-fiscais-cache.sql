-- =====================================================================
-- Cache de NOTAS FISCAIS (entrada + saída) no portal — 13/10/2026
-- =====================================================================
-- Pedido do José: quando a Omie cair, o portal continua dando acesso às
-- notas. Os METADADOS já estão espelhados (notas_entrada e
-- portal_nt_notas_saida); o que faltava era o DOCUMENTO (PDF + XML), que
-- hoje é buscado ao vivo na Omie a cada clique (URL temporária).
--
-- Esta migration cria:
--   1. notas_fiscais_docs — índice unificado (entrada | saida_produto |
--      saida_servico) + caminhos do PDF/XML no bucket privado + fila de
--      tentativas. UNIQUE (conta_omie, tipo, n_cod_nf).
--   2. bucket privado `notas-fiscais` (sem URL pública; o portal serve o
--      arquivo por rota autenticada GET /api/estoque/notas/<id>/arquivo).
--   3. RPC notas_fiscais_indexar() — SECURITY DEFINER, só service role —
--      que lê as duas fontes e faz INSERT ... ON CONFLICT DO UPDATE só dos
--      metadados (nunca mexe em pdf_path/xml_path/tentativas).
--
-- RLS: leitura para authenticated; escrita só service role (sem policy).
-- Idempotente. Rodar no SQL Editor do projeto do portal.
-- =====================================================================

create extension if not exists pg_trgm;

create table if not exists notas_fiscais_docs (
  id                   bigserial primary key,
  conta_omie           text not null,                                   -- 'NOVA' | 'CASTRO'
  tipo                 text not null check (tipo in ('entrada','saida_produto','saida_servico')),
  chave_nfe            text,                                            -- NF-e; NFS-e não tem
  n_cod_nf             bigint not null,                                 -- id interno Omie (nCodNF / nIdNF / nIdNf)
  numero               text,                                            -- sem zeros à esquerda
  serie                text,
  data_emissao         date,
  parte_nome           text,                                            -- fornecedor (entrada) ou cliente (saída)
  parte_doc            text,                                            -- CNPJ/CPF só dígitos
  valor                numeric,
  cancelada            boolean not null default false,
  origem_tabela        text not null,                                   -- 'notas_entrada' | 'portal_nt_notas_saida'
  origem_id            text not null,
  pdf_path             text,                                            -- caminho no bucket notas-fiscais
  xml_path             text,
  pdf_em               timestamptz,
  xml_em               timestamptz,
  tentativas           integer not null default 0,
  proxima_tentativa_em timestamptz,
  ultimo_erro          text,
  criado_em            timestamptz not null default now(),
  atualizado_em        timestamptz not null default now(),
  unique (conta_omie, tipo, n_cod_nf)
);

create index if not exists notas_fiscais_docs_data_idx   on notas_fiscais_docs (conta_omie, data_emissao desc);
create index if not exists notas_fiscais_docs_numero_idx on notas_fiscais_docs (conta_omie, numero);
create index if not exists notas_fiscais_docs_chave_idx  on notas_fiscais_docs (chave_nfe);
create index if not exists notas_fiscais_docs_fila_idx   on notas_fiscais_docs (proxima_tentativa_em, data_emissao desc) where pdf_path is null or xml_path is null;
create index if not exists notas_fiscais_docs_nome_trgm  on notas_fiscais_docs using gin (parte_nome gin_trgm_ops);
create index if not exists notas_fiscais_docs_doc_idx    on notas_fiscais_docs (parte_doc);

comment on table notas_fiscais_docs is 'Cache de notas fiscais (entrada e saída): índice unificado + PDF/XML guardados no bucket privado notas-fiscais. Alimentado por notas_fiscais_indexar() e pelo worker notas-cache-docs.';

alter table notas_fiscais_docs enable row level security;
drop policy if exists notas_fiscais_docs_select on notas_fiscais_docs;
create policy notas_fiscais_docs_select on notas_fiscais_docs for select to authenticated using (true);
revoke all on notas_fiscais_docs from anon;

-- ---------------------------------------------------------------------
-- Bucket PRIVADO. (Se a conta não permitir inserir em storage.buckets,
-- o servidor cria na primeira gravação: ensureBucket em lib/notas/cache-docs.ts.)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('notas-fiscais', 'notas-fiscais', false)
on conflict (id) do update set public = false;

-- ---------------------------------------------------------------------
-- RPC: indexa as duas fontes. Só metadados; documentos e fila intocados.
-- ---------------------------------------------------------------------
create or replace function notas_fiscais_indexar()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entrada int := 0;
  v_saida   int := 0;
begin
  -- 1) ENTRADA (notas_entrada: data em texto DD/MM/YYYY, às vezes ISO; cancelada = dCan texto)
  with fonte as (
    select distinct on (ne.conta_omie, ne.ncod_nf)
      ne.conta_omie,
      ne.ncod_nf::bigint                                                           as n_cod_nf,
      nullif(coalesce(ne.complemento->>'cChaveNFe', ne.emitente->>'cChaveNFe'), '') as chave_nfe,
      nullif(ltrim(coalesce(ne.numero_nf, ''), '0'), '')                           as numero,
      nullif(ne.serie, '')                                                          as serie,
      case
        when ne.data_emissao ~ '^\d{2}/\d{2}/\d{4}' then to_date(substr(ne.data_emissao, 1, 10), 'DD/MM/YYYY')
        when ne.data_emissao ~ '^\d{4}-\d{2}-\d{2}' then substr(ne.data_emissao, 1, 10)::date
        else null
      end                                                                           as data_emissao,
      nullif(coalesce(ne.nome_emitente, ne.emitente->>'xNome'), '')                 as parte_nome,
      nullif(regexp_replace(coalesce(ne.emitente->>'cnpj_cpf', ''), '\D', '', 'g'), '') as parte_doc,
      ne.valor_nf::numeric                                                          as valor,
      (coalesce(ne.cancelada, '') <> '')                                            as cancelada,
      ne.id::text                                                                   as origem_id
    from notas_entrada ne
    where ne.ncod_nf is not null and ne.conta_omie is not null
    order by ne.conta_omie, ne.ncod_nf, ne.id desc
  ), ins as (
    insert into notas_fiscais_docs
      (conta_omie, tipo, chave_nfe, n_cod_nf, numero, serie, data_emissao, parte_nome, parte_doc, valor, cancelada, origem_tabela, origem_id)
    select upper(conta_omie), 'entrada', chave_nfe, n_cod_nf, numero, serie, data_emissao, parte_nome, parte_doc, valor, cancelada, 'notas_entrada', origem_id
    from fonte
    on conflict (conta_omie, tipo, n_cod_nf) do update
      set chave_nfe    = coalesce(excluded.chave_nfe, notas_fiscais_docs.chave_nfe),
          numero       = coalesce(excluded.numero, notas_fiscais_docs.numero),
          serie        = coalesce(excluded.serie, notas_fiscais_docs.serie),
          data_emissao = coalesce(excluded.data_emissao, notas_fiscais_docs.data_emissao),
          parte_nome   = coalesce(excluded.parte_nome, notas_fiscais_docs.parte_nome),
          parte_doc    = coalesce(excluded.parte_doc, notas_fiscais_docs.parte_doc),
          valor        = coalesce(excluded.valor, notas_fiscais_docs.valor),
          cancelada    = excluded.cancelada,
          origem_id    = excluded.origem_id,
          atualizado_em = now()
    returning 1
  ) select count(*) into v_entrada from ins;

  -- 2) SAÍDA (portal_nt_notas_saida: produto = NF-e, servico = NFS-e)
  with ins as (
    insert into notas_fiscais_docs
      (conta_omie, tipo, chave_nfe, n_cod_nf, numero, serie, data_emissao, parte_nome, parte_doc, valor, cancelada, origem_tabela, origem_id)
    select
      upper(s.conta_omie),
      case when s.tipo = 'produto' then 'saida_produto' else 'saida_servico' end,
      nullif(s.chave_nfe, ''),
      s.n_cod_nf,
      coalesce(s.numero_int::text, nullif(ltrim(coalesce(s.numero, ''), '0'), '')),
      nullif(s.serie, ''),
      s.data_emissao,
      nullif(s.cliente_nome, ''),
      nullif(regexp_replace(coalesce(s.cliente_doc, ''), '\D', '', 'g'), ''),
      s.valor_nf,
      coalesce(s.cancelada, false),
      'portal_nt_notas_saida',
      s.conta_omie || '|' || s.tipo || '|' || s.n_cod_nf::text
    from portal_nt_notas_saida s
    where s.n_cod_nf is not null
    on conflict (conta_omie, tipo, n_cod_nf) do update
      set chave_nfe    = coalesce(excluded.chave_nfe, notas_fiscais_docs.chave_nfe),
          numero       = coalesce(excluded.numero, notas_fiscais_docs.numero),
          serie        = coalesce(excluded.serie, notas_fiscais_docs.serie),
          data_emissao = coalesce(excluded.data_emissao, notas_fiscais_docs.data_emissao),
          parte_nome   = coalesce(excluded.parte_nome, notas_fiscais_docs.parte_nome),
          parte_doc    = coalesce(excluded.parte_doc, notas_fiscais_docs.parte_doc),
          valor        = coalesce(excluded.valor, notas_fiscais_docs.valor),
          cancelada    = excluded.cancelada,
          atualizado_em = now()
    returning 1
  ) select count(*) into v_saida from ins;

  return jsonb_build_object('entrada', v_entrada, 'saida', v_saida);
end;
$$;

revoke all on function notas_fiscais_indexar() from public, anon, authenticated;
grant execute on function notas_fiscais_indexar() to service_role;

comment on function notas_fiscais_indexar() is 'Indexa notas_entrada + portal_nt_notas_saida em notas_fiscais_docs (só metadados). Só service role.';

notify pgrst, 'reload schema';
