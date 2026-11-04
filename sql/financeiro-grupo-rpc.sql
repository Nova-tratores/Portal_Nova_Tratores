-- =============================================================================
-- Financeiro — juntar / tirar cards do grupo (boleto único) numa TRANSAÇÃO só.
-- Projeto Supabase do PORTAL (citrhumdk…). Rodar no SQL Editor. Idempotente.
--
-- Antes: src/lib/financeiro/grupo.js fazia vários UPDATEs pelo navegador (um
-- por filho + netos + total do pai) e não checava o erro de todos — uma falha no
-- meio deixava o grupo pela metade (valor do pai errado, filho zerado sem pai).
-- E dava pra tirar um filho DEPOIS que o boleto do pai (com o total) já tinha
-- saído: o filho voltava pra Gerar Boleto com o valor dele → cobrança em dobro.
--
-- Agora: duas funções que travam as linhas (FOR UPDATE), conferem a fase e
-- gravam tudo de uma vez. Trava = o pai (e, ao juntar, todos os cards) precisa
-- estar em 'gerar_boleto' ou 'validar_pix' — mesma regra de
-- src/lib/financeiro/grupo-regras.ts (FASES_GRUPO_EDITAVEL).
--
-- Sem esta migration o portal continua funcionando: grupo.js recebe PGRST202 /
-- 42883 e cai no caminho antigo (agora com a trava e checando todos os erros).
-- =============================================================================

-- Valor em texto do Chamado_NF ("2047.9", "1.234,56", "R$ 10,00") → numeric.
-- Espelha parseValorNum (src/lib/financeiro/parcelas.js).
create or replace function public.chamado_nf_valor_num(p text)
returns numeric
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare s text;
begin
  if p is null then return 0; end if;
  s := regexp_replace(p, '[R$[:space:]]', '', 'g');
  if s = '' then return 0; end if;
  if position(',' in s) > 0 and position('.' in s) > 0 then
    s := replace(replace(s, '.', ''), ',', '.');
  elsif position(',' in s) > 0 then
    s := replace(s, ',', '.');
  end if;
  begin
    return s::numeric;
  exception when others then
    return 0;
  end;
end;
$$;

-- -----------------------------------------------------------------------------
-- Juntar: p_filhos_ids entram no grupo de p_pai_id.
-- -----------------------------------------------------------------------------
create or replace function public.chamado_nf_juntar(p_pai_id bigint, p_filhos_ids bigint[])
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_fases constant text[] := array['gerar_boleto', 'validar_pix'];
  v_pai   public."Chamado_NF"%rowtype;
  v_f     public."Chamado_NF"%rowtype;
  v_ids   bigint[];
  v_qtd   int := 0;
  v_soma  numeric := 0;
  v_total numeric;
begin
  if auth.uid() is null then
    raise exception 'Sessão expirada — entre de novo no portal.' using errcode = '42501';
  end if;

  select array_agg(distinct x) into v_ids from unnest(p_filhos_ids) x where x is not null and x <> p_pai_id;
  if v_ids is null or array_length(v_ids, 1) is null then
    raise exception 'Escolha o card principal e pelo menos mais um card.' using errcode = '22023';
  end if;

  -- trava o pai primeiro e depois os filhos em ordem de id (evita deadlock)
  select * into v_pai from public."Chamado_NF" where id = p_pai_id for update;
  if not found then
    raise exception 'O card principal #% não existe mais.', p_pai_id using errcode = 'P0002';
  end if;
  if v_pai.grupo_pai_id is not null then
    raise exception 'O card #% já está dentro de outro grupo (#%).', p_pai_id, v_pai.grupo_pai_id using errcode = 'P0001';
  end if;
  if not (coalesce(v_pai.status, '') = any(v_fases)) then
    raise exception 'Não dá pra juntar: o card #% está em "%". Só é possível juntar cards em "Gerar Boleto" ou "Validar Pix" (antes de gerar o boleto).',
      p_pai_id, coalesce(v_pai.status, '(sem fase)') using errcode = 'P0001';
  end if;

  for v_f in
    select * from public."Chamado_NF" where id = any(v_ids) order by id for update
  loop
    v_qtd := v_qtd + 1;
    if not (coalesce(v_f.status, '') = any(v_fases)) then
      raise exception 'Não dá pra juntar: o card #% está em "%". Só é possível juntar cards em "Gerar Boleto" ou "Validar Pix" (antes de gerar o boleto).',
        v_f.id, coalesce(v_f.status, '(sem fase)') using errcode = 'P0001';
    end if;
    if v_f.grupo_pai_id is not null and v_f.grupo_pai_id <> p_pai_id then
      raise exception 'O card #% já está dentro do grupo #%.', v_f.id, v_f.grupo_pai_id using errcode = 'P0001';
    end if;
    if upper(btrim(coalesce(v_f.nom_cliente, ''))) <> upper(btrim(coalesce(v_pai.nom_cliente, ''))) then
      raise exception 'O card #% é de outro cliente — só dá pra juntar cards do mesmo cliente.', v_f.id using errcode = 'P0001';
    end if;
    v_soma := v_soma + public.chamado_nf_valor_num(v_f.valor_servico);
  end loop;

  if v_qtd <> array_length(v_ids, 1) then
    raise exception 'Algum dos cards escolhidos não existe mais — recarregue a tela.' using errcode = 'P0002';
  end if;

  -- netos: quem estava dentro de um filho passa a apontar pro novo pai (grupo não encadeia)
  update public."Chamado_NF"
     set grupo_pai_id = p_pai_id,
         status = v_pai.status,
         tarefa = coalesce(nullif(v_pai.tarefa, ''), tarefa)
   where grupo_pai_id = any(v_ids);

  update public."Chamado_NF"
     set grupo_pai_id = p_pai_id,
         grupo_valor_original = public.chamado_nf_valor_num(valor_servico),
         valor_servico = '0',
         status = v_pai.status,
         tarefa = coalesce(nullif(v_pai.tarefa, ''), tarefa)
   where id = any(v_ids);

  v_total := public.chamado_nf_valor_num(v_pai.valor_servico) + v_soma;
  update public."Chamado_NF" set valor_servico = v_total::text where id = p_pai_id;

  return jsonb_build_object('pai_id', p_pai_id, 'juntados', to_jsonb(v_ids), 'total', v_total);
