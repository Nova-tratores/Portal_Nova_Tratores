'use client'
// As fases da peça (Captação → Verificação → Separação → Concluída — sql/pni-11)
// em sequência. Cada fase mostra o que foi registrado nela e só "libera" quando
// a peça chega lá: concluída = verde, atual = laranja, futura = cinza.

import Link from 'next/link'
import { Archive, ArrowRight, Check, CircleHelp, Minus, Tag, Trash2, Wrench } from 'lucide-react'
import { codigoDefinitivo, ehFinal, etapaDoItem, fmtDataHora, fmtPreco, textoAplicacoes, textoLocal } from '@/lib/opa-pecas/regras'
import { INFO_DECISAO, ROTULO_QUALIDADE, ROTULO_STATUS, type Decisao, type Etapa, type Item } from '@/lib/opa-pecas/tipos'

/** Rota da tela de cada etapa. */
const ROTA: Record<Etapa, string> = { captacao: 'novo', verificacao: 'verificacao', separacao: 'separacao', concluida: 'concluidas' }
import { botao, LARANJA, type Base, useTelaLarga } from './comum'

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

const ORDEM: Etapa[] = ['captacao', 'verificacao', 'separacao', 'concluida']
const TITULO: Record<Etapa, string> = { captacao: 'Captação', verificacao: 'Verificação', separacao: 'Separação', concluida: 'Concluída' }
const ESPERA: Record<Etapa, string> = {
  captacao: '',
  verificacao: 'Libera depois da captação: valor e aplicação conferidos com o setor.',
  separacao: 'Libera depois da verificação: decidir pra onde a peça vai.',
  concluida: 'Libera na separação: a peça ganha o código e o QR.',
}

function situacoes(item: Item): Record<Etapa, Situacao> {
  // à venda e encerradas: tudo feito (a separação concluiu a peça)
  const concluida = ehFinal(item.status) || item.status === 'a_venda'
  const atual = etapaDoItem(item)
  // peça antiga encerrada sem passar pela verificação (regra anterior ao pni-11)
  const semVerificacao = concluida && !item.verificado_em
  const s = {} as Record<Etapa, Situacao>
  ORDEM.forEach((e, i) => {
    if (e === 'captacao') { s[e] = 'feita'; return }
    if (concluida) { s[e] = e === 'verificacao' && semVerificacao ? 'pulada' : 'feita'; return }
    const idxAtual = atual ? ORDEM.indexOf(atual) : 0
    s[e] = i < idxAtual ? 'feita' : i === idxAtual ? 'atual' : 'futura'
  })
  return s
}

