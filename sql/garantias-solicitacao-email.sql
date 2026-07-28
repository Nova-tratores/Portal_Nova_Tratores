-- =============================================================================
-- Solicitação de garantia por E-MAIL (Ipacol) — tipo de template 'email'
-- + categorias de anexo pra NF de venda e Relatório de Assistência Técnica.
-- Aplicar manualmente no SQL editor do Supabase ANTES do deploy do portal.
-- =============================================================================

-- 1) tipo_template ganha 'email' (solicitação por e-mail, sem planilha)
ALTER TABLE garantia_montadoras DROP CONSTRAINT IF EXISTS garantia_montadoras_tipo_template_check;
ALTER TABLE garantia_montadoras ADD CONSTRAINT garantia_montadoras_tipo_template_check
  CHECK (tipo_template IN ('sem_template','mahindra','email'));

-- 2) Categorias novas de anexo: NF de venda do equipamento + RAT
ALTER TABLE garantia_anexos DROP CONSTRAINT IF EXISTS garantia_anexos_categoria_check;
ALTER TABLE garantia_anexos ADD CONSTRAINT garantia_anexos_categoria_check
  CHECK (categoria IN ('tecnico','garantista','pendencia_pedido','pendencia_resposta',
    'retorno_fabrica','envio_fabrica','foto_garantista','nf_venda','relatorio_at'));

-- 3) Ipacol passa a usar o fluxo de solicitação por e-mail
UPDATE garantia_montadoras SET tipo_template = 'email', updated_at = now()
WHERE lower(trim(nome)) = 'ipacol';
