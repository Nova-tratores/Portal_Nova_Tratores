-- Registro de substituição de NF (cancelou a antiga + emitiu a nova) na pasta do cliente.
-- Guarda um histórico (array) em cada OS/PV: número antigo -> novo, tipo, quem e quando.
-- Cada item: { "nf_tipo": "servico"|"peca", "num_antigo": "...", "num_novo": "...",
--              "por": "Nome", "por_id": "uuid", "em": "2026-06-19T..." }

ALTER TABLE portal_nt_clientes_os
  ADD COLUMN IF NOT EXISTS nf_substituicoes jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE portal_nt_clientes_pv
  ADD COLUMN IF NOT EXISTS nf_substituicoes jsonb NOT NULL DEFAULT '[]'::jsonb;

NOTIFY pgrst, 'reload schema';
