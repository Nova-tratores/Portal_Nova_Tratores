-- ════════════════════════════════════════════════════════════════════
-- Opa (Ocorrências): território = os MESMOS locais de Peças S/Estoque e
-- Patrimônio (tabela pni_locais) — 05/11/2026
-- portal_opas.local passa a guardar o id do pni_locais (ex.: 'box_tecnico');
-- nenhum Opa tinha território gravado quando a lista mudou.
-- Box Técnico (pni_locais.exige_tecnico) pede o técnico → local_tecnico.
-- Sem esta coluna o Opa salva o local normal e só não guarda o técnico.
-- Idempotente.
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE portal_opas ADD COLUMN IF NOT EXISTS local_tecnico TEXT;

NOTIFY pgrst, 'reload schema';
