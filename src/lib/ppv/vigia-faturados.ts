// VIGIA dos pedidos de peças marcados como FATURADOS (José, 22/10/2026). Caso real: PPV-0505 (pedido 7808) e
// PPV-0526 (pedido 7796) apareciam faturados no portal e o Omie nunca faturou — sem NF-e, ninguém percebeu.
// A cada 30 min: PPV com faturado_omie_em nos últimos 3 dias, ainda sem nº de NF-e (há 15 min ou mais) →
//   - Omie mostra faturado → busca a NF-e (grava o número; nada a avisar);
//   - Omie NÃO faturou → avisa T.I. + Pós-Vendas no sino, uma vez por pedido (marca no histórico do PPV).
// Remessa fica de fora (tem caminho próprio). Roda junto da conferência do faturamento de OS (agendador).
import { supabaseAdmin as sb } from '@/lib/server/supabase-admin'
import { consultarPedidoOmie, getAccount, obterComunicacaoSefaz } from './omie'
import { registrarLog } from './queries'
import { notificarUsuarios, usuariosPosVendas, usuariosTI } from '@/lib/faturamento/alerta-ti'

const INTERVALO_MS = 30 * 60 * 1000
const MARCA = 'VIGIA: marcado como faturado, mas o Omie NÃO faturou'
let ultima = 0

type Rec = Record<string, unknown>

/** simular: só diz o que faria (sem gravar, sem notificar) */
export async function vigiarPedidosFaturados(opts: { forcar?: boolean; simular?: boolean } = {}): Promise<string> {
  const agora = Date.now()
  if (!opts.forcar && agora - ultima < INTERVALO_MS) return ''
  ultima = agora
  const desde = new Date(agora - 3 * 24 * 3600_000).toISOString()
  const ate = new Date(agora - 15 * 60_000).toISOString()
  const { data, error } = await sb.from('pedidos')
    .select('id_pedido, pedido_omie, omie_empresa, faturado_omie_em, nf_numero, Tipo_Pedido, Id_Os')
    .gte('faturado_omie_em', desde).lte('faturado_omie_em', ate).is('nf_numero', null).not('pedido_omie', 'is', null).limit(50)
  if (error) return `vigia PPV: ${error.message}`
  const lista = ((data || []) as Rec[]).filter((p) => String(p.Tipo_Pedido || '') !== 'Remessa')
  if (!lista.length) return ''

  let ok = 0, semNota = 0, alertas = 0
  for (const p of lista) {
    const id = String(p.id_pedido), num = String(p.pedido_omie || '').replace(/^0+(?=\d)/, '')
    try {
      const acc = getAccount(String(p.omie_empresa || 'Nova Tratores'))
      const ped = await consultarPedidoOmie({ numero_pedido: num }, acc)
      const info = (ped as unknown as { infoCadastro?: { faturado?: string; cancelado?: string } } | null)?.infoCadastro
      const faturado = !!ped && (Number(ped.cabecalho?.etapa || 0) >= 60 || info?.faturado === 'S')
      if (opts.simular) { if (faturado) ok++; else alertas++; console.log(`[vigia PPV simulação] ${id} pedido ${num}: ${faturado ? 'faturado no Omie (buscaria a NF-e)' : `NÃO faturado (etapa ${ped?.cabecalho?.etapa ?? '?'}) → avisaria T.I. e Pós-Vendas`}`); continue }
      if (faturado) {
        // faturado de verdade: pega o nº da NF-e (grava no PPV) — se a SEFAZ ainda não devolveu, tenta na próxima
        const com = await obterComunicacaoSefaz(id, { refresh: true }).catch(() => null)
        if (com?.numero) ok++; else semNota++
        continue
      }
      // não faturado: avisa uma vez só por pedido
      const { data: jaAvisou } = await sb.from('logs_ppv').select('id').eq('id_ppv', id).ilike('acao', `${MARCA}%`).limit(1)
      if (jaAvisou?.length) continue
      const etapa = ped?.cabecalho?.etapa ? ` (etapa ${ped.cabecalho.etapa}${info?.cancelado === 'S' ? ', cancelado' : ''})` : ''
      await registrarLog(id, `${MARCA} o pedido nº ${num}${etapa}. Confira no Omie e fature de novo.`)
      const destinos = [...(await usuariosTI()), ...(await usuariosPosVendas())]
      await notificarUsuarios(destinos, {
        titulo: `${id} está faturado no portal, mas o Omie não faturou o pedido ${num}`,
        descricao: `O pedido de peças${p.Id_Os ? ` da ${p.Id_Os}` : ''} está sem NF-e: no Omie ele continua sem faturar${etapa}. Veja o motivo no pedido (Omie) e fature de novo.`,
        link: `/ppv?id=${id}`,
      })
      alertas++
    } catch (e) {
      console.warn(`[vigia PPV] ${id}:`, e instanceof Error ? e.message : e)
    }
    await new Promise((r) => setTimeout(r, 1500)) // não estoura o limite do Omie
  }
  return `vigia PPV: ${lista.length} sem nº de NF-e — ${ok} com nota agora, ${semNota} aguardando SEFAZ, ${alertas} aviso(s) de não faturado`
}
