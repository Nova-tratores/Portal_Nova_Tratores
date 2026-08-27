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
    // Cliente INATIVO no Omie não aparece pra escolher (nem cria OS)
    .filter((c) => String(c.inativo || "").toUpperCase() !== "S")
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

  const todos = [...listOmie, ...listManual].sort((a, b) => a.display.localeCompare(b.display));
  return NextResponse.json(todos);
}
