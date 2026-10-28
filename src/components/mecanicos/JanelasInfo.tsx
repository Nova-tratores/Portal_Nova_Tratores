'use client'
// Janelas de explicação do topo do Centro (José, 20/10/2026):
//  - Liga: como funciona a carreira (Ferro → Diamante), como sobe e cai, e onde cada mecânico está.
//  - Comissões: como é calculada, as metas (a básica já desconta deslocamento e hora ociosa), o que paga e o
//    que não paga, e os VALORES FIXOS — editáveis (admin) e dá para acrescentar.
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { authHeaders } from '@/lib/auth/client'
import { patente, NIVEL_MAX, PONTOS_POR_OS, PONTOS_POR_DEGRAU, PESO_RETORNO, DIVISOES, DIAMANTE } from '@/lib/mecanicos/carreira'
import type { RegrasComissao, RegraFixa, RegraNaoPaga } from '@/lib/mecanicos/regras-comissao'
import { IconeLiga } from './CartaLiga'
import { useCarreira } from './useCarreira'
import { abrirModalMec } from './BotoesMecanicos'
import { brl2 } from './ui'

const MUDO = 'var(--portal-text-muted, #64748b)'

export function Janela({ titulo, sub, ic, cor, children, onFechar }: { titulo: string; sub: string; ic: string; cor: string; children: React.ReactNode; onFechar?: () => void }) {
  // fora da Janela Mecânicos (ex.: o aviso do diretor) quem abriu fecha
  const fechar = onFechar || (() => abrirModalMec(null))
  useEffect(() => {
    const t = (e: KeyboardEvent) => { if (e.key !== 'Escape') return; if (onFechar) onFechar(); else abrirModalMec(null) }
    window.addEventListener('keydown', t); return () => window.removeEventListener('keydown', t)
  }, [onFechar])
  const tela = (
    <div className="ji-fundo" onClick={fechar}>
      <style>{ESTILO_JI}</style>
      <div className="ji" role="dialog" aria-label={titulo} onClick={(e) => e.stopPropagation()} style={{ '--jc': cor } as React.CSSProperties}>
        <header className="ji-cab">
          <span className="ji-ic"><i className={`fas ${ic}`} /></span>
          <div><b>{titulo}</b><small>{sub}</small></div>
          <button type="button" onClick={fechar} aria-label="Fechar"><i className="fas fa-xmark" /></button>
        </header>
        <div className="ji-corpo">{children}</div>
      </div>
    </div>
  )
  return typeof document === 'undefined' ? tela : createPortal(tela, document.body)
}

