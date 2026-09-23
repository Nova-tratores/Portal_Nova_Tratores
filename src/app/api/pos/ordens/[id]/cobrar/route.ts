// Cobrança da OS via Tratorilson (fase "Cobrando Cliente"):
//  GET  → contatos do WhatsApp vinculados ao CNPJ do cliente (NovaZap),
//         valores do Omie (OS + Pedido de Venda SOMADOS) e a mensagem-modelo.
//  POST → envia a mensagem + os PDFs (OS e PV, gerados na hora pelo Omie)
//         pra conversa do contato escolhido no chatwoot.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { autenticar } from "@/lib/auth/server";
import { TBL_OS, TBL_LOGS_PPO } from "@/lib/pos/constants";
import { buscarWhatsappDoCliente } from "@/lib/chatwoot/contatos-cliente";
import { garantirConversaContato, enviarTextoConversa, enviarPdfConversa } from "@/lib/chatwoot/cliente";
import { chatwootConfigurado } from "@/lib/chatwoot/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } },
);

const OMIE_BASE = "https://app.omie.com.br/api/v1";
const OMIE_KEY = process.env.OMIE_APP_KEY || "";
const OMIE_SECRET = process.env.OMIE_APP_SECRET || "";

async function omie<T>(ep: string, call: string, param: Record<string, unknown>, tentativa = 0): Promise<T> {
  const res = await fetch(`${OMIE_BASE}${ep}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ call, app_key: OMIE_KEY, app_secret: OMIE_SECRET, param: [param] }),
  });
  const data: any = await res.json().catch(() => ({}));
  const falha = String(data?.faultstring || "");
  if ((/redundante|Aguarde/i.test(falha) || res.status === 425 || res.status === 429) && tentativa < 2) {
    await new Promise((r) => setTimeout(r, 6000));
    return omie(ep, call, param, tentativa + 1);
  }
  if (falha) throw new Error(falha.slice(0, 180));
  return data as T;
}

const din = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const soDigitos = (s: unknown) => String(s ?? "").replace(/\D/g, "");

// Final do chassi: pega do blob "Chassis: ..." da solicitação; senão do Projeto.
function finalChassi(servSolicitado: unknown, projeto: unknown): string {
  const m = String(servSolicitado || "").match(/Chassis?:\s*([^\n|]+)/i);
  const bruto = (m?.[1] || String(projeto || "")).trim();
  const alnum = bruto.replace(/[^A-Za-z0-9]/g, "");
  return alnum.slice(-4) || "—";
}

interface DadosCobranca {
  os: any;
  contatos: { id: number; nome: string | null; cargo: string | null; telefone: string | null }[];
  avisoContatos: string | null;
  valorOS: number;
  valorPV: number;
  total: number;
  nCodOS: number;
  codPedido: number;
  mensagem: (nomeContato: string) => string;
  cliente: { nome: string; cnpj: string };
}

async function montarCobranca(id: string): Promise<DadosCobranca | { erro: string; status: number }> {
  const { data: rows } = await supabase.from(TBL_OS)
    .select("Id_Ordem, Os_Cliente, Cnpj_Cliente, Os_Tecnico, Projeto, Serv_Solicitado, Data_Fim_Servico, Data, Ordem_Omie, Pedido_Venda, Status")
    .eq("Id_Ordem", id).limit(1);
  const os = rows?.[0];
  if (!os) return { erro: "OS não encontrada.", status: 404 };
  if (!os.Ordem_Omie) return { erro: "Esta OS ainda não foi enviada ao Omie.", status: 400 };

  // ── Códigos Omie do cliente (pelo CNPJ; fallback razão social) ──
  const doc = soDigitos(os.Cnpj_Cliente);
  const { data: cad } = await supabase
    .from("portal_nt_clientes_cadastro_omie")
    .select("cod_cli, cnpj_cpf, razao_social")
    .or(`razao_social.ilike.%${String(os.Os_Cliente || "").replace(/[%,()]/g, " ").trim()}%${doc ? `,cnpj_cpf.ilike.%${doc.slice(-6)}%` : ""}`)
    .limit(30);
  const codigos = [...new Set((cad || [])
    .filter((c) => (doc ? soDigitos(c.cnpj_cpf) === doc : true))
    .map((c) => String(c.cod_cli)))];

  // ── Contatos do WhatsApp (NovaZap) vinculados ao cliente ──
  let contatos: DadosCobranca["contatos"] = [];
  let avisoContatos: string | null = null;
  if (!chatwootConfigurado()) avisoContatos = "NovaZap não configurado neste ambiente.";
  else if (!codigos.length) avisoContatos = "Não achei o cliente no cadastro Omie (pelo CNPJ) pra buscar os contatos.";
  else {
    const secao = await buscarWhatsappDoCliente(codigos);
    if (secao.estado === "ok") contatos = secao.contatos.map((c: any) => ({ id: c.id, nome: c.nome ?? null, cargo: c.cargo ?? null, telefone: c.telefone ?? null }));
    else if (secao.estado === "sem_contatos") avisoContatos = "Nenhum contato do WhatsApp vinculado a este cliente no NovaZap.";
    else if (secao.estado === "indisponivel") avisoContatos = `NovaZap indisponível agora (${(secao as any).motivo || "tente de novo"}).`;
    else avisoContatos = "NovaZap não configurado.";
  }

  // ── Valores do Omie: OS + Pedido de Venda SOMADOS ──
  const c = await omie<any>("/servicos/os/", "ConsultarOS", { cNumOS: String(os.Ordem_Omie) });
  const nCodOS = Number(c?.Cabecalho?.nCodOS || 0);
  const valorOS = Number(c?.Cabecalho?.nValorTotal || 0);
  let valorPV = 0;
  let codPedido = 0;
  if (os.Pedido_Venda) {
    try {
      const p = await omie<any>("/produtos/pedido/", "ConsultarPedido", { numero_pedido: String(os.Pedido_Venda) });
      const pv = p?.pedido_venda_produto || p;
      valorPV = Number(pv?.total_pedido?.valor_total_pedido || 0);
      codPedido = Number(pv?.cabecalho?.codigo_pedido || 0);
    } catch { /* PV sem consulta — segue só com a OS */ }
  }
  const total = valorOS + valorPV;

  // ── Mensagem-modelo ──
  const agora = new Date(Date.now() - 3 * 3600 * 1000);
  const saud = agora.getUTCHours() < 12 ? "Bom dia" : agora.getUTCHours() < 18 ? "Boa tarde" : "Boa noite";
  const dataStr = (() => {
    const d = String(os.Data_Fim_Servico || os.Data || "").slice(0, 10);
    return d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : agora.toISOString().slice(8, 10) + "/" + agora.toISOString().slice(5, 7);
  })();
  const chassi = finalChassi(os.Serv_Solicitado, os.Projeto);
  const mensagem = (nomeContato: string) => {
    const primeiro = String(nomeContato || "").trim().split(/\s+/)[0] || "";
    return `${saud}${primeiro ? ` ${primeiro}` : ""}, tudo bem com o senhor? Segue o orçamento das revisões realizadas no trator de vocês:\n` +
      `Data: ${dataStr}\n` +
      `Técnico: ${String(os.Os_Tecnico || "").trim()}\n` +
      `Final do Chassis: ${chassi}\n\n` +
      `Valor Total: R$ ${din(total)}`;
  };

  return {
    os, contatos, avisoContatos, valorOS, valorPV, total, nCodOS, codPedido, mensagem,
    cliente: { nome: String(os.Os_Cliente || ""), cnpj: String(os.Cnpj_Cliente || "") },
  };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!auth.isAdmin && !auth.modulos.includes("pos")) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  const { id } = await params;
  try {
    const d = await montarCobranca(id);
    if ("erro" in d) return NextResponse.json({ error: d.erro }, { status: d.status });
    return NextResponse.json({
      cliente: d.cliente,
      contatos: d.contatos,
      avisoContatos: d.avisoContatos,
      valores: { os: d.valorOS, pv: d.valorPV, total: d.total },
      mensagem: d.mensagem(d.contatos[0]?.nome || ""),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro ao montar a cobrança." }, { status: 502 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!auth.isAdmin && !auth.modulos.includes("pos")) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const contatoId = Number(body?.contatoId || 0);
  if (!contatoId) return NextResponse.json({ error: "Escolha o contato que vai receber." }, { status: 400 });

  try {
    const d = await montarCobranca(id);
    if ("erro" in d) return NextResponse.json({ error: d.erro }, { status: d.status });
    const contato = d.contatos.find((c) => c.id === contatoId);
    if (!contato) return NextResponse.json({ error: "Contato não está entre os vinculados a este cliente." }, { status: 400 });

    const conversa = await garantirConversaContato(contatoId);
    await enviarTextoConversa(conversa, d.mensagem(contato.nome || ""));

    // PDFs gerados NA HORA pelo Omie (OS e Pedido de Venda) — anexados na conversa
    const enviados: string[] = [];
    if (d.nCodOS) {
      try {
        const doc = await omie<any>("/servicos/osdocs/", "ObterOS", { nIdOs: d.nCodOS });
        if (doc?.cPdfOs) {
          const pdf = await fetch(String(doc.cPdfOs)).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`PDF OS ${r.status}`))));
          await enviarPdfConversa(conversa, `Ordem_${String(d.os.Ordem_Omie).replace(/^0+/, "")}.pdf`, pdf);
          enviados.push("PDF da OS");
        }
      } catch (e) { console.warn("[cobrar] PDF da OS falhou:", e); }
    }
    if (d.codPedido) {
      try {
        const doc = await omie<any>("/produtos/dfedocs/", "ObterPedVenda", { nIdPed: d.codPedido });
        if (doc?.cPdfPed) {
          const pdf = await fetch(String(doc.cPdfPed)).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`PDF PV ${r.status}`))));
          await enviarPdfConversa(conversa, `Pedido_${String(d.os.Pedido_Venda).replace(/^0+/, "")}.pdf`, pdf);
          enviados.push("PDF do PV");
        }
      } catch (e) { console.warn("[cobrar] PDF do PV falhou:", e); }
    }

    // Log na timeline da OS
    const agora = new Date();
    await supabase.from(TBL_LOGS_PPO).insert({
      Id_ppo: id,
      Data_Acao: new Intl.DateTimeFormat("pt-BR").format(agora),
      Hora_Acao: agora.toLocaleTimeString("pt-BR"),
      UsuEmail: auth.email || "portal",
      acao: `Cobrança enviada via Tratorilson pra ${contato.nome || "contato"} (${contato.telefone || "sem nº"}) — R$ ${din(d.total)}${enviados.length ? ` + ${enviados.join(" e ")}` : ""}`,
      Status_Anterior: d.os.Status, Status_Atual: d.os.Status,
      Dias_Na_Fase: 0, Total_Dias_Aberto: 0,
    });

    return NextResponse.json({ ok: true, conversa, enviados, total: d.total });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro ao enviar a cobrança." }, { status: 502 });
  }
}
