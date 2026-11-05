// Trilha piloto do Pós-Vendas: "Pós-Vendas — operação da OS".
//
//   npx tsx --env-file=.env.local scripts/treinamento-seed-pos.ts [--ativar]
//
// Etapas = os 7 artigos publicados do /pos (na ordem da tela); prova = 10 perguntas
// escritas a partir desses artigos. Nota mínima 70 %, prazo 7 dias, público "Pós Vendas"
// (decisões de 02/10/2026). Nasce como RASCUNHO; com --ativar, ativa e atribui a todo
// mundo da categoria. Idempotente pelo título.

import { createClient } from "@supabase/supabase-js";

const HENRI = { id: "8d43db92-0943-4c88-9a0b-b7f52a11ff55", nome: "Henri Irneh" };
const TITULO = "Pós-Vendas — operação da OS";
const SLUGS = ["pos-fases-na-ordem-do-quadro", "pos-como-a-os-muda-de-fase", "pos-campos-obrigatorios-para-abrir-uma-os", "pos-campos-obrigatorios-para-concluir", "pos-o-que-acontece-ao-enviar-ao-omie", "pos-nfs-e", "pos-outras-regras-automaticas"];

const PERGUNTAS: { slug: string; enunciado: string; opcoes: string[]; correta: number; explicacao: string }[] = [
  { slug: SLUGS[0], enunciado: "Em qual fase uma OS nasce no quadro?", opcoes: ["Orçamento", "Execução", "Orçamento Aprovado", "Aguardando ordem Técnico"], correta: 0, explicacao: "A fase inicial padrão é Orçamento; Data = hoje e Tipo = Manutenção." },
  { slug: SLUGS[0], enunciado: "O que acontece com uma fase que não tem nenhuma OS?", opcoes: ["Aparece vazia no quadro", "Não aparece no quadro", "Aparece recolhida", "Aparece em cinza"], correta: 1, explicacao: "Fase sem OS não aparece. Só Concluída e Cancelada abrem recolhidas." },
  { slug: SLUGS[1], enunciado: "Marcar \"Reservado\" numa OS em fase de orçamento faz o quê?", opcoes: ["Leva para Execução", "Pergunta o dia e leva para Orçamento Aprovado, gravando a Data Início", "Envia a OS ao Omie", "Só muda a cor do card"], correta: 1, explicacao: "Reservado pergunta o dia e leva para Orçamento Aprovado, gravando a Data Início; desmarcar volta para Orçamento enviado." },
  { slug: SLUGS[1], enunciado: "Como se move uma OS de fase manualmente?", opcoes: ["Arrastando o card entre colunas", "Pelo seletor de fase no card (precisa da ação \"Mover de fase\")", "Pelo botão Imprimir", "Só o administrador consegue"], correta: 1, explicacao: "Não há arrastar e soltar: a mudança manual é pelo seletor de fase no card, com a ação \"Mover de fase\"." },
  { slug: SLUGS[2], enunciado: "Qual é a única validação para abrir uma OS?", opcoes: ["Técnico preenchido", "Cliente (e o cliente não pode estar inativo no Omie)", "Projeto e descrição", "Datas e horas"], correta: 1, explicacao: "A única validação é o Cliente; cliente inativo no Omie não abre OS. Os outros campos ficam a critério de quem abre." },
  { slug: SLUGS[3], enunciado: "O que precisa estar preenchido para concluir uma OS?", opcoes: ["Relatório do técnico", "Horas e km", "Número da Ordem Omie", "Data fim"], correta: 2, explicacao: "Sem o número da Ordem Omie a OS avisa: \"A OS precisa ser enviada para o Omie antes de ser concluída.\"" },
  { slug: SLUGS[3], enunciado: "Para cancelar uma OS, o que é obrigatório?", opcoes: ["Nada, basta mudar a fase", "Motivo do Cancelamento (e o ID do substituto, se marcar \"Tem substituto?\")", "Autorização do financeiro", "Estornar o PPV"], correta: 1, explicacao: "Cancelar exige o Motivo do Cancelamento; se marcar \"Tem substituto?\", o ID do substituto também." },
  { slug: SLUGS[4], enunciado: "Depois de enviar a OS ao Omie, dá para desfazer pelo portal?", opcoes: ["Sim, pelo botão Voltar", "Sim, em até 24 horas", "Não: o envio cria ordem real no Omie e é irreversível", "Só o técnico consegue"], correta: 2, explicacao: "O envio cria ordem real no Omie e é irreversível." },
  { slug: SLUGS[5], enunciado: "Quem emite a NFS-e da OS?", opcoes: ["O portal, ao concluir a OS", "O Omie; o portal só lê a nota emitida e liga à OS", "O técnico, pelo aplicativo", "A prefeitura, automaticamente"], correta: 1, explicacao: "O portal não emite NFS-e: só lê as notas já emitidas no Omie e vincula à OS, três vezes por dia." },
  { slug: SLUGS[6], enunciado: "Alimentação lançada na OS vira o quê?", opcoes: ["Um desconto na OS", "Uma requisição \"Alimentação\" em aberto no nome do técnico", "Um item do PPV", "Nada; é só informativo"], correta: 1, explicacao: "Vira requisição \"Alimentação\" no nome do técnico; ao concluir a OS vai para o financeiro, ao cancelar vai para a lixeira." },
];

