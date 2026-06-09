import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

async function fetchAll<T>(table: string, select: string, filters?: (q: any) => any): Promise<T[]> {
  const all: T[] = [];
  const PAGE = 1000;
  let from = 0;
  let hasMore = true;
  while (hasMore) {
    let q = supabase.from(table).select(select).range(from, from + PAGE - 1);
    if (filters) q = filters(q);
    const { data } = await q;
    if (data && data.length > 0) {
      all.push(...(data as T[]));
      if (data.length < PAGE) hasMore = false;
      else from += PAGE;
    } else {
      hasMore = false;
    }
  }
  return all;
}

export async function GET(req: NextRequest) {
  const empresaFilter = req.nextUrl.searchParams.get("empresa");

  try {
    const projetos = await fetchAll<Record<string, any>>(
      "projetos_omie",
      "codigo, empresa, nome, inativo, cod_cli_ultimo, cliente_nome_ultimo, cnpj_cpf_ultimo"
    );

    // OS com projeto preenchido
    const osAll = await fetchAll<Record<string, any>>(
      "clientes_os",
      "num_os, cod_os, empresa, cod_cli, projeto, valor_total, status, faturada, cancelada, num_nf, link_nf, data_previsao, data_faturamento, cliente_nome, num_pedido_cli",
      (q: any) => q.not("projeto", "is", null).not("projeto", "eq", "")
    );

    // Agrupar OS por projeto|empresa
    const osPorProjEmp = new Map<string, any[]>();
    const allNumPedidos: string[] = [];
    for (const os of osAll) {
      const key = `${os.projeto}|${os.empresa}`;
      const arr = osPorProjEmp.get(key) || [];
      arr.push(os);
      osPorProjEmp.set(key, arr);
      if (os.num_pedido_cli && /^\d+$/.test(os.num_pedido_cli)) {
        allNumPedidos.push(os.num_pedido_cli);
      }
    }

    // Buscar PVs vinculados via num_pedido_cli
    const uniquePedidos = [...new Set(allNumPedidos)];
    const pvMap = new Map<string, any>();
    for (let i = 0; i < uniquePedidos.length; i += 200) {
      const batch = uniquePedidos.slice(i, i + 200);
      const { data } = await supabase.from("clientes_pv")
        .select("num_pedido, cod_pedido, empresa, cod_cli, valor_total, faturado, cancelado, numero_nf, link_nf, data_previsao, cliente_nome")
        .in("num_pedido", batch);
      for (const pv of data || []) {
        pvMap.set(`${pv.num_pedido}|${pv.empresa}`, pv);
      }
    }

    // Buscar clientes
    const allCodClis = [...new Set([
      ...projetos.map(p => p.cod_cli_ultimo),
      ...osAll.map(o => o.cod_cli),
    ].filter(Boolean))];
    const clienteMap = new Map<number, { nome: string; cnpj_cpf: string; cidade: string; estado: string }>();
    for (let i = 0; i < allCodClis.length; i += 200) {
      const batch = allCodClis.slice(i, i + 200);
      const { data } = await supabase.from("clientes_omie")
        .select("cod_cli, nome_fantasia, razao_social, cnpj_cpf, cidade, estado")
        .in("cod_cli", batch);
      for (const c of data || []) {
        clienteMap.set(c.cod_cli, {
          nome: c.nome_fantasia || c.razao_social || "",
          cnpj_cpf: c.cnpj_cpf || "",
          cidade: c.cidade || "",
          estado: c.estado || "",
        });
      }
    }

    // Montar resultado por projeto
    const resultado = projetos
      .filter(p => !empresaFilter || p.empresa === empresaFilter)
      .map(p => {
        const key = `${p.nome}|${p.empresa}`;
        const osProj = osPorProjEmp.get(key) || [];
        const osFaturadas = osProj.filter((o: any) => o.faturada && !o.cancelada);
        const osComNfServico = osFaturadas.filter((o: any) => o.num_nf || o.link_nf);
        const osSemNfServico = osFaturadas.filter((o: any) => !o.num_nf && !o.link_nf);
        const valorServicos = osProj.filter((o: any) => !o.cancelada).reduce((s: number, o: any) => s + (o.valor_total || 0), 0);

        // PVs vinculados a este projeto (via num_pedido_cli das OS)
        const pvsProj: any[] = [];
        const pvSeen = new Set<string>();
        for (const os of osProj) {
          if (os.num_pedido_cli && /^\d+$/.test(os.num_pedido_cli)) {
            const pvKey = `${os.num_pedido_cli}|${os.empresa}`;
            if (!pvSeen.has(pvKey)) {
              pvSeen.add(pvKey);
              const pv = pvMap.get(pvKey);
              if (pv) pvsProj.push(pv);
            }
          }
        }
        const pvsFaturados = pvsProj.filter(pv => pv.faturado && !pv.cancelado);
        const pvsComNf = pvsFaturados.filter((pv: any) => pv.numero_nf || pv.link_nf);
        const pvsSemNf = pvsFaturados.filter((pv: any) => !pv.numero_nf && !pv.link_nf);
        const valorPecas = pvsProj.filter((pv: any) => !pv.cancelado).reduce((s: number, pv: any) => s + (pv.valor_total || 0), 0);

        const cli = p.cod_cli_ultimo ? clienteMap.get(p.cod_cli_ultimo) : null;

        return {
          codigo: p.codigo,
          nome: p.nome,
          empresa: p.empresa,
          inativo: p.inativo === "S",
          cliente: {
            cod_cli: p.cod_cli_ultimo,
            nome: cli?.nome || p.cliente_nome_ultimo || "",
            cnpj_cpf: cli?.cnpj_cpf || p.cnpj_cpf_ultimo || "",
            cidade: cli?.cidade || "",
            estado: cli?.estado || "",
          },
          // OS
          os_total: osProj.filter((o: any) => !o.cancelada).length,
          os_faturadas: osFaturadas.length,
          os_canceladas: osProj.filter((o: any) => o.cancelada).length,
          // NFs Servico
          nf_servico: osComNfServico.length,
          nf_servico_pendente: osSemNfServico.length,
          valor_servicos: valorServicos,
          nfs_servico: osComNfServico.map((o: any) => ({
            num_os: o.num_os, numero_nf: o.num_nf || "", link: o.link_nf || "",
            valor: o.valor_total || 0, data: o.data_faturamento || o.data_previsao || "",
            cliente: o.cliente_nome || "",
          })),
          nfs_servico_pendentes: osSemNfServico.map((o: any) => ({
            num_os: o.num_os, valor: o.valor_total || 0,
            data: o.data_faturamento || o.data_previsao || "", cliente: o.cliente_nome || "",
          })),
          // PVs / NFs Peca
          pv_total: pvsProj.filter((pv: any) => !pv.cancelado).length,
          pv_faturados: pvsFaturados.length,
          nf_peca: pvsComNf.length,
          nf_peca_pendente: pvsSemNf.length,
          valor_pecas: valorPecas,
          nfs_peca: pvsComNf.map((pv: any) => ({
            num_pedido: pv.num_pedido, numero_nf: pv.numero_nf || "", link: pv.link_nf || "",
            valor: pv.valor_total || 0, data: pv.data_previsao || "",
            cliente: pv.cliente_nome || "",
          })),
          nfs_peca_pendentes: pvsSemNf.map((pv: any) => ({
            num_pedido: pv.num_pedido, valor: pv.valor_total || 0,
            data: pv.data_previsao || "", cliente: pv.cliente_nome || "",
          })),
          // Total
          valor_total: valorServicos + valorPecas,
        };
      });

    // Agrupar por cliente
    const porCliente = new Map<string, typeof resultado>();
    for (const p of resultado) {
      const cliKey = p.cliente.cod_cli ? `${p.cliente.cod_cli}|${p.empresa}` : `sem-cliente|${p.empresa}`;
      const arr = porCliente.get(cliKey) || [];
      arr.push(p);
      porCliente.set(cliKey, arr);
    }

    const clientesComProjetos = Array.from(porCliente.entries()).map(([, projs]) => {
      const primeiro = projs[0];
      return {
        cliente: primeiro.cliente,
        empresa: primeiro.empresa,
        projetos: projs.sort((a, b) => b.valor_total - a.valor_total),
        totais: {
          projetos: projs.length,
          os_total: projs.reduce((s, p) => s + p.os_total, 0),
          os_faturadas: projs.reduce((s, p) => s + p.os_faturadas, 0),
          nf_servico: projs.reduce((s, p) => s + p.nf_servico, 0),
          nf_servico_pendente: projs.reduce((s, p) => s + p.nf_servico_pendente, 0),
          valor_servicos: projs.reduce((s, p) => s + p.valor_servicos, 0),
          pv_total: projs.reduce((s, p) => s + p.pv_total, 0),
          nf_peca: projs.reduce((s, p) => s + p.nf_peca, 0),
          nf_peca_pendente: projs.reduce((s, p) => s + p.nf_peca_pendente, 0),
          valor_pecas: projs.reduce((s, p) => s + p.valor_pecas, 0),
          valor_total: projs.reduce((s, p) => s + p.valor_total, 0),
        },
      };
    });

    clientesComProjetos.sort((a, b) => b.totais.valor_total - a.totais.valor_total);

    return NextResponse.json({
      total_projetos: resultado.length,
      total_clientes: clientesComProjetos.length,
      clientes: clientesComProjetos,
      todos_projetos: resultado.sort((a, b) => b.valor_total - a.valor_total),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
