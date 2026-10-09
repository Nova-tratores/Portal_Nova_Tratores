'use client'
// Tela das etapas depois da captação (fluxo novo, sql/pni-11):
//   verificação → separação (última decisão) → concluídas
// Lista da etapa à esquerda e a peça escolhida ao lado (no celular, em tela
// cheia). Em verificação/separação, a mais antiga primeiro e, ao concluir, a
// próxima da fila já fica aberta. Em Concluídas, a mais recente primeiro e a
// ficha completa (código, QR, etiqueta); dá pra marcar várias e imprimir as
// etiquetas juntas na mesma folha A4 (economia de papel). Não existe
// "etiqueta pendente": imprime quem quiser, quando quiser.

import { useCallback, useEffect, useState } from 'react'
import { CheckSquare, Clock, Inbox, Loader2, MapPin, Printer, RotateCcw, Square } from 'lucide-react'
import { listarItens } from '@/lib/opa-pecas/db'
import { mensagemErro } from '@/lib/opa-pecas/fotos'
import { codigoDefinitivo, fmtDataHora, nomeDoItem, ordenarFila, textoLocal } from '@/lib/opa-pecas/regras'
import type { Item, Status } from '@/lib/opa-pecas/tipos'
import { Aviso, botao, CodigoPeca, SeloEtiqueta, SeloStatus, LARANJA, Miniatura, SECAO, useMiniaturas, useTelaLarga, type Base } from './comum'
import { Janela } from './Moldura'
import Impressao, { type ItemParaEtiqueta } from './Impressao'
import PainelEtapa, { ChipDecisao } from './PainelEtapa'
import DetalheItem from './DetalheItem'

export type EtapaLista = 'verificacao' | 'separacao' | 'concluida'

const STATUS_DA_ETAPA: Record<EtapaLista, Status[]> = {
  verificacao: ['aguardando_identificacao'],
  separacao: ['identificado', 'precificado'],
  concluida: ['a_venda', 'vendido', 'guardado', 'usado', 'descartado', 'outro_destino'],
}

const VAZIO: Record<EtapaLista, string> = {
  verificacao: 'Nenhuma peça esperando verificação.',
  separacao: 'Nenhuma peça esperando separação.',
  concluida: 'Nenhuma peça concluída ainda.',
}

const TITULO: Record<EtapaLista, string> = {
  verificacao: 'Verificação', separacao: 'Separação', concluida: 'Concluídas',
}

/** Concluídas: a mais recente primeiro. */
const recentes = (l: Item[]) => [...l].sort((a, b) => String(b.encerrado_em || b.atualizado_em).localeCompare(String(a.encerrado_em || a.atualizado_em)))

