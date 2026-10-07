// Para onde cada documento do cockpit abre (funções PURAS, testáveis).
//
// Regra (decisão do usuário, 07/10/2026): com o módulo, abre a TELA
// (/pos?id=OS-xxxx, /ppv?id=PPV-xxxx); sem o módulo, abre o PDF do documento
// pelas rotas de impressão que já existem. OS/PV que só existem na Omie abrem
// a remontagem de /api/clientes/print (mesma convenção da Pasta Clientes,
// src/app/api/clientes/route.ts). Links sempre relativos e em nova aba — a
// ligação em curso no cockpit não pode ser perdida.

export interface Acesso {
  pos: boolean;
  ppv: boolean;
}

export interface LinkDoc {
  href: string;
  /** título para o `title`/tooltip */
  titulo: string;
  /** 'tela' = abre a tela do portal; 'pdf' = impressão/PDF; 'nf' = nota fiscal */
  tipo: "tela" | "pdf" | "nf";
}

export const SEM_ACESSO: Acesso = { pos: false, ppv: false };

function q(s: string | number | null | undefined): string {
  return encodeURIComponent(String(s ?? ""));
}

/** Ordem de serviço: POS do portal (id_ordem) ou OS só da Omie (cod_os + empresa). */
export function linkOS(s: { id_ordem: string | null; cod_os?: number | null; empresa?: string | null; ordem_omie?: string | null }, acesso: Acesso): LinkDoc | null {
  if (s.id_ordem) {
    if (acesso.pos) return { href: `/pos?id=${q(s.id_ordem)}`, titulo: `Abrir ${s.id_ordem} no POS`, tipo: "tela" };
    return { href: `/api/pos/ordens/${q(s.id_ordem)}/print`, titulo: `PDF da ${s.id_ordem}`, tipo: "pdf" };
  }
  if (s.cod_os) {
    const n = s.ordem_omie ? `OS ${s.ordem_omie}` : "OS";
    return { href: `/api/clientes/print?tipo=os&cod=${q(s.cod_os)}&empresa=${q(s.empresa || "Nova Tratores")}`, titulo: `Impressão da ${n} (Omie)`, tipo: "pdf" };
  }
  return null;
}

/** Pré-pedido de venda do portal. */
export function linkPPV(idPpv: string | null | undefined, acesso: Acesso): LinkDoc | null {
  const id = String(idPpv || "").trim();
  if (!id) return null;
  if (acesso.ppv) return { href: `/ppv?id=${q(id)}`, titulo: `Abrir ${id} no PPV`, tipo: "tela" };
  return { href: `/api/ppv/pdf?id=${q(id)}`, titulo: `PDF do ${id}`, tipo: "pdf" };
}

/** Pedido de venda da Omie (sem PPV correspondente): remontagem pelo código interno. */
export function linkPV(c: { cod_pedido: number | null; empresa: string | null; numero_pv?: string | null }): LinkDoc | null {
  if (!c.cod_pedido) return null;
  const n = c.numero_pv ? `PV ${c.numero_pv}` : "PV";
  return { href: `/api/clientes/print?tipo=pv&cod=${q(c.cod_pedido)}&empresa=${q(c.empresa || "Nova Tratores")}`, titulo: `Impressão do ${n} (Omie)`, tipo: "pdf" };
}

/** Nota fiscal (DANFE/NFS-e) quando o espelho Omie guardou o link. */
export function linkNF(url: string | null | undefined, numero?: string | null): LinkDoc | null {
  const u = String(url || "").trim();
  if (!/^https?:\/\//i.test(u) && !u.startsWith("/")) return null;
  return { href: u, titulo: numero ? `Nota fiscal ${numero}` : "Nota fiscal", tipo: "nf" };
}

/** Ficha completa do projeto Omie (Pasta Clientes → página imprimível). */
export function linkProjeto(p: { nome: string; empresa: string } | null | undefined): string | null {
  if (!p?.nome) return null;
  return `/clientes/projeto?nome=${q(p.nome)}&empresa=${q(p.empresa || "Nova Tratores")}`;
}

/** Garantia (módulo /garantias abre pelo id na query). */
export function linkGarantia(id: string | null | undefined): string | null {
  return id ? `/garantias?id=${q(id)}` : null;
}

/** Requisição (kanban abre o card pelo ?req=). */
export function linkRequisicao(id: number | string | null | undefined): string | null {
  return id != null && String(id) ? `/requisicoes?req=${q(id)}` : null;
}
