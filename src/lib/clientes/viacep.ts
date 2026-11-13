// Confere o CEP do cliente (tomador da NFS-e) nos Correios, pelo ViaCEP — José, 13/11/2026.
// OS-0864 (06/11/2026): o cliente de Piraju estava com 18800-000 (CEP geral da cidade). O Omie
// aceitou, mas o sistema nacional recusou a NFS-e com E0240 ("CEP não existe ou não pertence ao
// município do tomador"). O ViaCEP responde {"erro":true} para esses CEPs gerais e diz a cidade
// de cada CEP que existe — é a mesma conferência que o sistema nacional faz.

export interface CepConferido {
  /** true = existe e é da cidade do cliente; false = vai voltar recusada; null = não deu para conferir agora */
  valido: boolean | null
  cep: string
  /** cidade do CEP segundo os Correios (quando existe) */
  localidade?: string
  logradouro?: string
  /** CEP da zona rural da cidade do cliente, para sugerir */
  sugestaoRural?: string
}

const so8 = (s: string | null | undefined) => String(s || '').replace(/\D/g, '')
export const cepFormatado = (d: string) => (d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : d)

/** "PIRAJU (SP)" / "Piraju" / "Óleo" → "PIRAJU" / "OLEO" (sem acento, sem UF) */
export function normalizarCidade(c: string | null | undefined): string {
  return String(c || '')
    .replace(/\([A-Z]{2}\)\s*$/i, '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z ]/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase()
}

async function buscar<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(5000), cache: 'no-store' })
    if (!r.ok) return null
    return (await r.json()) as T
  } catch { return null }
}

const cache = new Map<string, { em: number; v: CepConferido }>()

export async function conferirCep(cep: string | null | undefined, cidade: string | null | undefined, uf: string | null | undefined): Promise<CepConferido> {
  const d = so8(cep)
  if (d.length !== 8) return { valido: false, cep: d }
  const chave = `${d}|${normalizarCidade(cidade)}`
  const c = cache.get(chave)
  if (c && Date.now() - c.em < 6 * 3600_000) return c.v

  const r = await buscar<{ erro?: boolean | string; localidade?: string; logradouro?: string; uf?: string }>(`https://viacep.com.br/ws/${d}/json/`)
  if (!r) return { valido: null, cep: d } // ViaCEP fora do ar: não trava
  let v: CepConferido
  if (r.erro) v = { valido: false, cep: d }
  else {
    const mesma = !normalizarCidade(cidade) || normalizarCidade(r.localidade) === normalizarCidade(cidade)
    v = { valido: mesma, cep: d, localidade: r.localidade, logradouro: r.logradouro }
  }
  if (!v.valido) v.sugestaoRural = await cepRural(cidade, uf || r.uf)
  cache.set(chave, { em: Date.now(), v })
  return v
}

/** CEP "Área Rural" da cidade (ex.: Óleo 18794-899, Fartura 18879-899) */
async function cepRural(cidade: string | null | undefined, uf: string | null | undefined): Promise<string | undefined> {
  const nome = String(cidade || '').replace(/\([A-Z]{2}\)\s*$/i, '').trim()
  const u = String(uf || '').trim().toUpperCase() || (String(cidade || '').match(/\(([A-Z]{2})\)\s*$/i)?.[1] || '').toUpperCase()
  if (!nome || u.length !== 2) return undefined
  const lista = await buscar<Array<{ cep?: string; logradouro?: string; localidade?: string }>>(
    `https://viacep.com.br/ws/${u}/${encodeURIComponent(nome)}/${encodeURIComponent('Area Rural')}/json/`,
  )
  const achado = (Array.isArray(lista) ? lista : []).find((x) => /rural/i.test(String(x.logradouro || '')) && normalizarCidade(x.localidade) === normalizarCidade(nome))
  return achado?.cep || undefined
}

/** Texto do item "CEP do cliente" na janela Antes de faturar */
export function detalheCep(v: CepConferido, cidade: string | null | undefined): string {
  const cep = cepFormatado(v.cep)
  const cid = String(cidade || '').trim()
  if (v.valido === null) return `${cep || 'sem CEP'} — não deu para conferir nos Correios agora; confira antes de faturar`
  if (v.valido) return `${cep}${v.logradouro ? ` · ${v.logradouro}` : ''}${v.localidade ? `, ${v.localidade}` : ''}`
  const rural = v.sugestaoRural ? ` Na zona rural${cid ? ` de ${normalizarCidade(cid).toLowerCase().replace(/\b\w/g, (l) => l.toUpperCase())}` : ''} o CEP é ${v.sugestaoRural}.` : ''
  if (v.cep.length !== 8) return `o cliente está sem CEP válido no cadastro do Omie — a NFS-e volta recusada.${rural} Corrija o cadastro.`
  if (v.localidade) return `o CEP ${cep} é de ${v.localidade}, mas o cliente está em ${cid || '(cidade vazia)'} — a NFS-e volta recusada (E0240).${rural} Corrija o cadastro.`
  return `o CEP ${cep} não existe nos Correios${v.cep.endsWith('000') ? ' (é o CEP geral da cidade)' : ''} — a NFS-e volta recusada (E0240).${rural} Corrija o cadastro.`
}
