import { supabaseAdmin } from "@/lib/server/supabase-admin";

// "Informações Pasta Cliente": o que a equipe anota sobre o cliente no portal —
// etiquetas e observação da pasta (por CNPJ) e lembretes do POS. Lido pela
// pasta e pela ficha do contato no NovaZap (Chatwoot). Só servidor.
//
// O mesmo CNPJ pode ter cadastro na Nova e na Castro com códigos Omie
// diferentes; lembrete do POS guarda o CNPJ (só dígitos, às vezes vários
// separados por vírgula) E as chaves "OMIE:<cod>" — mas há lembrete sem CNPJ,
// só com a chave. Por isso busca pelos dois.

export type Etiqueta = { id: number; nome: string; cor: string };
export type Lembrete = {
  id: number; lembrete: string; criado_por: string | null; created_at: string
  concluido: boolean; concluido_por?: string | null; concluido_em?: string | null; concluido_em_ordem?: string | null
};
export type InfoPasta = { cnpj: string; codigos: string[]; etiquetas: Etiqueta[]; observacao: string; lembretes: Lembrete[] };

/** CNPJ/CPF com a máscara que o cadastro do Omie usa. */
export function mascararDocumento(doc: string): string {
  if (doc.length === 14) return doc.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (doc.length === 11) return doc.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return doc;
}

/** Todos os códigos Omie (Nova e Castro) do mesmo CNPJ/CPF. */
export async function codigosDoDocumento(doc: string): Promise<string[]> {
  if (doc.length < 11) return [];
  const { data } = await supabaseAdmin
    .from("portal_nt_clientes_cadastro_omie")
    .select("cod_cli, cnpj_cpf")
    .in("cnpj_cpf", [doc, mascararDocumento(doc)]);
  return [...new Set((data || [])
    .filter(c => String(c.cnpj_cpf || "").replace(/\D/g, "") === doc && c.cod_cli)
    .map(c => String(c.cod_cli)))];
}

/** CNPJ/CPF (só dígitos) de um código Omie. */
export async function documentoDoCodigo(cod: string, empresa?: string): Promise<string> {
  let q = supabaseAdmin.from("portal_nt_clientes_cadastro_omie").select("cnpj_cpf").eq("cod_cli", cod).limit(1);
  if (empresa) q = q.eq("empresa", empresa);
  const { data } = await q.maybeSingle();
  return String(data?.cnpj_cpf || "").replace(/\D/g, "");
}

export async function infoPastaCliente(entrada: { cnpj?: string | null; cod?: string | null; empresa?: string | null }): Promise<InfoPasta> {
  let doc = String(entrada.cnpj || "").replace(/\D/g, "");
  const cod = String(entrada.cod || "").trim();
  if (!doc && cod) doc = await documentoDoCodigo(cod, entrada.empresa || undefined);

  const codigos = new Set(await codigosDoDocumento(doc));
  if (cod) codigos.add(cod);

  // lembretes: CNPJ (campo de texto, pode ter vários) OU qualquer chave do cliente
  const filtros: string[] = [];
  if (doc) filtros.push(`cliente_cnpj_cpf.ilike.*${doc}*`);
  if (codigos.size) filtros.push(`cliente_chaves.ov.{${[...codigos].map(c => `OMIE:${c}`).join(",")}}`);

  const [vinculos, extras, lembretes] = await Promise.all([
    doc ? supabaseAdmin.from("cliente_etiqueta_map").select("cliente_etiquetas(id, nome, cor)").eq("cnpj_cpf", doc) : Promise.resolve({ data: [] }),
    doc ? supabaseAdmin.from("cliente_extras").select("descricao").eq("cnpj_cpf", doc).maybeSingle() : Promise.resolve({ data: null }),
    filtros.length
      ? supabaseAdmin.from("lembretes_clientes").select("*").or(filtros.join(",")).neq("ativo", false).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);

  const etiquetas = ((vinculos.data || []) as { cliente_etiquetas: Etiqueta | Etiqueta[] | null }[])
    .flatMap(v => (Array.isArray(v.cliente_etiquetas) ? v.cliente_etiquetas : v.cliente_etiquetas ? [v.cliente_etiquetas] : []));

  return {
    cnpj: doc,
    codigos: [...codigos],
    etiquetas,
    observacao: String((extras.data as { descricao?: string } | null)?.descricao || "").trim(),
    lembretes: (lembretes.data || []) as Lembrete[],
  };
}
