import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

async function fetchAll<T>(table: string, select: string, filters?: (q: any) => any): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    let q = supabase.from(table).select(select).range(from, from + PAGE - 1);
    if (filters) q = filters(q);
    const { data } = await q;
    if (!data || data.length === 0) break;
    all.push(...(data as T[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

export async function POST() {
  let clientesVinculados = 0;
  let projetosVinculados = 0;

  // 1. Buscar mapa CNPJ → cod_cli (Clientes)
  const clientes = await fetchAll<{ id_omie: string; cnpj_cpf: string }>(
    "portal_nt_clientes_PRINCIPAL", "id_omie, cnpj_cpf"
  );
  const cnpjToCliente: Record<string, number> = {};
  for (const c of clientes) {
    const cnpj = (c.cnpj_cpf || "").replace(/\D/g, "");
    if (cnpj) cnpjToCliente[cnpj] = Number(c.id_omie);
  }

  // 2. Buscar mapa num_nf → projeto (via clientes_os)
  const osComNf = await fetchAll<{ num_nf: string; projeto: string; empresa: string }>(
    "portal_nt_clientes_os", "num_nf, projeto, empresa",
    (q: any) => q.not("num_nf", "is", null).neq("num_nf", "").not("projeto", "is", null).neq("projeto", "")
  );
  // Buscar codigo do projeto pelo nome
  const projetos = await fetchAll<{ codigo: number; nome: string; empresa: string }>(
    "portal_nt_projetos_PRINCIPAL", "codigo, nome, empresa"
  );
  const projetoMap: Record<string, number> = {};
  for (const p of projetos) {
    projetoMap[`${p.nome}|${p.empresa}`] = p.codigo;
  }

  const nfToProjeto: Record<string, number> = {};
  for (const os of osComNf) {
    const nfNum = (os.num_nf || "").replace(/^0+/, "");
    if (!nfNum) continue;
    const projCod = projetoMap[`${os.projeto}|${os.empresa}`];
    if (projCod) nfToProjeto[`${nfNum}|${os.empresa}`] = projCod;
  }

  // 3. Buscar NFs sem vínculo
  const nfsSemCliente = await fetchAll<{ id: number; numero_nf: string; serie: string; empresa: string; tipo_nf: string; cnpj_emitente: string; cnpj_destinatario: string }>(
    "portal_nt_notas_fiscais_PRINCIPAL",
    "id, numero_nf, serie, empresa, tipo_nf, cnpj_emitente, cnpj_destinatario",
    (q: any) => q.is("cliente_cod_omie", null)
  );

  // Vincular clientes
  for (const nf of nfsSemCliente) {
    // Saída: destinatário é o cliente
    // Entrada: emitente é o fornecedor (pode ser cliente em caso de devolução/troca)
    const cnpjAlvo = nf.tipo_nf === "saida" ? nf.cnpj_destinatario : nf.cnpj_emitente;
    const codCli = cnpjAlvo ? cnpjToCliente[cnpjAlvo] : undefined;
    if (codCli) {
      const { error } = await supabase
        .from("portal_nt_notas_fiscais_PRINCIPAL")
        .update({ cliente_cod_omie: codCli })
        .eq("id", nf.id);
      if (!error) clientesVinculados++;
    }
  }

  // 4. Buscar NFs sem projeto
  const nfsSemProjeto = await fetchAll<{ id: number; numero_nf: string; empresa: string }>(
    "portal_nt_notas_fiscais_PRINCIPAL",
    "id, numero_nf, empresa",
    (q: any) => q.is("projeto_codigo", null)
  );

  for (const nf of nfsSemProjeto) {
    const projCod = nfToProjeto[`${nf.numero_nf}|${nf.empresa}`];
    if (projCod) {
      const { error } = await supabase
        .from("portal_nt_notas_fiscais_PRINCIPAL")
        .update({ projeto_codigo: projCod })
        .eq("id", nf.id);
      if (!error) projetosVinculados++;
    }
  }

  return NextResponse.json({
    ok: true,
    clientes_vinculados: clientesVinculados,
    projetos_vinculados: projetosVinculados,
    total_nfs_sem_cliente: nfsSemCliente.length,
    total_nfs_sem_projeto: nfsSemProjeto.length,
  });
}
