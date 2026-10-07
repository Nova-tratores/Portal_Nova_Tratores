// Regras PURAS para reconhecer se um anexo do card financeiro é BOLETO ou
// NOTA FISCAL, e os avisos mostrados antes de mandar o boleto por e-mail.
// Nada aqui proíbe: quem decide é a pessoa (pedido do José — "tem que avisar,
// mas não precisa proibir").

export type TipoAnexo = 'boleto' | 'nf'

/** Campo onde o arquivo está sendo anexado, a partir do rótulo do botão ("NF PECA", "BOLETO 2", "Nota Fiscal"…). */
export function campoDoRotulo(rotulo: string | null | undefined): TipoAnexo | null {
  const r = String(rotulo || '').toLowerCase()
  if (/boleto/.test(r)) return 'boleto'
  if (/\bnf\b|nota|danfe/.test(r)) return 'nf'
  return null
}

/** Pelo nome do arquivo. "BOLETO_NF_9347.pdf" é boleto: a palavra boleto manda. */
export function tipoPorNome(nome: string | null | undefined): TipoAnexo | null {
  const n = String(nome || '').toLowerCase()
  if (/boleto|bloqueto/.test(n)) return 'boleto'
  if (/danfe|danfse|nfs-?e|nf-?e|nota[\s_-]*fiscal|(^|[^a-z])nf([^a-z]|$)/.test(n)) return 'nf'
  return null
}

const MARCAS_BOLETO = [
  /linha\s+digit[aá]vel/,
  /nosso\s+n[uú]mero/,
  /ficha\s+de\s+compensa[cç][aã]o/,
  /recibo\s+do\s+(pagador|sacado)/,
  /local\s+de\s+pagamento/,
  /pag[aá]vel\s+(preferencialmente|em\s+qualquer)/,
  /\b\d{5}\.?\d{5}\s+\d{5}\.?\d{6}\s+\d{5}\.?\d{6}\s+\d\s+\d{14}\b/, // linha digitável
]
const MARCAS_NF = [
  /\bdanfe\b/,
  /documento\s+auxiliar\s+da\s+nota\s+fiscal/,
  /chave\s+de\s+acesso/,
  /nota\s+fiscal\s+(eletr[oô]nica\s+)?de\s+servi[cç]os?/,
  /\bnfs-?e\b/,
  /protocolo\s+de\s+autoriza[cç][aã]o/,
]

/** Pelo texto do PDF. Só decide quando um lado tem marcas e o outro não. */
export function tipoPorTexto(texto: string | null | undefined): TipoAnexo | null {
  const t = String(texto || '').toLowerCase()
  if (!t.trim()) return null
  const b = MARCAS_BOLETO.filter((re) => re.test(t)).length
  const n = MARCAS_NF.filter((re) => re.test(t)).length
  if (b >= 2 && n === 0) return 'boleto'
  if (n >= 2 && b === 0) return 'nf'
  if (b >= 2 && b >= n + 2) return 'boleto'
  if (n >= 2 && n >= b + 2) return 'nf'
  return null
}

const NOME_TIPO: Record<TipoAnexo, string> = { boleto: 'um BOLETO', nf: 'uma NOTA FISCAL' }
const NOME_CAMPO: Record<TipoAnexo, string> = { boleto: 'BOLETO', nf: 'NOTA FISCAL' }

/** Mensagem de confirmação quando o arquivo parece ser do outro tipo; null se está tudo certo. */
export function avisoAnexoTrocado(campo: TipoAnexo | null, detectado: TipoAnexo | null, nomeArquivo = ''): string | null {
  if (!campo || !detectado || campo === detectado) return null
  const arq = nomeArquivo ? `"${nomeArquivo}"` : 'Este arquivo'
  return `${arq} parece ser ${NOME_TIPO[detectado]}, mas você está anexando no campo de ${NOME_CAMPO[campo]}.\n\nSe o cliente receber assim, ele pode ficar sem a nota fiscal ou com o boleto em dobro.\n\nAnexar mesmo assim?`
}

// ---------------------------------------------------------------------
// Avisos antes do envio do e-mail do boleto
// ---------------------------------------------------------------------

export type AnexoEnvio = { nome: string; hash: string }
export type EnvioAnterior = { criado_em: string; destinatarios?: string | null }
export type AvisoEnvio = { codigo: 'nf_igual_boleto' | 'sem_nf' | 'nf_parece_boleto' | 'boleto_parece_nf' | 'ja_enviado'; mensagem: string }

function dataHoraBR(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function avisosEnvio(p: { boletos: AnexoEnvio[]; nfs: AnexoEnvio[]; enviosAnteriores?: EnvioAnterior[] }): AvisoEnvio[] {
  const avisos: AvisoEnvio[] = []
  const hashesBoleto = new Set(p.boletos.map((b) => b.hash))

  if (p.nfs.some((n) => hashesBoleto.has(n.hash))) {
    avisos.push({ codigo: 'nf_igual_boleto', mensagem: 'O arquivo anexado como NOTA FISCAL é o mesmo do BOLETO. O cliente receberia o boleto e ficaria sem a nota.' })
  } else if (p.nfs.some((n) => tipoPorNome(n.nome) === 'boleto')) {
    avisos.push({ codigo: 'nf_parece_boleto', mensagem: 'O arquivo anexado como NOTA FISCAL parece ser um boleto (pelo nome).' })
  }
  if (p.boletos.some((b) => tipoPorNome(b.nome) === 'nf')) {
    avisos.push({ codigo: 'boleto_parece_nf', mensagem: 'O arquivo anexado como BOLETO parece ser uma nota fiscal (pelo nome).' })
  }
  const nfsDeVerdade = p.nfs.filter((n) => !hashesBoleto.has(n.hash))
  if (p.boletos.length && !nfsDeVerdade.length) {
    avisos.push({ codigo: 'sem_nf', mensagem: 'Este card não tem a NOTA FISCAL anexada — o e-mail iria só com o boleto.' })
  }
  const ultimo = [...(p.enviosAnteriores || [])].sort((a, b) => b.criado_em.localeCompare(a.criado_em))[0]
  if (ultimo) {
    const para = ultimo.destinatarios ? ` para ${ultimo.destinatarios}` : ''
    avisos.push({ codigo: 'ja_enviado', mensagem: `Este boleto já foi enviado em ${dataHoraBR(ultimo.criado_em)}${para}. O cliente vai receber de novo.` })
  }
  return avisos
}

/** Texto do confirm() mostrado a quem está enviando. */
export function textoConfirmacaoEnvio(avisos: { mensagem: string }[]): string {
  return `Atenção antes de enviar:\n\n${avisos.map((a) => `• ${a.mensagem}`).join('\n')}\n\nEnviar mesmo assim?`
}

/** Tira arquivos repetidos (mesmo conteúdo) — o cliente nunca recebe o mesmo PDF duas vezes. */
export function semRepetidos<T extends { hash: string }>(lista: T[]): T[] {
  const vistos = new Set<string>()
  return lista.filter((a) => (vistos.has(a.hash) ? false : (vistos.add(a.hash), true)))
}
