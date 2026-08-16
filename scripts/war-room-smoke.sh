#!/usr/bin/env bash
# Teste manual (fumaça) das rotas /api/war-room/*.
# Pré-requisitos: migration sql/create-war-room.sql aplicada; `npm run dev` rodando;
# um usuário NÚCLEO (ou admin) logado — copie o access_token do browser:
#   localStorage / DevTools → Application → supabase.auth.token → access_token
#
# Uso:
#   BASE=http://localhost:3000 TOKEN='eyJ...' DONO='<uuid financeiro_usu>' bash scripts/war-room-smoke.sh
set -euo pipefail
BASE="${BASE:-http://localhost:3000}"
TOKEN="${TOKEN:?defina TOKEN com o access_token do usuário núcleo}"
DONO="${DONO:?defina DONO com um uuid de financeiro_usu (dono da ação)}"
AUTH=(-H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json")
j() { echo; echo "### $1"; }

j "GET membros (meu_nivel + roster se núcleo)"
curl -s "${AUTH[@]}" "$BASE/api/war-room/membros" | head -c 800; echo

j "POST acoes — cria ação (só núcleo)"
ACAO=$(curl -s "${AUTH[@]}" -X POST "$BASE/api/war-room/acoes" -d "{
  \"titulo\":\"[smoke] Reduzir despesa fixa\",
  \"descricao\":\"Ação de teste do smoke\",
  \"dono_id\":\"$DONO\",
  \"fase\":\"1_atacar\",
  \"causa_raiz\":\"custo fixo alto\",
  \"meta\":\"-15% em 90d\",
  \"prazo_estrategico\":\"2026-12-31\"
}")
echo "$ACAO" | head -c 800; echo
# id do ticket criado (para verificar a promoção a núcleo abaixo)
TICKET_ID=$(echo "$ACAO" | sed -n 's/.*"ticket":{"id":"\([0-9a-f-]*\)".*/\1/p')
echo "ticket_id=$TICKET_ID"

if [ -n "${PROMO:-}" ]; then
  j "PUT membros — promove PROMO a núcleo (SÓ ADMIN; use TOKEN de admin)"
  curl -s "${AUTH[@]}" -X PUT "$BASE/api/war-room/membros" -d "{\"user_id\":\"$PROMO\",\"nivel\":\"nucleo\",\"ativo\":true}" | head -c 300; echo
  echo "  → VERIFICAR: PROMO virou participante do ticket $TICKET_ID e há evento 'participante_adicionado'."
  echo "     Ex.: como PROMO (token dele), GET $BASE/api/tickets/$TICKET_ID deve retornar 200 (não 404),"
  echo "     e a timeline deve conter 'participante_adicionado' (motivo: Entrou no núcleo do War Room)."
  echo "     Ou via SQL: select * from tickets_participantes where ticket_id='$TICKET_ID' and user_id='$PROMO';"
fi

j "GET acoes (via view, RLS aplica o corte)"
curl -s "${AUTH[@]}" "$BASE/api/war-room/acoes" | head -c 800; echo

j "GET snapshots (núcleo=cru; membro=lite)"
curl -s "${AUTH[@]}" "$BASE/api/war-room/snapshots" | head -c 500; echo

j "POST cron/snapshot (idempotente) — cria a semana anterior"
curl -s -X POST -H "x-cron-secret: ${CRON_SECRET:-}" "$BASE/api/war-room/cron/snapshot" | head -c 500; echo
j "POST cron/snapshot 2x (não duplica)"
curl -s -X POST -H "x-cron-secret: ${CRON_SECRET:-}" "$BASE/api/war-room/cron/snapshot" | head -c 500; echo

j "PUT snapshots — digita o caixa manual (só núcleo, snapshot aberto)"
curl -s "${AUTH[@]}" -X PUT "$BASE/api/war-room/snapshots" -d '{"caixa_30d":150000,"caixa_60d":80000,"caixa_90d":-20000}' | head -c 400; echo

j "POST definicoes — cria definição estratégica (só núcleo)"
DEF=$(curl -s "${AUTH[@]}" -X POST "$BASE/api/war-room/definicoes" -d '{"tema":"[smoke] Continuidade quadriciclos","decisao_a_extrair":"manter ou encerrar a linha"}')
echo "$DEF" | head -c 500; echo

j "GET definicoes (só núcleo vê)"
curl -s "${AUTH[@]}" "$BASE/api/war-room/definicoes" | head -c 500; echo

j "POST decisoes — registra decisão na reunião aberta"
curl -s "${AUTH[@]}" -X POST "$BASE/api/war-room/decisoes" -d '{"descricao":"[smoke] Aprovado corte de 2 posições","prazo":"2026-09-30"}' | head -c 400; echo

j "GET ponte + PUT nova fonte (só núcleo)"
curl -s "${AUTH[@]}" "$BASE/api/war-room/ponte" | head -c 400; echo
curl -s "${AUTH[@]}" -X PUT "$BASE/api/war-room/ponte" -d '{"nome":"[smoke] Cobrança grandes devedores","meta":1000000,"realizado":120000}' | head -c 400; echo

echo; echo "OK — fumaça concluída."
