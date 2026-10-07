-- ════════════════════════════════════════════════════════════════════
-- Peças Não Identificadas — TESTES do banco (não é migration)
--
-- Rodar no SQL Editor DEPOIS de pni-01..04. Tudo dentro de uma transação
-- que termina em ROLLBACK: nada fica gravado. Cada verificação imprime
-- "ok: ..." (aba Messages/Notices); a primeira que falhar aborta com
-- "FALHOU: ...".
-- Precisa de: 1 usuário admin/dev ativo e 1 usuário ativo SEM 'opa-pecas'.
-- ════════════════════════════════════════════════════════════════════
begin;

-- ── contexto: escolhe os usuários e cria fotos falsas no bucket ──────
select set_config('pni_teste.gestor', (
  select u.id::text from financeiro_usu u join portal_permissoes p on p.user_id = u.id
  where coalesce(u.ativo, true) and (p.is_admin or p.is_dev) limit 1), true);
select set_config('pni_teste.comum', (
  select u.id::text from financeiro_usu u left join portal_permissoes p on p.user_id = u.id
  where coalesce(u.ativo, true) and not coalesce(p.is_admin, false) and not coalesce(p.is_dev, false)
    and not ('opa-pecas' = any (coalesce(p.modulos_permitidos, '{}'))) limit 1), true);
select set_config('pni_teste.estranho', gen_random_uuid()::text, true);

do $$ begin
  if current_setting('pni_teste.gestor', true) is null or current_setting('pni_teste.gestor') = '' then raise exception 'FALHOU: nenhum admin/dev ativo para o teste'; end if;
  if current_setting('pni_teste.comum', true) is null or current_setting('pni_teste.comum') = '' then raise exception 'FALHOU: nenhum usuário comum ativo para o teste'; end if;
end $$;

insert into storage.objects (bucket_id, name, owner)
select 'pni-fotos', current_setting('pni_teste.comum') || '/teste-' || n || '.jpg', current_setting('pni_teste.comum')::uuid
from generate_series(1, 6) n;

-- ════════ como USUÁRIO COMUM (captura, sem o módulo opa-pecas) ═══════
select set_config('request.jwt.claims', json_build_object('sub', current_setting('pni_teste.comum'), 'role', 'authenticated')::text, true);
set local role authenticated;

-- item com menos de 2 fotos é rejeitado
do $$ begin
  perform pni_criar_item(array[current_setting('pni_teste.comum') || '/teste-1.jpg'], p_local => 'pecas');
  raise exception 'FALHOU: aceitou item com 1 foto';
exception when others then
  if sqlerrm like 'FALHOU%' then raise; end if;
  raise notice 'ok: 1 foto rejeitada (%)', sqlerrm;
end $$;

-- a mesma foto repetida não conta como 2
do $$ begin
  perform pni_criar_item(array[current_setting('pni_teste.comum') || '/teste-1.jpg', current_setting('pni_teste.comum') || '/teste-1.jpg'], p_local => 'pecas');
  raise exception 'FALHOU: aceitou a mesma foto duas vezes';
exception when others then
  if sqlerrm like 'FALHOU%' then raise; end if;
  raise notice 'ok: foto repetida rejeitada (%)', sqlerrm;
end $$;

-- foto que não existe no bucket é rejeitada
do $$ begin
  perform pni_criar_item(array[current_setting('pni_teste.comum') || '/teste-1.jpg', current_setting('pni_teste.comum') || '/nao-existe.jpg'], p_local => 'pecas');
  raise exception 'FALHOU: aceitou foto inexistente';
exception when others then
  if sqlerrm like 'FALHOU%' then raise; end if;
  raise notice 'ok: foto inexistente rejeitada (%)', sqlerrm;
end $$;

