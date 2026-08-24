'use client'
// Uma caixa de busca só, no lugar das duas de hoje.
//
// A tela antiga tinha "Buscar despesa" (filtro local) ao lado de "Rastrear
// documento" (que navega pra outra tela). Duas caixas lado a lado obrigam a
// pessoa a escolher a certa antes de digitar — e escolher errado não dá erro,
// dá silêncio.
//
// Agora o campo classifica sozinho o que foi digitado, com a MESMA engine do
// rastreio (normalizarTermo). Texto e número filtram a lista na hora; chave de
// NF-e, linha digitável de boleto ou "#123" fazem aparecer a faixa que leva à
// ficha completa do documento.

import { useMemo } from 'react'
import Link from 'next/link'
import { ArrowRight, ScanSearch, Search, X } from 'lucide-react'
import { normalizarTermo } from '@/lib/financeiro/rastreio/normalizar'

const DESCRICAO: Record<string, string> = {
  chave_nfe: 'Isto é uma chave de NF-e',
  linha_digitavel: 'Isto é a linha digitável de um boleto',
  requisicao_id: 'Isto é o número de uma requisição',
}

export default function BuscaInteligente({ valor, onChange, achados }: {
  valor: string
  onChange: (v: string) => void
  /** quantas despesas o texto encontrou na tela (feedback imediato) */
  achados: number
}) {
  const termo = useMemo(() => (valor.trim().length >= 2 ? normalizarTermo(valor) : null), [valor])
  const ehDocumento = !!termo && DESCRICAO[termo.tipo] !== undefined

  return (
    <div style={{ flex: '1 1 380px', minWidth: 0 }}>
      <div style={{ position: 'relative' }}>
        <Search size={17} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--portal-text-muted)' }} />
        <input
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Buscar por fornecedor, nota, valor, #123, chave ou boleto…"
          style={{
            width: '100%', padding: '11px 36px 11px 38px', borderRadius: 12, fontSize: 13.5,
            border: '1px solid var(--portal-border)', background: 'var(--portal-bg-input)',
            color: 'var(--portal-text)', outline: 'none',
          }}
        />
        {valor && (
          <button
            onClick={() => onChange('')}
            title="Limpar"
            style={{
              position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
              border: 'none', background: 'none', cursor: 'pointer', color: 'var(--portal-text-muted)',
              padding: 4, display: 'flex',
            }}
          >
            <X size={15} />
          </button>
        )}
      </div>

      {ehDocumento && (
        <Link
          href={`/financeiro/rastreio?q=${encodeURIComponent(valor.trim())}`}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, padding: '8px 12px',
            borderRadius: 10, textDecoration: 'none', fontSize: 12.5,
            color: '#1d4ed8', background: 'rgba(37,99,235,.07)', border: '1px solid #bfdbfe',
          }}
        >
          <ScanSearch size={15} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1, minWidth: 0 }}>
            {DESCRICAO[termo!.tipo]} — ver a ficha completa do documento
          </span>
          <ArrowRight size={15} style={{ flexShrink: 0 }} />
        </Link>
      )}

      {valor.trim().length >= 2 && !ehDocumento && (
        <div style={{ fontSize: 11.5, color: 'var(--portal-text-muted)', marginTop: 5, paddingLeft: 2 }}>
          {achados === 0
            ? 'Nenhuma despesa com esse termo no período.'
            : `${achados} despesa${achados === 1 ? '' : 's'} no período.`}
        </div>
      )}
    </div>
  )
}
