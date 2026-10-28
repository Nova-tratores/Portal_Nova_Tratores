// Tratores vendidos recentemente — regras PURAS (testadas em __tests__/vendidos.test.ts).
// A venda vem das notas de máquina (`vendas_itens`, família "Trator Novo"): a
// descrição da nota traz modelo, motor e chassi escritos de jeitos diferentes
// ("CHAS:MDI…", "CILIND. SERIE:MDI…", "Nro serie MBN…", "CHASSI/Nro SERIE MDI…").
// Daqui sai o que a tela /revisoes/vendidos mostra: 30, 60 e 90 dias depois da
// venda e se o trator já está no controle de revisões (`tratores`).

export const MARCOS_DIAS = [30, 60, 90] as const;
export type MarcoDias = (typeof MARCOS_DIAS)[number];

export interface Marco { dias: MarcoDias; data: string; passou: boolean; diasFalta: number }

/** "Antes de 30 dias", "Fez 30 dias", "Fez 60 dias", "Fez 90 dias". */
export type Fase = 'antes' | 'fez30' | 'fez60' | 'fez90';
export const ROTULO_FASE: Record<Fase, string> = {
  antes: 'Menos de 30 dias', fez30: 'Fez 30 dias', fez60: 'Fez 60 dias', fez90: 'Fez 90 dias ou mais',
};

/** Só letras e números, maiúsculo. */
const limpo = (s: unknown) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
/** Final do chassi para casar entre tabelas (o mesmo critério do resto do portal: 7 últimos). */
export const finalDoChassi = (c: unknown, n = 7) => limpo(c).slice(-n);

/** Chassi escrito na descrição da nota. null = não achou. */
export function chassiDaNota(descricao: unknown): string | null {
  // o motor também é um código parecido com chassi: some antes de procurar
  const s = String(descricao ?? '').toUpperCase().replace(/\bMOTOR\s*[:.]?\s*[A-Z0-9]+/g, ' ');
  const rotulo = /\b(?:CHAS(?:SI|SIS)?|S[ÉE]RIE|SER)\b\.?\s*[:.]?\s*([A-Z0-9]{6,20})\b/g;
  let digitos: string | null = null;
  for (const m of s.matchAll(rotulo)) {
    const t = m[1];
    if (!/\d/.test(t)) continue;
    if (/[A-Z]/.test(t)) return t;
    digitos ??= t; // trator usado: série só com números
  }
  if (digitos) return digitos;
  // sem rótulo: código da Mahindra (M + letras e números, 10 a 20)
  const solto = s.split(/[\s/|,;:]+/).find((t) => /^M[A-Z0-9]{9,19}$/.test(t) && /\d/.test(t));
  return solto || null;
}

/** Motor escrito na descrição ("MOTOR: NSA7ACE0069"). */
export function motorDaNota(descricao: unknown): string | null {
  const m = String(descricao ?? '').toUpperCase().match(/\bMOTOR\s*[:.]?\s*([A-Z0-9]{5,20})/);
  return m ? m[1] : null;
}

/** Modelo para mostrar: "Mahindra 6075E-BR-CAB", "Mahindra Jivo", "Mahindra 5050". */
export function modeloDaNota(descricao: unknown): string {
  const s = String(descricao ?? '').toUpperCase();
  if (/\bJIVO\b/.test(s)) return 'Mahindra Jivo';
  const rotulo = s.match(/\bMODELO\s+([A-Z0-9][A-Z0-9-]*)/);
  const marca = s.match(/\bMARCA\s+([A-Z]+(?:\s+(?!MODELO)[A-Z]+)?)/);
  const tokens = s.split(/[\s|,;:]+/);
  const tok = tokens.find((t) => /^\d{3,4}[A-Z]{0,2}(?:-[A-Z0-9]+)*$/.test(t) && !/^(19|20)\d\d$/.test(t));
  const nomeMarca = (marca?.[1] || (s.includes('MAHINDRA') ? 'MAHINDRA' : '')).trim();
  const modelo = tok || rotulo?.[1] || '';
  const bonito = (x: string) => x.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  if (!modelo) return nomeMarca ? bonito(nomeMarca) : 'Trator';
  return `${nomeMarca ? bonito(nomeMarca) + ' ' : ''}${modelo}`;
}

