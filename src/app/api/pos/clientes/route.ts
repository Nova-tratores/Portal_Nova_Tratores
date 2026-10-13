import { NextRequest, NextResponse } from "next/server";
import { supabase, supabaseFetchAll } from "@/lib/pos/supabase";
import { TBL_CLIENTES, TBL_CLIENTES_MANUAIS } from "@/lib/pos/constants";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");

  if (id) {
    const [tipo, clienteId] = id.split(":");
    const { data } = tipo === "OMIE"
      ? await supabase.from(TBL_CLIENTES).select("*").eq("id_omie", clienteId)
      : await supabase.from(TBL_CLIENTES_MANUAIS).select("*").eq("id", clienteId);

    if (data && data.length > 0) {
      const c = data[0];
      if (tipo === "OMIE") {
        const enderecoCompleto = [c.endereco, c.cidade].filter(Boolean).join(", ");
        return NextResponse.json({ nome: c.nome_fantasia || c.razao_social, cpf: c.cnpj_cpf || "", email: c.email || "", telefone: c.telefone || "", endereco: enderecoCompleto, cidade: c.cidade || "" });
      }
      return NextResponse.json({ nome: c.Cli_Nome, cpf: c.Cli_Cpf_Cnpj || "", email: c.Cli_Email || "", telefone: c.Cli_Fone || "", endereco: (c.Cli_Endereco || "") + (c.Cli_Cidade ? ", " + c.Cli_Cidade : ""), cidade: c.Cli_Cidade || "" });
    }
    return NextResponse.json({ nome: "Não encontrado" });
  }

  const listOmie = (await supabaseFetchAll<Record<string, string>>(TBL_CLIENTES))
    // Cliente INATIVO no Omie não aparece pra escolher (nem cria OS) — a
    // coluna é boolean hoje; "S" era o formato antigo
    .filter((c) => !["S", "TRUE"].includes(String(c.inativo ?? "").toUpperCase()))
    .map((c) => ({
      chave: "OMIE:" + (c.id_omie || c.id_cliente),
      display: (c.nome_fantasia || c.razao_social) + " [CNPJ/CPF: " + (c.cnpj_cpf || "---") + "] (OMIE)",
      razao: c.razao_social || "",
      fantasia: c.nome_fantasia || "",
      cnpj: c.cnpj_cpf || "",
      endereco: [c.endereco, c.bairro, c.cidade].filter(Boolean).join(", "),
    }));
  const listManual = (await supabaseFetchAll<Record<string, string>>(TBL_CLIENTES_MANUAIS)).map((c) => ({
    chave: "MANUAL:" + (c.id || c.id_cliente),
    display: (c.Cli_Nome || "Sem Nome") + " [CNPJ/CPF: " + (c.Cli_Cpf_Cnpj || "---") + "] (MANUAL)",
    razao: c.Cli_Nome || "",
    fantasia: "",
    cnpj: c.Cli_Cpf_Cnpj || "",
    endereco: [c.Cli_Endereco, c.Cli_Cidade].filter(Boolean).join(", "),
  }));

  const todos = juntarMesmoDocumento([...listOmie, ...listManual]).sort((a, b) => a.display.localeCompare(b.display));
  return NextResponse.json(todos);
}

type Opcao = { chave: string; display: string; razao: string; fantasia: string; cnpj: string; endereco: string; outrasChaves?: string[] };

// O mesmo cliente existe nas DUAS contas Omie (Nova e Castro — o Omie replica
// sozinho) e às vezes também como cliente manual: aparecia 2× no seletor.
// Fica UMA linha por CPF/CNPJ (Omie antes de manual; com endereço antes de
// sem); as chaves das outras vão em `outrasChaves` pra os lembretes gravados
// nelas continuarem aparecendo. Documento vazio/zerado não junta.
function juntarMesmoDocumento(lista: Opcao[]): Opcao[] {
  const nota = (o: Opcao) => (o.chave.startsWith("OMIE:") ? 2 : 0) + (o.endereco ? 1 : 0);
  const porDoc = new Map<string, Opcao>();
  const saida: Opcao[] = [];
  for (const o of lista) {
    const doc = o.cnpj.replace(/\D/g, "");
    if (!doc || /^0+$/.test(doc)) { saida.push(o); continue; }
    const atual = porDoc.get(doc);
    if (!atual) { porDoc.set(doc, o); continue; }
    const [fica, sai] = nota(o) > nota(atual) ? [o, atual] : [atual, o];
    porDoc.set(doc, { ...fica, outrasChaves: [...(fica.outrasChaves || []), sai.chave, ...(sai.outrasChaves || [])] });
  }
  return [...saida, ...porDoc.values()];
}
