-- Vigia de atividade suspeita (11/2026). O robô lê o audit_log e o uso da API a cada 15 min
-- e grava aqui cada alerta (UNIQUE chave = não repete). Quem recebe o aviso no sino: Henri
-- Irneh (financeiro@novatratores.com.br), em lib/vigia-atividade/server.ts.
-- Só avisa; não trava ninguém. Escrita e leitura só pelo servidor (service role).

create table if not exists vigia_atividade_alertas (
  id            bigserial primary key,
  chave         text not null unique,
  tipo          text not null check (tipo in ('permissao', 'exportacao', 'lote')),
  gravidade     text not null check (gravidade in ('alta', 'media')),
  user_id       uuid,
  user_nome     text,
  titulo        text not null,
  descricao     text,
  quando        timestamptz not null,
  detalhes      jsonb not null default '{}'::jsonb,
  notificado    boolean not null default false,   -- false = gravado sem aviso (ação do próprio destinatário)
  situacao      text not null default 'novo' check (situacao in ('novo', 'visto', 'normal', 'investigar')),
  situacao_por  text,
  situacao_em   timestamptz,
  criado_em     timestamptz not null default now()
);
create index if not exists vigia_atividade_alertas_quando_idx on vigia_atividade_alertas (quando desc);

alter table vigia_atividade_alertas enable row level security;
revoke all on vigia_atividade_alertas from anon, authenticated;

-- Agendador: a cada 15 min, todo dia (fim de semana e madrugada também — é quando importa).
insert into agendamentos (chave, handler, nome, modulo, descricao, tipo, intervalo_min, dias_semana, janela_inicio, janela_fim, hora, prioridade, usa_omie, duracao_max_min, ativo) values
  ('vigia-atividade', 'vigia-atividade', 'Vigia de atividade suspeita', 'Atividades',
   'Lê o histórico de ações e avisa no sino: mudança de permissão, exportação/download em volume e ação sensível (apagar, cancelar, reverter…) repetida em lote. Só avisa.',
   'intervalo', 15, null, null, null, null, 'rapido', false, 5, true)
on conflict (chave) do nothing;

notify pgrst, 'reload schema';
