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

  // km do relatório × cobrado (José, 29/10/2026: "com destino não deve aparecer aqui"): OS interna, garantia, desconto,
  // oficina ou ainda aberta têm destino e saem desta linha; fica só o que o Chico não explica ("não lançado na OS")
  const semMotivoKm = (casosChico(fk, 'km') || []).filter((c) => c.motivos.some((m) => m.etiqueta === 'nao-lancado'))
  const kmSemMotivo = (fk?.osTotais || []).filter((o) => o.chicoKm?.some((m) => m.etiqueta === 'nao-lancado')).reduce((s2, o) => s2 + (o.kmRel - o.kmCobrado), 0)
  const errKm = fk ? semMotivoKm.length > 0 : relSemCob > 0.5
  out.push({ titulo: 'Km do relatório × cobrado', ic: 'fa-road', fontes: 'relatório × OS', erro: errKm, ok: !errKm,
    acao: errKm ? 'mapa' : undefined, div: errKm ? 'km-nao-cobrado' : undefined,
    v: errKm ? km(fk ? kmSemMotivo : relSemCob) : km(x.kmCobrado), txt: errKm ? 'do relatório sem cobrar e sem motivo' : 'cobrados, tudo que estava no relatório tem destino',
    casos: errKm ? semMotivoKm : undefined,
    frase: errKm
      ? `Nos relatórios de ${nome} estão ${km(x.kmRel)} e nas OS foram cobrados ${km(x.kmCobrado)}. Nestas OS o km ficou sem cobrar e sem motivo (não são internas, garantia, desconto nem estão abertas):`
      : `Nos relatórios de ${nome} estão ${km(x.kmRel)} e as OS cobraram ${km(x.kmCobrado)}. O que não foi cobrado tem destino (OS interna, garantia, desconto ou ainda aberta), então não é erro.` })

  // km: dias de carro sem OS — só os SEM destino (José, 29/10/2026: "se ele levou o Gabriel a gente já sabe por onde foi,
  // logo não deveria subtrair aqui?"); os dias levando colega vão para a linha "Foi com colega"
  if (temCarro && x.diasCarroSemOS) {
    const semOS = fk?.dias.filter((d) => !d.os.length && d.kmGps > 5) || []
    const comColega = semOS.filter((d) => d.colegas.some((o) => o.noCliente))
    const semDest = fk ? semOS.filter((d) => !comColega.includes(d)) : []
    const kmSem = fk ? semDest.reduce((s2, d) => s2 + d.kmGps, 0) : x.kmSemOS
    const nSem = fk ? semDest.length : x.diasCarroSemOS
    const kmCol = comColega.reduce((s2, d) => s2 + d.kmGps, 0)
    if (nSem || comColega.length) out.push({ titulo: 'Dias sem OS', ic: 'fa-calendar-xmark', fontes: 'GPS × OS', erro: nSem > 0, ok: !nSem, acao: 'mapa', div: 'dias-sem-os',
      v: plural(nSem, 'dia', 'dias'), txt: nSem ? `rodando sem OS e sem destino (${km(kmSem)})` : 'sem destino: todo dia rodando sem OS foi levando colega',
      sub: comColega.length ? `fora isso, ${plural(comColega.length, 'dia', 'dias')} levando colega (${km(kmCol)}): veja em "Foi com colega"` : undefined,
      itens: semDest.length ? ate8(semDest.map((d) => `${ddmm(d.data)}: rodou ${km(d.kmGps)} · nenhuma OS dele e nenhum colega onde o carro parou`)) : undefined,
      frase: `Em ${plural(nSem, 'dia', 'dias')} o carro de ${nome} rodou mais de 5 km sem ele ter OS e sem ter ido ao cliente de um colega (${km(kmSem)}): esses dias não têm destino.`
        + (comColega.length ? ` Outros ${plural(comColega.length, 'dia', 'dias')} sem OS dele foram levando colega (${lista(comColega.map((d) => ddmm(d.data)))}).` : '')
        + (semDest.length ? ' Dia a dia:' : '') })
  }

  // foi com um colega e o nome dele não está na OS do colega (José, 28/10/2026: "confirma na ordem; se não tiver o nome dele, avisa")
  if (temCarro && fk) {
    const casos = fk.dias.flatMap((d) => d.colegas.filter((o) => o.noCliente).map((o) => ({ ...o, data: d.data, kmCarro: d.kmGps })))
    // a OS do colega cobrou o km que este carro rodou? (José: "ou não foi cobrado nem no Gabriel?")
    const faltaKm = (o: (typeof casos)[number]) => Math.max(0, o.kmCarro - o.kmCobrado)
    const fora = casos.filter((o) => !o.naOS)
    if (casos.length) out.push({ titulo: 'Foi com colega', ic: 'fa-user-group', fontes: 'GPS × OS do colega', erro: fora.length > 0, ok: !fora.length,
      acao: 'mapa', div: fora.length ? 'colega-fora-os' : undefined,
      v: fora.length ? plural(fora.length, 'dia', 'dias') : plural(casos.length, 'dia', 'dias'),
      txt: fora.length ? 'no cliente de um colega sem o nome dele na OS' : 'no cliente de um colega, e ele consta na OS',
      sub: lista((fora.length ? fora : casos).map((o) => `${o.os} do ${o.tecnico.split(' ')[0]} (${ddmm(o.data)}${faltaKm(o) > 5 ? `, faltam ~${km(faltaKm(o))}` : ''})`)),
      itens: ate8(casos.map((o) => `${ddmm(o.data)}: ${o.os} do ${o.tecnico.split(' ')[0]}, cliente ${cli(o.cliente)} · carro ficou ${dur(o.noCliente!.min)} lá${o.noCliente!.conf === 'provavel' ? ' (provável: cliente sem local cadastrado)' : o.noCliente!.conf === 'confirmado' ? ' (local confirmado)' : ' (local do cadastro)'} · ${o.naOS ? '✓ ele está na OS' : '⚠ o nome dele não está na OS'} · a OS cobrou ${km(o.kmCobrado)} de ${km(o.kmCarro)} rodados${faltaKm(o) > 5 ? ` ⚠ faltam ~${km(faltaKm(o))}` : ' ✓'}`)),
      frase: fora.length
        ? `O carro de ${nome} parou no cliente da OS de um colega em ${plural(casos.length, 'dia', 'dias')}, e em ${fora.length === casos.length ? 'todos' : fora.length} o nome dele não está na OS como técnico. Se ele foi junto, a OS precisa ter o nome dele, e o km e as horas dele entram nessa OS. Também dá para ver se a OS do colega cobrou o km que este carro rodou. Caso a caso:`
        : `O carro de ${nome} parou no cliente da OS de um colega em ${plural(casos.length, 'dia', 'dias')}, e ele consta como técnico em todas essas OS.` })
  }

  // "Horas apontadas × cobradas" saiu (José, 29/10/2026: "essa informação também não é relevante"); a hora fantasma é a sem destino, abaixo

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

