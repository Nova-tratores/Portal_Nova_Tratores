// Robô diário dos recebimentos esquecidos (26/11/2026). Só servidor.
// Lê as notas pendentes do espelho (a MESMA lista da tela, já com tipo, responsável e
// transportadora do CT-e), e avisa no sino: o responsável (7–90 dias, um resumo por
// pessoa) e o gestor direto do responsável (15–90 dias). Regras em recebimentos-esquecidos.ts.
import { supabaseAdmin as sb } from '@/lib/server/supabase-admin';
import { listarRecebimentosEspelho } from '@/lib/ajustes/recebimentos-espelho';
import { notificarUsuario } from '@/lib/pecas/unidades-server';
import { gestorDe } from '@/lib/requisicoes/lembretes';
import { planejarAvisos, linhaNota, linkAviso, corpoAviso, DIAS_ESQUECIDA, DIAS_ANTIGA, type NotaParada } from './recebimentos-esquecidos';

export interface ResultadoEsquecidos { resumo?: string; pular?: string }

export async function vigiarRecebimentosEsquecidos(opts: { gravar?: boolean; agora?: Date } = {}): Promise<ResultadoEsquecidos> {
  const gravar = opts.gravar !== false;
  // "hoje" em Brasília
  const hoje = new Date(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(opts.agora || new Date()) + 'T12:00:00');

  const notas: NotaParada[] = [];
  for (const conta of ['NOVA', 'CASTRO'] as const) {
    const { recebimentos } = await listarRecebimentosEspelho(conta, 'pendentes');
    for (const r of recebimentos) {
      notas.push({
        conta, idReceb: r.idReceb, numero: r.numeroNFe, fornecedor: r.fornecedorNome, valor: Number(r.valorNFe) || 0,
        emissao: r.dataEmissao, cte: !!r.cte, responsavelUserId: r.responsavelUserId || null,
      });
    }
  }

  const [{ data: orgRaw }, { data: usuRaw }] = await Promise.all([
    sb.from('org_pessoas').select('pessoa_chave, gestor_chave'),
    sb.from('financeiro_usu').select('id, nome, ativo'),
  ]);
  const org = (orgRaw || []) as { pessoa_chave: string; gestor_chave: string | null }[];
  const usuarios = new Map(((usuRaw || []) as { id: string; nome: string | null; ativo: boolean | null }[]).map((u) => [u.id, u]));
  const ativo = (id: string | null) => !!id && usuarios.get(id)?.ativo !== false && usuarios.has(id);

  const plano = planejarAvisos(notas, hoje, (id) => { const g = gestorDe(id, org); return ativo(g) ? g : null; }, (id) => usuarios.get(id)?.nome || 'sem nome');

  let avisos = 0;
  for (const [uid, ls] of plano.responsavel) {
    if (!ativo(uid)) { plano.semDono.push(...ls); continue; }
    avisos++;
    if (!gravar) continue;
    await notificarUsuario(uid, {
      titulo: ls.length === 1 ? `Recebimento esquecido: ${linhaNota(ls[0]).split(' · ')[0]} há ${ls[0].dias} dias` : `${ls.length} recebimentos esquecidos (${DIAS_ESQUECIDA}+ dias sem entrada)`,
      descricao: corpoAviso(ls.map(linhaNota)),
      link: linkAviso(ls),
    });
  }
  let aoGestor = 0;
  for (const [gid, ls] of plano.gestor) {
    aoGestor++;
    if (!gravar) continue;
    await notificarUsuario(gid, {
      titulo: `${ls.length} recebimento(s) da sua equipe parado(s) há 15+ dias`,
      descricao: corpoAviso(ls.map((x) => `${x.quem}: ${linhaNota(x.l)}`)),
      link: linkAviso(ls.map((x) => x.l)),
    });
  }

  return {
    resumo: `${notas.length} pendentes · ${avisos} responsável(is) avisado(s) · ${aoGestor} gestor(es)` +
      `${plano.semDono.length ? ` · ${plano.semDono.length} esquecida(s) sem responsável ativo` : ''}` +
      ` · ${plano.antigas} com mais de ${DIAS_ANTIGA} dias (fora do aviso)${gravar ? '' : ' · SIMULAÇÃO'}`,
  };
}
