'use client'
// Financeiro → Recibos (José, 03/11/2026): emitir recibo de pagamento com valor por extenso, assinatura salva e QR
// que confere o recibo (/r/<token>). Prévia do PDF ao lado, ao vivo. "Lançar no Omie": pagamos vira conta a pagar paga,
// recebemos vira conta a receber recebida, com categoria e conta corrente escolhidas aqui (sem ligação com OS/PPV).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FileSignature, ListChecks, Printer, Ban, Search, Download, Info, ArrowDownLeft, ArrowUpRight, RotateCw } from 'lucide-react'
import { fetchAuth } from '@/lib/auth/client'
import { reaisPorExtenso } from '@/lib/recibos/extenso'
import { EMPRESAS_RECIBO, FORMAS_PAGAMENTO, MODELOS, brl, formatarDoc, numeroRecibo, type ModeloRecibo, type Recibo, type TipoRecibo } from '@/lib/recibos/tipos'

const hojeISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10) }
const COR = '#1d4ed8'
const MODELO_KEY = 'recibos:modelo'
const OMIE_KEY = (empresa: string, tipo: TipoRecibo) => `recibos:omie:${empresa}:${tipo}`

interface Form {
  empresa: string; tipo: TipoRecibo; pessoa_nome: string; pessoa_doc: string; valor: string
  referente: string; forma: string; data_pagto: string; cidade: string; observacao: string; com_assinatura: boolean
  omie_lancar: boolean; omie_categoria: string; omie_conta_corrente: string
}

const VAZIO: Form = {
  empresa: 'Nova Tratores', tipo: 'recebemos', pessoa_nome: '', pessoa_doc: '', valor: '', referente: '', forma: 'PIX',
  data_pagto: hojeISO(), cidade: 'Piraju - SP', observacao: '', com_assinatura: true,
  omie_lancar: true, omie_categoria: '', omie_conta_corrente: '',
}

interface ListasOmie { categorias: { codigo: string; descricao: string }[]; contas: { id: number; descricao: string }[] }

const numeroDoTexto = (s: string) => Number(String(s).replace(/\./g, '').replace(',', '.')) || 0

const estiloCampo: React.CSSProperties = {
  width: '100%', padding: '9px 11px', border: '1px solid var(--border, #e2e8f0)', borderRadius: 10,
  background: 'var(--surface, #fefefe)', color: 'var(--portal-text, #0f172a)', fontSize: 14, outline: 'none',
}
const estiloRotulo: React.CSSProperties = { fontSize: 12, color: '#64748b', marginBottom: 4, display: 'block' }
const cartao: React.CSSProperties = {
  background: 'var(--surface, #fefefe)', border: '1px solid var(--border, #e2e8f0)', borderRadius: 16, padding: '16px 18px',
}

function Icone({ children, cor = COR, t = 32 }: { children: React.ReactNode; cor?: string; t?: number }) {
  return (
    <span style={{ width: t, height: t, borderRadius: t > 30 ? 9 : 8, display: 'grid', placeItems: 'center', color: cor, flexShrink: 0,
      background: `color-mix(in srgb, ${cor} 9%, var(--surface, #fefefe))`, border: `1px solid color-mix(in srgb, ${cor} 18%, transparent)` }}>
      {children}
    </span>
  )
}

async function abrirPdf(url: string, init?: RequestInit) {
  const r = await fetchAuth(url, init)
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.erro || 'Não consegui gerar o PDF') }
  return URL.createObjectURL(await r.blob())
}

