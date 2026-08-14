// Tarefas do PPV: atribuir uma tarefa a um usuário no pedido, com linha do tempo
// (criada → visto → remarcado → concluída) e notificação in-app pro atribuído.
// Anexos reusam ppv_anexos (coluna id_tarefa). Toda falha é logada com contexto.
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } },
);

export interface TarefaEvento { id: number; tipo: string; detalhe: string | null; autor: string | null; criado_em: string }
export interface TarefaAnexo { id: number; tipo: string; url: string | null; nome_arquivo: string | null; comentario: string | null; autor: string | null; created_at: string }
export interface Tarefa {
  id: number; id_pedido: string; atribuido_a: string; criado_por: string | null; descricao: string | null;
  status: string; lembrar_em: string | null; visto_em: string | null; concluido_em: string | null; concluido_por: string | null; criado_em: string;
  eventos: TarefaEvento[]; anexos: TarefaAnexo[];
}

async function addEvento(idTarefa: number, tipo: string, autor?: string | null, detalhe?: string | null) {
  const { error } = await supabase.from("ppv_tarefas_eventos").insert({ id_tarefa: idTarefa, tipo, autor: autor || null, detalhe: detalhe || null });
  if (error) console.error(`[tarefas] evento (${idTarefa}/${tipo}): ${error.message}`);
}

// Notifica o usuário atribuído (resolve nome -> user_id em financeiro_usu).
async function notificarAtribuido(nome: string, idPedido: string, titulo: string, descricao: string) {
  try {
    const { data: usu } = await supabase.from("financeiro_usu").select("id").eq("nome", nome).limit(1);
    const userId = usu?.[0]?.id;
    if (!userId) { console.error(`[tarefas] usuário não encontrado p/ notificar: ${nome}`); return; }
    const { error } = await supabase.from("portal_notificacoes").insert({
      user_id: userId, tipo: "ppv-tarefa", titulo, descricao, link: `/ppv?id=${encodeURIComponent(idPedido)}&tarefas=1`,
    });
    if (error) console.error(`[tarefas] notificar (${nome}): ${error.message}`);
  } catch (e) { console.error(`[tarefas] notificar (${nome}): ${(e as Error).message}`); }
}

export async function criarTarefa(idPedido: string, atribuidoA: string, criadoPor: string, descricao: string): Promise<{ ok: boolean; id?: number; erro?: string }> {
  const { data, error } = await supabase.from("ppv_tarefas")
    .insert({ id_pedido: idPedido, atribuido_a: atribuidoA, criado_por: criadoPor, descricao })
    .select("id").limit(1);
  if (error || !data?.[0]) {
    console.error(`[tarefas] criar (${idPedido} -> ${atribuidoA}) — rodou sql/ppv-tarefas.sql? ${error?.message}`);
    return { ok: false, erro: error?.message || "Falha ao criar tarefa." };
  }
  const id = Number(data[0].id);
  await addEvento(id, "criada", criadoPor, `Atribuída a ${atribuidoA}`);
  await notificarAtribuido(atribuidoA, idPedido, `Nova tarefa — PPV ${idPedido}`, `${criadoPor} te atribuiu uma tarefa: ${(descricao || "").slice(0, 120)}`);
  console.log(`[tarefas] criada #${id} (PPV ${idPedido}) por ${criadoPor} -> ${atribuidoA}`);
  return { ok: true, id };
}

export async function listarTarefas(idPedido: string): Promise<Tarefa[]> {
  const { data: tars, error } = await supabase.from("ppv_tarefas").select("*").eq("id_pedido", idPedido).order("criado_em", { ascending: false });
  if (error) { console.error(`[tarefas] listar (${idPedido}): ${error.message}`); return []; }
  const tarefas = (tars || []) as Omit<Tarefa, "eventos" | "anexos">[];
  if (tarefas.length === 0) return [];
  const ids = tarefas.map((t) => t.id);
  const [{ data: evs }, { data: anx }] = await Promise.all([
    supabase.from("ppv_tarefas_eventos").select("*").in("id_tarefa", ids).order("criado_em", { ascending: true }),
    supabase.from("ppv_anexos").select("*").in("id_tarefa", ids).order("created_at", { ascending: true }),
  ]);
  return tarefas.map((t) => ({
    ...t,
    eventos: ((evs || []) as (TarefaEvento & { id_tarefa: number })[]).filter((e) => e.id_tarefa === t.id),
    anexos: ((anx || []) as (TarefaAnexo & { id_tarefa: number })[]).filter((a) => a.id_tarefa === t.id),
  }));
}

export async function contarPendentes(idPedido: string): Promise<number> {
  const { count, error } = await supabase.from("ppv_tarefas").select("id", { count: "exact", head: true })
    .eq("id_pedido", idPedido).eq("status", "pendente");
  if (error) { console.error(`[tarefas] contar (${idPedido}): ${error.message}`); return 0; }
  return count || 0;
}

// Marca como VISTO (só a 1ª vez) — quando o atribuído abre a tarefa.
export async function marcarVisto(idTarefa: number, autor: string): Promise<{ ok: boolean }> {
  const { data } = await supabase.from("ppv_tarefas").select("visto_em").eq("id", idTarefa).limit(1);
  if (data?.[0] && !data[0].visto_em) {
    const agora = new Date().toISOString();
    const { error } = await supabase.from("ppv_tarefas").update({ visto_em: agora }).eq("id", idTarefa);
    if (error) { console.error(`[tarefas] visto (${idTarefa}): ${error.message}`); return { ok: false }; }
    await addEvento(idTarefa, "visto", autor);
    console.log(`[tarefas] #${idTarefa} vista por ${autor}`);
  }
  return { ok: true };
}

// "Lembrar depois" — remarca a tarefa pra uma nova data.
export async function remarcar(idTarefa: number, lembrarEm: string, autor: string): Promise<{ ok: boolean; erro?: string }> {
  const { error } = await supabase.from("ppv_tarefas").update({ lembrar_em: lembrarEm }).eq("id", idTarefa);
  if (error) { console.error(`[tarefas] remarcar (${idTarefa}): ${error.message}`); return { ok: false, erro: error.message }; }
  const dataBR = new Date(lembrarEm).toLocaleString("pt-BR");
  await addEvento(idTarefa, "remarcado", autor, `Lembrar em ${dataBR}`);
  console.log(`[tarefas] #${idTarefa} remarcada p/ ${dataBR} por ${autor}`);
  return { ok: true };
}

export async function concluir(idTarefa: number, autor: string): Promise<{ ok: boolean; erro?: string }> {
  const { error } = await supabase.from("ppv_tarefas")
    .update({ status: "concluida", concluido_em: new Date().toISOString(), concluido_por: autor }).eq("id", idTarefa);
  if (error) { console.error(`[tarefas] concluir (${idTarefa}): ${error.message}`); return { ok: false, erro: error.message }; }
  await addEvento(idTarefa, "concluida", autor);
  console.log(`[tarefas] #${idTarefa} concluída por ${autor}`);
  return { ok: true };
}
