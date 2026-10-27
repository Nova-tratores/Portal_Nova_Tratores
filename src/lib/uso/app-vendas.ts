// Monitor de uso — app de vendas (vendas-pwa) (PURO, sem banco).
//
// O app junta as contagens no celular (passa o dia sem sinal) e manda lotes
// por dia para POST /api/uso/vendas. Aqui: validar o lote (é entrada de
// cliente — rota com cara de rota, dia recente, tamanho limitado) e resumir
// atalhos/fluxos para a aba Padrões. Telas e transições do app vão para as
// mesmas tabelas do portal, com rota '/vendas/...'.

export const PREFIXO_VENDAS = '/vendas';
export const MAX_DIAS = 30;
export const FLUXOS = ['visita', 'completar_visita', 'checklist_veiculo', 'whatsapp', 'negocio_novo'] as const;
export const EVENTOS_FLUXO = ['iniciado', 'concluido', 'cancelado', 'abandonado'] as const;

const ROTA = /^\/vendas(\/[A-Za-z0-9_\-[\]]+)*$/;
const CHAVE = /^[a-z0-9_:\-/]{1,80}$/;
const DIA = /^\d{4}-\d{2}-\d{2}$/;
const N_MAX = 10000;
const TETO = { lotes: MAX_DIAS + 1, paginas: 300, transicoes: 1000, eventos: 500 };

export const ehRotaVendas = (r: string) => r === PREFIXO_VENDAS || String(r || '').startsWith(PREFIXO_VENDAS + '/');

export interface ItemPagina { rota: string; dia: string; n: number }
export interface ItemTransicao { de: string; para: string; dia: string; n: number; n_mesmo_alvo: number; n_volta: number; n_rapida: number; soma_gap_s: number }
export interface ItemEvento { tipo: 'atalho' | 'fluxo'; chave: string; detalhe: string; dia: string; n: number; soma_s: number }
export interface LoteValidado { paginas: ItemPagina[]; transicoes: ItemTransicao[]; eventos: ItemEvento[] }

const inteiro = (v: unknown, max = N_MAX) => {
  const x = Math.floor(Number(v));
  return Number.isFinite(x) && x > 0 ? Math.min(x, max) : 0;
};
const rotaOk = (r: unknown): r is string => typeof r === 'string' && r.length <= 200 && ROTA.test(r);
const lista = (v: unknown, teto: number): unknown[] => (Array.isArray(v) ? v.slice(0, teto) : []);

/** Detalhe de atalho = 'origem→destino' (destino pode ser '(mesma tela)'). */
function detalheAtalho(d: unknown): string | null {
  if (typeof d !== 'string') return null;
  const [de, para] = d.split('→');
  const okDe = de === '?' || rotaOk(de);
  const okPara = para === '(mesma tela)' || rotaOk(para);
  return okDe && okPara ? `${de}→${para}` : null;
}

/**
 * Valida o corpo { lotes: [{dia, paginas, transicoes, eventos}] }.
 * Item inválido é descartado (não derruba o lote); dia fora da janela também.
 * `hoje` = diaLocal() do servidor.
 */
