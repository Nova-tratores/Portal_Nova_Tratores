  -- ============================================================
  --  Abastecimento v3: departamento do veículo ("Centro de custo
  --  veículo" do CSV: COMERCIAL / OFICINA / DIRETORIA / CAMINHAO)
  --  + correção retroativa de placas unificadas/trocadas.
  --  Correr no Supabase (projeto citrhumdkfivdzbmayde):
  --  SQL Editor -> colar -> Run (idempotente).
  -- ============================================================

  alter table abastecimentos
    add column if not exists departamento text;

  -- ------------------------------------------------------------
  -- Correções retroativas de placa (novos uploads já entram certos
  -- pelo código — src/lib/abastecimento/correcoes.ts).
  -- OBS: preferir excluir o lote e reenviar o CSV (preenche também
  -- departamento/OS/capacidade). Os updates abaixo são o atalho.
  -- ------------------------------------------------------------

  -- 1) FCP0G08 e GIH0I50 são o mesmo veículo (S10) → unificar
  update abastecimentos
  set placa = 'GIH0I50'
  where placa = 'FCP0G08';

  -- 2) O cartão da EPX5253 (CAPTIVA) abastecia o FRS3H46 (ETIOS) até 06/2026
  update abastecimentos
  set placa = 'FRS3H46', modelo_veiculo = 'ETIOS', nome_veiculo = 'ETIOS', id_placa = null
  where placa = 'EPX5253'
    and data_transacao <= '2026-06-30T23:59:59-03:00';

  -- Confirme com:
  --   select placa, count(*) from abastecimentos
  --   where placa in ('GIH0I50','FCP0G08','EPX5253','FRS3H46') group by placa;

  -- ------------------------------------------------------------
  -- Correções de departamento POR MOTORISTA (o "Centro de custo veículo" do
  -- cartão não bate com o departamento real da pessoa). Espelha o mapa em
  -- src/lib/abastecimento/correcoes.ts (CORRECOES_DEPARTAMENTO_POR_MOTORISTA).
  -- ------------------------------------------------------------

  -- 3) Joaquim Fernando Leme é do COMERCIAL (cartão vinha como DIRETORIA).
  update abastecimentos
  set departamento = 'COMERCIAL'
  where regexp_replace(lower(coalesce(motorista_nome, '')), '\s+', ' ', 'g') = 'joaquim fernando leme'
    and coalesce(departamento, '') is distinct from 'COMERCIAL';

  -- Confirme com:
  --   select motorista_nome, departamento, count(*) from abastecimentos
  --   where motorista_nome ilike '%joaquim%leme%' group by 1,2;
