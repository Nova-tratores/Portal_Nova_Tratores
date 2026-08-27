import { NextRequest, NextResponse } from "next/server";
import { supabaseFetch } from "@/lib/ppv/supabase";
import { TBL_CLIENTES } from "@/lib/ppv/constants";
import { buscaTermoSchema } from "@/lib/ppv/schemas";
import type { ClienteBusca } from "@/lib/ppv/types";

export async function GET(req: NextRequest) {
  const termo = req.nextUrl.searchParams.get("termo") || "";
  const parsed = buscaTermoSchema.safeParse({ termo });
  if (!parsed.success) return NextResponse.json([]);

  // Tira acento do termo: o cadastro vem do Omie sem acento (ex.: "JOSE ADILSON"),
  // então buscar "José" precisa virar "Jose" pra casar no ilike (que não ignora acento).
  const termoSemAcento = parsed.data.termo.normalize("NFD").replace(/[̀-ͯ]/g, "");
  const query = encodeURIComponent(termoSemAcento.replace(/ /g, "%"));
  const resultados: ClienteBusca[] = [];

  try {
    const res = await supabaseFetch<Record<string, unknown>[]>(
      // inativo=not.is.true → esconde os inativos do Omie, mas mantém os que ainda
      // não têm o flag (null) — pra não sumir com ninguém antes do 1º re-sync.
      `${TBL_CLIENTES}?or=(nome_fantasia.ilike.*${query}*,razao_social.ilike.*${query}*,cnpj_cpf.ilike.*${query}*)&inativo=not.is.true&select=*&limit=50`
    );
    res.forEach((row) => {
      const partes = [
        String(row.endereco || "").trim(),
        String(row.numero || "").trim(),
        String(row.bairro || "").trim(),
      ].filter(Boolean);
      resultados.push({
        nome: String(row.nome_fantasia || row.razao_social || "Sem Nome").trim(),
        razao: String(row.razao_social || "").trim(),
        fantasia: String(row.nome_fantasia || "").trim(),
        documento: String(row.cnpj_cpf || "").trim(),
        endereco: partes.join(", "),
        cidade: [String(row.cidade || "").trim(), String(row.estado || "").trim()].filter(Boolean).join(" - "),
        origem: "OMIE",
      });
    });
  } catch (e) {
    console.error("Erro busca Clientes:", e);
  }

  return NextResponse.json(resultados);
}
