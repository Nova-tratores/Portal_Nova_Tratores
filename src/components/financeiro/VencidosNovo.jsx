'use client'
// Vencidos — versão nova (José, 29/10/2026: "melhora a aba de vencidos"), estilo POS NewPortal
// (docs/estilo-pos-newportal.md). Mostra a situação de cada card no Omie (já pago? atrasado?),
// números por faixa de atraso e setor, agrupa por cliente e separa o que é tarefa do Financeiro
// (venceu sem boleto gerado) do que é cobrança do Pós-Vendas/Peças.
import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { authHeaders } from '@/lib/auth/client'
import { useAuth } from '@/hooks/useAuth'
import { useAuditLog } from '@/hooks/useAuditLog'
import { notificarAdminsClient } from '@/hooks/useNotificarAdmins'
import { marcarMinhaAcao } from '@/components/financeiro/NotificationSystem'
import { exigeComprovantePago, temComprovantePago } from '@/lib/financeiro/constants'
import { entraEmVencidos, diasDeAtraso, hojeLocal, vencimentoDeReferencia } from '@/lib/financeiro/vencidos'
import { formatarDataBR } from '@/lib/financeiro/utils'
import { podeRecobrar, hojeBR } from '@/lib/financeiro/fases-automaticas'
import { pedirRecobranca } from '@/lib/financeiro/recobranca-client'
import {
  AlertTriangle, Search, X, Users, List, Wrench, Package, FileWarning, CheckCircle2, RotateCw,
  FileText, ExternalLink, Receipt, Clock, CircleDollarSign,
} from 'lucide-react'

