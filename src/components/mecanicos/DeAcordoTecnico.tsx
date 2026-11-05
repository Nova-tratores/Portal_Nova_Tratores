'use client'
// De acordo do técnico na comissão autorizada (05/11/2026): o gestor do pós-vendas imprime o documento, o técnico
// confere e assina "de acordo" — no papel (a folha assinada é fotografada e anexada) ou aqui na tela. Se não
// concordar, fica o motivo (o diretor e quem pediu recebem o aviso). SQL: sql/comissao-de-acordo-tecnico.sql.
import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { PedidoComissao } from '@/lib/mecanicos/lancamento-comissao-server'
import { aceitaCiencia, textoDeAcordo, validarCiencia, type CienciaForma } from '@/lib/mecanicos/de-acordo'
import { contaDoPagamento } from '@/lib/mecanicos/descontos-tecnico'
import CanvasAssinatura, { type CanvasAssinaturaRef } from '@/components/assinatura/CanvasAssinatura'
import { authHeaders } from '@/lib/auth/client'

const nomeProprio = (s: string) => s.toLowerCase().replace(/(^|\s)(\S)/g, (_, a: string, b: string) => a + b.toUpperCase()).replace(/\b(De|Da|Do|Dos|Das|E)\b/g, (m) => m.toLowerCase())
const quando = (s?: string | null) => s ? new Date(s).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''

async function abrirEmAba(buscar: () => Promise<string | null>) {
  const aba = window.open('', '_blank')
  try { const url = await buscar(); if (url) { if (aba) aba.location.href = url; else window.open(url, '_blank') } else aba?.close() } catch { aba?.close() }
}
/** Arquivo assinado guardado (folha do de acordo ou recibo). */
export function abrirAssinado(id: string, qual: 'ciencia' | 'recibo') {
  return abrirEmAba(async () => {
    const r = await fetch(`/api/mecanicos/lancamento-comissao/de-acordo?id=${id}&qual=${qual}`, { headers: await authHeaders(), cache: 'no-store' })
    const j = await r.json()
    if (!r.ok || !j.url) { alert(j.error || 'Não consegui abrir o arquivo'); return null }
    return j.url as string
  })
}
/** Documento para imprimir: 'ambos' = de acordo + recibo (páginas separadas). */
export function imprimirDoc(id: string, doc: 'autorizacao' | 'recibo' | 'ambos') {
  return abrirEmAba(async () => {
    const r = await fetch(`/api/mecanicos/lancamento-comissao/documento?id=${id}&doc=${doc}`, { headers: await authHeaders() })
    const html = await r.text()
    return URL.createObjectURL(new Blob([r.ok ? html : `<p style="font-family:Arial">${html}</p>`], { type: 'text/html' }))
  })
}

type RespostaPost = { error?: string; semTabela?: boolean; pastaRH?: { ok: boolean; erro?: string } | null }
async function postar(f: FormData): Promise<{ ok: boolean; j: RespostaPost }> {
  const r = await fetch('/api/mecanicos/lancamento-comissao/de-acordo', { method: 'POST', headers: await authHeaders(), body: f })
  return { ok: r.ok, j: await r.json().catch(() => ({})) }
}

/** Situação da cópia na pasta do funcionário (RH). Só aparece com o SQL do recibo rodado. */
function PastaRH({ p, qual, onFeito }: { p: PedidoComissao; qual: 'ciencia' | 'recibo'; onFeito: () => void }) {
  const [tentando, setTentando] = useState(false)
  const docId = qual === 'ciencia' ? p.ciencia_rh_doc_id : p.recibo_rh_doc_id
  const erro = qual === 'ciencia' ? p.ciencia_rh_erro : p.recibo_rh_erro
  if (docId === undefined) return null
  if (docId) return <span className="dat-rh ok"><i className="fas fa-folder-open" />Na pasta do funcionário (RH)</span>
  const tentar = async () => {
    setTentando(true)
    const f = new FormData(); f.set('id', p.id); f.set('acao', 'pasta_rh'); f.set('qual', qual)
    let j: RespostaPost
    try { j = (await postar(f)).j } catch { j = { pastaRH: { ok: false, erro: 'Sem conexão' } } }
    setTentando(false)
    if (!j.pastaRH?.ok) alert(`Não foi para a pasta do RH: ${j.pastaRH?.erro || j.error || 'erro'}`)
    window.dispatchEvent(new Event('comissao-decidida')); onFeito()
  }
  return <span className="dat-rh ruim" title={erro || ''}><i className="fas fa-folder" />{erro ? 'Não foi para a pasta do RH' : 'Ainda não está na pasta do RH'}<button type="button" disabled={tentando} onClick={() => { void tentar() }}>{tentando ? 'enviando…' : 'tentar de novo'}</button></span>
}

