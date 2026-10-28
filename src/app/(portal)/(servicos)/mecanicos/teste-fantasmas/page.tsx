'use client'
// Página de TESTE (José, 28/10/2026) do cartão do técnico em "Horas e km fantasmas".
// Rodada 3: "pega todas as informações e cruzamentos e coloca pra gente ver de forma minimalista" → aprovou o resumo
// (KM / HORAS / NO CLIENTE / TEMPÁRIO) e pediu "apaga os testes e me dá 5 opções dessas". Dados reais; nada aqui muda a tela.
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import SemPermissao from '@/components/SemPermissao'
import { authHeaders } from '@/lib/auth/client'
import type { Fantasmas, TecnicoFantasma } from '@/lib/mecanicos/fantasmas-server'
import type { FuroKm } from '@/lib/mecanicos/furo-km-server'
import FuroKmJanela from '@/components/mecanicos/FuroKmJanela'

const mesSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()).slice(0, 7)
const h = (v: number) => `${String(Math.round(v * 10) / 10).replace('.', ',')} h`
const km = (v: number) => `${Math.round(v).toLocaleString('pt-BR')} km`
const nome2 = (n: string) => n.split(' ').slice(0, 2).join(' ')
const ini = (n: string) => n.split(' ').filter((p) => /^[A-ZÀ-Ú]/.test(p)).map((p) => p[0]).slice(0, 2).join('')
const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

/** Uma linha do resumo: ✗ erro (vermelho) ou · explicação (cinza); `fontes` = o que foi cruzado; `mapa` abre o furo. */
type Linha = { erro: boolean; v: string; txt: string; fontes: string; mapa?: boolean; sub?: string }
type Bloco = { k: string; ic: string; titulo: string; fluxo: { rot: string; v: string }[]; linhas: Linha[]; dev?: boolean; nota?: string }

function montar(t: TecnicoFantasma, fk: FuroKm | null): Bloco[] {
  const x = t.totais
  const temCarro = t.placas.length > 0 && x.kmCarro > 0
  const foraRel = Math.max(0, x.kmCarro - x.kmRel), relSemCob = Math.max(0, x.kmRel - x.kmCobrado)
  const semOS = fk?.dias.filter((d) => !d.os.length && d.kmGps > 5) || []
  const comColega = semOS.filter((d) => d.colegas.some((o) => o.noCliente))
  const colegas = [...new Set(comColega.flatMap((d) => d.colegas.filter((o) => o.noCliente).map((o) => o.tecnico.split(' ')[0])))]
  const kmL: Linha[] = []
  if (temCarro && foraRel > 0.5) kmL.push({ erro: true, v: km(foraRel), txt: 'rodados que não estão em relatório', fontes: 'GPS × relatório', mapa: true })
  if (relSemCob > 0.5) kmL.push({ erro: true, v: km(relSemCob), txt: 'do relatório não cobrados', fontes: 'relatório × OS' })
  if (temCarro && x.diasCarroSemOS) kmL.push({ erro: false, v: `${x.diasCarroSemOS} dia${x.diasCarroSemOS === 1 ? '' : 's'}`, txt: `rodando sem OS (${km(x.kmSemOS)})`, fontes: 'GPS × OS', mapa: true, sub: comColega.length ? `${comColega.length} deles levando ${colegas.join(' e ')} (${comColega.map((d) => ddmm(d.data)).join(' e ')})` : undefined })
  const hL: Linha[] = []
  if (x.naoCobradas > 0.05) hL.push({ erro: true, v: h(x.naoCobradas), txt: 'apontadas e não cobradas', fontes: 'relatório × OS' })
  if (temCarro && x.ligadoSemOS > 0.05) hL.push({ erro: false, v: h(x.ligadoSemOS), txt: 'de carro ligado em dias sem OS', fontes: 'GPS × OS' })
  const osDias = fk?.dias.flatMap((d) => d.os) || []
  const com = osDias.filter((o) => o.noCliente), conf = com.filter((o) => o.noCliente!.conf !== 'provavel')
  const minCli = com.reduce((s, o) => s + o.noCliente!.min, 0), hApont = com.reduce((s, o) => s + o.horasRel, 0)
  const cL: Linha[] = []
  if (temCarro && fk) {
    cL.push({ erro: false, v: `${com.length} de ${osDias.length}`, txt: 'dias de OS com o carro no cliente', fontes: 'GPS × local do cliente', sub: com.length ? `${h(minCli / 60)} parado lá × ${h(hApont)} apontadas nesses dias${com.length > conf.length ? ` · ${com.length - conf.length} são palpite (sem local cadastrado)` : ''}` : undefined })
    if (osDias.length - com.length > 0) cL.push({ erro: true, v: `${osDias.length - com.length} dia${osDias.length - com.length === 1 ? '' : 's'}`, txt: 'de OS sem o carro passar no cliente', fontes: 'GPS × local do cliente', mapa: true })
  }
  return [
    { k: 'km', ic: 'fa-road', titulo: 'Km', fluxo: [...(temCarro ? [{ rot: 'GPS', v: km(x.kmCarro) }] : []), { rot: 'relatório', v: km(x.kmRel) }, { rot: 'OS', v: km(x.kmCobrado) }], linhas: kmL, nota: temCarro ? undefined : 'sem carro vinculado: sem GPS para conferir' },
    { k: 'horas', ic: 'fa-clock', titulo: 'Horas', fluxo: [{ rot: 'relatório', v: h(x.horasRel) }, { rot: 'OS', v: h(x.horasCobradas) }], linhas: hL },
    { k: 'cliente', ic: 'fa-location-dot', titulo: 'No cliente', fluxo: [], linhas: cL, nota: !temCarro ? 'sem carro vinculado' : !fk ? 'carregando…' : undefined },
    { k: 'tempario', ic: 'fa-stopwatch', titulo: 'Tempário', fluxo: [], linhas: [], dev: true },
  ]
}

