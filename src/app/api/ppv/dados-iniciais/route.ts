import { NextResponse } from "next/server";
import { supabaseFetch, getValorInsensivel } from "@/lib/ppv/supabase";
import { TBL_TECNICOS, TBL_REVISOES } from "@/lib/ppv/constants";

export async function GET() {
  let tecnicos: string[] = [];
  const opcoesRevisao: Record<string, string[]> = {};

  try {
    const res = await supabaseFetch<Record<string, unknown>[]>(
      `${TBL_TECNICOS}?select=*`
    );
    tecnicos = res
      .map((t) => String(getValorInsensivel(t, "UsuNome", "Nome", "nome") || ""))
      .filter((n) => n && n !== "")
      .sort();
  } catch (e) {
    console.error("Erro tecnicos:", e);
  }

  try {
    const revs = await supabaseFetch<Record<string, unknown>[]>(
      `${TBL_REVISOES}?select=*`
    );
    revs.forEach((r) => {
      const m = String(getValorInsensivel(r, "Trator", "Cod_Trator", "Modelo") || "").trim();
      const h = String(getValorInsensivel(r, "Horas", "Horimetro") || "").trim();
      if (m && h) {
        if (!opcoesRevisao[m]) opcoesRevisao[m] = [];
        if (!opcoesRevisao[m].includes(h)) opcoesRevisao[m].push(h);
      }
    });
  } catch (e) {
    console.error("Erro revisoes:", e);
  }

  return NextResponse.json({ tecnicos, opcoesRevisao });
}
