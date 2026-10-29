-- Agenda: tipo do compromisso (José, 29/10/2026: "definir o tipo de compromisso, se é uma
-- reunião, trabalho fora, coisas do tipo"). Projeto do PORTAL (citrhumdk…).
-- Sem esta coluna o portal grava o compromisso sem o tipo (não quebra).
ALTER TABLE agenda_eventos ADD COLUMN IF NOT EXISTS tipo TEXT;
ALTER TABLE agenda_eventos DROP CONSTRAINT IF EXISTS agenda_eventos_tipo_valido;
ALTER TABLE agenda_eventos ADD CONSTRAINT agenda_eventos_tipo_valido CHECK (tipo IS NULL OR tipo IN (
  'reuniao', 'visita_cliente', 'trabalho_fora', 'viagem', 'entrega', 'treinamento', 'ligacao',
  'evento', 'foco', 'pessoal', 'folga', 'outro'
));
NOTIFY pgrst, 'reload schema';
