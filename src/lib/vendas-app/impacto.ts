// "Impacto real" do vendedor (gamificação): serviço do Pós-Vendas concluído
// para um cliente DEPOIS da visita do vendedor. Mostra o trabalho virando
// dinheiro — é correlação, não comissão (a tela diz "depois da sua visita").
// Liga visita → cliente → OS pelo CPF/CNPJ. Regras puras.

export interface VisitaImpacto { propriedade_id: number | null; data_visita: string }
export interface ClienteImpacto { id: number; nome: string; documento: string }
export interface OsImpacto {
  Id_Ordem: string; Cnpj_Cliente: string | null; Status: string | null; Valor_Total: string | number | null;
  Data: string | null; Tipo_Servico: string | null; Revisao: string | null;
}

export const STATUS_QUE_CONTAM = new Set(['Concluída', 'Cobrando Cliente']);
const digitos = (s: unknown) => String(s ?? '').replace(/\D/g, '');

/** Valor que vem como "1234,56", "1.234,56" ou "1234.56". */
export function valorBR(v: unknown): number {
  if (typeof v === 'number') return v;
  let s = String(v ?? '').trim();
  if (!s) return 0;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

export function impactoDoVendedor(visitas: VisitaImpacto[], clientes: ClienteImpacto[], ordens: OsImpacto[]) {
  // primeira visita do vendedor a cada cliente (com documento de 11+ dígitos)
  const porId = new Map(clientes.map((c) => [c.id, c]));
  const primeira = new Map<string, { cliente: ClienteImpacto; desde: string }>();
  for (const v of visitas) {
    const c = v.propriedade_id != null ? porId.get(v.propriedade_id) : undefined;
    const doc = digitos(c?.documento);
    if (!c || doc.length < 11) continue;
    const dia = v.data_visita.slice(0, 10);
    const atual = primeira.get(doc);
    if (!atual || dia < atual.desde) primeira.set(doc, { cliente: c, desde: dia });
  }
  const itens = ordens
    .filter((o) => STATUS_QUE_CONTAM.has(String(o.Status)))
    .map((o) => ({ o, ref: primeira.get(digitos(o.Cnpj_Cliente)) }))
    .filter((x): x is { o: OsImpacto; ref: { cliente: ClienteImpacto; desde: string } } => !!x.ref && !!x.o.Data && x.o.Data >= x.ref.desde)
    .map(({ o, ref }) => ({
      os: o.Id_Ordem,
      cliente: ref.cliente.nome,
      data: o.Data as string,
      valor: Math.round(valorBR(o.Valor_Total) * 100) / 100,
      servico: [o.Tipo_Servico, o.Revisao ? `revisão ${o.Revisao}` : null].filter(Boolean).join(' · ') || 'Serviço',
      visitado_desde: ref.desde,
    }))
    .filter((x) => x.valor > 0)
    .sort((a, b) => b.data.localeCompare(a.data));
  return {
    itens,
    total: Math.round(itens.reduce((s, x) => s + x.valor, 0) * 100) / 100,
    clientes: new Set(itens.map((x) => x.cliente)).size,
  };
}