-- cria com 2 fotos
do $$ declare r jsonb; begin
  r := pni_criar_item(array[current_setting('pni_teste.comum') || '/teste-1.jpg', current_setting('pni_teste.comum') || '/teste-2.jpg'], 3, 'usada_boa', 'parece engrenagem', p_local => 'pecas');
  if r->>'codigo' !~ '^PNI-[0-9]{6,}$' then raise exception 'FALHOU: código automático estranho %', r->>'codigo'; end if;
  perform set_config('pni_teste.item1', r->>'id', true);
  raise notice 'ok: item criado %', r->>'codigo';
end $$;

-- código próprio
do $$ declare r jsonb; begin
  r := pni_criar_item(array[current_setting('pni_teste.comum') || '/teste-3.jpg', current_setting('pni_teste.comum') || '/teste-4.jpg'], 1, 'sucata', null, 'ABC-1', p_local => 'pecas');
  perform set_config('pni_teste.item2', r->>'id', true);
  raise notice 'ok: item com código próprio %', r->>'codigo';
end $$;

-- código próprio duplicado (sem diferenciar maiúscula) é rejeitado
do $$ begin
  perform pni_criar_item(array[current_setting('pni_teste.comum') || '/teste-5.jpg', current_setting('pni_teste.comum') || '/teste-6.jpg'], 1, 'sucata', null, 'abc-1', p_local => 'pecas');
  raise exception 'FALHOU: aceitou código duplicado';
exception when unique_violation then
  raise notice 'ok: código duplicado rejeitado (%)', sqlerrm;
end $$;

-- código no formato reservado PNI-n é rejeitado
do $$ begin
  perform pni_criar_item(array[current_setting('pni_teste.comum') || '/teste-5.jpg', current_setting('pni_teste.comum') || '/teste-6.jpg'], 1, 'sucata', null, 'PNI-999999', p_local => 'pecas');
  raise exception 'FALHOU: aceitou código reservado';
exception when others then
  if sqlerrm like 'FALHOU%' then raise; end if;
  raise notice 'ok: código reservado rejeitado (%)', sqlerrm;
end $$;

-- localização obrigatória; Box Técnico exige o técnico (pni-06)
do $$ begin
  perform pni_criar_item(array[current_setting('pni_teste.comum') || '/teste-5.jpg', current_setting('pni_teste.comum') || '/teste-6.jpg']);
  raise exception 'FALHOU: aceitou item sem localização';
exception when others then
  if sqlerrm like 'FALHOU%' then raise; end if;
  raise notice 'ok: sem localização rejeitado (%)', sqlerrm;
end $$;
do $$ begin
  perform pni_criar_item(array[current_setting('pni_teste.comum') || '/teste-5.jpg', current_setting('pni_teste.comum') || '/teste-6.jpg'], p_local => 'box_tecnico');
  raise exception 'FALHOU: aceitou Box Técnico sem técnico';
exception when others then
  if sqlerrm like 'FALHOU%' then raise; end if;
  raise notice 'ok: Box Técnico sem técnico rejeitado (%)', sqlerrm;
end $$;

-- usuário comum NÃO muda status nem edita
do $$ begin
  perform pni_mudar_status(current_setting('pni_teste.item1')::uuid, 'identificado');
  raise exception 'FALHOU: usuário comum mudou status';
exception when insufficient_privilege then
  raise notice 'ok: comum não muda status (%)', sqlerrm;
end $$;
do $$ begin
  perform pni_atualizar_item(current_setting('pni_teste.item1')::uuid, '{"descricao":"x"}');
  raise exception 'FALHOU: usuário comum editou';
exception when insufficient_privilege then
  raise notice 'ok: comum não edita (%)', sqlerrm;
end $$;

-- nenhuma escrita direta nas tabelas
do $$ begin
  update pni_itens set descricao = 'hack';
  raise exception 'FALHOU: update direto permitido';
exception when insufficient_privilege then
  raise notice 'ok: update direto bloqueado';
end $$;
do $$ begin
  insert into pni_itens (criado_por) values (auth.uid());
  raise exception 'FALHOU: insert direto permitido';
exception when insufficient_privilege then
  raise notice 'ok: insert direto bloqueado';
end $$;

