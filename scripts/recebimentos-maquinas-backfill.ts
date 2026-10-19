// Preenche maquinas / qtd_maquinas / valor_maquinas nas linhas de recebimentos_nfe
// gravadas antes de o sync separar as máquinas pelo NCM (src/lib/estoque/recebimento-maquina.ts).
// Só lê `produtos` que já está no espelho — não chama a Omie. Linha que já tem
// `maquinas` (app legado) fica como está.
//
//   npx tsx --env-file=.env.local scripts/recebimentos-maquinas-backfill.ts            (simula)
//   npx tsx --env-file=.env.local scripts/recebimentos-maquinas-backfill.ts --gravar   (grava)
import { createClient } from "@supabase/supabase-js";
import { separarMaquinas } from "../src/lib/estoque/recebimento-maquina";

const GRAVAR = process.argv.includes("--gravar");
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const espera = (ms: number) => new Promise(r => setTimeout(r, ms));

type Linha = { id_receb: number; conta_omie: string; numero_nfe: string | null; fornecedor: string | null; status: string | null; maquinas: unknown; qtd_maquinas: number | null; produtos: unknown };

(async () => {
  console.log(GRAVAR ? "== GRAVANDO ==" : "== SIMULAÇÃO (use --gravar para gravar) ==");
  const mudar: Array<{ l: Linha; r: ReturnType<typeof separarMaquinas> }> = [];
  let lidas = 0;
  for (let de = 0; ; de += 1000) {
    const { data, error } = await supabase.from("recebimentos_nfe")
      .select("id_receb,conta_omie,numero_nfe,fornecedor,status,maquinas,qtd_maquinas,produtos")
      .order("id_receb").order("conta_omie").range(de, de + 999);
    if (error) throw new Error(error.message);
    const linhas = (data || []) as Linha[];
    lidas += linhas.length;
    for (const l of linhas) {
      if (Array.isArray(l.maquinas) && l.maquinas.length > 0) continue;
      const r = separarMaquinas(Array.isArray(l.produtos) ? l.produtos as Record<string, unknown>[] : []);
      if (r.qtd_maquinas > 0 && r.qtd_maquinas !== (l.qtd_maquinas || 0)) mudar.push({ l, r });
    }
    if (linhas.length < 1000) break;
  }
  const porStatus: Record<string, number> = {};
  let unidades = 0, valor = 0;
  for (const { l, r } of mudar) { porStatus[l.status || "?"] = (porStatus[l.status || "?"] || 0) + 1; unidades += r.qtd_maquinas; valor += r.valor_maquinas; }
  console.log(`lidas ${lidas} · a corrigir ${mudar.length} NFs · ${unidades} máquinas · R$ ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
  console.log("por status:", porStatus);
  for (const { l, r } of mudar.slice(0, 10)) console.log(" ", l.conta_omie, l.numero_nfe, l.status, r.qtd_maquinas, r.valor_maquinas, l.fornecedor);
  if (!GRAVAR) return;

  let ok = 0, falhas = 0;
  for (const { l, r } of mudar) {
    const { error } = await supabase.from("recebimentos_nfe")
      .update({ maquinas: r.maquinas, qtd_maquinas: r.qtd_maquinas, valor_maquinas: r.valor_maquinas })
      .eq("id_receb", l.id_receb).eq("conta_omie", l.conta_omie);
    if (error) { falhas++; console.log("falha", l.id_receb, error.message); } else ok++;
    await espera(60); // um por vez: o Supabase do portal já caiu com PATCH em paralelo
  }
  console.log(`gravadas ${ok} · falhas ${falhas}`);
})();
