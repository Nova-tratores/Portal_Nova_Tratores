'use client'
// Tabela de cruzamentos do técnico (José, 28/10/2026, opção 5 da página teste: "isso aqui eu achei muito bom, vamos
// trabalhar nele"): uma linha por cruzamento — o que foi comparado, o resultado e ✗ (erro), ✓ (bate) ou · (explicação).
// Fontes: GPS do carro, relatório do técnico, OS cobrada, local do cliente e OS dos colegas. Tempário: em desenvolvimento.
// 28/10/2026 ("coloca os títulos e um ícone; passar o mouse ou clicar mostra a frase explicando tudo certinho"):
// cada linha tem título e um ⓘ com a explicação em frase, com os números do técnico.
import { useEffect, useState } from 'react'
import { authHeaders } from '@/lib/auth/client'
import type { TecnicoFantasma } from '@/lib/mecanicos/fantasmas-server'
import type { FuroKm } from '@/lib/mecanicos/furo-km-server'
import type { Divergencia } from '@/lib/mecanicos/divergencias'

const h = (v: number) => `${String(Math.round(v * 10) / 10).replace('.', ',')} h`
const km = (v: number) => `${Math.round(v).toLocaleString('pt-BR')} km`
const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`
/** "a", "a e b", "a, b e c" */
const lista = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`)

export type AcaoCruzamento = 'mapa' | 'os' | 'dias'
export interface Cruzamento {
  titulo: string; ic: string; fontes: string; v: string; txt: string; sub?: string; frase: string
  erro: boolean; ok?: boolean; acao?: AcaoCruzamento
  /** divergência que o Tratorilson explica ao clicar (abre o mapa já focado nela) */
  div?: Divergencia
}

