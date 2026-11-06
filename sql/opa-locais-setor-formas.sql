-- ════════════════════════════════════════════════════════════════════
-- Opa: SETOR de cada lugar + FORMAS no mapa (06/11/2026)
-- Pedido do José: criar um lugar DENTRO de um setor ("Banheiro" dentro de
-- "Oficina" → aparece "Oficina · Banheiro" na lista e no mapa) e desenhar
-- salas com várias formas (círculo, L, triângulo, personalizada).
--   • pni_locais.setor: nome do setor (texto livre; vazio = o setor fixo do
--     código para os locais antigos, senão "Outros").
--   • pni_criar_local ganha p_setor: "Banheiro" na Oficina e "Banheiro" em
--     Peças são lugares DIFERENTES (o mesmo nome só reaproveita no mesmo setor).
--   • opa_local_mapa.forma / pontos: forma do lugar na planta (pontos em %
--     da própria caixa, só na "personalizada").
-- Paredes, portas, corredores etc. ficam no jsonb blocos do andar (sem coluna).
-- Rodar depois do pni-14 e do opa-mapa. Idempotente.
-- Projeto: PORTAL (citrhumdkfivdzbmayde).
-- ════════════════════════════════════════════════════════════════════

alter table public.pni_locais add column if not exists setor text;
alter table public.pni_locais drop constraint if exists pni_locais_setor_tam;
alter table public.pni_locais add constraint pni_locais_setor_tam check (setor is null or length(btrim(setor)) between 1 and 40);

alter table public.opa_local_mapa add column if not exists forma text not null default 'retangulo';
alter table public.opa_local_mapa add column if not exists pontos jsonb;
alter table public.opa_local_mapa drop constraint if exists opa_local_mapa_forma;
alter table public.opa_local_mapa add constraint opa_local_mapa_forma check (forma in ('retangulo', 'circulo', 'triangulo', 'L', 'personalizada'));

-- a versão antiga (2 parâmetros) sai: com as duas o PostgREST não sabe qual chamar
drop function if exists public.pni_criar_local(text, boolean);

create or replace function public.pni_criar_local(p_nome text, p_exige_tecnico boolean default false, p_setor text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_nome  text := nullif(btrim(regexp_replace(coalesce(p_nome, ''), '\s+', ' ', 'g')), '');
  v_setor text := nullif(btrim(regexp_replace(coalesce(p_setor, ''), '\s+', ' ', 'g')), '');
  v_base  text;
  v_id    text;
  n       int := 1;
  v       pni_locais;
begin
  if not public.pni_pode_ver() then
    raise exception 'Entre no portal para criar um local.' using errcode = '42501';
  end if;
  if v_nome is null then raise exception 'Escreva o nome do local.'; end if;
  if length(v_nome) > 60 then raise exception 'Nome com mais de 60 caracteres.'; end if;
  if v_setor is not null and length(v_setor) > 40 then raise exception 'Setor com mais de 40 caracteres.'; end if;

  -- mesmo nome no MESMO setor reaproveita (e reativa)
  select * into v from pni_locais
   where lower(btrim(nome)) = lower(v_nome) and lower(coalesce(btrim(setor), '')) = lower(coalesce(v_setor, ''))
   limit 1;
  if found then
    if not v.ativo then update pni_locais set ativo = true where id = v.id returning * into v; end if;
    return to_jsonb(v);
  end if;

  -- id legível a partir do setor + nome ("Oficina" + "Banheiro" → oficina_banheiro), sem repetir
  v_base := trim(both '_' from regexp_replace(lower(translate(coalesce(v_setor || ' ', '') || v_nome,
              'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
              'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')), '[^a-z0-9]+', '_', 'g'));
  if v_base = '' then v_base := 'local'; end if;
  v_id := left(v_base, 50);
  while exists (select 1 from pni_locais where id = v_id) loop
    n := n + 1;
    v_id := left(v_base, 46) || '_' || n;
  end loop;

  insert into pni_locais (id, nome, setor, exige_tecnico, ordem, ativo)
  values (v_id, v_nome, v_setor, coalesce(p_exige_tecnico, false), coalesce((select max(ordem) + 10 from pni_locais), 10), true)
  returning * into v;
  return to_jsonb(v);
end $$;

revoke all on function public.pni_criar_local(text, boolean, text) from public, anon;
grant execute on function public.pni_criar_local(text, boolean, text) to authenticated, service_role;

notify pgrst, 'reload schema';

-- ── Arruma os lugares que estavam em "Outros" (pela posição no mapa) ──
-- Só onde ainda não tem setor (rodar de novo não desfaz o que o admin mudou).
update public.pni_locais l set setor = v.setor, nome = v.nome
from (values
  ('oficina_sala_de_cirurgia', 'Oficina',   'Sala de Cirurgia'),
  ('copa_oficina',             'Oficina',   'Copa'),
  ('w_c_oficina',              'Oficina',   'Banheiro'),
  ('w_c_fundo',                'Oficina',   'Banheiro do Fundo'),
  ('copa_comercial',           'Comercial', 'Copa'),
  ('sala_de_reunioes',         'Comercial', 'Sala de Reuniões'),
  ('w_c',                      'Comercial', 'Banheiro'),
  ('depto_financeiro',         'Escritório', 'Financeiro'),
  ('sala_de_arquivos',         'Escritório', 'Sala de Arquivos')
) as v(id, setor, nome)
where l.id = v.id and l.setor is null;

notify pgrst, 'reload schema';
