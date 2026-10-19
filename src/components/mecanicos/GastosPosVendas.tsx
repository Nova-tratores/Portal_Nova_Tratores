'use client'
// "Gastos do pós-vendas" (José, 17/10/2026): tudo o que o pós-vendas gastou ou deixou de cobrar,
// separado e comparado com o período anterior — requisições, alimentação, manutenção e abastecimento
// do carro, terceiros nas OS, OS INTERNAS FECHADAS (olho no Nº do contrato: Interno e Cortesia Oficina
// em destaque) e DESCONTOS dados (hora, km, geral, peças).
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { contratoAtencao, type InternaFechada, type OSFaturada, type ResumoDespesas } from '@/lib/mecanicos/painel'
import { brl, brl2, horas, Numero } from './ui'

const MUDO = 'var(--portal-text-muted, #64748b)'
type TipoGasto = 'abastecimento' | 'manutencao' | 'alimentacao' | 'materiais'
const br = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`

/** ▲▼ contra o período anterior. Gasto/desconto que SOBE é ruim (vermelho). */
function Variacao({ atual, antes, rotulo }: { atual: number; antes: number | undefined; rotulo: string }) {
  if (antes == null) return null
  if (antes < 0.5 && atual < 0.5) return <span className="gp-var" style={{ color: MUDO }}>igual a {rotulo}</span>
  if (antes < 0.5) return <span className="gp-var" style={{ color: '#b91c1c' }}>▲ novo · {rotulo}: R$ 0</span>
  const p = ((atual - antes) / antes) * 100
  const cor = Math.abs(p) < 3 ? MUDO : p > 0 ? '#b91c1c' : '#047857'
  return <span className="gp-var" style={{ color: cor }} title={`${rotulo}: ${brl2(antes)}`}>{p > 0 ? '▲' : p < 0 ? '▼' : '='} {Math.abs(Math.round(p))}% vs {rotulo} ({brl(antes)})</span>
}

function Bloco({ titulo, icone, cor, valor, antes, rotulo, sub, onClick, atraso }: {
  titulo: string; icone: string; cor: string; valor: number; antes?: number; rotulo: string; sub?: React.ReactNode; onClick?: () => void; atraso: number
}) {
  return (
    <button type="button" className="gp-bloco" style={{ animationDelay: `${atraso}ms`, ['--c' as string]: cor }} onClick={onClick} disabled={!onClick}>
      <span className="gp-ic"><i className={`fas ${icone}`} /></span>
      <span className="gp-tit">{titulo}</span>
      <b className="gp-val"><Numero valor={valor} formato={brl} /></b>
      <Variacao atual={valor} antes={antes} rotulo={rotulo} />
      {sub && <small className="gp-sub">{sub}</small>}
    </button>
  )
}

export default function GastosPosVendas({ atual, anterior, internas, osComDesconto, onGastos, onTerceiros }: {
  atual: ResumoDespesas
  anterior: (ResumoDespesas & { rotulo: string }) | null
  internas: InternaFechada[]
  osComDesconto: OSFaturada[]
  onGastos: (tipo: TipoGasto) => void
  onTerceiros: () => void
}) {
  const [ver, setVer] = useState<'internas' | 'descontos' | null>(null)
  const rot = anterior?.rotulo || 'anterior'
  const a = anterior
  const contratos = Object.entries(atual.internas.porContrato).sort((x, y) => y[1].valor - x[1].valor)
  const atencao = contratos.filter(([c]) => contratoAtencao(c))
  const valorAtencao = atencao.reduce((s, [, v]) => s + v.valor, 0)
  const valorAtencaoAntes = a ? Object.entries(a.internas.porContrato).filter(([c]) => contratoAtencao(c)).reduce((s, [, v]) => s + v.valor, 0) : undefined
  const maxContrato = Math.max(1, ...contratos.map(([, v]) => v.valor))
  const d = atual.descontos
  return (
    <section className="gp cpv-entra" style={{ animationDelay: '60ms' }}>
      <style>{ESTILO}</style>
      <div className="gp-cab">
        <div>
          <div className="gp-rot"><i className="fas fa-wallet" /> Gastos do pós-vendas</div>
          <div className="gp-frase">
            Saíram <b style={{ color: '#be123c' }}><Numero valor={atual.gastosTotal} formato={brl} /></b> em gastos
            {a && <> · <Variacao atual={atual.gastosTotal} antes={a.gastosTotal} rotulo={rot} /></>}
          </div>
        </div>
        {atual.emAberto > 0.5 && <span className="gp-aberto"><i className="fas fa-clock" /> {brl(atual.emAberto)} em requisições ainda não confirmadas (fora do total)</span>}
      </div>

      <div className="gp-grade">
        <Bloco titulo="Abastecimento do carro" icone="fa-gas-pump" cor="#ea580c" valor={atual.abastecimento} antes={a?.abastecimento} rotulo={rot} onClick={() => onGastos('abastecimento')} atraso={0} />
        <Bloco titulo="Manutenção do carro" icone="fa-car-burst" cor="#a16207" valor={atual.manutencao} antes={a?.manutencao} rotulo={rot} onClick={() => onGastos('manutencao')} atraso={60} />
        <Bloco titulo="Alimentação" icone="fa-utensils" cor="#ca8a04" valor={atual.alimentacao} antes={a?.alimentacao} rotulo={rot} onClick={() => onGastos('alimentacao')} atraso={120} />
        <Bloco titulo="Requisições da oficina" icone="fa-screwdriver-wrench" cor="#0d9488" valor={atual.materiais} antes={a?.materiais} rotulo={rot} sub="ferramenta, peça e material de uso" onClick={() => onGastos('materiais')} atraso={180} />
        <Bloco titulo="Terceiros nas OS" icone="fa-receipt" cor="#dc2626" valor={atual.terceiros} antes={a?.terceiros} rotulo={rot} sub="requisição Trator-Cliente não cobrada" onClick={onTerceiros} atraso={240} />
      </div>

      <div className="gp-duplo">
        {/* OS internas fechadas */}
        <button type="button" className="gp-painel cpv-entra" style={{ animationDelay: '300ms' }} onClick={() => setVer('internas')} disabled={!internas.length}>
          <div className="gp-p-cab">
            <span className="gp-ic" style={{ ['--c' as string]: '#7c3aed' }}><i className="fas fa-house-flag" /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <b>OS internas fechadas</b>
              <small>o que a oficina deixou de cobrar (pelo Nº do contrato) — não sai do resultado, as horas já estão no salário</small>
            </div>
            <div style={{ textAlign: 'right' }}>
              <b className="gp-val" style={{ color: '#7c3aed' }}><Numero valor={atual.internas.valor} formato={brl} /></b>
              <small style={{ display: 'block', color: MUDO }}>{atual.internas.qtd} OS · {horas(atual.internas.horas)}</small>
              <Variacao atual={atual.internas.valor} antes={a?.internas.valor} rotulo={rot} />
            </div>
          </div>
          {valorAtencao > 0 && (
            <div className="gp-alerta">
              <i className="fas fa-triangle-exclamation" /> <b>{brl(valorAtencao)}</b> em <b>Interno</b> e <b>Cortesia Oficina</b> — a oficina assumiu
              {valorAtencaoAntes != null && <> · <Variacao atual={valorAtencao} antes={valorAtencaoAntes} rotulo={rot} /></>}
            </div>
          )}
          <div className="gp-contratos">
            {contratos.map(([c, v], i) => (
              <div key={c} className={`gp-ct ${contratoAtencao(c) ? 'gp-ct-on' : ''}`}>
                <span>{c}</span>
                <span className="gp-ct-barra"><i style={{ width: `${(v.valor / maxContrato) * 100}%`, animationDelay: `${350 + i * 70}ms` }} /></span>
                <b>{brl(v.valor)}</b>
                <small>{v.qtd} OS</small>
              </div>
            ))}
            {!contratos.length && <small style={{ color: MUDO }}>nenhuma OS interna fechada no período</small>}
          </div>
        </button>

        {/* descontos dados */}
        <button type="button" className="gp-painel cpv-entra" style={{ animationDelay: '360ms' }} onClick={() => setVer('descontos')} disabled={!osComDesconto.length}>
          <div className="gp-p-cab">
            <span className="gp-ic" style={{ ['--c' as string]: '#db2777' }}><i className="fas fa-tags" /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <b>Descontos dados</b>
              <small>já saíram do faturamento — separados por tipo</small>
            </div>
            <div style={{ textAlign: 'right' }}>
              <b className="gp-val" style={{ color: '#db2777' }}><Numero valor={d.total} formato={brl} /></b>
              <small style={{ display: 'block', color: MUDO }}>{d.qtdOS} OS com desconto</small>
              <Variacao atual={d.total} antes={a?.descontos.total} rotulo={rot} />
            </div>
          </div>
          <div className="gp-desc">
            {([['Hora (mão de obra)', d.hora, a?.descontos.hora], ['Km (deslocamento)', d.km, a?.descontos.km], ['Desconto geral da OS', d.geral, a?.descontos.geral], ['Peças (PPV)', d.pecas, a?.descontos.pecas]] as [string, number, number | undefined][]).map(([r, v, x]) => (
              <div key={r}><span>{r}</span><b>{brl(v)}</b><Variacao atual={v} antes={x} rotulo={rot} /></div>
            ))}
          </div>
        </button>
      </div>

      {ver && createPortal(
        <div className="gp-fundo" onClick={() => setVer(null)}>
          <div className="gp-janela" onClick={(e) => e.stopPropagation()}>
            <div className="gp-j-cab">
              <b>{ver === 'internas' ? `OS internas fechadas · ${brl2(atual.internas.valor)}` : `Descontos dados · ${brl2(d.total)}`}</b>
              <button type="button" onClick={() => setVer(null)} aria-label="Fechar"><i className="fas fa-xmark" /></button>
            </div>
            <div className="gp-lista">
              {ver === 'internas' && [...internas].sort((x, y) => y.valor - x.valor).map((x) => (
                <a key={x.os} className={`gp-linha ${contratoAtencao(x.contrato) ? 'gp-linha-on' : ''}`} href={x.os.startsWith('OMIE') ? undefined : `/pos?id=${encodeURIComponent(x.os)}`} target="_blank" rel="noreferrer">
                  <span style={{ width: 46 }}>{br(x.data)}</span>
                  <span style={{ flex: 1, minWidth: 0 }}><b>{x.os}</b>{x.numeroOmie ? ` · Omie ${x.numeroOmie}` : ''} · {x.cliente || '—'}<small> {x.tecnicos.join(' + ')}</small></span>
                  <span className="gp-tag">{x.contrato}</span>
                  <b>{brl2(x.valor)}</b>
                </a>
              ))}
              {ver === 'descontos' && [...osComDesconto].sort((x, y) => tot(y) - tot(x)).map((o) => (
                <a key={o.os} className="gp-linha" href={o.os.startsWith('OMIE') ? undefined : `/pos?id=${encodeURIComponent(o.os)}`} target="_blank" rel="noreferrer">
                  <span style={{ width: 46 }}>{br(o.data)}</span>
                  <span style={{ flex: 1, minWidth: 0 }}><b>{o.os}</b> · {o.cliente || '—'}<small> {o.tecnicos.join(' + ')}</small></span>
                  <small style={{ color: MUDO }}>{[['hora', o.descontos!.hora], ['km', o.descontos!.km], ['geral', o.descontos!.geral], ['peças', o.descontos!.pecas]].filter(([, v]) => (v as number) > 0).map(([k, v]) => `${k} ${brl(v as number)}`).join(' · ')}</small>
                  <b>{brl2(tot(o))}</b>
                </a>
              ))}
            </div>
          </div>
        </div>,
        (document.fullscreenElement as HTMLElement | null) || document.body,
      )}
    </section>
  )
}

const tot = (o: OSFaturada) => (o.descontos ? o.descontos.hora + o.descontos.km + o.descontos.geral + o.descontos.pecas : 0)

const ESTILO = `
.gp { background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e5e7eb); border-radius: 18px; padding: 18px 20px; margin-bottom: 14px; box-shadow: 0 1px 3px rgba(15,23,42,.05) }
.gp-cab { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; flex-wrap: wrap; margin-bottom: 14px }
.gp-rot { font-size: 12.5px; font-weight: 800; text-transform: uppercase; letter-spacing: .5px; color: ${MUDO} }
.gp-frase { font-size: 22px; font-weight: 800; color: var(--portal-text, #0f172a); margin-top: 2px }
.gp-frase .gp-var { font-size: 13.5px }
.gp-aberto { font-size: 12.5px; color: #92400e; background: #fffbeb; border: 1px solid #fde68a; border-radius: 99px; padding: 5px 12px; font-weight: 700 }
.gp-grade { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px }
.gp-bloco { --c: #64748b; position: relative; display: flex; flex-direction: column; align-items: flex-start; gap: 3px; text-align: left; font-family: inherit; color: var(--portal-text, #0f172a); background: linear-gradient(160deg, color-mix(in srgb, var(--c) 9%, transparent), transparent 70%); border: 1px solid color-mix(in srgb, var(--c) 28%, transparent); border-radius: 14px; padding: 12px 14px; cursor: pointer; transition: transform .15s, box-shadow .15s; animation: cpvEntra .5s cubic-bezier(.2,.8,.2,1) both; overflow: hidden }
.gp-bloco:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 8px 20px color-mix(in srgb, var(--c) 22%, transparent) }
.gp-bloco::after { content: ''; position: absolute; left: 0; bottom: 0; height: 3px; width: 100%; background: var(--c); transform-origin: left; animation: gpRisco .8s .2s cubic-bezier(.2,.8,.2,1) both }
@keyframes gpRisco { from { transform: scaleX(0) } }
.gp-ic { --c: inherit; width: 32px; height: 32px; border-radius: 10px; display: inline-flex; align-items: center; justify-content: center; background: color-mix(in srgb, var(--c) 15%, transparent); color: var(--c); font-size: 15px; flex-shrink: 0 }
.gp-tit { font-size: 13px; font-weight: 800; color: ${MUDO}; margin-top: 4px }
.gp-val { font-size: 22px; font-weight: 900; font-variant-numeric: tabular-nums }
.gp-var { font-size: 12px; font-weight: 800; white-space: nowrap }
.gp-sub { font-size: 11.5px; color: ${MUDO} }
.gp-duplo { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 12px; margin-top: 12px }
.gp-painel { display: flex; flex-direction: column; gap: 10px; text-align: left; font-family: inherit; color: var(--portal-text, #0f172a); background: var(--portal-bg-secondary, #f8fafc); border: 1px solid var(--portal-border, #e5e7eb); border-radius: 14px; padding: 14px; cursor: pointer; transition: box-shadow .15s }
.gp-painel:hover:not(:disabled) { box-shadow: 0 6px 18px rgba(15,23,42,.08) }
.gp-p-cab { display: flex; gap: 10px; align-items: flex-start }
.gp-p-cab b { font-size: 15px } .gp-p-cab small { display: block; font-size: 12px; color: ${MUDO} }
.gp-alerta { font-size: 13px; color: #9a3412; background: #fff7ed; border: 1px solid #fed7aa; border-radius: 10px; padding: 7px 10px; animation: gpPisca 1.6s ease-in-out 2 }
@keyframes gpPisca { 50% { box-shadow: 0 0 0 4px rgba(249,115,22,.25) } }
.gp-contratos { display: grid; gap: 5px }
.gp-ct { display: grid; grid-template-columns: minmax(110px, 1.2fr) 2fr 84px 48px; gap: 8px; align-items: center; font-size: 12.5px }
.gp-ct > span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 700 }
.gp-ct b { text-align: right; font-variant-numeric: tabular-nums } .gp-ct small { color: ${MUDO}; text-align: right }
.gp-ct-barra { height: 8px; background: var(--portal-border, #e2e8f0); border-radius: 99px; overflow: hidden }
.gp-ct-barra i { display: block; height: 100%; background: #a78bfa; border-radius: 99px; transform-origin: left; animation: gpRisco .7s cubic-bezier(.2,.8,.2,1) both }
.gp-ct-on > span:first-child { color: #c2410c } .gp-ct-on .gp-ct-barra i { background: #f97316 }
.gp-desc { display: grid; gap: 6px }
.gp-desc > div { display: grid; grid-template-columns: 1fr 90px; gap: 2px 8px; align-items: center; font-size: 13px }
.gp-desc b { text-align: right; font-variant-numeric: tabular-nums } .gp-desc .gp-var { grid-column: 1 / -1; font-size: 11.5px }
.gp-fundo { position: fixed; inset: 0; z-index: 100060; background: rgba(15,23,42,.45); display: flex; align-items: center; justify-content: center; padding: 16px; animation: cpvEntra .2s both }
.gp-janela { width: min(1100px, 100%); max-height: 88vh; display: flex; flex-direction: column; background: var(--portal-bg-card, #fefefe); border-radius: 16px; box-shadow: 0 24px 60px rgba(0,0,0,.3); overflow: hidden; animation: gpAbre .45s cubic-bezier(.2,1.15,.3,1) both }
@keyframes gpAbre { from { opacity: 0; transform: translateY(28px) scale(.94); filter: blur(4px) } }
.gp-lista .gp-linha { animation: gpLinha .35s ease both } .gp-lista .gp-linha:nth-child(n+2) { animation-delay: .04s } .gp-lista .gp-linha:nth-child(n+4) { animation-delay: .08s } .gp-lista .gp-linha:nth-child(n+6) { animation-delay: .12s } .gp-lista .gp-linha:nth-child(n+8) { animation-delay: .16s }
@keyframes gpLinha { from { opacity: 0; transform: translateX(-10px) } }
.gp-j-cab { display: flex; justify-content: space-between; align-items: center; padding: 14px 18px; border-bottom: 1px solid var(--portal-border, #e5e7eb); font-size: 16px }
.gp-j-cab button { border: none; background: none; font-size: 18px; cursor: pointer; color: ${MUDO} }
.gp-lista { overflow-y: auto; padding: 10px 14px 14px; display: grid; gap: 5px }
.gp-linha { display: flex; gap: 10px; align-items: center; padding: 8px 10px; border-radius: 10px; border: 1px solid var(--portal-border, #e5e7eb); color: var(--portal-text, #0f172a); text-decoration: none; font-size: 13px }
.gp-linha:hover { background: var(--portal-bg-secondary, #f8fafc) } .gp-linha small { color: ${MUDO} }
.gp-linha-on { border-color: #fdba74; background: #fff7ed }
.gp-tag { font-size: 11.5px; font-weight: 800; background: #ede9fe; color: #6d28d9; border-radius: 99px; padding: 2px 8px; white-space: nowrap }
.gp-linha-on .gp-tag { background: #ffedd5; color: #c2410c }
`
