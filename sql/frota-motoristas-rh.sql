-- =============================================================================
-- Aba Motoristas (Frota ↔ RH) — migração no Supabase do PORTAL
--
-- 1) cnh_categoria: o RH não tem NADA de CNH; número/validade já existiam aqui
--    (enriquecidos pelas multas da Rota Exata), faltava a categoria (A, B, AB…).
-- 2) campos_manuais: mesmo padrão de frota_veiculos — campo editado por humano
--    no portal nunca mais é sobrescrito pelo sync da Rota Exata (que grava
--    e_motorista a cada varredura e cnh/cnh_validade de carona nas multas).
-- 3) pessoa_id (coluna já existente, nunca usada) passa a guardar o
--    rh_funcionarios.id do Supabase do RH — o de-para é persistido no primeiro
--    match por CPF (feito pela API). Único quando preenchido.
--
-- Correr no Supabase (PORTAL): SQL Editor -> colar -> Run. Idempotente.
-- =============================================================================
ALTER TABLE frota_motoristas
  ADD COLUMN IF NOT EXISTS cnh_categoria  TEXT,
  ADD COLUMN IF NOT EXISTS campos_manuais TEXT[] NOT NULL DEFAULT '{}';

CREATE UNIQUE INDEX IF NOT EXISTS uq_frota_mot_pessoa
  ON frota_motoristas (pessoa_id) WHERE pessoa_id IS NOT NULL;

COMMENT ON COLUMN frota_motoristas.pessoa_id
  IS 'rh_funcionarios.id (Supabase do RH) — de-para persistido no 1º match por CPF';
COMMENT ON COLUMN frota_motoristas.campos_manuais
  IS 'campos editados no portal — o sync da Rota Exata nunca mais os toca (padrão frota_veiculos)';

NOTIFY pgrst, 'reload schema';
