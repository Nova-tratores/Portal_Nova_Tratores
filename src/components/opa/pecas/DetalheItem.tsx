'use client'
// Detalhe de uma peça não identificada: fotos (tela cheia com zoom), edição,
// aplicações, ações rápidas de status, etiqueta e histórico. Usado na fila do
// setor, na visão geral (janela) e na página do QR (/opa/pecas/<código>).
// Quem não é do setor de peças vê tudo só para leitura.

import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Camera, ChevronLeft, ChevronRight, History, Loader2, MapPin, Printer, RotateCcw, Save, Trash2, X, ZoomIn, ZoomOut } from 'lucide-react'
import {
  adicionarFotos, atualizarItem, buscarItem, definirAplicacoes, excluirItem, listarHistorico,
  nomesUsuarios, type CamposEditaveis,
} from '@/lib/opa-pecas/db'
import { comprimir, enviarFoto, mensagemErro, urlsAssinadas } from '@/lib/opa-pecas/fotos'
import { codigoDefinitivo, nomeDoItem, camposFaltando, ehFinal, fmtDataHora, fmtPreco, lerPreco, precoParaCampo, textoLocal } from '@/lib/opa-pecas/regras'
import { ROTULO_QUALIDADE, ROTULO_STATUS, type Aplicacao, type Historico, type Item, type Qualidade, type Status } from '@/lib/opa-pecas/tipos'
import { CampoPreco, EditorAplicacoes, SeletorLocal, SeletorQualidade, SeletorQuantidade } from './Campos'
import FasesPeca from './FasesPeca'
import Impressao from './Impressao'
import { CodigoPeca, Aviso, botao, INP, LARANJA, ROTULO, SECAO, SeloQualidade, SeloStatus, TITULO_SECAO, useMiniaturas, useTelaLarga, type Base } from './comum'

interface Form {
  descricao: string
  codigo_fabricante: string
  quantidade: string
  qualidade: Qualidade
  preco: string
  nao_identificavel: boolean
  observacoes: string
  local: string
  tecnico: string
}

function formDe(i: Item): Form {
  return {
    descricao: i.descricao || '', codigo_fabricante: i.codigo_fabricante || '',
    quantidade: String(i.quantidade), qualidade: i.qualidade,
    preco: precoParaCampo(i.preco_sugerido),
    nao_identificavel: i.nao_identificavel, observacoes: i.observacoes || '',
    local: i.local_id || '', tecnico: i.local_tecnico || '',
  }
}

/** Só o que mudou em relação ao item (o que vai para a RPC). */
function diferencas(i: Item, f: Form): { dados: CamposEditaveis; erro?: string } {
  const d: CamposEditaveis = {}
  const t = (s: string) => s.trim()
  if (t(f.descricao) !== (i.descricao || '')) d.descricao = t(f.descricao) || null
  if (t(f.codigo_fabricante) !== (i.codigo_fabricante || '')) d.codigo_fabricante = t(f.codigo_fabricante) || null
  if (t(f.observacoes) !== (i.observacoes || '')) d.observacoes = t(f.observacoes) || null
  if (f.qualidade !== i.qualidade) d.qualidade = f.qualidade
  if (f.nao_identificavel !== i.nao_identificavel) d.nao_identificavel = f.nao_identificavel
  if (f.local !== (i.local_id || '') || f.tecnico !== (i.local_tecnico || '')) { d.local_id = f.local || null; d.local_tecnico = f.tecnico || null }
  const q = parseInt(f.quantidade, 10)
  if (!Number.isFinite(q) || q < 1) return { dados: d, erro: 'Quantidade inválida.' }
  if (q !== i.quantidade) d.quantidade = q
  const p = lerPreco(f.preco)
  if (p != null && Number.isNaN(p)) return { dados: d, erro: 'Preço inválido. Use, por exemplo, 150,00.' }
  if (p !== i.preco_sugerido) d.preco_sugerido = p
  return { dados: d }
}

const COLUNA: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }

