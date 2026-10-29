-- Modelos de etiqueta térmica (padrões) — 29/10/2026.
-- O admin salva até 10 arrumações das linhas da etiqueta (ordem, mostrar/esconder,
-- fonte, negrito — o mesmo LayoutCampo[] do editor do PPV) com um nome; quem
-- imprime escolhe um deles em vez de configurar o editor. Tamanho do rolo e
-- ajuste fino NÃO entram (são da impressora, ficam em cada navegador).
--
-- Escrita e leitura SÓ pelas rotas /api/etiquetas/modelos (service role):
-- RLS ligado sem policy + REVOKE. Idempotente.

create table if not exists public.etiquetas_modelos (
  id            bigint generated always as identity primary key,
  nome          text not null check (char_length(nome) between 1 and 40),
  layout        jsonb not null,
  ordem         integer not null default 0,
  criado_por    uuid,
  criado_nome   text,
  criado_em     timestamptz not null default now(),
  atualizado_por_nome text,
  atualizado_em timestamptz not null default now()
);
create unique index if not exists etiquetas_modelos_nome_uq on public.etiquetas_modelos (lower(nome));

alter table public.etiquetas_modelos enable row level security;
revoke all on public.etiquetas_modelos from anon, authenticated;

notify pgrst, 'reload schema';
