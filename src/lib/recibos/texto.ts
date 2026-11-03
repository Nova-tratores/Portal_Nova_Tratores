// Texto do corpo do recibo — puro (o PDF e a página pública usam o mesmo).
import { reaisPorExtenso } from './extenso'
import { brl, formatarDoc, rotuloDoc, type DadosRecibo, type EmpresaRecibo } from './tipos'

const comDoc = (nome: string, doc?: string | null) => {
  const r = rotuloDoc(doc)
  return r ? `${nome}, ${r} ${formatarDoc(doc)}` : nome
}

export function corpoRecibo(r: DadosRecibo, emp: EmpresaRecibo): string {
  const valor = `${brl(r.valor)} (${reaisPorExtenso(r.valor)})`
  const ref = r.referente.replace(/[.\s]+$/, '')
  const forma = r.forma === 'PIX' ? 'PIX' : r.forma.toLowerCase()
  if (r.tipo === 'recebemos') {
    return `Recebemos de ${comDoc(r.pessoa_nome, r.pessoa_doc)}, a importância de ${valor}, referente a ${ref}, `
      + `paga por ${forma}. Pelo que damos plena e geral quitação do valor acima.`
  }
  return `Recebi de ${comDoc(emp.razao_social, emp.cnpj)}, a importância de ${valor}, referente a ${ref}, `
    + `recebida por ${forma}. Pelo que dou plena e geral quitação do valor acima.`
}