const OPCOES = [
  { n: 1, t: 'Resumo em linhas', d: 'o que você aprovou: cada bloco com o caminho dos números e só os erros embaixo' },
  { n: 2, t: 'Só os erros, do maior pro menor', d: 'uma lista única dos problemas; o que está certo fica num rodapé' },
  { n: 3, t: 'Quatro colunas', d: 'Km, Horas, No cliente e Tempário lado a lado, cada um com seus erros' },
  { n: 4, t: 'Em frases', d: 'o mês contado em poucas frases, com os números em destaque' },
  { n: 5, t: 'Tabela de cruzamentos', d: 'uma linha por cruzamento: o que foi comparado, o resultado e o status' },
] as const

export default function TesteFantasmasPage() {
  const { userProfile } = useAuth()
  const { temAcesso, loading } = usePermissoes(userProfile?.id)
  const [d, setD] = useState<Fantasmas | null>(null)
  const [fks, setFks] = useState<Record<string, FuroKm | null>>({})
  const [erro, setErro] = useState('')
  const [tec, setTec] = useState<string | null>(null)
  const [op, setOp] = useState(1)
  const [furo, setFuro] = useState(false)
  const mes = mesSP()
  useEffect(() => {
    ;(async () => {
      try {
        const r = await fetch(`/api/mecanicos/fantasmas?mes=${mes}`, { headers: await authHeaders(), cache: 'no-store' })
        const j = await r.json()
        if (!r.ok) throw new Error(j.error || 'Falha')
        setD(j); setTec((j as Fantasmas).tecnicos[0]?.tecnico || null)
      } catch (e) { setErro(e instanceof Error ? e.message : 'Falha') }
    })()
  }, [mes])
  // cruzamento com o cliente e os colegas vem do furo de km (um por técnico)
  useEffect(() => {
    if (!tec || tec in fks) return
    ;(async () => {
      try {
        const r = await fetch(`/api/mecanicos/fantasmas/furo?tecnico=${encodeURIComponent(tec)}&mes=${mes}`, { headers: await authHeaders(), cache: 'no-store' })
        const j = r.ok ? await r.json() : null
        setFks((p) => ({ ...p, [tec]: j }))
      } catch { setFks((p) => ({ ...p, [tec]: null })) }
    })()
  }, [tec, mes, fks])
  const t = d?.tecnicos.find((x) => x.tecnico === tec) || null
  const blocos = useMemo(() => (t ? montar(t, fks[t.tecnico] ?? null) : []), [t, fks])
  if (!loading && userProfile && !temAcesso('mecanicos')) return <SemPermissao />
  const P = { blocos, t: t!, onMapa: () => setFuro(true) }

  return (
    <div className="tf">
      <style>{ESTILO}</style>
      <div className="tf-cab">
        <span className="tf-selo">página de teste · rodada 3</span>
        <h1>Tudo cruzado, minimalista: 5 formas</h1>
        <p>Os mesmos cruzamentos nas 5: GPS do carro, relatório do técnico, OS cobrada, local do cliente e OS dos colegas. Dados reais deste mês. &quot;mapa ›&quot; abre o caminho do carro. Nada aqui muda a tela de Mecânicos.</p>
      </div>
      {erro && <div className="tf-erro">{erro}</div>}
      {!d && !erro && <div className="tf-carr"><i className="fas fa-circle-notch fa-spin" /> carregando os dados do mês…</div>}
      {d && (
        <>
          <div className="tf-tecs">
            {d.tecnicos.map((x) => <button key={x.tecnico} type="button" className={x.tecnico === tec ? 'on' : ''} onClick={() => setTec(x.tecnico)}><span>{ini(x.tecnico)}</span>{nome2(x.tecnico)}</button>)}
          </div>
          <div className="tf-ops">
            {OPCOES.map((o) => (
              <button key={o.n} type="button" className={op === o.n ? 'on' : ''} onClick={() => setOp(o.n)}>
                <b>{o.n}</b><span><strong>{o.t}</strong><small>{o.d}</small></span>
              </button>
            ))}
          </div>
          {t && (
            <div className="tf-palco" key={`${op}-${t.tecnico}`}>
              <div className="tf-palco-cab"><b>{t.tecnico}</b><small>{t.placas.length ? t.placas.join(', ') : 'sem carro'} · {MESES[Number(mes.slice(5, 7)) - 1]} · {t.os.length} OS</small><em>Opção {op}</em></div>
              {op === 1 && <Linhas {...P} />}
              {op === 2 && <SoErros {...P} />}
              {op === 3 && <Colunas {...P} />}
              {op === 4 && <Frases {...P} fk={fks[t.tecnico] ?? null} />}
              {op === 5 && <Tabela {...P} />}
            </div>
          )}
          {furo && t && <FuroKmJanela tecnico={t.tecnico} mes={mes} onFechar={() => setFuro(false)} />}
        </>
      )}
    </div>
  )
}