export function validarLotes(corpo: unknown, hoje: string): LoteValidado | { erro: string } {
  const lotes = (corpo as { lotes?: unknown })?.lotes;
  if (!Array.isArray(lotes)) return { erro: 'Esperado { lotes: [...] }' };
  const limite = new Date(new Date(hoje + 'T12:00:00Z').getTime() - MAX_DIAS * 86400000).toISOString().slice(0, 10);
  const out: LoteValidado = { paginas: [], transicoes: [], eventos: [] };

  for (const l of lotes.slice(0, TETO.lotes) as Array<Record<string, unknown>>) {
    const dia = String(l?.dia || '');
    if (!DIA.test(dia) || dia < limite || dia > hoje) continue;

    for (const p of lista(l.paginas, TETO.paginas) as Array<Record<string, unknown>>) {
      const n = inteiro(p?.n);
      if (n && rotaOk(p?.rota)) out.paginas.push({ rota: p.rota as string, dia, n });
    }
    for (const t of lista(l.transicoes, TETO.transicoes) as Array<Record<string, unknown>>) {
      const n = inteiro(t?.n);
      if (!n || !rotaOk(t?.de) || !rotaOk(t?.para) || t.de === t.para) continue;
      out.transicoes.push({
        de: t.de as string, para: t.para as string, dia, n,
        n_mesmo_alvo: Math.min(inteiro(t.n_mesmo_alvo), n),
        n_volta: Math.min(inteiro(t.n_volta), n),
        n_rapida: Math.min(inteiro(t.n_rapida), n),
        soma_gap_s: Math.min(inteiro(t.soma_gap_s, Number.MAX_SAFE_INTEGER), n * 1800),
      });
    }
    for (const e of lista(l.eventos, TETO.eventos) as Array<Record<string, unknown>>) {
      const n = inteiro(e?.n);
      const chave = String(e?.chave || '');
      if (!n || !CHAVE.test(chave)) continue;
      if (e.tipo === 'atalho') {
        const detalhe = detalheAtalho(e.detalhe);
        if (detalhe) out.eventos.push({ tipo: 'atalho', chave, detalhe, dia, n, soma_s: 0 });
      } else if (e.tipo === 'fluxo') {
        const ev = String(e.detalhe || '');
        if (!(FLUXOS as readonly string[]).includes(chave) || !(EVENTOS_FLUXO as readonly string[]).includes(ev)) continue;
        out.eventos.push({ tipo: 'fluxo', chave, detalhe: ev, dia, n, soma_s: Math.min(inteiro(e.soma_s, Number.MAX_SAFE_INTEGER), n * 3600) });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- resumo

export interface LinhaAppEvento { user_id: string; tipo: 'atalho' | 'fluxo'; chave: string; detalhe: string; dia: string; n: number; soma_s: number }

export interface ResumoAtalho { atalho: string; de: string; para: string; n: number; pessoas: number }
export interface ResumoFluxo {
  fluxo: string; iniciados: number; concluidos: number; cancelados: number; abandonados: number;
  pctConcluido: number; pctAbandono: number; tempoMedioConcluirS: number; pessoas: number;
}

export const NOME_FLUXO: Record<string, string> = {
  visita: 'Registrar visita',
  completar_visita: 'Completar visita',
  checklist_veiculo: 'Checklist do carro',
  whatsapp: 'Enviar máquina no WhatsApp',
  negocio_novo: 'Criar negócio na visita',
};

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);

export function resumirApp(linhas: LinhaAppEvento[]): { atalhos: ResumoAtalho[]; fluxos: ResumoFluxo[] } {
  const at = new Map<string, { atalho: string; de: string; para: string; n: number; users: Set<string> }>();
  const fl = new Map<string, { n: Record<string, number>; somaConcluido: number; users: Set<string> }>();
  for (const l of linhas) {
    if (l.tipo === 'atalho') {
      const [de, para] = l.detalhe.split('→');
      const k = `${l.chave}|${l.detalhe}`;
      const a = at.get(k) || { atalho: l.chave, de, para, n: 0, users: new Set<string>() };
      a.n += l.n; a.users.add(l.user_id);
      at.set(k, a);
    } else if (l.tipo === 'fluxo') {
      const f = fl.get(l.chave) || { n: {}, somaConcluido: 0, users: new Set<string>() };
      f.n[l.detalhe] = (f.n[l.detalhe] || 0) + l.n;
      if (l.detalhe === 'concluido') f.somaConcluido += Number(l.soma_s) || 0;
      f.users.add(l.user_id);
      fl.set(l.chave, f);
    }
  }
  const atalhos = Array.from(at.values())
    .map((a) => ({ atalho: a.atalho, de: a.de, para: a.para, n: a.n, pessoas: a.users.size }))
    .sort((x, y) => y.n - x.n);
  const fluxos = Array.from(fl.entries()).map(([fluxo, f]) => {
    const ini = f.n.iniciado || 0, conc = f.n.concluido || 0;
    return {
      fluxo, iniciados: ini, concluidos: conc, cancelados: f.n.cancelado || 0, abandonados: f.n.abandonado || 0,
      pctConcluido: pct(conc, ini), pctAbandono: pct(f.n.abandonado || 0, ini),
      tempoMedioConcluirS: conc ? Math.round(f.somaConcluido / conc) : 0,
      pessoas: f.users.size,
    };
  }).sort((x, y) => y.iniciados - x.iniciados);
  return { atalhos, fluxos };
}
