-- =============================================================================
-- Numeração externa da SG por montadora.
-- Cada fábrica usa sua própria sequência (Mahindra está em SG 034 → próxima 035,
-- Kuhn pode estar em outra, Ventura em outra). O número é gerado na primeira
-- vez que a SG é criada e fica salvo em garantias.numero_externo (para
-- regerações futuras usarem o mesmo).
-- =============================================================================

ALTER TABLE garantia_montadoras
  ADD COLUMN IF NOT EXISTS proximo_numero_sg INTEGER NOT NULL DEFAULT 1;

ALTER TABLE garantias
  ADD COLUMN IF NOT EXISTS numero_externo TEXT;

-- Função atômica que devolve e incrementa o próximo número da montadora.
-- Usada pelo endpoint de geração de SG para evitar corridas.
CREATE OR REPLACE FUNCTION proximo_numero_sg_montadora(p_montadora_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_numero INTEGER;
BEGIN
  UPDATE garantia_montadoras
     SET proximo_numero_sg = proximo_numero_sg + 1,
         updated_at = now()
   WHERE id = p_montadora_id
  RETURNING proximo_numero_sg - 1 INTO v_numero;
  RETURN COALESCE(v_numero, 1);
END;
$$ LANGUAGE plpgsql;
