-- Desfaz sql/conhecimento-base.sql. APAGA todos os artigos, versões, retornos e leituras.
DROP TABLE IF EXISTS kb_leituras;
DROP TABLE IF EXISTS kb_feedback;
DROP TABLE IF EXISTS kb_artigo_versoes;
DROP TABLE IF EXISTS kb_responsaveis;
DROP TABLE IF EXISTS kb_artigos;
NOTIFY pgrst, 'reload schema';
