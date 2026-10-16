// AGENDA COLETIVA — conflito de horário (José, 16/10/2026): ninguém (organizador ou convidado)
// pode ter dois compromissos no mesmo horário, e o mesmo LOCAL não pode ter dois ao mesmo
// tempo. Vale contra compromissos, reuniões, reservas da sala e Lousa — tudo que tem hora.
// Dia inteiro (OS, prazo de ticket, compromisso de dia inteiro) não bloqueia. Regra pura.
import { localDe, normTexto, type ItemAgenda } from './regras'

export interface JanelaNova { inicio: string; fim: string } // ISO com fuso

export interface Conflito { tipo: 'pessoa' | 'local'; quem?: string; titulo: string; inicio: string; fim: string; local?: string | null }

const sobrepoe = (a: JanelaNova, b: { inicio: string; fim: string }) =>
  new Date(a.inicio).getTime() < new Date(b.fim).getTime() && new Date(b.inicio).getTime() < new Date(a.fim).getTime()

export function acharConflitos(
  janelas: JanelaNova[], pessoas: string[], local: string | null, itens: ItemAgenda[],
  opts: { ignorarRef?: string | null; nomes: Map<string, string> },
): Conflito[] {
  const out: Conflito[] = []
  const vistos = new Set<string>()
  const lc = local ? normTexto(local) : ''
  for (const it of itens) {
    if (it.diaInteiro || it.fonte === 'os' || it.fonte === 'ticket') continue
    if (opts.ignorarRef && it.ref === opts.ignorarRef) continue
    const bate = janelas.find((j) => sobrepoe(j, it))
    if (!bate) continue
    for (const p of it.pessoas.filter((x) => pessoas.includes(x))) {
      const k = `p|${p}|${it.id}`
      if (vistos.has(k)) continue
      vistos.add(k)
      out.push({ tipo: 'pessoa', quem: opts.nomes.get(p) || 'Alguém', titulo: it.titulo, inicio: it.inicio, fim: it.fim, local: it.local })
    }
    if (lc && it.local && normTexto(it.local) === lc && !vistos.has(`l|${it.id}`)) {
      vistos.add(`l|${it.id}`)
      out.push({ tipo: 'local', titulo: it.titulo, inicio: it.inicio, fim: it.fim, local: it.local })
    }
  }
  return out
}

/** "Ana já tem “Visita” em 17/10, 09:00–10:00." */
export function textoConflito(c: Conflito): string {
  const a = localDe(c.inicio), z = localDe(c.fim)
  const quando = `${a.dia.slice(8, 10)}/${a.dia.slice(5, 7)}, ${a.hora}–${z.hora}`
  return c.tipo === 'local'
    ? `${c.local} já está ocupada por “${c.titulo}” em ${quando}.`
    : `${c.quem} já tem “${c.titulo}” em ${quando}.`
}
