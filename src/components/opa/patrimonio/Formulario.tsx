'use client'
// Formulário do Patrimônio Loja — cadastrar (fotos sobem na hora) e editar.
// Seções: fotos · o que é · estado e situação · onde está e com quem ·
// valores e compra · tags e observações. Ao editar, se mudar o lugar, a mão ou
// a situação, pede o motivo (vai para o histórico "por onde passou").

import { useRef, useState } from 'react'
import { Camera, Check, ImagePlus, Loader2, Save, Tag, X } from 'lucide-react'
import { comprimir, enviarFoto, mensagemErro } from '@/lib/opa-pecas/fotos'
import { BUCKET_PATRIMONIO } from '@/lib/patrimonio/fotos-regra'
import {
  ESTADOS, FORM_VAZIO, INFO_ESTADO, juntarTags, mudouOnde, ROTULO_SITUACAO, SITUACOES, validarForm,
  type DadosForm, type ItemPat,
} from '@/lib/patrimonio/tipos'
import { SeletorLocal } from '../pecas/Campos'
import { Aviso, botao, INP, ROTULO, SECAO, TITULO_SECAO, useTelaLarga } from '../pecas/comum'
import { api, COR_PAT, type BasePat } from './comum'

const MAX_FOTOS = 8

interface FotoLocal { id: string; preview: string; arquivo: File; estado: 'enviando' | 'ok' | 'erro'; path?: string; erro?: string }

