-- Reset da numeração das unidades rastreadas (UN-000001).
--
-- Contexto: em 26/08/2026 as 48 unidades de TESTE (UN-000001 a UN-000048, dos
-- lotes de 21 e 25/08) foram apagadas para o módulo entrar em uso definitivo.
-- Apagar as linhas NÃO volta a sequência — sem isto a próxima etiqueta sairia
-- como UN-000049.
--
-- Rodar no SQL Editor do Supabase. A tabela precisa estar VAZIA: se houver
-- unidade viva, o número novo colide com o antigo (a coluna é UNIQUE) e a
-- impressão falha — por isso a checagem abaixo em vez de um setval solto.
--
-- ATENÇÃO: depois disto, etiqueta de teste que tenha sobrado colada em peça
-- vira 404 ao escanear, e o número UN-000001 volta a existir em OUTRA peça.
-- Só rode com as etiquetas antigas descartadas.

DO $$
DECLARE
  vivas INTEGER;
BEGIN
  SELECT count(*) INTO vivas FROM peca_unidades;
  IF vivas > 0 THEN
    RAISE EXCEPTION
      'peca_unidades tem % linha(s): resetar a sequência criaria número duplicado. Esvazie a tabela antes.', vivas;
  END IF;
  -- is_called = false → o PRÓXIMO nextval devolve 1, e não 2
  PERFORM setval('peca_unidade_numero_seq', 1, false);
  RAISE NOTICE 'Sequência zerada: a próxima etiqueta sai como UN-000001.';
END $$;

-- Conferência (não consome o número, só mostra onde a sequência está):
--   SELECT last_value, is_called FROM peca_unidade_numero_seq;
--   esperado: last_value = 1, is_called = false