export function montarCruzamentos(t: TecnicoFantasma, fk: FuroKm | null): Cruzamento[] {
  const x = t.totais
  const nome = t.tecnico.split(' ')[0]
  const temCarro = t.placas.length > 0 && x.kmCarro > 0
  const out: Cruzamento[] = []
  const foraRel = Math.max(0, x.kmCarro - x.kmRel), relSemCob = Math.max(0, x.kmRel - x.kmCobrado)

  // km: GPS × relatório
  if (!temCarro) out.push({ titulo: 'Km rodado × relatório', ic: 'fa-road', fontes: 'GPS × relatório', v: 'sem carro', txt: 'vinculado', erro: false,
    frase: `${nome} não tem carro vinculado na Frota, então não dá para comparar o km do relatório com o que o GPS registrou. Se ele anda no carro de outro técnico, o km aparece no mapa desse colega.` })
  else out.push({ titulo: 'Km rodado × relatório', ic: 'fa-road', fontes: 'GPS × relatório', erro: foraRel > 0.5, ok: foraRel <= 0.5, acao: foraRel > 0.5 ? 'mapa' : undefined, div: foraRel > 0.5 ? 'km-fora-relatorio' : undefined,
    v: foraRel > 0.5 ? km(foraRel) : km(x.kmCarro), txt: foraRel > 0.5 ? 'rodados que não estão em relatório' : 'rodados, todos no relatório',
    frase: foraRel > 0.5
      ? `O carro de ${nome} rodou ${km(x.kmCarro)} no mês pelo GPS, e ele colocou ${km(x.kmRel)} nos relatórios das OS. Ficaram ${km(foraRel)} rodados que não aparecem em nenhum relatório. No mapa dá para ver por onde o carro andou nesses dias.`
      : `O carro de ${nome} rodou ${km(x.kmCarro)} no mês pelo GPS, e os relatórios dele somam ${km(x.kmRel)}: todo o km rodado está nos relatórios.` })

  // km: relatório × OS
  out.push({ titulo: 'Km do relatório × cobrado', ic: 'fa-road', fontes: 'relatório × OS', erro: relSemCob > 0.5, ok: relSemCob <= 0.5, acao: relSemCob > 0.5 ? 'mapa' : undefined, div: relSemCob > 0.5 ? 'km-nao-cobrado' : undefined,
    v: relSemCob > 0.5 ? km(relSemCob) : km(x.kmCobrado), txt: relSemCob > 0.5 ? 'do relatório não cobrados' : 'cobrados, tudo que estava no relatório',
    frase: relSemCob > 0.5
      ? `Nos relatórios de ${nome} estão ${km(x.kmRel)} e nas OS foram cobrados ${km(x.kmCobrado)}. São ${km(relSemCob)} que ele rodou e relatou, mas que não foram cobrados do cliente. O Tratorilson mostra em quais OS isso aconteceu.`
      : `Nos relatórios de ${nome} estão ${km(x.kmRel)} e as OS cobraram ${km(x.kmCobrado)}: tudo que ele relatou foi cobrado.` })

  // km: dias de carro sem OS (e os colegas)
  if (temCarro && x.diasCarroSemOS) {
    const semOS = fk?.dias.filter((d) => !d.os.length && d.kmGps > 5) || []
    const comColega = semOS.filter((d) => d.colegas.some((o) => o.noCliente))
    const colegas = [...new Set(comColega.flatMap((d) => d.colegas.filter((o) => o.noCliente).map((o) => o.tecnico.split(' ')[0])))]
    out.push({ titulo: 'Dias sem OS', ic: 'fa-calendar-xmark', fontes: 'GPS × OS', erro: false, acao: 'mapa', div: 'dias-sem-os',
      v: plural(x.diasCarroSemOS, 'dia', 'dias'), txt: `rodando sem OS (${km(x.kmSemOS)})`,
      sub: comColega.length ? `${comColega.length} ${comColega.length === 1 ? 'dele' : 'deles'} levando ${lista(colegas)} (${lista(comColega.map((d) => ddmm(d.data)))})` : undefined,
      frase: `Em ${plural(x.diasCarroSemOS, 'dia', 'dias')} o carro de ${nome} rodou mais de 5 km sem ele ter nenhuma OS naquele dia, somando ${km(x.kmSemOS)}.`
        + (comColega.length ? ` Em ${comColega.length === 1 ? 'um deles' : `${comColega.length} deles`} (${lista(comColega.map((d) => ddmm(d.data)))}) o carro parou no cliente de ${lista(colegas)}: o km desses dias pode estar na OS do colega.` : ' Nenhum colega estava em OS no cliente onde o carro parou nesses dias.')
        + ' No mapa aparece o caminho e as paradas de cada dia.' })
  }

  // foi com um colega e o nome dele não está na OS do colega (José, 28/10/2026: "confirma na ordem; se não tiver o nome dele, avisa")
  if (temCarro && fk) {
    const casos = fk.dias.flatMap((d) => d.colegas.filter((o) => o.noCliente).map((o) => ({ ...o, data: d.data })))
    const fora = casos.filter((o) => !o.naOS)
    if (casos.length) out.push({ titulo: 'Foi com colega', ic: 'fa-user-group', fontes: 'GPS × OS do colega', erro: fora.length > 0, ok: !fora.length,
      acao: 'mapa', div: fora.length ? 'colega-fora-os' : undefined,
      v: fora.length ? plural(fora.length, 'dia', 'dias') : plural(casos.length, 'dia', 'dias'),
      txt: fora.length ? 'no cliente de um colega sem o nome dele na OS' : 'no cliente de um colega, e ele consta na OS',
      sub: lista(fora.length ? fora.map((o) => `${o.os} do ${o.tecnico.split(' ')[0]} (${ddmm(o.data)})`) : casos.map((o) => `${o.os} (${ddmm(o.data)})`)),
      frase: fora.length
        ? `O carro de ${nome} parou no cliente da OS de um colega em ${plural(casos.length, 'dia', 'dias')}, e em ${fora.length === casos.length ? 'todos' : fora.length} o nome dele não está na OS como técnico: ${lista(fora.map((o) => `${o.os} do ${o.tecnico.split(' ')[0]} em ${ddmm(o.data)}`))}. Se ele foi junto, a OS precisa ter o nome dele, e o km e as horas dele entram nessa OS.`
        : `O carro de ${nome} parou no cliente da OS de um colega em ${plural(casos.length, 'dia', 'dias')}, e ele consta como técnico em todas essas OS.` })
  }

  // horas: relatório × OS
  out.push({ titulo: 'Horas apontadas × cobradas', ic: 'fa-clock', fontes: 'relatório × OS', erro: x.naoCobradas > 0.05, ok: x.naoCobradas <= 0.05, acao: x.naoCobradas > 0.05 ? 'mapa' : undefined, div: x.naoCobradas > 0.05 ? 'horas-nao-cobradas' : undefined,
    v: x.naoCobradas > 0.05 ? h(x.naoCobradas) : h(x.horasCobradas), txt: x.naoCobradas > 0.05 ? 'apontadas e não cobradas' : 'cobradas, tudo que apontou',
    frase: x.naoCobradas > 0.05
      ? `${nome} apontou ${h(x.horasRel)} nos relatórios e as OS cobraram ${h(x.horasCobradas)}. Olhando OS por OS, ${h(x.naoCobradas)} trabalhadas ficaram sem cobrar (em algumas OS foi cobrado mais do que ele apontou, por isso a conta não é só a diferença dos totais).`
      : `${nome} apontou ${h(x.horasRel)} nos relatórios e as OS cobraram ${h(x.horasCobradas)}: nenhuma hora trabalhada ficou sem cobrar.` })

  // horas: carro ligado sem OS
  if (temCarro && x.ligadoSemOS > 0.05) out.push({ titulo: 'Carro ligado sem OS', ic: 'fa-car', fontes: 'GPS × OS', erro: false, acao: 'dias',
    v: h(x.ligadoSemOS), txt: 'de carro ligado em dias sem OS',
    frase: `Nos dias em que ${nome} não tinha OS, o carro dele ficou ${h(x.ligadoSemOS)} com o motor ligado (de ${h(x.ligadoH)} ligado no mês todo). No dia a dia aparece cada um desses dias.` })

  // cliente: GPS × local do cliente
  if (temCarro) {
    if (!fk) out.push({ titulo: 'Tempo no cliente', ic: 'fa-location-dot', fontes: 'GPS × local do cliente', erro: false, v: '…', txt: 'cruzando as paradas do carro com os clientes',
      frase: 'Cruzando cada parada do carro com o local do cliente de cada OS…' })
    else {
      const osDias = fk.dias.flatMap((d) => d.os)
      const com = osDias.filter((o) => o.noCliente), palpite = com.filter((o) => o.noCliente!.conf === 'provavel').length
      const min = com.reduce((s, o) => s + o.noCliente!.min, 0), apont = com.reduce((s, o) => s + o.horasRel, 0)
      const sem = osDias.length - com.length
      if (osDias.length) {
        out.push({ titulo: 'Tempo no cliente', ic: 'fa-location-dot', fontes: 'GPS × local do cliente', erro: false, acao: 'mapa',
          v: `${com.length} de ${osDias.length}`, txt: 'dias de OS com o carro no cliente',
          sub: com.length ? `${h(min / 60)} parado lá × ${h(apont)} apontadas nesses dias${palpite ? ` · ${palpite} ${palpite === 1 ? 'é palpite' : 'são palpite'} (sem local cadastrado)` : ''}` : undefined,
          frase: `${nome} teve ${plural(osDias.length, 'dia', 'dias')} de OS no mês. Em ${com.length} o carro parou no cliente${com.length ? `: ficou ${h(min / 60)} parado lá, enquanto ele apontou ${h(apont)} nesses dias` : ''}.`
            + (palpite ? ` ${palpite === 1 ? 'Um deles é palpite' : `${palpite} deles são palpite`}: o cliente não tem o local cadastrado, então foi usada a parada mais longa do carro fora da loja naquele dia.` : '')
            + ' O local do cliente vem da confirmação no faturar ou do cadastro.' })
        if (sem) out.push({ titulo: 'Carro não foi ao cliente', ic: 'fa-location-crosshairs', fontes: 'GPS × local do cliente', erro: true, acao: 'mapa', div: 'sem-cliente',
          v: plural(sem, 'dia', 'dias'), txt: 'de OS sem o carro passar no cliente',
          frase: `Em ${plural(sem, 'dia', 'dias')} de OS o carro de ${nome} não parou perto do cliente. Pode ser que ele tenha ido no carro de outro técnico, que o cliente esteja sem local cadastrado, ou que o serviço não tenha sido no cliente. No mapa dá para ver onde o carro estava.` })
      }
    }
  }
  return out
}

