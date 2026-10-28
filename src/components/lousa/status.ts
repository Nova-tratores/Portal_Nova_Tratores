// Cor da fase da OS nos cartões e na ficha da Lousa (selo, nunca faixa lateral — padrão de telas).
export function corStatusOS(status: string | null | undefined): string {
  const s = String(status || '').toLowerCase()
  if (/cancel/.test(s)) return '#dc2626'
  if (/conclu/.test(s)) return '#16a34a'
  if (/aguardando pe|transporte/.test(s)) return '#ea580c'
  if (/execu/.test(s)) return '#d97706'
  if (/aprovado/.test(s)) return '#2563eb'
  if (/or[cç]amento/.test(s)) return '#64748b'
  if (/aguardando ordem|relat/.test(s)) return '#7c3aed'
  if (/omie|cobrando|garantia/.test(s)) return '#0891b2'
  return '#64748b'
}

/** nome curto da fase para o selo do cartão */
export function faseCurta(status: string | null | undefined): string {
  const s = String(status || '')
  if (/aguardando pe/i.test(s)) return 'Aguard. peças'
  if (/realizando diag/i.test(s)) return 'Diagnóstico'
  if (/aguardando ordem/i.test(s)) return 'Aguard. ordem'
  if (/or[cç]amento enviado/i.test(s)) return 'Orç. enviado'
  if (/or[cç]amento aprovado/i.test(s)) return 'Aprovado'
  if (/relat[oó]rio conclu/i.test(s)) return 'Relatório ok'
  if (/preenchido garantia/i.test(s)) return 'Garantia'
  return s.length > 14 ? s.slice(0, 13) + '…' : s
}
