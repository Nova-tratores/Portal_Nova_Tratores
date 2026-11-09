import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as sb } from '@/lib/server/supabase-admin';
import { parseConta } from '@/lib/estoque/conta';
import { protegerRota } from '@/lib/ajustes/permissao-server';

export const dynamic = 'force-dynamic';

// Sugestões para a Consulta Estoque: busca por NOME (ou pedaço do código) no cadastro local de produtos.
// A consulta em si continua pelo código no Omie (/api/estoque/buscar); isto só ajuda a achar o código
// (auditoria 06/11/2026: "no celular, em campo, ninguém sabe o código de cabeça").
export async function GET(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: 'estoque' }, { modulo: 'ppv' }, { modulo: 'pos' }]);
  if (g.resposta) return g.resposta;
  const q = (req.nextUrl.searchParams.get('q') || '').trim();
  const conta = parseConta(req.nextUrl.searchParams.get('conta'));
  // termos de 2+ letras, sem os caracteres que o filtro do PostgREST usa
  const termos = q.split(/\s+/).map((t) => t.replace(/[%*,()"\\]/g, '')).filter((t) => t.length >= 2).slice(0, 5);
  if (!termos.length) return NextResponse.json({ itens: [] });

  let consulta = sb.from('produtos')
    .select('codigo, descricao, estoque, conta_omie')
    .eq('arquivado', false)
    .order('estoque', { ascending: false })
    .limit(20);
  if (conta) consulta = consulta.eq('conta_omie', conta.toLowerCase()); // na tabela: 'nova' / 'castro'
  // um termo: nome OU código; vários: todos no nome
  if (termos.length === 1) consulta = consulta.or(`descricao.ilike.*${termos[0]}*,codigo.ilike.*${termos[0]}*`);
  else for (const t of termos) consulta = consulta.ilike('descricao', `%${t}%`);

  const { data, error } = await consulta;
  if (error) return NextResponse.json({ itens: [], erro: error.message }, { status: 500 });
  return NextResponse.json({
    itens: (data || []).map((p) => ({ codigo: String(p.codigo), descricao: String(p.descricao || '').replace(/\s{2,}/g, ' ').trim(), estoque: Number(p.estoque) || 0, conta: p.conta_omie })),
  });
}