/** Busca o cruzamento com cliente e colegas (furo de km) de um técnico. */
export function useFuroKm(tecnico: string, mes: string) {
  const [fk, setFk] = useState<FuroKm | null>(null)
  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const r = await fetch(`/api/mecanicos/fantasmas/furo?tecnico=${encodeURIComponent(tecnico)}&mes=${mes}`, { headers: await authHeaders(), cache: 'no-store' })
        if (r.ok && vivo) setFk(await r.json())
      } catch { /* fica sem o cruzamento com o cliente */ }
    })()
    return () => { vivo = false }
  }, [tecnico, mes])
  return fk
}

const ROTULO: Record<AcaoCruzamento, string> = { mapa: 'mapa', os: 'OS', dias: 'dia a dia' }
const TEMPARIO: Cruzamento = { titulo: 'Tempo × tempário', ic: 'fa-stopwatch', fontes: 'relatório × tempário', v: '', txt: '', erro: false,
  frase: 'Vai comparar as horas de cada OS com o tempo padrão do tempário Mahindra para aquele serviço. Está em desenvolvimento.' }

export function TabelaCruzamentos({ linhas, onAcao }: { linhas: Cruzamento[]; onAcao: (a: AcaoCruzamento, div?: Divergencia) => void }) {
  const [aberta, setAberta] = useState<number | null>(null)
  useEffect(() => {
    if (aberta == null) return
    const fechar = () => setAberta(null)
    window.addEventListener('click', fechar)
    return () => window.removeEventListener('click', fechar)
  }, [aberta])
  const todas = [...linhas, TEMPARIO]
  return (
    <table className="cz">
      <style>{ESTILO_CZ}</style>
      <thead><tr><th /><th>cruzamento</th><th>resultado</th><th /></tr></thead>
      <tbody>
        {todas.map((l, i) => {
          const dev = l === TEMPARIO
          return (
            <tr key={i} className={`${l.erro ? 'x' : l.ok ? 'ok' : ''} ${l.acao ? 'clica' : ''}`} style={{ animationDelay: `${i * 50}ms` }} onClick={l.acao ? () => onAcao(l.acao!, l.div) : undefined}>
              <td className="s">{l.erro ? '✗' : l.ok ? '✓' : '·'}</td>
              <td className="f">
                <span className="cz-tit">
                  <span className="cz-ic"><i className={`fas ${l.ic}`} /></span>
                  <span><b>{l.titulo}</b><small>{l.fontes}</small></span>
                  <span className={`cz-info ${aberta === i ? 'on' : ''}`} role="button" tabIndex={0} aria-label="o que é isso"
                    onClick={(e) => { e.stopPropagation(); setAberta(aberta === i ? null : i) }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setAberta(aberta === i ? null : i) } }}>
                    <i className="fas fa-circle-info" />
                    <span className="cz-frase" role="tooltip" onClick={(e) => e.stopPropagation()}>{l.frase}</span>
                  </span>
                </span>
              </td>
              <td>{dev ? <span className="cz-dev">em desenvolvimento</span> : <><b>{l.v}</b> {l.txt}{l.sub && <small>{l.sub}</small>}</>}</td>
              <td className="a">{l.div ? <span className="tr"><i className="fas fa-robot" /> Tratorilson explica ›</span> : l.acao && <span>{ROTULO[l.acao]} ›</span>}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

const ESTILO_CZ = `
.cz { width: 100%; border-collapse: collapse; font-size: 14.5px }
.cz th { text-align: left; font-size: 12px; font-weight: 500; letter-spacing: .04em; text-transform: uppercase; color: #94a3b8; padding: 0 10px 8px; border-bottom: 1px solid #e2e8f0 }
.cz td { padding: 10px; border-bottom: 1px solid #f1f5f9; color: #475569; vertical-align: middle }
.cz tr { animation: czEntra .35s both } @keyframes czEntra { from { opacity: 0; transform: translateY(4px) } }
.cz tr.clica { cursor: pointer } .cz tr.clica:hover td { background: #f8fafc }
.cz td.s { width: 18px; color: #94a3b8; font-weight: 600 } .cz tr.x td.s, .cz tr.x td:nth-child(3) > b { color: #dc2626 } .cz tr.ok td.s { color: #16a34a }
.cz td.f { width: 1%; white-space: nowrap; padding-right: 26px }
.cz-tit { display: inline-flex; gap: 10px; align-items: center }
.cz-ic { width: 32px; height: 32px; border-radius: 10px; display: grid; place-items: center; background: #f1f5f9; color: #64748b; font-size: 13px; flex: none }
.cz tr.x .cz-ic { background: #fef2f2; color: #dc2626 } .cz tr.ok .cz-ic { background: #f0fdf4; color: #16a34a }
.cz-tit > span:nth-child(2) { display: grid; line-height: 1.25 } .cz-tit b { font-size: 14px; font-weight: 500; color: #0f172a } .cz-tit small { font-size: 12px; color: #94a3b8 }
.cz-info { position: relative; display: grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; color: #94a3b8; cursor: help; outline: none }
.cz-info:hover, .cz-info.on, .cz-info:focus-visible { color: #2563eb; background: #eff6ff }
.cz-frase { position: absolute; z-index: 40; left: 50%; top: calc(100% + 8px); transform: translate(-50%, -4px); width: 330px; white-space: normal; background: #0f172a; color: #e2e8f0; border-radius: 12px; padding: 12px 14px; font-size: 13.5px; line-height: 1.55; box-shadow: 0 16px 34px rgba(15,23,42,.3); opacity: 0; pointer-events: none; transition: opacity .15s, transform .15s; cursor: default; text-align: left }
.cz-frase::before { content: ''; position: absolute; top: -6px; left: 50%; transform: translateX(-50%); border: 6px solid transparent; border-top: 0; border-bottom-color: #0f172a }
.cz-info:hover .cz-frase, .cz-info.on .cz-frase, .cz-info:focus-visible .cz-frase { opacity: 1; transform: translate(-50%, 0); pointer-events: auto }
.cz td:nth-child(3) > b { font-weight: 600; color: #0f172a } .cz td small { display: block; font-size: 12.5px; color: #94a3b8 }
.cz td.a { text-align: right; width: 1%; white-space: nowrap } .cz td.a span { font-size: 13px; color: #2563eb } .cz td.a span.tr { color: #6d28d9 } .cz td.a span.tr i { font-size: 11.5px; margin-right: 2px } .cz tr.clica:hover td.a span { text-decoration: underline }
.cz-dev { font-size: 12.5px; color: #64748b; border: 1px dashed #cbd5e1; border-radius: 99px; padding: 2px 10px; white-space: nowrap }
@media (max-width: 700px) { .cz td.f { white-space: normal } .cz thead { display: none } .cz-frase { width: 260px } }
`
