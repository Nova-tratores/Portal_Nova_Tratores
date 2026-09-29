-- Assinatura do cliente no cheque de revisão: além de data/hora, nome e IP,
-- guarda LOCALIZAÇÃO (GPS do celular) e DISPOSITIVO (modelo/plataforma/UA).
alter table public.revisao_cheques
  add column if not exists assinado_geo         jsonb,   -- {lat, lng, precisao_m, obtido_em}
  add column if not exists assinado_dispositivo jsonb;   -- {modelo, plataforma, versao, ua, tela}

notify pgrst, 'reload schema';
