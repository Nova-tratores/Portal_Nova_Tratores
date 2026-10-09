'use client'
// Captação (etapa 1, sql/pni-11) no CELULAR — meta: menos de 30 s por item.
// Fotos (mín. 2) → onde achou → quantidade → qualidade → descrição → código
// existente (opcional) → Salvar → próximo item. Onde achou, quantidade,
// descrição e qualidade são obrigatórios; valor e aplicação ficam para a
// Verificação. Cada foto é comprimida e enviada assim que é tirada, então o
// "Salvar" só grava o item. O código definitivo e o QR saem na conclusão.

import Link from 'next/link'
import { useRef, useState } from 'react'
import { Camera, Check, FlaskConical, ImagePlus, Loader2, MapPin, RotateCcw, Save, X } from 'lucide-react'
import { criarItem } from '@/lib/opa-pecas/db'
import { comprimir, enviarFoto, mensagemErro } from '@/lib/opa-pecas/fotos'
import { nomeDoItem, textoLocal } from '@/lib/opa-pecas/regras'
import type { Qualidade } from '@/lib/opa-pecas/tipos'
import { SeletorLocal, SeletorQualidade, SeletorQuantidade } from './Campos'
import { Aviso, botao, INP, LARANJA, ROTULO, SECAO, TITULO_SECAO, useTelaLarga, type Base } from './comum'

const MIN_FOTOS = 2
const MAX_FOTOS = 12

// Só no `npm run dev`: fotos desenhadas para testar o fluxo sem câmera.
// O banco continua exigindo 2 fotos — estas são imagens de verdade.
const MODO_TESTE = process.env.NODE_ENV === 'development'

function fotoDeTeste(n: number): Promise<File> {
  const c = document.createElement('canvas')
  c.width = 800
  c.height = 600
  const ctx = c.getContext('2d')!
  ctx.fillStyle = ['#94a3b8', '#a8a29e', '#9ca3af'][n % 3]
  ctx.fillRect(0, 0, 800, 600)
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'center'
  ctx.font = 'bold 64px sans-serif'
  ctx.fillText(`FOTO TESTE ${n}`, 400, 290)
  ctx.font = '28px sans-serif'
  ctx.fillText(new Date().toLocaleString('pt-BR'), 400, 350)
  return new Promise((ok) => c.toBlob((b) => ok(new File([b!], `teste-${n}.jpg`, { type: 'image/jpeg' })), 'image/jpeg', 0.8))
}

interface FotoLocal {
  id: string
  arquivo: File
  preview: string
  estado: 'enviando' | 'ok' | 'erro'
  path?: string
  erro?: string
}

interface Form {
  quantidade: number
  qualidade: Qualidade
  local: string
  tecnico: string
  descricao: string
  codigoFab: string
}

const FORM_VAZIO: Form = {
  quantidade: 1, qualidade: 'nao_avaliada', local: '', tecnico: '', descricao: '', codigoFab: '',
}

