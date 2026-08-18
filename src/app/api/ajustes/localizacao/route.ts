/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { autenticar } from '@/lib/auth/server';
import { definirLocalizacao, liberarLocalizacao, type AlvoProduto } from '@/lib/ajustes/localizacao';

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

    if (acao === 'liberar') {
      const r = await liberarLocalizacao({ empresa, codigo_produto }, autor);
      return NextResponse.json({ ok: true, ...r });
    }

    if (acao === 'definir') {
      const { prateleira = '', andar = '', caixa = '', liberar } = body;
      // Libera os ocupantes anteriores ANTES (se o usuário optou por isso).
      const liberados: any[] = [];
      if (Array.isArray(liberar)) {
        for (const alvo of liberar as AlvoProduto[]) {
          if (!alvo?.empresa || !alvo?.codigo_produto) continue;
          const r = await liberarLocalizacao({ empresa: alvo.empresa, codigo_produto: alvo.codigo_produto }, autor);
          liberados.push({ empresa: alvo.empresa, codigo_produto: alvo.codigo_produto, ...r });
        }
      }
      const r = await definirLocalizacao({ empresa, codigo_produto }, { prateleira, andar, caixa }, autor);
      return NextResponse.json({ ok: true, ...r, liberados });
    }

    return NextResponse.json({ erro: 'acao inválida (use definir|liberar)' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
