-- Garantias: em QUAL nota cada peça chegou + garantia que não precisa de NFS-e.
-- Idempotente; depende de sql/garantias-notas.sql e sql/garantias-notas-manual.sql.

-- texto lido do arquivo da nota anexada à mão (PDF/XML), sem espaços/pontuação,
-- para achar os códigos das peças. '' = arquivo sem texto (foto) → o portal pergunta.
alter table public.garantia_notas add column if not exists texto_arquivo text;

-- nota escolhida pelo usuário para a peça (vence a leitura automática)
alter table public.garantia_pecas add column if not exists nota_chegada_id uuid
  references public.garantia_notas(id) on delete set null;

-- garantia aprovada que não gera NFS-e de reembolso (ex.: sem mão de obra cobrada)
alter table public.garantias add column if not exists reembolso_dispensado boolean not null default false;

notify pgrst, 'reload schema';
