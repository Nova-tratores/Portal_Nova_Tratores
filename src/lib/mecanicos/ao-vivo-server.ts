// Centro do Pós-Vendas AO VIVO (José, 21/10/2026: "assim que gerar um faturamento já tem que cair instantâneo,
// com o real time, e atualizar todos os dados" + "ocorrências também") — SÓ SERVIDOR.
// Faturou (portal ou Omie) → regrava as tabelas posvendas_* dos últimos 10 dias, recarrega a base na memória,
// esquece os caches que dependem dela (ao vivo, fichas, carreira, fantasmas) e avisa as telas abertas pelo
// canal Realtime "posvendas-ao-vivo". Ocorrência/defesa → só esquece os caches e avisa (modo leve).
// Várias chamadas juntas viram uma só (a próxima roda logo depois, se pediram no meio).
import { supabaseAdmin as sb } from '@/lib/server/supabase-admin'
import { sincronizarPosVendas } from './tabelas-server'
import { recarregarBaseMemoria } from './base-cache'
import { esquecer } from './cache'

const CANAL = 'posvendas-ao-vivo'
const PREFIXOS = ['vivo2:', 'ficha12:', 'ficha-base4:', 'carreira:', 'fantasmas:', 'parado']
const hojeSP = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
const somarDias = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10)

let rodando: Promise<void> | null = null
let deNovo: { motivo: string; leve: boolean } | null = null

async function rodar(motivo: string, leve: boolean) {
  const t0 = Date.now()
  if (!leve) {
    await sincronizarPosVendas(somarDias(hojeSP(), -10), hojeSP())
    await recarregarBaseMemoria()
  }
  await esquecer(PREFIXOS)
  await avisarTelas({ motivo, leve, em: new Date().toISOString(), ms: Date.now() - t0 })
}

/** Atualiza o Centro do Pós-Vendas agora (sem esperar o robô de 10 min) e avisa as telas abertas. */
export function atualizarPosVendasAgora(motivo: string, opts: { leve?: boolean } = {}): Promise<void> {
  const leve = !!opts.leve
  if (rodando) {
    // já está rodando: guarda um pedido para logo depois (o mais pesado vence)
    deNovo = { motivo, leve: (deNovo?.leve ?? true) && leve }
    return rodando
  }
  rodando = rodar(motivo, leve)
    .catch((e) => console.error('[posvendas-ao-vivo]', motivo, e))
    .finally(() => {
      rodando = null
      if (deNovo) { const d = deNovo; deNovo = null; void atualizarPosVendasAgora(d.motivo, { leve: d.leve }) }
    })
  return rodando
}

/** Dispara sem esperar (para chamar de dentro do faturamento sem atrasar a resposta). */
export function atualizarPosVendasDepois(motivo: string, opts: { leve?: boolean } = {}) {
  setTimeout(() => { void atualizarPosVendasAgora(motivo, opts) }, 1500)
}

async function avisarTelas(payload: Record<string, unknown>) {
  const canal = sb.channel(CANAL)
  try { await canal.send({ type: 'broadcast', event: 'mudou', payload }) }
  catch (e) { console.error('[posvendas-ao-vivo] aviso', e) }
  finally { void sb.removeChannel(canal) }
}
