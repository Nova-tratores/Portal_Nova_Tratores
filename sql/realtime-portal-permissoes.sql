-- Realtime de portal_permissoes (10/10/2026)
-- Caso real (08/10): o admin liberou "Dashboard de Vendas" para um usuário e a
-- pessoa continuou vendo "Acesso Restrito" porque a aba já estava aberta na
-- tela bloqueada — as permissões só eram lidas quando a página montava.
-- Com a tabela na publicação, o hook usePermissoes assina a PRÓPRIA linha
-- (filter user_id=eq.<id>) e relê na hora que o /admin salva.
--
-- Idempotente. Rodar no SQL Editor do Supabase do portal.
-- Sem esta migration nada quebra: o hook também relê ao voltar pra aba
-- (visibilitychange, mínimo 30 s) — só não é instantâneo.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'portal_permissoes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.portal_permissoes;
  END IF;
END $$;

-- Segurança inalterada: o Realtime respeita a RLS da tabela (o usuário só
-- recebe eventos das linhas que a policy de SELECT deixa ele ler).
