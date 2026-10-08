'use client'
// As 4 fases da peça (Captação → Separação → Verificação → Destino) em
// sequência. Cada fase mostra o que foi registrado nela e só "libera" quando
// a peça chega lá: concluída = verde, atual = laranja, futura = cinza.

import Link from 'next/link'
import { Archive, ArrowRight, Check, CircleHelp, Minus, Tag, Trash2, Wrench } from 'lucide-react'
import { codigoDefinitivo, ehFinal, etapaDoItem, fmtDataHora, fmtPreco, textoAplicacoes, textoLocal } from '@/lib/opa-pecas/regras'
import { INFO_DECISAO, ROTULO_QUALIDADE, ROTULO_STATUS, type Decisao, type Etapa, type Item } from '@/lib/opa-pecas/tipos'
import { botao, LARANJA, type Base } from './comum'

export const ICONE_DECISAO: Record<Decisao, React.ReactNode> = {
  vender: <Tag size={18} />, guardar: <Archive size={18} />, usar: <Wrench size={18} />,
  descartar: <Trash2 size={18} />, outro: <CircleHelp size={18} />,
}

export function ChipDecisao({ decisao }: { decisao: Decisao }) {
  const info = INFO_DECISAO[decisao]
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 800, color: info.cor }}>
      {ICONE_DECISAO[decisao]} {info.rotulo}
    </span>
  )
}

type Situacao = 'feita' | 'atual' | 'futura' | 'pulada'

const ORDEM: Etapa[] = ['captacao', 'separacao', 'verificacao', 'destino']
const TITULO: Record<Etapa, string> = { captacao: 'Captação', separacao: 'Separação', verificacao: 'Verificação', destino: 'Destino' }
const ESPERA: Record<Etapa, string> = {
  captacao: '',
  separacao: 'Libera quando alguém decidir o que fazer com a peça.',
  verificacao: 'Libera depois da separação: valor e aplicação conferidos com o setor.',
  destino: 'Libera depois da verificação: o que aconteceu de fato e onde a peça ficou.',
}

function situacoes(item: Item): Record<Etapa, Situacao> {
  const final = ehFinal(item.status)
  const atual = etapaDoItem(item)
  // descartar/outro encerram na separação: verificação não acontece
  const encerrouNaSeparacao = final && !item.verificado_em && !!item.decisao && INFO_DECISAO[item.decisao].encerra
  const s = {} as Record<Etapa, Situacao>
  ORDEM.forEach((e, i) => {
    if (e === 'captacao') { s[e] = 'feita'; return }
    if (final) { s[e] = e === 'verificacao' && encerrouNaSeparacao ? 'pulada' : 'feita'; return }
    const idxAtual = atual ? ORDEM.indexOf(atual) : 0
    s[e] = i < idxAtual ? 'feita' : i === idxAtual ? 'atual' : 'futura'
  })
  return s
}

