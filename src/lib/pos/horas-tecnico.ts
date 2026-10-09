// Regras PURAS das horas trabalhadas pelo técnico (Dashboard de Vendas →
// histórico de Serviços → "Horas: trabalhadas × faturadas").
//
// Fonte: relatório do app do técnico (Ordem_Servico_Tecnicos), até 3 dias por
// OS, cada um com data + hora de início e fim. As horas ficam com QUEM FEZ O
// RELATÓRIO (TecResp1) — decisão do usuário: o relatório não registra horas do
// 2º técnico, e dividir seria chute.
//   horas do dia = fim − início; sem os horários, o total do relatório
//   (TotalHora, "2h40m") é dividido igualmente entre os dias informados.

/** Total de horas como vem no relatório ("2h40m", "2h", "40m", "2:40" ou número) → horas decimais. */
export function parseHoras(v: unknown): number {
  const s = String(v ?? '').trim();
  if (!s) return 0;
  const hm = s.match(/(\d+)\s*h(?:\s*(\d+)\s*m?)?/i);
  if (hm) return Math.round((Number(hm[1]) + Number(hm[2] || 0) / 60) * 100) / 100;
  const soM = s.match(/^(\d+)\s*m(?:in)?$/i);
  if (soM) return Math.round((Number(soM[1]) / 60) * 100) / 100;
  const hhmm = s.match(/^(\d{1,2}):(\d{2})$/);
  if (hhmm) return Math.round((Number(hhmm[1]) + Number(hhmm[2]) / 60) * 100) / 100;
  const n = parseFloat(s.replace(',', '.'));
  return isFinite(n) ? n : 0;
}

/** 'HH:MM' → minutos; null se inválido. */
function minutos(h: unknown): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(h ?? '').trim());
  if (!m) return null;
  const v = Number(m[1]) * 60 + Number(m[2]);
  return v >= 0 && v <= 24 * 60 ? v : null;
}

/** 'YYYY-MM-DD…' ou 'DD/MM/YYYY' → 'YYYY-MM-DD'; null se inválido. */
export function dataIso(v: unknown): string | null {
  const s = String(v ?? '').trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

/** Une grafias do mesmo técnico ("DANILO DE SOUZA", " Danilo  de souza") → "Danilo de Souza". */
export function normalizarTecnico(nome: unknown): string {
  const minusculas = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);
  const s = String(nome ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  if (!s) return '';
  return s.split(' ').map((p, i) => (i > 0 && minusculas.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1))).join(' ');
}

export interface RelatorioTecnico {
  Ordem_Servico?: string | null;
  TecResp1?: string | null;
  DataInicio?: string | null; InicioHora?: string | null; FinalHora?: string | null;
  DataInicio2?: string | null; InicioHora2?: string | null; FinalHora2?: string | null;
  DataInicio3?: string | null; InicioHora3?: string | null; FinaHora3?: string | null; // "FinaHora3" é o nome real da coluna
  TotalHora?: string | number | null;
}

export interface DiaTrabalhado { os: string; data: string; tecnico: string; horas: number }

/** Dias trabalhados de um relatório (até 3), com as horas de cada um. */
export function diasDoRelatorio(r: RelatorioTecnico): DiaTrabalhado[] {
  const slots = [
    [r.DataInicio, r.InicioHora, r.FinalHora],
    [r.DataInicio2, r.InicioHora2, r.FinalHora2],
    [r.DataInicio3, r.InicioHora3, r.FinaHora3],
  ] as const;
  const tecnico = normalizarTecnico(r.TecResp1) || 'Sem técnico';
  const os = String(r.Ordem_Servico || '');
  const dias = slots
    .map(([d, i, f]) => {
      const data = dataIso(d);
      if (!data) return null;
      const ini = minutos(i), fim = minutos(f);
      const horas = ini != null && fim != null && fim > ini ? (fim - ini) / 60 : null;
      return { data, horas };
    })
    .filter((x): x is { data: string; horas: number | null } => x != null);
  if (dias.length === 0) return [];
  // Dia sem horário válido: reparte o que sobrar do total do relatório.
  const total = parseHoras(r.TotalHora);
  const comHora = dias.reduce((s, d) => s + (d.horas ?? 0), 0);
  const semHora = dias.filter((d) => d.horas == null).length;
  const resto = semHora > 0 ? Math.max(0, total - comHora) / semHora : 0;
  return dias.map((d) => ({ os, data: d.data, tecnico, horas: Math.round((d.horas ?? resto) * 100) / 100 }));
}
