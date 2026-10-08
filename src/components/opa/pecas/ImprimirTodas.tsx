'use client'
// Atalho da barra de etapas: imprimir as etiquetas de TODAS as peças de uma
// vez (só as que já têm código definitivo — do Destino em diante). Escolhe
// entre só as pendentes ou todas, e cai na mesma janela de impressão em lote.

import { useEffect, useState } from 'react'
import { Loader2, Printer } from 'lucide-react'
import { listarItens } from '@/lib/opa-pecas/db'
import { mensagemErro } from '@/lib/opa-pecas/fotos'
import { codigoDefinitivo, textoLocal } from '@/lib/opa-pecas/regras'
import type { Item } from '@/lib/opa-pecas/tipos'
import { Aviso, botao, useBase } from './comum'
import Impressao, { type ItemParaEtiqueta } from './Impressao'
import { Janela } from './Moldura'

export default function ImprimirTodas() {
  const [aberto, setAberto] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setAberto(true)} title="Imprimir as etiquetas de todas as peças de uma vez" style={{
        flexShrink: 0, display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
        border: '1.5px solid #111827', background: 'var(--portal-bg-card)', color: 'var(--portal-text)', fontSize: 13.5, fontWeight: 800,
      }}><Printer size={16} /> Etiquetas</button>
      {aberto && <Escolha onFechar={() => setAberto(false)} />}
    </>
  )
}

function Escolha({ onFechar }: { onFechar: () => void }) {
  const base = useBase()
  const [itens, setItens] = useState<Item[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [imprimindo, setImprimindo] = useState<ItemParaEtiqueta[] | null>(null)

  useEffect(() => {
    let vivo = true
    listarItens()
      .then((l) => { if (vivo) setItens(l.filter((i) => codigoDefinitivo(i.codigo))) })
      .catch((e) => { if (vivo) setErro(mensagemErro(e)) })
    return () => { vivo = false }
  }, [])

  const para = (l: Item[]): ItemParaEtiqueta[] =>
    l.map((i) => ({ id: i.id, jaGerada: !!i.etiqueta_impressa_em, token: i.token_publico, codigo: i.codigo, descricao: i.descricao, quantidade: i.quantidade, local: textoLocal(i, base.nomesLocais) }))

  if (imprimindo) return <Impressao itens={imprimindo} onFechar={onFechar} />

  const pendentes = (itens || []).filter((i) => !i.etiqueta_impressa_em)
  const todas = itens || []
  const carregando = !itens || base.carregando

  return (
    <Janela titulo="Imprimir etiquetas" onFechar={onFechar} largura={460}>
      {erro && <Aviso>{erro}</Aviso>}
      {!erro && carregando && <div style={{ padding: 24, textAlign: 'center', color: 'var(--portal-text-muted)' }}><Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} /></div>}
      {!erro && !carregando && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ fontSize: 13.5, color: 'var(--portal-text-secondary)', margin: 0, lineHeight: 1.5 }}>
            Etiqueta só existe para peça com código (do Destino em diante): <b>{todas.length}</b> peça{todas.length === 1 ? '' : 's'}.
          </p>
          <button type="button" onClick={() => setImprimindo(para(pendentes))} disabled={!pendentes.length}
            style={{ ...botao('#111827', { grande: true, desab: !pendentes.length }), width: '100%' }}>
            <Printer size={18} /> Só as pendentes ({pendentes.length})
          </button>
          <button type="button" onClick={() => { if (confirm(`Imprimir as ${todas.length} etiquetas, inclusive as que já foram geradas?`)) setImprimindo(para(todas)) }} disabled={!todas.length}
            style={{ ...botao('#52525B', { contorno: true, desab: !todas.length }), width: '100%', justifyContent: 'center' }}>
            Todas as peças ({todas.length})
          </button>
        </div>
      )}
    </Janela>
  )
}
