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
import { ROTULO_CHICO, type MotivoChico } from '@/lib/mecanicos/robo-chico'

const h = (v: number) => `${String(Math.round(v * 10) / 10).replace('.', ',')} h`
const km = (v: number) => `${Math.round(v).toLocaleString('pt-BR')} km`
const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`
/** "a", "a e b", "a, b e c" */
const lista = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`)
/** "JANE ANDREA BIONDO CORREIA" → "Jane Andrea Biondo Correia" */
const cli = (n: string) => String(n || 'cliente sem nome').toLowerCase().replace(/(^|\s)(\S)/g, (_, a, b) => a + b.toUpperCase()).replace(/\b(De|Da|Do|Dos|Das|E)\b/g, (m) => m.toLowerCase())
const dur = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h${String(Math.round(m % 60)).padStart(2, '0')}` : `${Math.round(m)} min`)
/** até 8 itens no balão; o resto vira "+N" */
const ate8 = (xs: string[]) => (xs.length > 8 ? [...xs.slice(0, 8), `e mais ${xs.length - 8}`] : xs)

export type AcaoCruzamento = 'mapa' | 'os' | 'dias'
export interface Cruzamento {
  titulo: string; ic: string; fontes: string; v: string; txt: string; sub?: string; frase: string
  /** o caso a caso no balão: dia, OS, cliente, números (José, 28/10/2026: "coloca o nome do cliente; pode aumentar o balão") */
  itens?: string[]
  /** caso a caso que aparece NA LINHA, com o motivo do Chico Chave (José, 28/10/2026: "isso que nós temos que evidenciar ali") */
  casos?: CasoChico[]
  erro: boolean; ok?: boolean; acao?: AcaoCruzamento
  /** divergência que o Tratorilson explica ao clicar (abre o mapa já focado nela) */
  div?: Divergencia
}

export interface CasoChico { os: string; cliente: string; cidade: string; nums: string; motivos: MotivoChico[]; gps?: string; gpsCurto?: string }
const cidadeBonita = (c: string) => c.replace(/\s*\(\w{2}\)\s*$/, '').toLowerCase().replace(/(^|\s)(\S)/g, (_, a, b) => a + b.toUpperCase())
function casosChico(fk: FuroKm | null, oQue: 'km' | 'horas'): CasoChico[] | undefined {
  if (!fk) return undefined
  const os = (fk.osTotais || []).filter((o) => (oQue === 'km' ? o.chicoKm : o.chicoHoras)?.length)
  return os.length ? os.map((o) => ({ os: o.os, cliente: cli(o.cliente), cidade: cidadeBonita(o.cidade || ''), gps: o.gps, gpsCurto: o.gpsCurto, motivos: (oQue === 'km' ? o.chicoKm : o.chicoHoras)!,
    nums: oQue === 'km' ? `${Math.round(o.kmRel)} → ${Math.round(o.kmCobrado)} km` : `${h(o.horasRel)} → ${h(o.horasCobradas)}` })) : undefined
}

export function montarCruzamentos(t: TecnicoFantasma, fk: FuroKm | null): Cruzamento[] {
  const x = t.totais
  const nome = t.tecnico.split(' ')[0]
  const temCarro = t.placas.length > 0 && x.kmCarro > 0
  const out: Cruzamento[] = []
  const foraRel = Math.max(0, x.kmCarro - x.kmRel), relSemCob = Math.max(0, x.kmRel - x.kmCobrado)

  // Km fantasma = km SEM DESTINO (José, 28/10/2026: "se já tem destino de OS interna ou garantia não é km fantasma; o km
  // fantasma é justamente o que não tem destino, tipo os 400 e poucos km que o Danilo não relatou"). Dia a dia: o que o GPS
  // rodou além do relatório; se nesse dia o carro foi no cliente de um colega, o destino é a OS do colega (não é fantasma).
  const diasFora = (fk?.dias || []).map((d) => ({ d, fora: Math.max(0, d.kmGps - d.kmRel), colega: d.colegas.find((o) => o.noCliente) })).filter((z) => z.fora > 0.5)
  const fantasma = fk ? diasFora.filter((z) => !z.colega).reduce((s2, z) => s2 + z.fora, 0) : foraRel
  const comColegaKm = diasFora.filter((z) => z.colega).reduce((s2, z) => s2 + z.fora, 0)
  if (!temCarro) out.push({ titulo: 'Km fantasma', ic: 'fa-ghost', fontes: 'GPS × relatório × OS', v: 'sem carro', txt: 'vinculado', erro: false,
    frase: `${nome} não tem carro vinculado na Frota, então não dá para comparar o km do relatório com o que o GPS registrou. Se ele anda no carro de outro técnico, o km aparece no mapa desse colega.` })
  else out.push({ titulo: 'Km fantasma', ic: 'fa-ghost', fontes: 'GPS × relatório × OS', erro: fantasma > 0.5, ok: fantasma <= 0.5 && foraRel <= 0.5, acao: foraRel > 0.5 ? 'mapa' : undefined, div: foraRel > 0.5 ? 'km-fora-relatorio' : undefined,
    v: fantasma > 0.5 ? km(fantasma) : '0 km', txt: fantasma > 0.5 ? 'rodados sem destino: fora de qualquer relatório ou OS' : 'sem destino: todo km rodado tem relatório ou OS',
    sub: comColegaKm > 0.5 ? `fora isso, ${km(comColegaKm)} em dias levando colega: o destino é a OS do colega` : undefined,
    itens: foraRel > 0.5 && fk ? ate8(diasFora.sort((p, q) => q.fora - p.fora).map((z) => `${ddmm(z.d.data)}: rodou ${km(z.d.kmGps)}, relatório ${km(z.d.kmRel)} → ${z.colega ? `destino: ${z.colega.os} do ${z.colega.tecnico.split(' ')[0]} (${cli(z.colega.cliente)})` : `⚠ ${km(z.fora)} sem destino${z.d.os.length ? '' : ', nenhuma OS no dia'}`}`)) : undefined,
    frase: fantasma > 0.5
      ? `O carro de ${nome} rodou ${km(x.kmCarro)} no mês pelo GPS e os relatórios dele somam ${km(x.kmRel)}. Desses km rodados a mais, ${km(fantasma)} não têm destino: não estão em relatório nem em OS de ninguém. Esse é o km fantasma.${comColegaKm > 0.5 ? ` Outros ${km(comColegaKm)} foram em dias em que o carro esteve no cliente de um colega, então o destino é a OS do colega.` : ''} Dia a dia:`
      : `Todo km que o carro de ${nome} rodou tem destino: está nos relatórios dele${comColegaKm > 0.5 ? ` ou foi no cliente de um colega (${km(comColegaKm)})` : ''}.` })

  // km do relatório × cobrado: com destino (OS interna, garantia, desconto, oficina, ainda aberta) não é erro;
  // só o que o Chico não explica ("não lançado na OS") fica como erro
  const casosKm = casosChico(fk, 'km') || []
  const semMotivoKm = casosKm.filter((c) => c.motivos.some((m) => m.etiqueta === 'nao-lancado'))
  const kmSemMotivo = (fk?.osTotais || []).filter((o) => o.chicoKm?.some((m) => m.etiqueta === 'nao-lancado')).reduce((s2, o) => s2 + (o.kmRel - o.kmCobrado), 0)
  out.push({ titulo: 'Km do relatório × cobrado', ic: 'fa-road', fontes: 'relatório × OS', erro: fk ? semMotivoKm.length > 0 : relSemCob > 0.5, ok: relSemCob <= 0.5,
    acao: relSemCob > 0.5 ? 'mapa' : undefined, div: relSemCob > 0.5 ? 'km-nao-cobrado' : undefined,
    v: relSemCob <= 0.5 ? km(x.kmCobrado) : semMotivoKm.length ? km(kmSemMotivo) : km(relSemCob),
    txt: relSemCob <= 0.5 ? 'cobrados, tudo que estava no relatório' : semMotivoKm.length ? 'do relatório sem cobrar e sem motivo' : 'do relatório sem cobrar, mas com destino (veja o motivo)',
    casos: relSemCob > 0.5 ? casosKm : undefined,
    itens: relSemCob > 0.5 && fk ? ate8((fk.osTotais || []).filter((o) => o.kmRel - o.kmCobrado > 0.5).sort((p, q) => (q.kmRel - q.kmCobrado) - (p.kmRel - p.kmCobrado)).map((o) => `${o.os} · ${cli(o.cliente)}: relatório ${km(o.kmRel)}, cobrado ${km(o.kmCobrado)}`)) : undefined,
    frase: relSemCob > 0.5
      ? `Nos relatórios de ${nome} estão ${km(x.kmRel)} e nas OS foram cobrados ${km(x.kmCobrado)}: ${km(relSemCob)} relatados não foram cobrados do cliente. Quando a OS é interna, garantia, teve desconto ou ainda não foi faturada, esse km tem destino e não é erro; só é erro o que fica sem motivo. Foi nestas OS:`
      : `Nos relatórios de ${nome} estão ${km(x.kmRel)} e as OS cobraram ${km(x.kmCobrado)}: tudo que ele relatou foi cobrado.` })

  // km: dias de carro sem OS (e os colegas)
  if (temCarro && x.diasCarroSemOS) {
    const semOS = fk?.dias.filter((d) => !d.os.length && d.kmGps > 5) || []
    const comColega = semOS.filter((d) => d.colegas.some((o) => o.noCliente))
    const colegas = [...new Set(comColega.flatMap((d) => d.colegas.filter((o) => o.noCliente).map((o) => o.tecnico.split(' ')[0])))]
    out.push({ titulo: 'Dias sem OS', ic: 'fa-calendar-xmark', fontes: 'GPS × OS', erro: false, acao: 'mapa', div: 'dias-sem-os',
      v: plural(x.diasCarroSemOS, 'dia', 'dias'), txt: `rodando sem OS (${km(x.kmSemOS)})`,
      itens: semOS.length ? ate8(semOS.map((d) => { const c = d.colegas.find((o) => o.noCliente); return `${ddmm(d.data)}: rodou ${km(d.kmGps)}${c ? ` · foi no cliente ${cli(c.cliente)} (${c.os} do ${c.tecnico.split(' ')[0]})` : ' · nenhum colega em OS onde o carro parou'}` })) : undefined,
      sub: comColega.length ? `${comColega.length} ${comColega.length === 1 ? 'dele' : 'deles'} levando ${lista(colegas)} (${lista(comColega.map((d) => ddmm(d.data)))})` : undefined,
      frase: `Em ${plural(x.diasCarroSemOS, 'dia', 'dias')} o carro de ${nome} rodou mais de 5 km sem ele ter nenhuma OS naquele dia, somando ${km(x.kmSemOS)}.`
        + (comColega.length ? ` Em ${comColega.length === 1 ? 'um deles' : `${comColega.length} deles`} (${lista(comColega.map((d) => ddmm(d.data)))}) o carro parou no cliente de ${lista(colegas)}: o km desses dias pode estar na OS do colega.` : ' Nenhum colega estava em OS no cliente onde o carro parou nesses dias.')
        + ' Dia a dia:' })
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
      itens: ate8(casos.map((o) => `${ddmm(o.data)}: ${o.os} do ${o.tecnico.split(' ')[0]}, cliente ${cli(o.cliente)} · carro ficou ${dur(o.noCliente!.min)} lá${o.noCliente!.conf === 'provavel' ? ' (provável: cliente sem local cadastrado)' : o.noCliente!.conf === 'confirmado' ? ' (local confirmado)' : ' (local do cadastro)'} · ${o.naOS ? '✓ ele está na OS' : '⚠ o nome dele não está na OS'}`)),
      frase: fora.length
        ? `O carro de ${nome} parou no cliente da OS de um colega em ${plural(casos.length, 'dia', 'dias')}, e em ${fora.length === casos.length ? 'todos' : fora.length} o nome dele não está na OS como técnico. Se ele foi junto, a OS precisa ter o nome dele, e o km e as horas dele entram nessa OS. Caso a caso:`
        : `O carro de ${nome} parou no cliente da OS de um colega em ${plural(casos.length, 'dia', 'dias')}, e ele consta como técnico em todas essas OS.` })
  }

  // horas: relatório × OS
  const casosH = casosChico(fk, 'horas') || []
  const semMotivoH = casosH.filter((c) => c.motivos.some((m) => m.etiqueta === 'nao-lancado'))
  out.push({ titulo: 'Horas apontadas × cobradas', ic: 'fa-clock', fontes: 'relatório × OS', erro: fk ? semMotivoH.length > 0 : x.naoCobradas > 0.05, ok: x.naoCobradas <= 0.05, acao: x.naoCobradas > 0.05 ? 'mapa' : undefined, div: x.naoCobradas > 0.05 ? 'horas-nao-cobradas' : undefined,
    v: x.naoCobradas > 0.05 ? h(x.naoCobradas) : h(x.horasCobradas), txt: x.naoCobradas <= 0.05 ? 'cobradas, tudo que apontou' : semMotivoH.length || !fk ? 'apontadas e não cobradas' : 'apontadas e não cobradas, mas com destino (veja o motivo)',
    casos: x.naoCobradas > 0.05 ? casosH : undefined,
    itens: x.naoCobradas > 0.05 && fk ? ate8((fk.osTotais || []).filter((o) => o.horasRel - o.horasCobradas > 0.05).sort((a, b) => (b.horasRel - b.horasCobradas) - (a.horasRel - a.horasCobradas)).map((o) => `${o.os} · ${cli(o.cliente)}: apontou ${h(o.horasRel)}, cobrado ${h(o.horasCobradas)}`)) : undefined,
    frase: x.naoCobradas > 0.05
      ? `${nome} apontou ${h(x.horasRel)} nos relatórios e as OS cobraram ${h(x.horasCobradas)}. Olhando OS por OS, ${h(x.naoCobradas)} trabalhadas ficaram sem cobrar (em algumas OS foi cobrado mais do que ele apontou, por isso a conta não é só a diferença dos totais). Foi nestas OS:`
      : `${nome} apontou ${h(x.horasRel)} nos relatórios e as OS cobraram ${h(x.horasCobradas)}: nenhuma hora trabalhada ficou sem cobrar.` })

  // horas sem destino (José, 28/10/2026: "e isso é a mesma coisa com horas"): carro ligado em dia sem OS dele; se nesse
  // dia o carro esteve no cliente de um colega, o destino é a OS do colega (não é hora fantasma)
  if (temCarro && x.ligadoSemOS > 0.05) {
    const ds = (fk?.dias || []).filter((d) => !d.os.length && d.ligadoH > 0.05).map((d) => ({ d, colega: d.colegas.find((o) => o.noCliente) }))
    const semDest = fk ? ds.filter((z) => !z.colega).reduce((s2, z) => s2 + z.d.ligadoH, 0) : x.ligadoSemOS
    const comCol = ds.filter((z) => z.colega).reduce((s2, z) => s2 + z.d.ligadoH, 0)
    const hm = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) : '')
    out.push({ titulo: 'Horas sem destino', ic: 'fa-car', fontes: 'GPS × OS', erro: semDest > 0.5, ok: semDest <= 0.05, acao: 'mapa', div: 'ligado-sem-os',
      v: semDest > 0.05 ? h(semDest) : '0 h', txt: semDest > 0.05 ? 'de carro ligado em dias sem OS e sem colega' : 'sem destino: todo dia com o carro ligado tem OS ou colega',
      sub: comCol > 0.05 ? `fora isso, ${h(comCol)} em dias levando colega: o destino é a OS do colega` : undefined,
      itens: fk ? ate8([...ds].sort((p, q) => q.d.ligadoH - p.d.ligadoH).map((z) => `${ddmm(z.d.data)}: ligado ${h(z.d.ligadoH)}, rodou ${km(z.d.kmGps)}${z.d.saida ? `, das ${hm(z.d.saida)}` : ''}${z.d.volta ? ` às ${hm(z.d.volta)}` : ''} → ${z.colega ? `destino: ${z.colega.os} do ${z.colega.tecnico.split(' ')[0]} (${cli(z.colega.cliente)})` : '⚠ sem destino'}`)) : undefined,
      frase: `Nos dias em que ${nome} não tinha OS, o carro dele ficou ${h(x.ligadoSemOS)} com o motor ligado (de ${h(x.ligadoH)} no mês todo).`
        + (semDest > 0.05 ? ` ${h(semDest)} não têm destino: não havia OS dele nem colega no lugar onde o carro parou. Essa é a hora fantasma.` : ' Todas essas horas têm destino.')
        + (comCol > 0.05 ? ` Outras ${h(comCol)} foram em dias em que o carro esteve no cliente de um colega.` : '') + ' Dia a dia:' })
  }

  // cliente: GPS × local do cliente
  if (temCarro) {
    if (!fk) out.push({ titulo: 'Tempo no cliente', ic: 'fa-location-dot', fontes: 'GPS × local do cliente', erro: false, v: '…', txt: 'cruzando as paradas do carro com os clientes',
      frase: 'Cruzando cada parada do carro com o local do cliente de cada OS…' })
    else {
      const osDias = fk.dias.flatMap((d) => d.os)
      const com = osDias.filter((o) => o.noCliente), palpite = com.filter((o) => o.noCliente!.conf === 'provavel').length
      const min = com.reduce((s, o) => s + o.noCliente!.min, 0), apont = com.reduce((s, o) => s + o.horasRel, 0)
      if (osDias.length) {
        out.push({ titulo: 'Tempo no cliente', ic: 'fa-location-dot', fontes: 'GPS × local do cliente', erro: false, acao: 'mapa',
          v: `${com.length} de ${osDias.length}`, txt: 'dias de OS com o carro no cliente',
          itens: ate8(fk.dias.flatMap((d) => d.os.filter((o) => o.noCliente).map((o) => `${ddmm(d.data)}: ${o.os} · ${cli(o.cliente)} · carro ${dur(o.noCliente!.min)} lá, apontou ${h(o.horasRel)}${o.noCliente!.conf === 'provavel' ? ' (provável)' : ''}`))),
          sub: com.length ? `${h(min / 60)} parado lá × ${h(apont)} apontadas nesses dias${palpite ? ` · ${palpite} ${palpite === 1 ? 'é palpite' : 'são palpite'} (sem local cadastrado)` : ''}` : undefined,
          frase: `${nome} teve ${plural(osDias.length, 'dia', 'dias')} de OS no mês. Em ${com.length} o carro parou no cliente${com.length ? `: ficou ${h(min / 60)} parado lá, enquanto ele apontou ${h(apont)} nesses dias` : ''}.`
            + (palpite ? ` ${palpite === 1 ? 'Um deles é palpite' : `${palpite} deles são palpite`}: o cliente não tem o local cadastrado, então foi usada a parada mais longa do carro fora da loja naquele dia.` : '')
            + ' O local do cliente vem da confirmação no faturar ou do cadastro.' })
        // "Carro não foi ao cliente" saiu (José, 28/10/2026: "não precisamos dessa comparação")
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
                    <span className="cz-frase" role="tooltip" onClick={(e) => e.stopPropagation()}>{l.frase}{l.itens?.length ? <ul>{l.itens.map((it, k) => <li key={k} className={it.includes('⚠') ? 'x' : ''}>{it}</li>)}</ul> : null}</span>
                  </span>
                </span>
              </td>
              <td>{dev ? <span className="cz-dev">em desenvolvimento</span> : <><b>{l.v}</b> {l.txt}{l.sub && <small>{l.sub}</small>}</>}
                {l.casos?.length ? (
                  <div className="cz-casos">
                    {l.casos.map((c) => (
                      <div key={c.os} className="cz-caso" title={[...c.motivos.map((m) => m.texto), c.gps].filter(Boolean).join(' ')}>
                        <span className="l1"><i className="fas fa-wrench" /><b>{c.os}</b><span className="cl">{c.cliente.split(' ').slice(0, 2).join(' ')}</span><span className="n">{c.nums}</span>{c.motivos.map((m) => <em key={m.etiqueta} className={m.etiqueta}>{ROTULO_CHICO[m.etiqueta]}</em>)}</span>
                        <span className="l2">{[...c.motivos.map((m) => m.curto), c.gpsCurto].filter(Boolean).join(' · ')}</span>
                      </div>
                    ))}
                  </div>
                ) : null}</td>
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
/* só aparece (sem deslocar e sem ficar com a animação presa): transform/fill criariam uma camada por linha e o balão do ⓘ ficava por baixo das linhas seguintes */
.cz tr { animation: czEntra .35s backwards } @keyframes czEntra { from { opacity: 0 } }
.cz-info:hover, .cz-info.on, .cz-info:focus-visible { z-index: 50 }
.cz tr.clica { cursor: pointer } .cz tr.clica:hover td { background: #f8fafc }
.cz td.s { width: 18px; color: #94a3b8; font-weight: 600 } .cz tr.x td.s, .cz tr.x td:nth-child(3) > b { color: #dc2626 } .cz tr.ok td.s { color: #16a34a }
.cz td.f { width: 1%; white-space: nowrap; padding-right: 26px }
.cz-tit { display: inline-flex; gap: 10px; align-items: center }
.cz-ic { width: 32px; height: 32px; border-radius: 10px; display: grid; place-items: center; background: #f1f5f9; color: #64748b; font-size: 13px; flex: none }
.cz tr.x .cz-ic { background: #fef2f2; color: #dc2626 } .cz tr.ok .cz-ic { background: #f0fdf4; color: #16a34a }
.cz-tit > span:nth-child(2) { display: grid; line-height: 1.25 } .cz-tit b { font-size: 14px; font-weight: 500; color: #0f172a } .cz-tit small { font-size: 12px; color: #94a3b8 }
.cz-info { position: relative; display: grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; color: #94a3b8; cursor: help; outline: none }
.cz-info:hover, .cz-info.on, .cz-info:focus-visible { color: #2563eb; background: #eff6ff }
.cz-frase { position: absolute; z-index: 40; left: 50%; top: calc(100% + 8px); transform: translate(-50%, -4px); width: 460px; max-height: 60vh; overflow: auto; white-space: normal; background: #0f172a; color: #e2e8f0; border-radius: 12px; padding: 12px 14px; font-size: 13.5px; line-height: 1.55; box-shadow: 0 16px 34px rgba(15,23,42,.3); opacity: 0; pointer-events: none; transition: opacity .15s, transform .15s; cursor: default; text-align: left }
.cz-frase ul { margin: 8px 0 0; padding: 8px 0 0 16px; border-top: 1px solid #334155; display: grid; gap: 5px; font-size: 13px; color: #cbd5e1 } .cz-frase li.x { color: #fca5a5 }
.cz-frase::before { content: ''; position: absolute; top: -6px; left: 50%; transform: translateX(-50%); border: 6px solid transparent; border-top: 0; border-bottom-color: #0f172a }
.cz-info:hover .cz-frase, .cz-info.on .cz-frase, .cz-info:focus-visible .cz-frase { opacity: 1; transform: translate(-50%, 0); pointer-events: auto }
.cz td:nth-child(3) > b { font-weight: 600; color: #0f172a } .cz td small { display: block; font-size: 12.5px; color: #94a3b8 }
.cz td.a { text-align: right; width: 1%; white-space: nowrap } .cz td.a span { font-size: 13px; color: #2563eb } .cz td.a span.tr { color: #6d28d9 } .cz td.a span.tr i { font-size: 11.5px; margin-right: 2px } .cz tr.clica:hover td.a span { text-decoration: underline }
.cz-casos { display: grid; gap: 6px; margin-top: 8px }
.cz-caso { display: grid; gap: 1px; padding: 5px 0 5px 10px; border-left: 2px solid #99f6e4; font-size: 13px; color: #334155; cursor: help; min-width: 0 }
.cz-caso .l1 { display: flex; gap: 6px; align-items: baseline; flex-wrap: wrap; min-width: 0 } .cz-caso .l1 > i { font-size: 10.5px; color: #0f766e }
.cz-caso b { font-weight: 600; color: #0f172a } .cz-caso .cl { color: #475569; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 160px } .cz-caso .n { color: #0f172a; font-variant-numeric: tabular-nums; white-space: nowrap }
.cz-caso .l2 { font-size: 12.5px; color: #64748b; line-height: 1.35 }
.cz-caso em { font-style: normal; font-size: 11px; font-weight: 500; border-radius: 99px; padding: 0 7px; background: #e2e8f0; color: #334155; white-space: nowrap }
.cz-caso em.interna { background: #ede9fe; color: #5b21b6 } .cz-caso em.garantia { background: #dbeafe; color: #1e40af } .cz-caso em.aberta { background: #fef3c7; color: #92400e } .cz-caso em.nao-lancado { background: #fee2e2; color: #991b1b }
.cz-dev { font-size: 12.5px; color: #64748b; border: 1px dashed #cbd5e1; border-radius: 99px; padding: 2px 10px; white-space: nowrap }
@media (max-width: 700px) { .cz td.f { white-space: normal } .cz thead { display: none } .cz-frase { width: 290px } }
`
