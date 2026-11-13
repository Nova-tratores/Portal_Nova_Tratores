// Máquinas da loja para a tela do diretor (/empresa → Comercial → Estoque da loja e Vitrine): as do estoque separadas
// por local + as que estão em demonstração, com foto, custo, preço e custo de ficar parada (SELIC desde a entrada —
// a conta do Visual Estoque). Gravado em empresa_painel (área 'maquinas') para a tela não reler ~11,5 mil produtos.
//
// FOTOS (José, 12/11: "não pode faltar fotos, pega na internet"): toda máquina mostrada precisa de foto.
// Sem foto, ou com foto de outro site que não abre (muitos bloqueiam a imagem fora do site deles), busca no Bing
// (a mesma busca do Visual Estoque), BAIXA a imagem e guarda no armazenamento do portal (bucket fotos-maquinas) —
// assim nunca é bloqueada. Grava o endereço novo em produtos.imagem_url (vale também no Visual Estoque).
import { buscarProdutosEnriquecidos, buscarMaquinasDemonstracao, type ProdutoVE } from '@/lib/visual-estoque/data'
import { buscarImagensBing } from '@/lib/visual-estoque/bing'
import { supabaseAdmin } from '@/lib/server/supabase-admin'

const FORA = /^pe[cç]as?$|agricultura de precis|requisi|####/i
// Fartura não existe mais (José, 11/11): o que estava lá cai no Showroom, como o Visual Estoque faz com local desconhecido
const LOCAIS = ['patio', 'showroom', 'oficina', 'oficina2', 'barracao'] as const
const BUCKET = 'fotos-maquinas'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

/** termo de busca: a descrição sem série, chassi, motor, nº de certificado etc. + a marca */
export function termoFoto(descricao: string, marca?: string | null): string {
  const d = String(descricao || '').replace(/^\(\d+\/\d+\)\s*/, '').replace(/^VEICULO NOVO\s+/i, '')
    .replace(/\s*(\||,|\bCOM:|\bMARCA:|\bANO[: ]|\bMOTOR:|\bCHAS|\bS[EÉ]RIE|\bnro\b|\bNUMERO DE|\bCERT\.|\bNR\.|\bPNEU\b|\s\d+(\.\d+)?X\d+).*$/i, '').trim()
  const m = String(marca || '').trim()
  // trator Mahindra cadastrado só com o número ("7095 CABINADO …"): sem a marca a busca não acha
  const t = /^(JIVO|[4-9]\d{3}E?)\b/i.test(d) && !/MAHINDRA/i.test(d) ? `trator Mahindra ${d}` : d
  return (m && !t.toUpperCase().includes(m.toUpperCase()) ? `${t} ${m}` : t).slice(0, 90)
}

/** baixa a imagem; só aceita se for imagem de verdade e não minúscula */
async function baixarImagem(url: string): Promise<{ buf: Buffer; tipo: string } | null> {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'image/*' }, signal: AbortSignal.timeout(10_000) })
    const tipo = (r.headers.get('content-type') || '').split(';')[0].trim()
    if (!r.ok || !/^image\/(jpeg|png|webp|gif)$/.test(tipo)) return null
    const buf = Buffer.from(await r.arrayBuffer())
    return buf.length > 6000 ? { buf, tipo } : null
  } catch { return null }
}
/** opções de foto na internet: miniatura (do Bing, sempre abre) + endereço da original */
export async function buscarOpcoesFoto(termo: string, limite = 12, semFundo = false): Promise<Array<{ miniatura: string; original: string }>> {
  // semFundo: filtro do Bing de imagem transparente (José, 12/11: "tentar remover o fundo")
  const filtro = semFundo ? '&qft=+filterui:photo-transparent' : ''
  const r = await fetch(`https://www.bing.com/images/search?q=${encodeURIComponent(termo)}&form=HDRSC2&first=1${filtro}`, { headers: { 'User-Agent': UA } })
  const html = await r.text()
  const out: Array<{ miniatura: string; original: string }> = []
  for (const m of html.matchAll(/\sm="(\{[^"]+\})"/g)) {
    try {
      const j = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')) as { murl?: string; turl?: string }
      if (j.murl && j.turl) out.push({ miniatura: j.turl, original: j.murl })
    } catch { /* item fora do padrão */ }
    if (out.length >= limite) break
  }
  return out
}

