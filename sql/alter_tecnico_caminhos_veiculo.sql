-- Adiciona campos de veiculo na tabela tecnico_caminhos
-- O tecnico escolhe o carro no app antes de sair
ALTER TABLE tecnico_caminhos ADD COLUMN IF NOT EXISTS adesao_id INTEGER;
ALTER TABLE tecnico_caminhos ADD COLUMN IF NOT EXISTS placa TEXT;
