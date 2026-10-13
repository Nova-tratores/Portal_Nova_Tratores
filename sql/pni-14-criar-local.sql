-- ════════════════════════════════════════════════════════════════════
-- Peças S/Estoque (Opa) — 14: criar LOCAL novo na hora (13/10/2026)
-- Pedido do José: ao escolher onde a peça está, poder criar um local novo
-- ali mesmo. Rodar depois do pni-06. Idempotente.
--
-- pni_locais continua fechada para escrita direta; quem cria é a função
-- abaixo (qualquer pessoa logada — é quem capta a peça). Nome igual a um
-- local existente (sem diferença de maiúscula/espaço) reaproveita e reativa.
-- ════════════════════════════════════════════════════════════════════

create or replace function public.pni_criar_local(p_nome text, p_exige_tecnico boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_nome text := nullif(btrim(regexp_replace(coalesce(p_nome, ''), '\s+', ' ', 'g')), '');
  v_base text;
  v_id   text;
  n      int := 1;
  v      pni_locais;
begin
  if not public.pni_pode_ver() then
    raise exception 'Entre no portal para criar um local.' using errcode = '42501';
  end if;
  if v_nome is null then raise exception 'Escreva o nome do local.'; end if;
  if length(v_nome) > 60 then raise exception 'Nome com mais de 60 caracteres.'; end if;

  select * into v from pni_locais where lower(btrim(nome)) = lower(v_nome) limit 1;
  if found then
    if not v.ativo then update pni_locais set ativo = true where id = v.id returning * into v; end if;
    return to_jsonb(v);
  end if;

  -- id legível a partir do nome ("Barracão 3" → barracao_3), sem repetir
  v_base := trim(both '_' from regexp_replace(lower(translate(v_nome,
              'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
              'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')), '[^a-z0-9]+', '_', 'g'));
  if v_base = '' then v_base := 'local'; end if;
  v_id := left(v_base, 50);
  while exists (select 1 from pni_locais where id = v_id) loop
    n := n + 1;
    v_id := left(v_base, 46) || '_' || n;
  end loop;

  insert into pni_locais (id, nome, exige_tecnico, ordem, ativo)
  values (v_id, v_nome, coalesce(p_exige_tecnico, false), coalesce((select max(ordem) + 10 from pni_locais), 10), true)
  returning * into v;
  return to_jsonb(v);
end $$;

revoke all on function public.pni_criar_local(text, boolean) from public, anon;
grant execute on function public.pni_criar_local(text, boolean) to authenticated, service_role;

notify pgrst, 'reload schema';
