-- Lousa: tipos de marcação além de "serviço"
-- ('servico' | 'faltou' | 'feriado' | 'saida')
ALTER TABLE lousa_servicos
  ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'servico';
