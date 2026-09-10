-- =====================================================================
-- Fase 2 do cockpit de atendimento — ROTEIROS + retorno inteligente
-- =====================================================================
--  * feedback_script: frases de apoio por regra e etapa (apresentação,
--    argumentação, objeção), com variáveis {nome}, {primeiro_nome},
--    {trator}, {horimetro}, {ultima_os_data}, {ultima_os_desc},
--    {proxima_revisao}, {dias_sem_contato}, {atendente}. O resolvedor fica no
--    TypeScript (src/lib/feedbacks/atendimento/roteiro.ts) e nunca deixa
--    {x} cru — cada variável tem frase alternativa quando o dado falta.
--  * feedback_config_regras ganha a linha 'retorno' (dias padrão de retorno
--    e regra por humor). O CHECK de `regra` é recriado com R1..R7 + retorno.
--  * Termômetros (humor_cliente / qualidade_conversa) já existem em
--    feedback_chamada desde a Fase 1; passam a ser exigidos pela rota/UI.
--
-- Rodar no SQL Editor do projeto do Portal (citrhumdkfivdzbmayde). Idempotente.
-- Rollback: sql/rollback-feedback-roteiro.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. feedback_script
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS feedback_script (
  id           bigserial PRIMARY KEY,
  regra        text NOT NULL,   -- 'geral' | R1_revisao | R2_sem_os | R3_upsell | R4_followup | R5_pecas | R6_fora_garantia | R7_garantia_risco
  etapa        text NOT NULL CHECK (etapa IN ('apresentacao','argumentacao','objecao')),
  titulo       text NOT NULL,
  template     text NOT NULL,
  ativo        boolean NOT NULL DEFAULT true,
  versao       integer NOT NULL DEFAULT 1,
  ordem        integer NOT NULL DEFAULT 0,
  criado_em    timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT feedback_script_regra_check CHECK (regra IN ('geral','R1_revisao','R2_sem_os','R3_upsell','R4_followup','R5_pecas','R6_fora_garantia','R7_garantia_risco'))
);
COMMENT ON TABLE feedback_script IS 'Roteiro de ligação do cockpit: frases por regra e etapa, com variáveis {nome} {primeiro_nome} {trator} {horimetro} {ultima_os_data} {ultima_os_desc} {proxima_revisao} {dias_sem_contato} {atendente}.';
CREATE INDEX IF NOT EXISTS idx_feedback_script_regra ON feedback_script (regra, etapa, ordem) WHERE ativo;

CREATE OR REPLACE FUNCTION feedback_script_touch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.atualizado_em := now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS tg_feedback_script_touch ON feedback_script;
CREATE TRIGGER tg_feedback_script_touch BEFORE UPDATE ON feedback_script FOR EACH ROW EXECUTE FUNCTION feedback_script_touch();

ALTER TABLE feedback_script ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS feedback_script_select ON feedback_script;
DROP POLICY IF EXISTS feedback_script_write  ON feedback_script;
CREATE POLICY feedback_script_select ON feedback_script FOR SELECT TO authenticated USING (true);
CREATE POLICY feedback_script_write  ON feedback_script FOR ALL    TO authenticated USING (true) WITH CHECK (true);
REVOKE ALL ON feedback_script FROM anon;

-- Seeds (só se ainda não houver NENHUM script — editar depois direto na tabela)
INSERT INTO feedback_script (regra, etapa, titulo, template, ordem)
SELECT * FROM (VALUES
  ('geral','apresentacao','Abertura',
   'Bom dia, {nome}! Aqui é {atendente}, da Nova Tratores, em Piraju. Tudo bem por aí? Estou ligando por causa do seu {trator}.', 0),
  ('geral','apresentacao','Confirmar quem fala',
   'Estou falando com {primeiro_nome} mesmo? Ou quem cuida da máquina é outra pessoa?', 1),
  ('geral','objecao','"Não tenho tempo agora"',
   'Sem problema, {primeiro_nome}. Qual o melhor dia e horário pra eu ligar de novo? Anoto aqui e ligo na hora certa.', 0),
  ('geral','objecao','"Está caro"',
   'Entendo. Posso montar um orçamento sem compromisso e te mandar no WhatsApp — aí você compara com calma.', 1),
  ('geral','objecao','"Já faço com outro"',
   'Tranquilo. Só lembrando que a revisão na concessionária mantém a garantia Mahindra e usa peça original. Se mudar de ideia, é só chamar.', 2),
  ('R1_revisao','argumentacao','Revisão de garantia',
   'Pelo nosso controle, o {trator} está chegando na revisão de {proxima_revisao}. Ela é obrigatória pra manter a garantia da Mahindra. Quer agendar? Podemos ir até a propriedade ou você traz na loja.', 0),
  ('R7_garantia_risco','argumentacao','Garantia em risco',
   'O {trator} ainda está na garantia, mas o cheque de {proxima_revisao} precisa ser feito no prazo, senão a garantia cai. Consigo encaixar o técnico esta semana — qual dia fica melhor?', 0),
  ('R2_sem_os','argumentacao','Sem serviço há tempo',
   'Faz {dias_sem_contato} dias que a gente não se fala. Como está o {trator}? O último serviço foi {ultima_os_desc}, em {ultima_os_data}. Quer que eu agende uma revisão preventiva antes da safra?', 0),
  ('R6_fora_garantia','argumentacao','Fora de garantia',
   'O {trator} já saiu da garantia. Temos plano de manutenção com mão de obra e deslocamento com desconto — evita parada na hora errada. Quer que eu explique os valores?', 0),
  ('R5_pecas','argumentacao','Reposição de peças',
   'Faz um tempo que você não compra filtros e óleo com a gente. Quer que eu monte um kit de manutenção pro {trator}? Entrego ou deixo separado na loja.', 0),
  ('R3_upsell','argumentacao','Pode comprar mais',
   'Como anda o trabalho com o {trator}? Muita gente está completando com implemento novo (grade, roçadeira, plantadeira). Quer uma proposta?', 0),
  ('R4_followup','argumentacao','Retorno de pós-venda',
   'Estou ligando pra saber se o serviço de {ultima_os_data} ({ultima_os_desc}) ficou bom. De 0 a 10, quanto você daria? Tem algo que a gente poderia melhorar?', 0)
) AS v(regra, etapa, titulo, template, ordem)
WHERE NOT EXISTS (SELECT 1 FROM feedback_script);

-- ---------------------------------------------------------------------
-- 2. feedback_config_regras: linha 'retorno' (CHECK recriado com R1..R7 + retorno)
-- ---------------------------------------------------------------------
ALTER TABLE feedback_config_regras DROP CONSTRAINT IF EXISTS feedback_config_regras_regra_check;
ALTER TABLE feedback_config_regras
  ADD CONSTRAINT feedback_config_regras_regra_check
  CHECK (regra IN ('R1_revisao','R2_sem_os','R3_upsell','R4_followup','R5_pecas','R6_fora_garantia','R7_garantia_risco','retorno'));

INSERT INTO feedback_config_regras (regra, parametros)
VALUES ('retorno', '{"retorno_dias_padrao": 30, "retorno_dias_humor_baixo": 90, "humor_baixo_max": 2, "sugerir_caveira_apos": 2}'::jsonb)
ON CONFLICT (regra) DO NOTHING;

COMMENT ON TABLE feedback_config_regras IS 'Parâmetros das regras R1..R7 e da linha retorno (dias de retorno padrão, dias quando humor baixo, teto de humor baixo, nº de humores 1 seguidos para sugerir "não contatar").';

NOTIFY pgrst, 'reload schema';
