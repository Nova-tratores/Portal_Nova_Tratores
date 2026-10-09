'use client'
// Atalho do menu Etapas: imprimir as etiquetas de todas as peças concluídas
// (com código definitivo) de uma vez, na mesma folha A4. Para escolher quais,
// a tela Concluídas deixa marcar peça por peça. Não existe "pendente".

import { useEffect, useState } from 'react'
import { Loader2, Printer } from 'lucide-react'
import { listarItens } from '@/lib/opa-pecas/db'
import { mensagemErro } from '@/lib/opa-pecas/fotos'
import { codigoDefinitivo, textoLocal } from '@/lib/opa-pecas/regras'
import type { Item } from '@/lib/opa-pecas/tipos'
import { Aviso, botao, useBase } from './comum'
import Impressao, { type ItemParaEtiqueta } from './Impressao'
import { Janela } from './Moldura'

/** Com `onFechar` é controlado de fora (ex.: item do menu "Etapas") e não desenha o botão. */
export default function ImprimirTodas({ aberto: abertoFora, onFechar }: { aberto?: boolean; onFechar?: () => void } = {}) {
  const [aberto, setAberto] = useState(false)
  if (onFechar) return abertoFora ? <Escolha onFechar={onFechar} /> : null
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

  const todas = itens || []
  const carregando = !itens || base.carregando

  return (
    <Janela titulo="Imprimir etiquetas" onFechar={onFechar} largura={460}>
      {erro && <Aviso>{erro}</Aviso>}
      {!erro && carregando && <div style={{ padding: 24, textAlign: 'center', color: 'var(--portal-text-muted)' }}><Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} /></div>}
      {!erro && !carregando && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ fontSize: 13.5, color: 'var(--portal-text-secondary)', margin: 0, lineHeight: 1.5 }}>
            Etiqueta existe para peça concluída (com código): <b>{todas.length}</b> peça{todas.length === 1 ? '' : 's'}. Elas saem juntas na folha A4 (30 por folha).
            Para escolher quais, use <b>Concluídas</b> e marque as peças.
          </p>
          <button type="button" onClick={() => setImprimindo(para(todas))} disabled={!todas.length}
            style={{ ...botao('#111827', { grande: true, desab: !todas.length }), width: '100%' }}>
            <Printer size={18} /> Imprimir as {todas.length} etiqueta{todas.length === 1 ? '' : 's'}
          </button>
        </div>
      )}
    </Janela>
  )
}
