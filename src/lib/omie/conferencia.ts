// Conferência portal × Omie antes de faturar (José, 14/10/2026): o que está no
// portal (OS/PPV) tem que estar igual na OS / Pedido de Venda do Omie. Aqui só
// a COMPARAÇÃO (pura, testada); quem lê e escreve no Omie fica em
// lib/pos/conferencia-omie.ts e lib/ppv/conferencia-omie.ts.

export interface Divergencia {
  /** documento: "OS-0814" / "PPV-0502" */
  doc: string;
  /** chave estável (usada para atualizar) */
  campo: string;
  rotulo: string;
  portal: string;
  omie: string;
  /** dá pra deixar o Omie igual ao portal automaticamente */
  ajustavel: boolean;
}

export interface ResultadoConferencia {
  doc: string;
  /** "OS" | "Pedido de venda" */
  tipo: string;
  numeroOmie: string;
  divergencias: Divergencia[];
  /** não deu pra conferir (ex.: não achou no Omie) */
  erro?: string;
  /** já faturado / remessa: nada a conferir */
  pulado?: string;
}

/** linha de serviço/produto comparável */
export interface ItemComparavel {
  chave: string;
  rotulo: string;
  qtde: number;
  unit: number;
  /** desconto em R$ do item */
  desconto: number;
  /** texto da linha (só o da solicitação é comparado) */
  descricao?: string;
}

const TOL = 0.011;
const num = (v: unknown) => { const n = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : 0; };
export const brl = (v: number) => `R$ ${num(v).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
const qtd = (v: number) => (Math.round(num(v) * 1000) / 1000).toString().replace(".", ",");

/** texto sem diferença de quebra de linha / "|" (o Omie troca \n por |) / espaços */
export function textoNormal(v: unknown): string {
  return String(v ?? "").replace(/\r?\n|\|/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

export function diferente(a: number, b: number, tol = TOL): boolean {
  return Math.abs(num(a) - num(b)) > tol;
}

/** compara listas de itens pela chave (código do serviço/produto) */
export function compararItens(doc: string, portal: ItemComparavel[], omie: ItemComparavel[], nomeItem = "Item"): Divergencia[] {
  const out: Divergencia[] = [];
  const mapaO = new Map<string, ItemComparavel[]>();
  for (const o of omie) mapaO.set(o.chave, [...(mapaO.get(o.chave) || []), o]);
  const usados = new Set<ItemComparavel>();
  for (const p of portal) {
    const cands = (mapaO.get(p.chave) || []).filter((o) => !usados.has(o));
    // mesma chave repetida (ex.: várias requisições "div."): prefere a de mesmo texto
    const o = cands.find((x) => p.descricao !== undefined && textoNormal(x.descricao) === textoNormal(p.descricao)) || cands[0];
    if (!o) {
      out.push({ doc, campo: `item:${p.chave}:falta`, rotulo: `${nomeItem} ${p.rotulo}`, portal: `${qtd(p.qtde)} × ${brl(p.unit)}`, omie: "não está no Omie", ajustavel: true });
      continue;
    }
    usados.add(o);
    if (diferente(p.qtde, o.qtde, 0.0005)) out.push({ doc, campo: `item:${p.chave}:qtde`, rotulo: `${nomeItem} ${p.rotulo} — quantidade`, portal: qtd(p.qtde), omie: qtd(o.qtde), ajustavel: true });
    if (diferente(p.unit, o.unit)) out.push({ doc, campo: `item:${p.chave}:unit`, rotulo: `${nomeItem} ${p.rotulo} — valor unitário`, portal: brl(p.unit), omie: brl(o.unit), ajustavel: true });
    if (diferente(p.desconto, o.desconto)) out.push({ doc, campo: `item:${p.chave}:desconto`, rotulo: `${nomeItem} ${p.rotulo} — desconto`, portal: brl(p.desconto), omie: brl(o.desconto), ajustavel: true });
    if (p.descricao !== undefined && textoNormal(p.descricao) !== textoNormal(o.descricao)) {
      out.push({ doc, campo: `item:${p.chave}:descricao`, rotulo: `${nomeItem} ${p.rotulo} — descrição`, portal: resumo(p.descricao), omie: resumo(o.descricao), ajustavel: true });
    }
  }
  for (const o of omie) {
    if (usados.has(o)) continue;
    out.push({ doc, campo: `item:${o.chave}:sobra`, rotulo: `${nomeItem} ${o.rotulo}`, portal: "não está no portal", omie: `${qtd(o.qtde)} × ${brl(o.unit)}`, ajustavel: true });
  }
  return out;
}

const resumo = (s: unknown) => { const t = String(s ?? "").replace(/\s+/g, " ").trim(); return t.length > 120 ? `${t.slice(0, 117)}…` : (t || "—"); };

/** campo simples (texto/código). `vazioIgnora`: portal vazio = não conferir */
export function compararCampo(doc: string, campo: string, rotulo: string, portal: unknown, omie: unknown,
  opts: { exibirPortal?: string; exibirOmie?: string; vazioIgnora?: boolean; ajustavel?: boolean; texto?: boolean } = {}): Divergencia | null {
  const p = String(portal ?? "").trim(), o = String(omie ?? "").trim();
  if (opts.vazioIgnora !== false && !p) return null;
  const igual = opts.texto ? textoNormal(p) === textoNormal(o) : p === o;
  if (igual) return null;
  return { doc, campo, rotulo, portal: opts.exibirPortal ?? resumo(p), omie: opts.exibirOmie ?? (resumo(o) || "—"), ajustavel: opts.ajustavel ?? true };
}

/** distribuição por departamento: { codigo: % } */
export function compararDepartamentos(doc: string, portal: Record<string, number>, omie: Record<string, number>, nome: (c: string) => string): Divergencia | null {
  const norm = (m: Record<string, number>) => Object.entries(m).filter(([, v]) => num(v) > 0).map(([k, v]) => [String(k), Math.round(num(v) * 100) / 100] as const).sort((a, b) => a[0].localeCompare(b[0]));
  const a = norm(portal), b = norm(omie);
  if (!a.length) return null;
  const igual = a.length === b.length && a.every(([k, v], i) => b[i][0] === k && !diferente(v, b[i][1], 0.05));
  if (igual) return null;
  const txt = (l: readonly (readonly [string, number])[]) => l.map(([k, v]) => `${nome(k)} ${String(v).replace(".", ",")}%`).join(" · ") || "—";
  return { doc, campo: "departamentos", rotulo: "Departamentos", portal: txt(a), omie: txt(b), ajustavel: true };
}

/** parcelas: datas e valores (lista "dd/mm/aaaa → R$") */
export function compararParcelas(doc: string, portal: { venc: string; valor: number }[], omie: { venc: string; valor: number }[]): Divergencia | null {
  if (!portal.length) return null;
  const igual = portal.length === omie.length && portal.every((p, i) => p.venc === omie[i].venc && !diferente(p.valor, omie[i].valor, 0.05));
  if (igual) return null;
  const txt = (l: { venc: string; valor: number }[]) => l.map((x) => `${x.venc} ${brl(x.valor)}`).join(" · ") || "—";
  return { doc, campo: "parcelas", rotulo: `Parcelas (${portal.length})`, portal: txt(portal), omie: txt(omie), ajustavel: true };
}

/** só as que dá pra ajustar sozinho */
export const ajustaveis = (l: Divergencia[]) => l.filter((d) => d.ajustavel);
