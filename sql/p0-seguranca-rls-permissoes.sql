-- =====================================================================
-- P0 SEGURANÇA — Trava a tabela de permissões (fim da auto-promoção a admin)
-- =====================================================================
-- Problema: portal_permissoes não tinha RLS. Como a anon key é pública (vai pro
-- navegador), qualquer usuário logado podia rodar no console:
--     supabase.from('portal_permissoes').update({ is_admin: true }).eq('user_id', MEU_ID)
-- e virar admin. O painel admin também gravava direto do navegador.
--
-- Correção: LEITURA continua liberada (o painel e o usePermissoes precisam ler),
-- mas ESCRITA pelo cliente é BLOQUEADA. Toda escrita passa a ser feita só pelo
-- servidor, via SERVICE_ROLE_KEY (que ignora RLS), na rota /api/admin/permissoes,
-- que verifica se o chamador é admin.
--
-- Aplicar no Supabase (SQL Editor). Idempotente.
-- =====================================================================

ALTER TABLE portal_permissoes ENABLE ROW LEVEL SECURITY;

-- Remove políticas permissivas antigas, se existirem
DROP POLICY IF EXISTS portal_permissoes_all    ON portal_permissoes;
DROP POLICY IF EXISTS portal_permissoes_select ON portal_permissoes;
DROP POLICY IF EXISTS portal_permissoes_write  ON portal_permissoes;

-- LEITURA: liberada (anon + authenticated). Mantém painel admin e usePermissoes
-- funcionando, além das rotas de servidor que leem com a anon key.
-- (P1: apertar para o usuário ler só a própria linha + leitura ampla via servidor.)
CREATE POLICY portal_permissoes_select
  ON portal_permissoes FOR SELECT
  USING (true);

-- ESCRITA: NENHUMA política de INSERT/UPDATE/DELETE.
-- Com RLS ligado e sem política de escrita, o cliente (anon/authenticated) NÃO
-- pode escrever. O SERVICE_ROLE_KEY (usado só no servidor) ignora o RLS, então
-- as rotas /api/admin/permissoes e /api/pos/requisicoes/criar-usuario continuam
-- funcionando normalmente.

-- =====================================================================
-- Opcional: criar automaticamente a linha de permissões (vazia) quando um novo
-- usuário se cadastra. Antes o navegador inseria essa linha; agora que a escrita
-- pelo cliente está bloqueada, este trigger cobre o cadastro. Sem ele, o novo
-- usuário simplesmente fica sem linha (sem acesso) até um admin liberar — o que
-- também é seguro. Descomente se quiser o comportamento automático.
-- =====================================================================
-- CREATE OR REPLACE FUNCTION public.criar_permissao_padrao()
-- RETURNS TRIGGER
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- SET search_path = public
-- AS $$
-- BEGIN
--   INSERT INTO portal_permissoes (user_id, is_admin, categoria, modulos_permitidos)
--   VALUES (NEW.id, false, '', '{}')
--   ON CONFLICT (user_id) DO NOTHING;
--   RETURN NEW;
-- END;
-- $$;
--
-- DROP TRIGGER IF EXISTS trg_criar_permissao_padrao ON auth.users;
-- CREATE TRIGGER trg_criar_permissao_padrao
--   AFTER INSERT ON auth.users
--   FOR EACH ROW EXECUTE FUNCTION public.criar_permissao_padrao();
