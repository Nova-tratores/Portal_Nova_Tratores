// OS → PPVs vinculados (José, 14/10/2026):
//  • categoria: PPV com OS = "Revenda de Peças em Serviços Prestados";
//    OS de revisão = "Revenda de Peças Revisão";
//  • previsão de faturamento e número de parcelas seguem os da OS.
// Não mexe em PPV cancelado nem já faturado.
import { supabase } from "@/lib/pos/supabase";
import { TBL_OS } from "@/lib/pos/constants";
import { registrarLog } from "@/lib/ppv/queries";
import { categoriaPPVPelaOS, numParcelasDaOS, rotuloNumParcelas } from "@/lib/ppv/parcelas-condicao";
import { normalizarEspelho, espelhoPadrao, type OmieEspelho } from "@/lib/pos/omie-espelho";

const hojeSP = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

export async function sincronizarPPVsComOS(
  idOs: string,
  opts: { soCategoria?: boolean; espelho?: OmieEspelho | null; previsao?: string | null; usuario?: string; soPPV?: string } = {},
): Promise<{ atualizados: string[] }> {
  const atualizados: string[] = [];
  const id = String(idOs || "").trim();
  if (!id) return { atualizados };

  const { data: osRows } = await supabase.from(TBL_OS).select("*").eq("Id_Ordem", id).limit(1);
  const os = osRows?.[0] as Record<string, unknown> | undefined;
  if (!os) return { atualizados };

  const categoria = categoriaPPVPelaOS(String(os.Tipo_Servico || ""));
  const previsao = String(opts.previsao || os.Previsao_Faturamento || "").slice(0, 10) || hojeSP();
  // espelho: o que acabou de ser salvo; senão o do banco (coluna pode não existir ainda)
  const espRaw = opts.espelho || (os.Omie_Espelho as OmieEspelho | null | undefined) || null;
  const numParcelas = espRaw ? numParcelasDaOS(normalizarEspelho(espRaw, espelhoPadrao())) : null;

  // PPVs da OS: os da lista ID_PPV e os que apontam para ela (Id_Os)
  const lista = String(os.ID_PPV || "").split(",").map((s) => s.trim()).filter(Boolean);
  const { data: porOs } = await supabase.from("pedidos").select("id_pedido").eq("Id_Os", id);
  const ids = Array.from(new Set([...lista, ...((porOs || []) as { id_pedido: string }[]).map((p) => p.id_pedido)]))
    .filter((p) => !opts.soPPV || p === opts.soPPV);
  if (!ids.length) return { atualizados };

  const { data: peds } = await supabase.from("pedidos")
    .select("id_pedido, status, faturado_omie_em, categoria_pedido, previsao_faturamento, num_parcelas").in("id_pedido", ids);
  for (const p of (peds || []) as Record<string, unknown>[]) {
    if (p.faturado_omie_em || /cancel/i.test(String(p.status || ""))) continue;
    const patch: Record<string, unknown> = {};
    const logs: string[] = [];
    if (String(p.categoria_pedido || "") !== categoria) {
      patch.categoria_pedido = categoria;
      logs.push(`Categoria → ${categoria === "1.01.94" ? "Revenda de Peças Revisão" : "Revenda de Peças em Serviços Prestados"} (OS ${id} vinculada)`);
    }
    if (!opts.soCategoria) {
      if (String(p.previsao_faturamento || "").slice(0, 10) !== previsao) {
        patch.previsao_faturamento = previsao;
        logs.push(`Previsão de faturamento → ${previsao.split("-").reverse().join("/")} (igual à OS ${id})`);
      }
      if (numParcelas && String(p.num_parcelas || "") !== numParcelas) {
        patch.num_parcelas = numParcelas;
        logs.push(`Número de parcelas → ${rotuloNumParcelas(numParcelas)} (igual à OS ${id})`);
      }
    }
    if (!Object.keys(patch).length) continue;
    const { error } = await supabase.from("pedidos").update(patch).eq("id_pedido", String(p.id_pedido));
    if (error) { console.warn(`[ppv-sync-os] ${p.id_pedido}: ${error.message}`); continue; }
    atualizados.push(String(p.id_pedido));
    for (const l of logs) await registrarLog(String(p.id_pedido), l, opts.usuario || "Sistema").catch(() => {});
  }
  return { atualizados };
}
