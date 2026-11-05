// Relatórios PALIATIVOS do app do técnico (José, 05/11/2026): a visita ajudou o cliente mas não
// concluiu o serviço (falta de peça, de ferramenta, de tempo…). Uma OS pode ter VÁRIOS paliativos
// (tabela Ordem_Servico_Paliativos); o relatório FINAL continua em Ordem_Servico_Tecnicos e só traz
// os dias/horas/km da última visita. Cobrança da OS = paliativos + final.
// Sem a tabela (ainda não criada no banco), tudo aqui devolve lista vazia — nunca quebra.
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseHoras } from "@/lib/pos/horas-tecnico";

export const TBL_PALIATIVOS = "Ordem_Servico_Paliativos";

export interface DiaPaliativo { data: string; horaInicio: string; horaFim: string; kmTotal: string }

export interface PaliativoOS {
  id: number;
  tecResp1: string;
  tecResp2: string;
  motivo: string;
  dataInicio: string;
  dataFinal: string;
  totalHora: string;
  totalKm: string;
  numPlaca: string;
  pdfUrl: string | null;
  createdAt: string;
  /** dados.Motivo — o diagnóstico do técnico */
  diagnostico: string;
  servicoRealizado: string;
  dias: DiaPaliativo[];
}

const s = (v: unknown) => String(v ?? "").trim();
const parseNum = (v: unknown) => parseFloat(String(v ?? "").replace(/[^\d.,-]/g, "").replace(",", ".")) || 0;

/** Dias do relatório: DiasExecucao (json, até 10 dias); sem ele, as colunas DataInicio/2/3 — mesmo que o app. */
export function diasDoRelatorio(r: Record<string, unknown> | null | undefined): DiaPaliativo[] {
  if (!r) return [];
  let json = r.DiasExecucao as unknown;
  if (typeof json === "string") { try { json = JSON.parse(json); } catch { json = null; } }
  if (Array.isArray(json) && json.length) {
    return (json as Record<string, unknown>[]).map((d) => ({
      data: s(d.data), horaInicio: s(d.horaInicio), horaFim: s(d.horaFim), kmTotal: s(d.kmTotal),
    }));
  }
  const dias: DiaPaliativo[] = [];
  if (r.DataInicio) dias.push({ data: s(r.DataInicio), horaInicio: s(r.InicioHora), horaFim: s(r.FinalHora), kmTotal: s(r.InicioKm) || s(r.TotalKm) });
  if (r.DataInicio2) dias.push({ data: s(r.DataInicio2), horaInicio: s(r.InicioHora2), horaFim: s(r.FinalHora2), kmTotal: s(r.InicioKm2) });
  // FinaHora3 (sem o "l") é o nome real da coluna
  if (r.DataInicio3) dias.push({ data: s(r.DataInicio3), horaInicio: s(r.InicioHora3), horaFim: s(r.FinaHora3 ?? r.FinalHora3), kmTotal: s(r.InicioKm3) });
  return dias;
}

/** Paliativos da OS, do mais antigo ao mais novo. `comDados` traz diagnóstico/serviço/dias (lê o jsonb). */
export async function listarPaliativos(sb: SupabaseClient, idOs: string, opts: { comDados?: boolean } = {}): Promise<PaliativoOS[]> {
  try {
    const cols = 'id, "TecResp1", "TecResp2", motivo, "DataInicio", "DataFinal", "TotalHora", "TotalKm", "NumPlaca", pdf_url, created_at'
      + (opts.comDados ? ", dados" : "");
    const { data, error } = await sb.from(TBL_PALIATIVOS).select(cols).eq("Ordem_Servico", idOs).order("created_at", { ascending: true });
    if (error) { console.warn(`[paliativos] ${idOs}: ${error.message}`); return []; }
    return ((data || []) as unknown as Record<string, unknown>[]).map((r) => {
      let dados = r.dados as unknown;
      if (typeof dados === "string") { try { dados = JSON.parse(dados); } catch { dados = null; } }
      const d = (dados && typeof dados === "object" ? dados : {}) as Record<string, unknown>;
      return {
        id: Number(r.id) || 0,
        tecResp1: s(r.TecResp1), tecResp2: s(r.TecResp2), motivo: s(r.motivo),
        dataInicio: s(r.DataInicio), dataFinal: s(r.DataFinal),
        totalHora: s(r.TotalHora), totalKm: s(r.TotalKm), numPlaca: s(r.NumPlaca),
        pdfUrl: s(r.pdf_url) || null, createdAt: s(r.created_at),
        diagnostico: s(d.Motivo), servicoRealizado: s(d.ServicoRealizado),
        dias: opts.comDados ? diasDoRelatorio(d) : [],
      };
    });
  } catch (e) {
    console.warn(`[paliativos] ${idOs}:`, e);
    return [];
  }
}

/** Soma de horas (decimais, como o Qtd_HR) e km dos paliativos + a data de início mais antiga. */
export function somaPaliativos(lista: Pick<PaliativoOS, "totalHora" | "totalKm" | "dataInicio">[]): { horas: number; km: number; inicioMaisAntigo: string } {
  let horas = 0, km = 0, inicio = "";
  for (const p of lista) {
    horas += parseHoras(p.totalHora);
    km += parseNum(p.totalKm);
    const d = p.dataInicio.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(d) && (!inicio || d < inicio)) inicio = d;
  }
  return { horas: Math.round(horas * 100) / 100, km: Math.round(km * 100) / 100, inicioMaisAntigo: inicio };
}