export default function DeAcordoTecnico({ p, onFeito }: { p: PedidoComissao; onFeito: () => void }) {
  const [modal, setModal] = useState<null | 'de_acordo' | 'contestou'>(null)
  const [enviandoRecibo, setEnviandoRecibo] = useState(false)
  const [erroRecibo, setErroRecibo] = useState<string | null>(null)
  if (!aceitaCiencia(p)) return null
  const st = p.ciencia_status || null
  // recibo só com o SQL dele rodado (sem ele a coluna nem vem)
  const temRecibo = p.recibo_em !== undefined
  const anexarRecibo = async (file: File | null | undefined) => {
    if (!file) return
    setEnviandoRecibo(true); setErroRecibo(null)
    const f = new FormData(); f.set('id', p.id); f.set('acao', 'recibo'); f.set('file', file)
    try {
      const { ok, j } = await postar(f)
      if (j.semTabela) setErroRecibo('Falta rodar o SQL sql/comissao-recibo-pasta-rh.sql no Supabase.')
      else if (!ok) setErroRecibo(j.error || 'Não foi possível anexar')
      else { if (j.pastaRH && !j.pastaRH.ok) setErroRecibo(`Recibo guardado no portal, mas não foi para a pasta do RH: ${j.pastaRH.erro}`); window.dispatchEvent(new Event('comissao-decidida')); onFeito() }
    } catch { setErroRecibo('Sem conexão — tente de novo') }
    setEnviandoRecibo(false)
  }
  return (
    <section className="dats">
      <style>{CSS}</style>
      <header className="dats-cab">
        <div><b>Documentos para o técnico assinar</b><small>Imprima, colha as assinaturas, escaneie e anexe aqui — vai para a pasta do funcionário no RH. A folha física vai para a pasta dele.</small></div>
        <button type="button" className="dat-bt forte" onClick={() => { void imprimirDoc(p.id, temRecibo ? 'ambos' : 'autorizacao') }}><i className="fas fa-print" />{temRecibo ? 'Imprimir de acordo + recibo' : 'Imprimir para assinar'}</button>
      </header>
      <div className={`dat ${st === 'de_acordo' ? 'ok' : st === 'contestou' ? 'ruim' : 'falta'}`}>
        <div className="dat-tx">
          <b><span className="dat-n">1</span><i className={`fas ${st === 'de_acordo' ? 'fa-circle-check' : st === 'contestou' ? 'fa-circle-exclamation' : 'fa-pen-nib'}`} />{st === 'de_acordo' ? 'De acordo assinado' : st === 'contestou' ? 'O técnico não concordou' : 'De acordo do técnico'}</b>
          {st === 'de_acordo' && <span>{nomeProprio(p.ciencia_nome || p.tecnico)} assinou {p.ciencia_forma === 'tela' ? 'na tela' : 'no papel'} · registrado em {quando(p.ciencia_em)}{p.ciencia_registrada_por ? ` por ${p.ciencia_registrada_por}` : ''}</span>}
          {st === 'contestou' && <span>“{p.ciencia_motivo}” · {quando(p.ciencia_em)}{p.ciencia_registrada_por ? ` por ${p.ciencia_registrada_por}` : ''}. O diretor e quem pediu foram avisados. Resolvido, registre o de acordo.</span>}
          {!st && <span>Ele confere as OS e os valores e assina que está <b>de acordo</b>.</span>}
          {st === 'de_acordo' && <PastaRH p={p} qual="ciencia" onFeito={onFeito} />}
        </div>
        <div className="dat-bts">
          {st !== 'de_acordo' && <button type="button" className="dat-bt forte" onClick={() => setModal('de_acordo')}><i className="fas fa-file-signature" />Registrar o de acordo</button>}
          {!st && <button type="button" className="dat-lk" onClick={() => setModal('contestou')}>O técnico não concordou</button>}
          {st === 'de_acordo' && p.ciencia_forma === 'papel' && <button type="button" className="dat-bt" onClick={() => { void abrirAssinado(p.id, 'ciencia') }}><i className="fas fa-image" />Ver folha assinada</button>}
          {st === 'de_acordo' && <button type="button" className="dat-bt" onClick={() => { void imprimirDoc(p.id, 'autorizacao') }}><i className="fas fa-file-lines" />Documento</button>}
        </div>
      </div>
      {temRecibo && (
        <div className={`dat ${p.recibo_em ? 'ok' : 'falta'}`}>
          <div className="dat-tx">
            <b><span className="dat-n">2</span><i className={`fas ${p.recibo_em ? 'fa-circle-check' : 'fa-receipt'}`} />{p.recibo_em ? 'Recibo assinado' : 'Recibo'}</b>
            {p.recibo_em ? <span>Anexado em {quando(p.recibo_em)}{p.recibo_registrado_por ? ` por ${p.recibo_registrado_por}` : ''}{p.recibo_arquivo_nome ? ` · ${p.recibo_arquivo_nome}` : ''}</span>
              : <span>Ele declara que <b>recebeu</b> o valor líquido da comissão. Anexe a foto ou o PDF do recibo assinado.</span>}
            {p.recibo_em && <PastaRH p={p} qual="recibo" onFeito={onFeito} />}
            {erroRecibo && <span className="dat-erro">{erroRecibo}</span>}
          </div>
          <div className="dat-bts">
            <label className={`dat-bt ${p.recibo_em ? '' : 'forte'}`}><i className="fas fa-camera" />{enviandoRecibo ? 'Enviando…' : p.recibo_em ? 'Trocar' : 'Tirar foto'}<input type="file" accept="image/*" capture="environment" hidden disabled={enviandoRecibo} onChange={(ev) => { void anexarRecibo(ev.target.files?.[0]); ev.target.value = '' }} /></label>
            {!p.recibo_em && <label className="dat-bt"><i className="fas fa-paperclip" />Escolher arquivo<input type="file" accept="image/*,application/pdf" hidden disabled={enviandoRecibo} onChange={(ev) => { void anexarRecibo(ev.target.files?.[0]); ev.target.value = '' }} /></label>}
            {p.recibo_em && <button type="button" className="dat-bt" onClick={() => { void abrirAssinado(p.id, 'recibo') }}><i className="fas fa-image" />Ver recibo assinado</button>}
            {!p.recibo_em && <button type="button" className="dat-lk" onClick={() => { void imprimirDoc(p.id, 'recibo') }}>imprimir só o recibo</button>}
          </div>
        </div>
      )}
      {modal && createPortal(<ModalDeAcordo p={p} modo={modal} fechar={() => setModal(null)} onFeito={() => { setModal(null); onFeito() }} />, document.body)}
    </section>
  )
}

