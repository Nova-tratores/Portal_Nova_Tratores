-- Grupos (coletivos) de requisições: agrupam requisições com o mesmo propósito
-- sem juntá-las numa só. Uma requisição pode estar em VÁRIOS grupos.

CREATE TABLE IF NOT EXISTS requisicao_grupos (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome        text NOT NULL,
  status      text NOT NULL DEFAULT 'aberto',        -- aberto | concluido | cancelado
  criado_por  text,
  historico   jsonb NOT NULL DEFAULT '[]'::jsonb,     -- [{acao, req_id, usuario, em}]
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Vínculo requisição <-> grupo (uma req pode estar em vários grupos)
CREATE TABLE IF NOT EXISTS requisicao_grupo_membros (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  grupo_id       bigint NOT NULL REFERENCES requisicao_grupos(id) ON DELETE CASCADE,
  req_id         bigint NOT NULL,
  adicionado_por text,
  adicionado_em  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (grupo_id, req_id)
);

CREATE INDEX IF NOT EXISTS idx_req_grupo_membros_grupo ON requisicao_grupo_membros(grupo_id);
CREATE INDEX IF NOT EXISTS idx_req_grupo_membros_req   ON requisicao_grupo_membros(req_id);
