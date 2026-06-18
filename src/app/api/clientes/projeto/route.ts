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
      const { data } = await supabase.from("portal_nt_clientes_os")
        .select("num_os, cod_os, cod_cli, empresa, data_previsao, data_inclusao, data_faturamento, valor_total, status, faturada, cancelada, num_nf, link_nf, pdf_anexo, num_pedido_cli, vendedor, cidade, descricao, servicos")
        .eq("empresa", empresa).eq("projeto", nome)
        .order("data_previsao", { ascending: false })
        .range(from, from + PAGE - 1);
      if (data && data.length > 0) { osDoProj.push(...data); if (data.length < PAGE) hasMore = false; else from += PAGE; }
      else hasMore = false;
    }

    // Chassis do banco
    const { data: chassisDB } = await supabase.from("portal_nt_projetos_chassis")
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
      const { data } = await supabase.from("portal_nt_clientes_pv").select("*").in("num_pedido", numPedidos);
      pvs = data || [];
    }

    // Clientes envolvidos
    const codClis = [...new Set([...osDoProj.map(o => o.cod_cli), ...pvs.map(p => p.cod_cli)].filter(Boolean))];
    const clienteMap = new Map<number, any>();
    for (let i = 0; i < codClis.length; i += 200) {
      const batch = codClis.slice(i, i + 200);
      const { data } = await supabase.from("portal_nt_clientes_cadastro_omie")
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
      const { data: emails } = await supabase.from("portal_nt_projetos_emails")
        .select("*").in("chassis", allChassis).neq("uid", 0).order("data", { ascending: false });
      for (const e of emails || []) {
        if (!emailsPorChassis[e.chassis]) emailsPorChassis[e.chassis] = [];
        emailsPorChassis[e.chassis].push({
          ...e,
          anexos: typeof e.anexos === 'string' ? JSON.parse(e.anexos) : (e.anexos || []),
        });
      }
    }

    // ─── DONOS: clientes que tiveram OS/PV neste projeto, ordenados por data ───
    const donosMap = new Map<number, { cod_cli: number; nome: string; cnpj_cpf: string; cidade: string; estado: string; primeira_os: string; ultima_os: string; total_os: number; total_valor: number }>();
    for (const os of osDoProj) {
      const cli = clienteMap.get(os.cod_cli);
      const existing = donosMap.get(os.cod_cli);
      const dt = os.data_previsao || os.data_inclusao || "9999-99-99";
      if (existing) {
        existing.total_os++;
        existing.total_valor += (os.valor_total || 0);
        if (dt < existing.primeira_os) existing.primeira_os = dt;
        if (dt > existing.ultima_os) existing.ultima_os = dt;
      } else {
        donosMap.set(os.cod_cli, {
          cod_cli: os.cod_cli,
          nome: cli?.nome_fantasia || cli?.razao_social || "",
          cnpj_cpf: cli?.cnpj_cpf || "",
          cidade: cli?.cidade || "",
          estado: cli?.estado || "",
          primeira_os: dt, ultima_os: dt,
          total_os: 1, total_valor: os.valor_total || 0,
        });
      }
    }
    const donos = Array.from(donosMap.values()).sort((a, b) => b.ultima_os.localeCompare(a.ultima_os));

    // ─── SERVICOS: extraídos das OS ───
    const servicosLista: any[] = [];
    for (const os of osDoProj) {
      const servs = typeof os.servicos === 'string' ? JSON.parse(os.servicos) : (os.servicos || []);
      for (const s of servs) {
        servicosLista.push({
          num_os: os.num_os,
          data: os.data_previsao || os.data_inclusao || "",
          desc: s.desc || s.descricao || s.nome || "",
          valor: s.valor || s.valor_unitario || 0,
          quantidade: s.quantidade || 1,
          cliente: clienteMap.get(os.cod_cli)?.nome_fantasia || clienteMap.get(os.cod_cli)?.razao_social || "",
          status: os.status,
        });
      }
    }

    // ─── PECAS: itens dos PVs ───
    const pecasLista: any[] = [];
    for (const pv of pvs) {
      const itens = typeof pv.itens === 'string' ? JSON.parse(pv.itens) : (pv.itens || []);
      for (const it of itens) {
        pecasLista.push({
          num_pv: pv.num_pedido,
          data: pv.data_previsao || pv.data_inclusao || "",
          desc: it.descricao || it.desc || it.nome || "",
          codigo: it.codigo || it.cod || "",
          quantidade: it.quantidade || 1,
          valor_unitario: it.valor_unitario || it.preco || 0,
          valor_total: it.valor_total || (it.quantidade || 1) * (it.valor_unitario || it.preco || 0),
          cliente: clienteMap.get(pv.cod_cli)?.nome_fantasia || clienteMap.get(pv.cod_cli)?.razao_social || "",
        });
      }
    }

    // ─── REQUISICOES: por projeto OU pelo final do chassi mencionado ───
    // (principalmente no campo Chassis_Modelo, preenchido quando o tipo é "Trator-Cliente";
    //  também procura em obs e titulo). Marca como veio (projeto/chassi) e qual final bateu.
    const reqSelect = "id, titulo, tipo, solicitante, status, valor_despeza, created_at, obs, Chassis_Modelo, projeto_nome, projeto_codigo, fornecedor, numero_nota";
    const reqMap = new Map<number, any>();

    const { data: reqPorProj } = await supabase.from("Requisicao").select(reqSelect).eq("projeto_nome", nome);
    for (const r of reqPorProj || []) reqMap.set(r.id, { ...r, match: "projeto" });

    const finaisReq = [...new Set(allChassis.map((ch: string) => (ch || "").slice(-6)).filter((f: string) => f && f.length >= 5))];
    if (finaisReq.length > 0) {
      const cols = ["Chassis_Modelo", "obs", "titulo"];
      const orC = finaisReq.flatMap((f: string) => cols.map(c => `${c}.ilike.%${f}%`)).join(",");
      const { data: reqPorChassi } = await supabase.from("Requisicao").select(reqSelect).or(orC);
      for (const r of reqPorChassi || []) {
        const blob = `${r.Chassis_Modelo || ""} ${r.obs || ""} ${r.titulo || ""}`.toLowerCase();
        const finalBatido = finaisReq.find((f: string) => blob.includes(f.toLowerCase())) || "";
        const existente = reqMap.get(r.id);
        if (existente) existente.match_chassis = finalBatido;
        else reqMap.set(r.id, { ...r, match: "chassi", match_chassis: finalBatido });
      }
    }
    const requisicoes = Array.from(reqMap.values())
      .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));

    // ─── REVISOES: do banco tratores, matchando por chassis ───
    let revisoes: any[] = [];
    if (allChassis.length > 0) {
      const chassisFinals = allChassis.map(ch => ch.slice(-6)).filter(Boolean);
      if (chassisFinals.length > 0) {
        const { data: tratorData } = await supabase.from("tratores")
          .select("*")
          .or(allChassis.map(ch => `Chassis.ilike.%${ch.slice(-6)}`).join(","));
        revisoes = tratorData || [];
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
      donos,
      servicos: servicosLista,
      pecas: pecasLista,
      requisicoes,
      revisoes,
      resumo: {
        total_os: osDoProj.length,
        os_faturadas: osDoProj.filter(o => o.faturada).length,
        valor_total_os: valorTotalOS,
        total_pv: pvs.length,
        valor_total_pv: valorTotalPV,
        total_requisicoes: requisicoes.length,
        total_revisoes: revisoes.length,
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
