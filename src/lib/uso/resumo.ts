// Monitor de uso — agregações para a aba "Uso" (PURAS, testáveis).
import { ehRotaAutomatica, moduloDaRota } from './rota';

export interface LinhaPagina { user_id: string; rota: string; dia: string; acessos: number; ultimo_em: string }
export interface LinhaApi { user_id: string; rota: string; dia: string; chamadas: number; ultimo_em: string }
export interface LinhaPresenca { user_id: string; rota: string | null; ultimo_em: string }
export interface Usuario { id: string; nome: string; funcao?: string | null; ativo?: boolean | null }

export interface UsoPorUsuario {
  user_id: string; nome: string; funcao: string;
  acessos: number; paginas: number; diasAtivos: number;
  chamadasApi: number; chamadasAuto: number;
  ultimoAcesso: string | null; inativoHaDias: number | null;
  rotaTop: string | null;
}
export interface UsoPorPagina { rota: string; modulo: string; acessos: number; usuarios: number; ultimo: string | null }
export interface UsoPorModulo { modulo: string; acessos: number; usuarios: number; paginas: number }
export interface UsoPorDia { dia: string; acessos: number; usuarios: number }
export interface UsoApiPorRota { rota: string; chamadas: number; usuarios: number; automatica: boolean }
export interface Online { user_id: string; nome: string; rota: string | null; ultimo_em: string; minutos: number }

export interface ResumoUso {
  periodo: { de: string; ate: string; dias: number };
  totais: { acessos: number; usuarios: number; paginas: number; chamadasApi: number; chamadasAuto: number };
  porUsuario: UsoPorUsuario[];
  porPagina: UsoPorPagina[];
  porModulo: UsoPorModulo[];
  porDia: UsoPorDia[];
  apiPorRota: UsoApiPorRota[];
  online: Online[];
}

const ONLINE_MIN = 5;

function maxIso(a: string | null, b: string | null): string | null {
  if (!a) return b; if (!b) return a; return a > b ? a : b;
}

function diasEntre(deIso: string, ateIso: string): number {
  const de = new Date(deIso + 'T00:00:00Z').getTime();
  const ate = new Date(ateIso + 'T00:00:00Z').getTime();
  return Math.max(1, Math.round((ate - de) / 86400000) + 1);
}