// ============================================================================ Liga
export function LigaJanela() {
  const { dados } = useCarreira()
  const divs = [...DIVISOES.map((d, i) => ({ ...d, de: i * 5, ate: i * 5 + 4 })), { ...DIAMANTE, de: NIVEL_MAX, ate: NIVEL_MAX }]
  return (
    <Janela titulo="Liga dos mecânicos" sub="como a carreira funciona: pontos por OS bem feita" ic="fa-ranking-star" cor="#475569">
      <p className="ji-intro">Cada mecânico tem uma <b>liga</b> que mostra como ele vem trabalhando ao longo dos meses. Todos começam no <b>Ferro 5</b> e vão subindo até o <b>Diamante</b> juntando pontos: <b>cada OS fechada sem problema dá pontos</b> e as ocorrências tiram.</p>
      <div className="ji-escada">
        {divs.map((d) => (
          <div key={d.nome} className="ji-div" style={{ '--dc': d.cor } as React.CSSProperties}>
            <div className="ji-div-cab"><IconeLiga nivel={d.ate} tamanho={40} /><b>{d.nome}</b></div>
            <div className="ji-niveis">{Array.from({ length: d.ate - d.de + 1 }, (_, k) => d.de + k).map((n) => <span key={n} title={`nível ${n}`}>{patente(n).nome.replace(d.nome, '').trim() || '★'}</span>)}</div>
          </div>
        ))}
      </div>
      <div className="ji-regras">
        <div className="bom"><b>+{PONTOS_POR_OS} pontos</b><span>a cada <u>OS fechada sem problema</u>: sem ocorrência e sem pendência (se a OS tem 2 técnicos, os dois ganham)</span></div>
        <div className="ruim"><b>− pontos</b><span>cada ocorrência que vale tira os pontos dela do saldo</span></div>
        <div className="bom"><b>{PONTOS_POR_DEGRAU} pontos</b><span>de saldo = <u>1 degrau</u> (Ferro 5 → Ferro 4 …); o saldo nunca fica negativo</span></div>
        <div className="ruim"><b>× {PESO_RETORNO}</b><span><u>retorno de serviço</u> (voltar para refazer) conta em dobro na liga</span></div>
        <div className="bom"><b>Defesa</b><span>se a defesa for aceita no Tribunal, os pontos voltam e não contam na liga</span></div>
        <div><b>Fecha no dia 1º</b><span>o degrau confirma quando o mês vira; durante o mês aparece “se fechar assim”, já com as OS do mês</span></div>
      </div>
      <h3 className="ji-h">Onde cada um está agora</h3>
      {!dados ? <p className="ji-mudo">carregando…</p> : (
        <div className="ji-tab">
          {dados.carreira.map((c) => {
            const pt = patente(c.nivel), vai = patente(c.seFecharAssim)
            const foto = dados.fotos?.[c.tecnico]
            return (
              <div key={c.tecnico} className="ji-lin">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {foto ? <img src={foto} alt={c.tecnico} className="ji-foto" /> : <span className="ji-foto ini">{c.tecnico.split(' ').map((p) => p[0]).slice(0, 2).join('')}</span>}
                <b>{c.tecnico}</b>
                <span className="ji-liga"><IconeLiga nivel={c.nivel} tamanho={26} />{pt.nome}</span>
                <span className="ji-mudo">{c.saldoAgora} pts · no mês +{c.mesAtual.ganhos} ({c.mesAtual.osLimpas} OS) −{c.mesAtual.pontos}</span>
                <span className={c.seFecharAssim > c.nivel ? 'bom' : c.seFecharAssim < c.nivel ? 'ruim' : ''}>se fechar assim: <b>{vai.nome}</b></span>
                <span className="ji-mudo">{c.faltaProximo ? `faltam ${c.faltaProximo} pts para subir` : 'no topo'}</span>
              </div>
            )
          })}
        </div>
      )}
    </Janela>
  )
}

