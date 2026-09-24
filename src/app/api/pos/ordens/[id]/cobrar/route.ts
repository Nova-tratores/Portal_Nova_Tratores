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
import { garantirConversaContato, enviarTextoConversa, enviarPdfConversa, buscarContatosPorTexto, atualizarAtributosContato, listarConversasContato, listarMensagensConversa } from "@/lib/chatwoot/cliente";
import { chatwootConfigurado, chatwootVariaveisFaltando } from "@/lib/chatwoot/config";

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

// Cadastro Omie do cliente da OS (códigos + registros pro vínculo)
async function clienteCadastro(os: any): Promise<{ codigos: string[]; registros: any[] }> {
  const doc = soDigitos(os.Cnpj_Cliente);
  const { data: cad } = await supabase
    .from("portal_nt_clientes_cadastro_omie")
    .select("cod_cli, empresa, cnpj_cpf, razao_social, nome_fantasia")
    .or(`razao_social.ilike.%${String(os.Os_Cliente || "").replace(/[%,()]/g, " ").trim()}%${doc ? `,cnpj_cpf.ilike.%${doc.slice(-6)}%` : ""}`)
    .limit(30);
  const registros = (cad || []).filter((c) => (doc ? soDigitos(c.cnpj_cpf) === doc : true));
  const codigos = [...new Set(registros.map((c) => String(c.cod_cli)))];
  return { codigos, registros };
}

interface DadosCobranca {
  os: any;
  contatos: { id: number; nome: string | null; cargo: string | null; telefone: string | null; preferenciaFaturamento: string | null }[];
  avisoContatos: string | null;
  valorOS: number;
  valorPV: number;
  total: number;
  nCodOS: number;
  codPedidos: number[];
  numsPV: string[];
  mensagem: (nomeContato: string) => string;
  cliente: { nome: string; cnpj: string };
}