export default function Recibos() {
  const [aba, setAba] = useState<'novo' | 'emitidos'>('novo')
  const [modelo, setModelo] = useState<ModeloRecibo>(1)
  const [f, setF] = useState<Form>(VAZIO)
  const [previa, setPrevia] = useState<string | null>(null)
  const [erroPrevia, setErroPrevia] = useState('')
  const [emitindo, setEmitindo] = useState(false)
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; txt: string } | null>(null)
  const [recibos, setRecibos] = useState<Recibo[]>([])
  const [busca, setBusca] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [ajuda, setAjuda] = useState(false)
  const [listas, setListas] = useState<ListasOmie | null>(null)
  const [erroListas, setErroListas] = useState('')
  const [relancando, setRelancando] = useState<number | null>(null)

  useEffect(() => {
    try { const m = Number(localStorage.getItem(MODELO_KEY)); if ([1, 2, 3].includes(m)) setModelo(m as ModeloRecibo) } catch { /* sem storage */ }
  }, [])
  const trocarModelo = (m: ModeloRecibo) => { setModelo(m); try { localStorage.setItem(MODELO_KEY, String(m)) } catch { /* sem storage */ } }

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }))
  const valorNum = numeroDoTexto(f.valor)

  // listas do Omie (categorias de despesa/receita + contas correntes) da empresa e do tipo escolhidos;
  // volta a última categoria/conta usada neste computador
  useEffect(() => {
    if (!f.omie_lancar) return
    let vivo = true
    setListas(null); setErroListas('')
    let salvo: { categoria?: string; conta?: string } = {}
    try { salvo = JSON.parse(localStorage.getItem(OMIE_KEY(f.empresa, f.tipo)) || '{}') } catch { /* sem storage */ }
    fetchAuth(`/api/recibos/omie-listas?empresa=${encodeURIComponent(f.empresa)}&tipo=${f.tipo}`)
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.erro); return j as ListasOmie })
      .then((l) => {
        if (!vivo) return
        setListas(l)
        setF((p) => ({
          ...p,
          omie_categoria: l.categorias.some((c) => c.codigo === salvo.categoria) ? salvo.categoria! : '',
          omie_conta_corrente: l.contas.some((c) => String(c.id) === salvo.conta) ? salvo.conta! : '',
        }))
      })
      .catch((e) => { if (vivo) setErroListas((e as Error).message) })
    return () => { vivo = false }
  }, [f.empresa, f.tipo, f.omie_lancar])

  const corpo = useMemo(() => {
    const cat = listas?.categorias.find((c) => c.codigo === f.omie_categoria)
    const cc = listas?.contas.find((c) => String(c.id) === f.omie_conta_corrente)
    return { ...f, valor: valorNum, modelo, omie_categoria_nome: cat?.descricao || '', omie_conta_nome: cc?.descricao || '' }
  }, [f, valorNum, modelo, listas])
  const faltaOmie = !f.omie_lancar ? ''
    : f.pessoa_doc.replace(/\D/g, '').length < 11 ? 'Para lançar no Omie, informe o CPF ou CNPJ.'
    : !f.omie_categoria ? 'Escolha a categoria do Omie.'
    : !f.omie_conta_corrente ? 'Escolha a conta corrente do Omie.' : ''

  // prévia ao vivo (espera 600 ms parado) — mexer no Omie não refaz o PDF
  const { empresa, tipo, pessoa_nome, pessoa_doc, valor, referente, forma, data_pagto, cidade, observacao, com_assinatura } = f
  const corpoPrevia = useMemo(
    () => ({ empresa, tipo, pessoa_nome, pessoa_doc, referente, forma, data_pagto, cidade, observacao, com_assinatura, valor: numeroDoTexto(valor), modelo }),
    [empresa, tipo, pessoa_nome, pessoa_doc, valor, referente, forma, data_pagto, cidade, observacao, com_assinatura, modelo])
  const ultima = useRef<string | null>(null)
  useEffect(() => {
    if (aba !== 'novo') return
    if (f.pessoa_nome.trim().length < 3 || valorNum <= 0 || f.referente.trim().length < 3) {
      setErroPrevia('Preencha nome, valor e a que se refere para ver o recibo.'); return
    }
    const t = setTimeout(async () => {
      try {
        const url = await abrirPdf('/api/recibos/previa', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpoPrevia) })
        if (ultima.current) URL.revokeObjectURL(ultima.current)
        ultima.current = url
        setPrevia(url); setErroPrevia('')
      } catch (e) { setErroPrevia((e as Error).message) }
    }, 600)
    return () => clearTimeout(t)
  }, [corpoPrevia, aba, f.pessoa_nome, f.referente, valorNum])

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const r = await fetchAuth(`/api/recibos?busca=${encodeURIComponent(busca)}`)
      const j = await r.json()
      if (!r.ok) throw new Error(j.erro)
      setRecibos(j.recibos || [])
    } catch (e) { setAviso({ tipo: 'erro', txt: (e as Error).message }) } finally { setCarregando(false) }
  }, [busca])
  useEffect(() => { const t = setTimeout(carregar, 300); return () => clearTimeout(t) }, [carregar])

  async function emitir() {
    if (emitindo) return
    setEmitindo(true); setAviso(null)
    try {
      const r = await fetchAuth('/api/recibos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
      const j = await r.json()
      if (!r.ok) throw new Error(j.erro)
      const rec = j.recibo as Recibo
      if (f.omie_lancar) try { localStorage.setItem(OMIE_KEY(f.empresa, f.tipo), JSON.stringify({ categoria: f.omie_categoria, conta: f.omie_conta_corrente })) } catch { /* sem storage */ }
      setAviso(rec.omie_erro
        ? { tipo: 'erro', txt: `Recibo nº ${numeroRecibo(rec.numero)} emitido, mas o Omie recusou o lançamento: ${rec.omie_erro} — corrija e use "Tentar de novo" em Emitidos.` }
        : { tipo: 'ok', txt: `Recibo nº ${numeroRecibo(rec.numero)} emitido.${rec.omie_baixado_em ? ` Lançado no Omie como ${rec.tipo === 'pagamos' ? 'conta paga' : 'conta recebida'}.` : ''}` })
      window.open(await abrirPdf(`/api/recibos/${rec.id}/pdf?modelo=${modelo}`), '_blank')
      setF({ ...VAZIO, empresa: f.empresa, tipo: f.tipo, forma: f.forma, data_pagto: hojeISO(),
        omie_lancar: f.omie_lancar, omie_categoria: f.omie_categoria, omie_conta_corrente: f.omie_conta_corrente })
      setPrevia(null)
      carregar()
    } catch (e) { setAviso({ tipo: 'erro', txt: (e as Error).message }) } finally { setEmitindo(false) }
  }

  async function verPdf(r: Recibo) {
    try { window.open(await abrirPdf(`/api/recibos/${r.id}/pdf?modelo=${modelo}`), '_blank') } catch (e) { setAviso({ tipo: 'erro', txt: (e as Error).message }) }
  }

  async function relancar(r: Recibo) {
    setRelancando(r.id); setAviso(null)
    try {
      const res = await fetchAuth(`/api/recibos/${r.id}/omie`, { method: 'POST' })
      const j = await res.json()
      if (!res.ok) throw new Error(j.erro)
      const rec = j.recibo as Recibo
      setAviso(rec.omie_erro ? { tipo: 'erro', txt: `O Omie recusou de novo: ${rec.omie_erro}` } : { tipo: 'ok', txt: `Recibo nº ${numeroRecibo(r.numero)} lançado no Omie.` })
      carregar()
    } catch (e) { setAviso({ tipo: 'erro', txt: (e as Error).message }) } finally { setRelancando(null) }
  }

  async function cancelar(r: Recibo) {
    const avisoOmie = r.omie_codigo_lancamento ? '\n\nATENÇÃO: o lançamento no Omie NÃO é desfeito. Estorne a baixa e exclua a conta lá no Omie.' : ''
    const motivo = window.prompt(`Cancelar o recibo nº ${numeroRecibo(r.numero)} (${brl(r.valor)} — ${r.pessoa_nome})?${avisoOmie}\nDiga o motivo:`)
    if (!motivo) return
    const res = await fetchAuth(`/api/recibos/${r.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ motivo }) })
    const j = await res.json()
    if (!res.ok) { setAviso({ tipo: 'erro', txt: j.erro }); return }
    setAviso({ tipo: 'ok', txt: `Recibo nº ${numeroRecibo(r.numero)} cancelado.` })
    carregar()
  }

  const totalMes = useMemo(() => {
    const mes = hojeISO().slice(0, 7)
    return recibos.filter((r) => !r.cancelado_em && r.data_pagto.startsWith(mes))
      .reduce((s, r) => { s[r.tipo] += Number(r.valor); return s }, { recebemos: 0, pagamos: 0 } as Record<TipoRecibo, number>)
  }, [recibos])

  const pill = (ativo: boolean): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 14px', borderRadius: 999, cursor: 'pointer', fontSize: 14,
    border: `1px solid ${ativo ? `color-mix(in srgb, ${COR} 35%, transparent)` : 'var(--border, #e2e8f0)'}`,
    background: ativo ? `color-mix(in srgb, ${COR} 8%, var(--surface, #fefefe))` : 'var(--surface, #fefefe)',
    color: ativo ? COR : 'var(--portal-text, #0f172a)',
  })

  return (
    <div style={{ padding: 'clamp(12px, 2vw, 28px)', display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <button style={pill(aba === 'novo')} onClick={() => setAba('novo')}><FileSignature size={16} /> Novo recibo</button>
        <button style={pill(aba === 'emitidos')} onClick={() => setAba('emitidos')}><ListChecks size={16} /> Emitidos ({recibos.length})</button>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 13, color: '#64748b' }}>Recebido no mês <b style={{ color: '#15803d', fontWeight: 500 }}>{brl(totalMes.recebemos)}</b></span>
        <span style={{ fontSize: 13, color: '#64748b' }}>Pago no mês <b style={{ color: '#b45309', fontWeight: 500 }}>{brl(totalMes.pagamos)}</b></span>
        <button style={pill(ajuda)} onClick={() => setAjuda((a) => !a)}><Info size={15} /> Como usar</button>
      </div>

      {ajuda && (
        <div style={{ ...cartao, fontSize: 13.5, color: '#475569', lineHeight: 1.6 }}>
          <b style={{ fontWeight: 500, color: 'var(--portal-text, #0f172a)' }}>Como usar esta tela</b><br />
          <b style={{ fontWeight: 500 }}>Recebemos</b>: alguém pagou a empresa (ex.: cliente pagou a OS no balcão). O recibo sai assinado com a sua assinatura salva.<br />
          <b style={{ fontWeight: 500 }}>Pagamos</b>: a empresa pagou alguém (frete, diária, serviço avulso). Imprima e peça para a pessoa assinar na linha.<br />
          O valor por extenso é escrito sozinho. Cada recibo tem número e um QR: quem ler o QR vê se o recibo é verdadeiro ou se foi cancelado.<br />
          <b style={{ fontWeight: 500 }}>Lançar no Omie</b> (ligado por padrão): ao emitir, o recibo vira no Omie uma conta a pagar já paga (Pagamos) ou uma conta a receber já recebida (Recebemos), na categoria e na conta corrente que você escolher. Precisa do CPF ou CNPJ; quem não tem cadastro no Omie é cadastrado.<br />
          Recibo errado não se apaga: cancele com o motivo e emita outro (se foi ao Omie, estorne lá). O modelo de impressão e a última categoria/conta ficam guardados neste computador.
        </div>
      )}

      {aviso && (
        <div style={{ ...cartao, padding: '10px 14px', fontSize: 14, color: aviso.tipo === 'ok' ? '#15803d' : '#b91c1c',
          background: aviso.tipo === 'ok' ? 'color-mix(in srgb, #15803d 7%, var(--surface, #fefefe))' : 'color-mix(in srgb, #dc2626 7%, var(--surface, #fefefe))' }}>
          {aviso.txt}
        </div>
      )}

      {aba === 'novo' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(420px, 100%), 1fr))', gap: 14, alignItems: 'start' }}>
          <div style={{ ...cartao, display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button style={pill(f.tipo === 'recebemos')} onClick={() => set('tipo', 'recebemos')}><ArrowDownLeft size={16} /> Recebemos de alguém</button>
              <button style={pill(f.tipo === 'pagamos')} onClick={() => set('tipo', 'pagamos')}><ArrowUpRight size={16} /> Pagamos a alguém</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(180px, 100%), 1fr))', gap: 10 }}>
              <label><span style={estiloRotulo}>Empresa</span>
                <select style={estiloCampo} value={f.empresa} onChange={(e) => set('empresa', e.target.value)}>
                  {EMPRESAS_RECIBO.map((e) => <option key={e}>{e}</option>)}
                </select></label>
              <label><span style={estiloRotulo}>Data do pagamento</span>
                <input type="date" style={estiloCampo} value={f.data_pagto} onChange={(e) => set('data_pagto', e.target.value)} /></label>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(180px, 100%), 1fr))', gap: 10 }}>
              <label style={{ gridColumn: 'span 2' }}><span style={estiloRotulo}>{f.tipo === 'recebemos' ? 'Quem pagou' : 'Quem recebeu'}</span>
                <input style={estiloCampo} value={f.pessoa_nome} onChange={(e) => set('pessoa_nome', e.target.value)} placeholder="Nome completo ou razão social" /></label>
              <label><span style={estiloRotulo}>CPF ou CNPJ{f.omie_lancar ? '' : ' (opcional)'}</span>
                <input style={estiloCampo} value={f.pessoa_doc} inputMode="numeric"
                  onChange={(e) => set('pessoa_doc', e.target.value)} onBlur={(e) => set('pessoa_doc', formatarDoc(e.target.value))} /></label>
              <label><span style={estiloRotulo}>Valor (R$)</span>
                <input style={{ ...estiloCampo, fontVariantNumeric: 'tabular-nums' }} value={f.valor} inputMode="decimal" placeholder="0,00"
                  onChange={(e) => set('valor', e.target.value.replace(/[^\d,.]/g, ''))} /></label>
            </div>
            {valorNum > 0 && <div style={{ fontSize: 13, color: '#475569', marginTop: -4 }}>{brl(valorNum)} — {reaisPorExtenso(valorNum)}</div>}
            <label><span style={estiloRotulo}>Referente a</span>
              <input style={estiloCampo} value={f.referente} onChange={(e) => set('referente', e.target.value)}
                placeholder={f.tipo === 'recebemos' ? 'ex.: pagamento da OS 0846 — revisão de 300 h do trator 6075' : 'ex.: frete de peças de Bauru a Piraju'} /></label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(180px, 100%), 1fr))', gap: 10 }}>
              <label><span style={estiloRotulo}>Forma de pagamento</span>
                <select style={estiloCampo} value={f.forma} onChange={(e) => set('forma', e.target.value)}>
                  {FORMAS_PAGAMENTO.map((x) => <option key={x}>{x}</option>)}
                </select></label>
              <label><span style={estiloRotulo}>Cidade</span>
                <input style={estiloCampo} value={f.cidade} onChange={(e) => set('cidade', e.target.value)} /></label>
            </div>
            <label><span style={estiloRotulo}>Observação (opcional, sai no recibo)</span>
              <textarea style={{ ...estiloCampo, minHeight: 56, resize: 'vertical' }} value={f.observacao} onChange={(e) => set('observacao', e.target.value)} /></label>
            {f.tipo === 'recebemos' && (
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5, color: '#475569' }}>
                <input type="checkbox" checked={f.com_assinatura} onChange={(e) => set('com_assinatura', e.target.checked)} />
                Sair com a minha assinatura salva (sem ela, sai a linha para assinar à mão)
              </label>
            )}
            <div style={{ borderTop: '1px solid var(--border, #e2e8f0)', paddingTop: 10, display: 'grid', gap: 10 }}>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5, color: 'var(--portal-text, #0f172a)' }}>
                <input type="checkbox" checked={f.omie_lancar} onChange={(e) => set('omie_lancar', e.target.checked)} />
                Lançar no Omie como {f.tipo === 'pagamos' ? 'conta a pagar já paga' : 'conta a receber já recebida'}
              </label>
              {f.omie_lancar && (erroListas
                ? <div style={{ fontSize: 13, color: '#b91c1c' }}>{erroListas}</div>
                : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))', gap: 10 }}>
                    <label><span style={estiloRotulo}>Categoria ({f.tipo === 'pagamos' ? 'despesa' : 'receita'})</span>
                      <select style={estiloCampo} value={f.omie_categoria} disabled={!listas} onChange={(e) => set('omie_categoria', e.target.value)}>
                        <option value="">{listas ? 'Escolha…' : 'Buscando no Omie…'}</option>
                        {listas?.categorias.map((c) => <option key={c.codigo} value={c.codigo}>{c.descricao}</option>)}
                      </select></label>
                    <label><span style={estiloRotulo}>Conta corrente</span>
                      <select style={estiloCampo} value={f.omie_conta_corrente} disabled={!listas} onChange={(e) => set('omie_conta_corrente', e.target.value)}>
                        <option value="">{listas ? 'Escolha…' : 'Buscando no Omie…'}</option>
                        {listas?.contas.map((c) => <option key={c.id} value={String(c.id)}>{c.descricao}</option>)}
                      </select></label>
                  </div>)}
              {faltaOmie && <div style={{ fontSize: 12.5, color: '#b45309' }}>{faltaOmie}</div>}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
              <span style={{ fontSize: 12, color: '#64748b' }}>Impressão</span>
              {MODELOS.map((m) => <button key={m.id} title={m.detalhe} style={{ ...pill(modelo === m.id), padding: '5px 11px', fontSize: 13 }} onClick={() => trocarModelo(m.id)}>{m.nome}</button>)}
            </div>
            <button onClick={emitir} disabled={emitindo || !!erroPrevia || !!faltaOmie}
              style={{ ...pill(true), justifyContent: 'center', padding: '11px 16px', fontSize: 15, opacity: emitindo || erroPrevia || faltaOmie ? 0.55 : 1,
                background: COR, color: '#fefefe', border: `1px solid ${COR}` }}>
              <Printer size={17} /> {emitindo ? (f.omie_lancar ? 'Emitindo e lançando no Omie…' : 'Emitindo…') : 'Emitir e imprimir'}
            </button>
          </div>

          <div style={{ ...cartao, padding: 8, minHeight: 560, display: 'grid' }}>
            {previa && !erroPrevia
              ? <iframe title="Prévia do recibo" src={`${previa}#toolbar=0&view=FitH`} style={{ width: '100%', height: '100%', minHeight: 560, border: 0, borderRadius: 10 }} />
              : <div style={{ display: 'grid', placeItems: 'center', color: '#94a3b8', fontSize: 14, textAlign: 'center', padding: 24 }}>
                  <div><Icone t={40}><FileSignature size={18} /></Icone><div style={{ marginTop: 10 }}>{erroPrevia || 'Gerando prévia…'}</div></div>
                </div>}
          </div>
        </div>
      ) : (
        <div style={{ ...cartao, padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '12px 14px', borderBottom: '1px solid var(--border, #e2e8f0)' }}>
            <Search size={16} color="#64748b" />
            <input style={{ ...estiloCampo, border: 0, padding: 4 }} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, número, CPF/CNPJ ou referente" />
            {carregando && <span style={{ fontSize: 12, color: '#94a3b8' }}>carregando…</span>}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5, minWidth: 860 }}>
              <thead>
                <tr style={{ color: '#64748b', textAlign: 'left' }}>
                  {['Nº', 'Data', 'Tipo', 'Pessoa', 'Referente', 'Forma', 'Valor', 'Omie', 'Emitido por', ''].map((h) =>
                    <th key={h} style={{ padding: '9px 12px', fontWeight: 500, fontSize: 12 }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {recibos.map((r) => (
                  <tr key={r.id} style={{ borderTop: '1px solid var(--border, #e2e8f0)', opacity: r.cancelado_em ? 0.55 : 1 }}>
                    <td style={{ padding: '9px 12px', fontVariantNumeric: 'tabular-nums' }}>{numeroRecibo(r.numero)}</td>
                    <td style={{ padding: '9px 12px' }}>{r.data_pagto.split('-').reverse().join('/')}</td>
                    <td style={{ padding: '9px 12px', color: r.tipo === 'recebemos' ? '#15803d' : '#b45309' }}>{r.tipo === 'recebemos' ? 'Recebemos' : 'Pagamos'}</td>
                    <td style={{ padding: '9px 12px' }}>{r.pessoa_nome}{r.empresa !== 'Nova Tratores' && <span style={{ color: '#94a3b8' }}> · {r.empresa}</span>}</td>
                    <td style={{ padding: '9px 12px', color: '#475569', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.referente}>{r.referente}</td>
                    <td style={{ padding: '9px 12px' }}>{r.forma}</td>
                    <td style={{ padding: '9px 12px', fontVariantNumeric: 'tabular-nums', textDecoration: r.cancelado_em ? 'line-through' : 'none' }}>{brl(r.valor)}</td>
                    <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                      {!r.omie_lancar ? <span style={{ color: '#94a3b8' }}>—</span>
                        : r.omie_baixado_em ? <span style={{ color: '#15803d' }} title={[r.omie_categoria_nome, r.omie_conta_nome].filter(Boolean).join(' · ')}>{r.tipo === 'pagamos' ? 'Paga' : 'Recebida'}</span>
                        : <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                            <span style={{ color: '#b91c1c' }} title={r.omie_erro || ''}>Não lançou</span>
                            {!r.cancelado_em && <button title={r.omie_erro || 'Tentar de novo'} disabled={relancando === r.id} onClick={() => relancar(r)}
                              style={{ ...pill(false), padding: '3px 8px', fontSize: 12 }}><RotateCw size={13} /> {relancando === r.id ? 'Lançando…' : 'Tentar de novo'}</button>}
                          </span>}
                    </td>
                    <td style={{ padding: '9px 12px', color: '#64748b' }}>{r.cancelado_em ? `Cancelado: ${r.cancelado_motivo || ''}` : r.emitido_nome}</td>
                    <td style={{ padding: '6px 12px', whiteSpace: 'nowrap' }}>
                      <button title="Ver / imprimir" onClick={() => verPdf(r)} style={{ ...pill(false), padding: '5px 9px' }}><Download size={15} /></button>{' '}
                      {!r.cancelado_em && <button title="Cancelar" onClick={() => cancelar(r)} style={{ ...pill(false), padding: '5px 9px', color: '#b91c1c' }}><Ban size={15} /></button>}
                    </td>
                  </tr>
                ))}
                {!recibos.length && !carregando && (
                  <tr><td colSpan={10} style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>Nenhum recibo {busca ? 'encontrado' : 'emitido ainda'}.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
