-- Desfaz sql/treinamento.sql. APAGA trilhas, perguntas, atribuições e todo o progresso.
DROP TABLE IF EXISTS lms_tentativas;
DROP TABLE IF EXISTS lms_progresso;
DROP TABLE IF EXISTS lms_atribuicoes;
DROP TABLE IF EXISTS lms_perguntas;
DROP TABLE IF EXISTS lms_etapas;
DROP TABLE IF EXISTS lms_trilhas;
NOTIFY pgrst, 'reload schema';
