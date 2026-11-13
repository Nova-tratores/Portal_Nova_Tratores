-- Recebimentos: apaga as cópias FALSAS de notas da CASTRO gravadas como NOVA no espelho.
--
-- Achado em 13/11/2026 (NF 1047138 da CAMBUCI): 4.027 id_receb aparecem nas DUAS empresas.
-- A linha "nova" de todas foi inserida em 08/04/2026 (importação antiga) e a Omie da NOVA
-- não conhece esses recebimentos ("Não foi possível encontrar os dados do Recebimento!");
-- conferido na Omie em 17 de amostra (17/17 só existem na CASTRO). Efeito na tela: a nota
-- aparecia também na NOVA, o Reabrir falhava, e ~100 notas da CASTRO apareciam como
-- PENDENTES na NOVA. Nada em recebimento_meta, recebimento_entrada_log ou
-- pecas_alocacao_pendencias aponta para essas linhas.
--
-- Rode primeiro o SELECT para conferir a contagem (esperado: 4027), depois o DELETE.

select count(*) as fantasmas
from recebimentos_nfe n
where n.conta_omie = 'nova'
  and exists (select 1 from recebimentos_nfe c
              where c.conta_omie = 'castro' and c.id_receb = n.id_receb);

delete from recebimentos_nfe n
where n.conta_omie = 'nova'
  and exists (select 1 from recebimentos_nfe c
              where c.conta_omie = 'castro' and c.id_receb = n.id_receb);
