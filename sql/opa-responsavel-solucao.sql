-- Opa: responsável + solução escrita pelo criador.
-- O criador do Opa pode indicar QUEM vai resolver (responsavel) e escrever a
-- SOLUÇÃO. Campos livres, opcionais. A UPDATE policy já é USING(true), então o
-- front grava direto (mesmo caminho do resolver_opa).
ALTER TABLE portal_opas ADD COLUMN IF NOT EXISTS responsavel TEXT;
ALTER TABLE portal_opas ADD COLUMN IF NOT EXISTS solucao TEXT;
