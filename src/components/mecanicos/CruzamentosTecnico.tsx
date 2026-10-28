'use client'
// Tabela de cruzamentos do técnico (José, 28/10/2026, opção 5 da página teste: "isso aqui eu achei muito bom, vamos
// trabalhar nele"): uma linha por cruzamento — o que foi comparado, o resultado e ✗ (erro) ou · (explicação).
// Fontes: GPS do carro, relatório do técnico, OS cobrada, local do cliente e OS dos colegas. Tempário: em desenvolvimento.
import { useEffect, useState } from 'react'
import { authHeaders } from '@/lib/auth/client'
import type { TecnicoFantasma } from '@/lib/mecanicos/fantasmas-server'
import type { FuroKm } from '@/lib/mecanicos/furo-km-server'

const h = (v: number) => `${String(Math.round(v * 10) / 10).replace('.', ',')} h`
const km = (v: number) => `${Math.round(v).toLocaleString('pt-BR')} km`
const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`

export type AcaoCruzamento = 'mapa' | 'os' | 'dias'
export interface Cruzamento { ok?: boolean; erro: boolean; ic: string; fontes: string; v: string; txt: string; sub?: string; acao?: AcaoCruzamento }

export function montarCruzamentos(t: TecnicoFantasma, fk: FuroKm | null): Cruzamento[] {
  const x = t.totais
  const temCarro = t.placas.length > 0 && x.kmCarro > 0
  const out: Cruzamento[] = []
  const foraRel = Math.max(0, x.kmCarro - x.kmRel), relSemCob = Math.max(0, x.kmRel - x.kmCobrado)
  if (temCarro) out.push(foraRel > 0.5
    ? { erro: true, ic: 'fa-road', fontes: 'GPS × relatório', v: km(foraRel), txt: 'rodados que não estão em relatório', acao: 'mapa' }
    : { ok: true, erro: false, ic: 'fa-road', fontes: 'GPS × relatório', v: km(x.kmCarro), txt: 'rodados, todos no relatório' })
  else out.push({ erro: false, ic: 'fa-road', fontes: 'GPS × relatório', v: 'sem carro', txt: 'vinculado: não dá para conferir o km com o GPS' })
  out.push(relSemCob > 0.5
    ? { erro: true, ic: 'fa-road', fontes: 'relatório × OS', v: km(relSemCob), txt: 'do relatório não cobrados', acao: 'os' }
    : { ok: true, erro: false, ic: 'fa-road', fontes: 'relatório × OS', v: km(x.kmCobrado), txt: 'cobrados, tudo que estava no relatório' })
  if (temCarro && x.diasCarroSemOS) {
    const semOS = fk?.dias.filter((d) => !d.os.length && d.kmGps > 5) || []
    const comColega = semOS.filter((d) => d.colegas.some((o) => o.noCliente))
    const colegas = [...new Set(comColega.flatMap((d) => d.colegas.filter((o) => o.noCliente).map((o) => o.tecnico.split(' ')[0])))]
    out.push({ erro: false, ic: 'fa-road', fontes: 'GPS × OS', v: `${x.diasCarroSemOS} dia${x.diasCarroSemOS === 1 ? '' : 's'}`, txt: `rodando sem OS (${km(x.kmSemOS)})`, acao: 'mapa',
      sub: comColega.length ? `${comColega.length} ${comColega.length === 1 ? 'dele' : 'deles'} levando ${colegas.join(' e ')} (${comColega.map((d) => ddmm(d.data)).join(' e ')})` : undefined })
  }
  out.push(x.naoCobradas > 0.05
    ? { erro: true, ic: 'fa-clock', fontes: 'relatório × OS', v: h(x.naoCobradas), txt: 'apontadas e não cobradas', acao: 'os' }
    : { ok: true, erro: false, ic: 'fa-clock', fontes: 'relatório × OS', v: h(x.horasCobradas), txt: 'cobradas, tudo que apontou' })
  if (temCarro && x.ligadoSemOS > 0.05) out.push({ erro: false, ic: 'fa-clock', fontes: 'GPS × OS', v: h(x.ligadoSemOS), txt: 'de carro ligado em dias sem OS', acao: 'dias' })
  if (temCarro) {
    if (!fk) out.push({ erro: false, ic: 'fa-location-dot', fontes: 'GPS × local do cliente', v: '…', txt: 'cruzando as paradas do carro com os clientes' })
    else {
      const osDias = fk.dias.flatMap((d) => d.os)
      const com = osDias.filter((o) => o.noCliente), palpite = com.filter((o) => o.noCliente!.conf === 'provavel').length
      if (osDias.length) {
        out.push({ erro: false, ic: 'fa-location-dot', fontes: 'GPS × local do cliente', v: `${com.length} de ${osDias.length}`, txt: 'dias de OS com o carro no cliente', acao: 'mapa',
          sub: com.length ? `${h(com.reduce((s, o) => s + o.noCliente!.min, 0) / 60)} parado lá × ${h(com.reduce((s, o) => s + o.horasRel, 0))} apontadas nesses dias${palpite ? ` · ${palpite} ${palpite === 1 ? 'é palpite' : 'são palpite'} (sem local cadastrado)` : ''}` : undefined })
        const sem = osDias.length - com.length
        if (sem) out.push({ erro: true, ic: 'fa-location-dot', fontes: 'GPS × local do cliente', v: `${sem} dia${sem === 1 ? '' : 's'}`, txt: 'de OS sem o carro passar no cliente', acao: 'mapa' })
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

export function TabelaCruzamentos({ linhas, onAcao }: { linhas: Cruzamento[]; onAcao: (a: AcaoCruzamento) => void }) {
  return (
    <table className="cz">
      <style>{ESTILO_CZ}</style>
      <thead><tr><th /><th>cruzamento</th><th>resultado</th><th /></tr></thead>
      <tbody>
        {linhas.map((l, i) => (
          <tr key={i} className={`${l.erro ? 'x' : l.ok ? 'ok' : ''} ${l.acao ? 'clica' : ''}`} style={{ animationDelay: `${i * 50}ms` }} onClick={l.acao ? () => onAcao(l.acao!) : undefined}>
            <td className="s">{l.erro ? '✗' : l.ok ? '✓' : '·'}</td>
            <td className="f"><i className={`fas ${l.ic}`} /> {l.fontes}</td>
            <td><b>{l.v}</b> {l.txt}{l.sub && <small>{l.sub}</small>}</td>
            <td className="a">{l.acao && <span>{ROTULO[l.acao]} ›</span>}</td>
          </tr>
        ))}
        <tr className="dev"><td className="s">·</td><td className="f"><i className="fas fa-stopwatch" /> relatório × tempário</td><td><span className="cz-dev">em desenvolvimento</span></td><td /></tr>
      </tbody>
    </table>
  )
}

const ESTILO_CZ = `
.cz { width: 100%; border-collapse: collapse; font-size: 14.5px }
.cz th { text-align: left; font-size: 12px; font-weight: 500; letter-spacing: .04em; text-transform: uppercase; color: #94a3b8; padding: 0 10px 8px; border-bottom: 1px solid #e2e8f0 }
.cz td { padding: 10px; border-bottom: 1px solid #f1f5f9; color: #475569; vertical-align: baseline }
.cz tr { animation: czEntra .35s both } @keyframes czEntra { from { opacity: 0; transform: translateY(4px) } }
.cz tr.clica { cursor: pointer } .cz tr.clica:hover td { background: #f8fafc }
.cz td.f { white-space: nowrap; width: 1%; padding-right: 24px } .cz td.f i { color: #cbd5e1; width: 18px }
.cz td.s { width: 18px; color: #94a3b8; font-weight: 600 } .cz tr.x td.s, .cz tr.x b { color: #dc2626 } .cz tr.ok td.s { color: #16a34a }
.cz b { font-weight: 600; color: #0f172a } .cz small { display: block; font-size: 12.5px; color: #94a3b8 }
.cz td.a { text-align: right; width: 1%; white-space: nowrap } .cz td.a span { font-size: 13px; color: #2563eb } .cz tr.clica:hover td.a span { text-decoration: underline }
.cz-dev { font-size: 12.5px; color: #64748b; border: 1px dashed #cbd5e1; border-radius: 99px; padding: 2px 10px; white-space: nowrap }
@media (max-width: 700px) { .cz td.f { white-space: normal } .cz thead { display: none } }
`
