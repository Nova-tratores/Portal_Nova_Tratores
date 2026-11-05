import { NextRequest, NextResponse } from "next/server";
import { dataLocal, diasParaPrazo, resumoPainel, situacaoEfetiva, type LinhaPainel } from "@/lib/treinamento/regras";
import { painelEquipe } from "@/lib/treinamento/server";
import { erroResposta, gereAlgo, guardarTreinamento, negado } from "@/lib/treinamento/rota";

export const dynamic = "force-dynamic";

// GET /api/treinamento/equipe → quem concluiu, quem está atrasado, nota por trilha (quem gere)
export async function GET(req: NextRequest) {
  const e = await guardarTreinamento(req);
  if (e.resposta) return e.resposta;
  const s = e.sessao;
  if (!gereAlgo(s)) return negado("Você não gere trilhas de treinamento.");
  try {
    const { trilhas, atribuicoes, progresso } = await painelEquipe(s.gere);
    const hoje = dataLocal(new Date());
    // só a atribuição vigente (maior ciclo) de cada pessoa por trilha
    const vistos = new Set<string>();
    const linhas: LinhaPainel[] = [];
    for (const a of [...atribuicoes].sort((x, y) => y.ciclo - x.ciclo)) {
      const k = `${a.trilha_id}:${a.user_id}`;
      if (vistos.has(k)) continue;
      vistos.add(k);
      linhas.push({ atribuicao: a, situacao: situacaoEfetiva(a, hoje), dias: diasParaPrazo(a.prazo, hoje), pct: progresso[a.id] ?? 0 });
    }
    const porTrilha = trilhas.map((t) => {
      const ls = linhas.filter((l) => l.atribuicao.trilha_id === t.id);
      return { trilha: t, linhas: ls, resumo: resumoPainel(ls) };
    });
    return NextResponse.json({ ok: true, hoje, porTrilha, resumo: resumoPainel(linhas) });
  } catch (err) {
    return erroResposta(err, "painel");
  }
}
