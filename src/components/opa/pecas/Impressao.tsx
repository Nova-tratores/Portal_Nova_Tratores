'use client'
// Impressão de etiquetas em lote aproveitando a folha: mostra a folha 3×10,
// já começa na próxima posição livre (lembrada neste navegador) e deixa
// escolher outra tocando na posição. Depois de imprimir, marca os itens como
// "etiqueta gerada" e guarda onde a folha parou. Medidas e calibração são as
// da tela de Etiquetas do módulo Peças.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Printer, SlidersHorizontal, Tag } from 'lucide-react'
import { marcarEtiqueta } from '@/lib/opa-pecas/db'
import {
  ajustesImpressao, folhasNecessarias, guardarProximaPosicao, imprimirEtiquetas, POR_FOLHA, posicaoDepois, proximaPosicao,
  type EtiquetaItem,
} from '@/lib/opa-pecas/etiqueta'
import {
  guardarAjusteTermica, guardarModo, imprimirTermica, lerAjusteTermica, lerModo, type AjusteTermica, type ModoEtiqueta,
} from '@/lib/opa-pecas/etiqueta-termica'
import { Aviso, botao, LARANJA } from './comum'
import AjustesTermica from './AjustesTermica'
import { Janela } from './Moldura'

export interface ItemParaEtiqueta extends EtiquetaItem {
  id: string
  /** já teve etiqueta gerada: vai sair de novo */
  jaGerada?: boolean
}

