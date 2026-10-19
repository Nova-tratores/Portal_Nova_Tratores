// Dinheiro parado do pós-vendas (José, 16/10/2026) — leitura no banco. Regras em ./pendencias.ts.
// OS do portal dos últimos 18 meses que NÃO faturaram: preenchidas esperando faturar e as que
// passaram da data de execução sem relatório. Valor estimado = mão de obra + km + peças (PPV),
// o mesmo cálculo do faturamento (bruto = maior entre a soma das partes e o Valor_Total).
import { supabaseAdmin as sb } from '@/lib/server/supabase-admin'
import { TBL_OS } from '@/lib/pos/constants'
import { getConfigPOS } from '@/lib/pos/config'
import { valorPecasPorPPV } from '@/lib/pos/pecas-ppv'
import { CODIGOS_INTERNOS, CONTA_INTERNO } from '@/lib/pos/omie-espelho'
import { motivoInterna, somarDias } from './painel'
import { classificarPendencia, type Pendencia } from './pendencias'

type Rec = Record<string, unknown>
const num = (v: unknown) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0 }
const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const diasEntre = (a: string, b: string) => Math.max(0, Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000))
const COLS = 'Id_Ordem, Ordem_Omie, Os_Cliente, Os_Tecnico, Os_Tecnico2, Status, Data, Previsao_Execucao, Dias_Execucao, Tipo_Servico, Servico_Interno, Qtd_HR, Valor_HR, Qtd_KM, Valor_KM, Desconto_Hora, Desconto_KM, Valor_Total, ID_PPV, faturado_omie_em, esp_info:Omie_Espelho->info'

