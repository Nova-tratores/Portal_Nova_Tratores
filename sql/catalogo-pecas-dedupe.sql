-- Limpeza de duplicatas em catalogo_pecas (importações repetidas geraram
-- várias linhas do mesmo código na mesma figura, além de uma versão sem
-- referência). Mesma lógica do dedupe feito na API /api/catalogo/figura/[id].

-- 1) Remove duplicatas exatas (mesma figura + código + referência): mantém o menor id.
DELETE FROM catalogo_pecas a
USING catalogo_pecas b
WHERE a.figura_id = b.figura_id
  AND coalesce(trim(a.code), '') = coalesce(trim(b.code), '')
  AND coalesce(trim(a.reference), '') = coalesce(trim(b.reference), '')
  AND a.id > b.id;

-- 2) Remove a versão "sem referência" quando o mesmo código já tem uma
--    referência real (numerada) na mesma figura.
DELETE FROM catalogo_pecas a
WHERE coalesce(trim(a.reference), '') = ''
  AND EXISTS (
    SELECT 1 FROM catalogo_pecas b
    WHERE b.figura_id = a.figura_id
      AND coalesce(trim(b.code), '') = coalesce(trim(a.code), '')
      AND coalesce(trim(b.reference), '') <> ''
  );

-- 3) (Opcional) Evita novas duplicatas exatas em futuras importações.
-- CREATE UNIQUE INDEX IF NOT EXISTS catalogo_pecas_figura_code_ref_uidx
--   ON catalogo_pecas (figura_id, code, reference);
