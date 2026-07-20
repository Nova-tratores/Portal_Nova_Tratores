-- Guarda qual "motorista" da Rota Exata corresponde ao técnico, pra o vínculo
-- de veículo no portal refletir na Rota Exata (POST /motoristas) sem depender de
-- casar nomes (que não batem: Pedro Motta ≠ PAULO MOTTA, etc.).
ALTER TABLE tecnico_veiculos ADD COLUMN IF NOT EXISTS motorista_id bigint;