async function montarCobranca(id: string): Promise<DadosCobranca | { erro: string; status: number }> {
  const { data: rows } = await supabase.from(TBL_OS)
    .select("Id_Ordem, Os_Cliente, Cnpj_Cliente, Os_Tecnico, Projeto, Serv_Solicitado, Data_Fim_Servico, Data, Ordem_Omie, Pedido_Venda, ID_PPV, Status")
    .eq("Id_Ordem", id).limit(1);
  const os = rows?.[0];
  if (!os) return { erro: "OS não encontrada.", status: 404 };
  if (!os.Ordem_Omie) return { erro: "Esta OS ainda não foi enviada ao Omie.", status: 400 };

  // ── Códigos Omie do cliente (pelo CNPJ; fallback razão social) ──
  const { codigos, registros } = await clienteCadastro(os);

  // ── Contatos do WhatsApp (NovaZap) vinculados ao cliente ──
  let contatos: DadosCobranca["contatos"] = [];
  let avisoContatos: string | null = null;
  if (!chatwootConfigurado()) avisoContatos = `NovaZap não configurado neste ambiente — faltando no Railway: ${chatwootVariaveisFaltando().join(", ")}.`;
  else if (!codigos.length) avisoContatos = "Não achei o cliente no cadastro Omie (pelo CNPJ) pra buscar os contatos.";
  else {
    const secao = await buscarWhatsappDoCliente(codigos);
    if (secao.estado === "ok") contatos = secao.contatos.map((c: any) => ({ id: c.id, nome: c.nome ?? null, cargo: c.cargo ?? null, telefone: c.telefone ?? null, preferenciaFaturamento: c.preferencia_faturamento ?? null }));
    else if (secao.estado === "sem_contatos") avisoContatos = "Nenhum contato do WhatsApp vinculado a este cliente no NovaZap.";
    else if (secao.estado === "indisponivel") avisoContatos = `NovaZap indisponível agora (${(secao as any).motivo || "tente de novo"}).`;
    else avisoContatos = "NovaZap não configurado.";
  }

  // ── Valores do Omie: OS + Pedido de Venda SOMADOS ──
  const c = await omie<any>("/servicos/os/", "ConsultarOS", { cNumOS: String(os.Ordem_Omie) });
  const nCodOS = Number(c?.Cabecalho?.nCodOS || 0);
  const valorOS = Number(c?.Cabecalho?.nValorTotal || 0);

  // Números dos Pedidos de Venda: o campo da OS quando existir; senão o
  // pedido_omie dos PPVs vinculados (o envio pelo drawer não grava na OS).
  let pvNums = String(os.Pedido_Venda || "").split(",").map((s: string) => s.trim()).filter(Boolean);
  if (!pvNums.length && os.ID_PPV) {
    const ids = String(os.ID_PPV).split(",").map((s: string) => s.trim()).filter(Boolean);
    if (ids.length) {
      const { data: peds } = await supabase.from("pedidos")
        .select("id_pedido, pedido_omie")
        .in("id_pedido", ids);
      pvNums = (peds || []).map((p) => String(p.pedido_omie || "").trim()).filter(Boolean);
    }
  }

  let valorPV = 0;
  const codPedidos: number[] = [];
  const numsPV: string[] = [];
  for (const num of [...new Set(pvNums)]) {
    try {
      const p = await omie<any>("/produtos/pedido/", "ConsultarPedido", { numero_pedido: num });
      const pv = p?.pedido_venda_produto || p;
      valorPV += Number(pv?.total_pedido?.valor_total_pedido || 0);
      const cod = Number(pv?.cabecalho?.codigo_pedido || 0);
      if (cod) { codPedidos.push(cod); numsPV.push(num); }
    } catch { /* PV sem consulta — segue com o que somou */ }
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
    os, contatos, avisoContatos, valorOS, valorPV, total, nCodOS, codPedidos, numsPV, mensagem,
    cliente: { nome: String(os.Os_Cliente || ""), cnpj: String(os.Cnpj_Cliente || "") },
  };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!auth.isAdmin && !auth.modulos.includes("pos")) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  const { id } = await params;

  // ?status=1 → estado leve da cobrança (já foi enviada? quando? pra quem?),
  // lido do log da OS — sem tocar Omie nem chatwoot (a capa do card consulta isso).
  if (req.nextUrl.searchParams.get("status")) {
    const { data: logs } = await supabase.from(TBL_LOGS_PPO)
      .select("Data_Acao, Hora_Acao, acao")
      .eq("Id_ppo", id).ilike("acao", "Cobrança enviada%");
    const chave = (l: any) => {
      const [d, m, a] = String(l.Data_Acao || "").split("/");
      return `${a}-${m}-${d} ${l.Hora_Acao || ""}`;
    };
    const ult = (logs || []).sort((x, y) => chave(x).localeCompare(chave(y))).pop();
    if (!ult) return NextResponse.json({ enviada: false });
    const para = String(ult.acao || "").match(/via Tratorilson pra (.+?) \(/)?.[1] || null;

    // O que o cliente respondeu DEPOIS do envio (mensagens recebidas na conversa
    // do NovaZap). Conversa vem do "[conv N]" do log; logs antigos sem a marca
    // caem na busca pelo telefone.
    let respostas: { texto: string; quando: string }[] = [];
    if (chatwootConfigurado()) {
      try {
        let convId = Number(String(ult.acao).match(/\[conv (\d+)\]/)?.[1] || 0);
        if (!convId) {
          const dig = (String(ult.acao).match(/\(([^)]+)\)/)?.[1] || "").replace(/\D/g, "");
          if (dig.length >= 8) {
            const achados = await buscarContatosPorTexto(dig.slice(-8), 1);
            const c = achados.find((x) => String(x.phone_number || "").replace(/\D/g, "").endsWith(dig.slice(-8)));
            if (c?.id) {
              const convs = await listarConversasContato(Number(c.id));
              convId = Number(convs[0]?.id || 0);
            }
          }
        }
        if (convId) {
          const msgs = await listarMensagensConversa(convId);
          // Âncora: a ÚLTIMA mensagem da própria cobrança dentro da conversa
          // (mensagem-modelo, PDFs ou a pergunta da preferência) — resposta é o
          // que o cliente mandou DEPOIS dela. Não depende do relógio do log
          // (o Railway grava em UTC e o filtro por hora deixava tudo de fora).
          const ehCobranca = (mm: any) => {
            if (Number(mm.message_type) !== 1) return false;
            const t = String(mm.content || "");
            if (/Segue o orçamento|Valor Total:|^Posso fechar para /i.test(t)) return true;
            const anexos = Array.isArray(mm.attachments) ? mm.attachments : [];
            return anexos.some((ax: any) => /(Ordem|Pedido)_\d+/i.test(String(ax?.file_name || ax?.data_url || "")));
          };
          let corte = -1;
          msgs.forEach((mm: any, i: number) => { if (ehCobranca(mm)) corte = i; });
          let candidatas = corte >= 0 ? msgs.slice(corte + 1) : msgs;
          if (corte < 0) {
            // cobrança fora da janela de mensagens — corta pelo horário do log,
            // lido como UTC (interpretação mais folgada; só inclui a mais)
            const [d, m, a] = String(ult.Data_Acao || "").split("/");
            const desde = new Date(`${a}-${m}-${d}T${String(ult.Hora_Acao || "00:00:00")}Z`).getTime() / 1000;
            candidatas = msgs.filter((mm: any) => Number(mm.created_at || 0) > desde);
          }
          respostas = candidatas
            .filter((mm: any) => Number(mm.message_type) === 0 && !mm.private)
            .slice(-3)
            .map((mm: any) => {
              const dt = new Date((Number(mm.created_at) - 3 * 3600) * 1000).toISOString();
              return {
                texto: String(mm.content || "").trim() || ((mm.attachments?.length ?? 0) > 0 ? "📎 (áudio/foto/anexo)" : ""),
                quando: `${dt.slice(8, 10)}/${dt.slice(5, 7)} ${dt.slice(11, 16)}`,
              };
            })
            .filter((r) => r.texto);
        }
      } catch { /* status sai sem a resposta */ }
    }
    return NextResponse.json({ enviada: true, quando: `${ult.Data_Acao} ${String(ult.Hora_Acao || "").slice(0, 5)}`, para, respostas });
  }

  // ?buscar=texto → busca LIVRE de contatos no NovaZap (como no próprio chatwoot),
  // pra escolher/vincular um contato que ainda não está no CNPJ.
  const buscar = (req.nextUrl.searchParams.get("buscar") || "").trim();
  if (buscar) {
    if (!chatwootConfigurado()) return NextResponse.json({ busca: [], aviso: "NovaZap não configurado neste ambiente." });
    if (buscar.length < 2) return NextResponse.json({ busca: [] });
    try {
      // A busca do fork já ignora maiúsculas e acentos (unaccent + ILIKE) e
      // casa telefone só pelos dígitos. Aqui pegamos 2 páginas (30 contatos)
      // pra termo genérico não deixar ninguém de fora.
      const p1 = await buscarContatosPorTexto(buscar, 1);
      const p2 = p1.length >= 15 ? await buscarContatosPorTexto(buscar, 2).catch(() => []) : [];
      const brutos = [...p1, ...p2];
      const busca = brutos.slice(0, 25).map((c) => {
        const a = (c.custom_attributes || {}) as Record<string, unknown>;
        return {
          id: c.id,
          nome: c.name || null,
          telefone: c.phone_number || null,
          cargo: (a.cliente_cargo as string) || null,
          clienteAtual: (a.cliente as string) || null,
        };
      });
      return NextResponse.json({ busca });
    } catch (e) {
      return NextResponse.json({ busca: [], aviso: e instanceof Error ? e.message : "falha na busca" });
    }
  }

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

  // acao=preferencia → salva a PREFERÊNCIA DE FATURAMENTO no contato do
  // chatwoot (ex.: "30 dias") — preenchida na capa do card.
  if (body?.acao === "preferencia") {
    const preferencia = String(body?.preferencia || "").trim().slice(0, 60);
    try {
      await atualizarAtributosContato(contatoId, { preferencia_faturamento: preferencia || null });
      return NextResponse.json({ ok: true });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Erro ao salvar a preferência." }, { status: 502 });
    }
  }

  // acao=vincular → salva o contato escolhido no CNPJ do cliente (cliente_ref),
  // igual ao vínculo feito dentro do chatwoot. Não envia nada ainda.
  if (body?.acao === "vincular") {
    try {
      const { data: rows } = await supabase.from(TBL_OS)
        .select("Os_Cliente, Cnpj_Cliente").eq("Id_Ordem", id).limit(1);
      const os = rows?.[0];
      if (!os) return NextResponse.json({ error: "OS não encontrada." }, { status: 404 });
      const { registros } = await clienteCadastro(os);
      const reg = registros[0];
      if (!reg) return NextResponse.json({ error: "Não achei o cliente no cadastro Omie pra vincular." }, { status: 400 });
      const nome = reg.nome_fantasia || reg.razao_social || "";
      await atualizarAtributosContato(contatoId, {
        cliente: nome ? `${nome} (cód ${reg.cod_cli})` : String(reg.cod_cli ?? ""),
        cliente_ref: `${reg.cod_cli ?? ""}:${reg.empresa ?? ""}`,
      });
      return NextResponse.json({ ok: true, vinculadoA: nome || String(reg.cod_cli) });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Erro ao vincular o contato." }, { status: 502 });
    }
  }

  try {
    const d = await montarCobranca(id);
    if ("erro" in d) return NextResponse.json({ error: d.erro }, { status: d.status });
    let contato = d.contatos.find((c) => c.id === contatoId);
    if (!contato) {
      // contato recém-vinculado ainda não caiu na busca (cache de 5 min) —
      // confere direto no chatwoot em vez de recusar
      const { chatwootGet } = await import("@/lib/chatwoot/cliente");
      const c = await chatwootGet<{ payload?: { id?: number; name?: string | null; phone_number?: string | null } }>(`/contacts/${contatoId}`);
      if (!c?.payload?.id) return NextResponse.json({ error: "Contato não encontrado no NovaZap." }, { status: 400 });
      contato = { id: contatoId, nome: c.payload.name || null, cargo: null, telefone: c.payload.phone_number || null, preferenciaFaturamento: null };
    }

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
    for (let i = 0; i < d.codPedidos.length; i++) {
      try {
        const doc = await omie<any>("/produtos/dfedocs/", "ObterPedVenda", { nIdPed: d.codPedidos[i] });
        if (doc?.cPdfPed) {
          const pdf = await fetch(String(doc.cPdfPed)).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`PDF PV ${r.status}`))));
          await enviarPdfConversa(conversa, `Pedido_${String(d.numsPV[i] || i + 1).replace(/^0+/, "")}.pdf`, pdf);
          enviados.push(`PDF do PV ${String(d.numsPV[i]).replace(/^0+/, "")}`);
        }
      } catch (e) { console.warn("[cobrar] PDF do PV falhou:", e); }
    }

    // Preferência de faturamento: salva no contato e pergunta depois dos PDFs
    const preferencia = String(body?.preferencia || "").trim().slice(0, 60);
    if (preferencia) {
      try { await atualizarAtributosContato(contatoId, { preferencia_faturamento: preferencia }); } catch { /* segue */ }
      await enviarTextoConversa(conversa, `Posso fechar para ${preferencia}?`);
      enviados.push(`pergunta "Posso fechar para ${preferencia}?"`);
    }

    // Log na timeline da OS — hora do BRASIL (o Railway roda em UTC; sem o
    // ajuste o log saía 3h adiantado)
    const agora = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
    await supabase.from(TBL_LOGS_PPO).insert({
      Id_ppo: id,
      Data_Acao: `${agora.slice(8, 10)}/${agora.slice(5, 7)}/${agora.slice(0, 4)}`,
      Hora_Acao: agora.slice(11, 19),
      UsuEmail: auth.email || "portal",
      acao: `Cobrança enviada via Tratorilson pra ${contato.nome || "contato"} (${contato.telefone || "sem nº"}) — R$ ${din(d.total)}${enviados.length ? ` + ${enviados.join(" e ")}` : ""} [conv ${conversa}]`,
      Status_Anterior: d.os.Status, Status_Atual: d.os.Status,
      Dias_Na_Fase: 0, Total_Dias_Aberto: 0,
    });

    return NextResponse.json({ ok: true, conversa, enviados, total: d.total });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro ao enviar a cobrança." }, { status: 502 });
  }
}
