-- Realtime de clientes e máquinas (projetos) para o POS (09/10/2026)
-- O POS mantém a lista de clientes carregada e a busca de equipamentos aberta;
-- com estas tabelas na publicação, cliente/máquina criados por outra pessoa
-- (ou pelo sync do Omie) aparecem na hora, sem recarregar a tela.
--
-- Idempotente. Rodar no SQL Editor do Supabase do portal.
-- Sem esta migration nada quebra: o atalho continua funcionando para quem cria
-- (a tela insere o item na hora), só os OUTROS usuários não veem ao vivo.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'portal_nt_clientes_PRINCIPAL'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public."portal_nt_clientes_PRINCIPAL";
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'portal_nt_projetos_PRINCIPAL'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public."portal_nt_projetos_PRINCIPAL";
  END IF;
END $$;

-- Segurança inalterada: o Realtime respeita a RLS de cada tabela.
-- portal_nt_clientes_PRINCIPAL já tem SELECT para authenticated (p1-rls-clientes.sql).
-- portal_nt_projetos_PRINCIPAL está SEM RLS hoje (lida direto do navegador em
-- requisições/marketing/feedbacks) — não mexer aqui; fechar exige revisar essas telas.