async function main() {
  const ativar = process.argv.includes("--ativar");
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data: arts, error: e0 } = await sb.from("kb_artigos").select("id, slug, status").in("slug", SLUGS);
  if (e0) throw new Error(e0.message);
  const porSlug = new Map((arts || []).map((a) => [a.slug as string, a]));
  const faltam = SLUGS.filter((s) => porSlug.get(s)?.status !== "publicado");
  if (faltam.length) throw new Error(`Artigos não publicados: ${faltam.join(", ")}`);

  let { data: t } = await sb.from("lms_trilhas").select("*").eq("titulo", TITULO).maybeSingle();
  if (!t) {
    const { data, error } = await sb.from("lms_trilhas").insert({
      titulo: TITULO, descricao: "Como a OS anda no portal: fases, obrigatórios, envio ao Omie, nota e regras automáticas.",
      modulo: "pos", publico: ["Pós Vendas"], obrigatoria: true, nota_minima: 70, prazo_dias: 7, status: "rascunho", criado_por: HENRI.id, criado_por_nome: HENRI.nome,
    }).select("*").single();
    if (error) throw new Error(error.message);
    t = data;
    console.log("trilha criada", t.id);
  } else console.log("trilha já existe", t.id);

  for (let i = 0; i < SLUGS.length; i++) {
    const { error } = await sb.from("lms_etapas").upsert({ trilha_id: t.id, artigo_id: porSlug.get(SLUGS[i])!.id, ordem: (i + 1) * 10 }, { onConflict: "trilha_id,artigo_id" });
    if (error) throw new Error(error.message);
  }
  const { count } = await sb.from("lms_perguntas").select("*", { count: "exact", head: true }).eq("trilha_id", t.id);
  if (!count) {
    const { error } = await sb.from("lms_perguntas").insert(PERGUNTAS.map((p, i) => ({ trilha_id: t.id, artigo_id: porSlug.get(p.slug)!.id, ordem: i + 1, enunciado: p.enunciado, opcoes: p.opcoes, correta: p.correta, explicacao: p.explicacao })));
    if (error) throw new Error(error.message);
    console.log(`${PERGUNTAS.length} perguntas`);
  } else console.log(`perguntas já existem (${count})`);

  if (ativar && t.status !== "ativa") {
    const { error } = await sb.from("lms_trilhas").update({ status: "ativa" }).eq("id", t.id);
    if (error) throw new Error(error.message);
    const { data: perms } = await sb.from("portal_permissoes").select("user_id").eq("categoria", "Pós Vendas");
    const ids = (perms || []).map((p) => p.user_id);
    const { data: usu } = await sb.from("financeiro_usu").select("id, nome, ativo").in("id", ids);
    const prazo = new Date(); prazo.setDate(prazo.getDate() + 7);
    const p = `${prazo.getFullYear()}-${String(prazo.getMonth() + 1).padStart(2, "0")}-${String(prazo.getDate()).padStart(2, "0")}`;
    const pessoas = (usu || []).filter((u) => u.ativo !== false);
    for (const u of pessoas) {
      const { error: e2 } = await sb.from("lms_atribuicoes").upsert({ trilha_id: t.id, user_id: u.id, user_nome: u.nome, ciclo: 1, origem: "categoria", prazo: p }, { onConflict: "trilha_id,user_id,ciclo", ignoreDuplicates: true });
      if (e2) console.error(u.nome, e2.message);
      await sb.from("portal_notificacoes").insert({ user_id: u.id, tipo: "sistema", titulo: "Treinamento para fazer", descricao: `${TITULO} · até ${p.split("-").reverse().join("/")}`, link: `/treinamento/${t.id}` });
    }
    console.log(`ativa; atribuída a ${pessoas.map((u) => u.nome).join(", ") || "ninguém"} (prazo ${p})`);
  }
  console.log(`pronto: /treinamento/editar/${t.id}`);
}
main().catch((e) => { console.error(e.message || e); process.exit(1); });
