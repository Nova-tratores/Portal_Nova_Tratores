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
  /** frase explicando o que muda no Omie ao atualizar */
  explicacao?: string;
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
      out.push({ doc, campo: `item:${p.chave}:falta`, rotulo: `${nomeItem} ${p.rotulo}`, portal: `${qtd(p.qtde)} × ${brl(p.unit)}`, omie: "não está no Omie", ajustavel: true,
        explicacao: `Está no portal e falta no Omie. Ao atualizar, ${nomeItem.toLowerCase()} entra no Omie.` });
      continue;
    }
    usados.add(o);
    if (diferente(p.qtde, o.qtde, 0.0005)) out.push({ doc, campo: `item:${p.chave}:qtde`, rotulo: `${nomeItem} ${p.rotulo} — quantidade`, portal: qtd(p.qtde), omie: qtd(o.qtde), ajustavel: true,
      explicacao: `No portal são ${qtd(p.qtde)}, no Omie ${qtd(o.qtde)}. Ao atualizar, o Omie passa para ${qtd(p.qtde)}.` });
    if (diferente(p.unit, o.unit)) out.push({ doc, campo: `item:${p.chave}:unit`, rotulo: `${nomeItem} ${p.rotulo} — valor unitário`, portal: brl(p.unit), omie: brl(o.unit), ajustavel: true,
      explicacao: `O preço de cada unidade está diferente. Ao atualizar, o Omie passa a cobrar ${brl(p.unit)}.` });
    if (diferente(p.desconto, o.desconto)) out.push({ doc, campo: `item:${p.chave}:desconto`, rotulo: `${nomeItem} ${p.rotulo} — desconto`, portal: brl(p.desconto), omie: brl(o.desconto), ajustavel: true,
      explicacao: p.desconto > o.desconto ? `O portal dá ${brl(p.desconto)} de desconto e o Omie ${brl(o.desconto)}. Sem atualizar, o cliente paga ${brl(p.desconto - o.desconto)} a mais.` : `O Omie dá mais desconto que o portal. Sem atualizar, o cliente paga ${brl(o.desconto - p.desconto)} a menos.` });
    if (p.descricao !== undefined && textoNormal(p.descricao) !== textoNormal(o.descricao)) {
      const t = trechoDiferente(p.descricao, o.descricao);
      out.push({ doc, campo: `item:${p.chave}:descricao`, rotulo: `${nomeItem} ${p.rotulo} — texto`, portal: t.portal, omie: t.omie, ajustavel: true,
        explicacao: "O texto que sai na nota está diferente a partir do trecho mostrado. Ao atualizar, o Omie recebe o texto do portal." });
    }
  }
  for (const o of omie) {
    if (usados.has(o)) continue;
    out.push({ doc, campo: `item:${o.chave}:sobra`, rotulo: `${nomeItem} ${o.rotulo}`, portal: "não está no portal", omie: `${qtd(o.qtde)} × ${brl(o.unit)}`, ajustavel: true,
      explicacao: `Está no Omie mas não no portal. Ao atualizar, sai do Omie.` });
  }
  return out;
}

/** trecho em volta do 1º ponto onde os textos diferem (… antes · diferença · …) */
export function trechoDiferente(a: unknown, b: unknown, raio = 45): { portal: string; omie: string } {
  const pa = String(a ?? "").replace(/\r?\n|\|/g, " ").replace(/\s+/g, " ").trim();
  const pb = String(b ?? "").replace(/\r?\n|\|/g, " ").replace(/\s+/g, " ").trim();
  const la = pa.toLowerCase(), lb = pb.toLowerCase();
  let i = 0;
  while (i < la.length && i < lb.length && la[i] === lb[i]) i++;
  const corte = (t: string) => {
    const ini = Math.max(0, i - raio), fim = Math.min(t.length, i + raio * 2);
    const x = t.slice(ini, fim);
    return `${ini > 0 ? "…" : ""}${x || "(vazio)"}${fim < t.length ? "…" : ""}`;
  };
  return { portal: i >= pa.length && pa.length < pb.length ? `${corte(pa)} (termina aqui)` : corte(pa), omie: i >= pb.length && pb.length < pa.length ? `${corte(pb)} (termina aqui)` : corte(pb) };
}

