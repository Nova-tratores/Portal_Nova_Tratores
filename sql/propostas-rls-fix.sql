-- =====================================================================
-- Nova Tratores — /propostas: liberar leitura das tabelas novas p/ o cliente
-- Data: 2026-08-21
--
-- BUG: as tabelas criadas em propostas-evolucao.sql ficaram com RLS ligada
-- e SEM policy, então o navegador (chave anon/authenticated) recebe []  —
-- o modal "motivo da perda" abre com a lista vazia. As tabelas antigas do
-- módulo (Formulario, vendedores, Proposta_Fabrica) são abertas ao cliente;
-- aqui igualamos as novas ao MESMO padrão do módulo (leitura liberada).
--
-- As views (v_formulario etc.) já funcionam porque rodam com o dono; o
-- problema é só a LEITURA DIRETA das tabelas novas pelo cliente.
-- Idempotente. Rode no SQL editor.
-- =====================================================================

BEGIN;

-- Tabelas de apoio/lookup (referência não sensível) + tabelas de dados do módulo.
-- Desliga RLS (como nas tabelas antigas do módulo) e garante o GRANT de leitura.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'motivo_perda','status_proposta','fase_fabrica','etapa_credito','tipo_anexo',
    'proposta_itens','proposta_status_hist','proposta_anexos'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT SELECT ON public.%I TO anon, authenticated', t);
  END LOOP;
END $$;

-- proposta_itens vai precisar de escrita quando o formulário criar itens (item 2 — futuro).
GRANT INSERT, UPDATE, DELETE ON public.proposta_itens TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.proposta_itens_id_seq TO anon, authenticated;

COMMIT;

-- =====================================================================
-- VERIFICAÇÃO (deve voltar as 10 linhas pela anon key, não [])
--   No app: abrir uma proposta -> "não vendido" -> o seletor de motivos
--   deve listar Preço, Perdeu para concorrente, etc.
-- =====================================================================
