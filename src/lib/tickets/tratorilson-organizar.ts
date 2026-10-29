// Tratorilson organiza a semana de tickets de cada pessoa (José, 29/10/2026) — regras PURAS
// (testes em __tests__/tratorilson-organizar.test.ts). O robô (tratorilson-server.ts) só lê/grava.
//
// - Entra no plano o ticket SEM prazo e o que o próprio robô marcou num dia que já passou.
//   Prazo posto por pessoa nunca entra (o robô reconhece o dele: prazo do ticket = prazo_marcado).
// - Dias: de hoje até 6 dias à frente, sem domingo. Cada dia comporta `porDia` coisas
//   (tickets com prazo + compromissos da agenda já contam).
// - Ordem: prioridade (1 alta, 2 média, 3 baixa), depois o mais antigo. Alta começa hoje,
//   média amanhã, baixa depois de amanhã; dia cheio passa para o próximo; tudo cheio = o mais vazio.

export type Prioridade = 1 | 2 | 3;

export interface TicketPlano {
  id: string;
  criadoEm: string;
  prioridade: Prioridade;
}

export interface Marcacao { ticketId: string; dia: string; prioridade: Prioridade }

const somaDias = (dia: string, n: number) => {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const domingo = (dia: string) => new Date(`${dia}T12:00:00Z`).getUTCDay() === 0;

/** Dias em que o robô marca: hoje + 6, sem domingo. */
export function diasDoPlano(hoje: string): string[] {
  const out: string[] = [];
  for (let i = 0; i <= 6; i++) { const d = somaDias(hoje, i); if (!domingo(d)) out.push(d); }
  return out;
}

/** Ticket entra no plano? (sem prazo, ou o robô marcou e o dia passou) */
export function entraNoPlano(t: { prazo: string | null; prazoMarcado: string | null }, hoje: string): boolean {
  const prazo = (t.prazo || "").slice(0, 10);
  if (!prazo) return true;
  return !!t.prazoMarcado && prazo === t.prazoMarcado && prazo < hoje;
}

/** Distribui os tickets nos dias. `carga` = o que a pessoa já tem em cada dia. */
export function planejar(tickets: TicketPlano[], carga: Record<string, number>, hoje: string, porDia = 4): Marcacao[] {
  const dias = diasDoPlano(hoje);
  if (!dias.length) return [];
  const ocupado: Record<string, number> = Object.fromEntries(dias.map((d) => [d, carga[d] || 0]));
  const ordem = [...tickets].sort((a, b) => a.prioridade - b.prioridade || a.criadoEm.localeCompare(b.criadoEm));
  const out: Marcacao[] = [];
  for (const t of ordem) {
    const inicio = Math.min(t.prioridade - 1, dias.length - 1); // alta hoje, média amanhã, baixa depois
    let dia = dias.slice(inicio).find((d) => ocupado[d] < porDia);
    if (!dia) dia = [...dias].slice(inicio).sort((a, b) => ocupado[a] - ocupado[b] || a.localeCompare(b))[0] || dias[dias.length - 1];
    ocupado[dia]++;
    out.push({ ticketId: t.id, dia, prioridade: t.prioridade });
  }
  return out;
}

/** Resposta da IA → prioridade por ticket + grupo em dúvida (vira pergunta à pessoa). */
export function lerRespostaIA(texto: string, ids: string[]): { prioridades: Record<string, Prioridade>; duvida: string[] } {
  const prioridades: Record<string, Prioridade> = {};
  let duvida: string[] = [];
  try {
    const j = JSON.parse(texto) as { itens?: { n?: number; prioridade?: string }[]; duvida?: number[] };
    for (const it of j.itens || []) {
      const id = ids[Number(it.n) - 1];
      const p = String(it.prioridade || "").toLowerCase();
      if (id) prioridades[id] = p.startsWith("a") ? 1 : p.startsWith("b") ? 3 : 2;
    }
    duvida = [...new Set((j.duvida || []).map((n) => ids[Number(n) - 1]).filter(Boolean))].slice(0, 4);
  } catch { /* IA respondeu fora do formato: todos ficam média, sem pergunta */ }
  for (const id of ids) prioridades[id] ??= 2;
  return { prioridades, duvida: duvida.length >= 2 ? duvida : [] };
}

/** Resposta da pessoa: o escolhido vira alta; os outros da pergunta, média. */
export function aplicarResposta(ticketIds: string[], escolhido: string | null): Record<string, Prioridade> {
  const out: Record<string, Prioridade> = {};
  for (const id of ticketIds) out[id] = id === escolhido ? 1 : 2;
  return out;
}
