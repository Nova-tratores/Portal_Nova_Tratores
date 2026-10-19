// POST /api/frota/checklists-mes/pedir  { placa_key, vendedor_id }
// "Pedir checklist" ao vendedor: manda um recado no app de vendas
// (mensagens_vendedor → menu Notificações, com badge) com o link que abre o
// checklist mensal do carro já selecionado. Sem a coluna `link`
// (vendas-pwa/supabase-mensagens-link.sql) o recado vai sem o botão "Abrir".
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { autenticar } from '@/lib/auth/server';
import { temModuloFrota } from '@/lib/frota/server';
import { formatarPlaca } from '@/lib/frota/placa';
import { linkChecklistApp } from '@/lib/frota/checklists-mes';

export const runtime = 'nodejs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } },
);

export async function POST(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!temModuloFrota(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const placaKey = String(body.placa_key || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const vendedorId = Number(body.vendedor_id);
  if (!placaKey || !Number.isFinite(vendedorId)) {
    return NextResponse.json({ error: 'placa_key e vendedor_id são obrigatórios' }, { status: 400 });
  }

  const { data: u } = await supabase.from('financeiro_usu').select('nome').eq('id', auth.userId).maybeSingle();
  const quem = String(u?.nome || auth.email || 'Frota');
  const recado = {
    vendedor_id: vendedorId,
    titulo: 'Checklist do carro',
    corpo: `Faça o checklist mensal do carro ${formatarPlaca(placaKey)} pelo app: menu ☰ → Chamado Veicular → Efetuar Checklist.`,
    created_by: `${quem} (Frota)`,
  };
  let r = await supabase.from('mensagens_vendedor').insert({ ...recado, link: linkChecklistApp(placaKey) });
  // coluna `link` ainda não criada → manda sem o botão
  if (r.error && /link/i.test(r.error.message)) r = await supabase.from('mensagens_vendedor').insert(recado);
  if (r.error) return NextResponse.json({ error: r.error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