// ============================================================================ Comissões
export function ComissoesJanela() {
  const { dados: car } = useCarreira()
  const [regras, setRegras] = useState<RegrasComissao | null>(null)
  const [padrao, setPadrao] = useState<RegrasComissao | null>(null)
  const [pode, setPode] = useState(false)
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null)
  const [mudou, setMudou] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [aba, setAba] = useState<'como' | 'metas' | 'regras'>('como')
  useEffect(() => {
    let vivo = true
    ;(async () => {
      const r = await fetch('/api/mecanicos/regras-comissao', { headers: await authHeaders(), cache: 'no-store' })
      const j = await r.json()
      if (vivo && r.ok) { setRegras(j.regras); setPadrao(j.padrao); setPode(!!j.podeEditar) }
    })()
    return () => { vivo = false }
  }, [])
  const mexer = (f: (r: RegrasComissao) => RegrasComissao) => { setRegras((r) => (r ? f(r) : r)); setMudou(true); setMsg(null) }
  const salvar = async () => {
    if (!regras) return
    setSalvando(true)
    try {
      const r = await fetch('/api/mecanicos/regras-comissao', { method: 'PUT', headers: { ...(await authHeaders()), 'Content-Type': 'application/json' }, body: JSON.stringify({ regras }) })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Falha ao gravar')
      setRegras(j.regras); setMudou(false); setMsg({ t: 'Gravado. As fichas e as previsões usam os novos valores na próxima atualização.', ok: true })
    } catch (e) { setMsg({ t: e instanceof Error ? e.message : 'Falha ao gravar', ok: false }) } finally { setSalvando(false) }
  }
  const pcts = (car?.comissoes || []).map((c) => ({ nome: c.tecnico, pct: c.pct })).sort((a, b) => b.pct - a.pct)
  const ex = pcts[0] || { nome: 'Mecânico', pct: 25 }
  const hoje = new Date(), semMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate() / 7
  const fmtSem = semMes.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
  return (
    <Janela titulo="Comissões" sub="como é calculada, as metas e as regras" ic="fa-sack-dollar" cor="#047857">
      <nav className="cj-abas">
        {([['como', 'Como funciona'], ['metas', 'Metas'], ['regras', 'Regras e valores fixos']] as const).map(([k, r]) => <button key={k} type="button" className={aba === k ? 'on' : ''} onClick={() => setAba(k)}>{r}</button>)}
      </nav>

      {aba === 'como' && <div className="cj-pag">
        <div className="cj-formula">
          <div><small>Valor das horas da OS</small><b>R$ 1.200</b></div><i>×</i>
          <div><small>% do mecânico</small><b>{ex.pct}%</b></div><i>÷</i>
          <div><small>técnicos na OS</small><b>2</b></div><i>=</i>
          <div className="res"><small>comissão de cada um</small><b>{brl2((1200 * ex.pct) / 100 / 2)}</b></div>
        </div>
        <p className="cj-leg">Exemplo com o percentual de {ex.nome.split(' ')[0]}. Conta só o valor das <b>horas</b> — km e peças não entram.</p>
        <div className="cj-cols">
          <div>
            <h4>Percentual de cada um</h4>
            <div className="cj-pcts">{pcts.map((p) => <div key={p.nome}><span>{p.nome}</span><b>{p.pct}%</b><i style={{ width: `${p.pct * 2.5}%` }} /></div>)}</div>
          </div>
          <div>
            <h4>Casos especiais</h4>
            <dl className="cj-dl">
              <dt>Garantia a receber</dt><dd>a hora conta no teto da montadora, R$ 100/h</dd>
              <dt>Entrega e montagem</dt><dd>valor fixo por OS, dividido entre os técnicos</dd>
              <dt>Ajuste do RH</dt><dd>o RH pode corrigir uma OS; o motivo fica registrado</dd>
              <dt>Competência</dt><dd>a OS entra no mês em que faturou</dd>
              <dt>Pagamento</dt><dd>por volta do dia 20 do mês seguinte</dd>
            </dl>
          </div>
        </div>
      </div>}

      {aba === 'metas' && <div className="cj-pag">
        <h4>Um dia de trabalho</h4>
        <div className="cj-dia">
          <span className="c" style={{ flex: 4 }}><b>4 h</b> cobradas</span>
          <span className="d" style={{ flex: 3 }}><b>3 h</b> deslocamento</span>
          <span className="o" style={{ flex: 1 }}><b>1 h</b> ociosa</span>
        </div>
        <div className="cj-escala"><span>0 h</span><span>8 h de jornada · almoço fora</span></div>
        <p className="cj-leg">A meta básica já desconta o deslocamento e a hora ociosa: ficam <b>4 horas cobradas por dia</b>, ou <b>20 por semana</b>.</p>
        <table className="cj-tab">
          <thead><tr><th /><th>Por semana</th><th>No mês <small>(× {fmtSem} semanas)</small></th></tr></thead>
          <tbody>
            <tr><td><span className="cj-dot b" />Básica</td><td>20 h · R$ 4.000</td><td>{Math.round(20 * semMes)} h · {brl2(4000 * semMes).replace(',00', '')}</td></tr>
            <tr><td><span className="cj-dot i" />Ideal</td><td>40 h · R$ 8.000</td><td>{Math.round(40 * semMes)} h · {brl2(8000 * semMes).replace(',00', '')}</td></tr>
          </tbody>
        </table>
      </div>}

      {aba === 'regras' && <div className="cj-pag">
        <table className="cj-tab pn">
          <thead><tr><th>Paga</th><th>Não paga</th></tr></thead>
          <tbody>
            <tr><td>OS faturada para o cliente</td><td>Reserviço e retrabalho (voltou para refazer)</td></tr>
            <tr><td>Revisão e garantia da fábrica</td><td>Serviço na estrutura da própria oficina <small>— exceto entrega e montagem</small></td></tr>
            <tr><td>Cortesia com trabalho do técnico</td><td>Garantia da loja (GARANTIA-NT)</td></tr>
            <tr><td>Entrega, montagem e demonstração <small>(valor fixo)</small></td><td>OS esperando faturar <small>— entra quando faturar</small></td></tr>
          </tbody>
        </table>
        {!regras ? <p className="ji-mudo">carregando as regras…</p> : <>
          <div className="cj-sec"><h4>Valores fixos</h4><small>vale a primeira linha que casar com o contrato da OS</small>
            {pode && <button type="button" className="cj-mais" onClick={() => mexer((r) => ({ ...r, fixos: [...r.fixos, { id: `novo-${Date.now()}`, nome: 'Novo valor fixo', palavras: [], exceto: [], valor: 0, ativo: true }] }))}>+ Acrescentar</button>}</div>
          <div className="ji-grade fixos">
            <div className="ji-th"><span>Serviço</span><span>Contrato tem</span><span>Exceto se tiver</span><span className="n">Valor</span><span>Ativo</span><span /></div>
            {regras.fixos.map((r, i) => <LinhaFixa key={r.id} r={r} pode={pode} mudar={(x) => mexer((g) => ({ ...g, fixos: g.fixos.map((y, k) => (k === i ? { ...y, ...x } : y)) }))} subir={i > 0 ? () => mexer((g) => { const f = [...g.fixos]; [f[i - 1], f[i]] = [f[i], f[i - 1]]; return { ...g, fixos: f } }) : undefined} tirar={() => mexer((g) => ({ ...g, fixos: g.fixos.filter((_, k) => k !== i) }))} />)}
          </div>
          <div className="cj-sec"><h4>Não paga</h4><small>se o contrato, o motivo ou o cliente da OS tiver as palavras</small>
            {pode && <button type="button" className="cj-mais" onClick={() => mexer((r) => ({ ...r, naoPaga: [...r.naoPaga, { id: `novo-${Date.now()}`, nome: 'Nova regra', palavras: [], exceto: [], motivo: '', ativo: true }] }))}>+ Acrescentar</button>}</div>
          <div className="ji-grade nao">
            <div className="ji-th"><span>Regra</span><span>Tem</span><span>Exceto se tiver</span><span>Motivo</span><span>Ativo</span><span /></div>
            {regras.naoPaga.map((r, i) => <LinhaNao key={r.id} r={r} pode={pode} mudar={(x) => mexer((g) => ({ ...g, naoPaga: g.naoPaga.map((y, k) => (k === i ? { ...y, ...x } : y)) }))} tirar={() => mexer((g) => ({ ...g, naoPaga: g.naoPaga.filter((_, k) => k !== i) }))} />)}
          </div>
          <div className="ji-rodape">
            <span className="ji-mudo">{regras.atualizadoEm ? `Mudado em ${new Date(regras.atualizadoEm).toLocaleString('pt-BR')}${regras.atualizadoPor ? ` por ${regras.atualizadoPor}` : ''}.` : 'Iguais ao painel do Omie.'} O RH importa do painel do Omie — mudando aqui, mude lá também.</span>
            {pode ? <>
              {padrao && <button type="button" className="ji-sec" onClick={() => { setRegras({ ...padrao }); setMudou(true) }}>Voltar ao padrão</button>}
              <button type="button" className="ji-pri" disabled={!mudou || salvando} onClick={() => void salvar()}>{salvando ? 'Gravando…' : 'Gravar'}</button>
            </> : <span className="ji-mudo">Só administrador muda.</span>}
          </div>
          {msg && <p className={`ji-msg ${msg.ok ? 'ok' : ''}`}>{msg.t}</p>}
        </>}
      </div>}
    </Janela>
  )
}

