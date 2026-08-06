-- Config de e-mail de ENVIO por usuário (remetente do boleto no financeiro).
-- A senha é uma "Senha de app" e fica CRIPTOGRAFADA (senha_enc) — nunca em texto.
-- RLS: NENHUMA policy de cliente. Todo acesso passa pelas rotas de API (service
-- role), que autenticam o usuário. Assim o ciphertext nem chega ao navegador.

CREATE TABLE IF NOT EXISTS financeiro_envio_config (
  user_id     uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email_envio text,
  smtp_host   text,
  smtp_port   integer,
  smtp_secure boolean DEFAULT true,
  senha_enc   text,            -- "Senha de app" criptografada (AES-256-GCM)
  updated_at  timestamptz DEFAULT now()
);

ALTER TABLE financeiro_envio_config ENABLE ROW LEVEL SECURITY;
-- Sem policies = cliente (anon/authenticated) não lê nem escreve. Só o service role
-- (usado nas rotas /api/financeiro/config-envio e /enviar-boleto) acessa.