export default function DetalheItem({ item: inicial, base, onMudou }: {
  item: Item
  base: Base
  onMudou?: (item: Item | null) => void
}) {
  const [item, setItem] = useState(inicial)
  const [form, setForm] = useState<Form>(() => formDe(inicial))
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [visor, setVisor] = useState<number | null>(null)
  const [imprimindo, setImprimindo] = useState(false)
  const [historico, setHistorico] = useState<Historico[] | null>(null)
  const [usuarios, setUsuarios] = useState<Record<string, string>>({})
  const fotoRef = useRef<HTMLInputElement>(null)
  const larga = useTelaLarga()

  const gerir = base.podeGerir
  const final = ehFinal(item.status)
  const editavel = gerir && !final
  const minis = useMiniaturas(item.fotos.map((f) => f.storage_path))

  useEffect(() => {
    let vivo = true
    urlsAssinadas(item.fotos.map((f) => f.storage_path)).then((r) => { if (vivo) setUrls(r) }).catch(() => null)
    nomesUsuarios([item.criado_por, item.atualizado_por, item.encerrado_por, item.decidido_por, item.verificado_por]).then((r) => { if (vivo) setUsuarios(r) })
    return () => { vivo = false }
  }, [item])

  const { dados: mudancas, erro: erroForm } = useMemo(() => diferencas(item, form), [item, form])
  const sujo = Object.keys(mudancas).length > 0

  const recarregar = async (msg?: string) => {
    const novo = await buscarItem({ id: item.id })
    if (novo) { setItem(novo); setForm(formDe(novo)) }
    if (historico) setHistorico(null)
    onMudou?.(novo)
    if (msg) setOk(msg)
  }

  const executar = async (rotulo: string, fn: () => Promise<unknown>, msg?: string) => {
    setOcupado(rotulo); setErro(null); setOk(null)
    try {
      await fn()
      await recarregar(msg)
      return true
    } catch (e) {
      setErro(mensagemErro(e))
      return false
    } finally {
      setOcupado(null)
    }
  }

  const salvarForm = async () => {
    if (erroForm) { setErro(erroForm); return false }
    if (!sujo) return true
    return executar('salvar', () => atualizarItem(item.id, mudancas), 'Alterações salvas.')
  }

  const salvarAplicacoes = (lista: Aplicacao[]) =>
    executar('aplicacoes', () => definirAplicacoes(item.id, lista))

  const enviarNovasFotos = async (lista: FileList | null) => {
    const arquivos = Array.from(lista || [])
    if (!arquivos.length || !base.userId) return
    await executar('fotos', async () => {
      const paths: string[] = []
      for (const a of arquivos) paths.push(await enviarFoto(base.userId!, await comprimir(a)))
      await adicionarFotos(item.id, paths)
    }, 'Fotos adicionadas.')
  }

  const excluir = async () => {
    if (!confirm(`Excluir ${nomeDoItem(item.codigo)}? Ele sai das listas (o histórico fica guardado).`)) return
    setOcupado('excluir'); setErro(null)
    try { await excluirItem(item.id); onMudou?.(null) } catch (e) { setErro(mensagemErro(e)) } finally { setOcupado(null) }
  }

  const abrirHistorico = async () => {
    try {
      const h = await listarHistorico(item.id)
      setUsuarios(await nomesUsuarios(h.map((x) => x.usuario)))
      setHistorico(h)
    } catch (e) { setErro(mensagemErro(e)) }
  }

  const campo = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const faltando = camposFaltando(item)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <CodigoPeca codigo={item.codigo} tamanho={22} />
        <SeloStatus status={item.status} />
        <SeloQualidade qualidade={item.qualidade} />
        {item.local_id && <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: '#FFF7ED', color: '#9A3412', display: 'inline-flex', alignItems: 'center', gap: 4 }}><MapPin size={12} /> {textoLocal(item, base.nomesLocais)}</span>}
        {item.nao_identificavel && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: '#F3F4F6', color: '#4B5563' }}>Não identificável</span>}
      </div>
      <div style={{ fontSize: 12, color: 'var(--portal-text-muted)', marginTop: -10 }}>
        Criado por {usuarios[item.criado_por] || '…'} em {fmtDataHora(item.criado_em)}
        {item.atualizado_por && item.atualizado_em !== item.criado_em && <> · alterado por {usuarios[item.atualizado_por] || '…'} em {fmtDataHora(item.atualizado_em)}</>}
        {!codigoDefinitivo(item.codigo) ? <> · código e etiqueta saem no Destino</>
          : item.etiqueta_impressa_em ? <> · etiqueta gerada em {fmtDataHora(item.etiqueta_impressa_em)}</> : <> · <b style={{ color: '#B45309' }}>etiqueta pendente</b></>}
      </div>

      {erro && <Aviso>{erro}</Aviso>}
      {ok && !erro && <Aviso tipo="ok">{ok}</Aviso>}

      {/* 2 colunas no PC (fotos + localização | status + dados), 1 no celular */}
      <div style={larga ? { display: 'grid', gridTemplateColumns: 'minmax(0, 5fr) minmax(0, 7fr)', gap: 16, alignItems: 'start' } : COLUNA}>
      <div style={COLUNA}>
      <section style={SECAO}>
      <h2 style={TITULO_SECAO}>Fotos ({item.fotos.length})</h2>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${larga ? 96 : 84}px, 1fr))`, gap: 8 }}>
        {item.fotos.map((f, i) => (
          <button key={f.id} type="button" onClick={() => setVisor(i)} style={{ aspectRatio: '1', width: '100%', padding: 0, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--portal-border)', background: 'var(--portal-bg-secondary)', cursor: 'zoom-in' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {(minis[f.storage_path] || urls[f.storage_path]) && <img src={minis[f.storage_path] || urls[f.storage_path]} alt={`Foto ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
          </button>
        ))}
        {(gerir || item.criado_por === base.userId) && !final && (
          <>
            <input ref={fotoRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={(e) => { enviarNovasFotos(e.target.files); e.target.value = '' }} />
            <button type="button" onClick={() => fotoRef.current?.click()} disabled={!!ocupado} style={{ aspectRatio: '1', width: '100%', borderRadius: 10, border: `2px dashed ${LARANJA}`, background: '#FFF7ED', color: '#9A3412', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, fontFamily: 'inherit' }}>
              {ocupado === 'fotos' ? <Loader2 size={22} style={{ animation: 'spin 1s linear infinite' }} /> : <Camera size={22} />} Mais foto
            </button>
          </>
        )}
      </div>
      </section>

      <section style={SECAO}>
        <h2 style={TITULO_SECAO}>Localização</h2>
        <SeletorLocal compacto locais={base.locais} local={form.local} tecnico={form.tecnico} disabled={!gerir}
          onChange={(l, t) => setForm((f) => ({ ...f, local: l, tecnico: t }))} />
      </section>
      </div>

      <div style={COLUNA}>
      {/* Cadastro incompleto */}
      {faltando.length > 0 && (
        <Aviso tipo="info"><AlertTriangle size={14} style={{ verticalAlign: -2 }} /> Cadastro incompleto — falta: {faltando.join(', ')}.</Aviso>
      )}

      {/* Fases: cada uma mostra o que foi registrado nela, na ordem */}
      <section style={SECAO}>
        <h2 style={TITULO_SECAO}>Fases da peça</h2>
        <FasesPeca item={item} base={base} usuarios={usuarios} linkEtapa />
      </section>

      {/* Dados */}
      <section style={SECAO}>
      <h2 style={TITULO_SECAO}>Dados da peça</h2>
      <div style={{ display: 'grid', gridTemplateColumns: larga ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)', gap: 14 }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={ROTULO}>Descrição</label>
          <textarea value={form.descricao} onChange={campo('descricao')} disabled={!editavel} rows={2} placeholder="O que é a peça" style={{ ...INP, resize: 'vertical' }} />
        </div>
        <div>
          <label style={ROTULO}>Código já existente</label>
          <input value={form.codigo_fabricante} onChange={campo('codigo_fabricante')} disabled={!editavel} placeholder="Part number" style={INP} />
        </div>
        <div>
          <label style={ROTULO}>Preço sugerido</label>
          <CampoPreco valor={form.preco} onChange={(v) => setForm((f) => ({ ...f, preco: v }))} disabled={!editavel} />
          {item.preco_sugerido != null && item.quantidade > 1 && <div style={{ fontSize: 12, color: 'var(--portal-text-muted)', marginTop: 4 }}>Total: {fmtPreco(item.preco_sugerido * item.quantidade)}</div>}
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={ROTULO}>Quantidade</label>
          <SeletorQuantidade valor={parseInt(form.quantidade, 10) || 1} disabled={!editavel} onChange={(n) => setForm((f) => ({ ...f, quantidade: String(n) }))} />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={ROTULO}>Estado da peça</label>
          <SeletorQualidade valor={form.qualidade} disabled={!editavel} onChange={(q) => setForm((f) => ({ ...f, qualidade: q }))} />
        </div>
        <label style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--portal-text)', cursor: editavel ? 'pointer' : 'default' }}>
          <input type="checkbox" checked={form.nao_identificavel} disabled={!editavel} onChange={(e) => setForm((f) => ({ ...f, nao_identificavel: e.target.checked }))} style={{ width: 18, height: 18 }} />
          Não identificável <span style={{ fontSize: 12, color: 'var(--portal-text-muted)' }}>(segue o fluxo sem descrição/aplicação — normalmente para descarte)</span>
        </label>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={ROTULO}>Observações</label>
          <textarea value={form.observacoes} onChange={campo('observacoes')} disabled={!gerir} rows={2} style={{ ...INP, resize: 'vertical' }} />
        </div>
      </div>
      </section>

      {gerir && sujo && (
        <div style={{ display: 'flex', gap: 8, position: 'sticky', bottom: 0, zIndex: 2, padding: '10px 0', background: 'var(--portal-bg-card)' }}>
          <button onClick={salvarForm} disabled={!!ocupado} style={botao(LARANJA, { desab: !!ocupado })}>
            {ocupado === 'salvar' ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={15} />} Salvar alterações
          </button>
          <button onClick={() => setForm(formDe(item))} style={botao('#52525B', { contorno: true })}><RotateCcw size={14} /> Desfazer</button>
        </div>
      )}

      {/* Aplicações */}
      <section style={SECAO}>
        <h2 style={TITULO_SECAO}>Aplicação</h2>
        <EditorAplicacoes tipos={base.tipos} marcas={base.marcas} valor={item.aplicacoes} disabled={!editavel}
          ocupado={!!ocupado} onChange={salvarAplicacoes} />
      </section>
      </div>
      </div>

      {/* Rodapé */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 12, borderTop: '1px solid var(--portal-border)' }}>
        {codigoDefinitivo(item.codigo) && <button type="button" onClick={() => setImprimindo(true)} style={botao('#111827')}><Printer size={15} /> {item.etiqueta_impressa_em ? 'Reimprimir etiqueta' : 'Gerar etiqueta'}</button>}
        <button onClick={() => (historico ? setHistorico(null) : abrirHistorico())} style={botao('#52525B', { contorno: true })}><History size={15} /> Histórico</button>
        <div style={{ flex: 1 }} />
        {gerir && <button onClick={excluir} disabled={!!ocupado} style={botao('#DC2626', { contorno: true, desab: !!ocupado })}><Trash2 size={14} /> Excluir</button>}
      </div>

      {historico && (
        <div style={{ borderRadius: 12, border: '1px solid var(--portal-border)', overflow: 'hidden' }}>
          {historico.length === 0 && <div style={{ padding: 12, fontSize: 13, color: 'var(--portal-text-muted)' }}>Sem registros.</div>}
          {historico.map((h) => (
            <div key={h.id} style={{ padding: '9px 12px', borderBottom: '1px solid var(--portal-border)', fontSize: 13, color: 'var(--portal-text)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ color: 'var(--portal-text-muted)', minWidth: 120 }}>{fmtDataHora(h.em)}</span>
              <span style={{ fontWeight: 700, minWidth: 110 }}>{(h.usuario && usuarios[h.usuario]) || '—'}</span>
              <span style={{ flex: 1 }}>{descreverHistorico(h)}</span>
            </div>
          ))}
        </div>
      )}

      {imprimindo && (
        <Impressao itens={[{ id: item.id, jaGerada: !!item.etiqueta_impressa_em, token: item.token_publico, codigo: item.codigo, descricao: item.descricao, quantidade: item.quantidade, local: textoLocal(item, base.nomesLocais) }]}
          onFechar={() => setImprimindo(false)} onImpresso={() => recarregar()} />
      )}
      {visor != null && <Visualizador fotos={item.fotos.map((f) => urls[f.storage_path]).filter(Boolean)} inicio={visor} onFechar={() => setVisor(null)} />}
    </div>
  )
}

