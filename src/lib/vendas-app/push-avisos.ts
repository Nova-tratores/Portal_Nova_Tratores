// Avisos do app de vendas que chegam no celular com o app FECHADO (web push).
// Regras PURAS: o que cada vendedor recebe de manhã e no fim do dia.
//   manhã (07:30): retornos combinados para hoje (+ atrasados dos últimos 30 dias)
//   tarde (17:30): visitas de hoje sem próximo contato (nem data, nem "Sem retorno: motivo")
// Mesma régua do app (vendas-pwa/src/lib/completudeVisita.js → semRetornoJustificado).

export interface VisitaAviso {
  id: number;
  vendedor_id: number | null;
  propriedade_id: number | null;
  data_visita: string | null;
  data_proximo_contato: string | null;
  proximos_passos: string | null;
}

export interface Aviso { vendedorId: number; chave: string; titulo: string; corpo: string; link: string }

const PREFIXO = 'sem retorno:';

/** "Sem retorno: <motivo com 3+ letras>" na 1ª linha — o mesmo critério do app. */
export function semRetornoJustificado(passos: string | null | undefined): boolean {
  const t = String(passos || '').trim();
  if (!t.toLowerCase().startsWith(PREFIXO)) return false;
  const motivo = t.split(/\r?\n/)[0].slice(PREFIXO.length);
  return (motivo.match(/\p{L}/gu) || []).length >= 3;
}

/** Dia em Brasília (YYYY-MM-DD) de um instante. */
export function diaBR(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return new Date(d.getTime() - 3 * 3600000).toISOString().slice(0, 10);
}

function somaDias(dia: string, n: number) {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const lista = (nomes: string[]) => {
  const n = nomes.filter(Boolean);
  if (n.length <= 2) return n.join(' e ');
  return `${n.slice(0, 2).join(', ')} e mais ${n.length - 2}`;
};

/**
 * Manhã: a ÚLTIMA visita de cada propriedade (do vendedor) manda o retorno.
 * Hoje = data_proximo_contato == hoje; atrasado = entre hoje-30 e ontem.
 */
export function avisosManha(visitas: VisitaAviso[], nomeProp: (id: number) => string, hoje: string): Aviso[] {
  const ultima = new Map<string, VisitaAviso>();
  for (const v of visitas) {
    if (!v.vendedor_id || !v.propriedade_id || !v.data_visita) continue;
    const k = `${v.vendedor_id}:${v.propriedade_id}`;
    const u = ultima.get(k);
    if (!u || String(v.data_visita) > String(u.data_visita)) ultima.set(k, v);
  }
  const porVend = new Map<number, { hoje: VisitaAviso[]; atrasados: VisitaAviso[] }>();
  const limite = somaDias(hoje, -30);
  for (const v of ultima.values()) {
    const d = (v.data_proximo_contato || '').slice(0, 10);
    if (!d) continue;
    const g = porVend.get(v.vendedor_id!) || { hoje: [], atrasados: [] };
    if (d === hoje) g.hoje.push(v);
    else if (d < hoje && d >= limite) g.atrasados.push(v);
    else continue;
    porVend.set(v.vendedor_id!, g);
  }
  const out: Aviso[] = [];
  for (const [vendedorId, g] of porVend) {
    if (!g.hoje.length && !g.atrasados.length) continue;
    const titulo = g.hoje.length
      ? `Hoje: ${g.hoje.length} retorno${g.hoje.length > 1 ? 's' : ''} combinado${g.hoje.length > 1 ? 's' : ''}`
      : `${g.atrasados.length} retorno${g.atrasados.length > 1 ? 's' : ''} atrasado${g.atrasados.length > 1 ? 's' : ''}`;
    const partes = [];
    if (g.hoje.length) partes.push(lista(g.hoje.map((v) => nomeProp(v.propriedade_id!))));
    if (g.hoje.length && g.atrasados.length) partes.push(`${g.atrasados.length} atrasado${g.atrasados.length > 1 ? 's' : ''}`);
    if (!g.hoje.length) partes.push(lista(g.atrasados.map((v) => nomeProp(v.propriedade_id!))));
    out.push({ vendedorId, chave: `manha:${vendedorId}:${hoje}`, titulo, corpo: partes.join(' · '), link: '/notificacoes' });
  }
  return out;
}

/** Fim do dia: visitas de HOJE sem data de retorno e sem "Sem retorno: motivo". */
export function avisosTarde(visitas: VisitaAviso[], nomeProp: (id: number) => string, hoje: string): Aviso[] {
  const porVend = new Map<number, VisitaAviso[]>();
  for (const v of visitas) {
    if (!v.vendedor_id || !v.data_visita || diaBR(v.data_visita) !== hoje) continue;
    if (v.data_proximo_contato || semRetornoJustificado(v.proximos_passos)) continue;
    porVend.set(v.vendedor_id, [...(porVend.get(v.vendedor_id) || []), v]);
  }
  const out: Aviso[] = [];
  for (const [vendedorId, vs] of porVend) {
    vs.sort((a, b) => String(a.data_visita).localeCompare(String(b.data_visita)));
    const n = vs.length;
    out.push({
      vendedorId,
      chave: `tarde:${vendedorId}:${hoje}`,
      titulo: `${n} visita${n > 1 ? 's' : ''} de hoje sem próximo contato`,
      corpo: `${lista(vs.map((v) => (v.propriedade_id ? nomeProp(v.propriedade_id) : 'visita')))} — marque o retorno ou escreva por que não haverá.`,
      link: `/completar-visita/${vs[0].id}`,
    });
  }
  return out;
}
