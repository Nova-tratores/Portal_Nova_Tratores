-- =====================================================================
-- Planta Viva — Gate 1 (docs/planta-viva-plano.md)
-- Tabela de resumo dos números da tela /planta, gravada pelo worker a cada 5 min
-- (tarefa `planta-snapshot` do agendador). Idempotente: pode rodar de novo.
--
-- Sem esta migration o deploy NÃO quebra: a tarefa responde "pulado" e
-- GET /api/planta devolve 503 { migracaoFaltando: true }.
-- =====================================================================

create table if not exists planta_kpi (
  kpi_id       text        not null,               -- catálogo em src/lib/planta/regras.ts
  conta        text        not null check (conta in ('NOVA', 'CASTRO', 'TODAS')),
  comodo       text        not null,
  contagem     integer     not null default 0,
  valor        numeric,                            -- null = número sem R$
  detalhe      jsonb       not null default '{}'::jsonb,
  sensivel     boolean     not null default false, -- só admin vê valor e detalhe (corte na rota)
  fonte        text        not null,               -- contas | recebimentos | produtos | nativo
  erro         text,                               -- leitura/cálculo do cômodo falhou nesta rodada
  dado_ate     timestamptz,                        -- idade do espelho de origem
  calculado_em timestamptz not null default now(),
  primary key (kpi_id, conta)
);

comment on table planta_kpi is
  'Planta Viva: um número por (kpi_id, conta). Escrita só pelo worker (service role); leitura só por /api/planta.';

-- Fechada para o navegador: há valores do financeiro aqui. RLS ligada SEM policy
-- + REVOKE (mesmo padrão de mkt_* e kb_*). Só a service role lê e grava.
alter table planta_kpi enable row level security;
revoke all on planta_kpi from anon, authenticated;

-- Agendamento (se o agendador já existe: sql/agendador.sql). Só cadastra; não mexe se já houver.
do $$
begin
  if to_regclass('public.agendamentos') is not null then
    insert into agendamentos (chave, handler, nome, modulo, descricao, tipo, intervalo_min, dias_semana, janela_inicio, janela_fim, hora, prioridade, usa_omie, duracao_max_min, ativo)
    values ('planta-snapshot', 'planta-snapshot', 'Planta Viva — números da tela', 'Sistema',
            'Recalcula os números da tela /planta a partir dos espelhos (contas, recebimentos, PPV, OS, estoque). Não usa a Omie.',
            'intervalo', 5, null, null, null, null, 'rapido', false, 3, true)
    on conflict (chave) do nothing;
  end if;
end $$;

notify pgrst, 'reload schema';

-- Conferência depois de aplicar (deve voltar a tabela e, se houver agendador, 1 linha):
--   select count(*) from planta_kpi;
--   select chave, ativo, intervalo_min from agendamentos where chave = 'planta-snapshot';
