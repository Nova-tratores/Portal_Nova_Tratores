import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

// Supabase retorna no máximo 1000 rows por query — paginar para pegar tudo
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
  const codCli = req.nextUrl.searchParams.get("codCli");
  const empresa = req.nextUrl.searchParams.get("empresa");
  const checkSync = req.nextUrl.searchParams.get("checkSync");

  try {
    // -------- Check last sync timestamp --------
    if (checkSync) {
      const { data } = await supabase
        .from("portal_nt_clientes_cadastro_omie")
        .select("updated_at")
        .order("updated_at", { ascending: false })
        .limit(1);
      return NextResponse.json({ lastSync: data?.[0]?.updated_at || null });
    }

    // -------- Detalhe de um cliente --------
    if (codCli && empresa) {
      // Info do cliente
      const { data: cliente } = await supabase
        .from("portal_nt_clientes_cadastro_omie")
        .select("*")
        .eq("cod_cli", codCli)
        .eq("empresa", empresa)
        .single();

      // Todas as OS do cliente
      const { data: ordens } = await supabase
        .from("portal_nt_clientes_os")
        .select("*")
        .eq("cod_cli", codCli)
        .eq("empresa", empresa)
        .order("data_previsao", { ascending: false });

      // Buscar PVs vinculados (via num_pedido_cli das OS)
      // Só buscar quando num_pedido_cli é puramente numérico (ex: "6561")
      // Ignorar textos como "Interno", "REM 3477", "Frota", "Montagem Implemento"
      const numPedidos = [...new Set(
        (ordens || []).map(o => o.num_pedido_cli).filter(v => v && /^\d+$/.test(v))
      )];

      let pedidos: any[] = [];
      if (numPedidos.length > 0) {
        const { data: pvs } = await supabase
          .from("portal_nt_clientes_pv")
          .select("*")
          .in("num_pedido", numPedidos);
        pedidos = pvs || [];
      }

      // Também buscar PVs diretamente pelo cod_cli em TODAS as empresas
      const pvsDiretos = await fetchAll<any>(
        "portal_nt_clientes_pv", "*",
        (q: any) => q.eq("cod_cli", codCli).order("data_previsao", { ascending: false })
      );

      // Merge PVs (sem duplicar — usar num_pedido+empresa como chave)
      const pvMap = new Map<string, any>();
      for (const pv of [...pedidos, ...pvsDiretos]) {
        pvMap.set(`${pv.num_pedido}|${pv.empresa}`, pv);
      }
      const todosPVs = Array.from(pvMap.values());

      return NextResponse.json({
        cliente,
        ordens: ordens || [],
        pedidos: todosPVs,
      });
    }

    // -------- Lista de clientes com ranking + projetos --------
    const osCounts = await fetchAll<{ cod_cli: number; empresa: string; valor_total: number; cancelada: boolean }>(
      "portal_nt_clientes_os", "cod_cli, empresa, valor_total, cancelada"
    );

    // Agrupar por cod_cli + empresa
    const ranking = new Map<string, { cod_cli: number; empresa: string; total_os: number; total_valor: number; os_ativas: number }>();
    for (const os of osCounts) {
      const key = `${os.cod_cli}|${os.empresa}`;
      const entry = ranking.get(key) || {
        cod_cli: os.cod_cli,
        empresa: os.empresa,
        total_os: 0,
        total_valor: 0,
        os_ativas: 0,
      };
      entry.total_os++;
      entry.total_valor += os.valor_total || 0;
      if (!os.cancelada) entry.os_ativas++;
      ranking.set(key, entry);
    }

    // Buscar projetos vinculados a clientes (da tabela projetos_omie)
    const allProjetos = await fetchAll<{
      nome: string; empresa: string; cod_cli_ultimo: number | null; cliente_nome_ultimo: string | null;
    }>("portal_nt_projetos_PRINCIPAL", "nome, empresa, cod_cli_ultimo, cliente_nome_ultimo",
      (q: any) => q.not("cod_cli_ultimo", "is", null)
    );

    // Agrupar: cod_cli+empresa -> lista de nomes de projetos
    const clienteProjetos = new Map<string, string[]>();
    for (const p of allProjetos) {
      if (!p.cod_cli_ultimo) continue;
      const key = `${p.cod_cli_ultimo}|${p.empresa}`;
      const arr = clienteProjetos.get(key) || [];
      arr.push(p.nome);
      clienteProjetos.set(key, arr);
    }

    // Buscar dados de todos os clientes
    const clientes = await fetchAll<{
      cod_cli: number; empresa: string; razao_social: string; nome_fantasia: string;
      cnpj_cpf: string; cidade: string; estado: string; telefone: string; email: string;
    }>("portal_nt_clientes_cadastro_omie", "cod_cli, empresa, razao_social, nome_fantasia, cnpj_cpf, cidade, estado, telefone, email");

    // Juntar ranking + projetos com dados do cliente
    const resultado = clientes.map(c => {
      const key = `${c.cod_cli}|${c.empresa}`;
      const rank = ranking.get(key);
      const projetos = clienteProjetos.get(key) || [];
      return {
        ...c,
        total_os: rank?.total_os || 0,
        total_valor: rank?.total_valor || 0,
        os_ativas: rank?.os_ativas || 0,
        projetos,
      };
    });

    resultado.sort((a, b) => b.total_os - a.total_os);

    return NextResponse.json({ clientes: resultado });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