end;
$$;

-- -----------------------------------------------------------------------------
-- Tirar do grupo: o filho volta pra fase do pai (Gerar Boleto / Validar Pix) com
-- o valor original; o pai devolve esse valor do total.
-- Pai apagado ou 'excluido' (cobrança cancelada) libera o filho em Gerar Boleto.
-- -----------------------------------------------------------------------------
create or replace function public.chamado_nf_remover_do_grupo(p_filho_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_fases constant text[] := array['gerar_boleto', 'validar_pix'];
  v_filho public."Chamado_NF"%rowtype;
  v_pai   public."Chamado_NF"%rowtype;
  v_tem_pai boolean;
  v_orig  numeric;
  v_status text := 'gerar_boleto';
  v_tarefa text := 'Gerar Boleto';
  v_novo  numeric;
begin
  if auth.uid() is null then
    raise exception 'Sessão expirada — entre de novo no portal.' using errcode = '42501';
  end if;

  select * into v_filho from public."Chamado_NF" where id = p_filho_id;
  if not found then
    raise exception 'O card #% não existe mais.', p_filho_id using errcode = 'P0002';
  end if;
  if v_filho.grupo_pai_id is null then
    raise exception 'O card #% não está em nenhum grupo.', p_filho_id using errcode = 'P0001';
  end if;

  -- mesma ordem de trava do juntar: pai, depois filho
  select * into v_pai from public."Chamado_NF" where id = v_filho.grupo_pai_id for update;
  v_tem_pai := found;
  select * into v_filho from public."Chamado_NF" where id = p_filho_id for update;
  if v_filho.grupo_pai_id is null or (v_tem_pai and v_filho.grupo_pai_id <> v_pai.id) then
    raise exception 'O grupo do card #% mudou enquanto você olhava — recarregue a tela.', p_filho_id using errcode = 'P0001';
  end if;

  if v_tem_pai and coalesce(v_pai.status, '') <> 'excluido' then
    if not (coalesce(v_pai.status, '') = any(v_fases)) then
      raise exception 'Não dá pra tirar cards deste grupo: o card principal #% está em "%" e o boleto com o valor TOTAL do grupo já foi gerado/enviado. Se o card sair agora, o cliente é cobrado em dobro. Para separar, cancele/substitua o boleto e devolva o card principal para "Gerar Boleto" primeiro.',
        v_pai.id, coalesce(v_pai.status, '(sem fase)') using errcode = 'P0001';
    end if;
    v_status := v_pai.status;
    v_tarefa := coalesce(nullif(v_pai.tarefa, ''), 'Gerar Boleto');
  end if;

  v_orig := coalesce(v_filho.grupo_valor_original, 0);

  update public."Chamado_NF"
     set grupo_pai_id = null,
         grupo_valor_original = null,
         valor_servico = v_orig::text,
         status = v_status,
         tarefa = v_tarefa
   where id = p_filho_id;

  if v_tem_pai then
    v_novo := greatest(0, public.chamado_nf_valor_num(v_pai.valor_servico) - v_orig);
    update public."Chamado_NF" set valor_servico = v_novo::text where id = v_pai.id;
  end if;

  return jsonb_build_object('filho_id', p_filho_id, 'pai_id', v_filho.grupo_pai_id, 'valor_devolvido', v_orig, 'total_pai', v_novo, 'status', v_status);
end;
$$;

-- Só usuário logado chama (o navegador do portal). anon e public fora.
revoke all on function public.chamado_nf_juntar(bigint, bigint[]) from public, anon;
revoke all on function public.chamado_nf_remover_do_grupo(bigint) from public, anon;
grant execute on function public.chamado_nf_juntar(bigint, bigint[]) to authenticated;
grant execute on function public.chamado_nf_remover_do_grupo(bigint) to authenticated;

revoke all on function public.chamado_nf_valor_num(text) from public, anon;
grant execute on function public.chamado_nf_valor_num(text) to authenticated;

notify pgrst, 'reload schema';