const resumo = (s: unknown) => { const t = String(s ?? "").replace(/\s+/g, " ").trim(); return t.length > 120 ? `${t.slice(0, 117)}…` : (t || "—"); };

/** campo simples (texto/código). `vazioIgnora`: portal vazio = não conferir */
export function compararCampo(doc: string, campo: string, rotulo: string, portal: unknown, omie: unknown,
  opts: { exibirPortal?: string; exibirOmie?: string; vazioIgnora?: boolean; ajustavel?: boolean; texto?: boolean } = {}): Divergencia | null {
  const p = String(portal ?? "").trim(), o = String(omie ?? "").trim();
  if (opts.vazioIgnora !== false && !p) return null;
  const igual = opts.texto ? textoNormal(p) === textoNormal(o) : p === o;
  if (igual) return null;
  if (opts.texto) {
    const t = trechoDiferente(p, o);
    return { doc, campo, rotulo, portal: t.portal, omie: t.omie, ajustavel: opts.ajustavel ?? true, explicacao: "O texto está diferente a partir do trecho mostrado. Ao atualizar, o Omie recebe o texto do portal." };
  }
  const vp = opts.exibirPortal ?? resumo(p), vo = opts.exibirOmie ?? (resumo(o) || "—");
  return { doc, campo, rotulo, portal: vp, omie: vo, ajustavel: opts.ajustavel ?? true, explicacao: `No Omie está "${vo}". Ao atualizar, passa a ser "${vp}", igual ao portal.` };
}

/** distribuição por departamento: { codigo: % } */
export function compararDepartamentos(doc: string, portal: Record<string, number>, omie: Record<string, number>, nome: (c: string) => string): Divergencia | null {
  const norm = (m: Record<string, number>) => Object.entries(m).filter(([, v]) => num(v) > 0).map(([k, v]) => [String(k), Math.round(num(v) * 100) / 100] as const).sort((a, b) => a[0].localeCompare(b[0]));
  const a = norm(portal), b = norm(omie);
  if (!a.length) return null;
  const igual = a.length === b.length && a.every(([k, v], i) => b[i][0] === k && !diferente(v, b[i][1], 0.05));
  if (igual) return null;
  const txt = (l: readonly (readonly [string, number])[]) => l.map(([k, v]) => `${nome(k)} ${String(v).replace(".", ",")}%`).join(" · ") || "—";
  return { doc, campo: "departamentos", rotulo: "Departamentos", portal: txt(a), omie: txt(b), ajustavel: true, explicacao: "A divisão do valor entre os departamentos está diferente. Ao atualizar, fica como no portal." };
}

/** parcelas: datas e valores (lista "dd/mm/aaaa → R$") */
export function compararParcelas(doc: string, portal: { venc: string; valor: number }[], omie: { venc: string; valor: number }[]): Divergencia | null {
  if (!portal.length) return null;
  const igual = portal.length === omie.length && portal.every((p, i) => p.venc === omie[i].venc && !diferente(p.valor, omie[i].valor, 0.05));
  if (igual) return null;
  const txt = (l: { venc: string; valor: number }[]) => l.map((x) => `${x.venc} ${brl(x.valor)}`).join(" · ") || "—";
  return { doc, campo: "parcelas", rotulo: `Parcelas (${portal.length})`, portal: txt(portal), omie: txt(omie), ajustavel: true,
    explicacao: portal.length !== omie.length ? `O portal tem ${portal.length} parcela(s) e o Omie ${omie.length}. Ao atualizar, ficam as do portal.` : "Datas ou valores das parcelas estão diferentes. Ao atualizar, ficam as do portal." };
}

/** só as que dá pra ajustar sozinho */
export const ajustaveis = (l: Divergencia[]) => l.filter((d) => d.ajustavel);
