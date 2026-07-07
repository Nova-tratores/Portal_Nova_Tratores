-- =====================================================================
-- P1 (Trilho B) — Tranca o financeiro_usu (diretório de usuários)
-- =====================================================================
-- Antes: sem RLS. A anon key (pública) lia e escrevia tudo: dava pra dumpar
-- nomes/e-mails/função da equipe inteira, e até alterar o e-mail ou inativar
-- qualquer usuário direto do navegador.
--
-- Agora:
--  - LEITURA só para AUTENTICADOS (mata o dump anônimo dos e-mails). Todas as
--    telas continuam lendo (usuário logado = authenticated). As rotas de servidor
--    que liam com a anon key foram migradas pra service role (notificar, pos/lousa,
--    mecanicos, tarefas/users).
--  - UPDATE: cada usuário edita SÓ a própria linha (perfil: tema, nome, avatar...).
--  - Inativar/ativar OUTRO usuário (admin) passou pro servidor
--    (/api/admin/usuario-ativo), que usa service role.
--  - INSERT/DELETE pelo cliente: bloqueados. Usuários são criados pelo painel de
--    Administração (rota criar-usuario, service role, que ignora RLS).
--
-- Pré-requisito: o deploy do código que acompanha este SQL já deve estar no ar
-- (senão o toggle "ativo" e os leitores server-side quebram). Aplicar depois do deploy.
-- Idempotente.
-- =====================================================================

ALTER TABLE financeiro_usu ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS financeiro_usu_all    ON financeiro_usu;
DROP POLICY IF EXISTS financeiro_usu_select ON financeiro_usu;
DROP POLICY IF EXISTS financeiro_usu_update ON financeiro_usu;

-- Leitura: qualquer usuário autenticado (o diretório é usado em todo o portal).
CREATE POLICY financeiro_usu_select
  ON financeiro_usu FOR SELECT
  TO authenticated
  USING (true);

-- Update: só a própria linha (financeiro_usu.id = id do usuário no auth).
CREATE POLICY financeiro_usu_update
  ON financeiro_usu FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Sem política de INSERT/DELETE → cliente não cria/apaga. O servidor (service role)
-- faz isso via as rotas de admin.