export function resumirUso(args: {
  paginas: LinhaPagina[];
  api: LinhaApi[];
  presenca: LinhaPresenca[];
  usuarios: Usuario[];
  de: string;
  ate: string;
  agora?: Date;
  /** incluir usuários ativos sem nenhum uso no período (p/ "inativo há N dias") */
  incluirSemUso?: boolean;
}): ResumoUso {
  const agora = args.agora ?? new Date();
  const nomeDe = new Map(args.usuarios.map((u) => [u.id, u]));
  const nome = (id: string) => nomeDe.get(id)?.nome || id.slice(0, 8);

  // --- por usuário
  const pu = new Map<string, UsoPorUsuario & { _rotas: Map<string, number>; _dias: Set<string> }>();
  const garantir = (id: string) => {
    let r = pu.get(id);
    if (!r) {
      const u = nomeDe.get(id);
      r = {
        user_id: id, nome: nome(id), funcao: u?.funcao || '',
        acessos: 0, paginas: 0, diasAtivos: 0, chamadasApi: 0, chamadasAuto: 0,
        ultimoAcesso: null, inativoHaDias: null, rotaTop: null,
        _rotas: new Map(), _dias: new Set(),
      };
      pu.set(id, r);
    }
    return r;
  };
  for (const l of args.paginas) {
    const r = garantir(l.user_id);
    r.acessos += l.acessos;
    r._rotas.set(l.rota, (r._rotas.get(l.rota) || 0) + l.acessos);
    r._dias.add(l.dia);
    r.ultimoAcesso = maxIso(r.ultimoAcesso, l.ultimo_em);
  }
  for (const l of args.api) {
    const r = garantir(l.user_id);
    if (ehRotaAutomatica(l.rota)) r.chamadasAuto += l.chamadas; else r.chamadasApi += l.chamadas;
  }
  if (args.incluirSemUso) {
    for (const u of args.usuarios) if (u.ativo !== false) garantir(u.id);
  }
  // presença dá o "último acesso" mesmo fora do período
  const presencaDe = new Map(args.presenca.map((p) => [p.user_id, p]));
  const porUsuario: UsoPorUsuario[] = Array.from(pu.values()).map((r) => {
    const pres = presencaDe.get(r.user_id);
    const ultimo = maxIso(r.ultimoAcesso, pres?.ultimo_em || null);
    const rotaTop = Array.from(r._rotas.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    const inativo = ultimo ? Math.floor((agora.getTime() - new Date(ultimo).getTime()) / 86400000) : null;
    return {
      user_id: r.user_id, nome: r.nome, funcao: r.funcao,
      acessos: r.acessos, paginas: r._rotas.size, diasAtivos: r._dias.size,
      chamadasApi: r.chamadasApi, chamadasAuto: r.chamadasAuto,
      ultimoAcesso: ultimo, inativoHaDias: inativo, rotaTop,
    };
  }).sort((a, b) => b.acessos - a.acessos || a.nome.localeCompare(b.nome));

  // --- por página
  const pp = new Map<string, UsoPorPagina & { _u: Set<string> }>();
  for (const l of args.paginas) {
    let r = pp.get(l.rota);
    if (!r) { r = { rota: l.rota, modulo: moduloDaRota(l.rota), acessos: 0, usuarios: 0, ultimo: null, _u: new Set() }; pp.set(l.rota, r); }
    r.acessos += l.acessos; r._u.add(l.user_id); r.ultimo = maxIso(r.ultimo, l.ultimo_em);
  }
  const porPagina: UsoPorPagina[] = Array.from(pp.values())
    .map((r) => ({ rota: r.rota, modulo: r.modulo, acessos: r.acessos, usuarios: r._u.size, ultimo: r.ultimo }))
    .sort((a, b) => b.acessos - a.acessos || a.rota.localeCompare(b.rota));

  // --- por módulo
  const pm = new Map<string, UsoPorModulo & { _u: Set<string>; _p: Set<string> }>();
  for (const l of args.paginas) {
    const m = moduloDaRota(l.rota);
    let r = pm.get(m);
    if (!r) { r = { modulo: m, acessos: 0, usuarios: 0, paginas: 0, _u: new Set(), _p: new Set() }; pm.set(m, r); }
    r.acessos += l.acessos; r._u.add(l.user_id); r._p.add(l.rota);
  }
  const porModulo: UsoPorModulo[] = Array.from(pm.values())
    .map((r) => ({ modulo: r.modulo, acessos: r.acessos, usuarios: r._u.size, paginas: r._p.size }))
    .sort((a, b) => b.acessos - a.acessos);

  // --- por dia (série completa do período, com zeros)
  const pd = new Map<string, { acessos: number; u: Set<string> }>();
  for (const l of args.paginas) {
    const r = pd.get(l.dia) || { acessos: 0, u: new Set<string>() };
    r.acessos += l.acessos; r.u.add(l.user_id); pd.set(l.dia, r);
  }
  const porDia: UsoPorDia[] = [];
  const nDias = diasEntre(args.de, args.ate);
  for (let i = 0; i < nDias; i++) {
    const d = new Date(new Date(args.de + 'T00:00:00Z').getTime() + i * 86400000).toISOString().slice(0, 10);
    const r = pd.get(d);
    porDia.push({ dia: d, acessos: r?.acessos || 0, usuarios: r?.u.size || 0 });
  }

  // --- API por rota
  const pa = new Map<string, UsoApiPorRota & { _u: Set<string> }>();
  for (const l of args.api) {
    let r = pa.get(l.rota);
    if (!r) { r = { rota: l.rota, chamadas: 0, usuarios: 0, automatica: ehRotaAutomatica(l.rota), _u: new Set() }; pa.set(l.rota, r); }
    r.chamadas += l.chamadas; r._u.add(l.user_id);
  }
  const apiPorRota: UsoApiPorRota[] = Array.from(pa.values())
    .map((r) => ({ rota: r.rota, chamadas: r.chamadas, usuarios: r._u.size, automatica: r.automatica }))
    .sort((a, b) => b.chamadas - a.chamadas);

  // --- online agora
  const online: Online[] = args.presenca
    .map((p) => ({ user_id: p.user_id, nome: nome(p.user_id), rota: p.rota, ultimo_em: p.ultimo_em, minutos: Math.floor((agora.getTime() - new Date(p.ultimo_em).getTime()) / 60000) }))
    .filter((p) => p.minutos >= 0 && p.minutos < ONLINE_MIN)
    .sort((a, b) => a.minutos - b.minutos);

  const usuariosComUso = new Set(args.paginas.map((l) => l.user_id));
  return {
    periodo: { de: args.de, ate: args.ate, dias: nDias },
    totais: {
      acessos: porPagina.reduce((s, p) => s + p.acessos, 0),
      usuarios: usuariosComUso.size,
      paginas: porPagina.length,
      chamadasApi: apiPorRota.filter((a) => !a.automatica).reduce((s, a) => s + a.chamadas, 0),
      chamadasAuto: apiPorRota.filter((a) => a.automatica).reduce((s, a) => s + a.chamadas, 0),
    },
    porUsuario, porPagina, porModulo, porDia, apiPorRota, online,
  };
}
