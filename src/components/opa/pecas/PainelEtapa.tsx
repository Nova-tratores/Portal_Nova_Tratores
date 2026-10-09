'use client'
// Painel de trabalho de UMA peça nas etapas (fluxo novo, sql/pni-11):
//   verificação → conferir valor e aplicação com o setor responsável
//   separação   → ÚLTIMA decisão: pra onde a peça vai — conclui a peça
//                 (vender → à venda; guardar/usar/descartar; ou um destino
//                 criado pelo usuário, que dá pra criar aqui mesmo)
// Grava os campos alterados (pni_atualizar_item / pni_definir_aplicacoes)
// e depois chama a RPC da etapa.

import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Check, CircleHelp, Loader2, MapPin, Pencil, Plus, UserRound } from 'lucide-react'
import {
  atualizarItem, criarDestino, definirAplicacoes, mudarStatus, nomesAtivos, nomesUsuarios, separar, verificar,
  type CamposEditaveis,
} from '@/lib/opa-pecas/db'
import { mensagemErro, urlsAssinadas } from '@/lib/opa-pecas/fotos'
import { fmtDataHora, lerPreco, pendenciasSeparacao, pendenciasVerificacao, precoParaCampo, textoLocal } from '@/lib/opa-pecas/regras'
import {
  DECISOES, INFO_DECISAO, INFO_QUALIDADE, ROTULO_QUALIDADE, SETORES_VERIFICACAO,
  type Aplicacao, type Decisao, type Item, type Qualidade,
} from '@/lib/opa-pecas/tipos'
import { CampoPreco, EditorAplicacoes, SeletorLocal } from './Campos'
import { CodigoPeca, Aviso, avisarMudanca, botao, INP, ROTULO, SECAO, TITULO_SECAO, useMiniaturas, useTelaLarga, type Base } from './comum'
import DetalheItem, { Visualizador } from './DetalheItem'
import { Janela } from './Moldura'
import FasesPeca, { ChipDecisao, ICONE_DECISAO } from './FasesPeca'

export type EtapaTrabalho = 'verificacao' | 'separacao'

export { ChipDecisao }

/** Decisões prontas na separação ("outro" vira a lista de destinos criados). */
const DECISOES_PRONTAS = DECISOES.filter((d) => d !== 'outro')

interface Form {
  descricao: string
  codigo_fabricante: string
  qualidade: Qualidade
  preco: string
  local: string
  tecnico: string
  aplicacoes: Aplicacao[]
}

const formDe = (i: Item): Form => ({
  descricao: i.descricao || '', codigo_fabricante: i.codigo_fabricante || '', qualidade: i.qualidade,
  preco: precoParaCampo(i.preco_sugerido), local: i.local_id || '', tecnico: i.local_tecnico || '', aplicacoes: i.aplicacoes,
})

const mesmaAplicacao = (a: Aplicacao[], b: Aplicacao[]) =>
  a.length === b.length && a.every((x) => b.some((y) => y.tipo_maquina_id === x.tipo_maquina_id && y.marca_id === x.marca_id))

