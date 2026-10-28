/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { autenticar } from '@/lib/auth/server';
import { registrarAuditLog } from '@/lib/server/audit-notify';
import { incluirNaContagem, skusEmContagem } from '@/lib/ajustes/inventario';

export const dynamic = 'force-dynamic';

// Marca "localização conferida" COMPARTILHADA, por PRODUTO (empresa × codigo_produto).
// status 'conferido' (✓) / 'divergente' (⚠ está em outro lugar). Separada do caracteristicas_ok.
// "Quantidade diferente" = conferido + `contar: true` → a peça vai pra contagem cega
// (/ajustes/inventario/contagem), que concilia e gera o ajuste se a diferença se confirmar.
// Leitura livre; escrita autenticada via service role (RLS bloqueia o cliente).
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// GET → todas as conferências.
export async function GET() {
  const { data, error } = await supabase
    .from('localizacao_conferida')
    .select('empresa, codigo_produto, status, posicao, conferido_nome, conferido_em');
  if (error) {
    console.error('[localizacao/conferir] GET erro:', error.message);
    return NextResponse.json({ erro: 'Falha ao carregar conferências.' }, { status: 500 });
  }
  let naContagem: string[] = [];
  try { naContagem = await skusEmContagem(); } catch (e) { console.warn('[localizacao/conferir] contagem:', (e as Error).message); }
  return NextResponse.json({ conferidas: data || [], naContagem });
}

// POST { empresa, codigo_produto, status, posicao, contar?, sku? } → grava ✓/⚠ ou limpa (status vazio);
// com `contar` + `sku`, também põe a peça na contagem.
export async function POST(req: NextRequest) {
  try {
    const auth = await autenticar(req);
    if (!auth) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 });
    const { empresa, codigo_produto, status, posicao, contar, sku } = (await req.json().catch(() => ({}))) as any;
    if (!empresa || codigo_produto == null)
      return NextResponse.json({ erro: 'empresa e codigo_produto sao obrigatorios' }, { status: 400 });
    if (status != null && status !== 'conferido' && status !== 'divergente')
      return NextResponse.json({ erro: 'status invalido' }, { status: 400 });

    const cp = String(codigo_produto);
    const { data: perfil } = await supabase.from('financeiro_usu').select('nome').eq('id', auth.userId).maybeSingle();
    const nome = perfil?.nome || auth.email || '—';

    if (status) {
      const { error } = await supabase
        .from('localizacao_conferida')
        .upsert(
          { empresa, codigo_produto: cp, status, posicao: posicao ?? null, conferido_por: auth.userId, conferido_nome: nome, conferido_em: new Date().toISOString() },
          { onConflict: 'empresa,codigo_produto' },
        );
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('localizacao_conferida')
        .delete()
        .eq('empresa', empresa).eq('codigo_produto', cp);
      if (error) throw error;
    }

    let contagem: any = null;
    if (contar) {
      try { contagem = await incluirNaContagem(String(sku || ''), { criadoPor: `conferencia-localizacao:${nome}` }); }
      catch (e) { contagem = { ok: false, erro: (e as Error).message }; }
    }

    registrarAuditLog({
      userId: auth.userId, userName: nome, sistema: 'localizacao', acao: contar ? 'pedir_contagem' : 'conferir',
      entidade: 'produto', entidadeId: `${empresa}:${cp}`,
      detalhes: { status: status || null, posicao: posicao || null, ...(contar ? { sku: sku || null, contagem } : {}) },
    });

    return NextResponse.json({ ok: true, conferido_nome: nome, contagem });
  } catch (e) {
    console.error('[localizacao/conferir] POST erro:', (e as Error).message);
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
