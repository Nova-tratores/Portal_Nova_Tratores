'use client'
// Página de TESTE do topo da Gestão Pós Vendas (José, 30/10/2026: "deixar essas informações de uma forma que quando o
// usuário olhe, não assuste ele com tanta informação"). Dados reais; nada aqui muda a tela de verdade.
import { useMemo, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import SemPermissao from '@/components/SemPermissao'
import { useBasePosVendas } from '@/components/mecanicos/useBasePosVendas'
import { periodos, andarPeriodo, diasUteis, montarPainel, SEM_META, SEM_TECNICO, type Escala } from '@/lib/mecanicos/painel'

const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const ASSUNTOS = ['Faturamento por período', 'Para onde foi o dinheiro', 'Dinheiro parado', 'Garantias']
const ASSUNTO_CURTO = ['Faturamento', 'Dinheiro', 'Parado', 'Garantias']
const ESCALAS: [Escala, string][] = [['dia', 'Dia'], ['semana', 'Semana'], ['mes', 'Mês'], ['ano', 'Ano']]
const AGORA: Record<Escala, string> = { dia: 'Hoje', semana: 'Esta semana', mes: 'Este mês', ano: 'Este ano' }
const br = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`

export default function TesteTopoPage() {
  const { userProfile } = useAuth()
  const { temAcesso, loading } = usePermissoes(userProfile?.id)
  const { base } = useBasePosVendas()
  const hoje = hojeSP()
  const [lado, setLado] = useState<'Resultados' | 'Equipe'>('Resultados')
  const [assunto, setAssunto] = useState(0)
  const [e, setE] = useState<Escala>('semana')
  const [ref, setRef] = useState(hoje)
  const [abreFiltro, setAbreFiltro] = useState(false)

  const sel = periodos(e, ref, 1)[0]
  const andamento = sel.ate > hoje || sel.de <= hoje && sel.ate >= hoje
  const nomePeriodo = andamento ? AGORA[e] : e === 'dia' ? br(sel.de) : `${br(sel.de)} a ${br(sel.ate)}`
  const ir = (n: number) => { const r = andarPeriodo(e, ref, n); setRef(r > hoje ? hoje : r) }
  // mesma conta dos selos da tela real, com só as OS faturadas na conta (o padrão dela)
  const metas = useMemo(() => {
    if (!base) return null
    const tecs = montarPainel(base, e, ref, hoje, false).linhas.filter((l) => l.tecnico !== SEM_TECNICO && !SEM_META.has(l.tecnico) && l.meta > 0).length
    const semanas = diasUteis(sel.de, sel.ate) / 5
    if (!tecs || !semanas) return null
    const ate = sel.ate > hoje ? hoje : sel.ate
    const feito = base.faturadas.filter((o) => !o.garantia && o.data >= sel.de && o.data <= ate).reduce((a, o) => a + o.bruto, 0)
    return { basica: Math.round((feito / (4000 * semanas * tecs)) * 100), ideal: Math.round((feito / (8000 * semanas * tecs)) * 100) }
  }, [base, e, ref, hoje, sel.de, sel.ate])
  const pct = metas ? `${metas.basica}%` : '…'
  const pctIdeal = metas ? `${metas.ideal}%` : '…'

  if (!loading && userProfile && !temAcesso('mecanicos')) return <SemPermissao />

  const Lados = () => <div className="tt-lados">{(['Resultados', 'Equipe'] as const).map((x) => <button key={x} type="button" className={lado === x ? 'on' : ''} onClick={() => setLado(x)}>{x}</button>)}</div>
  const Periodo = () => (
    <div className="tt-per">
      <button type="button" onClick={() => ir(-1)} aria-label="período anterior">‹</button>
      <select value={e} onChange={(ev) => { setE(ev.target.value as Escala); setRef(hoje) }} aria-label="tamanho do período">{ESCALAS.map(([k, r]) => <option key={k} value={k}>{r}</option>)}</select>
      <b>{nomePeriodo}</b>
      <button type="button" onClick={() => ir(1)} disabled={sel.ate >= hoje} aria-label="próximo período">›</button>
    </div>
  )
  const Icones = () => <div className="tt-ic"><button type="button" title="Tratorilson"><i className="fas fa-robot" /></button><button type="button" title="Tela cheia"><i className="fas fa-expand" /></button></div>

  return (
    <div className="tt">
      <style>{ESTILO}</style>
      <span className="tt-selo">página de teste</span>
      <h1>Topo da Gestão Pós Vendas</h1>
      <p className="tt-int">Quatro formas do mesmo topo, com os números reais. Todos os botões respondem; escolha um número. Nada aqui muda a tela de verdade.</p>
      {!base && <p className="tt-int">carregando os números…</p>}

      <section>
        <h2>Opção 1 · Como está hoje <small>11 itens na tela de uma vez</small></h2>
        <div className="tt-caixa">
          <div className="tt-lin"><div className="tt-grandes">{([['Resultados', 'dinheiro, horas e gastos'], ['Equipe', 'horas, pontos e defesas']] as const).map(([x, s]) => <button key={x} type="button" className={lado === x ? 'on' : ''} onClick={() => setLado(x)}><b>{x}</b><small>{s}</small></button>)}</div><button type="button" className="tt-pil"><i className="fas fa-robot" /> Tratorilson</button><span className="tt-fim" /><Icones /></div>
          <div className="tt-abas">{ASSUNTOS.map((a, i) => <button key={a} type="button" className={assunto === i ? 'on' : ''} onClick={() => setAssunto(i)}>{a}</button>)}</div>
          <div className="tt-lin"><div className="tt-seg">{ESCALAS.map(([k, r]) => <button key={k} type="button" className={e === k ? 'on' : ''} onClick={() => { setE(k); setRef(hoje) }}>{r}</button>)}</div><span className="tt-nome">{nomePeriodo}</span><span className="tt-selom">Meta básica <b>{pct}</b></span><span className="tt-selom">Meta ideal <b>{pctIdeal}</b></span></div>
        </div>
      </section>

      <section>
        <h2>Opção 2 · Só uma linha <small>uma meta na tela; a ideal aparece ao passar o mouse</small></h2>
        <div className="tt-caixa">
          <div className="tt-lin"><Lados /><div className="tt-texto">{ASSUNTO_CURTO.map((a, i) => <button key={a} type="button" className={assunto === i ? 'on' : ''} onClick={() => setAssunto(i)} title={ASSUNTOS[i]}>{a}</button>)}</div><span className="tt-fim" /><Periodo /><span className="tt-meta" title={`Meta ideal: ${pctIdeal}`}>{pct} da meta</span><Icones /></div>
        </div>
      </section>

      <section>
        <h2>Opção 3 · Uma frase primeiro <small>a pessoa lê o resultado antes de ver os botões</small></h2>
        <div className="tt-caixa">
          <p className="tt-frase">{nomePeriodo}, a equipe está em <b>{pct} da meta</b>.</p>
          <div className="tt-lin"><Lados /><select className="tt-sel" value={assunto} onChange={(ev) => setAssunto(Number(ev.target.value))} aria-label="O que ver">{ASSUNTOS.map((a, i) => <option key={a} value={i}>{a}</option>)}</select><span className="tt-fim" /><Periodo /><Icones /></div>
        </div>
      </section>

      <section>
        <h2>Opção 4 · O resto guardado em &quot;Filtros&quot; <small>só o assunto fica à vista; o período e as metas abrem no botão</small></h2>
        <div className="tt-caixa">
          <div className="tt-lin"><Lados /><div className="tt-texto">{ASSUNTO_CURTO.map((a, i) => <button key={a} type="button" className={assunto === i ? 'on' : ''} onClick={() => setAssunto(i)} title={ASSUNTOS[i]}>{a}</button>)}</div><span className="tt-fim" /><button type="button" className="tt-pil" onClick={() => setAbreFiltro((v) => !v)} aria-expanded={abreFiltro}><i className="fas fa-sliders" /> {nomePeriodo}</button><Icones /></div>
          {abreFiltro && <div className="tt-lin tt-aberto"><Periodo /><span className="tt-selom">Meta básica <b>{pct}</b></span><span className="tt-selom">Meta ideal <b>{pctIdeal}</b></span></div>}
        </div>
      </section>
    </div>
  )
}

const ESTILO = `
.tt { padding: clamp(14px, 2vw, 24px) clamp(12px, 2vw, 28px); background: var(--primary-light, #F5F0E8); min-height: 100vh; color: #0f172a; display: grid; gap: 22px; align-content: start }
.tt > * { margin: 0 } .tt h1 { font-size: 22px; font-weight: 600 } .tt-int { font-size: 14.5px; color: #334155 }
.tt-selo { justify-self: start; font-size: 12.5px; color: #7c3aed; background: #f5f3ff; border: 1px dashed #c4b5fd; border-radius: 99px; padding: 3px 10px }
.tt section { display: grid; gap: 8px } .tt h2 { margin: 0; font-size: 16px; font-weight: 600 } .tt h2 small { margin-left: 8px; font-size: 13px; font-weight: 400; color: #64748b }
.tt-caixa { display: grid; gap: 12px; padding: 14px 16px; background: #faf7f2; border: 1px solid #e7e0d5; border-radius: 16px }
.tt-lin { display: flex; flex-wrap: wrap; align-items: center; gap: 12px } .tt-fim { flex: 1 }
.tt button, .tt select { font: inherit; cursor: pointer }
.tt-lados { display: inline-flex; padding: 3px; gap: 2px; border-radius: 10px; background: #ece6dc } .tt-lados button { border: 0; background: none; border-radius: 8px; padding: 6px 14px; font-size: 14px; color: #475569 } .tt-lados .on { background: #fefefe; color: #0f172a; box-shadow: 0 1px 2px rgba(15,23,42,.1) }
.tt-texto { display: inline-flex; flex-wrap: wrap; gap: 16px; margin-left: 8px } .tt-texto button { border: 0; background: none; padding: 6px 0; font-size: 14.5px; color: #64748b; border-bottom: 2px solid transparent } .tt-texto .on { color: #0f172a; border-color: #0369a1 }
.tt-per { display: inline-flex; align-items: center; gap: 8px; font-size: 14.5px } .tt-per b { font-weight: 500; min-width: 90px; text-align: center } .tt-per button { width: 30px; height: 30px; border-radius: 50%; border: 1px solid #d6cfc3; background: #fefefe; font-size: 16px } .tt-per button:disabled { opacity: .35; cursor: default } .tt-per select { border: 1px solid #d6cfc3; background: #fefefe; border-radius: 8px; padding: 5px 8px; font-size: 14px }
.tt-meta { font-size: 14.5px; font-weight: 500; color: #0f766e; cursor: help }
.tt-ic { display: inline-flex; gap: 6px } .tt-ic button { width: 34px; height: 34px; border-radius: 10px; border: 0; background: none; color: #64748b } .tt-ic button:hover { background: #ece6dc; color: #0f172a }
.tt-frase { margin: 0; font-size: 18px; color: #334155 } .tt-frase b { font-weight: 600; color: #0f172a }
.tt-sel { border: 1px solid #d6cfc3; background: #fefefe; border-radius: 10px; padding: 7px 10px; font-size: 14.5px }
.tt-pil { display: inline-flex; align-items: center; gap: 8px; height: 36px; padding: 0 14px; border-radius: 99px; border: 1px solid #d6cfc3; background: #fefefe; color: #0f172a; font-size: 14px }
.tt-aberto { padding-top: 12px; border-top: 1px solid #e7e0d5 }
.tt-grandes { display: inline-flex; gap: 4px; padding: 4px; background: #fefefe; border-radius: 14px } .tt-grandes button { display: grid; text-align: left; border: 0; background: none; border-radius: 10px; padding: 7px 18px; color: #94a3b8 } .tt-grandes b { font-size: 14.5px; font-weight: 600 } .tt-grandes small { font-size: 12px } .tt-grandes .on { background: #e0f2fe; color: #0f172a }
.tt-abas { display: flex; gap: 6px; padding: 5px; background: #fefefe; border-radius: 12px; overflow-x: auto } .tt-abas button { flex: 1 0 auto; height: 40px; border: 0; background: none; border-radius: 9px; padding: 0 14px; font-size: 14px; color: #334155 } .tt-abas .on { background: #2563eb; color: #fefefe }
.tt-seg { display: inline-flex; padding: 3px; background: #ece6dc; border-radius: 10px } .tt-seg button { border: 0; background: none; border-radius: 8px; padding: 6px 14px; font-size: 14px; color: #475569 } .tt-seg .on { background: #fefefe; color: #0f172a }
.tt-nome { font-size: 16px; font-weight: 500 } .tt-selom { padding: 5px 12px; border: 1px solid #99c9c1; border-radius: 99px; font-size: 13.5px; color: #0f766e; background: #f0fdfa } .tt-selom b { font-weight: 600; margin-left: 4px }
@media (max-width: 720px) { .tt-texto { margin-left: 0 } .tt-frase { font-size: 16px } }
`
