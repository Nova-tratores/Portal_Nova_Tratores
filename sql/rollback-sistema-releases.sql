-- Desfaz sql/sistema-releases.sql. APAGA o histórico de versões e as novidades.
DROP TABLE IF EXISTS kb_novidades_lidas;
DROP TABLE IF EXISTS kb_novidades;
DROP TABLE IF EXISTS sistema_releases;
NOTIFY pgrst, 'reload schema';
