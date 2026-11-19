-- Várias estações de impressão + destino salvo POR PESSOA — 19/11/2026 (José).
-- Antes: uma estação só (id 'termica', "ROGERIA") e a escolha "Na ROGERIA / Neste aparelho"
-- ficava só no navegador. Agora:
--   • cada PC com impressora abre /estacao-impressao, dá um nome e vira uma estação
--     (linha em etiquetas_estacao, id gerado no PC; a antiga continua sendo 'termica');
--   • cada pedido da fila diz para qual estação vai (estacao_id);
--   • cada pessoa escolhe UMA vez para onde as etiquetas dela vão (etiquetas_destino_usuario):
--     marca no computador e o celular segue.
-- Depende de sql/etiquetas-estacao.sql. Idempotente. Só as rotas (service role) leem/escrevem.

alter table public.etiquetas_estacao_fila add column if not exists estacao_id text not null default 'termica';
create index if not exists etiquetas_estacao_fila_estacao_idx on public.etiquetas_estacao_fila (estacao_id, status, criado_em);

create table if not exists public.etiquetas_destino_usuario (
  usuario_id    uuid primary key,
  -- 'local' = imprime no próprio aparelho; senão o id da estação (etiquetas_estacao.id)
  destino       text not null,
  atualizado_em timestamptz not null default now()
);

alter table public.etiquetas_destino_usuario enable row level security;
revoke all on public.etiquetas_destino_usuario from anon, authenticated;

notify pgrst, 'reload schema';
