-- =============================================================================
-- PÁGINA DA GARANTIA (QR code do adesivo) — dúvidas e uso da página.
--
-- A página pública /garantia (public/garantia/index.html) não tem login e não
-- fala com o banco: fala com /api/garantia-cliente/*, que grava com service
-- role. RLS ligada SEM policy + REVOKE: a chave anônima não lê nem escreve.
--
-- O painel fica em /garantias → aba "Página do cliente".
-- Rodar no SQL Editor do Supabase. Idempotente.
-- =============================================================================

-- Dúvidas que o cliente escreve no formulário "Ficou com alguma dúvida?"
create table if not exists public.garantia_cliente_duvidas (
  id             bigint generated always as identity primary key,
  criado_em      timestamptz not null default now(),
  nome           text not null check (char_length(nome) between 1 and 120),
  chassi_final   text check (char_length(chassi_final) <= 40),
  mensagem       text not null check (char_length(mensagem) between 1 and 2000),
  status         text not null default 'nova'
                 check (status in ('nova', 'respondida', 'arquivada')),
  resposta       text check (char_length(resposta) <= 4000),
  respondido_por text,
  respondido_em  timestamptz,
  sessao         text check (char_length(sessao) <= 40)
);
create index if not exists garantia_cliente_duvidas_criado_idx
  on public.garantia_cliente_duvidas (criado_em desc);
create index if not exists garantia_cliente_duvidas_status_idx
  on public.garantia_cliente_duvidas (status);

-- O que o cliente faz na página (sem dado pessoal): visitas, perguntas
-- tocadas, buscas, cliques no WhatsApp. Base para melhorar as perguntas.
create table if not exists public.garantia_cliente_eventos (
  id        bigint generated always as identity primary key,
  criado_em timestamptz not null default now(),
  tipo      text not null check (tipo in (
              'visita', 'pergunta_rapida', 'faq', 'busca', 'busca_sem_resultado',
              'whatsapp', 'consulta_trator', 'duvida_enviada')),
  valor     text check (char_length(valor) <= 200),
  sessao    text check (char_length(sessao) <= 40)
);
create index if not exists garantia_cliente_eventos_criado_idx
  on public.garantia_cliente_eventos (criado_em desc);
create index if not exists garantia_cliente_eventos_tipo_idx
  on public.garantia_cliente_eventos (tipo, criado_em desc);

alter table public.garantia_cliente_duvidas enable row level security;
alter table public.garantia_cliente_eventos enable row level security;
revoke all on public.garantia_cliente_duvidas from anon, authenticated;
revoke all on public.garantia_cliente_eventos from anon, authenticated;

notify pgrst, 'reload schema';
