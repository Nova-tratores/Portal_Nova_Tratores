// =============================================
// COM NOTA × INTERNO e a NFS-e de cada OS (modos Relação e Dashboard do /pos)
// Regras PURAS. O valor do card é o calculado pelo portal (serviço + peças +
// requisições); a NFS-e vem do cache que o dashboard de vendas mantém
// (os_nfse + os_servicos_itens) e cobre SÓ o serviço — peça sai por pedido de
// venda. A ligação é o nº da OS na Omie (`Ordem_Omie`, às vezes com zeros à
// esquerda) = os_nfse.num_os.
// =============================================
import type { KanbanCard } from "./types";

/** NFS-e de uma OS, como está no cache. `temNota` null = cache não diz. */
export interface NfseOS {
  temNota: boolean | null;
  nfseNum: string | null;
  /** Soma dos itens de serviço da OS na Omie (null = sem itens no cache). */
  valorServico: number | null;
}
export type MapaNfse = Record<string, NfseOS>;

export type SituacaoNota = "interno" | "com_nfse" | "sem_nfse" | "nao_verificada" | "nao_enviada";

/** Nº da OS na Omie só com dígitos e sem zeros à esquerda ("000000000005348" → "5348"). */
export function chaveNumOS(s: unknown): string {
  return String(s ?? "").replace(/\D/g, "").replace(/^0+/, "");
}

/** Nº da NFS-e sem os zeros de preenchimento ("0000000000002" → "2"). */
export function numNfse(s: unknown): string {
  const t = String(s ?? "").trim();
  return t.replace(/^0+(?=.)/, "");
}

/** Cola em cada OS a NFS-e achada pelo nº da Omie (OS sem nº ou fora do cache fica sem). */
export function anexarNfse(lista: KanbanCard[], mapa: MapaNfse | null | undefined): KanbanCard[] {
  if (!mapa) return lista;
  return lista.map((o) => {
    const k = chaveNumOS(o.ordemOmie);
    const n = k ? mapa[k] : undefined;
    return n ? { ...o, nfse: n } : o;
  });
}

type OSNota = Pick<KanbanCard, "servicoInterno" | "ordemOmie" | "nfse">;

/**
 * interno = selo da OS (vale mesmo que exista nota no cache) · com_nfse = NFS-e
 * emitida · sem_nfse = faturada na Omie e o cache diz que não tem nota ·
 * nao_verificada = enviada à Omie mas fora do cache · nao_enviada = sem nº Omie.
 */
export function situacaoNota(o: OSNota): SituacaoNota {
  if (o.servicoInterno) return "interno";
  if (!chaveNumOS(o.ordemOmie)) return "nao_enviada";
  if (!o.nfse || o.nfse.temNota == null) return "nao_verificada";
  return o.nfse.temNota ? "com_nfse" : "sem_nfse";
}

/** Texto da coluna NFS-e (tela, filtro, PDF, CSV). */
export function rotuloNfse(o: OSNota): string {
  switch (situacaoNota(o)) {
    case "interno": return "interna";
    case "com_nfse": return numNfse(o.nfse?.nfseNum) || "emitida";
    case "sem_nfse": return "sem nota";
    default: return "";
  }
}

/** Valor de serviço que foi para a NFS-e (0 quando a OS não tem NFS-e emitida). */
export function valorNfse(o: OSNota): number {
  return situacaoNota(o) === "com_nfse" ? Number(o.nfse?.valorServico) || 0 : 0;
}
