-- =====================================================================
-- Cache de NOTAS FISCAIS — indexador INCREMENTAL (15/10/2026)
-- =====================================================================
-- Diagnóstico no pg_stat_statements (15/10): notas_fiscais_indexar() levava
-- 3,5 s por chamada e rodava a cada 10 min (worker) + ao fim dos syncs,
-- reescrevendo as ~21 mil linhas de notas_fiscais_docs TODA VEZ (on conflict
-- do update em tudo) — ~90 milhões de escritas/mês no WAL, que o Realtime
-- ainda decodifica. Era a 3ª consulta mais cara do banco.
--
-- Esta migration:
--   1. notas_fiscais_docs.fonte_em — quando a linha de origem foi gravada
--      (notas_entrada.created_at: o sync apaga e reinsere o mês;
--       portal_nt_notas_saida.updated_at: o sync regrava com now()).
--   2. notas_fiscais_indexar(p_completo boolean default false) — por padrão
--      só olha linhas de origem mais novas que max(fonte_em) − 1 h.
--      p_completo = true refaz tudo (botão "Indexar" do admin e 1ª rodada).
--      A função sem parâmetro é REMOVIDA (duas assinaturas confundem o
--      PostgREST); o código chama com {p_completo} e, se esta migration
--      ainda não foi aplicada, cai na antiga.
--
-- Aplicar no SQL Editor (o projeto do portal não está no MCP). Idempotente.
-- Depois de aplicar, a 1ª chamada roda completa (fonte_em vazio) e as
-- seguintes ficam em milissegundos.
-- =====================================================================

alter table public.notas_fiscais_docs add column if not exists fonte_em timestamptz;
create index if not exists notas_fiscais_docs_fonte_em_idx on public.notas_fiscais_docs (fonte_em desc);

drop function if exists public.notas_fiscais_indexar();

create or replace function public.notas_fiscais_indexar(p_completo boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entrada int := 0;
  v_saida   int := 0;
  v_desde   timestamptz := null;
begin
  -- marca d'água: 1 h de folga cobre relógio/sync que grava em lotes
  if not p_completo then
    select max(fonte_em) - interval '1 hour' into v_desde from notas_fiscais_docs;
  end if;

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
      ne.id::text                                                                   as origem_id,
      ne.created_at                                                                 as fonte_em
    from notas_entrada ne
    where ne.ncod_nf is not null and ne.conta_omie is not null
      and (v_desde is null or ne.created_at > v_desde)
    order by ne.conta_omie, ne.ncod_nf, ne.id desc
  ), ins as (
    insert into notas_fiscais_docs
      (conta_omie, tipo, chave_nfe, n_cod_nf, numero, serie, data_emissao, parte_nome, parte_doc, valor, cancelada, origem_tabela, origem_id, fonte_em)
    select upper(conta_omie), 'entrada', chave_nfe, n_cod_nf, numero, serie, data_emissao, parte_nome, parte_doc, valor, cancelada, 'notas_entrada', origem_id, fonte_em
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
          fonte_em     = greatest(excluded.fonte_em, notas_fiscais_docs.fonte_em),
          atualizado_em = now()
    returning 1
  ) select count(*) into v_entrada from ins;

  -- 2) SAÍDA (portal_nt_notas_saida: produto = NF-e, servico = NFS-e)
  with ins as (
    insert into notas_fiscais_docs
      (conta_omie, tipo, chave_nfe, n_cod_nf, numero, serie, data_emissao, parte_nome, parte_doc, valor, cancelada, origem_tabela, origem_id, fonte_em)
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
      s.conta_omie || '|' || s.tipo || '|' || s.n_cod_nf::text,
      s.updated_at
    from portal_nt_notas_saida s
    where s.n_cod_nf is not null
      and (v_desde is null or s.updated_at > v_desde)
    on conflict (conta_omie, tipo, n_cod_nf) do update
      set chave_nfe    = coalesce(excluded.chave_nfe, notas_fiscais_docs.chave_nfe),
          numero       = coalesce(excluded.numero, notas_fiscais_docs.numero),
          serie        = coalesce(excluded.serie, notas_fiscais_docs.serie),
          data_emissao = coalesce(excluded.data_emissao, notas_fiscais_docs.data_emissao),
          parte_nome   = coalesce(excluded.parte_nome, notas_fiscais_docs.parte_nome),
          parte_doc    = coalesce(excluded.parte_doc, notas_fiscais_docs.parte_doc),
          valor        = coalesce(excluded.valor, notas_fiscais_docs.valor),
          cancelada    = excluded.cancelada,
          fonte_em     = greatest(excluded.fonte_em, notas_fiscais_docs.fonte_em),
          atualizado_em = now()
    returning 1
  ) select count(*) into v_saida from ins;

  return jsonb_build_object('entrada', v_entrada, 'saida', v_saida, 'completo', (v_desde is null), 'desde', v_desde);
end;
$$;

revoke all on function public.notas_fiscais_indexar(boolean) from public, anon, authenticated;
grant execute on function public.notas_fiscais_indexar(boolean) to service_role;

comment on function public.notas_fiscais_indexar(boolean) is
  'Indexa notas_entrada + portal_nt_notas_saida em notas_fiscais_docs (só metadados). Incremental por fonte_em; p_completo=true refaz tudo. Só service role.';

notify pgrst, 'reload schema';

-- Conferência (opcional):
--   select notas_fiscais_indexar(true);   -- 1ª rodada completa, preenche fonte_em
--   select notas_fiscais_indexar();       -- deve devolver poucas linhas e completo=false
