-- Requisições paradas: lembretes 3/7/15 dias + ida automática ao financeiro (10/11/2026).
-- Rodar no SQL Editor. Idempotente.
-- Sem esta migration o robô só faz a ida automática ao financeiro (lembretes desligados).
--
-- requisicao_lembretes: um registro por (requisição, nível) já disparado — é o que
-- impede repetir o aviso. Nível 1 = aviso a quem abriu (3 dias), 2 = tarefa na
-- Pendências (7 dias, tarefa_id), 3 = aviso ao gestor direto (15 dias).
-- Escrita só pelo robô (service role); RLS ligado sem policy.

create table if not exists public.requisicao_lembretes (
  req_id     bigint      not null,
  nivel      smallint    not null check (nivel in (1, 2, 3)),
  user_id    uuid,                       -- quem recebeu (null = solicitante sem login no portal)
  tarefa_id  bigint,                     -- portal_tarefas.id (nível 2)
  criado_em  timestamptz not null default now(),
  fechado_em timestamptz,                -- a requisição andou e a tarefa foi concluída
  primary key (req_id, nivel)
);

create index if not exists requisicao_lembretes_tarefa_aberta
  on public.requisicao_lembretes (req_id) where tarefa_id is not null and fechado_em is null;

alter table public.requisicao_lembretes enable row level security;
revoke all on public.requisicao_lembretes from anon, authenticated;

-- Agendamento (tela /agendamentos): a cada 30 min. Sem a tabela `agendamentos`
-- o instrumentation.ts roda o robô igual.
do $$
begin
  if to_regclass('public.agendamentos') is not null then
    insert into public.agendamentos (chave, handler, nome, modulo, descricao, tipo, intervalo_min, prioridade, usa_omie, duracao_max_min, ativo)
    values ('requisicoes-lembretes', 'requisicoes-lembretes', 'Requisições paradas', 'Requisições',
            'Requisição aberta com nota ou recibo, valor e fornecedor vai sozinha para o financeiro. As abertas desde 10/11/2026 geram aviso para quem abriu (3 dias), tarefa na Pendências (7 dias) e aviso ao gestor direto (15 dias).',
            'intervalo', 30, 'rapido', false, 5, true)
    on conflict (chave) do nothing;
  end if;
end $$;

notify pgrst, 'reload schema';

-- Conferência:
-- select nivel, count(*), count(fechado_em) from requisicao_lembretes group by 1 order by 1;
-- Rollback:
-- delete from agendamentos where chave = 'requisicoes-lembretes'; drop table requisicao_lembretes;
