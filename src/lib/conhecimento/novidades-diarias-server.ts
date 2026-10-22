/* eslint-disable @typescript-eslint/no-explicit-any */
// NOVIDADES DO DIA — servidor (José, 22/10/2026). Roda às 07:00 (agendamento
// 'novidades-diarias'): junta as versões publicadas ATÉ ontem que ainda não viraram
// aviso, escreve UMA novidade por módulo (IA; sem IA, a lista dos commits), publica
// direto em kb_novidades e avisa no sino quem tem acesso ao módulo. O aviso
// "O que mudou" (components/conhecimento/Novidades.tsx) mostra o texto ao entrar.
// Regras puras em ./novidades-diarias.ts.
import { supabaseAdmin as sb } from "@/lib/server/supabase-admin";
import { chamarIA } from "@/lib/assistente/ia";
import { filtrarDestinatarios } from "@/lib/notif/prefs";
import { rotuloModulo } from "./modulos";
import { lerCommit, type CommitBruto, type CommitLido } from "./releases";
import {
  NOVIDADES_DIARIAS_DESDE, SISTEMA_NOVIDADE_DIA, agruparPorModulo, entradaIA, inicioDoDiaBR,
  temAcessoModulo, textoDaIA, textoSemIA, type UsuarioAcesso,
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

async function usuariosComAcesso(): Promise<(UsuarioAcesso & { categoria: string | null; notif_silenciado: unknown })[]> {
  const [perms, ativos] = await Promise.all([
    sb.from("portal_permissoes").select("user_id, is_admin, is_dev, modulos_permitidos, categoria, notif_silenciado"),
    sb.from("financeiro_usu").select("id").eq("ativo", true),
  ]);
  if (perms.error) throw perms.error;
  const ok = new Set((ativos.data || []).map((u: any) => u.id));
  return (perms.data || []).filter((p: any) => ok.has(p.user_id)).map((p: any) => ({
    user_id: p.user_id, is_admin: p.is_admin, is_dev: p.is_dev, modulos: (p.modulos_permitidos || []) as string[],
    categoria: p.categoria ?? null, notif_silenciado: p.notif_silenciado,
  }));
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

  // um aviso no sino por pessoa, com os módulos dela que mudaram
  let avisados = 0;
  if (publicadas.length) {
    const usuarios = await usuariosComAcesso();
    const podeAviso = new Set(filtrarDestinatarios("conhecimento", usuarios as any));
    const linhas: any[] = [];
    for (const u of usuarios) {
      if (!podeAviso.has(u.user_id)) continue;
      const dela = publicadas.filter((p) => temAcessoModulo(u, p.modulo));
      if (!dela.length) continue;
      linhas.push({
        user_id: u.user_id, tipo: "sistema",
        titulo: dela.length === 1 ? `O que mudou em ${rotuloModulo(dela[0].modulo)}` : `O que mudou ontem no portal (${dela.length} módulos)`,
        descricao: dela.map((p) => (dela.length === 1 ? p.titulo : `${rotuloModulo(p.modulo)}: ${p.titulo}`)).join(" · ").slice(0, 500),
        link: "/conhecimento/novidades",
      });
    }
    for (let i = 0; i < linhas.length; i += 200) {
      const { error: en } = await sb.from("portal_notificacoes").insert(linhas.slice(i, i + 200));
      if (en) console.error("[novidades-diarias] sino:", en.message); else avisados += linhas.slice(i, i + 200).length;
    }
  }

  // marca as versões como avisadas (não repete amanhã)
  const dia = agora.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  for (const r of pendentes as any[]) {
    await sb.from("sistema_releases").update({ resumo: { ...(r.resumo || {}), novidade_diaria: dia } }).eq("id", r.id);
  }
  return { versoes: pendentes.length, novidades: publicadas.map(({ modulo, titulo }) => ({ modulo, titulo })), avisados };
}
