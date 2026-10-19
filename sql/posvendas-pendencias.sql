-- Centro do Pós-Vendas: dinheiro parado (OS preenchidas sem faturar e OS que passaram da data
-- sem relatório). Foto de agora, regravada pelo robô a cada 10 min. Pode rodar mais de uma vez.
CREATE TABLE IF NOT EXISTS posvendas_pendencias (
  os             text PRIMARY KEY,
  tipo           text NOT NULL CHECK (tipo IN ('preenchida', 'atrasada')),
  status         text,
  cliente        text,
  tecnicos       text[] NOT NULL DEFAULT '{}',
  data_ref       date,
  dias           integer NOT NULL DEFAULT 0,
  mao_de_obra    numeric NOT NULL DEFAULT 0,
  deslocamento   numeric NOT NULL DEFAULT 0,
  pecas          numeric NOT NULL DEFAULT 0,
  total          numeric NOT NULL DEFAULT 0,
  garantia       boolean NOT NULL DEFAULT false,
  atualizado_em  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE posvendas_pendencias ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON posvendas_pendencias FROM anon, authenticated;
NOTIFY pgrst, 'reload schema';