export default function Etapa({ etapa, base }: { etapa: EtapaLista; base: Base }) {
  const larga = useTelaLarga()
  const [itens, setItens] = useState<Item[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [abertoId, setAbertoId] = useState<string | null>(null)
  const [imprimindo, setImprimindo] = useState<ItemParaEtiqueta[] | null>(null)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const concluidas = etapa === 'concluida'

  const carregar = useCallback(async (manterId?: string | null) => {
    try {
      const brutos = await listarItens({ status: STATUS_DA_ETAPA[etapa] })
      const lista = etapa === 'concluida' ? recentes(brutos) : ordenarFila(brutos)
      setItens(lista)
      setErro(null)
      // mantém a peça aberta se ainda estiver na etapa; senão, abre a próxima (no PC)
      setAbertoId((atual) => {
        const alvo = manterId !== undefined ? manterId : atual
        if (alvo && lista.some((i) => i.id === alvo)) return alvo
        return null
      })
    } catch (e) {
      setErro(mensagemErro(e))
    }
  }, [etapa])

  useEffect(() => {
    // ?item=<id> abre a peça direto (link do detalhe)
    const pedido = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('item') : null
    Promise.resolve().then(() => carregar(pedido))
  }, [carregar])

  const lista = itens || []
  const aberto = lista.find((i) => i.id === abertoId) || (larga ? lista[0] : undefined) || null
  const minis = useMiniaturas(lista.map((i) => i.fotos[0]?.storage_path).filter(Boolean) as string[])

  const concluido = () => { setAbertoId(null); carregar(null) }

  const paraEtiqueta = (l: Item[]): ItemParaEtiqueta[] =>
    l.map((i) => ({ id: i.id, jaGerada: !!i.etiqueta_impressa_em, token: i.token_publico, codigo: i.codigo, descricao: i.descricao, quantidade: i.quantidade, local: textoLocal(i, base.nomesLocais) }))
  const comCodigo = lista.filter((i) => codigoDefinitivo(i.codigo))
  const marcadas = comCodigo.filter((i) => sel.has(i.id))
  const alternar = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  // Concluídas: marca as peças e imprime as etiquetas juntas (folha A4, 30 por folha)
  const barraEtiquetas = concluidas && comCodigo.length > 0 && (
    <div style={{ ...SECAO, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
      <Printer size={18} style={{ color: 'var(--portal-text-muted)' }} />
      <span style={{ fontSize: 13.5, color: 'var(--portal-text)', flex: 1, minWidth: 200 }}>
        <b>Etiquetas</b> — marque as peças e imprima juntas na mesma folha A4 (30 por folha)
      </span>
      <button type="button" onClick={() => setSel(marcadas.length === comCodigo.length ? new Set() : new Set(comCodigo.map((i) => i.id)))}
        style={botao('#52525B', { contorno: true })}>
        {marcadas.length === comCodigo.length ? <Square size={15} /> : <CheckSquare size={15} />} {marcadas.length === comCodigo.length ? 'Desmarcar todas' : 'Marcar todas'}
      </button>
      <button type="button" disabled={!marcadas.length} onClick={() => setImprimindo(paraEtiqueta(marcadas))} style={botao('#111827', { desab: !marcadas.length })}>
        <Printer size={15} /> Imprimir {marcadas.length || ''} etiqueta{marcadas.length === 1 ? '' : 's'}
      </button>
    </div>
  )
  const janelaImpressao = imprimindo && <Impressao itens={imprimindo} onFechar={() => setImprimindo(null)} onImpresso={() => { setSel(new Set()); carregar() }} />

  const listaEl = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {lista.map((i) => {
        const ativo = aberto?.id === i.id
        const marcavel = concluidas && codigoDefinitivo(i.codigo)
        return (
          <div key={i.id} style={{ display: 'flex', alignItems: 'stretch', gap: 6 }}>
            {marcavel && (
              <button type="button" onClick={() => alternar(i.id)} aria-label={sel.has(i.id) ? 'Desmarcar' : 'Marcar para imprimir'} aria-pressed={sel.has(i.id)}
                style={{ width: 34, flexShrink: 0, borderRadius: 10, border: '1.5px solid ' + (sel.has(i.id) ? '#111827' : 'var(--portal-border)'), background: sel.has(i.id) ? '#111827' : 'var(--portal-bg-card)', color: sel.has(i.id) ? '#fff' : 'var(--portal-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {sel.has(i.id) ? <CheckSquare size={16} /> : <Square size={16} />}
              </button>
            )}
            <button type="button" onClick={() => setAbertoId(i.id)} aria-current={ativo ? 'true' : undefined} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: 8, borderRadius: 10, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', flex: 1, minWidth: 0,
              background: ativo ? '#FFF7ED' : 'var(--portal-bg-card)', border: '1.5px solid ' + (ativo ? LARANJA : 'var(--portal-border)'),
            }}>
              <Miniatura url={i.fotos[0] ? minis[i.fotos[0].storage_path] : undefined} tamanho={56} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <CodigoPeca codigo={i.codigo} />
                  {concluidas ? <SeloStatus status={i.status} /> : i.decisao && etapa !== 'verificacao' && <ChipDecisao decisao={i.decisao} />}
                  {concluidas && <SeloEtiqueta em={i.etiqueta_impressa_em} />}
                </div>
                <div style={{ fontSize: 12.5, color: i.descricao ? 'var(--portal-text-secondary)' : 'var(--portal-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
                  {i.descricao || 'Sem descrição'} · {i.quantidade} {i.quantidade === 1 ? 'peça' : 'peças'}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--portal-text-muted)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2, flexWrap: 'wrap' }}>
                  <Clock size={11} /> {fmtDataHora(concluidas ? (i.encerrado_em || i.atualizado_em) : i.criado_em)}
                  {i.local_id && <><span>·</span><MapPin size={11} /> {textoLocal(i, base.nomesLocais)}</>}
                </div>
              </div>
            </button>
          </div>
        )
      })}
    </div>
  )

  if (erro) return <Aviso acao={<button type="button" onClick={() => carregar()} style={botao('#DC2626')}><RotateCcw size={14} /> Tentar de novo</button>}>{erro}</Aviso>
  if (!itens) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--portal-text-muted)' }}><Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} /></div>
  if (lista.length === 0) {
    return (
      <div style={{ ...SECAO, alignItems: 'center', padding: 40, color: 'var(--portal-text-muted)', fontWeight: 600 }}>
        <Inbox size={28} /> {VAZIO[etapa]}
      </div>
    )
  }

  const painel = (i: Item) => concluidas
    ? <DetalheItem key={i.id} item={i} base={base} onMudou={() => carregar()} />
    : <PainelEtapa key={i.id + etapa} etapa={etapa} item={i} base={base} onConcluido={concluido} onAtualizado={() => carregar()} />

  if (larga) {
    return (
      <>
      {barraEtiquetas}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 360px) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
        <div style={{ position: 'sticky', top: 12, maxHeight: 'calc(100vh - 140px)', overflowY: 'auto', paddingRight: 2 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--portal-text-muted)', letterSpacing: 0.6, textTransform: 'uppercase', margin: '2px 0 8px' }}>
            {lista.length} {concluidas ? 'concluída' + (lista.length === 1 ? '' : 's') + ' · mais recentes primeiro' : `na ${TITULO[etapa].toLowerCase()} · mais antigas primeiro`}
          </div>
          {listaEl}
        </div>
        {aberto && painel(aberto)}
      </div>
      {janelaImpressao}
      </>
    )
  }

  return (
    <>
      {barraEtiquetas}
      {listaEl}
      {aberto && (
        <Janela titulo={`${TITULO[etapa]} · ${nomeDoItem(aberto.codigo)}`} onFechar={() => setAbertoId(null)}>
          {painel(aberto)}
        </Janela>
      )}
      {janelaImpressao}
    </>
  )
}
