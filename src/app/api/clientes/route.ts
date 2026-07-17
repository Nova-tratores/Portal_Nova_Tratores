import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// A pasta do cliente precisa SEMPRE ler dados frescos do banco — sem o cache de
// fetch/rota do Next (que deixava o detalhe mostrando dado velho, ex. vendedor).
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

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

      // Buscar PVs vinculados (via num_pedido_cli das OS). O campo pode vir
      // numérico puro (PV), "REM XXXX" (remessa) ou "CASTRO 4090"/"3681 CASTRO"
      // (peça comprada na Castro). Como a Castro tem PV com o MESMO número de
      // outra empresa, o vínculo casa por num_pedido + empresa.
      const pedidoPares = (ordens || []).map(o => {
        const ref = String(o.num_pedido_cli || '').trim();
        const remM = ref.match(/^REM\s*(\d+)$/i);
        const num = remM ? remM[1] : (ref.match(/\d+/g) || []).join("");
        if (!num) return null;
        return { num, empresa: /castro/i.test(ref) ? "Castro Pecas" : o.empresa };
      }).filter(Boolean) as { num: string; empresa: string }[];
      const numPedidos = [...new Set(pedidoPares.map(p => p.num))];

      let pedidos: any[] = [];
      if (numPedidos.length > 0) {
        const { data: pvs } = await supabase
          .from("portal_nt_clientes_pv")
          .select("*")
          .in("num_pedido", numPedidos);
        const querer = new Set(pedidoPares.map(p => `${p.num}|${p.empresa}`));
        pedidos = (pvs || []).filter((pv: any) => querer.has(`${pv.num_pedido}|${pv.empresa}`));
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

      // -------- Enriquecer com o FINANCEIRO (boleto + NFs) e o PDF do POS/PPV --------
      const osNums = [...new Set((ordens || []).map((o: any) => String(o.num_os)).filter(Boolean))];
      const pvNums = [...new Set(todosPVs.map((p: any) => String(p.num_pedido)).filter(Boolean))];
      let cards: any[] = [];
      if (osNums.length || pvNums.length) {
        const ors: string[] = [];
        if (osNums.length) ors.push(`omie_num_os.in.(${osNums.join(",")})`);
        if (pvNums.length) ors.push(`omie_num_pedido.in.(${pvNums.join(",")})`);
        const { data: ch } = await supabase
          .from("Chamado_NF")
          .select("id, omie_num_os, omie_num_pedido, omie_empresa, anexo_boleto, anexo_nf_servico, anexo_nf_peca, num_nf_servico, num_nf_peca, status, valor_servico, setor_destino, created_at")
          .or(ors.join(","));
        cards = ch || [];
      }
      const cardPorOS = new Map<string, any>();
      const cardPorPV = new Map<string, any>();
      for (const c of cards) {
        if (c.omie_num_os) cardPorOS.set(String(c.omie_num_os), c);
        if (c.omie_num_pedido) cardPorPV.set(String(c.omie_num_pedido), c);
      }

      // -------- Mapear o POS (Ordem_Servico_Tecnicos) e o PPV (pedidos) ORIGINAIS --------
      // Toda OS/PV do Omie nasceu de um POS/PPV no portal. Linkamos o documento real
      // (não a remontagem do /api/clientes/print) via Ordem_Omie / pedido_omie.
      const posPorOS = new Map<string, string>(); // num_os -> Id_Ordem
      const ppvPorPV = new Map<string, string>(); // num_pedido -> id_pedido
      if (osNums.length) {
        const { data: poss } = await supabase
          .from("Ordem_Servico_Tecnicos")
          .select("Id_Ordem, Ordem_Omie")
          .in("Ordem_Omie", osNums);
        for (const p of poss || []) {
          if (p.Ordem_Omie != null) posPorOS.set(String(p.Ordem_Omie), String(p.Id_Ordem));
        }
      }
      if (pvNums.length) {
        const { data: peds } = await supabase
          .from("pedidos")
          .select("id_pedido, pedido_omie")
          .in("pedido_omie", pvNums);
        for (const p of peds || []) {
          if (p.pedido_omie != null) ppvPorPV.set(String(p.pedido_omie), String(p.id_pedido));
        }
      }

      const fin = (c: any) => c ? {
        id: c.id || null,
        boleto: c.anexo_boleto || null,
        nf_servico: c.anexo_nf_servico || null,
        nf_peca: c.anexo_nf_peca || null,
        num_nf_servico: c.num_nf_servico || null,
        num_nf_peca: c.num_nf_peca || null,
        status: c.status || null,
        valor: c.valor_servico || null,
        categoria: c.setor_destino === "pecas" ? "Peças" : "Oficina",
        criado_em: c.created_at || null,
      } : null;
      // Links SEM origin (relativos). Usar req.nextUrl.origin aqui gerava
      // "http://localhost:8080/..." em produção — no Railway o app roda atrás de um
      // proxy na porta interna 8080, então o origin da request é o interno, não o público.
      // Relativo, o próprio navegador resolve no domínio certo.
      const reconstrOS = (o: any) => o.cod_os ? `/api/clientes/print?tipo=os&cod=${o.cod_os}&empresa=${encodeURIComponent(empresa)}` : null;
      const reconstrPV = (p: any) => p.cod_pedido ? `/api/clientes/print?tipo=pv&cod=${p.cod_pedido}&empresa=${encodeURIComponent(p.empresa || empresa)}` : null;
      const ordensEnr = (ordens || []).map((o: any) => {
        const idOrdem = posPorOS.get(String(o.num_os)) || null;
        return {
          ...o,
          financeiro: fin(cardPorOS.get(String(o.num_os))),
          // documento REAL do POS quando existe; senão a remontagem do Omie
          pos_id: idOrdem,
          pos_pdf: idOrdem ? `/api/pos/ordens/${idOrdem}/print` : reconstrOS(o),
          pos_real: !!idOrdem,
        };
      });
      const pvsEnr = todosPVs.map((p: any) => {
        const idPedido = ppvPorPV.get(String(p.num_pedido)) || null;
        return {
          ...p,
          financeiro: fin(cardPorPV.get(String(p.num_pedido))),
          // documento REAL do PPV quando existe; senão a remontagem do Omie
          ppv_id: idPedido,
          pv_pdf: idPedido ? `/api/ppv/pdf?id=${idPedido}` : reconstrPV(p),
          ppv_real: !!idPedido,
        };
      });

      return NextResponse.json({
        cliente,
        ordens: ordensEnr,
        pedidos: pvsEnr,
      });
    }

    // -------- Lista de clientes com ranking + projetos --------
    const osCounts = await fetchAll<{ cod_cli: number; empresa: string; valor_total: number; cancelada: boolean; faturada: boolean; data_faturamento: string | null }>(
      "portal_nt_clientes_os", "cod_cli, empresa, valor_total, cancelada, faturada, data_faturamento"
    );

    // Agrupar por cod_cli + empresa
    const ranking = new Map<string, { cod_cli: number; empresa: string; total_os: number; total_valor: number; os_ativas: number; ultimo_faturamento: string | null }>();
    for (const os of osCounts) {
      const key = `${os.cod_cli}|${os.empresa}`;
      const entry = ranking.get(key) || {
        cod_cli: os.cod_cli,
        empresa: os.empresa,
        total_os: 0,
        total_valor: 0,
        os_ativas: 0,
        ultimo_faturamento: null as string | null,
      };
      entry.total_os++;
      entry.total_valor += os.valor_total || 0;
      if (!os.cancelada) entry.os_ativas++;
      // Última data de faturamento (mais recente) — só OS faturadas e não canceladas
      if (os.faturada && !os.cancelada && os.data_faturamento) {
        if (!entry.ultimo_faturamento || os.data_faturamento > entry.ultimo_faturamento) {
          entry.ultimo_faturamento = os.data_faturamento;
        }
      }
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
        ultimo_faturamento: rank?.ultimo_faturamento || null,
        projetos,
      };
    });

    // Ordena pelo faturamento mais recente (cliente faturado mais recentemente no topo).
    // Quem nunca faturou vai pro fim, desempatando por nº de OS.
    resultado.sort((a, b) => {
      if (a.ultimo_faturamento && b.ultimo_faturamento) {
        if (a.ultimo_faturamento !== b.ultimo_faturamento) return a.ultimo_faturamento > b.ultimo_faturamento ? -1 : 1;
        return b.total_os - a.total_os;
      }
      if (a.ultimo_faturamento) return -1;
      if (b.ultimo_faturamento) return 1;
      return b.total_os - a.total_os;
    });

    return NextResponse.json({ clientes: resultado });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