const brl = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const num = (v) => { const n = parseFloat(String(v ?? '').replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0 }
const valorCard = (c) => { const v = Number(c.valor_servico); return Number.isFinite(v) ? v : num(c.valor_servico) }

const FAIXAS = [
  { id: 'f15', rotulo: '1 a 15 dias', de: 1, ate: 15, cor: '#d97706' },
  { id: 'f30', rotulo: '16 a 30 dias', de: 16, ate: 30, cor: '#ea580c' },
  { id: 'f60', rotulo: '31 a 60 dias', de: 31, ate: 60, cor: '#dc2626' },
  { id: 'f60m', rotulo: 'Mais de 60 dias', de: 61, ate: Infinity, cor: '#991b1b' },
]
const faixaDe = (d) => FAIXAS.find((f) => d >= f.de && d <= f.ate) || FAIXAS[0]

const OMIE = {
  recebido: { rotulo: 'Pago no Omie', cor: '#16a34a' },
  atrasado: { rotulo: 'Atrasado no Omie', cor: '#dc2626' },
  aberto: { rotulo: 'Em aberto no Omie', cor: '#d97706' },
  sem_titulo: { rotulo: 'Não achado no Omie', cor: '#64748b' },
}
const semBoleto = (c) => /sem boleto/i.test(c.tarefa || '') || (!c.anexo_boleto && !c.anexo_boleto_2 && !c.anexo_boleto_3)
const setorDe = (c) => (c.setor_destino === 'pecas' ? 'pecas' : 'oficina')

const CSS = `
.vn { padding: 20px 24px 40px; color: var(--portal-text, #0f172a); font-weight: 400 }
.vn * { box-sizing: border-box }
.vn-topo { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 16px }
.vn-card { background: var(--surface, #fefefe); border: 1px solid var(--border, #e2e8f0); border-radius: 16px; padding: 16px 18px 14px;
  transition: box-shadow .25s, transform .25s, border-color .25s }
.vn-card.clic { cursor: pointer }
.vn-card.clic:hover { transform: translateY(-2px); box-shadow: 0 14px 28px -20px rgba(15,23,42,.55); border-color: color-mix(in srgb, var(--c, #dc2626) 35%, var(--border, #e2e8f0)) }
.vn-card.ativo { border-color: var(--c, #dc2626); background: color-mix(in srgb, var(--c, #dc2626) 6%, var(--surface, #fefefe)) }
.vn-ico { width: 40px; height: 40px; border-radius: 11px; display: grid; place-items: center; flex: none; color: var(--c, #dc2626);
  background: color-mix(in srgb, var(--c, #dc2626) 9%, var(--surface, #fefefe)); border: 1px solid color-mix(in srgb, var(--c, #dc2626) 18%, transparent) }
.vn-ico.p { width: 32px; height: 32px; border-radius: 9px }
.vn-num { font-size: 26px; font-weight: 500; letter-spacing: -.01em; font-variant-numeric: tabular-nums; margin-top: 8px }
.vn-sub { font-size: 13px; color: var(--portal-text-secondary, #475569); margin-top: 2px }
.vn-rot { display: flex; align-items: center; gap: 10px; font-size: 14px; color: var(--portal-text-secondary, #475569) }
.vn-barra { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 14px }
.vn-chip { display: inline-flex; align-items: center; gap: 6px; height: 34px; padding: 0 12px; border-radius: 999px; font-size: 13px; cursor: pointer;
  border: 1px solid color-mix(in srgb, var(--c, #475569) 25%, var(--border, #e2e8f0)); background: var(--surface, #fefefe); color: var(--portal-text, #0f172a) }
.vn-chip .q { font-size: 12px; padding: 1px 8px; border-radius: 999px; color: var(--c, #475569); background: color-mix(in srgb, var(--c, #475569) 12%, transparent); font-variant-numeric: tabular-nums }
.vn-chip.on { background: color-mix(in srgb, var(--c, #475569) 9%, var(--surface, #fefefe)); border-color: var(--c, #475569) }
.vn-chip.on .q { background: var(--c, #475569); color: #fefefe }
.vn-busca { display: flex; align-items: center; gap: 8px; height: 38px; padding: 0 12px; border: 1px solid var(--border, #e2e8f0); border-radius: 10px;
  background: var(--surface, #fefefe); min-width: 260px; flex: 1; max-width: 420px }
.vn-busca input { border: 0; outline: 0; flex: 1; background: transparent; font-size: 14px; color: inherit }
.vn-lista { display: flex; flex-direction: column; gap: 10px }
.vn-grupo { padding: 14px 16px; }
.vn-grupo-cab { display: flex; align-items: center; gap: 12px; margin-bottom: 10px }
.vn-linha { display: grid; grid-template-columns: minmax(220px, 2.2fr) 1fr 1fr 1.1fr auto; gap: 14px; align-items: center; padding: 14px 16px; cursor: pointer }
.vn-grupo .vn-linha { border: 1px solid var(--border, #e2e8f0); border-radius: 12px; padding: 10px 12px; margin-top: 8px; background: var(--surface, #fefefe) }
.vn-cli { font-size: 16.5px; font-weight: 500; line-height: 1.25 }
.vn-meta { font-size: 12.5px; color: var(--portal-text-muted, #64748b); margin-top: 3px; display: flex; flex-wrap: wrap; gap: 6px; align-items: center }
.vn-pill { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; padding: 3px 9px; border-radius: 999px; white-space: nowrap;
  color: var(--c, #475569); background: color-mix(in srgb, var(--c, #475569) 10%, transparent) }
.vn-valor { font-size: 20px; font-weight: 500; font-variant-numeric: tabular-nums; letter-spacing: -.01em }
.vn-acoes { display: flex; gap: 6px; justify-content: flex-end }
.vn-btn { height: 34px; padding: 0 12px; border-radius: 10px; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
  border: 1px solid var(--border, #e2e8f0); background: var(--surface, #fefefe); color: var(--portal-text, #0f172a); white-space: nowrap }
.vn-btn:hover { border-color: var(--c, #2563eb); color: var(--c, #2563eb) }
.vn-btn.cheio { background: var(--c, #2563eb); border-color: var(--c, #2563eb); color: #fefefe }
.vn-btn.cheio:hover { filter: brightness(1.08); color: #fefefe }
.vn-vazio { text-align: center; padding: 50px 20px; color: var(--portal-text-muted, #64748b); font-size: 14px }
.vn-ajuda { font-size: 13px; color: var(--portal-text-secondary, #475569); margin: -4px 0 14px }
.vn-fundo { position: fixed; inset: 0; background: rgba(15,23,42,.45); backdrop-filter: blur(6px); z-index: 9000; display: flex; justify-content: flex-end }
.vn-gaveta { width: min(560px, 100%); height: 100%; overflow: auto; background: var(--portal-bg-secondary, #f8fafc); padding: 20px; display: flex; flex-direction: column; gap: 12px }
.vn-tit { display: flex; align-items: center; gap: 10px; font-size: 16px; font-weight: 500; margin: 0 0 10px }
.vn-tab { width: 100%; border-collapse: collapse; font-size: 13px }
.vn-tab th { text-align: left; font-weight: 400; color: var(--portal-text-secondary, #475569); padding: 6px 8px; background: var(--portal-bg-secondary, #f1f5f9) }
.vn-tab td { padding: 7px 8px; border-top: 1px solid var(--border, #e2e8f0); font-variant-numeric: tabular-nums }
.vn-link { display: flex; align-items: center; gap: 8px; padding: 9px 12px; border-radius: 10px; font-size: 13px; color: #2563eb; text-decoration: none;
  border: 1px solid color-mix(in srgb, #2563eb 18%, var(--border, #e2e8f0)); margin-top: 6px }
@media (max-width: 860px) {
  .vn { padding: 14px 16px 30px }
  .vn-linha { grid-template-columns: 1fr auto; }
  .vn-linha .col-forma, .vn-linha .col-omie { grid-column: 1 / -1 }
  .vn-acoes { grid-column: 1 / -1; justify-content: flex-start; flex-wrap: wrap }
  .vn-busca { min-width: 0; max-width: none }
}
`

export default function VencidosNovo() {
  const { userProfile } = useAuth()
  const { log: auditLog } = useAuditLog()
  const [cards, setCards] = useState([])
  const [omie, setOmie] = useState({})
  const [omieCarregando, setOmieCarregando] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [setor, setSetor] = useState('todos')
  const [faixa, setFaixa] = useState(null)
  const [visao, setVisao] = useState('todos') // todos | cobrar | sem_boleto | pago_omie
  const [agrupar, setAgrupar] = useState(false)
  const [aberto, setAberto] = useState(null)

  const carregarOmie = async (lista) => {
    if (!lista.length) { setOmie({}); return }
    setOmieCarregando(true)
    try {
      const r = await fetch('/api/financeiro/vencidos/omie', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ ids: lista.map((c) => c.id) }),
      })
      const j = await r.json()
      if (r.ok) setOmie(j.cards || {})
    } catch { /* sem Omie a tela segue */ }
    setOmieCarregando(false)
  }

  const carregarDados = async () => {
    const { data, error } = await supabase.from('Chamado_NF').select('*')
      .in('status', ['vencido', 'aguardando_vencimento']).is('grupo_pai_id', null)
      .order('vencimento_boleto', { ascending: true })
    if (error) { console.error(error); setLoading(false); return }
    const hoje = hojeLocal()
    const lista = (data || []).filter((c) => entraEmVencidos(c, hoje))
      .map((c) => ({ ...c, diasAtraso: diasDeAtraso(c, hoje), vencRef: vencimentoDeReferencia(c, hoje) }))
    setCards(lista)
    setLoading(false)
    carregarOmie(lista)
  }

  const carregarRef = useRef(carregarDados)
  useEffect(() => { carregarRef.current = carregarDados })
  const espera = useRef(null)
  useEffect(() => { if (userProfile) carregarRef.current() }, [userProfile])
  useEffect(() => {
    const canal = supabase.channel('vencidos_novo_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'Chamado_NF' }, () => {
        if (espera.current) clearTimeout(espera.current)
        espera.current = setTimeout(() => carregarRef.current(), 800)
      }).subscribe()
    return () => { supabase.removeChannel(canal); if (espera.current) clearTimeout(espera.current) }
  }, [])

  const sitOmie = (c) => omie[c.id]?.situacao

  // filtros (setor e busca valem para os números do topo; faixa e visão só para a lista)
  const base = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return cards.filter((c) => (setor === 'todos' || setorDe(c) === setor) &&
      (!q || [c.nom_cliente, c.num_nf_servico, c.num_nf_peca, String(c.id), c.cnpj_cliente].some((x) => String(x || '').toLowerCase().includes(q))))
  }, [cards, setor, busca])

  const lista = base.filter((c) => {
    if (faixa && faixaDe(c.diasAtraso).id !== faixa) return false
    if (visao === 'sem_boleto') return semBoleto(c)
    if (visao === 'cobrar') return !semBoleto(c) && sitOmie(c) !== 'recebido'
    if (visao === 'pago_omie') return sitOmie(c) === 'recebido'
    return true
  }).sort((a, b) => b.diasAtraso - a.diasAtraso)

  const total = base.reduce((s, c) => s + valorCard(c), 0)
  const pagosOmie = base.filter((c) => sitOmie(c) === 'recebido')
  const nSemBoleto = base.filter(semBoleto).length
  const nCobrar = base.filter((c) => !semBoleto(c) && sitOmie(c) !== 'recebido').length
  const porSetor = (s) => cards.filter((c) => setorDe(c) === s)

  const grupos = (() => {
    if (!agrupar) return null
    const m = new Map()
    for (const c of lista) {
      const k = String(c.cnpj_cliente || c.nom_cliente || c.id).trim().toUpperCase()
      if (!m.has(k)) m.set(k, { chave: k, nome: c.nom_cliente, itens: [] })
      m.get(k).itens.push(c)
    }
    return [...m.values()].map((g) => ({ ...g, total: g.itens.reduce((s, c) => s + valorCard(c), 0), maior: Math.max(...g.itens.map((c) => c.diasAtraso)) }))
      .sort((a, b) => b.total - a.total)
  })()

  // ── ações (mesma regra da tela atual) ──
  const notificar = (t, novo, desc) => marcarMinhaAcao('Chamado_NF', t.id, {
    titulo: `Card movimentado → ${novo === 'pago' ? 'Pago' : 'Vencido'}`, descricao: desc, link: '/financeiro/vencidos',
    userId: userProfile?.id, alvo: userProfile?.funcao === 'Financeiro' ? 'posvendas' : 'financeiro',
  })
  const audit = (t, para, acao_desc) => auditLog({ sistema: 'financeiro', acao: 'mover_status', entidade: 'Chamado_NF', entidade_id: String(t.id),
    entidade_label: `NF #${t.id} - ${t.nom_cliente || ''}`, detalhes: { de: t.status, para, acao_desc } })

  const recobrar = async (t) => {
    const pode = podeRecobrar(t, hojeBR())
    if (!pode.ok) { alert('Não dá para recobrar: ' + pode.motivo); return }
    // rota: grava o card, cria o ticket no bloco "Cobranças — <setor>" e registra o histórico (29/10/2026)
    const r = await pedirRecobranca(t.id)
    if (!r.ok) { alert(r.mensagem); return }
    const n = r.numero || (t.recombrancas_qtd || 0) + 1
    notificar(t, 'vencido', `NF #${t.id} - ${t.nom_cliente || ''} — Recobrança #${n}`)
    notificarAdminsClient('financeiro', `${userProfile?.nome || 'Usuário'} solicitou recobrança #${n}`, `NF #${t.id} — ${t.nom_cliente || ''}`, '/financeiro/vencidos')
    alert(r.mensagem)
    setAberto(null); carregarDados()
  }
  // botão Recobrar: desabilitado com o motivo quando podeRecobrar não deixa
  const btnRecobrar = (t, rotulo) => {
    const p = podeRecobrar(t, hojeBR())
    return (
      <button className="vn-btn" style={{ '--c': '#dc2626', ...(p.ok ? {} : { opacity: .5, cursor: 'not-allowed' }) }} disabled={!p.ok}
        title={p.motivo || 'Cria um ticket para o setor cobrar o cliente'} onClick={() => recobrar(t)}><RotateCw size={14} />{rotulo}</button>
    )
  }
  const marcarPago = async (t) => {
    const pagoOmie = sitOmie(t) === 'recebido'
    if (!pagoOmie && exigeComprovantePago(t.forma_pagamento) && !temComprovantePago(t)) {
      alert('Este método de pagamento exige o comprovante anexado para mover para Pago (ou o título recebido no Omie).'); return
    }
    if (!window.confirm(`Marcar #${t.id} (${t.nom_cliente}) como pago?`)) return
    const { error } = await supabase.from('Chamado_NF').update({ status: 'pago', tarefa: 'Pagamento Confirmado' }).eq('id', t.id)
    if (error) { alert('Erro ao marcar como pago: ' + error.message); return }
    notificar(t, 'pago', `NF #${t.id} - ${t.nom_cliente || ''} — Marcado como pago`)
    audit(t, 'pago', pagoOmie ? 'Pagamento confirmado pelo Omie (tela Vencidos)' : 'Pagamento confirmado (tela Vencidos)')
    setAberto(null); carregarDados()
  }

  const linha = (c) => {
    const f = faixaDe(c.diasAtraso)
    const s = sitOmie(c)
    const o = s ? OMIE[s] : null
    return (
      <div key={c.id} className={agrupar ? 'vn-linha' : 'vn-card vn-linha clic'} style={{ '--c': f.cor }} onClick={() => setAberto(c)}>
        <div>
          <div className="vn-cli">{agrupar ? `NF ${[c.num_nf_servico, c.num_nf_peca].filter(Boolean).join(' / ') || '—'}` : c.nom_cliente}</div>
          <div className="vn-meta">
            <span>#{c.id}</span>
            {!agrupar && (c.num_nf_servico || c.num_nf_peca) && <span>· NF {[c.num_nf_servico, c.num_nf_peca].filter(Boolean).join(' / ')}</span>}
            <span className="vn-pill" style={{ '--c': setorDe(c) === 'pecas' ? '#0891b2' : '#2563eb' }}>
              {setorDe(c) === 'pecas' ? <Package size={12} /> : <Wrench size={12} />}{setorDe(c) === 'pecas' ? 'Peças' : 'Oficina'}
            </span>
            {semBoleto(c) && <span className="vn-pill" style={{ '--c': '#7c3aed' }}><FileWarning size={12} />Sem boleto</span>}
            {c.recombrancas_qtd > 0 && <span className="vn-pill" style={{ '--c': '#475569' }}><RotateCw size={12} />{c.recombrancas_qtd}x recobrado</span>}
          </div>
        </div>
        <div className="col-forma" style={{ fontSize: 13, color: 'var(--portal-text-secondary, #475569)' }}>
          {c.forma_pagamento || '—'}
          <div style={{ fontSize: 12.5, color: 'var(--portal-text-muted, #64748b)', marginTop: 2 }}>venceu {formatarDataBR(c.vencRef || c.vencimento_boleto)}</div>
        </div>
        <div><span className="vn-pill" style={{ '--c': f.cor, fontSize: 13 }}><Clock size={13} />{c.diasAtraso} {c.diasAtraso === 1 ? 'dia' : 'dias'}</span></div>
        <div className="col-omie">
          {o ? <span className="vn-pill" style={{ '--c': o.cor }}>{s === 'recebido' ? <CheckCircle2 size={12} /> : <Receipt size={12} />}{o.rotulo}</span>
            : <span style={{ fontSize: 12, color: 'var(--portal-text-muted, #94a3b8)' }}>{omieCarregando ? 'conferindo Omie…' : '—'}</span>}
          <div className="vn-valor" style={{ marginTop: 4 }}>{brl(valorCard(c))}</div>
        </div>
        <div className="vn-acoes" onClick={(e) => e.stopPropagation()}>
          {s === 'recebido'
            ? <button className="vn-btn cheio" style={{ '--c': '#16a34a' }} onClick={() => marcarPago(c)}><CheckCircle2 size={14} />Dar como pago</button>
            : btnRecobrar(c, 'Recobrar')}
        </div>
      </div>
    )
  }

  const topo = ({ c, ico, rot, numero, sub, ativo, onClick }) => (
    <div key={rot} className={`vn-card ${onClick ? 'clic' : ''} ${ativo ? 'ativo' : ''}`} style={{ '--c': c }} onClick={onClick}>
      <div className="vn-rot"><span className="vn-ico">{ico}</span>{rot}</div>
      <div className="vn-num">{numero}</div>
      {sub && <div className="vn-sub">{sub}</div>}
    </div>
  )

  return (
    <div className="vn">
      <style>{CSS}</style>
      <div className="vn-topo">
        {topo({ c: '#dc2626', ico: <AlertTriangle size={18} />, rot: 'Em atraso', numero: brl(total), sub: `${base.length} cards`,
          ativo: visao === 'todos', onClick: () => setVisao('todos') })}
        {topo({ c: '#ea580c', ico: <CircleDollarSign size={18} />, rot: 'Para cobrar do cliente', numero: nCobrar, sub: 'Pós-Vendas / Peças',
          ativo: visao === 'cobrar', onClick: () => setVisao(visao === 'cobrar' ? 'todos' : 'cobrar') })}
        {topo({ c: '#7c3aed', ico: <FileWarning size={18} />, rot: 'Venceu sem boleto', numero: nSemBoleto, sub: 'Tarefa do Financeiro: gerar o boleto',
          ativo: visao === 'sem_boleto', onClick: () => setVisao(visao === 'sem_boleto' ? 'todos' : 'sem_boleto') })}
        {topo({ c: '#16a34a', ico: <CheckCircle2 size={18} />, rot: 'Já pago no Omie', numero: omieCarregando ? '…' : pagosOmie.length,
          sub: 'Só falta dar como pago aqui', ativo: visao === 'pago_omie', onClick: () => setVisao(visao === 'pago_omie' ? 'todos' : 'pago_omie') })}
      </div>

      <div className="vn-barra">
        <div className="vn-busca"><Search size={15} color="#64748b" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Cliente, NF, nº do card ou CNPJ" />
          {busca && <X size={15} style={{ cursor: 'pointer' }} onClick={() => setBusca('')} />}
        </div>
        {[['todos', 'Todos', cards.length, '#475569', null], ['oficina', 'Oficina', porSetor('oficina').length, '#2563eb', <Wrench key="w" size={13} />],
          ['pecas', 'Peças', porSetor('pecas').length, '#0891b2', <Package key="p" size={13} />]].map(([id, rot, q, cor, ic]) => (
          <span key={id} className={`vn-chip ${setor === id ? 'on' : ''}`} style={{ '--c': cor }} onClick={() => setSetor(id)}>{ic}{rot}<span className="q">{q}</span></span>
        ))}
        <span style={{ width: 1, height: 24, background: 'var(--border, #e2e8f0)', margin: '0 4px' }} />
        {FAIXAS.map((f) => {
          const q = base.filter((c) => faixaDe(c.diasAtraso).id === f.id).length
          return <span key={f.id} className={`vn-chip ${faixa === f.id ? 'on' : ''}`} style={{ '--c': f.cor }} onClick={() => setFaixa(faixa === f.id ? null : f.id)}>{f.rotulo}<span className="q">{q}</span></span>
        })}
        <span style={{ flex: 1 }} />
        <span className={`vn-chip ${agrupar ? 'on' : ''}`} style={{ '--c': '#2563eb' }} onClick={() => setAgrupar(!agrupar)}>
          {agrupar ? <Users size={14} /> : <List size={14} />}{agrupar ? 'Por cliente' : 'Card a card'}
        </span>
      </div>
      <div className="vn-ajuda">
        A situação no Omie vem do contas a receber sincronizado (atualiza a cada poucas horas). &quot;Já pago no Omie&quot; = o banco já deu baixa: confira e dê como pago.
        &quot;Venceu sem boleto&quot; = o boleto nunca foi gerado no portal — não adianta o Pós-Vendas cobrar antes.
      </div>

      {loading ? <div className="vn-vazio">Carregando…</div>
        : !lista.length ? <div className="vn-vazio"><CheckCircle2 size={28} color="#16a34a" /><div style={{ marginTop: 8 }}>Nenhum card vencido com esses filtros.</div></div>
          : agrupar ? (
            <div className="vn-lista">
              {grupos.map((g) => (
                <div key={g.chave} className="vn-card vn-grupo" style={{ '--c': faixaDe(g.maior).cor }}>
                  <div className="vn-grupo-cab">
                    <span className="vn-ico p"><Users size={16} /></span>
                    <div style={{ flex: 1 }}>
                      <div className="vn-cli">{g.nome}</div>
                      <div className="vn-meta">{g.itens.length} {g.itens.length === 1 ? 'card' : 'cards'} · atraso de até {g.maior} dias</div>
                    </div>
                    <div className="vn-valor">{brl(g.total)}</div>
                  </div>
                  {g.itens.map((c) => linha(c))}
                </div>
              ))}
            </div>
          ) : <div className="vn-lista">{lista.map((c) => linha(c))}</div>}

      {aberto && (
        <div className="vn-fundo" onClick={(e) => { if (e.target === e.currentTarget) setAberto(null) }}>
          <div className="vn-gaveta">
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <span className="vn-ico" style={{ '--c': faixaDe(aberto.diasAtraso).cor }}><AlertTriangle size={18} /></span>
              <div style={{ flex: 1 }}>
                <div className="vn-cli" style={{ fontSize: 18 }}>{aberto.nom_cliente}</div>
                <div className="vn-meta">#{aberto.id} · {aberto.forma_pagamento} · venceu {formatarDataBR(aberto.vencRef || aberto.vencimento_boleto)} · {aberto.diasAtraso} dias</div>
              </div>
              <button className="vn-btn" onClick={() => setAberto(null)}><X size={15} /></button>
            </div>

            <div className="vn-card">
              <div className="vn-num" style={{ marginTop: 0 }}>{brl(valorCard(aberto))}</div>
              <div className="vn-sub">{aberto.tarefa || '—'}{aberto.recombrancas_qtd > 0 ? ` · ${aberto.recombrancas_qtd} recobrança(s)` : ''}</div>
            </div>

            <div className="vn-card">
              <h3 className="vn-tit"><span className="vn-ico p" style={{ '--c': '#2563eb' }}><Receipt size={15} /></span>No Omie</h3>
              {!omie[aberto.id] ? <div className="vn-sub">{omieCarregando ? 'Conferindo…' : 'Sem informação.'}</div>
                : !omie[aberto.id].titulos.length ? <div className="vn-sub">Nenhum título do Omie casou com a NF deste card.</div>
                  : (
                    <table className="vn-tab"><thead><tr><th>Parcela</th><th>Vencimento</th><th>Situação</th><th>Pago em</th><th style={{ textAlign: 'right' }}>Valor</th></tr></thead>
                      <tbody>{omie[aberto.id].titulos.map((t, i) => (
                        <tr key={i}><td>{t.parcela || '—'}</td><td>{formatarDataBR(t.vencimento)}</td>
                          <td><span className="vn-pill" style={{ '--c': t.status === 'RECEBIDO' ? '#16a34a' : t.status === 'ATRASADO' ? '#dc2626' : '#d97706' }}>{t.status === 'RECEBIDO' ? 'Recebido' : t.status === 'ATRASADO' ? 'Atrasado' : 'A vencer'}</span></td>
                          <td>{t.pagamento ? formatarDataBR(t.pagamento) : '—'}</td><td style={{ textAlign: 'right' }}>{brl(t.valor)}</td></tr>
                      ))}</tbody></table>
                  )}
            </div>

            <div className="vn-card">
              <h3 className="vn-tit"><span className="vn-ico p" style={{ '--c': '#475569' }}><FileText size={15} /></span>Documentos</h3>
              {[['Boleto', aberto.anexo_boleto], ['Boleto (2)', aberto.anexo_boleto_2], ['NF de serviço', aberto.anexo_nf_servico], ['NF de peças', aberto.anexo_nf_peca]]
                .flatMap(([r, u]) => String(u || '').split(',').map((x) => x.trim()).filter(Boolean).map((x, i) => [i ? `${r} ${i + 1}` : r, x]))
                .map(([r, u]) => <a key={u} className="vn-link" href={u} target="_blank" rel="noopener noreferrer"><FileText size={14} />{r}<ExternalLink size={12} style={{ marginLeft: 'auto', opacity: .6 }} /></a>)}
              {semBoleto(aberto) && <div className="vn-sub" style={{ marginTop: 8, color: '#7c3aed' }}>Este card venceu sem boleto gerado no portal.</div>}
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {btnRecobrar(aberto, 'Pedir recobrança')}
              {!podeRecobrar(aberto, hojeBR()).ok && <span className="vn-sub" style={{ alignSelf: 'center' }}>Sem recobrança: {podeRecobrar(aberto, hojeBR()).motivo}</span>}
              <button className={`vn-btn ${sitOmie(aberto) === 'recebido' ? 'cheio' : ''}`} style={{ '--c': '#16a34a' }} onClick={() => marcarPago(aberto)}><CheckCircle2 size={14} />Dar como pago</button>
              <a className="vn-btn" style={{ '--c': '#2563eb', textDecoration: 'none' }} href={`/financeiro/${aberto.setor_destino === 'pecas' ? 'kanban-pecas' : 'kanban'}?id=${aberto.id}`}><ExternalLink size={14} />Abrir no kanban</a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
