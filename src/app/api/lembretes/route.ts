import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { autenticar } from "@/lib/auth/server";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

const TBL = "portal_lembretes";

// Quem chama é SEMPRE o usuário do login: o id que vem na query/corpo não vale
// (antes qualquer um lia/criava/alterava lembretes de qualquer pessoa pelo userId).
const naoAutenticado = () => NextResponse.json({ erro: "Não autenticado" }, { status: 401 });

/** GET — busca lembretes do usuário logado (o ?userId= da query é ignorado) */
export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return naoAutenticado();
  const supabase = getSupabase();
  const { searchParams } = new URL(req.url);
  const userId = auth.userId;
  const tipo = searchParams.get("tipo"); // "pendentes" | "todos" | "vencidos"

  let query = supabase
    .from(TBL)
    .select("*")
    .or(`criador_id.eq.${userId},destinatario_id.eq.${userId}`)
    .order("data_hora", { ascending: true });

  if (tipo === "pendentes") {
    query = query.eq("status", "pendente");
  } else if (tipo === "vencidos") {
    query = query.eq("status", "pendente").lte("data_hora", new Date().toISOString());
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

/** POST — criar lembrete */
export async function POST(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return naoAutenticado();
  const supabase = getSupabase();
  const body = await req.json();
  const { destinatario_id, destinatario_nome, titulo, descricao, data_hora, recorrencia } = body;

  if (!destinatario_id || !titulo || !data_hora) {
    return NextResponse.json({ erro: "Campos obrigatórios: destinatario_id, titulo, data_hora" }, { status: 400 });
  }

  // Criador = login; o nome vem do cadastro (fallback: o que a tela mandou / e-mail).
  const criador_id = auth.userId;
  const { data: perfil } = await supabase.from("financeiro_usu").select("nome").eq("id", auth.userId).maybeSingle();
  const criador_nome = perfil?.nome || body.criador_nome || auth.email || "";

  const insert: Record<string, unknown> = {
    criador_id,
    criador_nome,
    destinatario_id,
    destinatario_nome,
    titulo,
    descricao: descricao || "",
    data_hora,
    status: "pendente",
  };
  if (recorrencia) insert.recorrencia = recorrencia;

  const { data, error } = await supabase
    .from(TBL)
    .insert(insert)
    .select()
    .single();

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json(data);
}

/** Calcula próxima data com base na recorrência */
function proximaData(dataAtual: string, recorrencia: string): string {
  const d = new Date(dataAtual);
  switch (recorrencia) {
    case "semanal": d.setDate(d.getDate() + 7); break;
    case "quinzenal": d.setDate(d.getDate() + 14); break;
    case "mensal": d.setMonth(d.getMonth() + 1); break;
    case "mensal_ultimo_dia": {
      // Último dia do próximo mês, mantendo o horário
      const hora = d.getHours(), min = d.getMinutes(), seg = d.getSeconds();
      d.setMonth(d.getMonth() + 2, 0); // dia 0 do mês+2 = último dia do mês+1
      d.setHours(hora, min, seg);
      break;
    }
    case "bimestral": d.setMonth(d.getMonth() + 2); break;
    case "semestral": d.setMonth(d.getMonth() + 6); break;
    case "anual": d.setFullYear(d.getFullYear() + 1); break;
  }
  return d.toISOString();
}

/** PATCH — atualizar lembrete (concluir ou adiar) */
export async function PATCH(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return naoAutenticado();
  const supabase = getSupabase();
  const body = await req.json();
  const { id, status, data_hora } = body;

  if (!id) return NextResponse.json({ erro: "id obrigatório" }, { status: 400 });

  // Só quem criou ou quem recebe o lembrete pode concluir/adiar.
  const { data: atual, error: errAtual } = await supabase
    .from(TBL)
    .select("criador_id, destinatario_id")
    .eq("id", id)
    .maybeSingle();
  if (errAtual) return NextResponse.json({ erro: errAtual.message }, { status: 500 });
  if (!atual || (atual.criador_id !== auth.userId && atual.destinatario_id !== auth.userId)) {
    return NextResponse.json({ erro: "Lembrete não encontrado" }, { status: 404 });
  }

  const updates: Record<string, unknown> = {};
  if (status) updates.status = status;
  if (data_hora) updates.data_hora = data_hora;

  const { data, error } = await supabase
    .from(TBL)
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  // Se concluiu um lembrete recorrente, cria o próximo automaticamente
  if (status === "concluido" && data?.recorrencia) {
    const novaDataHora = proximaData(data.data_hora, data.recorrencia);
    await supabase.from(TBL).insert({
      criador_id: data.criador_id,
      criador_nome: data.criador_nome,
      destinatario_id: data.destinatario_id,
      destinatario_nome: data.destinatario_nome,
      titulo: data.titulo,
      descricao: data.descricao,
      data_hora: novaDataHora,
      status: "pendente",
      recorrencia: data.recorrencia,
    });
  }

  return NextResponse.json(data);
}
