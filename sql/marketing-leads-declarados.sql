-- =============================================================================
-- MARKETING — total de leads INFORMADO, quando eles não estão no sistema.
--
-- Numa feira os contatos costumam ser anotados no papel. O IRRIGASHOW 2026 é o
-- caso: 95 leads reais, nenhum digitado. Sem um lugar pra esse número, o
-- relatório à fábrica dizia "Leads captados: Não registrado", o que é pior que
-- o número aproximado que a equipe garante.
--
-- Regra de uso (lib/marketing/roi.ts): o contador de leads CADASTRADOS manda.
-- Este campo só entra quando não há nenhum lead no sistema — assim, no dia em
-- que a captura pelo /lead começar a ser usada, o número real assume sozinho e
-- ninguém precisa lembrar de apagar isto.
--
-- Depende de sql/marketing-acoes.sql. Aplicar à mão no SQL Editor do Supabase.
-- =============================================================================

-- SEÇÃO 0 — PRÉ-CHECK (só leitura)
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'mkt_acoes' AND column_name = 'leads_declarados';
--   -- esperado: 0 linhas na primeira execução

alter table mkt_acoes add column if not exists leads_declarados integer;

comment on column mkt_acoes.leads_declarados is
  'Total de leads INFORMADO pela equipe quando não estão cadastrados (anotados no papel). Só é usado se não houver nenhum lead em mkt_leads.';

notify pgrst, 'reload schema';

-- SEÇÃO 1 — VERIFICAÇÃO
--   SELECT nome, leads_declarados FROM mkt_acoes WHERE deleted_at IS NULL;