export default function PainelEtapa({ etapa, item, base, onConcluido, onAtualizado }: {
  etapa: EtapaTrabalho
  item: Item
  base: Base
  onConcluido: () => void
  /** a peça mudou pela ficha (editar cadastro): recarregar sem sair da etapa */
  onAtualizado?: () => void
}) {
  const larga = useTelaLarga()
  const [form, setForm] = useState<Form>(() => formDe(item))
  const [decisao, setDecisao] = useState<Decisao | null>(null)
  const [destinoId, setDestinoId] = useState<string | null>(null)
  const [novoDestino, setNovoDestino] = useState('')
  const [criandoDestino, setCriandoDestino] = useState(false)
  const [obs, setObs] = useState('')
  const [setor, setSetor] = useState('')
  const [com, setCom] = useState('')
  const [usuarios, setUsuarios] = useState<Record<string, string>>({})
  const [nomes, setNomes] = useState<string[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [visor, setVisor] = useState<number | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [editando, setEditando] = useState(false)
  const minis = useMiniaturas(item.fotos.map((f) => f.storage_path))

  useEffect(() => {
    let vivo = true
    urlsAssinadas(item.fotos.map((f) => f.storage_path)).then((r) => { if (vivo) setUrls(r) }).catch(() => null)
    nomesUsuarios([item.criado_por, item.decidido_por, item.verificado_por]).then((r) => { if (vivo) setUsuarios(r) })
    if (etapa === 'verificacao') nomesAtivos().then((n) => { if (vivo) setNomes(n) })
    return () => { vivo = false }
  }, [item, etapa])

  const muda = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))
  const preco = lerPreco(form.preco)

  // o item como ficará depois de gravar o formulário (para conferir pendências)
  const previa = useMemo(() => ({
    ...item, descricao: form.descricao.trim() || null, preco_sugerido: preco != null && Number.isNaN(preco) ? null : preco,
    aplicacoes: form.aplicacoes, decisao,
  }), [item, form, preco, decisao])

  const destinoEscolhido = base.destinos.find((d) => d.id === destinoId)
  const faltaLocal = etapa === 'separacao' && decisao === 'guardar' && !form.local ? ['onde vai ser guardada'] : []
  const faltas = etapa === 'separacao' ? [...pendenciasSeparacao(decisao, obs, destinoId), ...faltaLocal] : pendenciasVerificacao(previa, setor)

  const gravarCampos = async () => {
    const d: CamposEditaveis = {}
    if (form.descricao.trim() !== (item.descricao || '')) d.descricao = form.descricao.trim() || null
    if (form.codigo_fabricante.trim() !== (item.codigo_fabricante || '')) d.codigo_fabricante = form.codigo_fabricante.trim() || null
    if (form.qualidade !== item.qualidade) d.qualidade = form.qualidade
    if (previa.preco_sugerido !== item.preco_sugerido) d.preco_sugerido = previa.preco_sugerido
    if (form.local !== (item.local_id || '') || form.tecnico !== (item.local_tecnico || '')) { d.local_id = form.local || null; d.local_tecnico = form.tecnico || null }
    if (Object.keys(d).length) await atualizarItem(item.id, d)
    if (!mesmaAplicacao(form.aplicacoes, item.aplicacoes)) await definirAplicacoes(item.id, form.aplicacoes)
  }

  const executar = async (fn: () => Promise<unknown>) => {
    setOcupado(true)
    setErro(null)
    try {
      await fn()
      avisarMudanca()
      onConcluido()
    } catch (e) {
      setErro(mensagemErro(e))
    } finally {
      setOcupado(false)
    }
  }

  const concluir = () => {
    if (faltas.length) { setErro(`Falta: ${faltas.join(', ')}.`); return }
    if (etapa === 'verificacao') return executar(async () => { await gravarCampos(); await verificar(item.id, setor, com, obs) })
    return executar(async () => { await gravarCampos(); await separar(item.id, decisao!, obs, decisao === 'outro' ? destinoId : null) })
  }

  // separação → volta para a verificação (a verificação é a 1ª etapa depois da captação)
  const voltar = () => executar(() => mudarStatus(item.id, 'aguardando_identificacao'))

  const escolherPronta = (d: Decisao) => { setDecisao(d); setDestinoId(null); setErro(null) }
  const escolherDestino = (id: string) => { setDecisao('outro'); setDestinoId(id); setErro(null) }

  const criarNovoDestino = async () => {
    const nome = novoDestino.trim()
    if (!nome) return
    setCriandoDestino(true)
    setErro(null)
    try {
      const d = await criarDestino(nome)
      base.recarregarLookups()
      setNovoDestino('')
      escolherDestino(d.id)
    } catch (e) {
      setErro(mensagemErro(e))
    } finally {
      setCriandoDestino(false)
    }
  }

  const rotuloConcluir = etapa === 'verificacao' ? 'Confirmar verificação'
    : decisao === 'outro' ? `Concluir: ${destinoEscolhido?.nome || 'outro destino'}`
      : decisao ? `Concluir: ${INFO_DECISAO[decisao].rotulo}` : 'Concluir a peça'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Peça */}
      <section style={SECAO}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <CodigoPeca codigo={item.codigo} tamanho={20} />
          <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: INFO_QUALIDADE[item.qualidade].fundo, color: INFO_QUALIDADE[item.qualidade].cor }}>{ROTULO_QUALIDADE[item.qualidade]}</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--portal-text-secondary)' }}>{item.quantidade} {item.quantidade === 1 ? 'peça' : 'peças'}</span>
          {item.local_id && <span style={{ fontSize: 13, color: 'var(--portal-text-secondary)', display: 'inline-flex', alignItems: 'center', gap: 4 }}><MapPin size={13} /> {textoLocal(item, base.nomesLocais)}</span>}
          <button type="button" onClick={() => setEditando(true)} title="Alterar qualquer informação da peça (descrição, quantidade, qualidade, fotos, local…)"
            style={{ ...botao('#52525B', { contorno: true }), marginLeft: 'auto', padding: '6px 11px', fontSize: 12.5 }}>
            <Pencil size={13} /> Editar cadastro
          </button>
        </div>
        {item.descricao && <div style={{ fontSize: 14, color: 'var(--portal-text)', fontWeight: 600 }}>{item.descricao}</div>}
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${larga ? 92 : 76}px, 1fr))`, gap: 6 }}>
          {item.fotos.map((f, i) => (
            <button key={f.id} type="button" onClick={() => setVisor(i)} aria-label={`Ampliar foto ${i + 1}`} style={{ aspectRatio: '1', padding: 0, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--portal-border)', background: 'var(--portal-bg-secondary)', cursor: 'zoom-in' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {(minis[f.storage_path] || urls[f.storage_path]) && <img src={minis[f.storage_path] || urls[f.storage_path]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 12, color: 'var(--portal-text-muted)' }}>
          Captada por {usuarios[item.criado_por] || '…'} em {fmtDataHora(item.criado_em)}
          {item.codigo_fabricante && <> · código existente {item.codigo_fabricante}</>}
        </div>
      </section>

      {/* Separação: o que as fases anteriores registraram */}
      {etapa === 'separacao' && (
        <section style={SECAO}>
          <h2 style={TITULO_SECAO}>O que já foi feito</h2>
          <FasesPeca item={item} base={base} usuarios={usuarios} ate="separacao" />
        </section>
      )}

      {/* Verificação: valor e aplicação */}
      {etapa === 'verificacao' && (
        <section style={SECAO}>
          <h2 style={TITULO_SECAO}>Confira com o setor responsável</h2>
          <div style={{ display: 'grid', gridTemplateColumns: larga ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)', gap: 14 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={ROTULO}>Descrição</label>
              <textarea value={form.descricao} onChange={(e) => muda('descricao', e.target.value.slice(0, 500))} rows={2} placeholder="O que é a peça" style={{ ...INP, resize: 'vertical' }} />
            </div>
            <div>
              <label style={ROTULO}>Valor confirmado{!item.nao_identificavel && <span style={{ color: '#DC2626' }}> *</span>}</label>
              <CampoPreco valor={form.preco} onChange={(v) => muda('preco', v)} />
            </div>
            <div>
              <label style={ROTULO}>Código já existente</label>
              <input value={form.codigo_fabricante} onChange={(e) => muda('codigo_fabricante', e.target.value.slice(0, 80))} placeholder="Part number" style={INP} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={ROTULO}>Aplicação{!item.nao_identificavel && <span style={{ color: '#DC2626' }}> *</span>}</label>
              <EditorAplicacoes tipos={base.tipos} marcas={base.marcas} valor={form.aplicacoes} onChange={(v) => muda('aplicacoes', v)} />
            </div>
          </div>
        </section>
      )}

      {etapa === 'verificacao' && (
        <section style={SECAO}>
          <h2 style={TITULO_SECAO}>Verificado com</h2>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {SETORES_VERIFICACAO.map((s) => (
              <button key={s} type="button" aria-pressed={setor === s} onClick={() => setSetor(s)} style={{
                padding: '8px 14px', borderRadius: 8, fontSize: 14, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 6,
                border: '1.5px solid ' + (setor === s ? '#047857' : 'var(--portal-border)'),
                background: setor === s ? '#047857' : 'var(--portal-bg-card)', color: setor === s ? '#fff' : 'var(--portal-text)',
              }}>{setor === s && <Check size={14} />} {s}</button>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: larga ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)', gap: 12 }}>
            <div>
              <label style={ROTULO}><UserRound size={13} style={{ verticalAlign: -2 }} /> Quem confirmou</label>
              <input list="pni-quem-confirmou" value={com} onChange={(e) => setCom(e.target.value.slice(0, 120))} placeholder="Nome da pessoa" style={INP} />
              <datalist id="pni-quem-confirmou">{nomes.map((n) => <option key={n} value={n} />)}</datalist>
            </div>
            <div>
              <label style={ROTULO}>Observação</label>
              <input value={obs} onChange={(e) => setObs(e.target.value.slice(0, 500))} placeholder="Opcional" style={INP} />
            </div>
          </div>
        </section>
      )}

      {/* Separação: pra onde a peça vai (conclui) */}
      {etapa === 'separacao' && (
        <section style={SECAO}>
          <h2 style={TITULO_SECAO}>Pra onde a peça vai?</h2>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${larga ? 170 : 150}px, 1fr))`, gap: 8 }}>
            {DECISOES_PRONTAS.map((d) => (
              <CartaoDecisao key={d} decisao={d} ativo={decisao === d} onClick={() => escolherPronta(d)} />
            ))}
          </div>

          <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--portal-text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4 }}>Outros destinos</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {base.destinos.map((d) => {
              const on = decisao === 'outro' && destinoId === d.id
              return (
                <button key={d.id} type="button" role="radio" aria-checked={on} onClick={() => escolherDestino(d.id)} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, fontSize: 14, fontWeight: 700,
                  fontFamily: 'inherit', cursor: 'pointer', border: '1.5px solid ' + (on ? '#52525B' : 'var(--portal-border)'),
                  background: on ? '#52525B' : 'var(--portal-bg-card)', color: on ? '#fff' : 'var(--portal-text)',
                }}>{on ? <Check size={14} /> : <CircleHelp size={14} />} {d.nome}</button>
              )
            })}
            {base.destinos.length === 0 && <span style={{ fontSize: 12.5, color: 'var(--portal-text-muted)', alignSelf: 'center' }}>Nenhum ainda — crie ao lado.</span>}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <input value={novoDestino} onChange={(e) => setNovoDestino(e.target.value.slice(0, 60))} placeholder="Novo destino (ex.: Devolver ao fornecedor)"
              onKeyDown={(e) => { if (e.key === 'Enter') criarNovoDestino() }} style={{ ...INP, flex: 1, minWidth: 220 }} />
            <button type="button" onClick={criarNovoDestino} disabled={!novoDestino.trim() || criandoDestino}
              style={botao('#52525B', { contorno: true, desab: !novoDestino.trim() || criandoDestino })}>
              {criandoDestino ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={15} />} Criar destino
            </button>
          </div>
        </section>
      )}

      {/* Separação: guardar → onde */}
      {etapa === 'separacao' && decisao === 'guardar' && (
        <section style={SECAO}>
          <label style={{ ...ROTULO, marginBottom: 0 }}>Onde vai ser guardada<span style={{ color: '#DC2626' }}> *</span></label>
          <SeletorLocal locais={base.locais} local={form.local} tecnico={form.tecnico} onChange={(l, t) => setForm((f) => ({ ...f, local: l, tecnico: t }))} />
        </section>
      )}

      {/* Separação: observação da decisão */}
      {etapa === 'separacao' && decisao && (decisao === 'outro' || INFO_DECISAO[decisao].obs) && (
        <section style={SECAO}>
          <label style={{ ...ROTULO, marginBottom: 0 }}>
            {INFO_DECISAO[decisao].obs || 'Observação'}
            {INFO_DECISAO[decisao].obsObrigatoria && <span style={{ color: '#DC2626' }}> *</span>}
          </label>
          <textarea value={obs} onChange={(e) => setObs(e.target.value.slice(0, 500))} rows={2} style={{ ...INP, resize: 'vertical' }} />
        </section>
      )}

      {erro && <Aviso>{erro}</Aviso>}

      {/* Ações */}
      <div style={{ display: 'flex', flexDirection: larga ? 'row' : 'column', gap: 8, flexWrap: 'wrap', alignItems: larga ? 'center' : 'stretch', position: larga ? 'static' : 'sticky', bottom: 0, padding: larga ? 0 : '10px 0', background: larga ? 'transparent' : 'var(--portal-bg-card)', zIndex: 2 }}>
        <button type="button" onClick={concluir} disabled={ocupado || faltas.length > 0}
          style={{ ...botao(corConcluir(etapa, decisao), { grande: true, desab: ocupado || faltas.length > 0 }), flex: '0 0 auto' }}>
          {ocupado ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={18} />} {rotuloConcluir}
        </button>
        {/* no celular ficam numa linha abaixo do botão principal (ele nunca quebra em duas linhas) */}
        {(etapa === 'separacao' || faltas.length > 0) && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {etapa === 'separacao' && (
              <button type="button" onClick={voltar} disabled={ocupado} style={botao('#52525B', { contorno: true, desab: ocupado })}>
                <ArrowLeft size={15} /> Voltar para verificação
              </button>
            )}
            {faltas.length > 0 && <span style={{ fontSize: 12.5, color: '#B45309', fontWeight: 600 }}>Falta: {faltas.join(', ')}</span>}
          </div>
        )}
      </div>
      {etapa === 'separacao' && (
        <div style={{ fontSize: 12, color: 'var(--portal-text-muted)', marginTop: -6 }}>
          Ao concluir, a peça ganha o <b>código definitivo e o QR</b> e vai para <b>Concluídas</b>.
        </div>
      )}

      {visor != null && <Visualizador fotos={item.fotos.map((f) => urls[f.storage_path]).filter(Boolean)} inicio={visor} onFechar={() => setVisor(null)} />}
      {editando && (
        <Janela titulo={`Editar cadastro · ${item.codigo}`} onFechar={() => setEditando(false)} largura={1080}>
          <DetalheItem key={item.id} item={item} base={base} onMudou={(novo) => { onAtualizado?.(); if (!novo) setEditando(false) }} />
        </Janela>
      )}
    </div>
  )
}

