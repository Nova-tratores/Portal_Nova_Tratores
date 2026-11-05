import { NextRequest, NextResponse } from "next/server";
import { registrarAuditLog } from "@/lib/server/audit-notify";
import { dataLocal, situacaoEfetiva, validarTrilha } from "@/lib/treinamento/regras";
import { artigosPublicados, atribuicoesDoUsuario, criarTrilha, garantirAtribuicoes, listarTrilhas, obterTrilha, situacaoDaPessoa, vigente } from "@/lib/treinamento/server";
import { erroResposta, gereAlgo, gereModulo, guardarTreinamento, negado } from "@/lib/treinamento/rota";

export const dynamic = "force-dynamic";

// GET /api/treinamento → minhas trilhas (com progresso) + trilhas que eu giro + artigos publicados (para o editor)
export async function GET(req: NextRequest) {
  const e = await guardarTreinamento(req);
  if (e.resposta) return e.resposta;
  const s = e.sessao;
  try {
    await garantirAtribuicoes({ id: s.userId, nome: s.autor.nome, categoria: s.categoria });
    const minhasAtr = await atribuicoesDoUsuario(s.userId);
    const ids = Array.from(new Set(minhasAtr.map((a) => a.trilha_id)));
    const hoje = dataLocal(new Date());
    const minhas = [];
    for (const id of ids) {
      const d = await obterTrilha(id);
      const a = vigente(minhasAtr, id);
      if (!d || !a || d.trilha.status === "arquivada") continue;
      const sit = await situacaoDaPessoa(d, a);
      minhas.push({ trilha: d.trilha, atribuicao: a, progresso: sit.progresso, situacao: situacaoEfetiva(a, hoje), etapas: sit.etapas.length });
    }
    const gerir = gereAlgo(s) ? (await listarTrilhas({ modulos: s.gere ?? undefined })) : [];
    const artigos = gereAlgo(s) && req.nextUrl.searchParams.get("artigos") === "1" ? await artigosPublicados() : [];
    return NextResponse.json({ ok: true, minhas, gerir, artigos, podeGerir: gereAlgo(s), modulosQueGere: s.gere, hoje });
  } catch (err) {
    return erroResposta(err, "listar");
  }
}

// POST /api/treinamento → cria trilha (rascunho)
export async function POST(req: NextRequest) {
  const e = await guardarTreinamento(req);
  if (e.resposta) return e.resposta;
  const s = e.sessao;
  const { trilha, erros } = validarTrilha(await req.json().catch(() => ({})));
  if (erros.length) return NextResponse.json({ ok: false, erro: erros.join(" ") }, { status: 400 });
  if (!gereModulo(s, trilha.modulo)) return negado("Você não gere trilhas deste módulo.");
  try {
    const t = await criarTrilha(trilha, s.autor);
    await registrarAuditLog({ userId: s.userId, userName: s.autor.nome, sistema: "treinamento", acao: "criar_trilha", entidade: "trilha", entidadeId: t.id, entidadeLabel: t.titulo, detalhes: { modulo: t.modulo } });
    return NextResponse.json({ ok: true, trilha: t });
  } catch (err) {
    return erroResposta(err, "criar trilha");
  }
}
