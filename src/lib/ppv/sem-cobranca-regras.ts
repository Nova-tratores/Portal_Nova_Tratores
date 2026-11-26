// =============================================
// PEÇA SEM COBRANÇA — regras PURAS (valem no navegador e no servidor)
// Ver sql/ppv-itens-sem-cobranca.sql e src/lib/ppv/sem-cobranca.ts.
// =============================================

export interface SemCobrancaInfo {
  motivo: string;
  precoOriginal: number;
  por?: string;
  em?: string;
}

/** Respostas prontas do "por que não vai cobrar?" (o usuário também pode escrever). */
export const MOTIVOS_SEM_COBRANCA = [
  "Garantia",
  "Cortesia para o cliente",
  "Erro nosso (retrabalho)",
  "Peça trocada sem custo pelo fornecedor",
  "Combinado na venda da máquina",
] as const;

/** Item que ainda pesa no pedido (saldo > 0) e está marcado sem cobrança. */
export function itensSemCobrancaAtivos(d: {
  produtos: { codigo: string; descricao: string; quantidade: number; semCobranca?: SemCobrancaInfo | null }[];
  devolucoes: { codigo: string; quantidade: number }[];
}) {
  return d.produtos
    .filter((p) => p.semCobranca)
    .map((p) => {
      const dev = d.devolucoes.filter((x) => x.codigo === p.codigo).reduce((a, x) => a + x.quantidade, 0);
      return { codigo: p.codigo, descricao: p.descricao, saldo: p.quantidade - dev, info: p.semCobranca as SemCobrancaInfo };
    })
    .filter((x) => x.saldo > 0.0005);
}

/** Mensagem única usada no envio ao Omie, no faturamento do PPV e no da OS. */
export function avisoSemCobranca(idPPV: string, n: number): string {
  return `O ${idPPV} tem ${n} peça${n > 1 ? "s" : ""} marcada${n > 1 ? "s" : ""} como "não gerar cobrança" e ela${n > 1 ? "s" : ""} não pode${n > 1 ? "m" : ""} ser faturada${n > 1 ? "s" : ""} junto. Desmarque a opção ou clique em "Separar em remessa" no PPV.`;
}
