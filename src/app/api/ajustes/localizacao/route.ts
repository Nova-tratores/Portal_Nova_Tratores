/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { autenticar } from '@/lib/auth/server';
import { definirLocalizacao, liberarLocalizacao, type AlvoProduto } from '@/lib/ajustes/localizacao';
import { registrarAuditLog } from '@/lib/server/audit-notify';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// WRITE no Omie: move/troca ou libera a localização física de uma peça.
//  - acao 'definir': grava #PRATELEIRA/#ANDAR/#CAIXA na peça alvo (e opcionalmente
//    LIBERA os ocupantes anteriores da posição, decisão do usuário no cliente).
//  - acao 'liberar': esvazia a localização da peça alvo (remove da posição).
export async function POST(req: NextRequest) {
  let ctx: { autor?: { userId: string; userName: string }; body?: any } = {};
  try {
    const auth = await autenticar(req);
    if (!auth) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 });
    const body = (await req.json().catch(() => ({}))) as any;
    const { acao, empresa, codigo_produto } = body;
    if (!empresa || !codigo_produto)
      return NextResponse.json({ erro: 'empresa e codigo_produto são obrigatórios' }, { status: 400 });

    // Nome do autor pelo id do token (não-forjável).
    const { data: perfil } = await supabase.from('financeiro_usu').select('nome').eq('id', auth.userId).maybeSingle();
    const autor = { userId: auth.userId, userName: perfil?.nome || auth.email || '—' };
    ctx = { autor, body };

    if (acao === 'liberar') {
      const r = await liberarLocalizacao({ empresa, codigo_produto }, autor);
      return NextResponse.json({ ok: true, ...r });
    }

    if (acao === 'definir') {
      const { prateleira = '', andar = '', caixa = '', liberar } = body;
      // Grava a peça nova PRIMEIRO: se a Omie falhar aqui, nada mudou. Depois libera
      // os ocupantes anteriores (se o usuário optou) um a um — a falha de um não
      // desfaz os outros e volta na lista `falhas` (eles seguem na posição).
      const r = await definirLocalizacao({ empresa, codigo_produto }, { prateleira, andar, caixa }, autor);
      const liberados: any[] = [];
      const falhas: any[] = [];
      if (Array.isArray(liberar)) {
        for (const alvo of liberar as AlvoProduto[]) {
          if (!alvo?.empresa || !alvo?.codigo_produto) continue;
          try {
            const rl = await liberarLocalizacao({ empresa: alvo.empresa, codigo_produto: alvo.codigo_produto }, autor);
            liberados.push({ empresa: alvo.empresa, codigo_produto: alvo.codigo_produto, ...rl });
          } catch (e) {
            falhas.push({ empresa: alvo.empresa, codigo_produto: alvo.codigo_produto, erro: (e as Error).message });
            registrarErro(autor, 'liberar', alvo, null, e);
          }
        }
      }
      return NextResponse.json({ ok: true, ...r, liberados, falhas });
    }

    return NextResponse.json({ erro: 'acao inválida (use definir|liberar)' }, { status: 400 });
  } catch (e) {
    if (ctx.autor && ctx.body) {
      const b = ctx.body;
      registrarErro(ctx.autor, String(b.acao || ''), { empresa: b.empresa, codigo_produto: b.codigo_produto },
        b.acao === 'definir' ? `${b.prateleira ?? ''}|${b.andar ?? ''}|${b.caixa ?? ''}` : null, e);
    }
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}

// Falha ao gravar posição → audit_log (sistema 'localizacao', ação 'erro_gravar'):
// sem isso só sobravam os acertos e não dava pra saber o que a pessoa tentou.
function registrarErro(autor: { userId: string; userName: string }, acao: string, alvo: { empresa: string; codigo_produto: number | string }, posicao: string | null, e: unknown) {
  registrarAuditLog({
    userId: autor.userId, userName: autor.userName, sistema: 'localizacao', acao: 'erro_gravar',
    entidade: 'produto', entidadeId: `${String(alvo.empresa).toUpperCase()}:${alvo.codigo_produto}`,
    detalhes: { operacao: acao, posicao, erro: (e as Error)?.message || String(e) },
  });
}
