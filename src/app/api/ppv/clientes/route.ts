import { NextRequest, NextResponse } from "next/server";
import { autenticar } from "@/lib/auth/server";
import { ehChamadaInterna } from "@/lib/auth/chamada-interna";
import { supabaseFetch } from "@/lib/ppv/supabase";
import { TBL_CLIENTES } from "@/lib/ppv/constants";
import { buscaTermoSchema } from "@/lib/ppv/schemas";
import type { ClienteBusca } from "@/lib/ppv/types";
import { padraoSemAcento, casaSemAcento } from "@/lib/ppv/busca-cliente";

// Busca de cliente usada em muitas telas (PPV, Orçamentos, catálogo/carrinho,
// Financeiro — chamado de NF e envio de boleto —, a página da etiqueta da peça
// /p/[id], que só garante a sessão) e pelo chat do Tratorilson no servidor.
// Por isso: login sem módulo OU chamada interna.
export async function GET(req: NextRequest) {
  if (!ehChamadaInterna(req.headers) && !(await autenticar(req))) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  const termo = req.nextUrl.searchParams.get("termo") || "";
  const parsed = buscaTermoSchema.safeParse({ termo });
  if (!parsed.success) return NextResponse.json([]);

  // Tira acento do termo: o cadastro vem do Omie sem acento (ex.: "JOSE ADILSON"),
  // então buscar "José" precisa virar "Jose" pra casar no ilike (que não ignora acento).
  const termoSemAcento = parsed.data.termo.normalize("NFD").replace(/[̀-ͯ]/g, "");
  const query = encodeURIComponent(termoSemAcento.replace(/ /g, "%"));
  const resultados: ClienteBusca[] = [];

  try {
    // inativo=not.is.true → esconde os inativos do Omie, mas mantém os que ainda
    // não têm o flag (null) — pra não sumir com ninguém antes do 1º re-sync.
    const filtro = (q: string) =>
      `${TBL_CLIENTES}?or=(nome_fantasia.ilike.*${q}*,razao_social.ilike.*${q}*,cnpj_cpf.ilike.*${q}*)&inativo=not.is.true&select=*`;
    // 2ª consulta para cadastro COM acento ("João" quando se digita "Joao"):
    // letra que pode ter acento vira "_" no ilike e o JS confere sem acento.
    const curinga = padraoSemAcento(termoSemAcento);
    const [diretos, comAcento] = await Promise.all([
      supabaseFetch<Record<string, unknown>[]>(`${filtro(query)}&limit=50`),
      curinga
        ? supabaseFetch<Record<string, unknown>[]>(`${filtro(encodeURIComponent(curinga))}&limit=300`).catch(() => [])
        : Promise.resolve([] as Record<string, unknown>[]),
    ]);
    const vistos = new Set<unknown>();
    const res = [...diretos, ...comAcento.filter((r) => casaSemAcento(r, termoSemAcento))].filter((r) => {
      const k = r.id ?? `${r.cnpj_cpf}|${r.razao_social}|${r.nome_fantasia}`;
      if (vistos.has(k)) return false;
      vistos.add(k);
      return true;
    }).slice(0, 50);
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
