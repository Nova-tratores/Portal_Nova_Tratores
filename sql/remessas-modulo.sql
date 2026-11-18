-- Módulo Remessas (18/11/2026): lista, histórico e demonstração de máquina com prazo e renovação.
--
-- `remessas` continua sendo o ESPELHO da Omie (sync estoque-sync-remessas). Aqui ficam só as
-- decisões humanas e o que o portal emite:
--   remessas_controle  uma linha por remessa (conta + id_remessa): prazo da demonstração, situação
--                      decidida à mão (virou venda, renovada, devolvida), ligação da renovação.
--   remessas_eventos   o histórico de cada remessa (quem fez o quê e quando).
--   remessas_emissoes  o que o portal criou na Omie: remessa de demonstração (5.912/6.912) e
--                      nota de entrada de retorno (1.913/2.913). cod_int = código de integração
--                      na Omie (idempotência: resposta incerta é conferida por ele).
-- Também apaga as 118 cópias antigas (08/04/2026, app legado) de remessas da CASTRO gravadas como
-- 'nova' — a mesma remessa aparecia nas duas empresas com a descrição "Produto #id".
-- Rodar no SQL Editor. Idempotente.

create table if not exists remessas_controle (
  conta_omie       text not null check (conta_omie in ('nova','castro')),
  id_remessa       bigint not null,
  prazo_ate        date,                                -- fim da demonstração (padrão: emissão + 30 dias)
  situacao_manual  text check (situacao_manual in ('virou_venda','renovada','devolvida')),
  renovada_para    bigint,                              -- id_remessa da remessa nova (mesma conta)
  renovada_de      bigint,                              -- id_remessa da original
  pedido_venda     text,                                -- quando virou venda
  responsavel_id   uuid,                                -- quem acompanha (recebe os avisos de prazo)
  obs              text,
  aviso_nivel      smallint not null default 0,         -- 1 = avisou "vence em 5 dias", 2 = avisou vencida
  atualizado_em    timestamptz not null default now(),
  primary key (conta_omie, id_remessa)
);

create table if not exists remessas_eventos (
  id          bigserial primary key,
  conta_omie  text not null,
  id_remessa  bigint not null,
  tipo        text not null,          -- emitida, faturada, prazo, aviso_prazo, renovada, retorno_emitido, devolvida, virou_venda, obs, erro
  detalhe     text,
  dados       jsonb,
  user_id     uuid,
  user_nome   text,
  criado_em   timestamptz not null default now()
);
create index if not exists remessas_eventos_rem_idx on remessas_eventos (conta_omie, id_remessa, criado_em);

create table if not exists remessas_emissoes (
  id             uuid primary key default gen_random_uuid(),
  conta_omie     text not null check (conta_omie in ('nova','castro')),
  tipo           text not null check (tipo in ('demonstracao','retorno')),
  cod_int        text not null unique,                 -- DEMO-<n> / RET-<idRemessa>-<n>
  n_cod          bigint,                               -- nCodRem (remessa) ou nCodNotaEnt (retorno)
  id_remessa_ref bigint,                               -- retorno: a remessa que volta; renovação: a original
  renovacao      boolean not null default false,
  n_cod_cli      bigint,
  cliente        text,
  itens          jsonb not null default '[]',
  valor_total    numeric(14,2),
  prazo_ate      date,
  texto          text,
  status         text not null default 'criando' check (status in ('criando','criada','faturada','falhou','cancelada')),
  nf_numero      text,
  nf_chave       text,
  erro           text,
  user_id        uuid,
  user_nome      text,
  criado_em      timestamptz not null default now(),
  faturado_em    timestamptz,
  atualizado_em  timestamptz not null default now()
);
create index if not exists remessas_emissoes_ref_idx on remessas_emissoes (conta_omie, id_remessa_ref);
create index if not exists remessas_emissoes_ncod_idx on remessas_emissoes (conta_omie, n_cod);

alter table remessas_controle enable row level security;
alter table remessas_eventos  enable row level security;
alter table remessas_emissoes enable row level security;
revoke all on remessas_controle, remessas_eventos, remessas_emissoes from anon, authenticated;

-- cópias antigas da CASTRO gravadas como 'nova' (só as que existem também como castro e não
-- foram atualizadas pelo sync de hoje — o sync atual nunca reescreveu essas linhas)
delete from remessas n
 where n.conta_omie = 'nova'
   and n.atualizado_em < '2026-04-09'
   and exists (select 1 from remessas c where c.conta_omie = 'castro' and c.id_remessa = n.id_remessa);
delete from movimentacao_produtos n
 where n.conta_omie = 'nova'
   and exists (select 1 from remessas c where c.conta_omie = 'castro' and c.id_remessa = n.id_remessa)
   and not exists (select 1 from remessas r where r.conta_omie = 'nova' and r.id_remessa = n.id_remessa);

-- agendador: aviso de prazo das demonstrações (sino), todo dia às 07:00
insert into agendamentos (chave, handler, nome, modulo, descricao, tipo, hora, intervalo_min, janela_inicio, janela_fim, dias_semana, parametros, prioridade, usa_omie, grupo, duracao_max_min, ativo) values
  ('remessas-avisos-prazo', 'remessas-avisos-prazo', 'Remessas: prazo das demonstrações', 'Estoque',
   'Avisa no sino quem acompanha a demonstração quando faltam 5 dias e quando vence (uma vez cada).',
   'diario', '07:00', null, null, null, null, '{}', 'rapido', false, null, 5, true)
on conflict (chave) do nothing;

notify pgrst, 'reload schema';
