-- =====================================================================
-- MARKETING — Fase 2.2: reclassifica os custos do IRRIGASHOW 2026 que vieram de Requisição e caíram em "Outro".
-- RODAR SÓ DEPOIS DE APROVAR a lista de → para (mostrada no Portão 2). Muda DADO real.
-- Cada linha pelo id exato e só se ainda estiver em 'outro' (se alguém já corrigiu na tela, não mexe).
-- Ficam como "sugerida" para alguém confirmar com um clique na aba Investimento.
-- =====================================================================
update mkt_custos set categoria = 'frete',       categoria_sugerida = true where id = 'aef8a901-5fe4-4803-93f9-e5728045a18d' and categoria = 'outro';  -- FRETE DE TRATORES · R$ 1.500,00
update mkt_custos set categoria = 'alimentacao', categoria_sugerida = true where id = 'bb464d6f-b5d1-455c-9a4e-b05362eefa79' and categoria = 'outro';  -- DESPESA PARA CONSUMO EVENTO HOLAMBRA · R$ 278,82
update mkt_custos set categoria = 'alimentacao', categoria_sugerida = true where id = 'd0390d65-273f-492e-ae66-032bca94590e' and categoria = 'outro';  -- ALMOÇO DOUGRAS · R$ 33,90
update mkt_custos set categoria = 'alimentacao', categoria_sugerida = true where id = '6fd977a3-83e5-493d-acd8-4930d5055da0' and categoria = 'outro';  -- IRRIGASHOW (Auto Posto RSH, req. de Alimentação) · R$ 24,00
update mkt_custos set categoria = 'alimentacao', categoria_sugerida = true where id = '4daf8bbe-ccbb-4b4f-8a17-af4a60de1ebe' and categoria = 'outro';  -- ALIMENTAÇÃO IRRIGASHOW · R$ 46,00
update mkt_custos set categoria = 'montagem',    categoria_sugerida = true where id = '540ab6ea-9a01-4837-9ed6-7920868a10d7' and categoria = 'outro';  -- LONA AZUL VONDER · R$ 218,00
-- '0a3c3edd-…' MATERIAL PARA HOLAMBRA · R$ 41,00 → continua 'outro' (sem pista do que é)
