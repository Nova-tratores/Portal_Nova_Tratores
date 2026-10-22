'use client'
// "O mês em uma página" — versão nova do simulador do "Para onde foi o dinheiro" (José, 21/10/2026: "deixa tudo
// melhor, mais fácil de entender, de forma que não deixe de informar nada, me surpreenda"). Mesma conta do
// simulador de hoje (useSimulacao), contada como uma história: o resumo do mês, de onde veio e para onde foi
// (fluxo animado), o simulador por assunto e as perguntas que a tela responde. PÁGINA DE TESTE.
import { useState } from 'react'
import { useSimulacao, RegSim, rotuloApoio, CE, CS, type Conta } from './DinheiroOpcoes'
import { brl, horas, kmFmt, Numero } from './ui'

const TXT = '#0f172a', MUDO = '#475569', CLARO = '#64748b'
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
/** "out/26" → "outubro de 2026" */
const mesExtenso = (r: string) => { const [m, a] = r.split('/'); const i = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'].indexOf(m); return i >= 0 ? `${MESES[i]} de 20${a}` : r }

// ---------------------------------------------------------------- fluxo (de onde veio → para onde foi)

type No = { k: string; r: string; v: number; cor: string; alvo?: Aba }
type Aba = 'ent' | 'gas' | 'pes'

function Fluxo({ fontes, destinos, total, onAbrir }: { fontes: No[]; destinos: No[]; total: number; onAbrir: (a: Aba) => void }) {
  const [foco, setFoco] = useState<string | null>(null)
  const W = 1000, H = 300, NW = 14, GAP = 10, xL = 0, xM = 470, xR = W - NW
  const util = (n: number) => H - GAP * Math.max(0, n - 1)
  const escala = (n: number) => (total > 0 ? util(n) / total : 0)
  const empilhar = (lista: No[]) => { let y = 0; const e = escala(lista.length); return lista.map((x) => { const h = Math.max(2, x.v * e); const r = { ...x, y, h }; y += h + GAP; return r }) }
  const L = empilhar(fontes), R = empilhar(destinos)
  const hM = total * Math.min(escala(fontes.length), escala(destinos.length))
  const yM = (H - hM) / 2
  const fita = (x1: number, y1: number, h1: number, x2: number, y2: number, h2: number) => {
    const c1 = x1 + (x2 - x1) * 0.5
    return `M${x1},${y1} C${c1},${y1} ${c1},${y2} ${x2},${y2} L${x2},${y2 + h2} C${c1},${y2 + h2} ${c1},${y1 + h1} ${x1},${y1 + h1} Z`
  }
  const kM = hM / Math.max(total, 1)
  // posição de cada fita no nó do meio (entradas empilham de cima para baixo, saídas também)
  const yE: number[] = [], yS: number[] = []
  for (let i = 0, a = yM; i < L.length; i++) { yE.push(a); a += L[i].v * kM }
  for (let i = 0, b = yM; i < R.length; i++) { yS.push(b); b += R[i].v * kM }
  return (
    <div className="hx-fluxo">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="De onde veio e para onde foi o dinheiro do mês">
        {L.map((n, i) => { const p = fita(xL + NW, n.y, n.h, xM, yE[i], n.v * kM); return <path key={n.k} d={p} fill={n.cor} className={`hx-fita ${foco && foco !== n.k ? 'apaga' : ''}`} onMouseEnter={() => setFoco(n.k)} onMouseLeave={() => setFoco(null)} /> })}
        {R.map((n, i) => { const p = fita(xM + NW, yS[i], n.v * kM, xR, n.y, n.h); return <path key={n.k} d={p} fill={n.cor} className={`hx-fita ${foco && foco !== n.k ? 'apaga' : ''}`} onMouseEnter={() => setFoco(n.k)} onMouseLeave={() => setFoco(null)} /> })}
        {L.map((n) => <rect key={n.k} x={xL} y={n.y} width={NW} height={n.h} rx={3} fill={n.cor} />)}
        <rect x={xM} y={yM} width={NW} height={hM} rx={3} fill="#0f172a" />
        {R.map((n) => <rect key={n.k} x={xR} y={n.y} width={NW} height={n.h} rx={3} fill={n.cor} />)}
      </svg>
      {/* rótulos em HTML por cima (texto nítido em qualquer largura) */}
      <div className="hx-rot esq">{L.map((n) => <button type="button" key={n.k} style={{ top: `${((n.y + n.h / 2) / H) * 100}%`, '--c': n.cor } as React.CSSProperties} className={foco === n.k ? 'on' : ''} onMouseEnter={() => setFoco(n.k)} onMouseLeave={() => setFoco(null)} onClick={() => n.alvo && onAbrir(n.alvo)}><b>{n.r}</b><span>{brl(n.v)} · {total ? Math.round((n.v / total) * 100) : 0}%</span></button>)}</div>
      <div className="hx-rot meio" style={{ top: `${((yM + hM / 2) / H) * 100}%`, left: `${((xM + NW) / W) * 100}%` }}><b>Faturou</b><span>{brl(fontes.filter((f) => f.k !== 'faltou').reduce((s, f) => s + f.v, 0))}</span></div>
      <div className="hx-rot dir">{R.map((n) => <button type="button" key={n.k} style={{ top: `${((n.y + n.h / 2) / H) * 100}%`, '--c': n.cor } as React.CSSProperties} className={foco === n.k ? 'on' : ''} onMouseEnter={() => setFoco(n.k)} onMouseLeave={() => setFoco(null)} onClick={() => n.alvo && onAbrir(n.alvo)}><b>{n.r}</b><span>{brl(n.v)} · {total ? Math.round((n.v / total) * 100) : 0}%</span></button>)}</div>
    </div>
  )
}

/** Rosca: de cada R$ 100, gastos / pessoal / sobrou. */
function Rosca({ g, p, s, e }: { g: number; p: number; s: number; e: number }) {
  const R = 54, C = 2 * Math.PI * R
  const tot = Math.max(e, g + p + Math.max(0, s), 1)
  const seg = [{ v: g, cor: CS.gastos }, { v: p, cor: CS.pessoal }, { v: Math.max(0, s), cor: CS.ficou }]
  let acc = 0
  return (
    <svg viewBox="0 0 140 140" className="hx-rosca" aria-hidden>
      <circle cx="70" cy="70" r={R} fill="none" stroke="#eef2f6" strokeWidth="16" />
      {seg.map((x, i) => { const len = (x.v / tot) * C; const el = <circle key={i} cx="70" cy="70" r={R} fill="none" stroke={x.cor} strokeWidth="16" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-acc} transform="rotate(-90 70 70)" style={{ transition: 'stroke-dasharray .6s, stroke-dashoffset .6s' }} />; acc += len; return el })}
    </svg>
  )
}

