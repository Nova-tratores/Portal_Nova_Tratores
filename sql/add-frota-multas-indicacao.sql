-- =============================================================================
-- Multas — indicação do condutor (20/08/2026).
-- A empresa precisa INDICAR O CONDUTOR ao órgão autuador dentro do prazo do
-- auto (senão vem a NIC — multa agravada por não indicação — e os pontos não
-- vão pra CNH de ninguém). Estas colunas guardam se/quando o condutor foi
-- indicado e o prazo-limite, exibidos e editáveis na aba Frota > Multas.
--
-- Aplicar manualmente no SQL editor do Supabase ANTES do deploy (o PATCH da
-- tela passa a gravar estes campos).
-- =============================================================================
ALTER TABLE frota_multas ADD COLUMN IF NOT EXISTS condutor_indicado_em DATE;
ALTER TABLE frota_multas ADD COLUMN IF NOT EXISTS indicacao_prazo      DATE;
