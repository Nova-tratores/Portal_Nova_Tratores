/* eslint-disable @typescript-eslint/no-explicit-any */
// NOVIDADES DO DIA — servidor (José, 22/10/2026). Roda às 07:00 (agendamento
// 'novidades-diarias'): junta as versões publicadas ATÉ ontem que ainda não viraram
// aviso, escreve UMA novidade por módulo (IA; sem IA, a lista dos commits), publica
// direto em kb_novidades. Desde 29/10/2026 não vai mais para o sino: aparece nas
// Notícias do portal, no dashboard (components/conhecimento/NoticiasPortal.tsx).
// Regras puras em ./novidades-diarias.ts.
import { supabaseAdmin as sb } from "@/lib/server/supabase-admin";
import { chamarIA } from "@/lib/assistente/ia";
import { rotuloModulo } from "./modulos";
import { lerCommit, type CommitBruto, type CommitLido } from "./releases";
import {
  NOVIDADES_DIARIAS_DESDE, SISTEMA_NOVIDADE_DIA, agruparPorModulo, entradaIA, inicioDoDiaBR,
  textoDaIA, textoSemIA,
} from "./novidades-diarias";

async function redigir(modulo: string, commits: CommitLido[]): Promise<{ titulo: string; texto: string; origem: "ia" | "manual" }> {
  const rotulo = rotuloModulo(modulo);
  try {
    const r: any = await chamarIA({
      messages: [
        { role: "system", content: SISTEMA_NOVIDADE_DIA },
        { role: "user", content: entradaIA(rotulo, commits) },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
    });
    const t = textoDaIA(JSON.parse(r?.choices?.[0]?.message?.content || "{}"));
    if (t) return { ...t, origem: "ia" };
  } catch (e) {
    console.warn("[novidades-diarias] IA falhou em", modulo, e instanceof Error ? e.message : e);
  }
  return { ...textoSemIA(rotulo, commits), origem: "manual" };
}

export interface ResultadoDia { versoes: number; novidades: { modulo: string; titulo: string }[]; avisados: number }

export interface OpcoesDia {
  /** publicar também o que saiu HOJE (botão/manual), e não só até ontem */
  incluirHoje?: boolean;
  /** completa a descrição do commit quando a versão foi registrada sem ela (ex.: lida do git) */
  corpoDoCommit?: (sha: string) => string;
}

export async function publicarNovidadesDoDia(agora: Date = new Date(), op: OpcoesDia = {}): Promise<ResultadoDia> {
  const ate = op.incluirHoje ? agora.toISOString() : inicioDoDiaBR(agora); // padrão: só o que foi publicado ATÉ ontem
  const { data: rels, error } = await sb.from("sistema_releases").select("id, commits, resumo, criado_em")
    .gte("criado_em", NOVIDADES_DIARIAS_DESDE).lt("criado_em", ate).order("criado_em").limit(500);
  if (error) throw error;
  const pendentes = (rels || []).filter((r: any) => !r.resumo?.novidade_diaria);
  if (!pendentes.length) return { versoes: 0, novidades: [], avisados: 0 };

  const commits = pendentes.flatMap((r: any) => (Array.isArray(r.commits) ? r.commits : []) as CommitBruto[]).map((c) => lerCommit(!c.corpo && op.corpoDoCommit ? { ...c, corpo: op.corpoDoCommit(c.sha) } : c));
  const porModulo = agruparPorModulo(commits);
  const ultimaVersao = pendentes[pendentes.length - 1].id;
  const agoraIso = agora.toISOString();

  const publicadas: { modulo: string; titulo: string; id: string }[] = [];
  for (const [modulo, lista] of porModulo) {
    const n = await redigir(modulo, lista);
    const { data, error: e } = await sb.from("kb_novidades").insert({
      release_id: ultimaVersao, modulo, titulo: n.titulo, texto: n.texto, origem: n.origem, status: "publicado",
      commits: lista.map((c) => ({ sha: c.sha.slice(0, 8), titulo: c.titulo })),
      publicado_em: agoraIso, publicado_por_nome: "Portal (automático)", atualizado_em: agoraIso,
    }).select("id").single();
    if (e) { console.error("[novidades-diarias] gravar", modulo, e.message); continue; }
    publicadas.push({ modulo, titulo: n.titulo, id: (data as any).id });
  }

  // sem aviso no sino (José, 29/10/2026: "tira lá da notificação e só deixa no dashboard, como notícia de jornal");
  // a novidade publicada aparece nas Notícias do portal (components/conhecimento/NoticiasPortal.tsx)
  const avisados = 0;

  // marca as versões como avisadas (não repete amanhã)
  const dia = agora.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  for (const r of pendentes as any[]) {
    await sb.from("sistema_releases").update({ resumo: { ...(r.resumo || {}), novidade_diaria: dia } }).eq("id", r.id);
  }
  return { versoes: pendentes.length, novidades: publicadas.map(({ modulo, titulo }) => ({ modulo, titulo })), avisados };
}