function ModalDeAcordo({ p, modo, fechar, onFeito }: { p: PedidoComissao; modo: 'de_acordo' | 'contestou'; fechar: () => void; onFeito: () => void }) {
  const nomePadrao = nomeProprio(p.info?.nomeRh || p.tecnico)
  const [forma, setForma] = useState<CienciaForma>('papel')
  const [nome, setNome] = useState(nomePadrao)
  const [motivo, setMotivo] = useState('')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [assinou, setAssinou] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const assRef = useRef<CanvasAssinaturaRef>(null)
  const conta = contaDoPagamento(p.valor, p.descontos, !!p.info?.semCaixinha)
  const texto = textoDeAcordo({ nome: nome || nomePadrao, mes: p.mes, comissao: p.valor, liquido: conta.liquido, temDescontos: !!p.descontos?.length, pagamento: p.info?.pagamento })
  const falta = validarCiencia({ acao: modo, forma, temArquivo: !!arquivo, temAssinatura: assinou, nome, motivo })
  const enviar = async () => {
    setEnviando(true); setErro(null)
    try {
      const f = new FormData()
      f.set('id', p.id); f.set('acao', modo); f.set('forma', forma); f.set('nome', nome); f.set('motivo', motivo)
      if (modo === 'de_acordo' && forma === 'tela') f.set('assinatura', assRef.current?.png() || '')
      if (modo === 'de_acordo' && forma === 'papel' && arquivo) f.set('file', arquivo)
      const r = await fetch('/api/mecanicos/lancamento-comissao/de-acordo', { method: 'POST', headers: await authHeaders(), body: f })
      const j = await r.json().catch(() => ({}))
      if (j.semTabela) setErro('Falta rodar o SQL sql/comissao-de-acordo-tecnico.sql no Supabase.')
      else if (!r.ok) setErro(j.error || 'Não foi possível registrar')
      else { if (j.pastaRH && !j.pastaRH.ok) alert(`De acordo registrado, mas não foi para a pasta do RH: ${j.pastaRH.erro}. Dá para tentar de novo pelo botão no cartão.`); window.dispatchEvent(new Event('comissao-decidida')); onFeito() }
    } catch { setErro('Sem conexão — tente de novo') }
    setEnviando(false)
  }
  return (
    <div className="dat-fundo" onMouseDown={(ev) => { if (ev.target === ev.currentTarget) fechar() }}>
      <style>{CSS}</style>
      <div className="dat-m" role="dialog" aria-modal="true" aria-label={modo === 'contestou' ? 'O técnico não concordou' : 'Registrar o de acordo do técnico'}>
        <header><b>{modo === 'contestou' ? 'O técnico não concordou' : 'De acordo do técnico'}</b><button type="button" onClick={fechar} aria-label="Fechar"><i className="fas fa-xmark" /></button></header>
        <div className="dat-m-corpo">
          {modo === 'contestou' ? <>
            <p className="dat-m-sub">Fica registrado na comissão e o diretor e quem pediu recebem o aviso. Nada muda no RH.</p>
            <label className="dat-m-rot">O que o técnico disse<textarea value={motivo} onChange={(ev) => setMotivo(ev.target.value)} rows={4} placeholder="Ex.: diz que a OS 5231 foi dele sozinho e não dividida" autoFocus /></label>
          </> : <>
            <div className="dat-tabs">
              <button type="button" className={forma === 'papel' ? 'on' : ''} onClick={() => setForma('papel')}><i className="fas fa-print" />Assinou no papel</button>
              <button type="button" className={forma === 'tela' ? 'on' : ''} onClick={() => setForma('tela')}><i className="fas fa-signature" />Assinar aqui na tela</button>
            </div>
            <label className="dat-m-rot">Nome de quem assinou<input value={nome} onChange={(ev) => setNome(ev.target.value)} /></label>
            {forma === 'papel' ? <>
              <p className="dat-m-sub">Fotografe ou escaneie a folha impressa com a assinatura do técnico. Ela fica guardada junto da comissão.</p>
              <div className="dat-arq">
                <label className="dat-bt forte"><i className="fas fa-camera" />Tirar foto<input type="file" accept="image/*" capture="environment" hidden onChange={(ev) => setArquivo(ev.target.files?.[0] || null)} /></label>
                <label className="dat-bt"><i className="fas fa-paperclip" />Escolher arquivo<input type="file" accept="image/*,application/pdf" hidden onChange={(ev) => setArquivo(ev.target.files?.[0] || null)} /></label>
                {arquivo && <span className="dat-arq-n"><i className="fas fa-check" />{arquivo.name} · {(arquivo.size / 1024 / 1024).toFixed(1)} MB</span>}
              </div>
            </> : <>
              <p className="dat-texto">{texto}</p>
              <div className="dat-pad-cab"><span>Assinatura do técnico</span>{assinou && <button type="button" onClick={() => { assRef.current?.limpar(); setAssinou(false) }}>limpar</button>}</div>
              <div className="dat-pad"><CanvasAssinatura ref={assRef} temTraco={assinou} onTraco={setAssinou} altura={160} />{!assinou && <span>o técnico assina aqui com o dedo ou o mouse</span>}</div>
            </>}
          </>}
          {erro && <p className="dat-erro">{erro}</p>}
        </div>
        <footer>
          {falta && <small>{falta}</small>}
          <button type="button" className="dat-lk" onClick={fechar}>Cancelar</button>
          <button type="button" className="dat-bt forte" disabled={!!falta || enviando} onClick={() => { void enviar() }}>{enviando ? 'Gravando…' : modo === 'contestou' ? 'Registrar' : 'Registrar o de acordo'}</button>
        </footer>
      </div>
    </div>
  )
}

