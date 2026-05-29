import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

function extractChassis(servicos: any): string[] {
  const servs = typeof servicos === 'string' ? JSON.parse(servicos) : (servicos || []);
  const r: string[] = [];
  for (const s of servs) { const m = (s.desc || '').match(/Chassis:\s*([^|]+)/i); if (m && m[1].trim()) r.push(m[1].trim()); }
  return r;
}

function extractModelo(servicos: any): string {
  const servs = typeof servicos === 'string' ? JSON.parse(servicos) : (servicos || []);
  for (const s of servs) { const m = (s.desc || '').match(/Modelo:\s*([^|]+)/i); if (m && m[1].trim()) return m[1].trim(); }
  return '';
}

// GET /api/clientes/projeto?nome=PROJETO&empresa=Nova Tratores
export async function GET(req: NextRequest) {
  const nome = req.nextUrl.searchParams.get("nome");
  const empresa = req.nextUrl.searchParams.get("empresa") || "Nova Tratores";

  if (!nome) return NextResponse.json({ error: "Passe ?nome=PROJETO&empresa=X" }, { status: 400 });

  try {
    // OS do projeto (do banco)
    const PAGE = 1000;
    let from = 0, hasMore = true;
    const osDoProj: any[] = [];
    while (hasMore) {
      const { data } = await supabase.from("clientes_os")
        .select("num_os, cod_os, cod_cli, empresa, data_previsao, data_inclusao, data_faturamento, valor_total, status, faturada, cancelada, num_nf, link_nf, num_pedido_cli, vendedor, cidade, descricao, servicos")
        .eq("empresa", empresa).eq("projeto", nome)
        .order("data_previsao", { ascending: false })
        .range(from, from + PAGE - 1);
      if (data && data.length > 0) { osDoProj.push(...data); if (data.length < PAGE) hasMore = false; else from += PAGE; }
      else hasMore = false;
    }

    // Chassis do banco
    const { data: chassisDB } = await supabase.from("projeto_chassis")
      .select("chassis, modelo, cod_cli_ultimo, cnpj_cpf_ultimo, cliente_nome_ultimo")
      .eq("projeto", nome).eq("empresa", empresa);

    // Se nao tem chassis no banco, extrair das OS
    let chassisList: any[] = (chassisDB || []).map(c => ({
      chassis: c.chassis, modelo: c.modelo,
      cod_cli: c.cod_cli_ultimo, cliente_nome: c.cliente_nome_ultimo || '', cnpj_cpf: c.cnpj_cpf_ultimo || '',
    }));

    if (chassisList.length === 0) {
      const chassisMap = new Map<string, { modelo: string; cod_cli: number; data: string }>();
      for (const os of osDoProj) {
        const chs = extractChassis(os.servicos);
        const mod = extractModelo(os.servicos);
        for (const ch of chs) {
          const ex = chassisMap.get(ch);
          const dt = os.data_previsao || "0000-00-00";
          if (!ex || dt > ex.data) chassisMap.set(ch, { modelo: mod, cod_cli: os.cod_cli, data: dt });
        }
      }
      chassisList = Array.from(chassisMap.entries()).map(([ch, info]) => ({
        chassis: ch, modelo: info.modelo, cod_cli: info.cod_cli, cliente_nome: '', cnpj_cpf: '',
      }));
    }

    // PVs vinculados (do banco)
    const numPedidos = [...new Set(osDoProj.map(o => o.num_pedido_cli).filter((v: string) => v && /^\d+$/.test(v)))];
    let pvs: any[] = [];
    if (numPedidos.length > 0) {
      const { data } = await supabase.from("clientes_pv").select("*").in("num_pedido", numPedidos);
      pvs = data || [];
    }

    // Clientes envolvidos
    const codClis = [...new Set([...osDoProj.map(o => o.cod_cli), ...pvs.map(p => p.cod_cli)].filter(Boolean))];
    const clienteMap = new Map<number, any>();
    for (let i = 0; i < codClis.length; i += 200) {
      const batch = codClis.slice(i, i + 200);
      const { data } = await supabase.from("clientes_omie")
        .select("cod_cli, razao_social, nome_fantasia, cnpj_cpf, cidade, estado")
        .eq("empresa", empresa).in("cod_cli", batch);
      for (const c of data || []) clienteMap.set(c.cod_cli, c);
    }

    // Preencher nome dos clientes nos chassis sem nome
    for (const ch of chassisList) {
      if (!ch.cliente_nome && ch.cod_cli) {
        const cli = clienteMap.get(ch.cod_cli);
        if (cli) { ch.cliente_nome = cli.nome_fantasia || cli.razao_social || ''; ch.cnpj_cpf = cli.cnpj_cpf || ''; }
      }
    }

    // NFs: montar a partir dos dados ja no banco (link_nf e num_nf)
    const notasFiscais: any[] = [];
    for (const os of osDoProj) {
      if (os.faturada && !os.cancelada && (os.num_nf || os.link_nf)) {
        notasFiscais.push({
          tipo: "NFS-e", origem: `Ordem de Servico ${os.num_os}`, numero: os.num_nf || '',
          link: os.link_nf || '', valor: os.valor_total || 0,
          data: os.data_faturamento || os.data_previsao || '',
          cliente: clienteMap.get(os.cod_cli)?.nome_fantasia || clienteMap.get(os.cod_cli)?.razao_social || '',
        });
      }
    }
    for (const pv of pvs) {
      if (pv.faturado && !pv.cancelado && (pv.numero_nf || pv.link_nf)) {
        notasFiscais.push({
          tipo: "NF-e", origem: `Pedido de Venda ${pv.num_pedido}`, numero: pv.numero_nf || '',
          link: pv.link_nf || '', valor: pv.valor_total || 0,
          data: pv.data_previsao || '',
          cliente: clienteMap.get(pv.cod_cli)?.nome_fantasia || clienteMap.get(pv.cod_cli)?.razao_social || '',
        });
      }
    }

    // Emails do chassis (do banco)
    const allChassis = chassisList.map(c => c.chassis);
    let emailsPorChassis: Record<string, any[]> = {};
    if (allChassis.length > 0) {
      const { data: emails } = await supabase.from("projeto_emails")
        .select("*").in("chassis", allChassis).neq("uid", 0).order("data", { ascending: false });
      for (const e of emails || []) {
        if (!emailsPorChassis[e.chassis]) emailsPorChassis[e.chassis] = [];
        emailsPorChassis[e.chassis].push({
          ...e,
          anexos: typeof e.anexos === 'string' ? JSON.parse(e.anexos) : (e.anexos || []),
        });
      }
    }

    const ultimoCliente = osDoProj[0] ? clienteMap.get(osDoProj[0].cod_cli) : null;
    const valorTotalOS = osDoProj.reduce((s, o) => s + (o.valor_total || 0), 0);
    const valorTotalPV = pvs.reduce((s: number, p: any) => s + (p.valor_total || 0), 0);

    return NextResponse.json({
      projeto: nome,
      empresa,
      ultimo_cliente: ultimoCliente ? {
        cod_cli: ultimoCliente.cod_cli,
        nome: ultimoCliente.nome_fantasia || ultimoCliente.razao_social,
        cnpj_cpf: ultimoCliente.cnpj_cpf,
      } : null,
      chassis: chassisList,
      emails_por_chassis: emailsPorChassis,
      resumo: {
        total_os: osDoProj.length,
        os_faturadas: osDoProj.filter(o => o.faturada).length,
        valor_total_os: valorTotalOS,
        total_pv: pvs.length,
        valor_total_pv: valorTotalPV,
      },
      ordens: osDoProj.map(os => ({
        ...os,
        cliente_nome: clienteMap.get(os.cod_cli)?.nome_fantasia || clienteMap.get(os.cod_cli)?.razao_social || "",
      })),
      pedidos_venda: pvs.map(pv => ({
        ...pv,
        cliente_nome: clienteMap.get(pv.cod_cli)?.nome_fantasia || clienteMap.get(pv.cod_cli)?.razao_social || "",
      })),
      notas_fiscais: notasFiscais,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
