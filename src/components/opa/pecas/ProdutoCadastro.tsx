'use client'
// "Esse código já é um produto?" — debaixo do campo de código (captação,
// verificação, código correto da embalagem errada). Consulta
// GET /api/opa/pecas/produto enquanto a pessoa digita e mostra o cadastro
// de cada empresa: descrição, tipo, locação, estoque, preço, marca, família
// e as demais características do PPV. Sem o código exato, mostra os produtos
// cujo código CONTÉM o digitado ("348U1" → RP-006034348U1) e, com `onUsar`,
// a pessoa troca o campo pelo código certo. Sem código → não mostra nada.
// Visual: estilo POS NewPortal (docs/estilo-pos-newportal.md).

import { useEffect, useState } from 'react'
import { ArrowRight, CheckCircle2, Loader2, MapPin, PackageSearch, PackageX, RotateCcw } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { mensagemErro } from '@/lib/opa-pecas/fotos'
import { fmtPreco } from '@/lib/opa-pecas/regras'
import { variantesCodigo, type Cadastro, type Parecido } from '@/lib/opa-pecas/relacao'

interface Consulta { cadastros: Cadastro[]; parecidos: Parecido[] }

/** Cache por código (a mesma peça aparece em várias telas na sessão). */
const cache = new Map<string, Consulta>()