/** baixa a foto escolhida, guarda no armazenamento do portal e grava na máquina; devolve o endereço novo */
export async function guardarFoto(codigo: number, conta: string, url: string, miniatura?: string): Promise<string | null> {
  const ok = (await baixarImagem(url)) || (miniatura ? await baixarImagem(miniatura) : null)
  if (!ok) return null
  const ext = ok.tipo.split('/')[1].replace('jpeg', 'jpg')
  const caminho = `maquinas/${conta}-${codigo}.${ext}`
  const up = await supabaseAdmin.storage.from(BUCKET).upload(caminho, ok.buf, { contentType: ok.tipo, upsert: true })
  if (up.error) return null
  const publico = `${supabaseAdmin.storage.from(BUCKET).getPublicUrl(caminho).data.publicUrl}?v=${Date.now()}`
  await supabaseAdmin.from('produtos').update({ imagem_url: publico }).eq('codigo_produto', codigo).eq('conta_omie', conta)
  return publico
}

const ehNosso = (u: string) => u.includes('/storage/v1/object/public/')
async function fotoAbre(url: string): Promise<boolean> {
  if (!url) return false
  if (ehNosso(url)) return true
  return !!(await baixarImagem(url))
}

/** garante foto para as máquinas dadas; devolve o que achou/não achou. `checarExternas`: testa fotos de outros sites. */
export async function preencherFotos(maquinas: ProdutoVE[], { limite = 8, checarExternas = false } = {}): Promise<{ achou: string[]; sem: string[] }> {
  const achou: string[] = [], sem: string[] = []
  const vistos = new Set<string>()
  let feitos = 0
  for (const m of maquinas) {
    const chave = `${m.conta_omie}|${m.codigo_produto}`
    if (vistos.has(chave)) continue
    vistos.add(chave)
    const atual = String(m.imagem_url || '')
    if (atual && (ehNosso(atual) || !checarExternas)) continue
    if (atual && (await fotoAbre(atual))) continue
    if (feitos >= limite) break
    feitos++
    try {
      const termo = termoFoto(m.descricao, m.marca)
      const urls = await buscarImagensBing(termo, 8)
      let ok: { buf: Buffer; tipo: string } | null = null
      for (const u of urls) { ok = await baixarImagem(u); if (ok) break }
      if (!ok) { sem.push(m.descricao); continue }
      const ext = ok.tipo.split('/')[1].replace('jpeg', 'jpg')
      const caminho = `maquinas/${String(m.conta_omie || 'nova').toLowerCase()}-${m.codigo_produto}.${ext}`
      const up = await supabaseAdmin.storage.from(BUCKET).upload(caminho, ok.buf, { contentType: ok.tipo, upsert: true })
      if (up.error) { sem.push(`${m.descricao} (armazenamento: ${up.error.message})`); continue }
      const publico = `${supabaseAdmin.storage.from(BUCKET).getPublicUrl(caminho).data.publicUrl}?v=${Date.now()}`
      await supabaseAdmin.from('produtos').update({ imagem_url: publico }).eq('codigo_produto', m.codigo_produto).eq('conta_omie', String(m.conta_omie || '').toLowerCase())
      m.imagem_url = publico
      achou.push(m.descricao)
      await new Promise((r) => setTimeout(r, 700)) // o Bing bloqueia se for rápido demais
    } catch { sem.push(m.descricao) }
  }
  return { achou, sem }
}

export async function montarMaquinas(opcoes: { limiteFotos?: number; checarExternas?: boolean } = {}) {
  const [produtos, demonstracao] = await Promise.all([buscarProdutosEnriquecidos(), buscarMaquinasDemonstracao()])
  const maquinas = produtos.filter((p) => p.estoque > 0 && !p.inativo && !FORA.test(p.familia_nome || ''))
  const ambientes: Record<string, ProdutoVE[]> = { patio: [], showroom: [], oficina: [], oficina2: [], barracao: [], demonstracao: [] }
  for (const m of maquinas) ambientes[(LOCAIS as readonly string[]).includes(m.ambiente) ? m.ambiente : 'showroom'].push(m)
  ambientes.demonstracao = demonstracao.filter((p) => !/requisi|####/i.test(p.familia_nome || ''))
  // fotos que faltam (o robô faz algumas por rodada; não trava a tela se o Bing falhar)
  try { await preencherFotos(Object.values(ambientes).flat(), { limite: opcoes.limiteFotos ?? 8, checarExternas: opcoes.checarExternas }) } catch { /* segue */ }
  return { ambientes, total: maquinas.length, geradoEm: new Date().toISOString() }
}
