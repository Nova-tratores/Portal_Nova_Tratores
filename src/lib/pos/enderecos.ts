import { supabase } from "./supabase";

export interface EnderecoOpcao {
  label: string;
  fonte: string;
  endereco: string;
}

/** Busca todos os endereços disponíveis para um cliente */
export async function buscarEnderecos(cnpj: string, enderecoOS: string, cidadeOS: string): Promise<EnderecoOpcao[]> {
  const enderecos: EnderecoOpcao[] = [];

  if (cnpj) {
    const cnpjLimpo = String(cnpj).replace(/\D/g, "");

    const { data: clienteOmie } = await supabase
      .from("portal_nt_clientes_PRINCIPAL")
      .select("endereco, cidade, bairro, cep, estado, numero, cnpj_cpf")
      .or(`cnpj_cpf.eq.${cnpjLimpo},cnpj_cpf.eq.${cnpj}`)
      .limit(1);

    if (clienteOmie && clienteOmie.length > 0) {
      const c = clienteOmie[0] as Record<string, string>;
      const parts = [c.endereco, c.numero, c.bairro, c.cidade, c.estado, c.cep].filter(Boolean);
      const end = parts.join(", ");
      if (end) enderecos.push({ label: "Omie", fonte: "Omie", endereco: end });
    }

    const { data: clienteManual } = await supabase
      .from("Clientes_Manuais")
      .select("Cli_Endereco, Cli_Cidade, Cli_Cpf_Cnpj")
      .or(`Cli_Cpf_Cnpj.eq.${cnpjLimpo},Cli_Cpf_Cnpj.eq.${cnpj}`)
      .limit(1);

    if (clienteManual && clienteManual.length > 0) {
      const c = clienteManual[0] as Record<string, string>;
      const end = [c.Cli_Endereco, c.Cli_Cidade].filter(Boolean).join(", ");
      if (end) enderecos.push({ label: "Cliente Manual", fonte: "Manual", endereco: end });
    }
  }

  if (enderecoOS || cidadeOS) {
    let end = "";
    if (enderecoOS && cidadeOS && enderecoOS.toLowerCase().includes(cidadeOS.toLowerCase().replace(/\s*\(.*\)/, ''))) {
      end = enderecoOS;
    } else {
      end = [enderecoOS, cidadeOS].filter(Boolean).join(", ");
    }
    if (end) {
      const jaTem = enderecos.some(e => e.endereco.toLowerCase() === end.toLowerCase());
      if (!jaTem) enderecos.push({ label: "OS", fonte: "OS", endereco: end });
    }
  }

  return enderecos;
}
