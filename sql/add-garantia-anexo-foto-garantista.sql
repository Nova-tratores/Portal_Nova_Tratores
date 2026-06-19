-- =============================================================================
-- Nova categoria de anexo: 'foto_garantista'.
-- Fotos que o garantista anexa direto na garantia — útil quando a garantia é
-- criada manualmente e a OS não tem as fotos do relatório do técnico.
-- Amplia o CHECK da coluna categoria em garantia_anexos.
-- =============================================================================

ALTER TABLE garantia_anexos DROP CONSTRAINT IF EXISTS garantia_anexos_categoria_check;
ALTER TABLE garantia_anexos ADD CONSTRAINT garantia_anexos_categoria_check
  CHECK (categoria IN (
    'tecnico','garantista','pendencia_pedido','pendencia_resposta',
    'retorno_fabrica','envio_fabrica','foto_garantista'
  ));
