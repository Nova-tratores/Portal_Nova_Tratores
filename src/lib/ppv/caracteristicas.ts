import { supabaseFetch, getValorInsensivel } from "./supabase";
import { TBL_PRODUTOS } from "./constants";
import { contaOmie } from "@/lib/omie/contas";

// As características (#PRATELEIRA, #ANDAR, #CAIXA, Tipo...) só vêm no ConsultarProduto
// do Omie (1 a 1). Buscamos sob demanda (poucos itens por pedido) e cacheamos na coluna
// Produtos_Completos.Caracteristicas pra não repetir.

const OMIE_URL = "https://app.omie.com.br/api/v1/geral/produtos/";
const ACCOUNTS: Record<string, { key: string; secret: string }> = {
  "Nova Tratores": contaOmie("Nova Tratores"),
  "Castro Peças": contaOmie("Castro Peças"),
};

interface Caract { cNomeCaract?: string; cConteudo?: string }

// Placeholder = produto sem localização (000, XXX, vazio) → não mostra
function ehPlaceholder(v: string): boolean {
  const s = v.trim();
  return !s || /^0+$/.test(s) || /^x+$/i.test(s) || /^-+$/.test(s);
}

function formatar(cars: Caract[]): string {
  return (cars || [])
    .map((c) => ({
      nome: (c.cNomeCaract || "").trim().replace(/[:\s]+$/, ""),  // tira ":" sobrando no nome (ex: "Tipo:")
      val: (c.cConteudo || "").trim(),
    }))
    .filter((c) => c.nome && !ehPlaceholder(c.val))
    .map((c) => `${c.nome}: ${c.val}`)
    .join("  •  ");
}

async function consultarOmie(idOmie: number, empresa: string): Promise<string> {
  const acc = ACCOUNTS[empresa] || ACCOUNTS["Castro Peças"];
  try {
    const res = await fetch(OMIE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ call: "ConsultarProduto", app_key: acc.key, app_secret: acc.secret, param: [{ codigo_produto: idOmie }] }),
    });
    const d = await res.json();
    if (d?.faultstring) return "";
    return Array.isArray(d?.caracteristicas) ? formatar(d.caracteristicas) : "";
  } catch { return ""; }
}

// Mapa codigo → string de características (usa cache; busca no Omie só os ainda não buscados)
export async function buscarCaracteristicas(codigos: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const unicos = [...new Set(codigos.map((c) => String(c)).filter(Boolean))];
  if (unicos.length === 0) return out;

  const filter = unicos.map((c) => `Codigo_Produto.eq.${encodeURIComponent(c)}`).join(",");
  const rows = await supabaseFetch<Record<string, unknown>[]>(
    `${TBL_PRODUTOS}?or=(${filter})&select=Codigo_Produto,id_omie,Empresa,Caracteristicas`
  ).catch(() => []);

  // 1 linha por código — prioriza a que já tem características cacheadas
  const porCod: Record<string, Record<string, unknown>> = {};
  for (const r of rows || []) {
    const cod = String(getValorInsensivel(r, "Codigo_Produto") || "");
    if (!cod) continue;
    if (!porCod[cod] || getValorInsensivel(r, "Caracteristicas") != null) porCod[cod] = r;
  }

  for (const cod of unicos) {
    const r = porCod[cod];
    if (!r) { out[cod] = ""; continue; }
    const cache = getValorInsensivel(r, "Caracteristicas");
    if (cache != null) { out[cod] = String(cache); continue; }   // já buscado (mesmo que vazio)

    const idOmie = Number(getValorInsensivel(r, "id_omie") || 0);
    const empresa = String(getValorInsensivel(r, "Empresa") || "");
    if (!idOmie) { out[cod] = ""; continue; }

    const car = await consultarOmie(idOmie, empresa);
    out[cod] = car;
    // cacheia (best-effort, não bloqueia)
    supabaseFetch(`${TBL_PRODUTOS}?id_omie=eq.${idOmie}`, "PATCH", { Caracteristicas: car }).catch(() => {});
  }
  return out;
}
