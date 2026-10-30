-- Organograma — telas que cada tarefa pede e com qual nível (aba Processos → Organograma → Tarefas).
-- telas = [{ "tela": "pos", "nivel": "editar" | "ver" }]. É só um REGISTRO do que a tarefa precisa:
-- a tela compara com o acesso real da pessoa, mas nada aqui muda permissão. Idempotente.
-- Precisa de sql/organograma-tarefas.sql antes.
alter table public.org_tarefas add column if not exists telas jsonb not null default '[]'::jsonb;
notify pgrst, 'reload schema';