/** Cruzamentos fechados no estilo POS NewPortal (José, 29/10/2026: "deixa as informações mais fechadas e vai abrindo,
 *  com o estilo do NewPortal, conforme o usuário for clicando"): cada cruzamento é um cartão com ícone em quadradinho,
 *  o título e o número; clicar abre a explicação, o caso a caso, o dia a dia e o botão do Tratorilson. */
export function TabelaCruzamentos({ linhas, onAcao }: { linhas: Cruzamento[]; onAcao: (a: AcaoCruzamento, div?: Divergencia) => void }) {
  const [abertas, setAbertas] = useState<Set<number>>(new Set())
  // o que está em ordem não aparece em Horas e km fantasmas (José, 29/10/2026: "esse tipo de informação não precisa ficar aqui")
  const emOrdem = linhas.filter((l) => l.ok)
  const todas = [...linhas.filter((l) => !l.ok), TEMPARIO]
  const alternar = (i: number) => setAbertas((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n })
  const erros = linhas.filter((l) => l.erro).length
  const nOrdem = emOrdem.length
  return (
    <div className="cz">
      <style>{ESTILO_CZ}</style>
      <div className="cz-topo">
        <span title={nOrdem ? `em ordem: ${emOrdem.map((l) => l.titulo).join(', ')}` : undefined}>{erros ? <><b className="x">{erros}</b> {erros === 1 ? 'divergência' : 'divergências'}</> : <b className="ok">Nenhuma divergência</b>}{nOrdem ? <> · <i className="fas fa-check" style={{ color: '#16a34a', fontSize: 11 }} /> {nOrdem} {nOrdem === 1 ? 'cruzamento' : 'cruzamentos'} em ordem</> : null}</span>
        <button type="button" onClick={() => setAbertas(abertas.size ? new Set() : new Set(todas.map((_, i) => i)))}>{abertas.size ? 'fechar tudo' : 'abrir tudo'}</button>
      </div>
      {todas.map((l, i) => {
        const dev = l === TEMPARIO
        const on = abertas.has(i)
        const tom = dev ? 'dev' : l.erro ? 'x' : l.ok ? 'ok' : 'n'
        return (
          <section key={i} className={`cz-c ${tom} ${on ? 'on' : ''}`} style={{ animationDelay: `${i * 40}ms` }}>
            <button type="button" className="cz-cab" onClick={() => !dev && alternar(i)} aria-expanded={on} disabled={dev}>
              <span className="cz-ic"><i className={`fas ${l.ic}`} /></span>
              <span className="cz-tit"><b>{l.titulo}</b><small>{l.fontes}</small></span>
              <span className="cz-val">{dev ? <span className="cz-dev">em desenvolvimento</span> : <>
                <b>{l.v}</b>
                <small>{l.erro ? 'divergência' : l.ok ? 'em ordem' : 'para saber'}</small>
              </>}</span>
              {/* o mapa (com o Tratorilson) abre por este ícone no topo do cartão (José, 29/10/2026: "tira esse e coloca o ícone do mapa lá em cima") */}
              {!dev && l.acao && (
                <span role="button" tabIndex={0} className={`cz-mapa ${l.div ? 'tr' : ''}`} title={l.div ? 'ver no mapa, com o Tratorilson explicando cada dia' : `ver ${ROTULO[l.acao]}`}
                  onClick={(e) => { e.stopPropagation(); onAcao(l.acao!, l.div) }} onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onAcao(l.acao!, l.div) } }}>
                  <i className={`fas ${l.acao === 'mapa' ? 'fa-map-location-dot' : l.acao === 'os' ? 'fa-file-lines' : 'fa-calendar-days'}`} />
                </span>
              )}
              {!dev && <i className="fas fa-chevron-down cz-seta" />}
            </button>
            <div className="cz-corpo" aria-hidden={!on}>
              <div className="cz-dentro">
                <p className="cz-res"><b>{l.v}</b> {l.txt}{l.sub ? <small>{l.sub}</small> : null}</p>
                <p className="cz-frase"><i className="fas fa-circle-info" /> {l.frase}</p>
                {l.casos?.length ? (
                  <div className="cz-casos">
                    {l.casos.map((c) => (
                      <div key={c.os} className="cz-caso" title={[...c.motivos.map((m) => m.texto), c.gps].filter(Boolean).join(' ')}>
                        <span className="l1"><i className="fas fa-wrench" /><b>{c.os}</b><span className="cl">{c.cliente.split(' ').slice(0, 3).join(' ')}</span><span className="n">{c.nums}</span>{c.motivos.map((m) => <em key={m.etiqueta} className={m.etiqueta}>{ROTULO_CHICO[m.etiqueta]}</em>)}</span>
                        <span className="l2"><i className="fas fa-robot" /> Chico: {[...c.motivos.map((m) => m.curto), c.gpsCurto].filter(Boolean).join(' · ')}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
                {l.itens?.length ? <ul className="cz-itens">{l.itens.map((it, k) => <li key={k} className={it.includes('⚠') ? 'x' : ''}>{it}</li>)}</ul> : null}
              </div>
            </div>
          </section>
        )
      })}
    </div>
  )
}

const ESTILO_CZ = `
.cz { display: grid; gap: 8px }
.cz-topo { display: flex; justify-content: space-between; align-items: center; gap: 10px; font-size: 13.5px; color: #475569; padding: 0 2px }
.cz-topo b { font-weight: 500 } .cz-topo b.x { color: #dc2626 } .cz-topo b.ok { color: #16a34a }
.cz-topo button { border: 0; background: none; font-family: inherit; font-size: 13px; color: #2563eb; cursor: pointer; padding: 0 } .cz-topo button:hover { text-decoration: underline }
.cz-c { --c: #64748b; background: var(--surface, #fefefe); border: 1px solid var(--border, #e2e8f0); border-radius: 14px; transition: box-shadow .25s, border-color .25s, transform .25s; animation: czEntra .35s backwards }
.cz-c.x { --c: #dc2626 } .cz-c.ok { --c: #16a34a } .cz-c.n { --c: #2563eb } .cz-c.dev { --c: #94a3b8 }
@keyframes czEntra { from { opacity: 0 } }
.cz-c:not(.dev):hover { border-color: color-mix(in srgb, var(--c) 35%, var(--border, #e2e8f0)); box-shadow: 0 14px 28px -22px rgba(15,23,42,.55) }
.cz-c.on { border-color: color-mix(in srgb, var(--c) 35%, var(--border, #e2e8f0)) }
.cz-cab { width: 100%; display: grid; grid-template-columns: 34px minmax(0, 1fr); grid-auto-flow: column; grid-auto-columns: auto; gap: 12px; align-items: center; padding: 11px 14px; border: 0; background: none; font-family: inherit; text-align: left; color: inherit; cursor: pointer }
.cz-cab:disabled { cursor: default }
.cz-ic { width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; font-size: 14px; color: var(--c); background: color-mix(in srgb, var(--c) 9%, var(--surface, #fefefe)); border: 1px solid color-mix(in srgb, var(--c) 18%, transparent) }
.cz-tit { display: grid; min-width: 0; line-height: 1.3 } .cz-tit b { font-size: 15px; font-weight: 500; color: #0f172a } .cz-tit small { font-size: 12.5px; color: #64748b }
.cz-val { display: grid; justify-items: end; line-height: 1.2 } .cz-val b { font-size: 20px; font-weight: 500; letter-spacing: -.01em; font-variant-numeric: tabular-nums; color: #0f172a; white-space: nowrap }
.cz-c.x .cz-val b { color: #dc2626 } .cz-val small { font-size: 12px; color: var(--c) }
.cz-seta { font-size: 12px; color: #94a3b8; transition: transform .3s cubic-bezier(.2,.8,.2,1) } .cz-c.on .cz-seta { transform: rotate(180deg); color: var(--c) }
.cz-corpo { display: grid; grid-template-rows: 0fr; transition: grid-template-rows .35s cubic-bezier(.2,.8,.2,1) } .cz-c.on .cz-corpo { grid-template-rows: 1fr }
.cz-dentro { overflow: hidden; display: grid; gap: 10px; padding: 0 14px 0 60px } .cz-c.on .cz-dentro { padding-bottom: 14px }
.cz-dentro > * { opacity: 0; transform: translateY(-4px); transition: opacity .25s, transform .25s } .cz-c.on .cz-dentro > * { opacity: 1; transform: none; transition-delay: .1s }
.cz-res { margin: 0; font-size: 14.5px; color: #334155; line-height: 1.45 } .cz-res b { font-weight: 500; color: #0f172a } .cz-c.x .cz-res b { color: #dc2626 } .cz-res small { display: block; font-size: 13px; color: #64748b; margin-top: 2px }
.cz-frase { margin: 0; font-size: 13.5px; color: #475569; line-height: 1.55; background: var(--portal-bg-secondary, #f8fafc); border-radius: 10px; padding: 9px 12px } .cz-frase i { color: #94a3b8; margin-right: 4px }
.cz-casos { display: grid; gap: 6px }
.cz-caso { display: grid; gap: 2px; padding: 8px 12px; border: 1px solid var(--border, #e2e8f0); border-radius: 10px; font-size: 13px; color: #334155; cursor: help; min-width: 0 }
.cz-caso .l1 { display: flex; gap: 6px; align-items: baseline; flex-wrap: wrap; min-width: 0 } .cz-caso .l1 > i { font-size: 10.5px; color: #0f766e }
.cz-caso b { font-weight: 500; color: #0f172a } .cz-caso .cl { color: #475569 } .cz-caso .n { color: #0f172a; font-variant-numeric: tabular-nums; white-space: nowrap }
.cz-caso .l2 { font-size: 12.5px; color: #64748b; line-height: 1.4 } .cz-caso .l2 i { font-size: 10.5px; color: #0f766e; margin-right: 2px }
.cz-caso em { font-style: normal; font-size: 11px; border-radius: 99px; padding: 0 7px; background: #e2e8f0; color: #334155; white-space: nowrap }
.cz-caso em.interna { background: #ede9fe; color: #5b21b6 } .cz-caso em.garantia { background: #dbeafe; color: #1e40af } .cz-caso em.aberta { background: #fef3c7; color: #92400e } .cz-caso em.nao-lancado { background: #fee2e2; color: #991b1b }
.cz-itens { margin: 0; padding: 0 0 0 18px; display: grid; gap: 4px; font-size: 13px; color: #475569; line-height: 1.45 } .cz-itens li.x { color: #b91c1c }
.cz-mapa { width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; color: #2563eb; background: color-mix(in srgb, #2563eb 8%, #fefefe); border: 1px solid color-mix(in srgb, #2563eb 18%, transparent); cursor: pointer; transition: background .2s, color .2s } .cz-mapa:hover { background: #2563eb; color: #fefefe }
.cz-mapa.tr { color: #6d28d9; background: color-mix(in srgb, #6d28d9 8%, #fefefe); border-color: color-mix(in srgb, #6d28d9 20%, transparent) } .cz-mapa.tr:hover { background: #6d28d9; color: #fefefe }
.cz-dev { font-size: 12.5px; color: #64748b; border: 1px dashed #cbd5e1; border-radius: 99px; padding: 2px 10px; white-space: nowrap }
@media (max-width: 700px) { .cz-dentro { padding-left: 14px } .cz-val b { font-size: 17px } }
`
