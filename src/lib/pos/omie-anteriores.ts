// Documentos do Omie que a OS já teve e foram cancelados ao "corrigir a nota" (José, 23/10/2026):
// a OS 5185 virou 5397, o pedido 7434 virou 7816. Sai do `faturamento_anterior` da OS
// (jsonb) e de cada PPV (texto JSON). Puro (sem banco).

export interface DocAnterior {
  tipo: "os" | "pedido";
  /** PPV dono do pedido (só tipo "pedido") */
  ppvId?: string;
  /** nº no Omie do documento cancelado */
  numero: string;
  /** nº no Omie do documento que o substituiu */
  novo: string | null;
  /** nota cancelada junto (NFS-e da OS, NF-e do pedido) */
  nota: string | null;
  notaLink?: string | null;
  canceladaEm: string | null;
}

type Rec = Record<string, unknown>;
const semZeros = (v: unknown) => String(v ?? "").trim().replace(/^0+(?=\d)/, "");
const lista = (v: unknown): Rec[] => {
  if (Array.isArray(v)) return v as Rec[];
  if (typeof v === "string" && v.trim()) { try { const j = JSON.parse(v); return Array.isArray(j) ? j : []; } catch { return []; } }
  return [];
};

export function documentosAnteriores(osAnterior: unknown, pedidos: { id_pedido: string; faturamento_anterior: unknown }[]): DocAnterior[] {
  const out: DocAnterior[] = [];
  for (const a of lista(osAnterior)) {
    const numero = semZeros(a.ordemOmie);
    if (!numero) continue;
    out.push({ tipo: "os", numero, novo: semZeros(a.novaOmie) || null, nota: semZeros(a.nfse) || null, notaLink: (a.nfseLink as string) || null, canceladaEm: (a.canceladaEm as string) || null });
  }
  for (const p of pedidos) {
    for (const a of lista(p.faturamento_anterior)) {
      const numero = semZeros(a.pedidoOmie);
      if (!numero) continue;
      out.push({ tipo: "pedido", ppvId: p.id_pedido, numero, novo: semZeros(a.novoPedido) || null, nota: semZeros(a.nf) || null, canceladaEm: (a.canceladaEm as string) || null });
    }
  }
  return out;
}
