// Regras do mapa ao vivo da Frota (puras — testadas em __tests__/mapa-vivo.test.ts).
//
// Situação de cada carro pela ÚLTIMA posição conhecida (decisão do José,
// 15/10/2026): sem posição há mais de 1 h com o motor LIGADO, ou há mais de
// 24 h com ele DESLIGADO, é "sem sinal". Carro guardado na loja manda pouca
// posição — por isso a régua do desligado é mais larga.

export type StatusVivo = 'andando' | 'ligado_parado' | 'desligado' | 'sem_sinal';

export const SEM_SINAL_LIGADO_MIN = 60;
export const SEM_SINAL_DESLIGADO_MIN = 24 * 60;
/** abaixo disso com o motor ligado é "parado ligado" (manobra/semáforo não conta como andando) */
export const VEL_ANDANDO_KMH = 5;

export const STATUS_INFO: Record<StatusVivo, { label: string; cor: string; ordem: number }> = {
  andando: { label: 'Andando', cor: '#16a34a', ordem: 0 },
  ligado_parado: { label: 'Parado com motor ligado', cor: '#d97706', ordem: 1 },
  desligado: { label: 'Desligado', cor: '#64748b', ordem: 2 },
  sem_sinal: { label: 'Sem sinal', cor: '#dc2626', ordem: 3 },
};

export interface PosicaoVivo {
  ignicao: boolean;
  velocidade: number;
  dt: string | null;
}

export function minutosDesde(dt: string | null | undefined, agoraMs: number): number | null {
  if (!dt) return null;
  const t = new Date(dt).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, (agoraMs - t) / 60000);
}

export function statusVivo(pos: PosicaoVivo | null | undefined, agoraMs: number): StatusVivo {
  const min = minutosDesde(pos?.dt, agoraMs);
  if (!pos || min == null) return 'sem_sinal';
  if (pos.ignicao) {
    if (min > SEM_SINAL_LIGADO_MIN) return 'sem_sinal';
    return (Number(pos.velocidade) || 0) >= VEL_ANDANDO_KMH ? 'andando' : 'ligado_parado';
  }
  return min > SEM_SINAL_DESLIGADO_MIN ? 'sem_sinal' : 'desligado';
}

/** "agora" · "há 7 min" · "há 3 h" · "há 2 dias" · "sem posição" */
export function haQuanto(dt: string | null | undefined, agoraMs: number): string {
  const min = minutosDesde(dt, agoraMs);
  if (min == null) return 'sem posição';
  if (min < 2) return 'agora';
  if (min < 60) return `há ${Math.floor(min)} min`;
  const h = min / 60;
  if (h < 48) return `há ${Math.floor(h)} h`;
  return `há ${Math.floor(h / 24)} dias`;
}

/** Dia (YYYY-MM-DD) em horário de Brasília. `toISOString` dá o dia em UTC —
 *  depois das 21h ele já é "amanhã". */
