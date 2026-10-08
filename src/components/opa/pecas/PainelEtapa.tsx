'use client'
// Painel de trabalho de UMA peça nas etapas 2–4:
//   separação   → decidir o que fazer; libera os campos que a decisão pede
//   verificação → conferir valor e aplicação com o setor responsável
//   destino     → confirmar o que aconteceu de fato e finalizar
// Grava os campos alterados (pni_atualizar_item / pni_definir_aplicacoes)
// e depois chama a RPC da etapa.

import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Check, Loader2, MapPin, MoveRight, UserRound } from 'lucide-react'
import {
  atualizarItem, definirAplicacoes, finalizar, mudarStatus, nomesAtivos, nomesUsuarios, separar, verificar,
  type CamposEditaveis,
} from '@/lib/opa-pecas/db'
import { mensagemErro, urlsAssinadas } from '@/lib/opa-pecas/fotos'
import {
  fmtDataHora, lerPreco, pendenciasDestino, pendenciasSeparacao, pendenciasVerificacao, precoParaCampo, textoLocal,
} from '@/lib/opa-pecas/regras'
import {
  DECISOES, INFO_DECISAO, INFO_QUALIDADE, ROTULO_QUALIDADE, SETORES_VERIFICACAO,
  type Aplicacao, type CampoDecisao, type Decisao, type Item, type Qualidade,
} from '@/lib/opa-pecas/tipos'
import { CampoPreco, EditorAplicacoes, SeletorLocal, SeletorQualidade } from './Campos'
import { CodigoPeca, Aviso, avisarMudanca, botao, INP, ROTULO, SECAO, TITULO_SECAO, useMiniaturas, useTelaLarga, type Base } from './comum'
import { Visualizador } from './DetalheItem'
import FasesPeca, { ChipDecisao, ICONE_DECISAO } from './FasesPeca'

export type EtapaTrabalho = 'separacao' | 'verificacao' | 'destino'

export { ChipDecisao }

/** Destinos em que a peça sai da empresa: não pergunta onde ela ficou. */
const SAI_DA_EMPRESA: Decisao[] = ['vender', 'descartar']

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