// ---------------------------------------------------------------- a tela

export function SimuladorHistoria({ c }: { c: Conta }) {
  const S = useSimulacao(c)
  const [aba, setAba] = useState<Aba>('ent')
  const [verEquipe, setVerEquipe] = useState(false)
  const [verDesc, setVerDesc] = useState(false)
  const { val, set, mudou, bruto, gastos, pessoal, ficou, p100, dif, ent, pItens } = S
  const mesTxt = mesExtenso(c.rotulo)
  const ant = c.ant && c.ant.bruto > 0 ? Math.round((c.ant.resultado / c.ant.bruto) * 100) : null
  const ant100 = ant == null ? null : Math.round(p100) - ant
  const abrir = (a: Aba) => { setAba(a); document.getElementById('hx-simule')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }

  // fluxo
  const fontes: No[] = ([
    { k: 'mo', r: 'Mão de obra', v: ent.mo, cor: CE.mo, alvo: 'ent' },
    { k: 'km', r: 'Deslocamento', v: ent.km, cor: CE.km, alvo: 'ent' },
    { k: 'pecas', r: 'Peças', v: ent.pecas, cor: CE.pecas, alvo: 'ent' },
    { k: 'outros', r: 'Outros', v: ent.outros, cor: CE.outros, alvo: 'ent' },
    ...(S.voltaDesc > 0.5 ? [{ k: 'desc', r: 'Desconto a menos', v: S.voltaDesc, cor: '#d97706', alvo: 'ent' as Aba }] : []),
    ...(ficou < 0 ? [{ k: 'faltou', r: 'Faltou (prejuízo)', v: -ficou, cor: CS.faltou }] : []),
  ] as No[]).filter((x) => x.v > 0.5)
  const destinos: No[] = ([
    { k: 'gastos', r: 'Gastos', v: gastos, cor: CS.gastos, alvo: 'gas' },
    { k: 'sal', r: 'Salários e encargos', v: pItens.salario, cor: CS.pessoal, alvo: 'pes' },
    { k: 'com', r: 'Comissões', v: pItens.comissao, cor: '#a78bfa', alvo: 'pes' },
    ...(pItens.rescisao > 0.5 ? [{ k: 'resc', r: 'Rescisões', v: pItens.rescisao, cor: '#c4b5fd', alvo: 'pes' as Aba }] : []),
    ...(ficou > 0 ? [{ k: 'sobrou', r: 'Sobrou para a empresa', v: ficou, cor: CS.ficou }] : []),
  ] as No[]).filter((x) => x.v > 0.5)
  const totalFluxo = Math.max(fontes.reduce((s, x) => s + x.v, 0), destinos.reduce((s, x) => s + x.v, 0))

  const linhas: [string, string, number, number, boolean][] = [
    ['Entrou', '', c.bruto, bruto, false], ['Gastos', '−', c.gastos, gastos, true], ['Pessoal', '−', c.pessoal, pessoal, true], [ficou >= 0 ? 'Sobrou' : 'Faltou', '=', c.resultado, ficou, false],
  ]
  const somaAba = (a: Aba) => (a === 'ent' ? [c.bruto, bruto] : a === 'gas' ? [c.gastos, gastos] : [c.pessoal, pessoal])
  const efeitoAba = (a: Aba) => { const [r, s] = somaAba(a); return a === 'ent' ? s - r : r - s }

  return (
    <div className="hx">
      {/* ------------------------------------------------ 1. o resumo */}
      <section className="hx-hero">
        <div className="hx-hero-txt">
          <small>Para onde foi o dinheiro · {mesTxt}</small>
          <h2>{mudou ? 'No mês simulado, o pós-vendas deixaria' : `Em ${mesTxt}, o pós-vendas deixou`} <b style={{ color: ficou >= 0 ? CS.ficou : CS.faltou }}><Numero valor={ficou} formato={brl} /></b> {ficou >= 0 ? 'para a empresa.' : 'de prejuízo.'}</h2>
          <p>Faturou <b>{brl(bruto)}</b>, gastou <b>{brl(gastos)}</b> com carro, almoço e materiais e pagou <b>{brl(pessoal)}</b> de salários, encargos e comissões.</p>
          <div className="hx-chips">
            {mudou && <span className={`hx-chip ${dif >= 0 ? 'bom' : 'ruim'}`}>{dif >= 0 ? '+' : '−'}{brl(Math.abs(dif))} em relação ao que foi</span>}
            {!mudou && ant100 != null && <span className={`hx-chip ${ant100 >= 0 ? 'bom' : 'ruim'}`}>{ant100 >= 0 ? '▲' : '▼'} {Math.abs(ant100)} pontos em relação ao mês anterior (R$ {ant} de cada 100)</span>}
            {c.desc.total > 0.5 && <span className="hx-chip">R$ {brl(c.desc.total).replace('R$ ', '').replace('R$', '')} de descontos já tirados do faturamento</span>}
          </div>
        </div>
        <div className="hx-hero-rosca">
          <Rosca g={gastos} p={pessoal} s={ficou} e={bruto} />
          <div className="hx-rosca-c"><b>R$ {Math.round(Math.max(p100, -999))}</b><small>de cada R$ 100<br />sobraram</small></div>
          <ul className="hx-rosca-leg">
            <li><i style={{ background: CS.gastos }} />Gastos <b>R$ {bruto ? Math.round((gastos / bruto) * 100) : 0}</b></li>
            <li><i style={{ background: CS.pessoal }} />Pessoal <b>R$ {bruto ? Math.round((pessoal / bruto) * 100) : 0}</b></li>
            <li><i style={{ background: ficou >= 0 ? CS.ficou : CS.faltou }} />{ficou >= 0 ? 'Sobrou' : 'Faltou'} <b>R$ {Math.abs(Math.round(p100))}</b></li>
          </ul>
        </div>
      </section>

      {/* ------------------------------------------------ 2. de onde veio, para onde foi */}
      <section className="hx-sec">
        <div className="hx-sec-t"><span>1</span><div><b>De onde veio e para onde foi</b><small>passe o mouse numa faixa para destacar · clique num nome para simular</small></div></div>
        <Fluxo fontes={fontes} destinos={destinos} total={totalFluxo} onAbrir={abrir} />
        <div className="hx-conta">
          <div className="hx-conta-l cab"><span /><span>Como foi</span><span>{mudou ? 'Simulado' : ''}</span><span>{mudou ? 'Diferença' : ''}</span></div>
          {linhas.map(([r, op, a, b, custo]) => {
            const d = b - a, igual = Math.abs(d) < 1, bom = custo ? d < 0 : d > 0
            return (
              <div key={r} className={`hx-conta-l ${op === '=' ? 'tot' : ''}`}>
                <span><em>{op}</em>{r}</span><span>{brl(a)}</span>
                <span>{mudou ? (igual ? <small>igual</small> : brl(b)) : ''}</span>
                <span className={igual ? '' : bom ? 'bom' : 'ruim'}>{mudou ? (igual ? '—' : `${d > 0 ? '+' : '−'}${brl(Math.abs(d))}`) : ''}</span>
              </div>
            )
          })}
        </div>
      </section>

      {/* simulador à esquerda, perguntas à direita (José: "divide as informações para os dois lados") */}
      <div className="hx-duas">
      {/* ------------------------------------------------ 3. simule */}
      <section className="hx-sec" id="hx-simule">
        <div className="hx-sec-t"><span>2</span><div><b>E se o mês fosse diferente?</b><small>escolha um atalho ou mexa em qualquer número — tudo na página muda junto</small></div></div>
        <div className="hx-atalhos">
          <button type="button" className={S.cen === 'real' ? 'on' : ''} onClick={() => S.aplicar('real', null)}>Como foi ({cap(c.rotulo)})</button>
          {S.melhor && <button type="button" className={S.cen === 'melhor' ? 'on' : ''} onClick={() => S.aplicar('melhor', S.melhor)}>Igual ao melhor mês ({cap(S.melhor.rotulo)})</button>}
          {S.pior && <button type="button" className={S.cen === 'pior' ? 'on' : ''} onClick={() => S.aplicar('pior', S.pior)}>Igual ao pior mês ({cap(S.pior.rotulo)})</button>}
          {S.media && <button type="button" className={S.cen === 'media' ? 'on' : ''} onClick={() => S.aplicar('media', S.media)}>Média dos últimos {S.hist.length} meses</button>}
          <button type="button" className={S.cen === 'mais20' ? 'on' : ''} onClick={() => { S.aplicar('mais20', null); S.setM({ horas: 20 }); S.setCen('mais20') }}>20% mais horas</button>
          {c.desc.total > 0.5 && <button type="button" className={S.cen === 'semdesc' ? 'on' : ''} onClick={() => { S.aplicar('semdesc', null); S.setM({ d_hora: -100, d_km: -100, d_geral: -100, d_pecas: -100 }); S.setCen('semdesc') }}>Sem nenhum desconto</button>}
          <button type="button" className={S.cen === 'corta' ? 'on' : ''} onClick={() => { const g: Record<string, number> = {}; c.gDet.forEach(([, v], i) => { if (v > 0) g[`g${i}`] = -20 }); S.setTec(0); S.setPrev(true); S.setM(g); S.setCen('corta') }}>Cortar 20% dos gastos</button>
        </div>

        <div className="hx-abas" role="tablist">
          {([['ent', 'O que entra', 'fa-arrow-down', CE.mo], ['gas', 'Gastos', 'fa-receipt', CS.gastos], ['pes', 'Pessoal', 'fa-users', CS.pessoal]] as const).map(([k, r, ic, cor]) => {
            const [ra, sa] = somaAba(k), e = efeitoAba(k)
            return (
              <button key={k} type="button" role="tab" aria-selected={aba === k} className={aba === k ? 'on' : ''} style={{ '--c': cor } as React.CSSProperties} onClick={() => setAba(k)}>
                <span><i className={`fas ${ic}`} /> {r}</span>
                <b>{brl(sa)}</b>
                <small>{Math.abs(sa - ra) < 1 ? `como foi: ${brl(ra)}` : <em className={e >= 0 ? 'bom' : 'ruim'}>{e >= 0 ? '+' : '−'}{brl(Math.abs(e))} no que sobra</em>}</small>
              </button>
            )
          })}
        </div>

        <div className="hx-painel" key={aba}>
          {aba === 'ent' && <>
            <p className="hx-explica">O que entrou nas OS faturadas do mês. Mais horas, hora mais cara, mais km ou mais peças aumentam o que entra.</p>
            <div className="hx-grade">
              <RegSim claro v={val('horas')} onSet={set('horas')} rot="Horas cobradas" ic="fa-clock" cor={CE.mo} min={-60} max={150} antes={horas(c.horas)} depois={horas(S.horasS)} extra={`${brl(ent.mo)} de mão de obra`} dica="Horas de mão de obra cobradas nas OS faturadas. A mão de obra muda junto, no valor médio da hora." />
              <RegSim claro v={val('vh')} onSet={set('vh')} rot="Valor da hora" ic="fa-tag" cor={CE.mo} min={-30} max={60} antes={`${brl(S.vh)}/h`} depois={`${brl(S.vhS)}/h`} extra={`média cobrada · tabela ${brl(S.vhTabS)}/h`} dica={`A hora de tabela é ${brl(S.vhTab)}. A média que entrou foi ${brl(S.vh)}/h: fica abaixo por causa dos descontos e da garantia (a montadora paga R$ 100/h).`} />
              <RegSim claro v={val('km')} onSet={set('km')} rot="Km cobrados" ic="fa-road" cor={CE.km} min={-60} max={150} antes={kmFmt(c.kmRod)} depois={kmFmt(c.kmRod * (1 + val('km') / 100))} extra={`${brl(S.vkm)}/km · ${brl(ent.km)}`} dica="Quilômetros de deslocamento cobrados nas OS do mês, ao valor do km." />
              <RegSim claro v={val('pecas')} onSet={set('pecas')} rot="Peças" ic="fa-gears" cor={CE.pecas} min={-60} max={150} antes={brl(c.pecas)} depois={brl(ent.pecas)} dica="Peças vendidas junto com as OS (pedido de peças faturado), pelo valor de venda." />
              <RegSim claro v={val('outros')} onSet={set('outros')} rot="Outros (requisições, extras)" ic="fa-receipt" cor={CE.outros} min={-100} max={150} antes={brl(c.outros)} depois={brl(ent.outros)} />
            </div>
            <div className={`hx-desc ${verDesc ? 'aberto' : ''}`}>
              <button type="button" onClick={() => setVerDesc((v) => !v)}><i className="fas fa-tags" /> <span>Descontos dados no mês: <b>{brl(c.desc.total)}</b> em {c.desc.nOS} OS{c.bruto > 0 ? ` (R$ ${Math.round((c.desc.total / c.bruto) * 100)} a cada R$ 100)` : ''} — já tirados do que entrou</span><i className={`fas fa-chevron-${verDesc ? 'up' : 'down'}`} /></button>
              {verDesc && <div className="hx-desc-in">
                <p className="hx-explica">Dar menos desconto aumenta o que entra; dar mais, diminui.</p>
                <div className="hx-grade">
                  {S.DESC.filter(([k]) => c.desc[k] > 0.5).map(([k, r, ic]) => (
                    <RegSim claro key={k} v={val(`d_${k}`)} onSet={set(`d_${k}`)} rot={r} ic={ic} cor="#d97706" min={-100} max={100} antes={brl(c.desc[k])} depois={brl(c.desc[k] * (1 + val(`d_${k}`) / 100))} extra={val(`d_${k}`) !== 0 ? `${val(`d_${k}`) < 0 ? '+' : '−'}${brl(Math.abs(c.desc[k] * val(`d_${k}`) / 100))} no faturamento` : undefined} />
                  ))}
                </div>
                {c.desc.maiores.length > 0 && <div className="hx-lista"><b>Maiores descontos do mês</b>{c.desc.maiores.map((o) => <div key={o.os}><span>{o.numero ? `OS ${o.numero}` : o.os}</span><em>{o.cliente || 'cliente no Omie'}</em><strong>{brl(o.valor)}</strong></div>)}</div>}
              </div>}
            </div>
          </>}

          {aba === 'gas' && <>
            <p className="hx-explica">Combustível, manutenção do carro, almoço e materiais do pós-vendas, mais as requisições de terceiros que não foram cobradas do cliente.</p>
            <div className="hx-grade">
              {S.somaG.map((x) => <RegSim claro key={x.k} v={val(x.k)} onSet={set(x.k)} rot={x.r} ic="fa-minus" cor={CS.gastos} min={-100} max={100} antes={brl(x.v)} depois={brl(x.s)} />)}
            </div>
            {S.gItens.filter((x) => x.v < 0).map((x) => <p key={x.k} className="hx-explica">{x.r}: {brl(x.v)} (fixo)</p>)}
          </>}

          {aba === 'pes' && <>
            <p className="hx-explica">Salário e encargos são conta fixa do mês inteiro, com ou sem serviço. A comissão é a lançada no RH ou, sem ela, a prevista pela mesma regra da ficha do técnico.</p>
            <div className="hx-grade">
              <RegSim claro v={val('sal')} onSet={set('sal')} rot="Reajuste de salário (com encargos)" ic="fa-money-check-dollar" cor={CS.pessoal} min={-30} max={50} antes={brl(S.salBase)} depois={brl(S.salBase * (1 + val('sal') / 100))} />
              <RegSim claro v={val('com')} onSet={set('com')} rot="Comissão" ic="fa-percent" cor={CS.pessoal} min={-100} max={100} antes={brl(S.comBase + (S.prev ? S.prevBase : 0))} depois={brl(pItens.comissao)} />
              <div className="hx-tec">
                <span><i className="fas fa-user-plus" /> Contratar técnicos</span>
                <div><button type="button" aria-label="menos um técnico" onClick={() => { S.setTec((t) => Math.max(0, t - 1)); S.setCen('') }}>−</button><b>{S.tec ? `+${S.tec}` : 'nenhum'}</b><button type="button" aria-label="mais um técnico" onClick={() => { S.setTec((t) => Math.min(10, t + 1)); S.setCen('') }}>+</button></div>
                <small>cada novo custa {brl(S.custoTec)} por mês (média do salário + encargos dos técnicos de campo){S.tec > 0 && <> · <b>+{brl(S.tec * S.custoTec)}</b></>}</small>
              </div>
              <label className="hx-chk"><input type="checkbox" checked={S.prev} onChange={(e) => { S.setPrev(e.target.checked); S.setCen('') }} /> contar a comissão prevista ({brl(S.prevBase)}) — a que ainda não está no RH</label>
            </div>
            {S.rescBase > 0.5 && <p className="hx-explica">Rescisões e acertos: {brl(S.rescBase)} (fixo)</p>}
            {c.equipe.length > 0 && (
              <div className={`hx-desc ${verEquipe ? 'aberto' : ''}`}>
                <button type="button" onClick={() => setVerEquipe((v) => !v)}><i className="fas fa-users" /> <span>Quem está na conta: <b>{S.dentro.length} de {c.equipe.length} pessoas</b> · {S.campo.length} técnicos de campo — desmarque alguém para simular sem ele</span><i className={`fas fa-chevron-${verEquipe ? 'up' : 'down'}`} /></button>
                {verEquipe && (
                  <div className="hx-eq">
                    <div className="hx-eq-l cab"><span /><span>Pessoa</span><span>Salário</span><span>Encargos</span><span>Comissão</span><span>Total</span></div>
                    {c.equipe.map((p) => {
                      const on = !S.fora.includes(p.nome)
                      const comSemEnc = p.comissao - p.encComissao + (S.prev ? p.prevista - p.encPrevista : 0)
                      const encTot = p.encargos + p.encComissao + (S.prev ? p.encPrevista : 0)
                      return (
                        <label key={p.nome} className={`hx-eq-l ${on ? '' : 'off'}`}>
                          <input type="checkbox" checked={on} onChange={() => { S.setFora((f) => (on ? [...f, p.nome] : f.filter((x) => x !== p.nome))); S.setCen('') }} />
                          <span><b>{p.nome}</b><em>{p.campo ? 'técnico de campo' : rotuloApoio(p.nome)}</em></span>
                          <span>{brl(p.salario - p.encargos)}</span>
                          <span>{brl(encTot)}</span>
                          <span>{brl(comSemEnc)}{p.comissao <= 0 && p.prevista > 0 && S.prev && <small> prevista</small>}{p.rescisao > 0.5 && <small> + resc. {brl(p.rescisao)}</small>}</span>
                          <strong>{brl(p.salario + p.comissao + (S.prev ? p.prevista : 0) + p.rescisao)}</strong>
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </>}
        </div>
      </section>

      {/* ------------------------------------------------ 4. perguntas */}
      <section className="hx-sec">
        <div className="hx-sec-t"><span>3</span><div><b>Perguntas que essa conta responde</b><small>{mudou ? 'respostas do mês simulado' : `respostas de ${mesTxt}`}</small></div></div>
        <div className="hx-pergs">
          <div className="hx-perg larga">
            <small>Quanto preciso faturar para não ter prejuízo?</small>
            {Number.isFinite(S.empate) ? <>
              <b>{brl(S.empate)}</b>
              <p>É o que paga os gastos (hoje <b>R$ {Math.round(S.taxaG * 100)}</b> de cada R$ 100 que entram) e o pessoal fixo de <b>{brl(pessoal)}</b>.</p>
              <div className="hx-trilho"><i style={{ width: `${Math.min(100, (bruto / Math.max(S.empate * 1.5, bruto, 1)) * 100)}%` }} /><em style={{ left: `${(S.empate / Math.max(S.empate * 1.5, bruto, 1)) * 100}%` }}><span>não ter prejuízo</span></em></div>
              <span className={`hx-st ${bruto >= S.empate ? 'bom' : 'ruim'}`}>{bruto >= S.empate ? <>Faturou <b>{brl(bruto - S.empate)}</b> acima disso.</> : <>Faltam <b>{brl(S.empate - bruto)}</b>{S.vhS > 0 ? <> — cerca de <b>{horas(S.horasPara(S.empate))}</b> a mais, a {brl(S.vhS)}/h</> : null}.</>}</span>
            </> : <span className="hx-st ruim">Os gastos já comem tudo o que entra: nenhum faturamento empata.</span>}
          </div>
          <div className="hx-perg larga">
            <small>Quanto preciso faturar para sobrar <span className="hx-meta">R$ <input type="number" min={0} max={80} value={S.meta} onChange={(e) => S.setMeta(Math.max(0, Math.min(80, Number(e.target.value) || 0)))} aria-label="quanto quer que sobre de cada R$ 100" /></span> de cada R$ 100?</small>
            {!Number.isFinite(S.alvo) ? <span className="hx-st ruim">Com esses gastos não dá para chegar nessa meta: diminua a meta ou os gastos.</span> : <>
              <b>{S.alvo <= bruto ? 'Já está batendo' : brl(S.alvo)}</b>
              <div className="hx-eqn">
                <span><small>Faturar</small><b>{brl(S.alvo)}</b></span><em>−</em>
                <span><small>Gastos ({Math.round(S.taxaG * 100)}%)</small><b>{brl(S.taxaG * S.alvo)}</b></span><em>−</em>
                <span><small>Pessoal</small><b>{brl(pessoal)}</b></span><em>=</em>
                <span className="sobra"><small>Sobra ({S.meta}%)</small><b>{brl(S.alvo - S.taxaG * S.alvo - pessoal)}</b></span>
              </div>
              <span className={`hx-st ${S.alvo <= bruto ? 'bom' : 'ruim'}`}>{S.alvo <= bruto ? <>Hoje sobram R$ {Math.round(p100)} de cada R$ 100 — <b>{brl(bruto - S.alvo)}</b> acima do que a meta pede.</> : <>Faltam <b>{brl(S.alvo - bruto)}</b>{S.vhS > 0 ? <> — cerca de <b>{horas(S.horasPara(S.alvo))}</b> a mais</> : null}.</>}</span>
              {S.alvo > bruto && S.vh > 0 && <button type="button" className="hx-bt" onClick={S.aplicarMeta}><i className="fas fa-wand-magic-sparkles" /> Simular com essas horas</button>}
            </>}
          </div>
          <div className="hx-perg" data-dica={`1 hora a mais na tabela (${brl(S.vhTabS)}) menos a parte dos gastos. Salário não muda com 1 hora a mais.`}><small>Quanto vale uma hora a mais?</small><b>{brl(S.vhTabS * (1 - S.taxaG))}</b><p>hora de {brl(S.vhTabS)}, já tirando os gastos</p></div>
          <div className="hx-perg" data-dica="O que entrou ÷ número de OS faturadas."><small>Quanto entra por OS?</small><b>{brl(c.nOS ? bruto / c.nOS : 0)}</b><p>{c.nOS} OS faturadas</p></div>
          <div className="hx-perg" data-dica="O que entrou ÷ técnicos de campo (os que tiveram OS, mais os contratados no simulador)."><small>Quanto fatura cada técnico?</small><b>{brl(S.nTec ? bruto / S.nTec : 0)}</b><p>{S.nTec} técnicos de campo</p></div>
          <div className="hx-perg"><small>Quanto custa a equipe, com ou sem serviço?</small><b>{brl(pItens.salario)}</b><p>salários e encargos do mês{S.tec > 0 ? `, com ${S.tec} contratado(s)` : ''}</p></div>
        </div>
      </section>

      </div>

      {/* barra que acompanha a rolagem enquanto há simulação */}
      {mudou && (
        <div className="hx-barra">
          <span><i className="fas fa-flask" /> Simulando: sobraria <b style={{ color: ficou >= 0 ? '#5eead4' : '#fca5a5' }}>{brl(ficou)}</b> <em>({dif >= 0 ? '+' : '−'}{brl(Math.abs(dif))} em relação ao que foi)</em></span>
          <button type="button" onClick={() => S.aplicar('real', null)}><i className="fas fa-rotate-left" /> Voltar ao que foi</button>
        </div>
      )}
    </div>
  )
}

export const ESTILO_HX = `
.hx { display: grid; gap: 16px; color: ${TXT}; font-variant-numeric: tabular-nums }
.hx b { font-weight: 700 }
.hx .bom { color: #15803d; font-style: normal } .hx .ruim { color: #b91c1c; font-style: normal }
.hx-hero { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(260px, 1fr); gap: 20px; align-items: center; background: var(--portal-bg-card, #fefefe); border: 1px solid #e2e8f0; border-radius: 16px; padding: 22px 24px; animation: hxEntra .5s both }
.hx-hero-txt { display: grid; gap: 10px } .hx-hero-txt > small { font-size: 13px; color: ${MUDO} }
.hx-hero h2 { margin: 0; font-size: clamp(20px, 2.2vw, 28px); font-weight: 500; line-height: 1.3; color: ${TXT} } .hx-hero h2 b { font-size: 1.15em }
.hx-hero p { margin: 0; font-size: 15px; line-height: 1.55; color: #1e293b; max-width: 620px }
.hx-chips { display: flex; gap: 8px; flex-wrap: wrap }
.hx-chip { font-size: 13px; border-radius: 99px; padding: 4px 12px; background: #f1f5f9; color: ${MUDO} } .hx-chip.bom { background: #dcfce7; color: #14532d } .hx-chip.ruim { background: #fee2e2; color: #7f1d1d }
.hx-hero-rosca { position: relative; display: grid; grid-template-columns: 140px 1fr; gap: 16px; align-items: center }
.hx-rosca { width: 140px; height: 140px }
.hx-rosca-c { position: absolute; left: 0; top: 50%; width: 140px; transform: translateY(-50%); display: grid; justify-items: center; text-align: center; pointer-events: none } .hx-rosca-c b { font-size: 24px } .hx-rosca-c small { font-size: 11.5px; color: ${MUDO}; line-height: 1.25 }
.hx-rosca-leg { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; font-size: 14px } .hx-rosca-leg li { display: flex; align-items: center; gap: 8px } .hx-rosca-leg li b { margin-left: auto } .hx-rosca-leg i { width: 12px; height: 12px; border-radius: 4px; flex: none }

.hx-sec { background: var(--portal-bg-card, #fefefe); border: 1px solid #e2e8f0; border-radius: 16px; padding: 18px 20px; display: grid; gap: 14px; animation: hxEntra .5s both }
.hx-sec-t { display: flex; gap: 12px; align-items: center } .hx-sec-t > span { width: 28px; height: 28px; border-radius: 50%; background: ${TXT}; color: #fefefe; display: grid; place-items: center; font-size: 13px; font-weight: 700; flex: none }
.hx-sec-t > div { display: grid } .hx-sec-t b { font-size: 16px } .hx-sec-t small { font-size: 13px; color: ${MUDO} }

.hx-fluxo { position: relative; height: 320px; margin: 0 4px }
.hx-fluxo svg { position: absolute; inset: 10px 0; width: 100%; height: calc(100% - 20px); overflow: visible }
.hx-fita { opacity: .28; transition: opacity .25s, d .6s cubic-bezier(.2,.8,.2,1); cursor: pointer } .hx-fita:hover { opacity: .55 } .hx-fita.apaga { opacity: .08 }
.hx-fluxo rect { transition: y .6s cubic-bezier(.2,.8,.2,1), height .6s cubic-bezier(.2,.8,.2,1) }
.hx-rot { position: absolute; inset: 10px 0; pointer-events: none }
.hx-rot button { pointer-events: auto; position: absolute; transform: translateY(-50%); display: grid; text-align: left; border: 0; background: rgba(255,255,255,.88); border-radius: 8px; padding: 3px 8px; font-family: inherit; cursor: pointer; color: ${TXT}; transition: top .6s cubic-bezier(.2,.8,.2,1), box-shadow .2s; border-left: 3px solid var(--c) }
.hx-rot button:hover, .hx-rot button.on { box-shadow: 0 4px 14px rgba(15,23,42,.14) }
.hx-rot button b { font-size: 13px; font-weight: 600 } .hx-rot button span { font-size: 12px; color: ${MUDO} }
.hx-rot.esq button { left: 22px } .hx-rot.dir button { right: 22px; text-align: right; border-left: 0; border-right: 3px solid var(--c) }
.hx-rot.meio { position: absolute; inset: auto; transform: translate(10px, -50%); display: grid; background: #0f172a; color: #fefefe; border-radius: 10px; padding: 6px 12px; pointer-events: none; transition: top .6s } .hx-rot.meio b { font-size: 12px; font-weight: 500; color: #cbd5e1 } .hx-rot.meio span { font-size: 16px; font-weight: 700 }

.hx-conta { display: grid; border-top: 1px solid #e2e8f0; padding-top: 6px }
.hx-conta-l { display: grid; grid-template-columns: minmax(0, 1.2fr) 1fr 1fr 1fr; gap: 10px; padding: 7px 4px; font-size: 15px; border-top: 1px solid #f1f5f9 }
.hx-conta-l > span:not(:first-child) { text-align: right } .hx-conta-l > span:first-child em { display: inline-block; width: 16px; font-style: normal; color: ${CLARO} }
.hx-conta-l.cab { font-size: 12.5px; color: ${MUDO}; border-top: 0 } .hx-conta-l.tot { border-top: 1px solid #cbd5e1; font-weight: 700 } .hx-conta-l small { color: ${CLARO}; font-size: 12.5px }

.hx-atalhos { display: flex; gap: 8px; flex-wrap: wrap }
.hx-atalhos button { border: 1px solid #e2e8f0; background: #fefefe; color: ${TXT}; border-radius: 99px; padding: 6px 14px; font-family: inherit; font-size: 13px; cursor: pointer; transition: all .2s } .hx-atalhos button:hover { border-color: #94a3b8 } .hx-atalhos button.on { background: ${TXT}; color: #fefefe; border-color: ${TXT} }
.hx-abas { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px }
.hx-abas button { display: grid; gap: 2px; text-align: left; border: 1px solid #e2e8f0; background: #f8fafc; border-radius: 12px; padding: 12px 14px; font-family: inherit; cursor: pointer; color: ${TXT}; transition: all .2s }
.hx-abas button > span { font-size: 13.5px; color: ${MUDO} } .hx-abas button > span i { color: var(--c); margin-right: 4px } .hx-abas button > b { font-size: 20px } .hx-abas button > small { font-size: 12.5px; color: ${CLARO} } .hx-abas button > small em { font-weight: 600 }
.hx-abas button:hover { border-color: var(--c) } .hx-abas button.on { background: #fefefe; border-color: var(--c); box-shadow: 0 0 0 1px var(--c), 0 8px 22px -12px rgba(15,23,42,.35) }
.hx-painel { display: grid; gap: 14px; animation: hxEntra .3s both }
.hx-explica { margin: 0; font-size: 14px; color: #334155; line-height: 1.5 }
.hx-grade { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px 24px }
.hx-tec { display: grid; grid-template-columns: 1fr auto; gap: 4px 10px; align-items: center } .hx-tec > span { font-size: 14px; font-weight: 600 } .hx-tec > span i { color: ${CS.pessoal} } .hx-tec small { grid-column: 1 / -1; font-size: 12.5px; color: ${MUDO} }
.hx-tec > div { display: flex; align-items: center; gap: 8px } .hx-tec button { width: 30px; height: 30px; border-radius: 50%; border: 1px solid #cbd5e1; background: #fefefe; font-size: 16px; cursor: pointer; color: ${TXT} } .hx-tec button:hover { border-color: ${CS.pessoal} }
.hx-chk { display: flex; gap: 8px; align-items: center; font-size: 13.5px; cursor: pointer } .hx-chk input { width: 16px; height: 16px; accent-color: ${CS.pessoal} }
.hx-desc { border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden }
.hx-desc > button { width: 100%; display: flex; gap: 10px; align-items: center; text-align: left; border: 0; background: #f8fafc; padding: 12px 14px; font-family: inherit; font-size: 14px; color: ${TXT}; cursor: pointer } .hx-desc > button > span { flex: 1 } .hx-desc > button > i:first-child { color: ${MUDO} }
.hx-desc-in, .hx-eq { padding: 14px; display: grid; gap: 12px }
.hx-lista { display: grid; gap: 2px } .hx-lista > b { font-size: 14px; margin-bottom: 4px } .hx-lista > div { display: grid; grid-template-columns: 100px minmax(0, 1fr) auto; gap: 10px; font-size: 14px; padding: 4px 0; border-top: 1px solid #f1f5f9 } .hx-lista em { font-style: normal; color: ${MUDO}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.hx-eq { gap: 0 }
.hx-eq-l { display: grid; grid-template-columns: 22px minmax(0, 1.8fr) 1fr 1fr 1fr 1fr; gap: 10px; align-items: center; padding: 8px 2px; font-size: 14px; border-top: 1px solid #f1f5f9; cursor: pointer }
.hx-eq-l > span:not(:nth-child(2)), .hx-eq-l > strong { text-align: right } .hx-eq-l.cab { cursor: default; font-size: 12.5px; color: ${MUDO}; border-top: 0 }
.hx-eq-l b { display: block; font-weight: 600 } .hx-eq-l em { font-style: normal; font-size: 12px; color: ${MUDO} } .hx-eq-l small { font-size: 12px; color: ${MUDO} } .hx-eq-l.off { opacity: .45 } .hx-eq-l.off b { text-decoration: line-through } .hx-eq-l input { width: 16px; height: 16px; accent-color: ${CS.pessoal} }

.hx-duas { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); gap: 16px; align-items: start }
.hx-duas > .hx-sec:last-child { position: sticky; top: 84px }
.hx-duas .hx-abas button > b { font-size: 18px }
.hx-pergs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px }
.hx-perg { display: grid; gap: 6px; align-content: start; background: #f8fafc; border: 1px solid #eef2f6; border-radius: 12px; padding: 14px 16px }
.hx-perg.larga { grid-column: span 2; background: #fefefe; border-color: #e2e8f0 }
.hx-perg > small { font-size: 14px; color: #334155; line-height: 1.4 } .hx-perg > b { font-size: 26px; line-height: 1.15 } .hx-perg p { margin: 0; font-size: 13.5px; color: ${MUDO}; line-height: 1.45 } .hx-perg p b { color: ${TXT} }
.hx-trilho { position: relative; height: 12px; border-radius: 99px; background: #e2e8f0; margin: 18px 0 4px } .hx-trilho i { display: block; height: 100%; border-radius: 99px; background: ${CS.ficou}; transition: width .5s } .hx-trilho em { position: absolute; top: -5px; width: 4px; height: 22px; background: ${TXT}; border-radius: 2px; box-shadow: 0 0 0 2px #fefefe; transition: left .5s } .hx-trilho em span { position: absolute; bottom: 24px; left: 50%; transform: translateX(-50%); white-space: nowrap; font-size: 11.5px; font-style: normal; color: ${MUDO} }
.hx-st { font-size: 14px; border-radius: 10px; padding: 8px 12px; background: #f1f5f9 } .hx-st.bom { background: #dcfce7; color: #14532d } .hx-st.ruim { background: #fee2e2; color: #7f1d1d }
.hx-meta { display: inline-flex; align-items: center; gap: 4px } .hx-meta input { width: 56px; height: 30px; border: 1px solid #94a3b8; border-radius: 8px; text-align: center; font-family: inherit; font-size: 15px; font-weight: 700; color: ${TXT} } .hx-meta input:focus { outline: 2px solid ${CS.ficou}; border-color: ${CS.ficou} }
.hx-eqn { display: flex; flex-wrap: wrap; gap: 6px 12px; align-items: center; background: #f1f5f9; border-radius: 10px; padding: 10px 14px } .hx-eqn span { display: grid } .hx-eqn small { font-size: 12.5px; color: ${MUDO} } .hx-eqn b { font-size: 16px } .hx-eqn em { font-style: normal; font-size: 16px; color: ${MUDO} } .hx-eqn .sobra b { color: ${CS.ficou} }
.hx-bt { justify-self: start; border: 0; background: ${TXT}; color: #fefefe; border-radius: 99px; padding: 8px 16px; font-family: inherit; font-size: 13.5px; cursor: pointer }

.hx-barra { position: sticky; bottom: 14px; z-index: 20; display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap; background: #0f172a; color: #e2e8f0; border-radius: 14px; padding: 10px 14px 10px 18px; box-shadow: 0 14px 34px -14px rgba(15,23,42,.6); animation: hxSobe .35s both }
.hx-barra span { font-size: 14px } .hx-barra b { font-size: 16px } .hx-barra em { font-style: normal; color: #94a3b8 } .hx-barra button { border: 0; background: #fefefe; color: #0f172a; border-radius: 99px; padding: 7px 14px; font-family: inherit; font-size: 13px; cursor: pointer }
@keyframes hxEntra { from { opacity: 0; transform: translateY(8px) } }
@keyframes hxSobe { from { opacity: 0; transform: translateY(16px) } }
@media (max-width: 1100px) { .hx-duas { grid-template-columns: 1fr } .hx-duas > .hx-sec:last-child { position: static } }
@media (max-width: 800px) {
  .hx-hero { grid-template-columns: 1fr } .hx-abas { grid-template-columns: 1fr } .hx-pergs { grid-template-columns: 1fr } .hx-perg.larga { grid-column: auto }
  .hx-fluxo { height: 380px } .hx-rot button span { display: none }
  .hx-eq-l { grid-template-columns: 22px minmax(0, 1fr) 90px } .hx-eq-l > span:nth-child(3), .hx-eq-l > span:nth-child(4), .hx-eq-l > span:nth-child(5) { display: none }
}
`
