-- Avisos: público-alvo (setor) + agendamento.
--
-- destino: 'todos' | 'Peças' | 'Pós Vendas' | 'Comercial' | 'Financeiro' | 'tecnicos'
--   (os nomes de setor batem com portal_permissoes.categoria; 'tecnicos' usa
--    mecanico_role='tecnico'). Filtra quem RECEBE e quem VÊ o aviso.
-- agendar_para: quando NULL, publica na hora; quando no futuro, fica escondido
--   (publicado=false) até o cron soltar e avisar o criador.
-- publicado: false = agendado, ainda não saiu. O feed mostra só publicado=true.
ALTER TABLE portal_avisos ADD COLUMN IF NOT EXISTS destino TEXT NOT NULL DEFAULT 'todos';
ALTER TABLE portal_avisos ADD COLUMN IF NOT EXISTS agendar_para TIMESTAMPTZ;
ALTER TABLE portal_avisos ADD COLUMN IF NOT EXISTS publicado BOOLEAN NOT NULL DEFAULT true;

-- O cron varre só os pendentes; índice parcial deixa isso barato.
CREATE INDEX IF NOT EXISTS idx_avisos_agendados ON portal_avisos (agendar_para)
  WHERE publicado = false;
