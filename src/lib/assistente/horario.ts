// Horário de atendimento da Nova Tratores (Tratorilson no WhatsApp).
// Seg–sex 07:30–11:30 e 12:30–17:30 (horário de Brasília); sábado, domingo e
// feriados fechados. Fora disso o bot só avisa que alguém atende assim que
// possível. Feriados: nacionais fixos + móveis (Carnaval, Sexta-feira Santa,
// Corpus Christi) + extras por env FERIADOS_EXTRAS="YYYY-MM-DD,YYYY-MM-DD".
const TZ = 'America/Sao_Paulo';

export const TURNOS: [string, string][] = [['07:30', '11:30'], ['12:30', '17:30']];

export interface LocalSP { ano: number; mes: number; dia: number; diaSemana: number; minutos: number; iso: string }

/** Data/hora em São Paulo a partir de um Date (UTC). */
export function localSP(d: Date): LocalSP {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  const dias: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const hora = Number(p.hour) % 24;
  return { ano: Number(p.year), mes: Number(p.month), dia: Number(p.day), diaSemana: dias[p.weekday] ?? 0, minutos: hora * 60 + Number(p.minute), iso: `${p.year}-${p.month}-${p.day}` };
}

/** Páscoa (Meeus/Jones/Butcher). */
export function pascoa(ano: number): { mes: number; dia: number } {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return { mes, dia };
}

const iso = (ano: number, mes: number, dia: number) => `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
function somaDias(ano: number, mes: number, dia: number, n: number): string {
  const d = new Date(Date.UTC(ano, mes - 1, dia + n));
  return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** Feriados nacionais do ano (ISO), fixos + móveis. */
export function feriadosNacionais(ano: number): Set<string> {
  const s = new Set<string>([
    iso(ano, 1, 1), iso(ano, 4, 21), iso(ano, 5, 1), iso(ano, 9, 7), iso(ano, 10, 12), iso(ano, 11, 2), iso(ano, 11, 15), iso(ano, 11, 20), iso(ano, 12, 25),
  ]);
  const p = pascoa(ano);
  s.add(somaDias(ano, p.mes, p.dia, -48)); // segunda de Carnaval
  s.add(somaDias(ano, p.mes, p.dia, -47)); // terça de Carnaval
  s.add(somaDias(ano, p.mes, p.dia, -2));  // Sexta-feira Santa
  s.add(somaDias(ano, p.mes, p.dia, 60));  // Corpus Christi
  return s;
}

export function feriadosExtras(env = process.env.FERIADOS_EXTRAS): Set<string> {
  return new Set(String(env || '').split(/[,\s;]+/).map((x) => x.trim()).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)));
}

export function ehFeriado(l: LocalSP, extras = feriadosExtras()): boolean {
  return feriadosNacionais(l.ano).has(l.iso) || extras.has(l.iso);
}

const min = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

/** Está dentro do horário de atendimento? */
export function dentroDoHorario(d: Date = new Date(), extras = feriadosExtras()): boolean {
  const l = localSP(d);
  if (l.diaSemana === 0 || l.diaSemana === 6) return false;
  if (ehFeriado(l, extras)) return false;
  return TURNOS.some(([a, b]) => l.minutos >= min(a) && l.minutos < min(b));
}

/** Quando abre de novo, em texto pro cliente ("amanhã às 7h30", "segunda-feira às 7h30", "às 12h30"). */
export function proximaAbertura(d: Date = new Date(), extras = feriadosExtras()): string {
  const l = localSP(d);
  const util = (x: LocalSP) => x.diaSemana >= 1 && x.diaSemana <= 5 && !ehFeriado(x, extras);
  // ainda hoje?
  if (util(l)) {
    for (const [a] of TURNOS) if (l.minutos < min(a)) return `hoje às ${a.replace(/^0/, '').replace(':', 'h')}`;
  }
  // próximos dias
  const nomes = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  for (let n = 1; n <= 10; n++) {
    const prox = localSP(new Date(d.getTime() + n * 86_400_000));
    if (util(prox)) return `${n === 1 ? 'amanhã' : nomes[prox.diaSemana]} às 7h30`;
  }
  return 'no próximo dia útil às 7h30';
}

/** Aviso de fora do horário (uma vez por período fechado, por contato). */
export function mensagemForaDoHorario(nome: string | null | undefined, d: Date = new Date(), extras = feriadosExtras()): string {
  const l = localSP(d);
  const sauda = l.minutos < 12 * 60 ? 'Bom dia' : l.minutos < 18 * 60 ? 'Boa tarde' : 'Boa noite';
  const n = (nome || '').trim().split(' ')[0];
  return `${sauda}${n ? `, ${n}` : ''}! Aqui é do pós-vendas da Nova Tratores. No momento estamos fora do horário de atendimento — atendemos de segunda a sexta, das 7h30 às 11h30 e das 12h30 às 17h30. Assim que possível alguém vai te atender (${proximaAbertura(d, extras)}). Pode deixar sua mensagem que a gente retorna.`;
}
