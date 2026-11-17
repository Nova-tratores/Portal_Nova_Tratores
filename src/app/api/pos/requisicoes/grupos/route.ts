import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/pos/supabase";
import { protegerRota, autorDe } from "@/lib/ajustes/permissao-server";
import { podeFinalizarGrupo } from "@/lib/requisicoes/grupos-parados";
import { grupoProntoParaConcluir } from "@/lib/requisicoes/grupos";

// Grupos (coletivos) de requisições. Uma req pode estar em vários grupos.
// GET   → lista grupos + os req_ids de cada um
// POST  → cria grupo { nome, criado_por }
// PATCH → renomeia / muda status { id, nome?, status?, usuario } (grava no histórico)

type Hist = { acao: string; req_id?: number; usuario: string; em: string; detalhe?: string };

// Grupos são usados nas Requisições, na OS (POS: nova requisição) e no Cronograma
// (Central de Trabalho: tickets/tarefas/cronograma). Basta um desses módulos.
const ACESSO_GRUPOS = [
  { modulo: "requisicoes" }, { modulo: "pos" },
  { modulo: "cronograma" }, { modulo: "tickets" }, { modulo: "tarefas" },
];

export async function GET(req: NextRequest) {
  const guarda = await protegerRota(req, ACESSO_GRUPOS);
  if (guarda.resposta) return guarda.resposta;
  try {
    const { data: grupos, error } = await supabase
      .from("requisicao_grupos")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const { data: membros } = await supabase
      .from("requisicao_grupo_membros")
      .select("grupo_id, req_id");

    const porGrupo: Record<string, number[]> = {};
    for (const m of membros || []) {
      const k = String(m.grupo_id);
      (porGrupo[k] ||= []).push(Number(m.req_id));
    }

    // grupo marcado "conclui sozinho": todas as requisições no financeiro → conclui agora (16/11/2026)
    await concluirProntos((grupos || []) as Record<string, unknown>[], porGrupo);

    const result = (grupos || []).map((g: Record<string, unknown>) => ({
      ...g,
      membros: porGrupo[String(g.id)] || [],
    }));
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

const semColuna = (msg?: string) => /fecha_sozinho/.test(msg || "");

/** conclui (no banco e no objeto da lista) os grupos abertos marcados que já estão prontos */
async function concluirProntos(grupos: Record<string, unknown>[], porGrupo: Record<string, number[]>) {
  const alvo = grupos.filter((g) => g.status === "aberto" && g.fecha_sozinho === true && (porGrupo[String(g.id)] || []).length);
  if (!alvo.length) return;
  const ids = [...new Set(alvo.flatMap((g) => porGrupo[String(g.id)] || []))];
  const { data: reqs } = await supabase.from("Requisicao").select("id, status").in("id", ids);
  const status = new Map((reqs || []).map((r: { id: number; status: string | null }) => [Number(r.id), r.status]));
  const em = new Date().toISOString();
  for (const g of alvo) {
    const membros = porGrupo[String(g.id)] || [];
    if (!grupoProntoParaConcluir(membros.map((id) => status.get(id)))) continue;
    const historico: Hist[] = [...(Array.isArray(g.historico) ? (g.historico as Hist[]) : []),
      { acao: "concluiu sozinho", usuario: "Sistema", em, detalhe: "todas as requisições chegaram ao financeiro" }];
    const { error } = await supabase.from("requisicao_grupos").update({ status: "concluido", historico, updated_at: em })
      .eq("id", g.id).eq("status", "aberto");
    if (!error) { g.status = "concluido"; g.historico = historico; }
  }
}

export async function POST(req: NextRequest) {
  const guarda = await protegerRota(req, ACESSO_GRUPOS);
  if (guarda.resposta) return guarda.resposta;
  try {
    const { nome, fecha_sozinho } = await req.json();
    const criado_por = autorDe(guarda.user);
    if (!nome?.trim()) return NextResponse.json({ error: "Informe o nome do grupo" }, { status: 400 });
    const em = new Date().toISOString();
    const historico: Hist[] = [{ acao: "criou", usuario: criado_por || "?", em,
      detalhe: fecha_sozinho ? "conclui sozinho quando todas chegarem ao financeiro" : "fica aberto até alguém concluir" }];
    const linha = { nome: nome.trim(), criado_por: criado_por || null, historico };
    let { data, error } = await supabase.from("requisicao_grupos")
      .insert([{ ...linha, ...(fecha_sozinho ? { fecha_sozinho: true } : {}) }]).select().single();
    // sem o SQL da coluna: cria do jeito antigo (fica aberto) e avisa
    let aviso: string | undefined;
    if (error && semColuna(error.message)) {
      ({ data, error } = await supabase.from("requisicao_grupos").insert([linha]).select().single());
      aviso = "O grupo foi criado, mas ainda vai ficar aberto: falta rodar o SQL sql/requisicao-grupos-fecha-sozinho.sql.";
    }
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (aviso) return NextResponse.json({ ...data, membros: [], aviso });
    return NextResponse.json({ ...data, membros: [] });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const guarda = await protegerRota(req, ACESSO_GRUPOS);
  if (guarda.resposta) return guarda.resposta;
  try {
    const { id, nome, status, fecha_sozinho, motivo } = await req.json();
    const usuario = autorDe(guarda.user);
    if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

    const { data: g } = await supabase.from("requisicao_grupos").select("historico, criado_por").eq("id", id).single();
    const historico: Hist[] = Array.isArray(g?.historico) ? (g!.historico as Hist[]) : [];
    const em = new Date().toISOString();
    const upd: Record<string, unknown> = { updated_at: em };

    if (typeof nome === "string" && nome.trim()) {
      upd.nome = nome.trim();
      historico.push({ acao: "renomeou", usuario: usuario || "?", em, detalhe: nome.trim() });
    }
    if (typeof status === "string" && status) {
      // cancelar pede o motivo (José, 17/11/2026: "se foi cancelado precisa de um motivo")
      const mot = typeof motivo === "string" ? motivo.trim().slice(0, 300) : "";
      // concluir/cancelar: só quem criou o grupo ou um Dev (José, 17/11/2026)
      if (status === "concluido" || status === "cancelado") {
        const { data: perm } = await supabase.from("portal_permissoes").select("is_dev").eq("user_id", guarda.user.id).maybeSingle();
        const eu = { nome: guarda.user.nome, email: guarda.user.email, isDev: !!(perm as { is_dev?: boolean } | null)?.is_dev };
        if (!podeFinalizarGrupo((g as { criado_por?: string | null } | null)?.criado_por, eu)) {
          return NextResponse.json({ error: `Só quem criou o grupo (${(g as { criado_por?: string } | null)?.criado_por}) ou um Dev pode concluir ou cancelar.` }, { status: 403 });
        }
      }
      if (status === "cancelado" && mot.length < 3) return NextResponse.json({ error: "Escreva o motivo do cancelamento" }, { status: 400 });
      upd.status = status;
      historico.push({
        acao: status === "concluido" ? "concluiu" : status === "cancelado" ? "cancelou" : "reabriu",
        usuario: usuario || "?", em, ...(status === "cancelado" ? { detalhe: mot } : {}),
      });
    }
    if (typeof fecha_sozinho === "boolean") {
      upd.fecha_sozinho = fecha_sozinho;
      historico.push({ acao: fecha_sozinho ? "marcou para concluir sozinho" : "marcou para ficar aberto", usuario: usuario || "?", em });
    }
    upd.historico = historico;

    const { error } = await supabase.from("requisicao_grupos").update(upd).eq("id", id);
    if (error && semColuna(error.message)) return NextResponse.json({ error: "Falta rodar o SQL sql/requisicao-grupos-fecha-sozinho.sql no Supabase do portal." }, { status: 503 });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