const lista = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean)
function LinhaFixa({ r, pode, mudar, subir, tirar }: { r: RegraFixa; pode: boolean; mudar: (x: Partial<RegraFixa>) => void; subir?: () => void; tirar: () => void }) {
  return (
    <div className={`ji-row ${r.ativo ? '' : 'off'}`}>
      <input disabled={!pode} value={r.nome} onChange={(e) => mudar({ nome: e.target.value })} />
      <input disabled={!pode} value={r.palavras.join(', ')} onChange={(e) => mudar({ palavras: lista(e.target.value) })} placeholder="ex.: MONTAGEM" />
      <input disabled={!pode} value={r.exceto.join(', ')} onChange={(e) => mudar({ exceto: lista(e.target.value) })} placeholder="—" />
      <label className="ji-rs">R$<input disabled={!pode} type="number" step="0.01" min="0" value={r.valor} onChange={(e) => mudar({ valor: Number(e.target.value) || 0 })} /></label>
      <button type="button" disabled={!pode} className={`ji-sw ${r.ativo ? 'on' : ''}`} onClick={() => mudar({ ativo: !r.ativo })} aria-label="Ativo"><i /></button>
      <span className="ji-acoes">{pode && <>{subir && <button type="button" onClick={subir} title="Subir (vale antes)"><i className="fas fa-arrow-up" /></button>}<button type="button" onClick={tirar} title="Tirar"><i className="fas fa-trash" /></button></>}</span>
      <em className="ji-prev">{r.ativo ? `${brl2(r.valor)} por OS` : 'desligada'}</em>
    </div>
  )
}
function LinhaNao({ r, pode, mudar, tirar }: { r: RegraNaoPaga; pode: boolean; mudar: (x: Partial<RegraNaoPaga>) => void; tirar: () => void }) {
  return (
    <div className={`ji-row ${r.ativo ? '' : 'off'}`}>
      <input disabled={!pode} value={r.nome} onChange={(e) => mudar({ nome: e.target.value })} />
      <input disabled={!pode} value={r.palavras.join(', ')} onChange={(e) => mudar({ palavras: lista(e.target.value) })} placeholder="ex.: RETRABALHO" />
      <input disabled={!pode} value={r.exceto.join(', ')} onChange={(e) => mudar({ exceto: lista(e.target.value) })} placeholder="—" />
      <input disabled={!pode} value={r.motivo} onChange={(e) => mudar({ motivo: e.target.value })} />
      <button type="button" disabled={!pode} className={`ji-sw ${r.ativo ? 'on' : ''}`} onClick={() => mudar({ ativo: !r.ativo })} aria-label="Ativo"><i /></button>
      <span className="ji-acoes">{pode && <button type="button" onClick={tirar} title="Tirar"><i className="fas fa-trash" /></button>}</span>
    </div>
  )
}

