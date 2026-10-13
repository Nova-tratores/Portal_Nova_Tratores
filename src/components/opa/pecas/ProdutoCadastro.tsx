'use client'
// "Esse código já é um produto?" — debaixo do campo de código (captação,
// verificação, código correto da embalagem errada). Consulta
// GET /api/opa/pecas/produto enquanto a pessoa digita e mostra o cadastro
// de cada empresa: descrição, tipo, locação, estoque, preço, marca, família
// e as demais características do PPV. Sem código → não mostra nada.

import { useEffect, useState } from 'react'
import { CheckCircle2, Loader2, MapPin, PackageX } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fmtPreco } from '@/lib/opa-pecas/regras'
import type { Cadastro } from '@/lib/opa-pecas/relacao'

/** Cache por código (a mesma peça aparece em várias telas na sessão). */
const cache = new Map<string, Cadastro[]>()

async function cabecalhoAuth(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token || ''
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/** Busca o cadastro de um código (com cache). Lança se a consulta falhar. */
export async function buscarCadastro(codigo: string): Promise<Cadastro[]> {
  const k = codigo.trim().toUpperCase()
  if (!k) return []
  const emCache = cache.get(k)
  if (emCache) return emCache
  const r = await fetch(`/api/opa/pecas/produto?codigo=${encodeURIComponent(codigo.trim())}`, { headers: await cabecalhoAuth(), cache: 'no-store' })
  const j = await r.json().catch(() => ({}))
  if (!r.ok || !j.ok) throw new Error(j.erro || 'Não consegui consultar o cadastro.')
  cache.set(k, j.cadastros || [])
  return j.cadastros || []
}

/** Estado da consulta de um código (com espera de 450 ms enquanto digita). */
export function useCadastro(codigo: string | null | undefined): { carregando: boolean; cadastros: Cadastro[] | null; erro: string | null } {
  const alvo = String(codigo ?? '').trim()
  const [res, setRes] = useState<{ alvo: string; cadastros: Cadastro[] | null; erro: string | null }>({ alvo: '', cadastros: null, erro: null })
  useEffect(() => {
    if (!alvo) return
    let vivo = true
    const t = setTimeout(() => {
      buscarCadastro(alvo)
        .then((c) => { if (vivo) setRes({ alvo, cadastros: c, erro: null }) })
        .catch((e) => { if (vivo) setRes({ alvo, cadastros: null, erro: e instanceof Error ? e.message : String(e) }) })
    }, cache.has(alvo.toUpperCase()) ? 0 : 450)
    return () => { vivo = false; clearTimeout(t) }
  }, [alvo])
  if (!alvo) return { carregando: false, cadastros: null, erro: null }
  if (res.alvo !== alvo) return { carregando: true, cadastros: null, erro: null }
  return { carregando: false, cadastros: res.cadastros, erro: res.erro }
}

export default function ProdutoCadastro({ codigo, compacto = false }: { codigo: string | null | undefined; compacto?: boolean }) {
  const { carregando, cadastros, erro } = useCadastro(codigo)
  if (!String(codigo ?? '').trim()) return null

  if (carregando) {
    return <div style={{ ...CAIXA, borderColor: 'var(--portal-border)', color: 'var(--portal-text-muted)' }}><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Procurando no cadastro…</div>
  }
  if (erro) return <div style={{ ...CAIXA, borderColor: '#FCA5A5', color: '#B91C1C' }}>{erro}</div>
  if (!cadastros || cadastros.length === 0) {
    return (
      <div style={{ ...CAIXA, borderColor: '#FCD34D', background: '#FFFBEB', color: '#92400E' }}>
        <PackageX size={15} /> <span><b>Não é produto cadastrado</b> — o código não existe no cadastro (Omie/PPV) da Nova nem da Castro.</span>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {cadastros.map((c) => (
        <div key={c.empresa} style={{ ...CAIXA, flexDirection: 'column', alignItems: 'stretch', gap: 6, borderColor: '#6EE7B7', background: '#ECFDF5', color: '#065F46' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <CheckCircle2 size={15} />
            <b>Produto cadastrado</b>
            <span style={CHIP}>{c.empresa}</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 800 }}>{c.codigo}</span>
            {c.inativo && <span style={{ ...CHIP, background: '#FEE2E2', color: '#991B1B' }}>inativo</span>}
          </div>
          {c.descricao && <div style={{ fontWeight: 700, color: '#064E3B' }}>{c.descricao}</div>}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', fontSize: 12.5 }}>
            {c.tipo && <span><b>Tipo:</b> {c.tipo}</span>}
            {/* locação SEMPRE aparece: a maioria das peças ainda não tem prateleira/andar/caixa no cadastro */}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, ...(c.locacao ? {} : { color: '#B45309' }) }}>
              <MapPin size={12} /> <b>Locação:</b> {c.locacao || 'não cadastrada'}
            </span>
            {c.estoque != null && <span><b>Estoque:</b> {String(c.estoque).replace('.', ',')}</span>}
            {c.valor_unitario != null && <span><b>Valor:</b> {fmtPreco(c.valor_unitario)}</span>}
            {c.marca && <span><b>Marca:</b> {c.marca}</span>}
            {c.familia && <span><b>Família:</b> {c.familia}</span>}
          </div>
          {!compacto && c.outras.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {c.outras.map((o) => (
                <span key={o.nome} style={{ ...CHIP, background: '#D1FAE5', color: '#065F46', fontWeight: 600 }}><b>{o.nome}:</b>&nbsp;{o.valor}</span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

const CAIXA: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, padding: '9px 11px', borderRadius: 8, border: '1.5px solid', fontSize: 13, lineHeight: 1.4,
}
const CHIP: React.CSSProperties = { fontSize: 11, fontWeight: 800, padding: '1px 7px', borderRadius: 5, background: '#A7F3D0', color: '#065F46' }