export default function Captura({ userId, base }: { userId: string; base: Base }) {
  const larga = useTelaLarga()
  const camRef = useRef<HTMLInputElement>(null)
  const galRef = useRef<HTMLInputElement>(null)
  const [fotos, setFotos] = useState<FotoLocal[]>([])
  const [form, setForm] = useState<Form>(FORM_VAZIO)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [salvo, setSalvo] = useState<{ id: string; codigo: string; local: string } | null>(null)

  const muda = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))
  const atualizarFoto = (id: string, patch: Partial<FotoLocal>) =>
    setFotos((fs) => fs.map((f) => (f.id === id ? { ...f, ...patch } : f)))

  const processar = async (f: FotoLocal) => {
    atualizarFoto(f.id, { estado: 'enviando', erro: undefined })
    try {
      const path = await enviarFoto(userId, await comprimir(f.arquivo))
      atualizarFoto(f.id, { estado: 'ok', path })
    } catch (e) {
      atualizarFoto(f.id, { estado: 'erro', erro: mensagemErro(e) })
    }
  }

  const adicionarFotos = (lista: FileList | File[] | null) => {
    const novas = Array.from(lista || [])
      .filter((a) => a.type.startsWith('image/') || a.type === '')
      .slice(0, MAX_FOTOS - fotos.length)
      .map<FotoLocal>((arquivo) => ({ id: crypto.randomUUID(), arquivo, preview: URL.createObjectURL(arquivo), estado: 'enviando' }))
    if (novas.length === 0) return
    setFotos((fs) => [...fs, ...novas])
    novas.forEach(processar)
  }

  const removerFoto = (id: string) => setFotos((fs) => {
    const f = fs.find((x) => x.id === id)
    if (f) URL.revokeObjectURL(f.preview)
    return fs.filter((x) => x.id !== id)
  })

  const proximoItem = () => {
    fotos.forEach((f) => URL.revokeObjectURL(f.preview))
    setFotos([])
    // local e técnico ficam: a próxima peça costuma estar no mesmo lugar
    setForm((f) => ({ ...FORM_VAZIO, local: f.local, tecnico: f.tecnico }))
    setErro(null)
    setSalvo(null)
    if (!MODO_TESTE) camRef.current?.click()
  }

  const prontas = fotos.filter((f) => f.estado === 'ok')
  const enviando = fotos.some((f) => f.estado === 'enviando')
  const comErro = fotos.filter((f) => f.estado === 'erro')
  const localEscolhido = base.locais.find((l) => l.id === form.local)
  const faltaTecnico = !!localEscolhido?.exige_tecnico && !form.tecnico
  // obrigatórios da captação (o banco confere de novo em pni_criar_item)
  const faltando = [
    !form.local && 'onde achou',
    form.qualidade === 'nao_avaliada' && 'qualidade',
    !form.descricao.trim() && 'descrição',
  ].filter(Boolean) as string[]
  const podeSalvar = prontas.length >= MIN_FOTOS && !enviando && !salvando && !faltaTecnico && faltando.length === 0
  const tecnico = localEscolhido?.exige_tecnico ? form.tecnico : null

  const salvar = async () => {
    if (!podeSalvar) return
    setSalvando(true)
    setErro(null)
    try {
      const r = await criarItem({
        fotos: prontas.map((f) => f.path!), quantidade: form.quantidade, qualidade: form.qualidade,
        descricao: form.descricao.trim() || undefined, local: form.local, localTecnico: tecnico || undefined,
        codigoFabricante: form.codigoFab.trim() || undefined,
      })
      setSalvo({
        id: r.id, codigo: r.codigo,
        local: textoLocal({ local_id: form.local || null, local_tecnico: tecnico }, base.nomesLocais),
      })
    } catch (e) {
      setErro(mensagemErro(e))
    } finally {
      setSalvando(false)
    }
  }

  const inputsArquivo = (
    <>
      <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { adicionarFotos(e.target.files); e.target.value = '' }} />
      <input ref={galRef} type="file" accept="image/*" multiple hidden onChange={(e) => { adicionarFotos(e.target.files); e.target.value = '' }} />
    </>
  )

  // ── Depois de salvar ──
  if (salvo) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {inputsArquivo}
        <div style={{ padding: 18, borderRadius: 14, background: '#ECFDF5', border: '1px solid #A7F3D0', textAlign: 'center' }}>
          <div style={{ fontSize: 20, color: '#065F46', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}><Check size={20} /> Peça registrada</div>
          <div style={{ fontSize: 13, color: '#047857', marginTop: 2 }}>{nomeDoItem(salvo.codigo)[0].toUpperCase() + nomeDoItem(salvo.codigo).slice(1)}</div>
          {salvo.local && <div style={{ fontSize: 13.5, color: '#047857', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5 }}><MapPin size={14} /> {salvo.local}</div>}
        </div>
        <button type="button" onClick={proximoItem} style={{ ...botao(LARANJA, { grande: true }), width: '100%', padding: 18 }}>
          <Camera size={22} /> Próximo item
        </button>
        <p style={{ fontSize: 12.5, color: 'var(--portal-text-muted)', textAlign: 'center', margin: 0 }}>
          A peça segue para a <b>Verificação</b> (valor e aplicação). O código e o QR saem quando ela for concluída.{' '}
          <Link href={`/opa/pecas/${encodeURIComponent(salvo.codigo)}`} style={{ color: 'var(--portal-text-secondary)' }}>Abrir peça</Link>
        </p>
      </div>
    )
  }

  const coluna: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }

  // ── Formulário: 2 colunas no PC (fotos + local | dados), 1 no celular ──
  return (
    <div style={larga ? { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 16, alignItems: 'start' } : coluna}>
      {inputsArquivo}
      <div style={coluna}>
      <section style={SECAO}>
        <h2 style={TITULO_SECAO}>Fotos <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 600 }}>— {prontas.length} de no mínimo {MIN_FOTOS}, ângulos diferentes</span></h2>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${larga ? 110 : 92}px, 1fr))`, gap: 8 }}>
          {fotos.map((f, i) => (
            <div key={f.id} style={{ position: 'relative', aspectRatio: '1', borderRadius: 10, overflow: 'hidden', background: '#000', border: `2px solid ${f.estado === 'erro' ? '#DC2626' : f.estado === 'ok' ? '#10B981' : 'var(--portal-border)'}` }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.preview} alt={`Foto ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: f.estado === 'ok' ? 1 : 0.55 }} />
              <span style={{ position: 'absolute', left: 4, top: 4, background: 'rgba(0,0,0,.65)', color: '#fff', fontSize: 11, fontWeight: 800, borderRadius: 5, padding: '1px 6px' }}>{i + 1}</span>
              <button type="button" onClick={() => removerFoto(f.id)} aria-label="Remover foto" style={{ position: 'absolute', right: 4, top: 4, width: 26, height: 26, borderRadius: 7, border: 'none', background: 'rgba(0,0,0,.65)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={14} /></button>
              {f.estado === 'enviando' && <Loader2 size={26} color="#fff" style={{ position: 'absolute', inset: 0, margin: 'auto', animation: 'spin 1s linear infinite' }} />}
              {f.estado === 'erro' && (
                <button type="button" onClick={() => processar(f)} style={{ ...botao('#DC2626'), position: 'absolute', left: 4, right: 4, bottom: 4, padding: '5px 6px', fontSize: 11 }}>
                  <RotateCcw size={12} /> Reenviar
                </button>
              )}
            </div>
          ))}
          {fotos.length < MAX_FOTOS && (
            <button type="button" onClick={() => camRef.current?.click()} style={{ aspectRatio: '1', borderRadius: 10, border: `2px dashed ${LARANJA}`, background: '#FFF7ED', color: '#9A3412', fontWeight: 800, fontSize: 13, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, fontFamily: 'inherit' }}>
              <Camera size={26} /> {fotos.length < MIN_FOTOS ? `Foto ${fotos.length + 1}` : 'Mais uma'}
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 8 }}>
          <button type="button" onClick={() => galRef.current?.click()} style={{ background: 'none', border: 'none', color: 'var(--portal-text-secondary)', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
            <ImagePlus size={14} /> Escolher da galeria
          </button>
          {MODO_TESTE && (
            <button type="button" onClick={async () => adicionarFotos(await Promise.all([fotoDeTeste(fotos.length + 1), fotoDeTeste(fotos.length + 2)]))}
              style={{ background: 'none', border: 'none', color: '#7c3aed', fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
              <FlaskConical size={14} style={{ verticalAlign: -2 }} /> 2 fotos de teste (só no localhost)
            </button>
          )}
        </div>
        {comErro.length > 0 && (
          <Aviso acao={<button type="button" onClick={() => comErro.forEach(processar)} style={botao('#DC2626')}><RotateCcw size={14} /> Tentar de novo</button>}>
            {comErro.length === 1 ? 'Uma foto não foi enviada' : `${comErro.length} fotos não foram enviadas`}: {comErro[0].erro}
          </Aviso>
        )}
      </section>

      <section style={SECAO}>
        <h2 style={TITULO_SECAO}>Onde achou a peça? <span style={{ color: '#DC2626' }}>*</span></h2>
        <SeletorLocal locais={base.locais} local={form.local} tecnico={form.tecnico} onChange={(l, t) => setForm((f) => ({ ...f, local: l, tecnico: t }))} />
      </section>

      </div>

      <div style={coluna}>
      <section style={SECAO}>
        <h2 style={TITULO_SECAO}>A peça</h2>
        <div>
          <label style={ROTULO}>Quantidade</label>
          <SeletorQuantidade valor={form.quantidade} onChange={(n) => muda('quantidade', n)} />
        </div>
        <div>
          <label style={ROTULO}>Qualidade <span style={{ color: '#DC2626' }}>*</span></label>
          <SeletorQualidade valor={form.qualidade} onChange={(q) => muda('qualidade', q)} />
        </div>
        <div>
          <label style={ROTULO}>Descrição <span style={{ color: '#DC2626' }}>*</span></label>
          <textarea value={form.descricao} onChange={(e) => muda('descricao', e.target.value.slice(0, 500))} rows={2}
            placeholder="Ex.: engrenagem de câmbio" style={{ ...INP, resize: 'vertical', lineHeight: 1.5 }} />
        </div>
        <div>
          <label style={ROTULO}>Código existente da peça <span style={{ fontWeight: 600, color: 'var(--portal-text-muted)' }}>(se tiver)</span></label>
          <input value={form.codigoFab} onChange={(e) => muda('codigoFab', e.target.value.slice(0, 80))} placeholder="Part number gravado ou etiqueta antiga" style={INP} />
        </div>
      </section>

      {erro && (
        <Aviso acao={<button type="button" onClick={salvar} disabled={!podeSalvar} style={botao('#DC2626', { desab: !podeSalvar })}><RotateCcw size={14} /> Tentar de novo</button>}>
          {erro}
        </Aviso>
      )}

      <div style={larga ? {} : { position: 'sticky', bottom: 0, padding: '8px 0 12px', background: 'var(--portal-bg, transparent)', zIndex: 2 }}>
        <button type="button" onClick={salvar} disabled={!podeSalvar} style={{ ...botao(LARANJA, { grande: true, desab: !podeSalvar }), width: '100%', padding: 17, fontSize: 17 }}>
          {salvando ? <><Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} /> Salvando…</>
            : enviando ? <><Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} /> Enviando fotos…</>
              : prontas.length < MIN_FOTOS ? <><Camera size={20} /> Faltam {MIN_FOTOS - prontas.length} foto{MIN_FOTOS - prontas.length > 1 ? 's' : ''}</>
                : faltaTecnico ? <>Escolha o técnico do Box</>
                  : faltando.length ? <>Falta: {faltando.join(', ')}</>
                    : <><Save size={20} /> Salvar peça</>}
        </button>
      </div>
      </div>
    </div>
  )
}
