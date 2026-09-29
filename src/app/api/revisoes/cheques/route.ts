// Cheques online de um chassi (tela de Revisões): GET ?chassis=MDI...
// Devolve um por OS de revisão com a situação da assinatura e os links.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { exigirAcessoModulo } from '@/lib/ajustes/permissao-server';
import { linkCheque } from '@/lib/revisoes/cheque-db';
import { garantirAssinatura, linkAssinatura } from '@/lib/pos/assinatura-cliente-db';
import { normalizarDados } from '@/lib/revisoes/cheque';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

export async function GET(req: NextRequest) {
  try {
    await exigirAcessoModulo(req, 'revisoes');
  } catch (e) {
    const st = (e as { http?: number })?.http || 401;
    return NextResponse.json({ error: e instanceof Error ? e.message : 'não autenticado' }, { status: st });
  }
  const chassis = String(req.nextUrl.searchParams.get('chassis') || '').trim().toUpperCase();
  if (!chassis || !/^[A-Z0-9]{6,}$/.test(chassis)) return NextResponse.json({ error: 'chassis inválido' }, { status: 400 });
  const { data, error } = await db.from('revisao_cheques')
    .select('id,os_id,chassis,horas,pagina,dados,token,assinatura_cliente_url,assinado_em,assinado_nome,assinado_geo,assinado_dispositivo,assinatura_tecnico_url,updated_at')
    .ilike('chassis', chassis)
    .order('horas', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: /revisao_cheques/.test(error.message) ? 503 : 500 });
  const itens = await Promise.all((data || []).map(async (c) => {
    const d = normalizarDados(c.dados);
    let linkAssinar = '';
    try { linkAssinar = linkAssinatura((await garantirAssinatura(c.os_id)).token); } catch { /* tabela ausente */ }
    return {
      osId: c.os_id, horas: c.horas, pagina: c.pagina, chassis: c.chassis,
      dataRevisao: d.dataRevisao, horimetro: d.horimetro, tecnico: d.tecnico, cliente: d.cliente, os: d.os,
      assinado: !!c.assinado_em, assinadoEm: c.assinado_em, assinadoNome: c.assinado_nome, assinadoGeo: c.assinado_geo || null, assinadoDispositivo: c.assinado_dispositivo || null,
      linkCheque: linkCheque(c.token), linkAssinar,
      pdfUrl: `/api/revisoes/cheque-pdf?os=${encodeURIComponent(c.os_id)}`,
    };
  }));
  return NextResponse.json({ itens });
}