async function cabecalhoAuth(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token || ''
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/** Busca o cadastro de um código (com cache). Lança se a consulta falhar. */
export async function buscarCadastro(codigo: string): Promise<Consulta> {
  const k = codigo.trim().toUpperCase()
  if (!k) return { cadastros: [], parecidos: [] }
  const emCache = cache.get(k)
  if (emCache) return emCache
  let r: Response
  try {
    r = await fetch(`/api/opa/pecas/produto?codigo=${encodeURIComponent(codigo.trim())}`, { headers: await cabecalhoAuth(), cache: 'no-store' })
  } catch (e) {
    // "Failed to fetch" (sem rede ou o servidor reiniciando no deploy) → mensagem em português
    throw new Error(mensagemErro(e))
  }
  const j = await r.json().catch(() => ({}))
  if (!r.ok || !j.ok) throw new Error(j.erro || 'Não consegui consultar o cadastro.')
  const res: Consulta = { cadastros: j.cadastros || [], parecidos: j.parecidos || [] }
  cache.set(k, res)
  return res
}

/** Estado da consulta de um código (com espera de 450 ms enquanto digita). */
export function useCadastro(codigo: string | null | undefined): { carregando: boolean; cadastros: Cadastro[] | null; parecidos: Parecido[]; erro: string | null; tentarDeNovo: () => void } {
  const alvo = String(codigo ?? '').trim()
  const [res, setRes] = useState<{ alvo: string; dados: Consulta | null; erro: string | null }>({ alvo: '', dados: null, erro: null })
  const [tentativa, setTentativa] = useState(0)
  const tentarDeNovo = () => { setRes({ alvo: '', dados: null, erro: null }); setTentativa((n) => n + 1) }
  useEffect(() => {
    if (!alvo) return
    let vivo = true
    const t = setTimeout(() => {
      buscarCadastro(alvo)
        .then((c) => { if (vivo) setRes({ alvo, dados: c, erro: null }) })
        .catch((e) => { if (vivo) setRes({ alvo, dados: null, erro: e instanceof Error ? e.message : String(e) }) })
    }, cache.has(alvo.toUpperCase()) ? 0 : 450)
    return () => { vivo = false; clearTimeout(t) }
  }, [alvo, tentativa])
  if (!alvo) return { carregando: false, cadastros: null, parecidos: [], erro: null, tentarDeNovo }
  if (res.alvo !== alvo) return { carregando: true, cadastros: null, parecidos: [], erro: null, tentarDeNovo }
  return { carregando: false, cadastros: res.dados?.cadastros ?? null, parecidos: res.dados?.parecidos ?? [], erro: res.erro, tentarDeNovo }
}

export default function ProdutoCadastro({ codigo, compacto = false, onUsar }: {
  codigo: string | null | undefined
  compacto?: boolean
  /** troca o campo pelo código escolhido entre os parecidos (sem isto, só mostra) */
  onUsar?: (codigo: string) => void
}) {
  const { carregando, cadastros, parecidos, erro, tentarDeNovo } = useCadastro(codigo)
  const [verMais, setVerMais] = useState(false)
  if (!String(codigo ?? '').trim()) return null

  if (carregando) {
    return <div style={{ ...CAIXA, color: 'var(--portal-text-muted)' }}><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Procurando no cadastro…</div>
  }
  if (erro) {
    return (
      <div style={{ ...CAIXA, ...tom('#DC2626'), flexWrap: 'wrap' }}>
        <span style={{ flex: 1, minWidth: 180, color: 'var(--portal-text)' }}>Não consegui consultar o cadastro: {erro}</span>
        <button type="button" onClick={tentarDeNovo} style={BOTAO('#B91C1C')}><RotateCcw size={13} /> Tentar de novo</button>
      </div>
    )
  }
  if (!cadastros || cadastros.length === 0) {
    const digitado = String(codigo).trim()
    if (parecidos.length > 0) {
      return (
        <div style={{ ...CAIXA, ...tom('#2563EB'), flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={ICONE('#2563EB')}><PackageSearch size={16} /></span>
            <span style={{ flex: 1, minWidth: 0, color: 'var(--portal-text)' }}>
              <span style={{ display: 'block', fontSize: 14.5, fontWeight: 500 }}>
                Achei {parecidos.length === 1 ? 'um produto' : `${parecidos.length} produtos`} com {digitado} no código
              </span>
              <span style={{ display: 'block', fontSize: 12.5, color: 'var(--portal-text-secondary)' }}>
                {onUsar ? 'Se for a mesma peça, toque em “Usar este código”.' : 'Confira se é a mesma peça.'}
              </span>
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {parecidos.map((p) => (
              <div key={p.empresa + p.codigo} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '9px 11px', borderRadius: 12, background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)' }}>
                <span style={CHIP(p.empresa === 'CASTRO' ? '#7C3AED' : '#2563EB')}>{p.empresa === 'CASTRO' ? 'Castro' : 'Nova'}</span>
                <span style={{ flex: 1, minWidth: 160 }}>
                  <span style={{ display: 'block', fontFamily: 'monospace', fontSize: 14.5, color: 'var(--portal-text)' }}>{realce(p.codigo, digitado)}</span>
                  {p.descricao && <span style={{ display: 'block', fontSize: 12.5, color: 'var(--portal-text-secondary)' }}>{p.descricao}</span>}
                </span>
                {p.inativo && <span style={CHIP('#DC2626')}>inativo</span>}
                {onUsar && (
                  <button type="button" onClick={() => onUsar(p.codigo)} style={BOTAO('#2563EB', true)}>
                    Usar este código <ArrowRight size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )
    }
    const outras = variantesCodigo(codigo).filter((v) => v !== digitado.toUpperCase())
    return (
      <div style={{ ...CAIXA, ...tom('#D97706'), flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={ICONE('#D97706')}><PackageX size={16} /></span>
          <span style={{ flex: 1, minWidth: 0, color: 'var(--portal-text)' }}>
            <span style={{ display: 'block', fontSize: 14.5, fontWeight: 500 }}>Código não encontrado no cadastro</span>
            <span style={{ display: 'block', fontSize: 12.5, color: 'var(--portal-text-secondary)' }}>
              Procurei <span style={{ fontFamily: 'monospace' }}>{digitado}</span>{outras.length > 0 && <> (também como {outras.join(', ')})</>} e códigos que contenham ele, na Nova e na Castro.
            </span>
          </span>
        </div>
        {verMais ? (
          <div style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--portal-text-secondary)' }}>
            Pode ser código digitado errado (confira letras e números), peça que nunca foi cadastrada no Omie,
            embalagem com o código de outra peça (na verificação, marque &ldquo;embalagem com o código errado&rdquo;) ou
            produto cadastrado hoje no Omie (o portal atualiza o cadastro toda madrugada, às 3h).
            A peça continua normal no Opa; só não fica ligada a um produto do estoque.
          </div>
        ) : (
          <button type="button" onClick={() => setVerMais(true)} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, color: '#B45309', textDecoration: 'underline' }}>
            Por que pode não ter achado?
          </button>
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {cadastros.map((c) => (
        <div key={c.empresa} style={{ ...CAIXA, ...tom('#16A34A'), flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={ICONE('#16A34A')}><CheckCircle2 size={16} /></span>
            <span style={{ flex: 1, minWidth: 0, color: 'var(--portal-text)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 14.5, fontWeight: 500 }}>
                Produto cadastrado
                <span style={CHIP(c.empresa === 'CASTRO' ? '#7C3AED' : '#2563EB')}>{c.empresa === 'CASTRO' ? 'Castro' : 'Nova'}</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 400 }}>{c.codigo}</span>
                {c.inativo && <span style={CHIP('#DC2626')}>inativo</span>}
              </span>
              {c.descricao && <span style={{ display: 'block', fontSize: 13, color: 'var(--portal-text-secondary)' }}>{c.descricao}</span>}
            </span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontSize: 12.5, color: 'var(--portal-text-secondary)' }}>
            {c.tipo && <span>Tipo: <span style={{ color: 'var(--portal-text)' }}>{c.tipo}</span></span>}
            {/* prateleira, andar e caixa SEMPRE aparecem — o que faltar mostra "não tem" */}
            {([['Prateleira', c.posicao?.prateleira], ['Andar', c.posicao?.andar], ['Caixa', c.posicao?.caixa]] as const).map(([r, v]) => (
              <span key={r} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                {r === 'Prateleira' && <MapPin size={12} />}{r}: <span style={{ color: v ? 'var(--portal-text)' : '#B45309' }}>{v || 'não tem'}</span>
              </span>
            ))}
            {c.estoque != null && <span>Estoque: <span style={{ color: 'var(--portal-text)', fontVariantNumeric: 'tabular-nums' }}>{String(c.estoque).replace('.', ',')}</span></span>}
            {c.valor_unitario != null && <span>Valor: <span style={{ color: 'var(--portal-text)', fontVariantNumeric: 'tabular-nums' }}>{fmtPreco(c.valor_unitario)}</span></span>}
            {c.marca && <span>Marca: <span style={{ color: 'var(--portal-text)' }}>{c.marca}</span></span>}
            {c.familia && <span>Família: <span style={{ color: 'var(--portal-text)' }}>{c.familia}</span></span>}
          </div>
          {!compacto && c.outras.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {c.outras.map((o) => (
                <span key={o.nome} style={CHIP('#16A34A')}>{o.nome}: {o.valor}</span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

/** Destaca o trecho digitado dentro do código achado. */
function realce(codigo: string, digitado: string) {
  const alvo = digitado.toUpperCase().replace(/^RP-?/, '').replace(/[^A-Z0-9]/g, '')
  const i = alvo ? codigo.toUpperCase().indexOf(alvo) : -1
  if (i < 0) return codigo
  return <>{codigo.slice(0, i)}<mark style={{ background: 'color-mix(in srgb, #2563EB 16%, transparent)', color: 'inherit', borderRadius: 4, padding: '0 2px' }}>{codigo.slice(i, i + alvo.length)}</mark>{codigo.slice(i + alvo.length)}</>
}

const CAIXA: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', borderRadius: 14, fontSize: 13, lineHeight: 1.4,
  border: '1px solid var(--portal-border)', background: 'var(--portal-bg-card)',
}
/** Fundo clarinho + borda na cor (sem faixa lateral). */
const tom = (cor: string): React.CSSProperties => ({
  background: `color-mix(in srgb, ${cor} 6%, var(--portal-bg-card))`, border: `1px solid color-mix(in srgb, ${cor} 24%, var(--portal-border))`,
})
const ICONE = (cor: string): React.CSSProperties => ({
  width: 32, height: 32, borderRadius: 9, display: 'grid', placeItems: 'center', flex: 'none', color: cor,
  background: `color-mix(in srgb, ${cor} 11%, var(--portal-bg-card))`, border: `1px solid color-mix(in srgb, ${cor} 18%, transparent)`,
})
const CHIP = (cor: string): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', fontSize: 12, fontWeight: 400, padding: '1px 9px', borderRadius: 99, whiteSpace: 'nowrap',
  color: cor, background: `color-mix(in srgb, ${cor} 10%, var(--portal-bg-card))`, border: `1px solid color-mix(in srgb, ${cor} 20%, transparent)`,
})
const BOTAO = (cor: string, cheio = false): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
  fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap',
  ...(cheio ? { background: cor, color: '#fefefe', border: 'none' } : { background: 'transparent', color: cor, border: `1px solid ${cor}` }),
})
