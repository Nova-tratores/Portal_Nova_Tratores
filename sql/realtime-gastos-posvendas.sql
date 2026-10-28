-- Gastos da Janela Mecânicos ao vivo (21/10/2026). Projeto Supabase do PORTAL (citrhumdk…).
-- Põe abastecimentos e despesas_relatorio na publicação do Realtime (Requisicao já está).
-- Idempotente: pode rodar mais de uma vez.
do $$
declare t text;
begin
  foreach t in array array['abastecimentos', 'despesas_relatorio', 'Requisicao'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