async function paginar(montar: (de: number, ate: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<Rec[]> {
  const out: Rec[] = []
  for (let de = 0; de < 50000; de += 1000) {
    const { data, error } = await montar(de, de + 999)
    if (error) throw new Error(error.message)
    const l = (data || []) as Rec[]
    out.push(...l)
    if (l.length < 1000) break
  }
  return out
}

/** Id_Ordem das OS de garantia (Tipo_Servico "Garantia", "Garantia Trator", "Garantia Implemento"). */
export async function idsGarantia(): Promise<Set<string>> {
  const l = await paginar((x, y) => sb.from(TBL_OS).select('Id_Ordem').ilike('Tipo_Servico', '%garantia%').range(x, y))
  return new Set(l.map((o) => String(o.Id_Ordem)))
}

/** Nº das OS do Omie (sem zeros) que saíram com NFS-e (os_nfse, conta NOVA). */
export async function numsComNota(): Promise<Set<string>> {
  const l = await paginar((x, y) => sb.from('os_nfse').select('num_os').eq('conta_omie', 'NOVA').eq('tem_nota', true).range(x, y))
  return new Set(l.map((o) => String(o.num_os ?? '').trim().replace(/^0+(?=\d)/, '')).filter(Boolean))
}

/** `faturadas` = Id_Ordem das OS já faturadas (posvendas_os ou base). */
export async function carregarPendencias(faturadas: Set<string>, padronizar: (n: unknown) => string): Promise<Pendencia[]> {
  const hoje = hojeSP()
  const desde = somarDias(hoje, -540)
  const cfg = await getConfigPOS().catch(() => null) as { valor_hora?: number; valor_km?: number } | null
  const vhPadrao = num(cfg?.valor_hora) || 193, vkPadrao = num(cfg?.valor_km) || 3.6
  const codigos = CODIGOS_INTERNOS.map((c) => c.codigo)

  // OS faturada direto na Omie: o nº dela já tem NFS-e no espelho das notas
  const comNota = await numsComNota().catch(() => new Set<string>())
  const semZeros = (v: unknown) => String(v ?? '').trim().replace(/^0+(?=\d)/, '')
  const oss = (await paginar((x, y) => sb.from(TBL_OS).select(COLS).gte('Data', desde).not('Status', 'ilike', '%cancel%').range(x, y)))
    // Concluída com nº do Omie = já faturada (muitas saem com recibo e não aparecem no espelho das notas)
    .filter((o) => !faturadas.has(String(o.Id_Ordem)) && !o.faturado_omie_em && !(/conclu/i.test(String(o.Status || '')) && String(o.Ordem_Omie || '').trim())
      && !(semZeros(o.Ordem_Omie) && comNota.has(semZeros(o.Ordem_Omie))))
  // data do relatório do técnico (o mais recente) de cada OS
  const ids = oss.map((o) => String(o.Id_Ordem))
  const relatorio = new Map<string, string>()
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await sb.from('Ordem_Servico_Tecnicos').select('Ordem_Servico, DataInicio').in('Ordem_Servico', ids.slice(i, i + 200))
    for (const r of (data || []) as Rec[]) {
      const k = String(r.Ordem_Servico), d = String(r.DataInicio || '').slice(0, 10)
      if (!relatorio.has(k) || d > relatorio.get(k)!) relatorio.set(k, d)
    }
  }

  const candidatos: { o: Rec; tipo: Pendencia['tipo'] }[] = []
  for (const o of oss) {
    const info = (o.esp_info && typeof o.esp_info === 'object' ? o.esp_info : {}) as Rec
    const interna = !!motivoInterna({ servicoInterno: o.Servico_Interno, conta: info.conta, contratos: [info.contrato] }, CONTA_INTERNO, codigos)
    const tipo = classificarPendencia(o as { Status?: string }, { faturada: false, interna, temRelatorio: relatorio.has(String(o.Id_Ordem)), hoje })
    if (tipo) candidatos.push({ o, tipo })
  }
  const pecas = await valorPecasPorPPV(candidatos.flatMap(({ o }) => String(o.ID_PPV || '').split(',').map((s) => s.trim()).filter(Boolean)))

  return candidatos.filter(({ o }) => !/teste/i.test(`${o.Os_Tecnico || ''} ${o.Os_Tecnico2 || ''} ${o.Os_Cliente || ''}`)).map(({ o, tipo }) => {
    const vh = num(o.Valor_HR) || vhPadrao, vk = num(o.Valor_KM) || vkPadrao
    const maoDeObra = Math.max(0, num(o.Qtd_HR) * vh - num(o.Desconto_Hora))
    const deslocamento = Math.max(0, num(o.Qtd_KM) * vk - num(o.Desconto_KM))
    const vPecas = String(o.ID_PPV || '').split(',').map((s) => s.trim()).filter(Boolean).reduce((s, p) => s + (pecas.get(p) || 0), 0)
    const total = Math.max(maoDeObra + deslocamento + vPecas, num(o.Valor_Total))
    const id = String(o.Id_Ordem)
    const dataRef = tipo === 'preenchida'
      ? relatorio.get(id) || String(o.Previsao_Execucao || o.Data || '').slice(0, 10) || null
      : (String(o.Dias_Execucao || '').split(',').map((s) => s.trim()).filter(Boolean).sort().pop() || String(o.Previsao_Execucao || '').slice(0, 10)) || null
    return {
      os: id, tipo, status: String(o.Status || ''), cliente: String(o.Os_Cliente || ''),
      tecnicos: [...new Set([o.Os_Tecnico, o.Os_Tecnico2].filter((x) => String(x ?? '').trim()).map(padronizar).filter(Boolean))],
      dataRef, dias: dataRef ? diasEntre(dataRef, hoje) : 0,
      maoDeObra: Math.round(maoDeObra * 100) / 100, deslocamento: Math.round(deslocamento * 100) / 100, pecas: Math.round(vPecas * 100) / 100, total: Math.round(total * 100) / 100,
      garantia: /garantia/i.test(String(o.Tipo_Servico || '')) || /garantia/i.test(String(o.Status || '')),
    }
  }).sort((a, b) => b.dias - a.dias)
}
