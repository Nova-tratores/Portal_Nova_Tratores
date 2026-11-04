-- Garantias: nota anexada À MÃO (quando a nota não está no sistema).
-- Vira uma linha de garantia_notas com o arquivo (bucket "garantias", pasta
-- <garantia>/nota_<papel>/), sem doc_id/entrada_id. Conta igual a uma nota
-- vinculada: tira a garantia de "falta NFS-e" (papel reembolso) ou dá as peças
-- como chegadas (papel pecas). Idempotente; depende de sql/garantias-notas.sql.

alter table public.garantia_notas add column if not exists arquivo_url text;
alter table public.garantia_notas add column if not exists nome_arquivo text;

alter table public.garantia_notas drop constraint if exists garantia_notas_tem_nota;
alter table public.garantia_notas add constraint garantia_notas_tem_nota
  check (doc_id is not null or entrada_id is not null or arquivo_url is not null);

-- mais de uma nota manual por garantia/papel (o índice antigo colidia em 0,0)
drop index if exists public.garantia_notas_unica;
create unique index if not exists garantia_notas_unica
  on public.garantia_notas (garantia_id, papel, coalesce(doc_id, 0), coalesce(entrada_id, 0), coalesce(arquivo_url, ''));

notify pgrst, 'reload schema';
