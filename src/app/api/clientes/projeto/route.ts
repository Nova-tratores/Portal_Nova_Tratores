import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

const OMIE_BASE = "https://app.omie.com.br/api/v1";
interface OmieAccount { name: string; key: string; secret: string; }
const OMIE_ACCOUNTS: OmieAccount[] = [
  { name: "Nova Tratores", key: process.env.OMIE_APP_KEY || "2729522270475", secret: process.env.OMIE_APP_SECRET || "113d785bb86c48d064889d4d73348131" },
  { name: "Castro Pecas", key: "2730028269969", secret: "dc270bf5348b40d3ed1398ef70beb628" },
];
function getAccount(empresa: string) { return OMIE_ACCOUNTS.find(a => a.name === empresa) || OMIE_ACCOUNTS[0]; }

async function omieCall(endpoint: string, call: string, param: Record<string, unknown>, acc: OmieAccount) {
  const res = await fetch(`${OMIE_BASE}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ call, app_key: acc.key, app_secret: acc.secret, param: [param] }),
  });
  if (res.status === 429) { await new Promise(r => setTimeout(r, 60000)); return omieCall(endpoint, call, param, acc); }
  const data = await res.json().catch(() => ({}));
  if (data?.faultstring) {
    if (data.faultstring.includes("existem registros")) return {};
    throw new Error(data.faultstring);
  }
  return data;
}

function extractChassis(servicos: any): string[] {
  const servs = typeof servicos === 'string' ? JSON.parse(servicos) : (servicos || []);
  const result: string[] = [];
  for (const s of servs) {
    const m = (s.desc || '').match(/Chassis:\s*([^|]+)/i);
    if (m && m[1].trim()) result.push(m[1].trim());
  }
  return result;
}

function extractModelo(servicos: any): string {
  const servs = typeof servicos === 'string' ? JSON.parse(servicos) : (servicos || []);
  for (const s of servs) {
    const m = (s.desc || '').match(/Modelo:\s*([^|]+)/i);
    if (m && m[1].trim()) return m[1].trim();
  }
  return "";
}

// GET /api/clientes/projeto?nome=PROJETO&empresa=Nova Tratores
export async function GET(req: NextRequest) {
  const nome = req.nextUrl.searchParams.get("nome");
  const empresa = req.nextUrl.searchParams.get("empresa") || "Nova Tratores";

  if (!nome) return NextResponse.json({ error: "Passe ?nome=PROJETO&empresa=X" }, { status: 400 });

  try {
    const acc = getAccount(empresa);

    // Buscar codigo do projeto no Omie (se tabela existir)
    let codigoProjeto: number | null = null;
    try {
      const { data: projDB } = await supabase.from("projetos_omie")
        .select("codigo").eq("nome", nome).eq("empresa", empresa).limit(1).single();
      codigoProjeto = projDB?.codigo || null;
    } catch { /* tabela pode nao existir ainda */ }

    // Buscar todas as OS desse projeto no banco
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

    // Extrair chassis e modelos de todas as OS
    const chassisMap = new Map<string, { modelo: string; cod_cli: number; data: string }>();
    for (const os of osDoProj) {
      const chassis = extractChassis(os.servicos);
      const modelo = extractModelo(os.servicos);
      for (const ch of chassis) {
        const existing = chassisMap.get(ch);
        const dt = os.data_previsao || "0000-00-00";
        if (!existing || dt > existing.data) {
          chassisMap.set(ch, { modelo, cod_cli: os.cod_cli, data: dt });
        }
      }
    }

    // Buscar PVs vinculados via num_pedido_cli
    const numPedidos = [...new Set(osDoProj.map(o => o.num_pedido_cli).filter((v: string) => v && /^\d+$/.test(v)))];
    let pvsDosBanco: any[] = [];
    if (numPedidos.length > 0) {
      const { data } = await supabase.from("clientes_pv").select("*").in("num_pedido", numPedidos);
      pvsDosBanco = data || [];
    }

    // Buscar PVs do Omie filtrado por projeto (pode ter PVs nao vinculados a nenhuma OS)
    let pvsOmie: any[] = [];
    if (codigoProjeto) {
      try {
        let pag = 1, totPag = 1;
        while (pag <= totPag) {
          const r: any = await omieCall("/produtos/pedido/", "ListarPedidos", {
            pagina: pag, registros_por_pagina: 100,
            filtrar_por_projeto: codigoProjeto,
          }, acc);
          if (pag === 1) totPag = r?.total_de_paginas || 1;
          for (const pv of r?.pedido_venda_produto || []) {
            const cab = pv.cabecalho || {};
            const total = pv.total_pedido || {};
            const info = pv.infoCadastro || {};
            const frete = pv.frete || {};
            pvsOmie.push({
              num_pedido: cab.numero_pedido || "",
              cod_pedido: cab.codigo_pedido || 0,
              cod_cli: cab.codigo_cliente || 0,
              data_previsao: cab.data_previsao || "",
              data_inclusao: info.dInc || "",
              valor_total: total.valor_total_pedido || 0,
              etapa: cab.etapa || "",
              faturado: info.faturado === "S",
              cancelado: info.cancelado === "S",
              numero_nf: frete.numero_nota_fiscal || "",
              itens: (pv.det || []).map((d: any) => ({
                codigo: d.produto?.codigo || "",
                descricao: d.produto?.descricao || "",
                quantidade: d.produto?.quantidade || 0,
                valor_unitario: d.produto?.valor_unitario || 0,
                valor_total: d.produto?.valor_total || 0,
              })),
            });
          }
          pag++;
          if (pag <= totPag) await new Promise(r => setTimeout(r, 300));
        }
      } catch (e) {
        console.warn("[projeto] PVs Omie:", e instanceof Error ? e.message : e);
      }
    }

    // Merge PVs (banco + omie, sem duplicar)
    const pvMap = new Map<string, any>();
    for (const pv of pvsDosBanco) pvMap.set(pv.num_pedido, pv);
    for (const pv of pvsOmie) {
      if (!pvMap.has(pv.num_pedido)) pvMap.set(pv.num_pedido, pv);
    }
    const todosPVs = Array.from(pvMap.values());

    // Buscar clientes envolvidos
    const codClis = [...new Set([...osDoProj.map(o => o.cod_cli), ...todosPVs.map(p => p.cod_cli)].filter(Boolean))];
    const clienteMap = new Map<number, any>();
    for (let i = 0; i < codClis.length; i += 200) {
      const batch = codClis.slice(i, i + 200);
      const { data } = await supabase.from("clientes_omie")
        .select("cod_cli, razao_social, nome_fantasia, cnpj_cpf, cidade, estado")
        .eq("empresa", empresa).in("cod_cli", batch);
      for (const c of data || []) clienteMap.set(c.cod_cli, c);
    }

    // Ultimo cliente
    const ultimaOS = osDoProj[0];
    const ultimoCliente = ultimaOS ? clienteMap.get(ultimaOS.cod_cli) : null;

    // Chassis com info do cliente
    const chassisList = Array.from(chassisMap.entries()).map(([ch, info]) => {
      const cli = clienteMap.get(info.cod_cli);
      return {
        chassis: ch,
        modelo: info.modelo,
        cod_cli: info.cod_cli,
        cliente_nome: cli?.nome_fantasia || cli?.razao_social || "",
        cnpj_cpf: cli?.cnpj_cpf || "",
      };
    });

    // Buscar NFs de todas as OS faturadas (NFS-e via StatusOS)
    const notasFiscais: any[] = [];
    const osFaturadas = osDoProj.filter(o => o.faturada && !o.cancelada);
    for (const os of osFaturadas) {
      if (os.link_nf && os.num_nf) {
        notasFiscais.push({
          tipo: "NFS-e",
          origem: `Ordem de Servico ${os.num_os}`,
          numero: os.num_nf,
          link: os.link_nf,
          valor: os.valor_total || 0,
          data: os.data_faturamento || os.data_previsao || "",
          cliente: clienteMap.get(os.cod_cli)?.nome_fantasia || clienteMap.get(os.cod_cli)?.razao_social || "",
        });
        continue;
      }
      try {
        const st: any = await omieCall("/servicos/os/", "StatusOS", { nCodOS: os.cod_os }, acc);
        const nfseList: any[] = st?.ListaRpsNfse || [];
        if (nfseList.length > 0) {
          const nfse = nfseList[0];
          notasFiscais.push({
            tipo: "NFS-e",
            origem: `Ordem de Servico ${os.num_os}`,
            numero: nfse.nNfse || "",
            link: nfse.danfe || nfse.cUrlNfse || "",
            valor: os.valor_total || 0,
            data: os.data_faturamento || os.data_previsao || "",
            cliente: clienteMap.get(os.cod_cli)?.nome_fantasia || clienteMap.get(os.cod_cli)?.razao_social || "",
          });
        }
        await new Promise(r => setTimeout(r, 300));
      } catch { /* ignore */ }
    }

    // Buscar NFs de todos os PVs faturados (NF-e/DANFE via StatusPedido)
    const pvsFaturados = todosPVs.filter(p => p.faturado && !p.cancelado);
    for (const pv of pvsFaturados) {
      if (pv.link_nf && pv.numero_nf) {
        notasFiscais.push({
          tipo: "NF-e",
          origem: `Pedido de Venda ${pv.num_pedido}`,
          numero: pv.numero_nf,
          link: pv.link_nf,
          valor: pv.valor_total || 0,
          data: pv.data_previsao || "",
          cliente: clienteMap.get(pv.cod_cli)?.nome_fantasia || clienteMap.get(pv.cod_cli)?.razao_social || "",
        });
        continue;
      }
      try {
        const pvAcc = getAccount(pv.empresa || empresa);
        const st: any = await omieCall("/produtos/pedido/", "StatusPedido", { codigo_pedido: pv.cod_pedido }, pvAcc);
        const nfeList: any[] = st?.ListaNfe || [];
        if (nfeList.length > 0) {
          const nfe = nfeList[0];
          notasFiscais.push({
            tipo: "NF-e",
            origem: `Pedido de Venda ${pv.num_pedido}`,
            numero: nfe.numero_nfe || "",
            link: nfe.danfe || "",
            valor: pv.valor_total || 0,
            data: nfe.data_emissao || pv.data_previsao || "",
            cliente: clienteMap.get(pv.cod_cli)?.nome_fantasia || clienteMap.get(pv.cod_cli)?.razao_social || "",
          });
        }
        await new Promise(r => setTimeout(r, 300));
      } catch { /* ignore */ }
    }

    const valorTotalOS = osDoProj.reduce((s, o) => s + (o.valor_total || 0), 0);
    const valorTotalPV = todosPVs.reduce((s: number, p: any) => s + (p.valor_total || 0), 0);

    return NextResponse.json({
      projeto: nome,
      empresa,
      codigo_projeto: codigoProjeto,
      ultimo_cliente: ultimoCliente ? {
        cod_cli: ultimoCliente.cod_cli,
        nome: ultimoCliente.nome_fantasia || ultimoCliente.razao_social,
        cnpj_cpf: ultimoCliente.cnpj_cpf,
        cidade: ultimoCliente.cidade,
        estado: ultimoCliente.estado,
      } : null,
      chassis: chassisList,
      resumo: {
        total_os: osDoProj.length,
        os_faturadas: osDoProj.filter(o => o.faturada).length,
        valor_total_os: valorTotalOS,
        total_pv: todosPVs.length,
        valor_total_pv: valorTotalPV,
      },
      ordens: osDoProj.map(os => ({
        ...os,
        cliente_nome: clienteMap.get(os.cod_cli)?.nome_fantasia || clienteMap.get(os.cod_cli)?.razao_social || "",
        cnpj_cpf: clienteMap.get(os.cod_cli)?.cnpj_cpf || "",
      })),
      pedidos_venda: todosPVs.map(pv => ({
        ...pv,
        cliente_nome: clienteMap.get(pv.cod_cli)?.nome_fantasia || clienteMap.get(pv.cod_cli)?.razao_social || "",
      })),
      notas_fiscais: notasFiscais,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
