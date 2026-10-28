-- Atendimento da aba "Revisões" do RFM (página de teste /feedbacks/crm/teste, 23/10/2026).
-- Projeto Supabase do PORTAL (citrhumdk…). Rodar no SQL Editor. Idempotente.
--
-- Uma linha por TRATOR (tratores."ID"): o atendimento da revisão que a fila está oferecendo
-- agora (`revisao`). Quando a revisão devida muda (ex.: fez a de 600 e a fila passa a oferecer a
-- de 900), a tela ignora a linha velha e o atendimento recomeça sozinho; a próxima gravação
-- sobrescreve.
-- Sem esta tabela a aba funciona igual em SIMULAÇÃO e leitura; gravar responde 503.
-- Escrita só pela rota /api/feedbacks/crm/revisoes (service role, autor vem do login).

create table if not exists public.feedback_revisoes_contato (
  trator_id          text primary key,
  revisao            integer,
  status             text not null default 'aberto'
                     check (status in ('aberto', 'agendada', 'nao_quer', 'arquivado')),
  tentativas         jsonb not null default '[]'::jsonb,   -- [{ data: ISO, canal: telefone|wpp|email|outro }]
  proximo_contato_em date,
  data_agendada      date,
  motivo             text,
  concluido_em       timestamptz,
  atualizado_por     text,
  atualizado_em      timestamptz not null default now(),
  criado_em          timestamptz not null default now()
);

create index if not exists feedback_revisoes_contato_status_idx on public.feedback_revisoes_contato (status);

alter table public.feedback_revisoes_contato enable row level security;
-- sem policy: o navegador não lê nem grava direto (tudo pela rota com service role)
revoke all on public.feedback_revisoes_contato from anon, authenticated;

-- 28/10/2026 (Radar Tratores → Controle de Revisões): motivo PRONTO de não fazer a revisão agora
-- (sem_horas, outro_lugar, nao_quer, parado, outro), para rastrear depois.
alter table public.feedback_revisoes_contato add column if not exists motivo_codigo text;

-- Horímetro que o cliente falou na ligação — uma linha por informação (histórico). A previsão da
-- revisão conta como leitura de verdade (fonte "cliente").
create table if not exists public.revisoes_leituras (
  id            bigint generated always as identity primary key,
  trator_id     text not null,           -- tratores."ID"
  horas         numeric not null check (horas >= 0),
  data          date not null,
  motivo_codigo text,
  nota          text,
  user_id       uuid,
  user_nome     text,
  criado_em     timestamptz not null default now()
);
create index if not exists revisoes_leituras_trator_idx on public.revisoes_leituras (trator_id, data desc);
alter table public.revisoes_leituras enable row level security;
revoke all on public.revisoes_leituras from anon, authenticated;

notify pgrst, 'reload schema';