/** "30/07/2026" → "2026-07-30" (ISO passa direto). */
export function dataISO(s: unknown): string | null {
  const t = String(s ?? '').trim();
  const br = t.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;
}

const DIA = 86_400_000;
const utc = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
export function somarDias(iso: string, dias: number): string {
  return new Date(utc(iso) + dias * DIA).toISOString().slice(0, 10);
}
export function diasEntre(deISO: string, ateISO: string): number {
  return Math.round((utc(ateISO) - utc(deISO)) / DIA);
}

/** 30, 60 e 90 dias depois da venda: a data de cada um e se já passou. */
export function marcosDaVenda(vendaISO: string, hojeISO: string): Marco[] {
  return MARCOS_DIAS.map((dias) => {
    const data = somarDias(vendaISO, dias);
    return { dias, data, passou: data <= hojeISO, diasFalta: diasEntre(hojeISO, data) };
  });
}

export function faseDaVenda(vendaISO: string, hojeISO: string): Fase {
  const d = diasEntre(vendaISO, hojeISO);
  return d >= 90 ? 'fez90' : d >= 60 ? 'fez60' : d >= 30 ? 'fez30' : 'antes';
}

/** Marco que cai na semana (fez 30/60/90 nos últimos 7 dias): é a hora de ligar. */
export function marcoDaSemana(vendaISO: string, hojeISO: string): MarcoDias | null {
  for (const m of marcosDaVenda(vendaISO, hojeISO)) {
    const d = diasEntre(m.data, hojeISO);
    if (d >= 0 && d < 7) return m.dias;
  }
  return null;
}

export interface LinhaVenda {
  empresa: 'NOVA' | 'CASTRO';
  pedido: string;
  dataISO: string;
  chassi: string | null;
  cancelada?: boolean;
}

/**
 * Um trator por chassi. A mesma máquina aparece em duas notas quando a venda foi
 * refaturada (nota cancelada/devolvida e emitida de novo): fica a mais recente
 * que não foi cancelada. Sem chassi, cada nota fica como está.
 */
export function umaPorChassi<T extends LinhaVenda>(linhas: T[]): T[] {
  const validas = linhas.filter((l) => !l.cancelada);
  const porChassi = new Map<string, T>();
  const semChassi: T[] = [];
  for (const l of validas) {
    const k = l.chassi ? finalDoChassi(l.chassi, 8) : '';
    if (!k) { semChassi.push(l); continue; }
    const atual = porChassi.get(k);
    if (!atual || l.dataISO > atual.dataISO) porChassi.set(k, l);
  }
  return [...porChassi.values(), ...semChassi].sort((a, b) => (a.dataISO < b.dataISO ? 1 : a.dataISO > b.dataISO ? -1 : 0));
}

/** Link do Google Maps: ponto exato, ou busca pelo endereço. */
export function linkMapa(p: { lat?: number | null; lng?: number | null; endereco?: string | null }): string | null {
  if (p.lat != null && p.lng != null && Number.isFinite(p.lat) && Number.isFinite(p.lng)) {
    return `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;
  }
  const e = String(p.endereco ?? '').trim();
  return e ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e)}` : null;
}

/** Telefone para o WhatsApp (55 + DDD + número). null = não dá. */
export function whatsDe(tel: unknown): string | null {
  const d = String(tel ?? '').replace(/\D/g, '').replace(/^0+/, '');
  if (d.length === 10 || d.length === 11) return '55' + d;
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) return d;
  return null;
}
