// QUADRO DA LOUSA (página de teste /lousa/teste, José 20/10/2026) — só leitura.
// GET /api/lousa/quadro?de=YYYY-MM-DD&ate=YYYY-MM-DD
//  -> { pessoas (técnicos + "Sem técnico"), itens (OS e lançamentos da Lousa na janela), pendentes, agora }
// Mesma leitura da Agenda no modo técnicos (lib/agenda/server.ts), com uma diferença:
// OS SEM dia de execução marcado (sem Dias_Execucao e sem Previsao_Execucao) não vai para
// o dia da criação — vai para as PENDENTES (embaixo da linha vermelha do quadro).
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { carregarAgenda } from '@/lib/agenda/server'
import { addDias, localDe, DIA_RE, osCancelada, solicitacaoDaOS } from '@/lib/agenda/regras'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { TBL_OS } from '@/lib/pos/constants'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export interface PendenteQuadro {
  id: string; cliente: string | null; tecnico: string | null; status: string | null; cidade: string | null
  oficina: boolean; solicitacao: string | null; criadaEm: string | null
}

export async function GET(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  const agora = localDe(new Date().toISOString())
  const sp = req.nextUrl.searchParams
  const de = DIA_RE.test(sp.get('de') || '') ? sp.get('de')! : agora.dia
  let ate = DIA_RE.test(sp.get('ate') || '') ? sp.get('ate')! : addDias(de, 13)
  if (ate < de) ate = de
  if (ate > addDias(de, 31)) ate = addDias(de, 31)
  try {
    const [ag, semData] = await Promise.all([
      carregarAgenda(auth, de, ate, 'tecnicos'),
      supabaseAdmin.from(TBL_OS)
        .select('Id_Ordem, Os_Cliente, Os_Tecnico, Os_Tecnico2, Status, Data, Cidade_Cliente, Serv_Solicitado, Servico_Oficina, Previsao_Execucao, Dias_Execucao')
        .is('Previsao_Execucao', null).not('Status', 'in', '("Concluída","Cancelada")')
        .gte('Data', addDias(agora.dia, -180)).order('Data', { ascending: false }).limit(300),
    ])
    const pendentes: PendenteQuadro[] = ((semData.data || []) as Record<string, unknown>[])
      .filter((o) => !osCancelada(String(o.Status || '')) && !String(o.Dias_Execucao || '').trim())
      .map((o) => ({
        id: String(o.Id_Ordem), cliente: (o.Os_Cliente as string) || null,
        tecnico: [o.Os_Tecnico, o.Os_Tecnico2].filter((n) => String(n || '').trim()).join(' + ') || null,
        status: (o.Status as string) || null, cidade: (o.Cidade_Cliente as string) || null, oficina: !!o.Servico_Oficina,
        solicitacao: solicitacaoDaOS(o.Serv_Solicitado as string) || null, criadaEm: (o.Data as string) || null,
      }))
    const idsPendentes = new Set(pendentes.map((p) => p.id))
    // OS sem dia marcado: a agenda põe no dia da criação; no quadro ela é pendente
    const itens = ag.itens.filter((i) => (i.fonte === 'os' && !idsPendentes.has(i.ref)) || i.fonte === 'lousa')
    return NextResponse.json({ pessoas: ag.pessoas, itens, pendentes, avisos: ag.avisos, de, ate, agora })
  } catch (e) {
    console.error('[lousa/quadro]', e)
    return NextResponse.json({ error: 'Falha ao montar o quadro' }, { status: 500 })
  }
}