export default function Formulario({ base, item, inicial, onSalvo, onCancelar }: {
  base: BasePat
  /** editar (sem = cadastrar) */
  item?: ItemPat
  inicial: DadosForm
  onSalvo: (item: ItemPat) => void
  onCancelar?: () => void
}) {
  const larga = useTelaLarga()
  const camRef = useRef<HTMLInputElement>(null)
  const galRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState<DadosForm>(inicial)
  const [fotos, setFotos] = useState<FotoLocal[]>([])
  const [novaTag, setNovaTag] = useState('')
  const [motivo, setMotivo] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const muda = <K extends keyof DadosForm>(k: K, v: DadosForm[K]) => setForm((f) => ({ ...f, [k]: v }))

  // ── fotos (só no cadastro; na ficha elas são trocadas lá) ──
  const processar = async (f: FotoLocal) => {
    try {
      const path = await enviarFoto(base.userId!, await comprimir(f.arquivo), BUCKET_PATRIMONIO)
      setFotos((fs) => fs.map((x) => (x.id === f.id ? { ...x, estado: 'ok', path } : x)))
    } catch (e) {
      setFotos((fs) => fs.map((x) => (x.id === f.id ? { ...x, estado: 'erro', erro: mensagemErro(e) } : x)))
    }
  }
  const adicionarFotos = (lista: FileList | null) => {
    const novas = Array.from(lista || []).filter((a) => a.type.startsWith('image/') || a.type === '').slice(0, MAX_FOTOS - fotos.length)
      .map<FotoLocal>((arquivo) => ({ id: crypto.randomUUID(), arquivo, preview: URL.createObjectURL(arquivo), estado: 'enviando' }))
    if (!novas.length) return
    setFotos((fs) => [...fs, ...novas])
    novas.forEach(processar)
  }
  const tirarFoto = (id: string) => setFotos((fs) => { const f = fs.find((x) => x.id === id); if (f) URL.revokeObjectURL(f.preview); return fs.filter((x) => x.id !== id) })

  const localEscolhido = base.locais.find((l) => l.id === form.local_id)
  const faltaTecnico = !!localEscolhido?.exige_tecnico && !form.local_tecnico
  const { erros } = validarForm(form)
  const faltas = [...erros, ...(faltaTecnico ? ['o técnico do box'] : [])]
  const enviando = fotos.some((f) => f.estado === 'enviando')
  const mudouLugar = !!item && mudouOnde(
    { local_id: item.local_id, local_tecnico: item.local_tecnico, responsavel: item.responsavel, situacao: item.situacao },
    { local_id: form.local_id || null, local_tecnico: form.local_tecnico || null, responsavel: form.responsavel || null, situacao: form.situacao },
  )

  const salvar = async () => {
    if (faltas.length) { setErro(`Falta: ${faltas.join(', ')}.`); return }
    setSalvando(true)
    setErro(null)
    try {
      const r = item
        ? await api<{ item: ItemPat }>(`/api/patrimonio/${item.id}`, { method: 'PATCH', body: { form, motivo } })
        : await api<{ item: ItemPat }>('/api/patrimonio', { method: 'POST', body: { form, fotos: fotos.filter((f) => f.estado === 'ok').map((f) => f.path) } })
      onSalvo(r.item)
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setSalvando(false)
    }
  }

  const grade: React.CSSProperties = { display: 'grid', gridTemplateColumns: larga ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)', gap: 12 }
  const opcional = <span style={{ fontWeight: 600, color: 'var(--portal-text-muted)' }}> (opcional)</span>
  const obrig = <span style={{ color: '#DC2626' }}> *</span>
  const sugestoesTag = base.tags.filter((t) => !form.tags.includes(t)).slice(0, 12)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {!item && (
        <section style={SECAO}>
          <h2 style={TITULO_SECAO}>Fotos</h2>
          <div style={{ fontSize: 12.5, color: 'var(--portal-text-muted)', marginTop: -6 }}>Do item inteiro e da plaquinha com marca, modelo e número de série.</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 8 }}>
            {fotos.map((f) => (
              <div key={f.id} style={{ position: 'relative', aspectRatio: '1', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--portal-border)' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: f.estado === 'ok' ? 1 : 0.5 }} />
                {f.estado === 'enviando' && <Loader2 size={20} style={{ position: 'absolute', inset: 0, margin: 'auto', animation: 'spin 1s linear infinite', color: '#fff' }} />}
                {f.estado === 'erro' && <span title={f.erro} style={{ position: 'absolute', left: 4, bottom: 4, fontSize: 10, fontWeight: 800, background: '#DC2626', color: '#fff', borderRadius: 5, padding: '1px 5px' }}>erro</span>}
                <button type="button" aria-label="Tirar foto" onClick={() => tirarFoto(f.id)} style={{ position: 'absolute', top: 4, right: 4, width: 24, height: 24, borderRadius: 12, border: 'none', background: 'rgba(0,0,0,.6)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={14} /></button>
              </div>
            ))}
            {fotos.length < MAX_FOTOS && (
              <>
                <button type="button" onClick={() => camRef.current?.click()} style={{ ...BOTAO_FOTO, borderColor: COR_PAT, color: COR_PAT }}><Camera size={22} /> Câmera</button>
                <button type="button" onClick={() => galRef.current?.click()} style={BOTAO_FOTO}><ImagePlus size={22} /> Galeria</button>
              </>
            )}
          </div>
          <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { adicionarFotos(e.target.files); e.target.value = '' }} />
          <input ref={galRef} type="file" accept="image/*" multiple hidden onChange={(e) => { adicionarFotos(e.target.files); e.target.value = '' }} />
        </section>
      )}

      <section style={SECAO}>
        <h2 style={TITULO_SECAO}>O que é</h2>
        <div style={grade}>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={ROTULO}>Descrição{obrig}</label>
            <input value={form.descricao} onChange={(e) => muda('descricao', e.target.value.slice(0, 300))} placeholder="Ex.: Parafusadeira a bateria 12V" style={INP} />
          </div>
          <div>
            <label style={ROTULO}>Categoria{opcional}</label>
            <input list="pat-categorias" value={form.categoria} onChange={(e) => muda('categoria', e.target.value.slice(0, 60))} placeholder="Ferramenta, Informática…" style={INP} />
            <datalist id="pat-categorias">{base.categorias.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
          <div>
            <label style={ROTULO}>Marca{opcional}</label>
            <input value={form.marca} onChange={(e) => muda('marca', e.target.value.slice(0, 80))} placeholder="Ex.: Bosch" style={INP} />
          </div>
          <div>
            <label style={ROTULO}>Modelo{opcional}</label>
            <input value={form.modelo} onChange={(e) => muda('modelo', e.target.value.slice(0, 120))} placeholder="Ex.: GSR 12V-15" style={INP} />
          </div>
          <div>
            <label style={ROTULO}>Nº de série{opcional}</label>
            <input value={form.numero_serie} onChange={(e) => muda('numero_serie', e.target.value.slice(0, 120))} placeholder="Da plaquinha" style={INP} />
          </div>
        </div>
      </section>

      <section style={SECAO}>
        <h2 style={TITULO_SECAO}>Estado</h2>
        <div role="radiogroup" aria-label="Estado" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8 }}>
          {ESTADOS.map((e) => {
            const info = INFO_ESTADO[e]
            const on = form.estado === e
            return (
              <button key={e} type="button" role="radio" aria-checked={on} onClick={() => muda('estado', e)} style={{
                textAlign: 'left', padding: '10px 12px', borderRadius: 10, fontFamily: 'inherit', cursor: 'pointer',
                border: '1.5px solid ' + (on ? info.cor : 'var(--portal-border)'), background: on ? info.fundo : 'var(--portal-bg-card)',
                boxShadow: on ? 'inset 4px 0 0 ' + info.cor : 'none',
              }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: on ? info.cor : 'var(--portal-text)' }}>{info.rotulo}</div>
                <div style={{ fontSize: 12, color: 'var(--portal-text-muted)', marginTop: 1 }}>{info.dica}</div>
              </button>
            )
          })}
        </div>
      </section>

      <section style={SECAO}>
        <h2 style={TITULO_SECAO}>Onde está e com quem</h2>
        <SeletorLocal locais={base.locais} local={form.local_id} tecnico={form.local_tecnico}
          onChange={(l, t) => setForm((f) => ({ ...f, local_id: l, local_tecnico: t }))} onLocalCriado={base.recarregar} />
        <div style={grade}>
          <div>
            <label style={ROTULO}>Com quem está{opcional}</label>
            <input value={form.responsavel} onChange={(e) => muda('responsavel', e.target.value.slice(0, 120))} placeholder="Pessoa responsável pelo item" style={INP} />
          </div>
          <div>
            <label style={ROTULO}>Situação</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {SITUACOES.map((s) => {
                const on = form.situacao === s
                return (
                  <button key={s} type="button" aria-pressed={on} onClick={() => muda('situacao', s)} style={{
                    padding: '8px 12px', borderRadius: 8, fontSize: 13.5, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    border: '1.5px solid ' + (on ? COR_PAT : 'var(--portal-border)'), background: on ? COR_PAT : 'var(--portal-bg-card)', color: on ? '#fff' : 'var(--portal-text)',
                  }}>{on && <Check size={13} />} {ROTULO_SITUACAO[s]}</button>
                )
              })}
            </div>
          </div>
        </div>
        {mudouLugar && (
          <div>
            <label style={ROTULO}>Por que mudou?{opcional}</label>
            <input value={motivo} onChange={(e) => setMotivo(e.target.value.slice(0, 500))} placeholder="Ex.: emprestado pro Gabriel usar na OS 812" style={INP} />
          </div>
        )}
      </section>

      <section style={SECAO}>
        <h2 style={TITULO_SECAO}>Valores e compra</h2>
        <div style={grade}>
          <div>
            <label style={ROTULO}>Valor hoje{opcional}</label>
            <input inputMode="decimal" value={form.valor_atual} onChange={(e) => muda('valor_atual', e.target.value.slice(0, 20))} placeholder="R$ quanto vale hoje" style={INP} />
          </div>
          <div>
            <label style={ROTULO}>Valor pago na compra{opcional}</label>
            <input inputMode="decimal" value={form.valor_compra} onChange={(e) => muda('valor_compra', e.target.value.slice(0, 20))} placeholder="R$" style={INP} />
          </div>
          <div>
            <label style={ROTULO}>Data da compra{opcional}</label>
            <input type="date" value={form.data_compra} onChange={(e) => muda('data_compra', e.target.value)} style={INP} />
          </div>
          <div>
            <label style={ROTULO}>Garantia até{opcional}</label>
            <input type="date" value={form.garantia_ate} onChange={(e) => muda('garantia_ate', e.target.value)} style={INP} />
          </div>
          <div>
            <label style={ROTULO}>Fornecedor{opcional}</label>
            <input value={form.fornecedor} onChange={(e) => muda('fornecedor', e.target.value.slice(0, 160))} placeholder="Onde foi comprado" style={INP} />
          </div>
          <div>
            <label style={ROTULO}>Nota fiscal{opcional}</label>
            <input value={form.nota_fiscal} onChange={(e) => muda('nota_fiscal', e.target.value.slice(0, 80))} placeholder="Nº da NF" style={INP} />
          </div>
        </div>
      </section>

      <section style={SECAO}>
        <h2 style={TITULO_SECAO}>Tags e observações</h2>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {form.tags.map((t) => (
            <span key={t} style={CHIP_ON}>
              <Tag size={12} /> {t}
              <button type="button" aria-label={`Tirar ${t}`} onClick={() => muda('tags', form.tags.filter((x) => x !== t))} style={{ border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer', padding: 0, display: 'flex' }}><X size={13} /></button>
            </span>
          ))}
        </div>
        <input value={novaTag} onChange={(e) => setNovaTag(e.target.value)} placeholder="Escreva uma tag e Enter (ex.: tecnologia, oficina, empréstimo)"
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); muda('tags', juntarTags(form.tags, novaTag)); setNovaTag('') } }}
          onBlur={() => { if (novaTag.trim()) { muda('tags', juntarTags(form.tags, novaTag)); setNovaTag('') } }} style={INP} />
        {sugestoesTag.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {sugestoesTag.map((t) => <button key={t} type="button" onClick={() => muda('tags', juntarTags(form.tags, t))} style={CHIP_OFF}>+ {t}</button>)}
          </div>
        )}
        <div>
          <label style={ROTULO}>Observações{opcional}</label>
          <textarea value={form.observacoes} onChange={(e) => muda('observacoes', e.target.value.slice(0, 2000))} rows={3} style={{ ...INP, resize: 'vertical' }} />
        </div>
      </section>

      {erro && <Aviso>{erro}</Aviso>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" onClick={salvar} disabled={salvando || enviando || faltas.length > 0} style={botao(COR_PAT, { grande: true, desab: salvando || enviando || faltas.length > 0 })}>
          {salvando ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={18} />} {item ? 'Salvar alterações' : 'Cadastrar item'}
        </button>
        {onCancelar && <button type="button" onClick={onCancelar} style={botao('#52525B', { contorno: true })}>Cancelar</button>}
        {enviando && <span style={{ fontSize: 12.5, color: 'var(--portal-text-muted)' }}>Enviando fotos…</span>}
        {faltas.length > 0 && <span style={{ fontSize: 12.5, color: '#B45309', fontWeight: 600 }}>Falta: {faltas.join(', ')}</span>}
      </div>
    </div>
  )
}

export { FORM_VAZIO }

const BOTAO_FOTO: React.CSSProperties = {
  aspectRatio: '1', borderRadius: 10, border: '1.5px dashed var(--portal-border)', background: 'var(--portal-bg-secondary)',
  color: 'var(--portal-text-secondary)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
  fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
}
const CHIP_ON: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 9px', borderRadius: 999, fontSize: 12.5, fontWeight: 700, background: '#EEF2FF', color: COR_PAT, border: '1px solid #C7D2FE' }
const CHIP_OFF: React.CSSProperties = { padding: '4px 9px', borderRadius: 999, fontSize: 12, fontWeight: 600, background: 'var(--portal-bg-card)', color: 'var(--portal-text-secondary)', border: '1px dashed var(--portal-border)', cursor: 'pointer', fontFamily: 'inherit' }
