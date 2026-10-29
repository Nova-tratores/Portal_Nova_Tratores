// Chico Chave — o robô de regras do km e das horas (José, 28/10/2026: "tem como fazer um robô pra nos dizer esse
// tipo de coisa ou é melhor o Tratorilson?" → "faz os dois"). PURO: lê os campos da OS e diz POR QUE o que o técnico
// pôs no relatório não foi cobrado (OS interna, garantia, desconto, ainda não faturada, km não lançado…). Sem IA: o
// motivo está na própria OS, então ele acerta sempre e responde na hora. O Tratorilson recebe estes fatos prontos.

export type EtiquetaChico = 'interna' | 'garantia' | 'aberta' | 'desconto' | 'oficina' | 'nao-lancado'
/** texto = a frase inteira (balão, Tratorilson); curto = o resumo da linha na tabela */
export interface MotivoChico { etiqueta: EtiquetaChico; texto: string; curto: string }
export const ROTULO_CHICO: Record<EtiquetaChico, string> = {
  interna: 'OS interna', garantia: 'garantia', aberta: 'ainda não faturada', desconto: 'desconto', oficina: 'serviço na oficina', 'nao-lancado': 'não lançado na OS',
}

/** os campos da OS que o Chico lê */
export interface OSChico {
  Status?: string | null; faturamento_status?: string | null; Servico_Interno?: boolean | null; Servico_Oficina?: boolean | null
  Tipo_Servico?: string | null; Desconto_KM?: number | null; Desconto_Hora?: number | null; Qtd_KM?: number | null; Qtd_HR?: number | null
  recibo_numero?: string | number | null; faturado_por?: string | null; faturado_omie_em?: string | null
}

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
/** "antonio.novatratores@gmail.com" → "Antonio" */
const quem = (s: string | null | undefined) => {
  const b = String(s || '').split('@')[0].split(/[._-]/)[0]
  return b ? b[0].toUpperCase() + b.slice(1).toLowerCase() : ''
}
const num = (v: unknown) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0 }

/** Por que o relatório (km ou horas) não virou cobrança nesta OS. Pode ter mais de um motivo. */
export function motivosChico(o: OSChico, oQue: 'km' | 'horas', rel: number, cob: number): MotivoChico[] {
  const out: MotivoChico[] = []
  const fmt = (v: number) => (oQue === 'km' ? `${Math.round(v)} km` : `${String(Math.round(v * 10) / 10).replace('.', ',')} h`)
  const faturada = !!o.faturamento_status || /conclu|faturad/i.test(String(o.Status || ''))
  const porEm = `${o.faturado_por ? ` por ${quem(o.faturado_por)}` : ''}${o.faturado_omie_em ? ` em ${ddmm(o.faturado_omie_em)}` : ''}`
  const quemQuando = [o.faturado_por ? quem(o.faturado_por) : '', o.faturado_omie_em ? ddmm(o.faturado_omie_em) : ''].filter(Boolean).join(', ')
  if (o.Servico_Interno) out.push({ etiqueta: 'interna', texto: `A OS está marcada como serviço interno${o.recibo_numero ? ` e foi faturada como recibo interno nº ${o.recibo_numero}` : faturada ? ' e foi faturada' : ''}${porEm}, com ${oQue === 'km' ? 'o km' : 'as horas'} em ${fmt(cob)}.`, curto: o.recibo_numero ? `recibo interno nº ${o.recibo_numero}${quemQuando ? ` (${quemQuando})` : ''}` : 'OS interna' })
  if (/garant/i.test(String(o.Tipo_Servico || ''))) out.push({ etiqueta: 'garantia', texto: `É ${String(o.Tipo_Servico).toLowerCase()}: ${oQue === 'km' ? 'o km' : 'a hora'} pode ser pago pela fábrica, não pelo cliente.`, curto: 'paga pela fábrica' })
  if (!faturada) out.push({ etiqueta: 'aberta', texto: `Ainda não foi faturada (está em "${o.Status || 'sem status'}"): ${oQue === 'km' ? 'o km' : 'as horas'} ainda ${oQue === 'km' ? 'pode' : 'podem'} ser ${oQue === 'km' ? 'corrigido' : 'corrigidas'} antes de faturar.`, curto: `ainda em "${o.Status || 'aberto'}": dá para corrigir` })
  const desc = oQue === 'km' ? num(o.Desconto_KM) : num(o.Desconto_Hora)
  if (desc > 0) out.push({ etiqueta: 'desconto', texto: `Teve desconto de ${oQue === 'km' ? 'km' : 'hora'} na OS (${desc.toLocaleString('pt-BR')}).`, curto: `desconto de ${desc.toLocaleString('pt-BR')}` })
  if (o.Servico_Oficina && oQue === 'km') out.push({ etiqueta: 'oficina', texto: 'A OS está marcada como serviço na oficina, então não cobra deslocamento.', curto: 'serviço na oficina' })
  if (!out.length) out.push({ etiqueta: 'nao-lancado', texto: `O relatório tem ${fmt(rel)} e a OS foi faturada com ${fmt(cob)}${porEm}, sem desconto e sem ser interna ou garantia: ${oQue === 'km' ? 'o km' : 'as horas'} ${rel - cob === 1 ? 'ficou' : 'ficaram'} de fora. Conferir com quem faturou.`, curto: `faturada sem ${oQue === 'km' ? 'o km' : 'as horas'}${quemQuando ? ` (${quemQuando})` : ''}: conferir` })
  return out
}