export default function PainelEtapa({ etapa, item, base, onConcluido }: {
  etapa: EtapaTrabalho
  item: Item
  base: Base
  onConcluido: () => void
}) {
  const larga = useTelaLarga()
  const [form, setForm] = useState<Form>(() => formDe(item))
  const [decisao, setDecisao] = useState<Decisao | null>(etapa === 'separacao' ? null : item.decisao)
  const [obs, setObs] = useState('')
  const [setor, setSetor] = useState('')
  const [com, setCom] = useState('')
  // destino: a peça ficou onde estava ou foi para outro lugar?
  const [ficou, setFicou] = useState<'mesmo' | 'outro' | null>(null)
  const [usuarios, setUsuarios] = useState<Record<string, string>>({})
  const [nomes, setNomes] = useState<string[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [visor, setVisor] = useState<number | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
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

  const perguntaLocal = etapa === 'destino' && !!decisao && !SAI_DA_EMPRESA.includes(decisao)
  const localAntes = textoLocal(item, base.nomesLocais)
  const localNovo = textoLocal({ local_id: form.local || null, local_tecnico: form.tecnico || null }, base.nomesLocais)
  const faltasLocal = !perguntaLocal ? []
    : !ficou ? ['onde a peça ficou']
      : ficou === 'outro' && !form.local ? ['o novo lugar']
        : ficou === 'outro' && localNovo === localAntes ? ['um lugar diferente do atual']
          : []

  const faltas = etapa === 'separacao' ? pendenciasSeparacao(decisao, obs)
    : etapa === 'verificacao' ? pendenciasVerificacao(previa, setor)
      : [...pendenciasDestino(decisao, obs), ...faltasLocal]

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
    if (etapa === 'separacao') return executar(async () => { await gravarCampos(); await separar(item.id, decisao!, obs) })
    if (etapa === 'verificacao') return executar(async () => { await gravarCampos(); await verificar(item.id, setor, com, obs) })
    return executar(async () => {
      let texto = obs.trim()
      if (perguntaLocal) {
        // a troca de local fica no histórico da peça; o desfecho registra a resposta
        if (ficou === 'outro') await atualizarItem(item.id, { local_id: form.local || null, local_tecnico: form.tecnico || null })
        const onde = ficou === 'outro'
          ? `Foi para ${localNovo}${localAntes ? ` (estava em ${localAntes})` : ''}`
          : `Continuou no mesmo lugar${localAntes ? ` (${localAntes})` : ''}`
        texto = texto ? `${texto} · ${onde}` : onde
      }
      await finalizar(item.id, decisao!, texto)
    })
  }

  const voltar = () => executar(() => mudarStatus(item.id, etapa === 'verificacao' ? 'aguardando_identificacao' : 'identificado'))

  const campos: CampoDecisao[] = etapa === 'separacao'
    ? (decisao ? INFO_DECISAO[decisao].campos : [])
    : etapa === 'verificacao'
      ? (['descricao', 'codigo_fabricante', 'aplicacao', 'preco', ...(decisao === 'guardar' ? ['local' as const] : [])])
      : []
  const precoObrigatorio = etapa === 'verificacao' && (decisao === 'vender' || decisao === 'guardar')

  const rotuloConcluir = etapa === 'separacao'
    ? (decisao && INFO_DECISAO[decisao].encerra ? `Encerrar: ${INFO_DECISAO[decisao].rotulo}` : 'Confirmar separação')
    : etapa === 'verificacao' ? 'Confirmar verificação'
      : decisao ? `Finalizar: ${ROTULO_FINAL[decisao]}` : 'Finalizar'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Peça */}
      <section style={SECAO}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <CodigoPeca codigo={item.codigo} tamanho={20} />
          <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: INFO_QUALIDADE[item.qualidade].fundo, color: INFO_QUALIDADE[item.qualidade].cor }}>{ROTULO_QUALIDADE[item.qualidade]}</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--portal-text-secondary)' }}>{item.quantidade} {item.quantidade === 1 ? 'peça' : 'peças'}</span>
          {item.local_id && <span style={{ fontSize: 13, color: 'var(--portal-text-secondary)', display: 'inline-flex', alignItems: 'center', gap: 4 }}><MapPin size={13} /> {textoLocal(item, base.nomesLocais)}</span>}
        </div>
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
          {item.descricao && etapa === 'separacao' && <> · “{item.descricao}”</>}
        </div>
      </section>

      {/* O que as fases anteriores já registraram */}
      {etapa !== 'separacao' && (
        <section style={SECAO}>
          <h2 style={TITULO_SECAO}>O que já foi feito</h2>
          <FasesPeca item={item} base={base} usuarios={usuarios} ate={etapa} />
        </section>
      )}

      {/* Separação: o que fazer */}
      {etapa === 'separacao' && (
        <section style={SECAO}>
          <h2 style={TITULO_SECAO}>O que fazer com a peça?</h2>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${larga ? 170 : 150}px, 1fr))`, gap: 8 }}>
            {DECISOES.map((d) => (
              <CartaoDecisao key={d} decisao={d} ativo={decisao === d} onClick={() => { setDecisao(d); setErro(null) }} />
            ))}
          </div>
        </section>
      )}

      {/* Destino: confirmar o planejado ou mudar */}
      {etapa === 'destino' && (
        <section style={SECAO}>
          <h2 style={TITULO_SECAO}>O que aconteceu com a peça?</h2>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${larga ? 170 : 150}px, 1fr))`, gap: 8 }}>
            {DECISOES.map((d) => (
              <CartaoDecisao key={d} decisao={d} ativo={decisao === d} rotulo={ROTULO_FINAL[d]}
                dica={d === item.decisao ? 'Planejado na separação' : 'Mudou o plano'} onClick={() => { setDecisao(d); setErro(null) }} />
            ))}
          </div>
        </section>
      )}

      {/* Destino: a peça ficou onde estava ou mudou de lugar? */}
      {perguntaLocal && (
        <section style={SECAO}>
          <h2 style={TITULO_SECAO}>Onde a peça ficou?</h2>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${larga ? 220 : 160}px, 1fr))`, gap: 8 }}>
            <OpcaoLocal ativo={ficou === 'mesmo'} onClick={() => { setFicou('mesmo'); setForm((f) => ({ ...f, local: item.local_id || '', tecnico: item.local_tecnico || '' })); setErro(null) }}
              icone={<MapPin size={18} />} titulo="Continuou no mesmo lugar" dica={localAntes || 'Sem local registrado'} />
            <OpcaoLocal ativo={ficou === 'outro'} onClick={() => { setFicou('outro'); setErro(null) }}
              icone={<MoveRight size={18} />} titulo="Foi para outro lugar" dica={localAntes ? `Sai de: ${localAntes}` : 'Escolha o novo lugar'} />
          </div>
          {ficou === 'outro' && (
            <div>
              <label style={ROTULO}>Novo lugar</label>
              <SeletorLocal locais={base.locais} local={form.local} tecnico={form.tecnico} onChange={(l, t) => setForm((f) => ({ ...f, local: l, tecnico: t }))} />
            </div>
          )}
        </section>
      )}

      {/* Campos liberados pela etapa/decisão */}
      {campos.length > 0 && (
        <section style={SECAO}>
          <h2 style={TITULO_SECAO}>{etapa === 'verificacao' ? 'Confira com o setor responsável' : 'Complete as informações'}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: larga ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)', gap: 14 }}>
            {campos.includes('descricao') && (
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={ROTULO}>Descrição</label>
                <textarea value={form.descricao} onChange={(e) => muda('descricao', e.target.value.slice(0, 500))} rows={2} placeholder="O que é a peça" style={{ ...INP, resize: 'vertical' }} />
              </div>
            )}
            {campos.includes('codigo_fabricante') && (
              <div>
                <label style={ROTULO}>Código já existente</label>
                <input value={form.codigo_fabricante} onChange={(e) => muda('codigo_fabricante', e.target.value.slice(0, 80))} placeholder="Part number" style={INP} />
              </div>
            )}
            {campos.includes('preco') && (
              <div>
                <label style={ROTULO}>{etapa === 'verificacao' ? 'Valor confirmado' : 'Preço sugerido'}{precoObrigatorio && <span style={{ color: '#DC2626' }}> *</span>}</label>
                <CampoPreco valor={form.preco} onChange={(v) => muda('preco', v)} />
              </div>
            )}
            {campos.includes('qualidade') && (
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={ROTULO}>Estado da peça</label>
                <SeletorQualidade valor={form.qualidade} onChange={(q) => muda('qualidade', q)} />
              </div>
            )}
            {campos.includes('aplicacao') && (
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={ROTULO}>Aplicação{etapa === 'verificacao' && <span style={{ color: '#DC2626' }}> *</span>}</label>
                <EditorAplicacoes tipos={base.tipos} marcas={base.marcas} valor={form.aplicacoes} onChange={(v) => muda('aplicacoes', v)} />
              </div>
            )}
            {campos.includes('local') && (
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={ROTULO}>Onde vai ser guardada</label>
                <SeletorLocal locais={base.locais} local={form.local} tecnico={form.tecnico} onChange={(l, t) => setForm((f) => ({ ...f, local: l, tecnico: t }))} />
              </div>
            )}
          </div>
        </section>
      )}

      {/* Verificação: com quem */}
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

      {/* Observação da separação / do destino */}
      {etapa !== 'verificacao' && decisao && (etapa === 'destino' || INFO_DECISAO[decisao].obs) && (
        <section style={SECAO}>
          <label style={{ ...ROTULO, marginBottom: 0 }}>
            {etapa === 'destino' ? INFO_DECISAO[decisao].destino : INFO_DECISAO[decisao].obs}
            {(INFO_DECISAO[decisao].obsObrigatoria) && <span style={{ color: '#DC2626' }}> *</span>}
          </label>
          <textarea value={obs} onChange={(e) => setObs(e.target.value.slice(0, 500))} rows={2} style={{ ...INP, resize: 'vertical' }} />
        </section>
      )}

      {erro && <Aviso>{erro}</Aviso>}

      {/* Ações */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', position: larga ? 'static' : 'sticky', bottom: 0, padding: larga ? 0 : '10px 0', background: larga ? 'transparent' : 'var(--portal-bg-card)', zIndex: 2 }}>
        <button type="button" onClick={concluir} disabled={ocupado || faltas.length > 0}
          style={{ ...botao(corConcluir(etapa, decisao), { grande: true, desab: ocupado || faltas.length > 0 }), flex: larga ? '0 0 auto' : 1 }}>
          {ocupado ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={18} />} {rotuloConcluir}
        </button>
        {etapa !== 'separacao' && (
          <button type="button" onClick={voltar} disabled={ocupado} style={botao('#52525B', { contorno: true, desab: ocupado })}>
            <ArrowLeft size={15} /> Voltar para {etapa === 'verificacao' ? 'separação' : 'verificação'}
          </button>
        )}
        {faltas.length > 0 && <span style={{ fontSize: 12.5, color: '#B45309', fontWeight: 600 }}>Falta: {faltas.join(', ')}</span>}
      </div>

      {visor != null && <Visualizador fotos={item.fotos.map((f) => urls[f.storage_path]).filter(Boolean)} inicio={visor} onFechar={() => setVisor(null)} />}
    </div>
  )
}

const ROTULO_FINAL: Record<Decisao, string> = {
  vender: 'Vendida', guardar: 'Guardada', usar: 'Usada', descartar: 'Descartada', outro: 'Outro',
}

function corConcluir(etapa: EtapaTrabalho, d: Decisao | null): string {
  if (d === 'descartar') return '#B91C1C'
  return etapa === 'verificacao' ? '#047857' : '#EA580C'
}

function OpcaoLocal({ ativo, onClick, icone, titulo, dica }: { ativo: boolean; onClick: () => void; icone: React.ReactNode; titulo: string; dica: string }) {
  const cor = '#0F766E'
  return (
    <button type="button" role="radio" aria-checked={ativo} onClick={onClick} style={{
      textAlign: 'left', padding: '12px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
      display: 'flex', gap: 10, alignItems: 'flex-start',
      border: '1.5px solid ' + (ativo ? cor : 'var(--portal-border)'), background: ativo ? cor : 'var(--portal-bg-card)',
    }}>
      <span style={{ color: ativo ? '#fff' : cor, marginTop: 1 }}>{icone}</span>
      <span>
        <span style={{ display: 'block', fontSize: 14.5, fontWeight: 800, color: ativo ? '#fff' : 'var(--portal-text)' }}>{titulo}</span>
        <span style={{ display: 'block', fontSize: 12, color: ativo ? 'rgba(255,255,255,.85)' : 'var(--portal-text-muted)', marginTop: 2 }}>{dica}</span>
      </span>
    </button>
  )
}

function CartaoDecisao({ decisao, ativo, onClick, rotulo, dica }: { decisao: Decisao; ativo: boolean; onClick: () => void; rotulo?: string; dica?: string }) {
  const info = INFO_DECISAO[decisao]
  return (
    <button type="button" role="radio" aria-checked={ativo} onClick={onClick} style={{
      textAlign: 'left', padding: '12px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
      display: 'flex', gap: 10, alignItems: 'flex-start',
      border: '1.5px solid ' + (ativo ? info.cor : 'var(--portal-border)'), background: ativo ? info.cor : 'var(--portal-bg-card)',
    }}>
      <span style={{ color: ativo ? '#fff' : info.cor, marginTop: 1 }}>{ICONE_DECISAO[decisao]}</span>
      <span>
        <span style={{ display: 'block', fontSize: 14.5, fontWeight: 800, color: ativo ? '#fff' : 'var(--portal-text)' }}>{rotulo || info.rotulo}</span>
        <span style={{ display: 'block', fontSize: 12, color: ativo ? 'rgba(255,255,255,.85)' : 'var(--portal-text-muted)', marginTop: 2 }}>{dica || info.dica}</span>
      </span>
    </button>
  )
}

