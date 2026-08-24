'use client'
// Classificar uma despesa sem sair da tela.
//
// Grava `finan_pagar.omie_categoria` direto pelo client, que é o padrão que o
// resto do módulo já usa (OmieContaPagar.js:434-447). É seguro para o conjunto
// que importa: as despesas sem categoria são exatamente as que nunca foram ao
// Omie, então não há nada lá para divergir.
//
// A interface DIZ isso — "corrige o relatório do portal, não o Omie" — porque
// alguém ia supor que classificar aqui sincroniza, e supor errado sobre
// contabilidade é caro.

import { useMemo, useRef, useState } from 'react'
import { Check, Loader2, Search, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'

export interface OpcaoCategoria { codigo: string; descricao: string; empresa: string | null }

export default function SeletorCategoria({ despesaId, empresa, opcoes, codigoAtual, jaNoOmie, onFechar, onGravado }: {
  despesaId: number
  empresa: string | null
  opcoes: OpcaoCategoria[]
  /** categoria já gravada — some da lista e vira o item marcado */
  codigoAtual?: string | null
  /** despesa já lançada no Omie: trocar aqui faz o portal DIVERGIR de lá */
  jaNoOmie?: boolean
  onFechar: () => void
  onGravado: (codigo: string) => void
}) {
  const [busca, setBusca] = useState('')
  const [salvando, setSalvando] = useState<string | null>(null)
  const [erro, setErro] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const lista = useMemo(() => {
    const alvo = String(empresa || '').trim().toUpperCase()
    // categorias da empresa da despesa; sem empresa definida, mostra todas
    const daEmpresa = alvo
      ? opcoes.filter((o) => String(o.empresa || '').trim().toUpperCase() === alvo)
      : opcoes
    const base = daEmpresa.length > 0 ? daEmpresa : opcoes
    const q = busca.trim().toLowerCase()
    const filtrada = q
      ? base.filter((o) => `${o.codigo} ${o.descricao}`.toLowerCase().includes(q))
      : base
    // a atual primeiro: quem veio alterar precisa ver de onde está saindo
    const ordenada = [...filtrada].sort((a, b) =>
      (b.codigo === codigoAtual ? 1 : 0) - (a.codigo === codigoAtual ? 1 : 0))
    return ordenada.slice(0, 60)
  }, [opcoes, empresa, busca, codigoAtual])

  const gravar = async (codigo: string) => {
    setSalvando(codigo)
    setErro('')
    const { error } = await supabase.from('finan_pagar').update({ omie_categoria: codigo }).eq('id', despesaId)
    setSalvando(null)
    if (error) { setErro(error.message); return }
    onGravado(codigo)
  }

  return (
    <div
      onClick={onFechar}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,23,42,.45)',
        display: 'grid', placeItems: 'center', padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(460px, 100%)', maxHeight: '80vh', display: 'flex', flexDirection: 'column',
          background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)',
          borderRadius: 16, overflow: 'hidden', boxShadow: '0 20px 50px rgba(0,0,0,.25)',
        }}
      >
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--portal-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <strong style={{ fontSize: 14, color: 'var(--portal-text)' }}>
              {codigoAtual ? 'Alterar categoria' : 'Classificar'} da despesa #{despesaId}
            </strong>
            <button onClick={onFechar} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--portal-text-muted)', padding: 4 }}>
              <X size={18} />
            </button>
          </div>
          {/* O aviso muda de peso conforme o risco: numa despesa que nunca foi
              ao Omie isto é só metadado do portal; numa que JÁ FOI, o portal
              passa a discordar do Omie e alguém vai comparar os dois relatórios
              um dia. Dizer isso antes é mais barato que explicar depois. */}
          <p style={{
            fontSize: 11.5, margin: '8px 0 0', lineHeight: 1.5, padding: jaNoOmie ? '8px 10px' : 0,
            borderRadius: 8,
            color: jaNoOmie ? '#b45309' : 'var(--portal-text-secondary)',
            background: jaNoOmie ? 'rgba(217,119,6,.09)' : 'transparent',
            border: jaNoOmie ? '1px solid rgba(217,119,6,.28)' : 'none',
          }}>
            {jaNoOmie ? (
              <>
                <strong>Esta despesa já está lançada no Omie.</strong> Mudar aqui altera só o relatório do
                portal — o Omie continua com a categoria antiga, e os dois passam a divergir.
              </>
            ) : (
              <>Corrige a classificação <strong>no relatório do portal</strong>. Não envia nada para o Omie.</>
            )}
          </p>
          <div style={{ position: 'relative', marginTop: 10 }}>
            <Search size={16} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--portal-text-muted)' }} />
            <input
              ref={inputRef}
              autoFocus
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar categoria…"
              style={{
                width: '100%', padding: '9px 12px 9px 34px', borderRadius: 10, fontSize: 13,
                border: '1px solid var(--portal-border)', background: 'var(--portal-bg-input)',
                color: 'var(--portal-text)', outline: 'none',
              }}
            />
          </div>
        </div>

        <div style={{ overflowY: 'auto', padding: 8 }}>
          {lista.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: 'var(--portal-text-muted)' }}>
              Nenhuma categoria encontrada.
            </div>
          )}
          {lista.map((o) => (
            <button
              key={`${o.empresa}-${o.codigo}`}
              onClick={() => gravar(o.codigo)}
              disabled={!!salvando}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                padding: '9px 10px', borderRadius: 9, border: 'none', background: 'none',
                cursor: salvando ? 'default' : 'pointer', font: 'inherit', color: 'var(--portal-text)',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--portal-bg-hover)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
            >
              {salvando === o.codigo
                ? <Loader2 size={14} className="girando" style={{ color: 'var(--portal-text-muted)' }} />
                : <Check size={14} style={{ color: o.codigo === codigoAtual ? '#15803d' : 'transparent' }} />}
              <span style={{
                flex: 1, minWidth: 0, fontSize: 13,
                fontWeight: o.codigo === codigoAtual ? 700 : 400,
              }}>
                {o.descricao}
              </span>
              <span style={{ fontSize: 11, color: 'var(--portal-text-muted)', fontVariantNumeric: 'tabular-nums' }}>{o.codigo}</span>
            </button>
          ))}
        </div>

        {erro && (
          <div style={{ padding: '10px 16px', fontSize: 12, color: '#b91c1c', background: 'rgba(220,38,38,.08)' }}>
            Não deu para salvar: {erro}
          </div>
        )}
      </div>
    </div>
  )
}
