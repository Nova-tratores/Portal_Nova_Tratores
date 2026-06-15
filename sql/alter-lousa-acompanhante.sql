-- Lousa: técnico acompanhante (um técnico indo junto com outro no serviço)
ALTER TABLE lousa_servicos
  ADD COLUMN IF NOT EXISTS tecnico_acompanhante TEXT;