function rotuloValor(campo: Historico['campo'], v: string | null): string {
  if (v == null || v === '') return '—'
  if (campo === 'status' || campo === 'criacao' || campo === 'exclusao') return ROTULO_STATUS[v as Status] || v
  if (campo === 'qualidade') return ROTULO_QUALIDADE[v as Qualidade] || v
  if (campo === 'preco') return fmtPreco(Number(v))
  if (campo === 'localizacao') return v
  return v
}

function descreverHistorico(h: Historico): string {
  const de = rotuloValor(h.campo, h.de)
  const para = rotuloValor(h.campo, h.para)
  switch (h.campo) {
    case 'criacao': return 'Cadastrou o item'
    case 'exclusao': return `Excluiu o item (estava ${de})`
    case 'status': return `Status: ${de} → ${para}${h.motivo ? ` (motivo: ${h.motivo})` : ''}`
    case 'qualidade': return `Qualidade: ${de} → ${para}`
    case 'preco': return `Preço: ${de} → ${para}`
    case 'codigo': return h.de && !codigoDefinitivo(h.de) ? `Código gerado: ${para}` : `Código: ${de} → ${para}`
    case 'localizacao': return `Localização: ${de} → ${para}`
  }
}

/** Fotos em tela cheia com zoom (botões, duplo toque) e rolagem para olhar os detalhes. */
export function Visualizador({ fotos, inicio, onFechar }: { fotos: string[]; inicio: number; onFechar: () => void }) {
  const [i, setI] = useState(Math.min(inicio, Math.max(0, fotos.length - 1)))
  const [zoom, setZoom] = useState(1)
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFechar()
      if (e.key === 'ArrowRight') { setI((x) => (x + 1) % fotos.length); setZoom(1) }
      if (e.key === 'ArrowLeft') { setI((x) => (x - 1 + fotos.length) % fotos.length); setZoom(1) }
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [fotos.length, onFechar])
  if (!fotos.length) return null
  const btn: React.CSSProperties = { width: 44, height: 44, borderRadius: 22, border: 'none', background: 'rgba(255,255,255,.15)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 20000, background: 'rgba(0,0,0,.94)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 10, color: '#fff' }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>{i + 1} / {fotos.length}</span>
        <div style={{ flex: 1 }} />
        <button aria-label="Diminuir zoom" onClick={() => setZoom((z) => Math.max(1, z - 1))} style={btn}><ZoomOut size={20} /></button>
        <button aria-label="Aumentar zoom" onClick={() => setZoom((z) => Math.min(5, z + 1))} style={btn}><ZoomIn size={20} /></button>
        <button aria-label="Fechar" onClick={onFechar} style={btn}><X size={22} /></button>
      </div>
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', alignItems: zoom === 1 ? 'center' : 'flex-start', justifyContent: zoom === 1 ? 'center' : 'flex-start', touchAction: 'pan-x pan-y pinch-zoom' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={fotos[i]} alt="" onDoubleClick={() => setZoom((z) => (z === 1 ? 2.5 : 1))}
          style={zoom === 1 ? { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' } : { width: `${zoom * 100}%`, maxWidth: 'none' }} />
      </div>
      {fotos.length > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 16, padding: 12 }}>
          <button aria-label="Anterior" onClick={() => { setI((x) => (x - 1 + fotos.length) % fotos.length); setZoom(1) }} style={btn}><ChevronLeft size={24} /></button>
          <button aria-label="Próxima" onClick={() => { setI((x) => (x + 1) % fotos.length); setZoom(1) }} style={btn}><ChevronRight size={24} /></button>
        </div>
      )}
    </div>
  )
}

