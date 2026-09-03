// Botão do kanban de solicitações: cria o ORÇAMENTO (tabela orcamentos) +
// PPV vinculado ("Ref. Orçamento ORC-xxxx") a partir do que o cliente
// confirmou com o Tratorilson no WhatsApp. Só pra quem tem o módulo POS.
import { NextRequest, NextResponse } from "next/server";
import { autenticar } from "@/lib/auth/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseFetch, formatarDataBR } from "@/lib/ppv/supabase";
import { gerarProximoId, atualizarValorTotal, registrarLog } from "@/lib/ppv/queries";
import { TBL_PEDIDOS, TBL_ITENS } from "@/lib/ppv/constants";

export const dynamic = "force-dynamic";

const sb = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

export async function POST(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const id = Number(body?.id);
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  const supa = sb();
  const { data: sol, error: e1 } = await supa.from("tratorilson_solicitacoes").select("*").eq("id", id).single();
  if (e1 || !sol) return NextResponse.json({ error: "solicitação não encontrada" }, { status: 404 });
  if (sol.detalhes?.orcamento_numero) {
    return NextResponse.json({ error: `Já criado: ${sol.detalhes.orcamento_numero} / ${sol.detalhes.ppv_id || "sem PPV"}` }, { status: 409 });
  }

  const det = sol.detalhes || {};
  const pecas: any[] = Array.isArray(det.pecas) ? det.pecas : [];
  if (!pecas.length) return NextResponse.json({ error: "solicitação sem peças estruturadas — crie o orçamento manualmente" }, { status: 400 });

  // cliente: nome do vínculo + cadastro Omie pelo cod (documento/endereço/cidade)
  let clienteNome = String(sol.cliente_nome || sol.contato_nome || "Cliente WhatsApp");
  let clienteDoc: string | null = sol.cliente_cnpj || null;
  let clienteEnd: string | null = null;
  let clienteCidade: string | null = null;
  if (sol.cliente_cod) {
    const { data: cad } = await supa
      .from("portal_nt_clientes_cadastro_omie")
      .select("razao_social,nome_fantasia,cnpj_cpf,endereco,bairro,cidade,estado")
      .eq("cod_cli", sol.cliente_cod)
      .limit(1);
    const c = cad?.[0];
    if (c) {
      clienteNome = String(c.nome_fantasia || c.razao_social || clienteNome);
      clienteDoc = clienteDoc || String(c.cnpj_cpf || "") || null;
      clienteEnd = [c.endereco, c.bairro].filter(Boolean).join(", ") || null;
      clienteCidade = c.cidade ? `${c.cidade}/${c.estado || ""}` : null;
    }
  }

  const { data: cfg } = await supa.from("configuracoes_pos").select("valor_hora,valor_km").eq("id", 1).maybeSingle();
  const valorHora = Number(cfg?.valor_hora) || 193;
  const valorKm = Number(cfg?.valor_km) || 2.8;
  const horas = Number(det.mao_obra_horas) || 0;
  const km = Number(det.deslocamento_km) || 0;

  const itens = pecas.map((p) => ({
    codigo: String(p.codigo || ""),
    descricao: String(p.descricao || p.codigo || ""),
    quantidade: Number(p.qtd) || 1,
    preco: Number(p.preco) || 0,
  }));
  const total = itens.reduce((s, i) => s + i.quantidade * i.preco, 0) + horas * valorHora + km * valorKm;

  try {
    // ---- ORÇAMENTO ----
    const { data: ult } = await supa.from("orcamentos").select("id").order("id", { ascending: false }).limit(1);
    const numero = `ORC-${String(((ult?.[0]?.id as number) || 0) + 1).padStart(4, "0")}`;
    const obs = [
      `Solicitação #${sol.id} confirmada pelo cliente no WhatsApp (Tratorilson).`,
      sol.resumo ? `Pedido: ${sol.resumo}` : "",
      sol.extras ? `Extras: ${sol.extras}` : "",
      det.localizacao ? `Localização: ${det.localizacao}` : "",
      "Pagamento: 30 dias.",
    ].filter(Boolean).join("\n");

    const { data: orc, error: e2 } = await supa
      .from("orcamentos")
      .insert([{
        numero,
        tipo: "completo",
        cliente_nome: clienteNome,
        cliente_documento: clienteDoc,
        cliente_endereco: clienteEnd,
        cliente_cidade: clienteCidade,
        observacao: obs,
        validade: 15,
        itens,
        mao_obra: horas > 0 ? { valorHora, horas } : null,
        deslocamento: km > 0 ? { valorKm, km } : null,
        total: Number(total.toFixed(2)),
        criado_por: auth.email || "portal",
        status: "ativo",
      }])
      .select("id, numero")
      .single();
    if (e2 || !orc) throw new Error(e2?.message || "falha ao criar orçamento");

    // ---- PPV vinculado (só as peças) ----
    const ppvId = await gerarProximoId("PPV");
    const dataFmt = formatarDataBR(new Date().toISOString(), true);
    await supabaseFetch(TBL_PEDIDOS, "POST", [{
      id_pedido: ppvId,
      Tipo_Pedido: "Pedido",
      cliente: clienteNome,
      tecnico: "Pós-vendas",
      status: "Aguardando",
      valor_total: 0,
      observacao: `Ref. Orçamento ${orc.numero} — solicitação do WhatsApp (Tratorilson)`,
      Motivo_Saida_Pedido: "Orçamento Cliente",
      email_usuario: auth.email || "portal",
      Id_Os: "",
      Projeto: "",
      data: dataFmt,
    }]);
    await supabaseFetch(TBL_ITENS, "POST", itens.map((i) => ({
      Id: Math.floor(Math.random() * 9e9) + 1e9,
      Id_PPV: ppvId,
      Data_Hora: dataFmt,
      Tecnico: "Pós-vendas",
      TipoMovimento: "Saída",
      CodProduto: i.codigo,
      Descricao: i.descricao,
      Qtde: String(i.quantidade),
      Preco: i.preco,
    })));
    await atualizarValorTotal(ppvId);
    await registrarLog(ppvId, `Criado a partir do orçamento ${orc.numero} (solicitação WhatsApp #${sol.id})`, auth.email || "portal");

    // ---- marca na solicitação e avança a fase ----
    await supa.from("tratorilson_solicitacoes").update({
      fase: "orcamento",
      detalhes: { ...det, orcamento_numero: orc.numero, orcamento_id: orc.id, ppv_id: ppvId, criado_por: auth.email || "portal" },
    }).eq("id", id);

    return NextResponse.json({ ok: true, orcamento: orc.numero, ppv: ppvId, total: Number(total.toFixed(2)) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "falha ao criar" }, { status: 500 });
  }
}
