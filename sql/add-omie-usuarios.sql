-- Tabela de tradução: código de usuário do Omie -> nome real.
-- Os títulos (contas_pagar/contas_receber) guardam quem lançou/alterou em
-- incluido_por / alterado_por no formato do Omie "cNome" (ex.: "P000454175").
-- O nome legível vem de ListarUsuarios.cNomeCompl. Esta tabela persiste esse
-- mapa para o DRE (drill-down) e relatórios mostrarem o nome nativamente.
-- Sincronizada por: POST /api/dre-financeiro/sync/usuarios (sincronizarUsuariosOmie).

CREATE TABLE IF NOT EXISTS "omie_usuarios" (
  "codigo"        TEXT PRIMARY KEY,        -- cNome do Omie (ex.: "P000454175") = incluido_por/alterado_por
  "nome"          TEXT,                    -- cNomeCompl (nome real)
  "email"         TEXT,                    -- cEmail
  "ncod_usuario"  BIGINT,                  -- nCodUsuario (id interno Omie)
  "synced_at"     TIMESTAMPTZ DEFAULT now()
);
