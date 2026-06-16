import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { TBL_LOUSA, TBL_LOUSA_CONFIG, TBL_OS, TBL_CLIENTES } from "@/lib/pos/constants";

// GET — buscar entradas da semana + verificar OS abertas + pedidos PPV
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const inicio = searchParams.get("inicio"); // YYYY-MM-DD (segunda)
  const fim = searchParams.get("fim");       // YYYY-MM-DD (sábado)
  const modo = searchParams.get("modo");

  if (modo === "clientes") {
    const q = searchParams.get("q") || "";
    const { data } = await supabase
      .from(TBL_CLIENTES)
      .select("cnpj_cpf, nome_fantasia, razao_social, cidade")
      .or(`nome_fantasia.ilike.%${q}%,razao_social.ilike.%${q}%,cnpj_cpf.ilike.%${q}%`)
      .limit(60);
    // Remove duplicados (mesmo CNPJ ou mesmo nome aparecem mais de uma vez na base)
    const dedup = new Map<string, any>();
    for (const c of data || []) {
      const cnpj = String(c.cnpj_cpf || "").replace(/\D/g, "");
      const nome = (c.nome_fantasia || c.razao_social || "").toLowerCase().trim();
      const key = cnpj || nome;
      if (key && !dedup.has(key)) dedup.set(key, c);
    }
    return NextResponse.json([...dedup.values()].slice(0, 25));
  }

  if (modo === "usuarios") {
    const { data } = await supabase
      .from("financeiro_usu")
      .select("id, nome, funcao")
      .eq("ativo", true)
      .order("nome");
    return NextResponse.json(data || []);
  }

  if (modo === "config") {
    const { data } = await supabase.from(TBL_LOUSA_CONFIG).select("*").eq("id", 1).maybeSingle();
    return NextResponse.json(data || { notificar_user_id: null, notificar_user_nome: null });
  }

  if (!inicio || !fim) {
    return NextResponse.json({ error: "inicio e fim obrigatórios" }, { status: 400 });
  }

  const { data: entradas, error } = await supabase
    .from(TBL_LOUSA)
    .select("*")
    .gte("data", inicio)
    .lte("data", fim)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!entradas || entradas.length === 0) return NextResponse.json([]);

  // Cruzar cada card com OS ABERTAS do POS pelo NOME do cliente (ou CNPJ). Sem exigir técnico.
  const norm = (s: any) => (s ?? "").toString().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "").trim();
  const soDig = (s: any) => (s ?? "").toString().replace(/\D/g, "");

  // Busca todas as OS abertas (não concluídas/canceladas) — cruzamento é feito por nome em JS
  const { data: osData } = await supabase
    .from(TBL_OS)
    .select("Id_Ordem, Servico_Numero, Cnpj_Cliente, Os_Cliente, Os_Tecnico, Status, Data, Serv_Solicitado, Valor_Total, ID_PPV, Previsao_Execucao, Cidade_Cliente")
    .not("Status", "in", '("Concluída","Concluida","Cancelada","cancelada","Fechado","Fechada")');
  const ordensPos: any[] = osData || [];

  // Enriquecer cada entrada
  const resultado = entradas.map((e) => {
    const isServico = (e.tipo || "servico") === "servico";
    const nomeE = norm(e.cliente_nome);
    const cnpjE = soDig(e.cliente_cnpj);

    let matches: any[] = [];
    if (isServico && (nomeE.length >= 4 || cnpjE)) {
      matches = ordensPos.filter((o) => {
        if (cnpjE && soDig(o.Cnpj_Cliente) === cnpjE) return true;
        const nomeO = norm(o.Os_Cliente);
        return nomeE.length >= 4 && !!nomeO && (nomeO.includes(nomeE) || nomeE.includes(nomeO));
      });
    }

    const ordens = matches.map((o) => ({
      id_ordem: String(o.Id_Ordem),
      numero: o.Servico_Numero || null,
      status: o.Status || "",
      cliente: o.Os_Cliente || "",
      tecnico: o.Os_Tecnico || "",
      valor: Number(o.Valor_Total) || 0,
      data: o.Data || null,
      previsao: o.Previsao_Execucao || null,
      cidade: o.Cidade_Cliente || "",
      servico: o.Serv_Solicitado || "",
      temPPV: !!o.ID_PPV,
    }));
    const temOsPos = ordens.length > 0;
    const buscavel = isServico && (nomeE.length >= 4 || !!cnpjE);

    return {
      ...e,
      ordensPos: ordens,
      temOsPos,
      semOrdem: buscavel && !temOsPos,
      // compat com o que a UI já usava
      temOsAberta: temOsPos,
      ordensAbertas: ordens.map((o) => ({ id_ordem: o.id_ordem, status: o.status })),
      temPedidoPPV: ordens.some((o) => o.temPPV),
    };
  });

  return NextResponse.json(resultado);
}

// POST — criar entrada
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { data, cliente_cnpj, cliente_nome, descricao, criado_por_id, criado_por_nome, cor, tecnico_nome, periodo, tipo, tecnico_acompanhante } = body;
  const tipoFinal = tipo || "servico";

  // Cliente só é obrigatório para serviço; faltou/feriado/saida não precisam
  if (!data || !criado_por_id || !criado_por_nome || (tipoFinal === "servico" && !cliente_nome)) {
    return NextResponse.json({ error: "Campos obrigatórios faltando" }, { status: 400 });
  }

  const { data: novo, error } = await supabase
    .from(TBL_LOUSA)
    .insert({ data, tipo: tipoFinal, cliente_cnpj: cliente_cnpj || null, cliente_nome, descricao: descricao || null, criado_por_id, criado_por_nome, cor: cor || "#3b82f6", tecnico_nome: tecnico_nome || null, periodo: periodo || "manha", tecnico_acompanhante: tecnico_acompanhante || null })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(novo);
}

// PATCH — atualizar entrada ou config
export async function PATCH(req: NextRequest) {
  const body = await req.json();

  if (body.modo === "config") {
    const { notificar_user_id, notificar_user_nome } = body;
    const { error } = await supabase
      .from(TBL_LOUSA_CONFIG)
      .upsert({ id: 1, notificar_user_id, notificar_user_nome, updated_at: new Date().toISOString() });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const { id, ...campos } = body;
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  campos.updated_at = new Date().toISOString();
  const { data: atualizado, error } = await supabase
    .from(TBL_LOUSA)
    .update(campos)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(atualizado);
}

// DELETE — remover entrada
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  const { error } = await supabase.from(TBL_LOUSA).delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
