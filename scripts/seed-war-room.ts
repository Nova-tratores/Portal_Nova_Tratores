// Seed do War Room — cria as 13 ações do plano, as 4 fontes da ponte e as 6
// definições estratégicas CHAMANDO AS ROTAS /api/war-room/* (nunca INSERT
// direto): assim reusa a lógica real do motor (participantes, evento, número,
// notificação). Rodar UMA vez, depois de aplicar sql/create-war-room.sql.
//
// Pré-requisitos:
//  - Servidor no ar (dev ou produção) — BASE aponta para ele.
//  - Um usuário NÚCLEO (ou admin) logado → copie o access_token do browser.
//  - Os 5 donos (uuids de financeiro_usu), um por papel.
//
// Uso (PowerShell/bash):
//   BASE=http://localhost:3000 \
//   TOKEN='eyJ...' \
//   DONO_COMERCIAL='<uuid>' DONO_FINANCEIRO='<uuid>' DONO_CONTROLADORIA='<uuid>' \
//   DONO_POSVENDA='<uuid>' DONO_DIRECAO='<uuid>' \
//   npx tsx scripts/seed-war-room.ts
//
// Idempotência: NÃO é idempotente — rodar 2x cria ações duplicadas. Rode uma vez.
import { ACOES_SEED, PONTE_SEED, DEFINICOES_SEED, type PapelDono } from './seed-war-room-dados'

const BASE = process.env.BASE || 'http://localhost:3000'
const TOKEN = process.env.TOKEN || ''

const DONOS: Record<PapelDono, string> = {
  DONO_COMERCIAL: process.env.DONO_COMERCIAL || '',
  DONO_FINANCEIRO: process.env.DONO_FINANCEIRO || '',
  DONO_CONTROLADORIA: process.env.DONO_CONTROLADORIA || '',
  DONO_POSVENDA: process.env.DONO_POSVENDA || '',
  DONO_DIRECAO: process.env.DONO_DIRECAO || '',
}

function exigir(cond: boolean, msg: string) { if (!cond) { console.error('✗ ' + msg); process.exit(1) } }

exigir(!!TOKEN, 'defina TOKEN com o access_token de um usuário núcleo/admin')
for (const [papel, uuid] of Object.entries(DONOS)) exigir(!!uuid, `defina ${papel} com o uuid de financeiro_usu`)

const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` }

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const r = await fetch(`${BASE}${path}`, { method: 'POST', headers: H, body: JSON.stringify(body) })
  const j = (await r.json().catch(() => ({}))) as Record<string, unknown>
  if (!r.ok) throw new Error(`${path} → ${r.status}: ${JSON.stringify(j)}`)
  return j
}

async function main() {
  console.log(`Seed War Room em ${BASE}\n`)

  // 1) Ações → guarda ordem → acao_id (para vincular a ponte).
  const acaoIdPorOrdem = new Map<number, string>()
  for (const a of ACOES_SEED) {
    const res = await post('/api/war-room/acoes', {
      titulo: a.titulo,
      descricao: [a.entregavel, `Indicador: ${a.indicador} · Meta: ${a.meta}`, `Consequência: ${a.consequencia}`].join('\n\n'),
      dono_id: DONOS[a.dono],
      fase: a.fase,
      causa_raiz: a.causa_raiz,
      entregavel: a.entregavel,
      indicador: a.indicador,
      meta: a.meta,
      consequencia: a.consequencia,
      prazo_estrategico: a.prazo_estrategico,
      ordem: a.ordem,
    })
    const acao = res.acao as { id: string }
    const ticket = res.ticket as { numero: number }
    acaoIdPorOrdem.set(a.ordem, acao.id)
    console.log(`  ✓ ação #${ticket.numero} (ordem ${a.ordem}) — ${a.titulo}`)
  }

  // 2) Fontes da ponte (vinculadas à ação correspondente).
  for (const [i, f] of PONTE_SEED.entries()) {
    await post('/api/war-room/ponte', {
      nome: f.nome, meta: f.meta, prazo: f.prazo, ordem: i + 1,
      acao_id: acaoIdPorOrdem.get(f.acao_ordem) || null,
    })
    console.log(`  ✓ fonte da ponte — ${f.nome} (meta ${f.meta.toLocaleString('pt-BR')})`)
  }

  // 3) Definições estratégicas (temas).
  for (const d of DEFINICOES_SEED) {
    await post('/api/war-room/definicoes', { tema: d.tema, decisao_a_extrair: d.decisao_a_extrair })
    console.log(`  ✓ definição — ${d.tema}`)
  }

  console.log('\nSeed concluído. Revise os prazos e as metas das fontes de ajuste na tela.')
}

main().catch((e) => { console.error('\n✗ Falhou:', (e as Error).message); process.exit(1) })
