'use client'
// Tela das etapas 2–4 (separação, verificação, destino): lista das peças da
// etapa, da mais antiga para a mais nova. No PC a peça escolhida abre ao lado
// da lista; no celular abre em tela cheia. Ao concluir, a próxima da fila já
// fica aberta.

import { useCallback, useEffect, useState } from 'react'
import { Clock, Inbox, Loader2, MapPin, Printer, RotateCcw } from 'lucide-react'
import { listarItens } from '@/lib/opa-pecas/db'
import { mensagemErro } from '@/lib/opa-pecas/fotos'
import { fmtDataHora, nomeDoItem, ordenarFila, textoLocal } from '@/lib/opa-pecas/regras'
import type { Item, Status } from '@/lib/opa-pecas/tipos'
import { Aviso, botao, CodigoPeca, SeloEtiqueta, LARANJA, Miniatura, SECAO, useMiniaturas, useTelaLarga, type Base } from './comum'
import { Janela } from './Moldura'
import Impressao, { type ItemParaEtiqueta } from './Impressao'
import PainelEtapa, { ChipDecisao, type EtapaTrabalho } from './PainelEtapa'

const STATUS_DA_ETAPA: Record<EtapaTrabalho, Status[]> = {
  separacao: ['aguardando_identificacao'],
  verificacao: ['identificado'],
  destino: ['precificado', 'a_venda'],
}

const VAZIO: Record<EtapaTrabalho, string> = {
  separacao: 'Nenhuma peça esperando separação.',
  verificacao: 'Nenhuma peça esperando verificação.',
  destino: 'Nenhuma peça esperando destino.',
}

const TITULO: Record<EtapaTrabalho, string> = {
  separacao: 'Separação', verificacao: 'Verificação', destino: 'Destino',
}

export default function Etapa({ etapa, base }: { etapa: EtapaTrabalho; base: Base }) {
  const larga = useTelaLarga()
  const [itens, setItens] = useState<Item[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [abertoId, setAbertoId] = useState<string | null>(null)
  const [imprimindo, setImprimindo] = useState<ItemParaEtiqueta[] | null>(null)

  const carregar = useCallback(async (manterId?: string | null) => {
    try {
      const lista = ordenarFila(await listarItens({ status: STATUS_DA_ETAPA[etapa] }))
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
  const semEtiqueta = lista.filter((i) => !i.etiqueta_impressa_em)
  const geradas = lista.filter((i) => i.etiqueta_impressa_em)

  // Destino: as etiquetas saem aqui, todas juntas na mesma folha
  const barraEtiquetas = etapa === 'destino' && (
    <div style={{ ...SECAO, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
      <Printer size={18} style={{ color: 'var(--portal-text-muted)' }} />
      <span style={{ fontSize: 13.5, color: 'var(--portal-text)', flex: 1, minWidth: 200 }}>
        <b>Etiquetas</b> — {semEtiqueta.length ? `${semEtiqueta.length} pendente${semEtiqueta.length > 1 ? 's' : ''}` : 'todas geradas'}{geradas.length > 0 && semEtiqueta.length > 0 && ` · ${geradas.length} já gerada${geradas.length > 1 ? 's' : ''}`}
      </span>
      {semEtiqueta.length > 0 && (
        <button type="button" onClick={() => setImprimindo(paraEtiqueta(semEtiqueta))} style={botao('#111827')}>
          <Printer size={15} /> Gerar {semEtiqueta.length} etiqueta{semEtiqueta.length > 1 ? 's' : ''}
        </button>
      )}
      {geradas.length > 0 && (
        <button type="button" onClick={() => { if (confirm(`Reimprimir ${geradas.length} etiqueta${geradas.length > 1 ? 's' : ''} que já foram geradas?`)) setImprimindo(paraEtiqueta(geradas)) }}
          style={botao('#52525B', { contorno: true })}>Reimprimir geradas ({geradas.length})</button>
      )}
    </div>
  )
  const janelaImpressao = imprimindo && <Impressao itens={imprimindo} onFechar={() => setImprimindo(null)} onImpresso={() => carregar()} />

  const listaEl = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {lista.map((i) => {
        const ativo = aberto?.id === i.id
        return (
          <button key={i.id} type="button" onClick={() => setAbertoId(i.id)} aria-current={ativo ? 'true' : undefined} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: 8, borderRadius: 10, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', width: '100%',
            background: ativo ? '#FFF7ED' : 'var(--portal-bg-card)', border: '1.5px solid ' + (ativo ? LARANJA : 'var(--portal-border)'),
          }}>
            <Miniatura url={i.fotos[0] ? minis[i.fotos[0].storage_path] : undefined} tamanho={56} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <CodigoPeca codigo={i.codigo} />
                {i.decisao && etapa !== 'separacao' && <ChipDecisao decisao={i.decisao} />}
                {etapa === 'destino' && <SeloEtiqueta em={i.etiqueta_impressa_em} />}
              </div>
              <div style={{ fontSize: 12.5, color: i.descricao ? 'var(--portal-text-secondary)' : 'var(--portal-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
                {i.descricao || 'Sem descrição'} · {i.quantidade} {i.quantidade === 1 ? 'peça' : 'peças'}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--portal-text-muted)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2, flexWrap: 'wrap' }}>
                <Clock size={11} /> {fmtDataHora(i.criado_em)}
                {i.local_id && <><span>·</span><MapPin size={11} /> {textoLocal(i, base.nomesLocais)}</>}
              </div>
            </div>
          </button>
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

  if (larga) {
    return (
      <>
      {barraEtiquetas}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 360px) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
        <div style={{ position: 'sticky', top: 12, maxHeight: 'calc(100vh - 140px)', overflowY: 'auto', paddingRight: 2 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--portal-text-muted)', letterSpacing: 0.6, textTransform: 'uppercase', margin: '2px 0 8px' }}>
            {lista.length} na {TITULO[etapa].toLowerCase()} · mais antigas primeiro
          </div>
          {listaEl}
        </div>
        {aberto && <PainelEtapa key={aberto.id + etapa} etapa={etapa} item={aberto} base={base} onConcluido={concluido} />}
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
          <PainelEtapa key={aberto.id + etapa} etapa={etapa} item={aberto} base={base} onConcluido={concluido} />
        </Janela>
      )}
      {janelaImpressao}
    </>
  )
}