const ESTILO_JI = `
@keyframes jiFade { from { opacity: 0 } } @keyframes jiSobe { from { opacity: 0; transform: translateY(20px) scale(.98) } }
.ji-fundo { position: fixed; inset: 0; z-index: 9300; background: rgba(15,23,42,.5); backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: center; padding: 16px; animation: jiFade .2s both }
.ji { width: min(1180px, 100%); max-height: 94vh; display: flex; flex-direction: column; background: var(--portal-bg, #f8fafc); border-radius: 22px; overflow: hidden; box-shadow: 0 30px 80px rgba(15,23,42,.35); animation: jiSobe .35s cubic-bezier(.2,1.1,.3,1) both; color: var(--portal-text, #0f172a) }
.ji-cab { display: flex; gap: 14px; align-items: center; padding: 16px 22px; background: #fefefe; border-bottom: 1px solid var(--portal-border, #e2e8f0) }
.ji-ic { width: 44px; height: 44px; border-radius: 50%; display: grid; place-items: center; font-size: 18px; color: #fefefe; background: var(--jc) }
.ji-cab > div { flex: 1; display: grid } .ji-cab b { font-size: 19px; font-weight: 800 } .ji-cab small { font-size: 13px; color: ${MUDO} }
.ji-cab button { width: 36px; height: 36px; border-radius: 50%; border: none; background: #f1f5f9; color: #334155; font-size: 16px; cursor: pointer } .ji-cab button:hover { background: #fee2e2; color: #dc2626 }
.ji-corpo { overflow: auto; padding: 18px 22px 24px; display: grid; gap: 14px }
.ji-intro { margin: 0; font-size: 14.5px; line-height: 1.55; color: #334155 }
.ji-h { margin: 0; font-size: 15px; font-weight: 700; color: #0f172a } .ji-mudo { color: ${MUDO}; font-size: 13px; margin: 0 }
.ji-escada { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 8px }
.ji-div { background: #fefefe; border: 1px solid var(--portal-border, #e2e8f0); border-top: 4px solid var(--dc); border-radius: 14px; padding: 10px; display: grid; gap: 8px }
.ji-div-cab { display: flex; gap: 8px; align-items: center } .ji-div-cab b { font-size: 15px; font-weight: 700; color: var(--dc) }
.ji-niveis { display: flex; gap: 4px; flex-wrap: wrap } .ji-niveis span { min-width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; font-size: 11.5px; font-weight: 700; background: color-mix(in srgb, var(--dc) 12%, #fefefe); color: var(--dc) }
.ji-regras { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px }
.ji-regras > div { display: grid; gap: 3px; background: #fefefe; border: 1px solid var(--portal-border, #e2e8f0); border-radius: 14px; padding: 12px 14px } .ji-regras b { font-size: 17px; font-weight: 800 } .ji-regras span { font-size: 13px; color: #475569; line-height: 1.4 } .ji-regras u { text-decoration: none; font-weight: 700; color: #0f172a }
.ji-regras .bom b { color: #047857 } .ji-regras .ruim b { color: #dc2626 }
.ji-tab { display: grid; gap: 6px }
.ji-lin { display: grid; grid-template-columns: 36px minmax(160px, 1fr) 150px 180px 200px 160px; gap: 12px; align-items: center; background: #fefefe; border: 1px solid var(--portal-border, #e2e8f0); border-radius: 12px; padding: 8px 12px; font-size: 13.5px }
.ji-lin .bom b { color: #047857 } .ji-lin .ruim b { color: #dc2626 } .ji-liga { display: inline-flex; gap: 6px; align-items: center; font-weight: 700 }
.ji-foto { width: 36px; height: 36px; border-radius: 50%; object-fit: cover } .ji-foto.ini { display: grid; place-items: center; background: linear-gradient(135deg, #2563eb, #7c3aed); color: #fefefe; font-weight: 800; font-size: 12px }
.ji-dois { display: grid; grid-template-columns: 1fr 1fr; gap: 14px }
.ji-box { background: #fefefe; border: 1px solid var(--portal-border, #e2e8f0); border-radius: 16px; padding: 16px 18px; display: grid; gap: 10px; align-content: start }
.ji-box.bom { border-top: 4px solid #10b981 } .ji-box.ruim { border-top: 4px solid #ef4444 }
.ji-passos { margin: 0; padding-left: 18px; display: grid; gap: 8px; font-size: 13.5px; line-height: 1.45; color: #334155 } .ji-passos b { color: #0f172a } .ji-passos u { text-decoration: none; font-weight: 700 }
.ji-pcts { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 5px } .ji-pcts em { font-style: normal; font-size: 12px; background: #f1f5f9; border-radius: 99px; padding: 2px 9px; color: #475569 } .ji-pcts b { color: #047857 }
.ji-metas { display: grid; grid-template-columns: 1fr 1fr; gap: 8px } .ji-metas div { display: grid; background: #f0fdf4; border-radius: 12px; padding: 10px 12px } .ji-metas .ide { background: #f5f3ff }
.ji-metas small { font-size: 12px; color: ${MUDO}; font-weight: 600 } .ji-metas b { font-size: 17px; font-weight: 800 } .ji-metas em { font-style: normal; font-size: 12px; color: ${MUDO} }
.ji-nota { margin: 0; font-size: 13.5px; line-height: 1.5; color: #334155; background: #fffbeb; border: 1px solid #fde68a; border-radius: 12px; padding: 10px 12px }
.ji-conta { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; font-size: 13px } .ji-conta span { background: #f1f5f9; border-radius: 8px; padding: 4px 9px; font-weight: 600 } .ji-conta .d { background: #fef2f2; color: #b91c1c } .ji-conta .r { background: #ecfdf5; color: #047857 } .ji-conta i { font-style: normal; color: ${MUDO}; font-weight: 700 }
.ji-lista { margin: 0; padding-left: 18px; display: grid; gap: 6px; font-size: 13.5px; color: #334155 }
.ji-h-lin { display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap } .ji-h-lin small { flex: 1; font-size: 12.5px; color: ${MUDO} }
.ji-add { border: 1px solid #a7f3d0; background: #ecfdf5; color: #047857; border-radius: 99px; padding: 5px 12px; font-family: inherit; font-size: 12.5px; font-weight: 700; cursor: pointer }
.ji-grade { display: grid; gap: 4px }
.ji-grade.fixos .ji-th, .ji-grade.fixos .ji-row { grid-template-columns: minmax(180px, 1.4fr) minmax(140px, 1fr) minmax(110px, .8fr) 120px 50px 70px }
.ji-grade.nao .ji-th, .ji-grade.nao .ji-row { grid-template-columns: minmax(170px, 1.2fr) minmax(130px, 1fr) minmax(110px, .8fr) minmax(200px, 1.4fr) 50px 40px }
.ji-th { display: grid; gap: 8px; font-size: 11.5px; font-weight: 600; color: ${MUDO}; padding: 0 2px } .ji-th .n { text-align: right }
.ji-row { display: grid; gap: 8px; align-items: center; position: relative } .ji-row.off input { opacity: .5 }
.ji-row input { min-width: 0; border: 1px solid var(--portal-border, #e2e8f0); border-radius: 9px; padding: 7px 10px; font-family: inherit; font-size: 13.5px; color: #0f172a; background: #fefefe } .ji-row input:disabled { background: #f8fafc; color: #334155 }
.ji-row input:focus { outline: 2px solid #a7f3d0; border-color: #10b981 }
.ji-rs { display: flex; gap: 4px; align-items: center; font-size: 12.5px; color: ${MUDO} } .ji-rs input { text-align: right; font-weight: 700; width: 100% }
.ji-sw { position: relative; width: 38px; height: 22px; border-radius: 99px; border: none; background: #cbd5e1; cursor: pointer; transition: background .2s } .ji-sw i { position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%; background: #fefefe; transition: transform .25s } .ji-sw.on { background: #10b981 } .ji-sw.on i { transform: translateX(16px) } .ji-sw:disabled { cursor: default; opacity: .7 }
.ji-acoes { display: inline-flex; gap: 2px } .ji-acoes button { width: 28px; height: 28px; border-radius: 50%; border: none; background: transparent; color: ${MUDO}; cursor: pointer } .ji-acoes button:hover { background: #f1f5f9; color: #0f172a }
.ji-prev { display: none }
.ji-rodape { display: flex; gap: 10px; align-items: center; flex-wrap: wrap } .ji-rodape > .ji-mudo { flex: 1; font-size: 12.5px }
.ji-pri { border: none; background: #047857; color: #fefefe; border-radius: 99px; padding: 10px 20px; font-family: inherit; font-size: 14px; font-weight: 700; cursor: pointer } .ji-pri:disabled { opacity: .45; cursor: default }
.ji-sec { border: 1px solid var(--portal-border, #e2e8f0); background: #fefefe; color: #334155; border-radius: 99px; padding: 9px 16px; font-family: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer }
.ji-msg { margin: 0; font-size: 13px; color: #b91c1c; background: #fef2f2; border-radius: 10px; padding: 8px 12px } .ji-msg.ok { color: #047857; background: #ecfdf5 }
@media (max-width: 900px) { .ji-escada { grid-template-columns: 1fr 1fr } .ji-regras, .ji-dois { grid-template-columns: 1fr } .ji-lin { grid-template-columns: 36px 1fr } .ji-grade .ji-th { display: none } .ji-grade.fixos .ji-row, .ji-grade.nao .ji-row { grid-template-columns: 1fr 1fr } }
/* janela de comissões — sóbria: abas, fórmula, tabelas e planilha (20/10/2026) */
.cj-abas { display: flex; gap: 22px; border-bottom: 1px solid var(--portal-border, #e2e8f0); margin: -4px 0 4px }
.cj-abas button { border: none; background: none; padding: 10px 0 12px; font-family: inherit; font-size: 14px; font-weight: 600; color: #64748b; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px } .cj-abas button:hover { color: #0f172a } .cj-abas button.on { color: #0f172a; border-bottom-color: #0f172a }
.cj-pag { display: grid; gap: 16px; animation: jiSobe .25s both }
.cj-pag h4 { margin: 0; font-size: 13px; font-weight: 600; color: #0f172a }
.cj-formula { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; padding: 20px 22px; background: #fefefe; border: 1px solid var(--portal-border, #e2e8f0); border-radius: 14px }
.cj-formula > div { display: grid; gap: 2px } .cj-formula small { font-size: 12px; color: #64748b } .cj-formula b { font-size: 26px; font-weight: 700; color: #0f172a; font-variant-numeric: tabular-nums } .cj-formula > i { font-style: normal; font-size: 22px; color: #94a3b8 }
.cj-formula .res b { color: #047857 }
.cj-leg { margin: -6px 0 0; font-size: 13px; color: #64748b } .cj-leg b { color: #0f172a; font-weight: 600 }
.cj-cols { display: grid; grid-template-columns: 1fr 1.4fr; gap: 28px } .cj-cols > div { display: grid; gap: 10px; align-content: start }
.cj-pcts { display: grid; gap: 2px } .cj-pcts div { position: relative; display: flex; justify-content: space-between; padding: 8px 10px; font-size: 13.5px; border-radius: 8px; overflow: hidden } .cj-pcts span { position: relative; z-index: 1; color: #334155 } .cj-pcts b { position: relative; z-index: 1; font-weight: 600; color: #0f172a; font-variant-numeric: tabular-nums }
.cj-pcts i { position: absolute; left: 0; top: 0; bottom: 0; background: #ecfdf5; border-radius: 8px }
.cj-dl { margin: 0; display: grid; grid-template-columns: 170px 1fr; font-size: 13.5px } .cj-dl dt, .cj-dl dd { margin: 0; padding: 9px 0; border-top: 1px solid var(--portal-border, #eef2f7) } .cj-dl dt { color: #0f172a; font-weight: 600 } .cj-dl dd { color: #475569 }
.cj-dia { display: flex; height: 44px; border-radius: 10px; overflow: hidden; font-size: 13px }
.cj-dia span { display: flex; align-items: center; justify-content: center; gap: 5px; color: #334155 } .cj-dia b { font-weight: 700 }
.cj-dia .c { background: #10b981; color: #fefefe } .cj-dia .d { background: repeating-linear-gradient(135deg, #e2e8f0 0 8px, #f1f5f9 8px 16px) } .cj-dia .o { background: #f8fafc; border-left: 1px solid #e2e8f0; font-size: 12px }
.cj-escala { display: flex; justify-content: space-between; font-size: 11.5px; color: #94a3b8; margin-top: -10px }
.cj-tab { width: 100%; border-collapse: collapse; font-size: 13.5px; background: #fefefe; border: 1px solid var(--portal-border, #e2e8f0); border-radius: 12px; overflow: hidden }
.cj-tab th { text-align: left; font-size: 12px; font-weight: 600; color: #64748b; padding: 10px 14px; background: #f8fafc; border-bottom: 1px solid var(--portal-border, #e2e8f0) } .cj-tab th small { font-weight: 500 }
.cj-tab td { padding: 10px 14px; border-top: 1px solid var(--portal-border, #f1f5f9); color: #0f172a; font-variant-numeric: tabular-nums } .cj-tab td small { color: #64748b }
.cj-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 8px } .cj-dot.b { background: #10b981 } .cj-dot.i { background: #8b5cf6 }
.cj-tab.pn td { width: 50% } .cj-tab.pn td:first-child::before { content: '✓'; color: #059669; font-weight: 700; margin-right: 8px } .cj-tab.pn td:last-child::before { content: '✕'; color: #dc2626; font-weight: 700; margin-right: 8px } .cj-tab.pn td + td { border-left: 1px solid var(--portal-border, #f1f5f9) }
.cj-sec { display: flex; gap: 10px; align-items: baseline; margin-top: 6px } .cj-sec small { flex: 1; font-size: 12.5px; color: #94a3b8 }
.cj-mais { border: none; background: none; color: #047857; font-family: inherit; font-size: 13px; font-weight: 600; cursor: pointer } .cj-mais:hover { text-decoration: underline }
/* planilha: campos sem borda até passar o mouse */
.cj-pag .ji-grade { background: #fefefe; border: 1px solid var(--portal-border, #e2e8f0); border-radius: 12px; padding: 4px 6px; gap: 0 }
.cj-pag .ji-th { padding: 8px 8px; font-size: 12px; font-weight: 600 } .cj-pag .ji-row { padding: 2px 0; border-top: 1px solid #f1f5f9 }
.cj-pag .ji-row input { border-color: transparent; background: transparent; font-size: 13.5px } .cj-pag .ji-row input:hover:not(:disabled) { border-color: #e2e8f0 } .cj-pag .ji-row input:focus { background: #fefefe; border-color: #10b981 }
.cj-pag .ji-row input:disabled { background: transparent }
@media (max-width: 900px) { .cj-cols { grid-template-columns: 1fr } .cj-dl { grid-template-columns: 1fr } .cj-dl dd { border-top: none; padding-top: 0 } }
`
