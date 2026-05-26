import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/pos/supabase';
import { TBL_MONTADORAS } from '@/lib/garantias/constants';
import type { ChecklistField } from '@/lib/garantias/types';

// GET /api/garantias/montadoras?ativo=true
export async function GET(req: NextRequest) {
  const ativo = req.nextUrl.searchParams.get('ativo');
  let query = supabase.from(TBL_MONTADORAS).select('*').order('nome', { ascending: true });
  if (ativo === 'true') query = query.eq('ativo', true);

  const { data, error } = await query;
  if (error) {
    console.error('Erro ao listar montadoras:', error.message);
    return NextResponse.json({ error: 'Falha ao listar montadoras.' }, { status: 500 });
  }
  return NextResponse.json({ montadoras: data || [] });
}

// POST /api/garantias/montadoras  { nome, checklist_def?, cor?, logo_url?, contato_fabrica?, criado_por? }
export async function POST(req: NextRequest) {
  const body = await req.json();
  const nome = String(body.nome || '').trim();
  if (!nome) {
    return NextResponse.json({ error: 'Nome da montadora é obrigatório.' }, { status: 400 });
  }

  const checklist: ChecklistField[] = Array.isArray(body.checklist_def) ? body.checklist_def : [];
  const tipoTemplate = body.tipo_template === 'mahindra' ? 'mahindra' : 'sem_template';

  const { data, error } = await supabase
    .from(TBL_MONTADORAS)
    .insert({
      nome,
      checklist_def: checklist,
      cor: body.cor || null,
      logo_url: body.logo_url || null,
      contato_fabrica: body.contato_fabrica || null,
      criado_por: body.criado_por || null,
      ativo: body.ativo !== false,
      email_destinatarios: Array.isArray(body.email_destinatarios) ? body.email_destinatarios : [],
      tipo_template: tipoTemplate,
      auto_enviar_email: !!body.auto_enviar_email,
      email_assunto: body.email_assunto || null,
      email_corpo: body.email_corpo || null,
      proximo_numero_sg: Math.max(1, parseInt(body.proximo_numero_sg, 10) || 1),
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Já existe uma montadora com esse nome.' }, { status: 409 });
    }
    console.error('Erro ao criar montadora:', error.message);
    return NextResponse.json({ error: 'Falha ao criar montadora.' }, { status: 500 });
  }
  return NextResponse.json({ montadora: data });
}
