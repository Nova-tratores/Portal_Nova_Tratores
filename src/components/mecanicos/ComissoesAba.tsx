'use client'
// Aba Comissões da Equipe (José, 29/10/2026: "o cofrinho vai dentro de comissões, e os cards de técnico do mês
// também. E dentro de comissão vai dividir entre Funcionários: Técnicos / Escritório (Vinicius Correa e Larissa Garcia)").
//  - Técnicos: a caixinha, os cartões dos técnicos do mês e as regras (a antiga janela Comissões, aqui dentro).
//  - Escritório (29/10/2026): cartão igual ao dos técnicos. Garantista (função na Administração) = 1% das garantias
//    faturadas no mês (OS + peças) + % das revisões faturadas (OS + peças), que só o Gerente do Pós-Vendas muda.
//    Larissa: regra a definir.
import { useEffect, useState } from 'react'
import { authHeaders } from '@/lib/auth/client'
import CaixinhaMec from './CaixinhaMec'
import { ComissoesJanela, JanelaEmbutida } from './JanelasInfo'
import { brl2, Odometro } from './ui'
import { ESTILO_CT, ESTILO_CT2, ESTILO_CT3 } from './CardsTecnicoOpcoes'

type PessoaEsc = { nome: string; foto: string | null; funcao: 'garantista' | 'sem_regra'; rh: { nome: string; cargo: string | null; departamento: string | null } | null; comissoes: { mes: string; valor: number; status: string; origem: string }[] }
type OSB = { os: string; numero: string | null; cliente: string; data: string; total: number; tipo: string }
type DadosEsc = { mes: string; config: { pctGarantia: number; pctRevisao: number; atualizadoEm?: string | null; atualizadoPor?: string | null }; conta: { garantias: number; revisoes: number; comGarantia: number; comRevisao: number }; total: number; bases: { garantias: OSB[]; revisoes: OSB[] }; pessoas: PessoaEsc[]; podeEditar: boolean }
const NOMES_MES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const nomeMes = (m: string) => `${NOMES_MES[Number(m.slice(5, 7)) - 1]} de ${m.slice(0, 4)}`
const andar = (m: string, k: number) => { const a = Number(m.slice(0, 4)), x = Number(m.slice(5, 7)) - 1 + k; return `${a + Math.floor(x / 12)}-${String(((x % 12) + 12) % 12 + 1).padStart(2, '0')}` }
const hojeMes = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }).slice(0, 7)
const pctTxt = (v: number) => `${String(v).replace('.', ',')}%`
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const mesCurto = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`
const ST: Record<string, string> = { rascunho: 'rascunho', pendente_aprovacao: 'esperando aprovação', aprovada: 'aprovada', paga: 'paga', lancada: 'lançada no Omie' }

export default function ComissoesAba({ tecnicosDoMes }: { tecnicosDoMes: React.ReactNode }) {
  const [quem, setQuem] = useState<'tec' | 'esc'>('tec')
  return (
    <div className="ca">
      <style>{ESTILO_CA}</style>
      <div className="ca-seg" role="tablist" aria-label="Funcionários">
        <span>Funcionários:</span>
        <button type="button" role="tab" aria-selected={quem === 'tec'} className={quem === 'tec' ? 'on' : ''} onClick={() => setQuem('tec')}><i className="fas fa-screwdriver-wrench" /> Técnicos</button>
        <button type="button" role="tab" aria-selected={quem === 'esc'} className={quem === 'esc' ? 'on' : ''} onClick={() => setQuem('esc')}><i className="fas fa-building" /> Escritório</button>
      </div>
      {quem === 'tec' ? (
        <div className="ca-corpo">
          <CaixinhaMec />
          {tecnicosDoMes}
          <JanelaEmbutida><ComissoesJanela /></JanelaEmbutida>
        </div>
      ) : <Escritorio />}
    </div>
  )
}

function Escritorio() {
  const [mes, setMes] = useState(hojeMes)
  const [d, setD] = useState<DadosEsc | null>(null)
  const [erro, setErro] = useState('')
  const [aberto, setAberto] = useState<string | null>(null)
  const ler = async (m: string) => {
    setErro('')
    try {
      const r = await fetch(`/api/mecanicos/comissao-escritorio?mes=${m}`, { headers: await authHeaders(), cache: 'no-store' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Falha ao calcular')
      setD(j)
    } catch (e) { setErro(e instanceof Error ? e.message : 'Falha ao calcular') }
  }
  useEffect(() => { void ler(mes) }, [mes])
  const pessoaAberta = d?.pessoas.find((p) => p.nome === aberto) || null
  return (
    <div className="ca-corpo">
      <style>{ESTILO_CT}</style><style>{ESTILO_CT2}</style><style>{ESTILO_CT3}</style>
      <div className="ca-mes">
        <button type="button" onClick={() => setMes(andar(mes, -1))} aria-label="Mês anterior"><i className="fas fa-chevron-left" /></button>
        <span><i className="fas fa-calendar" /> {nomeMes(mes)}</span>
        <button type="button" onClick={() => setMes(andar(mes, 1))} disabled={mes >= hojeMes()} aria-label="Próximo mês"><i className="fas fa-chevron-right" /></button>
        {!d && !erro && <small><i className="fas fa-circle-notch fa-spin" /> calculando…</small>}
      </div>
      {erro && <p className="ca-erro">{erro}</p>}
      {d && (
        <div className="s1-grade">
          {d.pessoas.map((p, i) => p.funcao === 'garantista' ? (
            <article key={p.nome} className={`s1 s1-capa abre ${aberto === p.nome ? 'ca-on' : ''}`} style={{ animationDelay: `${i * 110}ms` }} role="button" tabIndex={0}
              onClick={() => setAberto(aberto === p.nome ? null : p.nome)} onKeyDown={(e) => { if (e.key === 'Enter') setAberto(aberto === p.nome ? null : p.nome) }}>
              <div className="s1c-topo"><span className="s1-sit" style={{ color: '#047857', background: '#ecfdf5' }}>● Garantista</span></div>
              <div className="s1c-nome"><b>{p.nome}</b></div>
              <div className="s1c-com">
                <small>Comissão de {NOMES_MES[Number(mes.slice(5, 7)) - 1]}</small>
                <b><Odometro texto={brl2(d.total)} /></b>
                <span><i className="fas fa-receipt" /> {pctTxt(d.config.pctGarantia)} das garantias + {pctTxt(d.config.pctRevisao)} das revisões</span>
              </div>
              <div className="s1c-nums">
                <div title="OS de garantia faturadas no mês: serviço + peças"><small>Garantias</small><b>{brl2(d.conta.garantias)}</b><em>{d.bases.garantias.length} OS · {brl2(d.conta.comGarantia)}</em></div>
                <div title="OS de revisão faturadas no mês: serviço + peças"><small>Revisões</small><b>{brl2(d.conta.revisoes)}</b><em>{d.bases.revisoes.length} OS · {brl2(d.conta.comRevisao)}</em></div>
                <div title="Última comissão lançada no RH"><small>No RH</small><b>{p.comissoes[0] ? brl2(p.comissoes[0].valor) : '—'}</b><em>{p.comissoes[0] ? `${p.comissoes[0].mes.slice(5)}/${p.comissoes[0].mes.slice(2, 4)} · ${p.comissoes[0].status}` : 'sem lançamento'}</em></div>
              </div>
              <span className="s1c-ver">{aberto === p.nome ? 'Fechar' : 'Ver as OS'} <i className={`fas ${aberto === p.nome ? 'fa-chevron-up' : 'fa-arrow-right'}`} /></span>
            </article>
          ) : (
            <article key={p.nome} className="s1 s1-capa" style={{ animationDelay: `${i * 110}ms` }}>
              <div className="s1c-topo"><span className="s1-sit" style={{ color: '#92400e', background: '#fffbeb' }}>● Regra a definir</span></div>
              <div className="s1c-nome"><b>{p.nome}</b></div>
              <div className="s1c-com"><small>Comissão</small><b className="vazio">—</b><span><i className="fas fa-circle-info" /> {p.rh ? 'a regra dela ainda vai ser definida' : 'não achada no cadastro do RH'}</span></div>
            </article>
          ))}
          {!d.pessoas.some((p) => p.funcao === 'garantista') && <p className="ca-mudo">Ninguém com a função Garantista. Marque em Administração → usuário → Gestão Pós Vendas → Garantista.</p>}
        </div>
      )}
      {d && pessoaAberta && <DetalheEscritorio d={d} p={pessoaAberta} onMudou={() => void ler(mes)} />}
    </div>
  )
}

/** Detalhe do garantista: a conta, as OS de garantia e de revisão do mês e o histórico do RH. */
function DetalheEscritorio({ d, p, onMudou }: { d: DadosEsc; p: PessoaEsc; onMudou: () => void }) {
  const [aba, setAba] = useState<'gar' | 'rev' | 'rh'>('gar')
  const [pct, setPct] = useState(String(d.config.pctRevisao).replace('.', ','))
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState('')
  const salvar = async () => {
    setSalvando(true); setMsg('')
    try {
      const r = await fetch('/api/mecanicos/comissao-escritorio', { method: 'PUT', headers: { ...(await authHeaders()), 'Content-Type': 'application/json' }, body: JSON.stringify({ pctRevisao: Number(pct.replace(',', '.')) }) })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Não salvou')
      setMsg('Salvo.'); onMudou()
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Não salvou') } finally { setSalvando(false) }
  }
  const lista = aba === 'gar' ? d.bases.garantias : d.bases.revisoes
  return (
    <section className="ca-det">
      <div className="ca-conta">
        <div><small>Garantias faturadas</small><b>{brl2(d.conta.garantias)}</b><span>× {pctTxt(d.config.pctGarantia)} = <b>{brl2(d.conta.comGarantia)}</b></span></div>
        <i>+</i>
        <div><small>Revisões faturadas</small><b>{brl2(d.conta.revisoes)}</b>
          <span>× {d.podeEditar
            ? <><input value={pct} onChange={(e) => setPct(e.target.value)} inputMode="decimal" aria-label="% das revisões" />% <button type="button" disabled={salvando || Number(pct.replace(',', '.')) === d.config.pctRevisao} onClick={() => void salvar()}>{salvando ? 'salvando…' : 'salvar'}</button></>
            : pctTxt(d.config.pctRevisao)} = <b>{brl2(d.conta.comRevisao)}</b></span>
          {!d.podeEditar && <em>só o Gerente do Pós-Vendas muda essa %</em>}
          {msg && <em>{msg}</em>}
        </div>
        <i>=</i>
        <div className="res"><small>Comissão de {p.nome.split(' ')[0]}</small><b>{brl2(d.total)}</b></div>
      </div>
      <div className="ca-abas">
        <button type="button" className={aba === 'gar' ? 'on' : ''} onClick={() => setAba('gar')}>Garantias ({d.bases.garantias.length})</button>
        <button type="button" className={aba === 'rev' ? 'on' : ''} onClick={() => setAba('rev')}>Revisões ({d.bases.revisoes.length})</button>
        <button type="button" className={aba === 'rh' ? 'on' : ''} onClick={() => setAba('rh')}>Histórico no RH ({p.comissoes.length})</button>
      </div>
      {aba !== 'rh' ? (
        lista.length === 0 ? <p className="ca-mudo">Nenhuma OS {aba === 'gar' ? 'de garantia' : 'de revisão'} faturada neste mês.</p> : (
          <div className="ca-lista">
            {lista.map((o) => <div key={o.os} className="ca-l ca-os"><span>{o.data.slice(8, 10)}/{o.data.slice(5, 7)}</span><span><b>{o.numero ? `OS ${o.numero}` : o.os}</b> · {o.cliente}<small>{o.tipo}</small></span><b>{brl2(o.total)}</b></div>)}
          </div>
        )
      ) : (
        p.comissoes.length === 0 ? <p className="ca-mudo">Nenhuma comissão lançada no RH.</p> : (
          <div className="ca-lista">
            {p.comissoes.map((c) => <div key={c.mes} className="ca-l" title={c.origem}><span>{c.mes.slice(5)}/{c.mes.slice(2, 4)}</span><b>{brl2(c.valor)}</b><em className={c.status}>{ST[c.status] || c.status.replace('_', ' ')}</em></div>)}
          </div>
        )
      )}
    </section>
  )
}

const ESTILO_CA = `
.ca { display: grid; gap: 14px }
.ca-seg { display: inline-flex; align-items: center; gap: 6px; justify-self: start; padding: 5px; border-radius: 99px; background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e5e7eb) }
.ca-seg > span { font-size: 13px; color: var(--portal-text-muted, #64748b); padding: 0 6px 0 10px }
.ca-seg button { border: 0; background: transparent; font: inherit; font-size: 14px; padding: 8px 16px; border-radius: 99px; cursor: pointer; color: var(--portal-text, #0f172a); display: inline-flex; gap: 8px; align-items: center }
.ca-seg button:hover { background: #ecfdf5 } .ca-seg button.on { background: #047857; color: #fefefe; font-weight: 600 }
.ca-corpo { display: grid; gap: 14px; animation: aaEntra .3s ease both }
.ca-aviso { margin: 0; padding: 10px 14px; border-radius: 12px; background: #fffbeb; border: 1px solid #fde68a; color: #92400e; font-size: 13.5px }
.ca-erro { margin: 0; color: #b91c1c; font-size: 13px } .ca-mudo { margin: 0; color: var(--portal-text-muted, #64748b); font-size: 13px }
.ca-mes { display: flex; gap: 8px; align-items: center } .ca-mes button { width: 34px; height: 34px; border-radius: 50%; border: 1px solid var(--portal-border, #e5e7eb); background: var(--portal-bg-card, #fefefe); cursor: pointer } .ca-mes button:disabled { opacity: .4 } .ca-mes span { font-weight: 600; padding: 0 6px } .ca-mes small { color: #64748b }
.s1.ca-on { outline: 2px solid #047857; outline-offset: 2px }
.ca-det { display: grid; gap: 14px; background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e5e7eb); border-radius: 18px; padding: 16px 18px; animation: aaEntra .3s ease both }
.ca-conta { display: flex; gap: 14px; align-items: center; flex-wrap: wrap } .ca-conta > i { font-style: normal; font-size: 22px; color: #94a3b8 }
.ca-conta > div { display: grid; gap: 2px; padding: 12px 14px; border-radius: 14px; background: #f8fafc; min-width: 200px } .ca-conta small { font-size: 12px; color: #64748b } .ca-conta > div > b { font-size: 22px }
.ca-conta span { font-size: 13px; color: #334155; display: flex; gap: 6px; align-items: center; flex-wrap: wrap } .ca-conta em { font-style: normal; font-size: 11.5px; color: #64748b }
.ca-conta input { width: 56px; border: 1px solid #cbd5e1; border-radius: 8px; padding: 4px 6px; font: inherit; text-align: right } .ca-conta button { border: 0; border-radius: 99px; padding: 4px 10px; background: #047857; color: #fefefe; font: inherit; font-size: 12px; cursor: pointer } .ca-conta button:disabled { opacity: .45 }
.ca-conta .res { background: #ecfdf5 } .ca-conta .res b { color: #047857 }
.ca-abas { display: flex; gap: 20px; border-bottom: 1px solid var(--portal-border, #e5e7eb) } .ca-abas button { border: 0; background: none; padding: 8px 0 10px; font: inherit; font-size: 14px; color: #64748b; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px } .ca-abas button.on { color: #0f172a; font-weight: 600; border-bottom-color: #047857 }
.ca-l.ca-os { grid-template-columns: 60px 1fr auto } .ca-os span small { display: block; font-size: 12px; color: #64748b }
.ca-pessoas { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 12px }
.ca-p { background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e5e7eb); border-radius: 16px; padding: 14px; display: grid; gap: 10px }
.ca-p-cab { display: flex; gap: 12px; align-items: center } .ca-p-cab div { display: grid } .ca-p-cab b { font-size: 15px } .ca-p-cab small { font-size: 12px; color: var(--portal-text-muted, #64748b) }
.ca-ini { width: 42px; height: 42px; border-radius: 50%; display: grid; place-items: center; background: #ecfdf5; color: #047857; font-weight: 700 }
.ca-lista { display: grid; gap: 4px }
.ca-l { display: grid; grid-template-columns: 60px 1fr auto; gap: 10px; align-items: center; padding: 6px 0; border-top: 1px solid var(--portal-border, #f1f5f9); font-size: 13.5px }
.ca-l b { font-weight: 600 } .ca-l em { font-style: normal; font-size: 11.5px; padding: 2px 8px; border-radius: 99px; background: #f1f5f9; color: #475569 }
.ca-l em.paga { background: #dcfce7; color: #166534 } .ca-l em.rascunho { background: #fef3c7; color: #92400e }
`