function corConcluir(etapa: EtapaTrabalho, d: Decisao | null): string {
  if (d === 'descartar') return '#B91C1C'
  return etapa === 'verificacao' ? '#047857' : '#EA580C'
}

function CartaoDecisao({ decisao, ativo, onClick }: { decisao: Decisao; ativo: boolean; onClick: () => void }) {
  const info = INFO_DECISAO[decisao]
  return (
    <button type="button" role="radio" aria-checked={ativo} onClick={onClick} style={{
      textAlign: 'left', padding: '12px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
      display: 'flex', gap: 10, alignItems: 'flex-start',
      border: '1.5px solid ' + (ativo ? info.cor : 'var(--portal-border)'), background: ativo ? info.cor : 'var(--portal-bg-card)',
    }}>
      <span style={{ color: ativo ? '#fff' : info.cor, marginTop: 1 }}>{ICONE_DECISAO[decisao]}</span>
      <span>
        <span style={{ display: 'block', fontSize: 14.5, fontWeight: 800, color: ativo ? '#fff' : 'var(--portal-text)' }}>{info.rotulo}</span>
        <span style={{ display: 'block', fontSize: 12, color: ativo ? 'rgba(255,255,255,.85)' : 'var(--portal-text-muted)', marginTop: 2 }}>{info.dica}</span>
      </span>
    </button>
  )
}