/** `ate`: mostra só as fases antes desta (usado dentro do painel da etapa). */
export default function FasesPeca({ item, base, usuarios, ate, linkEtapa }: {
  item: Item
  base: Base
  usuarios: Record<string, string>
  ate?: Etapa
  linkEtapa?: boolean
}) {
  const sit = situacoes(item)
  const fases = ate ? ORDEM.slice(0, ORDEM.indexOf(ate)) : ORDEM
  const quem = (id: string | null, em: string | null) => (id || em) && (
    <div style={{ fontSize: 12, color: 'var(--portal-text-muted)', marginTop: 4 }}>
      {id ? usuarios[id] || '…' : ''}{id && em ? ', ' : ''}{fmtDataHora(em)}
    </div>
  )

  const conteudo = (e: Etapa) => {
    if (sit[e] === 'pulada') return <Vazio>Não se aplica — a peça foi encerrada na separação.</Vazio>
    if (sit[e] !== 'feita' && e !== 'captacao') return <Vazio>{ESPERA[e]}</Vazio>
    switch (e) {
      case 'captacao': return (
        <>
          <Dado r="Peças">{item.quantidade} · {ROTULO_QUALIDADE[item.qualidade]}{item.nao_identificavel && ' · não identificável'}</Dado>
          <Dado r="Fotos">{item.fotos.length}</Dado>
          {item.observacoes && <Dado r="Obs.">{item.observacoes}</Dado>}
          {quem(item.criado_por, item.criado_em)}
        </>
      )
      case 'separacao': return (
        <>
          {item.decisao ? <Dado r="Decisão"><ChipDecisao decisao={item.decisao} /></Dado> : <Dado r="Decisão">—</Dado>}
          {item.decisao_obs && <Dado r="Obs.">{item.decisao_obs}</Dado>}
          {quem(item.decidido_por, item.decidido_em)}
        </>
      )
      case 'verificacao': return (
        <>
          <Dado r="Com">{item.verificado_setor || '—'}{item.verificado_com && ` (${item.verificado_com})`}</Dado>
          {item.descricao && <Dado r="Descrição">{item.descricao}</Dado>}
          {item.codigo_fabricante && <Dado r="Cód. existente">{item.codigo_fabricante}</Dado>}
          <Dado r="Valor">{fmtPreco(item.preco_sugerido)}{item.preco_sugerido != null && item.quantidade > 1 && ` · total ${fmtPreco(item.preco_sugerido * item.quantidade)}`}</Dado>
          <Dado r="Aplicação">{textoAplicacoes(item, { tipos: base.nomesTipos, marcas: base.nomesMarcas }) || '—'}</Dado>
          {item.verificacao_obs && <Dado r="Obs.">{item.verificacao_obs}</Dado>}
          {quem(item.verificado_por, item.verificado_em)}
        </>
      )
      case 'destino': return (
        <>
          <Dado r="Resultado"><b>{ROTULO_STATUS[item.status]}</b></Dado>
          {(item.desfecho || item.motivo_descarte) && <Dado r="O que houve">{item.desfecho || item.motivo_descarte}</Dado>}
          <Dado r="Onde está">{textoLocal(item, base.nomesLocais) || '—'}</Dado>
          {codigoDefinitivo(item.codigo) && <Dado r="Etiqueta">{item.etiqueta_impressa_em ? `gerada em ${fmtDataHora(item.etiqueta_impressa_em)}` : 'pendente'}</Dado>}
          {quem(item.encerrado_por, item.encerrado_em)}
        </>
      )
    }
  }

  if (!fases.length) return null
  const corDe = (s: Situacao) => (s === 'feita' ? VERDE : s === 'atual' ? LARANJA : 'var(--portal-text-muted)')
  const rotuloDe = (s: Situacao) => (s === 'feita' ? 'Concluída' : s === 'atual' ? 'Agora' : s === 'pulada' ? 'Não se aplica' : 'Aguardando')
  // cartões: fases já liberadas (concluídas) + a atual; as futuras ficam só nos passos
  const comCartao = fases.filter((e) => sit[e] === 'feita' || sit[e] === 'atual')
  const proxima = fases.find((e) => sit[e] === 'futura')

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }} aria-label="Fases da peça">
      {/* Passos */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${fases.length}, minmax(0, 1fr))`, gap: 4 }}>
        {fases.map((e, i) => {
          const s = sit[e]
          const cor = corDe(s)
          return (
            <div key={e} style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
              <div style={{ height: 5, borderRadius: 3, background: s === 'feita' ? VERDE : s === 'atual' ? LARANJA : 'var(--portal-border)' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                <span style={{
                  width: 20, height: 20, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 800, background: s === 'feita' || s === 'atual' ? cor : 'var(--portal-bg-secondary)',
                  color: s === 'feita' || s === 'atual' ? '#fff' : 'var(--portal-text-muted)',
                }}>{s === 'feita' ? <Check size={12} /> : s === 'pulada' ? <Minus size={12} /> : i + 1}</span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 800, color: s === 'futura' || s === 'pulada' ? 'var(--portal-text-muted)' : 'var(--portal-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{TITULO[e]}</span>
                  <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: cor }}>{rotuloDe(s)}</span>
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* O que cada fase liberada registrou */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(260px, 100%), 1fr))', gap: 10 }}>
        {comCartao.map((e) => {
          const s = sit[e]
          const cor = corDe(s)
          return (
            <div key={e} style={{
              padding: '10px 12px', borderRadius: 8, background: 'var(--portal-bg-card)',
              border: '1px solid var(--portal-border)', borderTop: `3px solid ${cor}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--portal-text)' }}>{ORDEM.indexOf(e) + 1}. {TITULO[e]}</span>
                {s === 'atual' && <span style={{ fontSize: 11, fontWeight: 800, color: cor }}>agora</span>}
              </div>
              {s === 'atual' && e !== 'captacao' ? (
                <>
                  <Vazio>{ESPERA_ATUAL[e]}</Vazio>
                  {linkEtapa && base.podeGerir && (
                    <Link href={`/opa/pecas/${e}?item=${item.id}`} style={{ ...botao('#EA580C'), textDecoration: 'none', marginTop: 8, padding: '6px 12px', fontSize: 13 }}>
                      <ArrowRight size={14} /> Abrir na {TITULO[e].toLowerCase()}
                    </Link>
                  )}
                </>
              ) : conteudo(e)}
            </div>
          )
        })}
      </div>
      {proxima && <Vazio>Próxima: <b>{TITULO[proxima]}</b> — {ESPERA[proxima].toLowerCase()}</Vazio>}
    </section>
  )
}

const VERDE = '#047857'
const ESPERA_ATUAL: Record<Etapa, string> = {
  captacao: '',
  separacao: 'Esperando alguém decidir o que fazer com a peça.',
  verificacao: 'Esperando conferir valor e aplicação com o setor.',
  destino: 'Esperando confirmar o que aconteceu e onde a peça ficou.',
}

function Dado({ r, children }: { r: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '96px minmax(0, 1fr)', gap: 8, fontSize: 13.5, color: 'var(--portal-text)', alignItems: 'baseline', padding: '1px 0' }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--portal-text-muted)' }}>{r}</span>
      <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{children}</span>
    </div>
  )
}

function Vazio({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12.5, color: 'var(--portal-text-muted)' }}>{children}</div>
}