export default function Impressao({ itens, onFechar, onImpresso }: {
  itens: ItemParaEtiqueta[]
  onFechar: () => void
  onImpresso?: () => void
}) {
  const [inicio, setInicio] = useState(proximaPosicao)
  const [erro, setErro] = useState<string | null>(null)
  const [aj] = useState(ajustesImpressao)
  // térmica de rolo (padrão, 70 × 30 mm) × folha 3×10 — escolha lembrada neste navegador
  const [modo, setModo] = useState<ModoEtiqueta>(lerModo)
  const [term, setTerm] = useState<AjusteTermica>(lerAjusteTermica)
  // predefinições salvas a CADA mudança (José, 15/10/2026) — não só ao imprimir
  useEffect(() => { guardarAjusteTermica(term) }, [term])
  useEffect(() => { guardarModo(modo) }, [modo])
  const repetidas = itens.filter((i) => i.jaGerada).length
  const n = itens.length
  const folhas = folhasNecessarias(inicio, n)
  const naPrimeira = Math.min(n, POR_FOLHA - inicio)

  const imprimir = () => {
    // sem a chave pública o QR sairia quebrado (sql/pni-10 não aplicado)
    if (itens.some((i) => !i.token)) {
      setErro('O link público das etiquetas ainda não existe no banco. Rode o sql/pni-10-link-publico.sql no Supabase e recarregue a página.')
      return
    }
    if (modo === 'termica') {
      guardarAjusteTermica(term)
      if (!imprimirTermica(itens, term)) {
        setErro('Não consegui preparar a etiqueta para imprimir. Recarregue a página e tente de novo.')
        return
      }
    } else {
      if (!imprimirEtiquetas(itens, inicio)) {
        setErro('O navegador bloqueou a janela de impressão. Libere pop-ups para o portal e tente de novo.')
        return
      }
      guardarProximaPosicao(posicaoDepois(inicio, n))
    }
    guardarModo(modo)
    marcarEtiqueta(itens.map((i) => i.id)).then(() => onImpresso?.()).catch(() => null)
    onFechar()
  }

  return (
    <Janela titulo={`Imprimir ${n} etiqueta${n === 1 ? '' : 's'}`} onFechar={onFechar} largura={520}>
      {erro && <Aviso>{erro}</Aviso>}
      {repetidas > 0 && (
        <Aviso tipo="info">{repetidas === n ? 'Estas etiquetas já foram geradas' : `${repetidas} destas etiquetas já foram geradas`} — vão sair de novo.</Aviso>
      )}
      <div role="tablist" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 14 }}>
        {([['termica', 'Impressora térmica (rolo)'], ['folha', 'Folha A4/Carta (30 por folha)']] as const).map(([m, rot]) => (
          <button key={m} type="button" role="tab" aria-selected={modo === m} onClick={() => setModo(m)} style={{
            padding: '10px 8px', borderRadius: 10, fontSize: 13, fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer',
            border: '1.5px solid ' + (modo === m ? '#111827' : 'var(--portal-border)'),
            background: modo === m ? '#111827' : 'var(--portal-bg-card)', color: modo === m ? '#fff' : 'var(--portal-text)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>{m === 'termica' ? <Tag size={14} /> : <Printer size={14} />} {rot}</button>
        ))}
      </div>

      {modo === 'termica' && <AjustesTermica term={term} setTerm={setTerm} n={n} exemplo={{ codigo: itens[0]?.codigo || 'PNI-000000', descricao: itens[0]?.descricao || 'Descrição da peça' }} />}

      {modo === 'folha' && <>
      <p style={{ fontSize: 13.5, color: 'var(--portal-text-secondary)', margin: '0 0 12px', lineHeight: 1.5 }}>
        Toque na primeira posição <b>livre</b> da folha. As anteriores saem em branco, para reaproveitar folha já começada.
      </p>
      <div role="grid" aria-label="Folha de etiquetas 3 por 10" style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, padding: 8, borderRadius: 10,
        background: 'var(--portal-bg-secondary)', border: '1px solid var(--portal-border)', maxWidth: 360, margin: '0 auto',
      }}>
        {Array.from({ length: POR_FOLHA }, (_, p) => {
          const usada = p < inicio
          const vai = p >= inicio && p < inicio + naPrimeira
          return (
            <button key={p} type="button" onClick={() => setInicio(p)} title={`Posição ${p + 1}`} style={{
              height: 26, borderRadius: 4, cursor: 'pointer', fontSize: 10.5, fontWeight: 700, fontFamily: 'inherit',
              border: `1px solid ${vai ? LARANJA : 'var(--portal-border)'}`,
              background: usada ? 'repeating-linear-gradient(45deg, #e5e7eb 0 4px, #f3f4f6 4px 8px)' : vai ? LARANJA : 'var(--portal-bg-card)',
              color: vai ? '#fff' : 'var(--portal-text-muted)',
            }}>{p + 1}</button>
          )
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 14, fontSize: 12, color: 'var(--portal-text-muted)', margin: '8px 0 14px' }}>
        <Legenda fundo="repeating-linear-gradient(45deg, #e5e7eb 0 3px, #f3f4f6 3px 6px)">já usada</Legenda>
        <Legenda fundo={LARANJA}>vai imprimir</Legenda>
        <Legenda fundo="var(--portal-bg-card)">livre</Legenda>
      </div>
      <div style={{ fontSize: 14, color: 'var(--portal-text)', textAlign: 'center', marginBottom: 14 }}>
        Começa na posição <b>{inicio + 1}</b> · {folhas} folha{folhas === 1 ? '' : 's'}
        {inicio > 0 && <button type="button" onClick={() => setInicio(0)} style={{ marginLeft: 10, background: 'none', border: 'none', color: LARANJA, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}>usar folha nova</button>}
      </div>
      <div style={{ fontSize: 12, color: 'var(--portal-text-muted)', lineHeight: 1.5, padding: '8px 10px', borderRadius: 8, background: 'var(--portal-bg-secondary)', marginBottom: 12 }}>
        Folha Pimaco 6180 (66,7 × 25,4 mm) · papel da impressora: <b>{aj.papel === 'a4' ? 'A4' : 'Carta'}</b>
        {(aj.x !== 0 || aj.y !== 0) && <> · ajuste {aj.x} / {aj.y} mm</>}{aj.recorte && <> · papel comum com corte</>}.
        {' '}No diálogo de impressão: margens <b>Nenhuma</b> e escala <b>100%</b>.{' '}
        <Link href="/ppv?tab=etiquetas" target="_blank" style={{ color: LARANJA, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
          <SlidersHorizontal size={12} /> Ajustar na tela de Etiquetas
        </Link>
      </div>
      </>}
      <button type="button" onClick={imprimir} disabled={n === 0} style={{ ...botao('#111827', { grande: true, desab: n === 0 }), width: '100%' }}>
        <Printer size={18} /> Imprimir
      </button>
    </Janela>
  )
}

function Legenda({ fundo, children }: { fundo: string; children: React.ReactNode }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span style={{ width: 12, height: 9, borderRadius: 2, background: fundo, border: '1px solid var(--portal-border)' }} />
      {children}
    </span>
  )
}