-- comum LÊ (captura vê a lista)
do $$ begin
  if (select count(*) from pni_itens where id = current_setting('pni_teste.item1')::uuid) <> 1 then
    raise exception 'FALHOU: usuário comum não lê o item';
  end if;
  raise notice 'ok: comum lê';
end $$;

reset role;

-- ════════ como LOGIN SEM CADASTRO no portal ═════════════════════════
select set_config('request.jwt.claims', json_build_object('sub', current_setting('pni_teste.estranho'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  if (select count(*) from pni_itens) <> 0 then raise exception 'FALHOU: login sem cadastro lê itens'; end if;
  raise notice 'ok: login sem cadastro não lê';
end $$;
do $$ begin
  perform pni_criar_item(array['x/1.jpg', 'x/2.jpg'], p_local => 'pecas');
  raise exception 'FALHOU: login sem cadastro criou item';
exception when insufficient_privilege then
  raise notice 'ok: login sem cadastro não cria';
end $$;
reset role;

-- ════════ como ANON ═════════════════════════════════════════════════
select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
set local role anon;
do $$ begin
  perform 1 from pni_itens;
  raise exception 'FALHOU: anon leu pni_itens';
exception when insufficient_privilege then
  raise notice 'ok: anon não lê';
end $$;
do $$ begin
  perform pni_mudar_status(gen_random_uuid(), 'identificado');
  raise exception 'FALHOU: anon chamou RPC';
exception when insufficient_privilege then
  raise notice 'ok: anon não chama RPC';
end $$;
reset role;

-- ════════ como SETOR DE PEÇAS (admin/dev) ═══════════════════════════
select set_config('request.jwt.claims', json_build_object('sub', current_setting('pni_teste.gestor'), 'role', 'authenticated')::text, true);
set local role authenticated;

-- transições inválidas
do $$ declare p text; begin
  foreach p in array array['precificado', 'a_venda', 'vendido'] loop
    begin
      perform pni_mudar_status(current_setting('pni_teste.item1')::uuid, p::pni_status);
      raise exception 'FALHOU: aceitou aguardando → %', p;
    exception when others then
      if sqlerrm like 'FALHOU%' then raise; end if;
      raise notice 'ok: aguardando → % rejeitado (%)', p, sqlerrm;
    end;
  end loop;
end $$;

-- identificar sem aplicação é rejeitado
do $$ begin
  perform pni_mudar_status(current_setting('pni_teste.item1')::uuid, 'identificado');
  raise exception 'FALHOU: identificou sem aplicação';
exception when others then
  if sqlerrm like 'FALHOU%' then raise; end if;
  raise notice 'ok: identificar sem aplicação rejeitado (%)', sqlerrm;
end $$;

-- com aplicação (tipo + qualquer marca) identifica
do $$ begin
  perform pni_definir_aplicacoes(current_setting('pni_teste.item1')::uuid,
    jsonb_build_array(jsonb_build_object('tipo_maquina_id', (select id from maquina_tipos order by ordem limit 1), 'marca_id', null)));
  perform pni_mudar_status(current_setting('pni_teste.item1')::uuid, 'identificado');
  raise notice 'ok: identificado';
end $$;

-- precificar sem preço é rejeitado; com preço passa; volta uma etapa
do $$ begin
  begin
    perform pni_mudar_status(current_setting('pni_teste.item1')::uuid, 'precificado');
    raise exception 'FALHOU: precificou sem preço';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    raise notice 'ok: precificar sem preço rejeitado (%)', sqlerrm;
  end;
  perform pni_atualizar_item(current_setting('pni_teste.item1')::uuid, '{"preco_sugerido": 150.5}');
  perform pni_mudar_status(current_setting('pni_teste.item1')::uuid, 'precificado');
  perform pni_mudar_status(current_setting('pni_teste.item1')::uuid, 'identificado');
  perform pni_mudar_status(current_setting('pni_teste.item1')::uuid, 'precificado');
  perform pni_mudar_status(current_setting('pni_teste.item1')::uuid, 'a_venda');
  raise notice 'ok: precificado → identificado → precificado → à venda';
end $$;

-- não dá para apagar o preço de item à venda
do $$ begin
  perform pni_atualizar_item(current_setting('pni_teste.item1')::uuid, '{"preco_sugerido": null}');
  raise exception 'FALHOU: apagou preço de item à venda';
exception when others then
  if sqlerrm like 'FALHOU%' then raise; end if;
  raise notice 'ok: preço obrigatório à venda (%)', sqlerrm;
end $$;

-- descartar sem motivo é rejeitado; com motivo passa; descartado é final
do $$ begin
  begin
    perform pni_mudar_status(current_setting('pni_teste.item2')::uuid, 'descartado');
    raise exception 'FALHOU: descartou sem motivo';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    raise notice 'ok: descarte sem motivo rejeitado (%)', sqlerrm;
  end;
  perform pni_mudar_status(current_setting('pni_teste.item2')::uuid, 'descartado', 'ferrugem, sem uso');
  begin
    perform pni_mudar_status(current_setting('pni_teste.item2')::uuid, 'aguardando_identificacao');
    raise exception 'FALHOU: saiu de descartado';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    raise notice 'ok: descartado é final (%)', sqlerrm;
  end;
end $$;

-- não identificável segue o fluxo sem descrição/aplicação
reset role;
insert into storage.objects (bucket_id, name, owner)
select 'pni-fotos', current_setting('pni_teste.gestor') || '/teste-g' || n || '.jpg', current_setting('pni_teste.gestor')::uuid
from generate_series(1, 2) n;
set local role authenticated;
do $$ declare r jsonb; begin
  r := pni_criar_item(array[current_setting('pni_teste.gestor') || '/teste-g1.jpg', current_setting('pni_teste.gestor') || '/teste-g2.jpg'], p_local => 'pecas');
  perform pni_atualizar_item((r->>'id')::uuid, '{"nao_identificavel": true}');
  perform pni_mudar_status((r->>'id')::uuid, 'identificado');
  perform pni_mudar_status((r->>'id')::uuid, 'descartado', 'ninguém sabe o que é');
  raise notice 'ok: não identificável → identificado → descartado';
end $$;

-- lote: um passa, outro falha, sem derrubar o primeiro
do $$ declare r jsonb; begin
  r := pni_mudar_status_lote(array[current_setting('pni_teste.item1')::uuid, current_setting('pni_teste.item2')::uuid], 'vendido');
  if jsonb_array_length(r->'alterados') <> 1 or jsonb_array_length(r->'erros') <> 1 then
    raise exception 'FALHOU: lote devolveu %', r;
  end if;
  raise notice 'ok: lote parcial %', r;
end $$;

-- histórico: quem, quando, de → para
do $$ declare n int; begin
  select count(*) into n from pni_historico where item_id = current_setting('pni_teste.item1')::uuid and campo = 'status';
  if n < 6 then raise exception 'FALHOU: histórico de status incompleto (% linhas)', n; end if;
  if exists (select 1 from pni_historico where item_id = current_setting('pni_teste.item1')::uuid and usuario is null) then
    raise exception 'FALHOU: histórico sem usuário';
  end if;
  if not exists (select 1 from pni_historico where item_id = current_setting('pni_teste.item1')::uuid and campo = 'preco' and para = '150.50') then
    raise exception 'FALHOU: histórico de preço ausente';
  end if;
  raise notice 'ok: histórico com % mudanças de status', n;
end $$;

-- soft delete some da leitura
do $$ begin
  perform pni_excluir_item(current_setting('pni_teste.item1')::uuid);
  if exists (select 1 from pni_itens where id = current_setting('pni_teste.item1')::uuid) then
    raise exception 'FALHOU: item excluído continua visível';
  end if;
  raise notice 'ok: excluído some da lista';
end $$;

reset role;
do $$ begin raise notice '══ TODOS OS TESTES PASSARAM (nada foi gravado: rollback) ══'; end $$;
rollback;
