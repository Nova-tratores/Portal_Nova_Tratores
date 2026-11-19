// "Serve em": modelo de trator ou implemento de cada peça do site (José, 10/11/2026: "foto, nome da peça e modelo do
// trator ou implemento"). Duas fontes: o catálogo de peças do portal (código → modelo) e, sem ele, o que a própria
// descrição do Omie cita (ex.: "JUMIL", "MF", "TL 5.80", "2025"). Puro: testado em __tests__/modelos.test.ts.

/** Mahindra: modelo do catálogo ("6075L", "6075 P2", "Jivo 2025") → nome curto ("Mahindra 6075"). */
export function nomeModelo(bruto: string): string {
  const s = (bruto || '').trim()
  const m = s.match(/(86-110|8000S|9500S|OJA\s*\d{4}|\d{4})/i)
  if (/^(WT|BM)\d/i.test(s)) return `Valtra ${s.toUpperCase()}`
  if (m && /^\d|^OJA|^Jivo|^86-110|^8000S/i.test(s)) return `Mahindra ${m[1].toUpperCase().replace(/\s+/, ' ')}`
  // implementos (Kuhn, etc.): o nome do catálogo já é o modelo
  return s.replace(/_/g, ' ')
}

const MARCAS_DESCRICAO: [RegExp, string][] = [
  [/\bJUMIL\b/i, 'Jumil'], [/\bMASSEY\b|\bMF\b/i, 'Massey Ferguson'], [/\bNEW HOLLAND\b|\bNH\b|\bTL ?\d/i, 'New Holland'],
  [/\bVALTRA\b|\bBM ?\d{3}\b/i, 'Valtra'], [/\bJOHN DEERE\b|\bJD\b/i, 'John Deere'], [/\bFORD\b/i, 'Ford'],
  [/\bCASE\b/i, 'Case'], [/\bKUHN\b/i, 'Kuhn'], [/\bTATU\b|\bMARCHESAN\b/i, 'Tatu Marchesan'], [/\bBALDAN\b/i, 'Baldan'],
  [/\bJACTO\b/i, 'Jacto'], [/\bSTARA\b/i, 'Stara'], [/\bVENTURA\b/i, 'Ventura'], [/\bZF\b/i, 'ZF'], [/\bCARRARO\b/i, 'Carraro'],
  [/\bAGRALE\b/i, 'Agrale'], [/\bYANMAR\b/i, 'Yanmar'], [/\bKAMAQ\b/i, 'Kamaq'], [/\bMARISPAN\b/i, 'Marispan'],
  [/\bSEMEATO\b/i, 'Semeato'], [/\bVENCE ?TUDO\b/i, 'Vence Tudo'], [/\bPICCIN\b/i, 'Piccin'], [/\bLUMA\b/i, 'Luma'],
]

/** Modelo citado na descrição (quando a peça não está no catálogo). */
export function modeloDaDescricao(descricao: string, grupo: 'mahindra' | 'outras'): string[] {
  const d = (descricao || '').toUpperCase()
  const achados: string[] = []
  if (grupo === 'mahindra') {
    const m = d.match(/\b(86-110\s*P?|OJA\s*\d{4}|JIVO\s*2025|MSTAR|9500S?|8000S?|20(?:25)|50(?:50)|60(?:60|65|75)E?|7095|8110|6675F?)\b/g)
    for (const x of m || []) {
      const v = x.replace(/\s+/g, ' ').replace(/^JIVO /, '').replace('MSTAR', '6075').replace(/P$/, '')
      const nome = `Mahindra ${v}`
      if (!achados.includes(nome)) achados.push(nome)
    }
  } else {
    for (const [re, nome] of MARCAS_DESCRICAO) if (re.test(d) && !achados.includes(nome)) achados.push(nome)
    const tl = d.match(/\bTL ?(\d[\d.,]*)/)
    if (tl && achados.includes('New Holland')) achados[achados.indexOf('New Holland')] = `New Holland TL ${tl[1]}`
  }
  return achados.slice(0, 3)
}

/** Junta os modelos de uma peça: catálogo primeiro, depois descrição, sem repetir; no máximo 3. */
export function servem(catalogo: string[], descricao: string[]): string[] {
  const out: string[] = []
  for (const m of [...catalogo, ...descricao]) if (m && !out.includes(m)) out.push(m)
  return out.slice(0, 3)
}