export function diaBR(d: Date | string | number = new Date()): string {
  const data = d instanceof Date ? d : new Date(d);
  if (!Number.isFinite(data.getTime())) return '';
  return data.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

const NOME_VAZIO = /^(vazio|nenhum|nenhuma|sem|sem nome|null|undefined|n\/a|na|-+|\.+)$/i;

/** Nome de gente para exibir: some com lixo de cadastro ("Vazio") e tira o
 *  CAIXA ALTA ("NICOLAS DARIO" → "Nicolas Dario"). */
export function limparNome(s: string | null | undefined): string | null {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  if (!t || NOME_VAZIO.test(t)) return null;
  if (t !== t.toUpperCase()) return t;
  const minusculas = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);
  return t
    .toLowerCase()
    .split(' ')
    .map((p, i) => (i > 0 && minusculas.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(' ');
}

export function contarPorStatus<T extends { status: StatusVivo }>(lista: T[]): Record<StatusVivo, number> {
  const c: Record<StatusVivo, number> = { andando: 0, ligado_parado: 0, desligado: 0, sem_sinal: 0 };
  for (const v of lista) c[v.status]++;
  return c;
}

/** Andando primeiro, depois parado ligado, desligado e sem sinal; empate pelo nome/placa. */
export function ordenarVivos<T extends { status: StatusVivo; nome?: string | null; placa: string }>(lista: T[]): T[] {
  return [...lista].sort((a, b) =>
    STATUS_INFO[a.status].ordem - STATUS_INFO[b.status].ordem ||
    (a.nome || a.placa).localeCompare(b.nome || b.placa, 'pt-BR'),
  );
}

/** Rumo (0° = norte, 90° = leste) de A para B. */
export function rumoGraus(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const y = Math.sin((b.lng - a.lng) * rad) * Math.cos(b.lat * rad);
  const x = Math.cos(a.lat * rad) * Math.sin(b.lat * rad) - Math.sin(a.lat * rad) * Math.cos(b.lat * rad) * Math.cos((b.lng - a.lng) * rad);
  return (Math.atan2(y, x) / rad + 360) % 360;
}

/** Para onde o carro está indo: do último ponto para trás, o primeiro que está a
 *  pelo menos `minMetros` (GPS parado oscila alguns metros) e a no máximo
 *  `maxMin` minutos do último. Pontos em ordem de tempo. */
export function rumoDosPontos(
  pontos: { lat: number; lng: number; dt: string }[],
  minMetros = 25,
  maxMin = 10,
): number | null {
  if (pontos.length < 2) return null;
  const ult = pontos[pontos.length - 1];
  const tUlt = new Date(ult.dt).getTime();
  for (let i = pontos.length - 2; i >= 0; i--) {
    const p = pontos[i];
    if ((tUlt - new Date(p.dt).getTime()) / 60000 > maxMin) break;
    const R = 6371000, rad = Math.PI / 180;
    const dLat = (ult.lat - p.lat) * rad, dLng = (ult.lng - p.lng) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(p.lat * rad) * Math.cos(ult.lat * rad) * Math.sin(dLng / 2) ** 2;
    if (2 * R * Math.asin(Math.sqrt(h)) >= minMetros) return Math.round(rumoGraus(p, ult));
  }
  return null;
}

const RUMOS = ['norte', 'nordeste', 'leste', 'sudeste', 'sul', 'sudoeste', 'oeste', 'noroeste'];
/** 0° → "norte", 135° → "sudeste" */
export function nomeRumo(graus: number): string {
  return RUMOS[Math.round((((graus % 360) + 360) % 360) / 45) % 8];
}

/** "GABRIEL MORAES" e "Gabriel Moraes" são a mesma pessoa (a OS grava em
 *  caixa alta, o vínculo técnico↔carro não). */
export function chaveNome(s: string | null | undefined): string {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export interface OsExecucao { id: string; cliente: string | null }

/** OS em execução de qualquer um dos técnicos do carro (técnico 1 ou 2 da OS). */
export function osDosTecnicos(
  tecnicos: string[],
  ordens: { Id_Ordem: string; Os_Cliente?: string | null; Os_Tecnico?: string | null; Os_Tecnico2?: string | null }[],
): OsExecucao[] {
  const nomes = new Set(tecnicos.map(chaveNome).filter(Boolean));
  if (!nomes.size) return [];
  return ordens
    .filter((o) => nomes.has(chaveNome(o.Os_Tecnico)) || nomes.has(chaveNome(o.Os_Tecnico2)))
    .map((o) => ({ id: o.Id_Ordem, cliente: limparNome(o.Os_Cliente) }));
}

/** Junta carros a até `raioKm` uns dos outros (pátio da loja: 9 carros no mesmo
 *  ponto viravam um borrão). Guloso, na ordem recebida; o centro do grupo é o
 *  1º carro. Carros sem posição ficam de fora. */
export function agruparPorProximidade<T extends { lat: number | null; lng: number | null }>(lista: T[], raioKm = 0.15): T[][] {
  const grupos: { lat: number; lng: number; itens: T[] }[] = [];
  const dist = (aLat: number, aLng: number, bLat: number, bLng: number) => {
    const R = 6371, rad = Math.PI / 180;
    const dLat = (bLat - aLat) * rad, dLng = (bLng - aLng) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };
  for (const v of lista) {
    if (v.lat == null || v.lng == null) continue;
    const g = grupos.find((x) => dist(x.lat, x.lng, v.lat as number, v.lng as number) <= raioKm);
    if (g) g.itens.push(v);
    else grupos.push({ lat: v.lat, lng: v.lng, itens: [v] });
  }
  return grupos.map((g) => g.itens);
}

/** Lugar em linguagem de gente, a partir da classe do classificador de paradas
 *  (lib/frota/paradas). Usado no mapa e no "onde está agora" da Ficha. */
export function rotuloLocal(classe: string, nome: string | null): string {
  switch (classe) {
    case 'loja': return 'Loja';
    case 'cliente':
    case 'cliente_portal': return nome ? `Cliente ${nome}` : 'Cliente';
    case 'manutencao': return nome ? `Manutenção · ${nome}` : 'Manutenção';
    case 'estacionamento': return 'Estacionamento';
    case 'descarga': return nome ? `Descarga · ${nome}` : 'Descarga';
    case 'outro_destino': return nome || 'Destino cadastrado';
    default: return 'Sem cadastro de local';
  }
}
