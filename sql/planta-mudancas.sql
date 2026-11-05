-- Planta Viva: só recalcula quando uma tabela de origem mudou (05/11/2026).
--
-- O robô `planta-snapshot` relia ~16 tabelas inteiras a cada 5 min (7–24 s por rodada,
-- com timeout em contas_pagar/receber) disputando o banco com o POS e o PPV.
-- Agora ele chama esta função antes (milissegundos): ela devolve os contadores de
-- inserção/alteração/exclusão de cada tabela de origem (pg_stat_user_tables) e, para
-- produtos, só o retrato do estoque negativo (o sync de preços regrava produtos a cada
-- 10 min sem mudar o estoque). Se a "assinatura" for igual à da última rodada, o robô pula.
-- Sem esta função o robô continua recalculando sempre (só no novo ritmo de 20 min).
-- Idempotente: pode rodar de novo.

create or replace function public.planta_assinatura_fontes()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select jsonb_build_object(
    'tabelas', coalesce((
      select jsonb_object_agg(s.relname, s.n_tup_ins + s.n_tup_upd + s.n_tup_del)
      from pg_stat_user_tables s
      where s.schemaname = 'public'
        and s.relname in (
          'contas_pagar', 'contas_receber', 'finan_pagar',
          'Formulario', 'status_proposta', 'vendedores', 'Proposta_Fabrica', 'fase_fabrica',
          'tratorilson_solicitacoes', 'Ordem_Servico', 'garantias', 'recebimentos_nfe',
          'pedidos', 'tecnico_metricas', 'Requisicao', 'pecas_alocacao_pendencias', 'logs_ppo'
        )
    ), '{}'::jsonb),
    'produtos_negativos', (
      select jsonb_build_array(count(*), coalesce(sum(estoque), 0))
      from produtos where estoque < 0
    )
  );
$$;

revoke all on function public.planta_assinatura_fontes() from public, anon, authenticated;
grant execute on function public.planta_assinatura_fontes() to service_role;

-- Ritmo novo: 20 min (era 5).
update agendamentos set intervalo_min = 20 where chave = 'planta-snapshot';

notify pgrst, 'reload schema';

-- Conferência:
--   select planta_assinatura_fontes();
--   select chave, intervalo_min from agendamentos where chave = 'planta-snapshot';
