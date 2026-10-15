'use client'
// Patrimônio Loja — ficha de um item: fotos (pôr/tirar), dados, "Mudar de
// lugar" rápido (local, com quem, situação e motivo), histórico de por onde
// passou, editar tudo e excluir.

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowRight, Camera, History, Loader2, MapPin, Pencil, Printer, Trash2, Truck, UserRound, X } from 'lucide-react'
import { comprimir, enviarFoto, urlsAssinadas } from '@/lib/opa-pecas/fotos'
import { BUCKET_PATRIMONIO } from '@/lib/patrimonio/fotos-regra'
import { formDoItem, ROTULO_SITUACAO, SITUACOES, textoOnde, type ItemPat, type Movimentacao, type Situacao } from '@/lib/patrimonio/tipos'
import { SeletorLocal } from '../pecas/Campos'
import { Aviso, botao, INP, ROTULO, SECAO, TITULO_SECAO, useTelaLarga } from '../pecas/comum'
import { Visualizador } from '../pecas/DetalheItem'
import { api, COR_PAT, fmtData, fmtReal, SeloEstado, type BasePat } from './comum'
import Formulario from './Formulario'
import EtiquetasPat from './Etiquetas'

export default function Ficha({ base, id }: { base: BasePat; id: string }) {
  const router = useRouter()
  const larga = useTelaLarga()
  const [item, setItem] = useState<ItemPat | null>(null)
  const [movs, setMovs] = useState<Movimentacao[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [visor, setVisor] = useState<number | null>(null)
  const [editando, setEditando] = useState(false)
  const [movendo, setMovendo] = useState(false)
  // logo depois de cadastrar a página abre com ?etiqueta=1 → janela da etiqueta já aberta
  const [etiqueta, setEtiqueta] = useState(() => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('etiqueta') === '1')
  const [ocupado, setOcupado] = useState(false)
  const fotoRef = useRef<HTMLInputElement>(null)

  const carregar = useCallback(() => {
    api<{ item: ItemPat; movimentacoes: Movimentacao[] }>(`/api/patrimonio/${encodeURIComponent(id)}`)
      .then((r) => { setItem(r.item); setMovs(r.movimentacoes); setErro(null) })
      .catch((e) => setErro(e instanceof Error ? e.message : String(e)))
  }, [id])
  useEffect(() => { carregar() }, [carregar])

  useEffect(() => {
    if (!item?.fotos.length) return
    let vivo = true
    urlsAssinadas(item.fotos.map((f) => f.storage_path), BUCKET_PATRIMONIO).then((r) => { if (vivo) setUrls(r) }).catch(() => null)
    return () => { vivo = false }
  }, [item])

  const executar = async (fn: () => Promise<unknown>) => {
    setOcupado(true)
    setErro(null)
    try { await fn(); carregar(); base.recarregar() } catch (e) { setErro(e instanceof Error ? e.message : String(e)) } finally { setOcupado(false) }
  }

  const porFotos = (lista: FileList | null) => executar(async () => {
    const paths: string[] = []
    for (const a of Array.from(lista || []).slice(0, 8)) paths.push(await enviarFoto(base.userId!, await comprimir(a), BUCKET_PATRIMONIO))
    if (paths.length) await api(`/api/patrimonio/${item!.id}/fotos`, { method: 'POST', body: { paths } })
  })
  const tirarFoto = (fotoId: string) => { if (confirm('Tirar esta foto?')) executar(() => api(`/api/patrimonio/${item!.id}/fotos?foto=${fotoId}`, { method: 'DELETE' })) }
  const excluir = () => {
    if (!item || !confirm(`Excluir ${item.codigo} — ${item.descricao}? Ele sai da lista (o histórico fica guardado).`)) return
    executar(async () => { await api(`/api/patrimonio/${item.id}`, { method: 'DELETE' }); router.push('/opa/patrimonio') })
  }

  if (erro && !item) return <Aviso>{erro}</Aviso>
  if (!item) return <div style={{ ...SECAO, alignItems: 'center', color: 'var(--portal-text-muted)' }}>Carregando…</div>

  if (editando) {
    return (
      <Formulario base={base} item={item} inicial={formDoItem(item)} onCancelar={() => setEditando(false)}
        onSalvo={() => { setEditando(false); carregar(); base.recarregar() }} />
    )
  }

  const dado = (r: string, v: React.ReactNode) => v ? (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <span style={{ fontSize: 11.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--portal-text-muted)' }}>{r}</span>
      <span style={{ fontSize: 14, color: 'var(--portal-text)', overflowWrap: 'anywhere' }}>{v}</span>
    </div>
  ) : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <section style={SECAO}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'monospace', fontSize: 20, fontWeight: 900, color: COR_PAT }}>{item.codigo}</span>
          <SeloEstado estado={item.estado} />
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--portal-text-secondary)' }}>{ROTULO_SITUACAO[item.situacao]}</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => setEtiqueta(true)} style={botao('#111827')}><Printer size={15} /> {item.etiqueta_impressa_em ? 'Reimprimir etiqueta' : 'Imprimir etiqueta'}</button>
            <button type="button" onClick={() => setMovendo(true)} style={botao(COR_PAT)}><Truck size={15} /> Mudar de lugar</button>
            <button type="button" onClick={() => setEditando(true)} style={botao('#52525B', { contorno: true })}><Pencil size={14} /> Editar</button>
            <button type="button" onClick={excluir} disabled={ocupado} style={botao('#B91C1C', { contorno: true, desab: ocupado })}><Trash2 size={14} /> Excluir</button>
          </div>
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--portal-text)' }}>
          {item.descricao}
          {(item.quantidade || 1) > 1 && <span style={{ marginLeft: 8, fontSize: 14, fontWeight: 800, color: COR_PAT }}>× {item.quantidade} unidades</span>}
        </div>
        {item.etiqueta_impressa_em && <div style={{ fontSize: 12, fontWeight: 700, color: '#047857' }}>Etiqueta impressa em {fmtData(item.etiqueta_impressa_em)}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${larga ? 110 : 84}px, 1fr))`, gap: 6 }}>
          {item.fotos.map((f, i) => (
            <div key={f.id} style={{ position: 'relative', aspectRatio: '1' }}>
              <button type="button" onClick={() => setVisor(i)} aria-label={`Ampliar foto ${i + 1}`} style={{ width: '100%', height: '100%', padding: 0, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--portal-border)', background: 'var(--portal-bg-secondary)', cursor: 'zoom-in' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {urls[f.storage_path] && <img src={urls[f.storage_path]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
              </button>
              <button type="button" aria-label="Tirar foto" onClick={() => tirarFoto(f.id)} style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, border: 'none', background: 'rgba(0,0,0,.6)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={12} /></button>
            </div>
          ))}
          <button type="button" onClick={() => fotoRef.current?.click()} disabled={ocupado} style={{ aspectRatio: '1', borderRadius: 8, border: '1.5px dashed var(--portal-border)', background: 'var(--portal-bg-secondary)', color: 'var(--portal-text-secondary)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>
            {ocupado ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <Camera size={18} />} Foto
          </button>
          <input ref={fotoRef} type="file" accept="image/*" multiple hidden onChange={(e) => { porFotos(e.target.files); e.target.value = '' }} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: larga ? 'repeat(3, minmax(0, 1fr))' : 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
          {dado('Onde está', <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><MapPin size={13} /> {textoOnde(item.local_id, item.local_tecnico, base.nomeLocal)}</span>)}
          {dado('Com quem', item.responsavel && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><UserRound size={13} /> {item.responsavel}</span>)}
          {dado('Categoria', item.categoria)}
          {dado('Marca', item.marca)}
          {dado('Modelo', item.modelo)}
          {dado('Nº de série', item.numero_serie)}
          {dado('Quantidade', String(item.quantidade || 1))}
          {dado((item.quantidade || 1) > 1 ? 'Valor hoje (cada)' : 'Valor hoje', item.valor_atual != null && fmtReal(item.valor_atual))}
          {dado('Valor total', (item.quantidade || 1) > 1 && (item.valor_atual ?? item.valor_compra) != null && fmtReal((item.valor_atual ?? item.valor_compra)! * (item.quantidade || 1)))}
          {dado('Valor pago', item.valor_compra != null && fmtReal(item.valor_compra))}
          {dado('Comprado em', item.data_compra && fmtData(item.data_compra))}
          {dado('Fornecedor', item.fornecedor)}
          {dado('Nota fiscal', item.nota_fiscal)}
          {dado('Garantia até', item.garantia_ate && fmtData(item.garantia_ate))}
        </div>
        {item.tags.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {item.tags.map((t) => <span key={t} style={{ fontSize: 12, fontWeight: 700, color: COR_PAT, background: '#EEF2FF', borderRadius: 999, padding: '2px 9px' }}>#{t}</span>)}
          </div>
        )}
        {item.observacoes && <div style={{ fontSize: 13.5, color: 'var(--portal-text-secondary)', whiteSpace: 'pre-wrap' }}>{item.observacoes}</div>}
      </section>

      {erro && <Aviso>{erro}</Aviso>}

      {movendo && <MudarLugar base={base} item={item} onFechar={() => setMovendo(false)} onSalvo={() => { setMovendo(false); carregar(); base.recarregar() }} />}

      <section style={SECAO}>
        <h2 style={{ ...TITULO_SECAO, display: 'flex', alignItems: 'center', gap: 6 }}><History size={16} /> Por onde passou</h2>
        {movs.length === 0 ? <div style={{ fontSize: 13, color: 'var(--portal-text-muted)' }}>Sem registros.</div> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {movs.map((m) => (
              <div key={m.id} style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '9px 11px', borderRadius: 10, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-card)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 13.5, color: 'var(--portal-text)' }}>
                  {m.de_local_id || m.de_responsavel ? (
                    <>
                      <span>{textoOnde(m.de_local_id, m.de_local_tecnico, base.nomeLocal)}{m.de_responsavel ? ` (${m.de_responsavel})` : ''}</span>
                      <ArrowRight size={14} style={{ color: 'var(--portal-text-muted)' }} />
                    </>
                  ) : <span style={{ fontWeight: 700 }}>Cadastrado em</span>}
                  <b>{textoOnde(m.para_local_id, m.para_local_tecnico, base.nomeLocal)}{m.para_responsavel ? ` (${m.para_responsavel})` : ''}</b>
                  {m.situacao && <span style={{ fontSize: 12, color: 'var(--portal-text-muted)' }}>· {ROTULO_SITUACAO[m.situacao as Situacao] || m.situacao}</span>}
                </div>
                {m.motivo && m.motivo !== 'Cadastro' && <div style={{ fontSize: 12.5, color: 'var(--portal-text-secondary)' }}>{m.motivo}</div>}
                <div style={{ fontSize: 11.5, color: 'var(--portal-text-muted)' }}>{m.por_nome || '—'} · {fmtData(m.em)}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {etiqueta && <EtiquetasPat itens={[item]} nomeLocal={base.nomeLocal} onFechar={() => setEtiqueta(false)} onImpresso={carregar} />}
      {visor != null && <Visualizador fotos={item.fotos.map((f) => urls[f.storage_path]).filter(Boolean)} inicio={visor} onFechar={() => setVisor(null)} />}
    </div>
  )
}

/** Atalho do dia a dia: só lugar, com quem, situação e por quê. */
function MudarLugar({ base, item, onFechar, onSalvo }: { base: BasePat; item: ItemPat; onFechar: () => void; onSalvo: () => void }) {
  const [local, setLocal] = useState(item.local_id || '')
  const [tecnico, setTecnico] = useState(item.local_tecnico || '')
  const [responsavel, setResponsavel] = useState(item.responsavel || '')
  const [situacao, setSituacao] = useState<Situacao>(item.situacao)
  const [motivo, setMotivo] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const salvar = async () => {
    if (!local) { setErro('Escolha onde está agora.'); return }
    setSalvando(true)
    setErro(null)
    try {
      await api(`/api/patrimonio/${item.id}`, { method: 'PATCH', body: { form: { ...formDoItem(item), local_id: local, local_tecnico: tecnico, responsavel, situacao }, motivo } })
      onSalvo()
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)) } finally { setSalvando(false) }
  }

  return (
    <section style={{ ...SECAO, border: `1.5px solid ${COR_PAT}` }}>
      <h2 style={{ ...TITULO_SECAO, display: 'flex', alignItems: 'center', gap: 6 }}><Truck size={16} /> Mudar de lugar</h2>
      <SeletorLocal locais={base.locais} local={local} tecnico={tecnico} onChange={(l, t) => { setLocal(l); setTecnico(t) }} onLocalCriado={base.recarregar} />
      <div>
        <label style={ROTULO}>Com quem fica</label>
        <input value={responsavel} onChange={(e) => setResponsavel(e.target.value.slice(0, 120))} placeholder="Pessoa responsável (opcional)" style={INP} />
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {SITUACOES.map((s) => (
          <button key={s} type="button" aria-pressed={situacao === s} onClick={() => setSituacao(s)} style={{
            padding: '7px 12px', borderRadius: 8, fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
            border: '1.5px solid ' + (situacao === s ? COR_PAT : 'var(--portal-border)'), background: situacao === s ? COR_PAT : 'var(--portal-bg-card)', color: situacao === s ? '#fff' : 'var(--portal-text)',
          }}>{ROTULO_SITUACAO[s]}</button>
        ))}
      </div>
      <div>
        <label style={ROTULO}>Por quê?</label>
        <input value={motivo} onChange={(e) => setMotivo(e.target.value.slice(0, 500))} placeholder="Ex.: emprestado pro Gabriel usar na OS 812 (opcional)" style={INP} />
      </div>
      {erro && <Aviso>{erro}</Aviso>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={salvar} disabled={salvando} style={botao(COR_PAT, { desab: salvando })}>{salvando ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Truck size={15} />} Registrar mudança</button>
        <button type="button" onClick={onFechar} style={botao('#52525B', { contorno: true })}>Cancelar</button>
      </div>
    </section>
  )
}