type PP = { blocos: Bloco[]; t: TecnicoFantasma; onMapa: () => void }
const Mapa = ({ on, onMapa }: { on?: boolean; onMapa: () => void }) => (on ? <button type="button" className="tf-mapa" onClick={onMapa}>mapa ›</button> : null)
const Dev = () => <span className="tf-dev">em desenvolvimento</span>

/* 1 · resumo em linhas */
function Linhas({ blocos, onMapa }: PP) {
  return (
    <div className="m1">
      {blocos.map((b, i) => (
        <section key={b.k} className="m1-b" style={{ animationDelay: `${i * 90}ms` }}>
          <div className="m1-cab">
            <span className="m1-t"><i className={`fas ${b.ic}`} /> {b.titulo}</span>
            {b.dev ? <Dev /> : <span className="m1-fluxo">{b.fluxo.map((f, k) => <span key={k}>{k > 0 && <i className="fas fa-arrow-right-long" />}<small>{f.rot}</small> <b>{f.v}</b></span>)}</span>}
          </div>
          {b.nota && <p className="m1-nota">{b.nota}</p>}
          {b.linhas.map((l, k) => (
            <div key={k} className={`m1-l ${l.erro ? 'x' : ''}`}>
              <span className="m1-s">{l.erro ? '✗' : '·'}</span>
              <span className="m1-txt"><b>{l.v}</b> {l.txt}{l.sub && <small>{l.sub}</small>}</span>
              <Mapa on={l.mapa} onMapa={onMapa} />
            </div>
          ))}
          {!b.dev && !b.linhas.length && !b.nota && <div className="m1-l ok"><span className="m1-s">✓</span><span className="m1-txt">tudo bate</span></div>}
        </section>
      ))}
    </div>
  )
}