const CSS = `
.dats { grid-column: 1 / -1; margin: 0 22px 16px; display: flex; flex-direction: column; gap: 8px }
.dats-cab { display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap }
.dats-cab > div { display: flex; flex-direction: column; gap: 2px; flex: 1 1 300px } .dats-cab b { font-size: 14.5px; color: #0f172a } .dats-cab small { font-size: 12.5px; color: #64748b }
.dat-n { display: inline-grid; place-items: center; width: 20px; height: 20px; border-radius: 50%; background: #0f172a; color: #fefefe; font-size: 11.5px }
.dat-rh { display: inline-flex; gap: 6px; align-items: center; font-size: 12.5px; margin-top: 2px } .dat-rh.ok { color: #166534 } .dat-rh.ruim { color: #b45309 }
.dat-rh button { border: none; background: none; color: inherit; text-decoration: underline; cursor: pointer; font: inherit; font-size: 12.5px; padding: 0 }
.dat-erro { color: #991b1b; font-size: 12.5px }
.dat { border-radius: 12px; padding: 12px 14px; display: flex; gap: 14px; align-items: center; flex-wrap: wrap; border: 1px solid #fde68a; background: #fffbeb; color: #0f172a }
.dat.ok { border-color: #bbf7d0; background: #f0fdf4 } .dat.ruim { border-color: #fecaca; background: #fef2f2 }
.dat-tx { flex: 1 1 320px; display: flex; flex-direction: column; gap: 3px; font-size: 13.5px; color: #334155 }
.dat-tx > b { font-size: 14.5px; color: #0f172a; display: flex; align-items: center; gap: 8px } .dat-tx > b i { color: #b45309 } .dat.ok .dat-tx > b i { color: #16a34a } .dat.ruim .dat-tx > b i { color: #dc2626 }
.dat-bts { display: flex; gap: 8px; flex-wrap: wrap; align-items: center }
.dat-bt { display: inline-flex; align-items: center; gap: 7px; border: 1px solid #cbd5e1; background: #fefefe; color: #0f172a; border-radius: 999px; padding: 8px 14px; font: inherit; font-size: 13.5px; cursor: pointer; min-height: 38px }
.dat-bt:hover { border-color: #0f172a } .dat-bt.forte { background: #111111; color: #fefefe; border-color: #111111 } .dat-bt:disabled { opacity: .45; cursor: default }
.dat-lk { border: none; background: none; color: #475569; font: inherit; font-size: 13px; text-decoration: underline; cursor: pointer; padding: 6px }
.dat-fundo { position: fixed; inset: 0; background: rgba(15,23,42,.45); z-index: 9500; display: flex; align-items: center; justify-content: center; padding: 16px }
.dat-m { background: #fefefe; color: #0f172a; border-radius: 14px; width: min(620px, 100%); max-height: calc(100vh - 32px); display: flex; flex-direction: column; box-shadow: 0 20px 60px rgba(0,0,0,.25) }
.dat-m header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid #eef2f7; font-size: 16px }
.dat-m header button { border: none; background: none; font-size: 18px; color: #64748b; cursor: pointer }
.dat-m-corpo { padding: 16px 20px; overflow: auto; display: flex; flex-direction: column; gap: 12px }
.dat-m-sub { margin: 0; font-size: 13.5px; color: #475569 }
.dat-m-rot { display: flex; flex-direction: column; gap: 5px; font-size: 12.5px; color: #475569 }
.dat-m-rot input, .dat-m-rot textarea { font: inherit; font-size: 14px; color: #0f172a; border: 1px solid #cbd5e1; border-radius: 8px; padding: 9px 10px; background: #fefefe }
.dat-tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; background: #f1f5f9; padding: 4px; border-radius: 10px }
.dat-tabs button { border: none; background: none; border-radius: 8px; padding: 9px; font: inherit; font-size: 13.5px; color: #475569; cursor: pointer; display: flex; gap: 7px; align-items: center; justify-content: center }
.dat-tabs button.on { background: #fefefe; color: #0f172a; box-shadow: 0 1px 3px rgba(0,0,0,.1) }
.dat-arq { display: flex; gap: 8px; flex-wrap: wrap; align-items: center } .dat-arq-n { font-size: 13px; color: #166534; display: flex; gap: 6px; align-items: center }
.dat-texto { margin: 0; font-size: 13.5px; line-height: 1.6; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px }
.dat-pad-cab { display: flex; justify-content: space-between; font-size: 12.5px; color: #475569 } .dat-pad-cab button { border: none; background: none; color: #475569; text-decoration: underline; cursor: pointer; font: inherit; font-size: 12.5px }
.dat-pad { position: relative; border: 1px dashed #94a3b8; border-radius: 10px; background: #fefefe } .dat-pad > span { position: absolute; left: 0; right: 0; top: 45%; text-align: center; color: #94a3b8; font-size: 13px; pointer-events: none }
.dat-erro { margin: 0; color: #991b1b; font-size: 13.5px }
.dat-m footer { display: flex; justify-content: flex-end; align-items: center; gap: 10px; padding: 14px 20px; border-top: 1px solid #eef2f7 } .dat-m footer small { margin-right: auto; color: #b45309; font-size: 12.5px }
`
