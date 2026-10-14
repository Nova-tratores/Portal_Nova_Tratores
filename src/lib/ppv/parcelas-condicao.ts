// "Número de Parcelas" do PPV (José, 14/10/2026). Além das 4 opções antigas,
// aceita a condição que vem da OS vinculada:
//   "omie:A30|Para 30 dias (C)|"   → condição do Omie (código|nome|qtd p/ a 999)
//   "dias:30,45,60|3 parcelas (OS)" → datas editadas à mão na OS (dias a partir da previsão)
import { diasDaCondicao, type OmieEspelho } from "@/lib/pos/omie-espelho";

export const PARCELAS_PPV_PADRAO = ["30 dias", "30/60 dias", "30/60/90 dias", "À vista (PIX ou Cartão)"];
const LEGADO: Record<string, number[]> = {
  "À vista (PIX ou Cartão)": [0], "30 dias": [30], "30/60 dias": [30, 60], "30/60/90 dias": [30, 60, 90],
};

/** dias de cada parcela a partir da previsão de faturamento */
export function diasDoNumParcelas(v: string | null | undefined): number[] {
  const s = String(v || "").trim();
  if (LEGADO[s]) return LEGADO[s];
  if (s.startsWith("omie:")) {
    const [codigo, nome, qtd] = s.slice(5).split("|");
    return diasDaCondicao(codigo || "", nome || "", Number(qtd) || undefined);
  }
  if (s.startsWith("dias:")) {
    const l = s.slice(5).split("|")[0].split(",").map((x) => Number(x.trim())).filter((x) => Number.isFinite(x) && x >= 0);
    if (l.length) return l;
  }
  return [30];
}

/** texto para mostrar na tela */
export function rotuloNumParcelas(v: string | null | undefined): string {
  const s = String(v || "").trim();
  if (s.startsWith("omie:")) {
    const [codigo, nome, qtd] = s.slice(5).split("|");
    return codigo === "999" && qtd ? `${nome || codigo} (${qtd}x)` : (nome || codigo);
  }
  if (s.startsWith("dias:")) return s.split("|")[1] || `Parcelas da OS (${s.slice(5).split("|")[0]} dias)`;
  return s || "30 dias";
}

/** condição da OS → valor do "Número de Parcelas" do PPV (datas à mão na OS viram "dias:") */
export function numParcelasDaOS(esp: Pick<OmieEspelho, "condicao" | "condicaoNome" | "condicaoQtd" | "parcelas">): string {
  if (Array.isArray(esp.parcelas) && esp.parcelas.length) {
    const dias = esp.parcelas.map((p) => Math.max(0, Math.round(Number(p.dias) || 0)));
    return `dias:${dias.join(",")}|${dias.length === 1 ? "1 parcela" : `${dias.length} parcelas`} da OS (${dias.join("/")} dias)`;
  }
  return `omie:${esp.condicao || "A30"}|${esp.condicaoNome || esp.condicao || ""}|${esp.condicao === "999" ? (esp.condicaoQtd || 1) : ""}`;
}

/** PPV com OS vinculada: categoria pela OS (revisão → Revenda de Peças Revisão) */
export const CAT_PPV_SERVICOS = "1.01.99"; // 8. @Revenda de Peças em Serviços Prestados
export const CAT_PPV_REVISAO = "1.01.94";  // 9. @Revenda de Peças Revisão
export function categoriaPPVPelaOS(tipoServico: string | null | undefined): string {
  return /revis/i.test(String(tipoServico || "")) ? CAT_PPV_REVISAO : CAT_PPV_SERVICOS;
}