/** `ate`: mostra só as fases antes desta (usado dentro do painel da etapa). */
export default function FasesPeca({ item, base, usuarios, ate, linkEtapa, compacto }: {
  item: Item
  base: Base
  usuarios: Record<string, string>
  ate?: Etapa
  linkEtapa?: boolean
  /** só a barra de passos + o que fazer agora (cabeçalho da ficha) */
  compacto?: boolean
}) {
  const larga = useTelaLarga()
  const sit = situacoes(item)
  const fases = ate ? ORDEM.slice(0, ORDEM.indexOf(ate)) : ORDEM
  const quem = (id: string | null, em: string | null) => (id || em) && (
    <div style={{ fontSize: 12, color: 'var(--portal-text-muted)', marginTop: 4 }}>
      {id ? usuarios[id] || '…' : ''}{id && em ? ', ' : ''}{fmtDataHora(em)}
    </div>
  )

  const conteudo = (e: Etapa) => {
    if (sit[e] === 'pulada') return <Vazio>Não se aplica — a peça foi encerrada antes da verificação.</Vazio>
    if (sit[e] !== 'feita' && e !== 'captacao') return <Vazio>{ESPERA[e]}</Vazio>
    switch (e) {
      case 'captacao': return (
        <>
          <Dado r="Peças">{item.quantidade} · {ROTULO_QUALIDADE[item.qualidade]}{item.nao_identificavel && ' · não identificável'}</Dado>
          {item.descricao && <Dado r="Descrição">{item.descricao}</Dado>}
          {item.codigo_fabricante && <Dado r="Cód. existente">{item.codigo_fabricante}</Dado>}
          <Dado r="Fotos">{item.fotos.length}</Dado>
          {item.observacoes && <Dado r="Obs.">{item.observacoes}</Dado>}
          {quem(item.criado_por, item.criado_em)}
        </>
      )
      case 'separacao': return (
        <>
          {item.decisao ? <Dado r="Destino">{item.decisao === 'outro' && item.desfecho ? <b>{item.desfecho.split(' — ')[0]}</b> : <ChipDecisao decisao={item.decisao} />}</Dado> : <Dado r="Destino">—</Dado>}
          {item.decisao_obs && <Dado r="Obs.">{item.decisao_obs}</Dado>}
          {quem(item.decidido_por, item.decidido_em)}
        </>
      )
      case 'verificacao': return (
        <>
          <Dado r="Com">{item.verificado_setor || '—'}{item.verificado_com && ` (${item.verificado_com})`}</Dado>
          <Dado r="Valor">{fmtPreco(item.preco_sugerido)}{item.preco_sugerido != null && item.quantidade > 1 && ` · total ${fmtPreco(item.preco_sugerido * item.quantidade)}`}</Dado>
          <Dado r="Aplicação">{textoAplicacoes(item, { tipos: base.nomesTipos, marcas: base.nomesMarcas }) || '—'}</Dado>
          {item.verificacao_obs && <Dado r="Obs.">{item.verificacao_obs}</Dado>}
          {quem(item.verificado_por, item.verificado_em)}
        </>
      )
      case 'concluida': return (
        <>
          <Dado r="Resultado"><b>{ROTULO_STATUS[item.status]}</b></Dado>
          {codigoDefinitivo(item.codigo) && <Dado r="Código">{item.codigo}</Dado>}
          {(item.desfecho || item.motivo_descarte) && <Dado r="O que houve">{item.desfecho || item.motivo_descarte}</Dado>}
          <Dado r="Onde está">{textoLocal(item, base.nomesLocais) || '—'}</Dado>
          {item.etiqueta_impressa_em && <Dado r="Etiqueta">impressa em {fmtDataHora(item.etiqueta_impressa_em)}</Dado>}
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
  const passos = (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${fases.length}, minmax(0, 1fr))`, gap: 4 }}>
          {fases.map((e, i) => {
            const s = sit[e]
            const cor = corDe(s)
            return (
              <div key={e} style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
                <div style={{ height: 5, borderRadius: 3, background: s === 'feita' ? VERDE : s === 'atual' ? LARANJA : 'var(--portal-border)' }} />
                <div style={{ display: 'flex', flexDirection: larga ? 'row' : 'column', alignItems: larga ? 'center' : 'flex-start', gap: larga ? 6 : 3, minWidth: 0 }}>
                  <span style={{
                    width: 20, height: 20, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 800, background: s === 'feita' || s === 'atual' ? cor : 'var(--portal-bg-secondary)',
                    color: s === 'feita' || s === 'atual' ? '#fff' : 'var(--portal-text-muted)',
                  }}>{s === 'feita' ? <Check size={12} /> : s === 'pulada' ? <Minus size={12} /> : i + 1}</span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: larga ? 13 : 12, fontWeight: 800, color: s === 'futura' || s === 'pulada' ? 'var(--portal-text-muted)' : 'var(--portal-text)', whiteSpace: larga ? 'nowrap' : 'normal', overflow: 'hidden', textOverflow: 'ellipsis', overflowWrap: 'anywhere', lineHeight: 1.15 }}>{TITULO[e]}</span>
                    <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: cor }}>{rotuloDe(s)}</span>
                  </span>
                </div>
              </div>
            )
          })}
        </div>
  
  )

  if (compacto) {
    const atual = fases.find((e) => sit[e] === 'atual')
    const concluida = !atual
    return (
      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }} aria-label="Fases da peça">
        {passos}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 12px', borderRadius: 10, background: concluida ? '#ECFDF5' : '#FFF7ED', border: `1px solid ${concluida ? '#A7F3D0' : '#FED7AA'}` }}>
          <span style={{ flex: 1, minWidth: 200, fontSize: 13, fontWeight: 600, color: concluida ? '#065F46' : '#9A3412' }}>
            {concluida
              ? <>Peça concluída{item.encerrado_em ? ` em ${fmtDataHora(item.encerrado_em)}` : ''}{item.desfecho ? ` — ${item.desfecho}` : ''}.</>
              : <><b>Agora: {TITULO[atual]}.</b> {ESPERA_ATUAL[atual]}</>}
          </span>
          {!concluida && linkEtapa && base.podeGerir && atual !== 'captacao' && (
            <Link href={`/opa/pecas/${ROTA[atual]}?item=${item.id}`} style={{ ...botao(LARANJA), textDecoration: 'none', padding: '7px 13px', fontSize: 13 }}>
              <ArrowRight size={14} /> Abrir na {TITULO[atual].toLowerCase()}
            </Link>
          )}
        </div>
      </section>
    )
  }

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }} aria-label="Fases da peça">
      {passos}

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
                    <Link href={`/opa/pecas/${ROTA[e]}?item=${item.id}`} style={{ ...botao('#EA580C'), textDecoration: 'none', marginTop: 8, padding: '6px 12px', fontSize: 13 }}>
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
  verificacao: 'Esperando conferir valor e aplicação com o setor.',
  separacao: 'Esperando decidir pra onde a peça vai.',
  concluida: '',
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