/* 2 · só os erros */
function SoErros({ blocos, onMapa }: PP) {
  const erros = blocos.flatMap((b) => b.linhas.filter((l) => l.erro).map((l) => ({ ...l, b })))
  const info = blocos.flatMap((b) => b.linhas.filter((l) => !l.erro).map((l) => ({ ...l, b })))
  return (
    <div className="m2">
      <p className="m2-t">{erros.length ? <><b>{erros.length}</b> {erros.length === 1 ? 'problema' : 'problemas'} no mês</> : <><b>Nenhum problema</b> no mês</>}</p>
      {erros.map((l, i) => (
        <div key={i} className="m2-l" style={{ animationDelay: `${i * 80}ms` }}>
          <i className={`fas ${l.b.ic}`} />
          <b>{l.v}</b>
          <span>{l.txt}<small>{l.fontes}</small></span>
          <Mapa on={l.mapa} onMapa={onMapa} />
        </div>
      ))}
      <div className="m2-pe">
        {info.map((l, i) => <span key={i}><i className={`fas ${l.b.ic}`} /> {l.v} {l.txt}{l.sub ? ` · ${l.sub}` : ''} <Mapa on={l.mapa} onMapa={onMapa} /></span>)}
        {blocos.filter((b) => !b.dev).map((b) => <span key={b.k} className="fl"><i className={`fas ${b.ic}`} /> {b.fluxo.map((f) => `${f.rot} ${f.v}`).join(' → ') || b.nota}</span>)}
        <span className="fl"><i className="fas fa-stopwatch" /> tempário: em desenvolvimento</span>
      </div>
    </div>
  )
}

/* 3 · quatro colunas */
function Colunas({ blocos, onMapa }: PP) {
  return (
    <div className="m3">
      {blocos.map((b, i) => {
        const n = b.linhas.filter((l) => l.erro).length
        return (
          <section key={b.k} className={`m3-c ${b.dev ? 'dev' : n ? 'x' : 'ok'}`} style={{ animationDelay: `${i * 90}ms` }}>
            <header><i className={`fas ${b.ic}`} /> {b.titulo}<em>{b.dev ? '' : n ? `${n} ✗` : '✓'}</em></header>
            {b.dev ? <Dev /> : (
              <>
                {b.fluxo.length > 0 && <div className="m3-fluxo">{b.fluxo.map((f, k) => <div key={k}><small>{f.rot}</small><b>{f.v}</b></div>)}</div>}
                {b.nota && <p className="m3-nota">{b.nota}</p>}
                <div className="m3-l">
                  {b.linhas.map((l, k) => (
                    <div key={k} className={l.erro ? 'x' : ''}>
                      <b>{l.v}</b><span>{l.txt}</span>{l.sub && <small>{l.sub}</small>}<Mapa on={l.mapa} onMapa={onMapa} />
                    </div>
                  ))}
                  {!b.linhas.length && !b.nota && <div className="ok"><span>tudo bate</span></div>}
                </div>
              </>
            )}
          </section>
        )
      })}
    </div>
  )
}

/* 4 · em frases */
const B = ({ c, children }: { c?: 'x'; children: React.ReactNode }) => <b className={c}>{children}</b>
function Frases({ t, onMapa, fk }: PP & { fk: FuroKm | null }) {
  const x = t.totais
  const temCarro = t.placas.length > 0 && x.kmCarro > 0
  const nome = t.tecnico.split(' ')[0]
  const osDias = fk?.dias.flatMap((d) => d.os) || []
  const com = osDias.filter((o) => o.noCliente)
  const semOS = fk?.dias.filter((d) => !d.os.length && d.kmGps > 5) || []
  const comColega = semOS.filter((d) => d.colegas.some((o) => o.noCliente))
  return (
    <div className="m4">
      <p><i className="fas fa-road" /> {temCarro ? <>O carro rodou <B>{km(x.kmCarro)}</B>, </> : <>Sem carro vinculado. </>}{nome} pôs <B>{km(x.kmRel)}</B> no relatório e foram cobrados <B>{km(x.kmCobrado)}</B>.
        {temCarro && x.kmCarro > x.kmRel && <> Ficaram <B c="x">{km(x.kmCarro - x.kmRel)}</B> fora do relatório <Mapa on onMapa={onMapa} /></>}
        {x.kmRel > x.kmCobrado && <> e <B c="x">{km(x.kmRel - x.kmCobrado)}</B> do relatório sem cobrar.</>}</p>
      {temCarro && x.diasCarroSemOS > 0 && <p><i className="fas fa-calendar-xmark" /> Em <B>{x.diasCarroSemOS} dia{x.diasCarroSemOS === 1 ? '' : 's'}</B> o carro rodou sem nenhuma OS dele ({km(x.kmSemOS)}){comColega.length ? <>; em <B>{comColega.length}</B> deles foi no cliente de um colega ({comColega.map((d) => ddmm(d.data)).join(' e ')})</> : null}. <Mapa on onMapa={onMapa} /></p>}
      <p><i className="fas fa-clock" /> Apontou <B>{h(x.horasRel)}</B> e foram cobradas <B>{h(x.horasCobradas)}</B>{x.naoCobradas > 0.05 ? <>: <B c="x">{h(x.naoCobradas)}</B> não cobradas.</> : '.'}{temCarro && x.ligadoSemOS > 0.05 && <> O carro ficou <B>{h(x.ligadoSemOS)}</B> ligado em dias sem OS.</>}</p>
      {temCarro && fk && osDias.length > 0 && <p><i className="fas fa-location-dot" /> Em <B>{com.length} de {osDias.length}</B> dias de OS o carro esteve no cliente ({h(com.reduce((s, o) => s + o.noCliente!.min, 0) / 60)} parado lá, {h(com.reduce((s, o) => s + o.horasRel, 0))} apontadas){osDias.length - com.length ? <>; em <B c="x">{osDias.length - com.length}</B> não passou lá</> : null}. <Mapa on onMapa={onMapa} /></p>}
      <p className="dev"><i className="fas fa-stopwatch" /> Tempário: em desenvolvimento.</p>
    </div>
  )
}

/* 5 · tabela de cruzamentos */
function Tabela({ blocos, onMapa }: PP) {
  const linhas = blocos.flatMap((b) => b.linhas.map((l) => ({ ...l, b })))
  return (
    <table className="m5">
      <thead><tr><th /><th>cruzamento</th><th>resultado</th><th /></tr></thead>
      <tbody>
        {linhas.map((l, i) => (
          <tr key={i} className={l.erro ? 'x' : ''} style={{ animationDelay: `${i * 60}ms` }}>
            <td className="s">{l.erro ? '✗' : '·'}</td>
            <td><i className={`fas ${l.b.ic}`} /> {l.fontes}</td>
            <td><b>{l.v}</b> {l.txt}{l.sub && <small>{l.sub}</small>}</td>
            <td><Mapa on={l.mapa} onMapa={onMapa} /></td>
          </tr>
        ))}
        <tr className="dev"><td className="s">·</td><td><i className="fas fa-stopwatch" /> relatório × tempário</td><td><Dev /></td><td /></tr>
      </tbody>
    </table>
  )
}

const ESTILO = `
.tf { padding: clamp(14px, 2vw, 24px) clamp(12px, 2vw, 28px); background: var(--portal-bg, #f8fafc); min-height: 100vh; color: #0f172a; display: grid; gap: 16px; align-content: start }
.tf-cab { display: grid; gap: 6px } .tf-cab h1 { margin: 0; font-size: 22px; font-weight: 600 } .tf-cab p { margin: 0; font-size: 14.5px; color: #334155; max-width: 1000px; line-height: 1.5 }
.tf-selo { justify-self: start; font-size: 12.5px; font-weight: 600; color: #7c3aed; background: #f5f3ff; border: 1px dashed #c4b5fd; border-radius: 99px; padding: 3px 10px }
.tf-erro { background: #fef2f2; color: #b91c1c; border-radius: 12px; padding: 12px } .tf-carr { padding: 40px; text-align: center; color: #475569 }
.tf-tecs { display: flex; gap: 8px; flex-wrap: wrap } .tf-tecs button { display: inline-flex; gap: 8px; align-items: center; border: 1px solid #e2e8f0; background: #fefefe; border-radius: 99px; padding: 5px 14px 5px 5px; font-family: inherit; font-size: 14px; cursor: pointer; color: #0f172a }
.tf-tecs button span { width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; background: #f1f5f9; font-size: 12px; font-weight: 600 } .tf-tecs button.on { background: #0f172a; color: #fefefe; border-color: #0f172a } .tf-tecs button.on span { background: #fefefe; color: #0f172a }
.tf-ops { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 8px }
.tf-ops button { display: grid; grid-template-columns: 32px 1fr; gap: 10px; text-align: left; align-items: start; border: 1px solid #e2e8f0; background: #fefefe; border-radius: 14px; padding: 10px 12px; font-family: inherit; cursor: pointer; color: #0f172a }
.tf-ops button > b { width: 32px; height: 32px; border-radius: 10px; display: grid; place-items: center; background: #f1f5f9; font-weight: 600 } .tf-ops button span { display: grid; gap: 2px } .tf-ops strong { font-size: 14px; font-weight: 500 } .tf-ops small { font-size: 12.5px; color: #475569; line-height: 1.35 }
.tf-ops button.on { border-color: #2563eb; box-shadow: inset 0 0 0 1px #2563eb } .tf-ops button.on > b { background: #2563eb; color: #fefefe }
.tf-palco { background: #fefefe; border: 1px solid #e2e8f0; border-radius: 18px; padding: 20px 24px; display: grid; gap: 18px; animation: tfEntra .35s both; max-width: 1100px }
.tf-palco-cab { display: flex; gap: 6px 12px; align-items: baseline; flex-wrap: wrap } .tf-palco-cab b { font-size: 17px; font-weight: 500 } .tf-palco-cab small { color: #64748b; font-size: 13.5px } .tf-palco-cab em { margin-left: auto; font-style: normal; font-size: 12px; color: #64748b }
.tf-mapa { border: 0; background: none; font-family: inherit; font-size: 13px; color: #2563eb; cursor: pointer; padding: 0; white-space: nowrap } .tf-mapa:hover { text-decoration: underline }
.tf-dev { font-size: 12.5px; color: #64748b; border: 1px dashed #cbd5e1; border-radius: 99px; padding: 2px 10px; white-space: nowrap }
@keyframes tfEntra { from { opacity: 0; transform: translateY(6px) } }

/* 1 linhas */
.m1 { display: grid; gap: 4px }
.m1-b { display: grid; gap: 2px; padding: 12px 0; border-top: 1px solid #f1f5f9; animation: tfEntra .4s both } .m1-b:first-child { border-top: 0; padding-top: 0 }
.m1-cab { display: flex; gap: 8px 24px; align-items: baseline; flex-wrap: wrap; margin-bottom: 4px }
.m1-t { width: 120px; font-size: 13px; letter-spacing: .04em; text-transform: uppercase; color: #64748b } .m1-t i { width: 16px; color: #94a3b8 }
.m1-fluxo { display: inline-flex; gap: 10px; align-items: baseline; flex-wrap: wrap } .m1-fluxo > span { display: inline-flex; gap: 6px; align-items: baseline } .m1-fluxo i { color: #cbd5e1; font-size: 12px; margin-right: 4px } .m1-fluxo small { font-size: 13px; color: #64748b } .m1-fluxo b { font-size: 16px; font-weight: 500 }
.m1-nota { margin: 0 0 0 144px; font-size: 13px; color: #94a3b8 }
.m1-l { display: grid; grid-template-columns: 16px minmax(0, 1fr) auto; gap: 10px; align-items: baseline; margin-left: 144px; padding: 3px 0; font-size: 14.5px; color: #475569 }
.m1-s { color: #94a3b8; font-weight: 600 } .m1-l.x .m1-s, .m1-l.x b { color: #dc2626 } .m1-l.ok .m1-s { color: #16a34a } .m1-l b { font-weight: 600; color: #0f172a }
.m1-txt small { display: block; font-size: 13px; color: #94a3b8 }
@media (max-width: 700px) { .m1-t { width: auto } .m1-l, .m1-nota { margin-left: 0 } }

/* 2 só erros */
.m2 { display: grid; gap: 6px } .m2-t { margin: 0 0 6px; font-size: 15px; color: #475569 } .m2-t b { color: #0f172a; font-weight: 600 }
.m2-l { display: grid; grid-template-columns: 20px 110px minmax(0, 1fr) auto; gap: 12px; align-items: baseline; padding: 10px 0; border-bottom: 1px solid #f1f5f9; animation: tfEntra .4s both }
.m2-l > i { color: #cbd5e1 } .m2-l > b { font-size: 20px; font-weight: 500; color: #dc2626; text-align: right; font-variant-numeric: tabular-nums } .m2-l > span { font-size: 15px; color: #0f172a } .m2-l small { display: block; font-size: 12.5px; color: #94a3b8 }
.m2-pe { display: grid; gap: 4px; margin-top: 10px; font-size: 13px; color: #64748b } .m2-pe i { width: 16px; color: #cbd5e1 } .m2-pe .fl { color: #94a3b8 }

/* 3 colunas */
.m3 { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0 } @media (max-width: 1000px) { .m3 { grid-template-columns: 1fr 1fr } }
.m3-c { display: grid; gap: 10px; align-content: start; padding: 4px 18px; border-left: 1px solid #f1f5f9; animation: tfEntra .4s both } .m3-c:first-child { border-left: 0; padding-left: 0 }
.m3-c header { display: flex; gap: 6px; align-items: center; font-size: 13px; letter-spacing: .04em; text-transform: uppercase; color: #64748b } .m3-c header i { color: #94a3b8 } .m3-c header em { margin-left: auto; font-style: normal; font-size: 12.5px; letter-spacing: 0 } .m3-c.x header em { color: #dc2626 } .m3-c.ok header em { color: #16a34a }
.m3-fluxo { display: grid; gap: 2px } .m3-fluxo div { display: flex; justify-content: space-between; align-items: baseline } .m3-fluxo small { font-size: 13px; color: #64748b } .m3-fluxo b { font-size: 16px; font-weight: 500; font-variant-numeric: tabular-nums }
.m3-nota { margin: 0; font-size: 13px; color: #94a3b8 }
.m3-l { display: grid; gap: 8px; padding-top: 8px; border-top: 1px dashed #e2e8f0 } .m3-l > div { display: grid; gap: 1px; font-size: 13.5px; color: #475569 } .m3-l b { font-size: 17px; font-weight: 500; color: #0f172a } .m3-l .x b { color: #dc2626 } .m3-l small { font-size: 12.5px; color: #94a3b8 } .m3-l .tf-mapa { justify-self: start } .m3-l .ok span { color: #16a34a }

/* 4 frases */
.m4 { display: grid; gap: 14px; max-width: 860px } .m4 p { margin: 0; font-size: 16px; line-height: 1.6; color: #334155 } .m4 p > i { color: #cbd5e1; padding-top: 5px } .m4 p { display: block; padding-left: 26px; text-indent: -26px } .m4 p > i { width: 26px; text-indent: 0 }
.m4 b { font-weight: 600; color: #0f172a } .m4 b.x { color: #dc2626 } .m4 p.dev { color: #94a3b8 } .m4 .tf-mapa { text-indent: 0; font-size: 14px }

/* 5 tabela */
.m5 { width: 100%; border-collapse: collapse; font-size: 14.5px } .m5 th { text-align: left; font-size: 12px; font-weight: 500; letter-spacing: .04em; text-transform: uppercase; color: #94a3b8; padding: 0 10px 8px; border-bottom: 1px solid #e2e8f0 }
.m5 td { padding: 10px; border-bottom: 1px solid #f1f5f9; color: #475569; vertical-align: baseline } .m5 tr { animation: tfEntra .35s both } .m5 td i { color: #cbd5e1; width: 18px }
.m5 td.s { width: 18px; color: #94a3b8; font-weight: 600 } .m5 tr.x td.s, .m5 tr.x b { color: #dc2626 } .m5 b { font-weight: 600; color: #0f172a } .m5 small { display: block; font-size: 12.5px; color: #94a3b8 } .m5 td:last-child { text-align: right; width: 60px }
`
