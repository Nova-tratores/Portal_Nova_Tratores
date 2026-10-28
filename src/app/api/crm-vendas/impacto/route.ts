// Impacto real do vendedor (gamificação do app de vendas): serviço do
// Pós-Vendas concluído para cliente dele DEPOIS da visita (lib/vendas-app/impacto).
// Login: token do Supabase Auth; só o vendedor ativo, só as visitas dele.
//   GET -> { itens: [{ os, cliente, data, valor, servico, visitado_desde }], total, clientes }
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { corsVendas } from '@/lib/vendas-app/cors';
import { impactoDoVendedor, STATUS_QUE_CONTAM, type OsImpacto } from '@/lib/vendas-app/impacto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(req: NextRequest, body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: corsVendas(req, 'GET, OPTIONS') });
}
export function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsVendas(req, 'GET, OPTIONS') });
}

async function validarTokenVendedor(req: NextRequest): Promise<number | null> {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return null;
  const { data: v } = await supabaseAdmin.from('vendedores').select('id, ativo').eq('auth_uid', data.user.id).maybeSingle();
  return v && v.ativo !== false ? Number(v.id) : null;
}

export async function GET(req: NextRequest) {
  const vendedorId = await validarTokenVendedor(req);
  if (vendedorId == null) return json(req, { error: 'Entre no app com seu usuário de vendedor.' }, 401);
  try {
    const desde = new Date(Date.now() - 180 * 86400000).toISOString();
    const { data: visitas } = await supabaseAdmin.from('visitas')
      .select('propriedade_id, data_visita').eq('vendedor_id', vendedorId).is('deleted_at', null).gte('data_visita', desde);
    const ids = [...new Set((visitas || []).map((v) => v.propriedade_id).filter((x): x is number => x != null))];
    if (!ids.length) return json(req, { itens: [], total: 0, clientes: 0 });

    const { data: props } = await supabaseAdmin.from('portal_nt_clientes_PRINCIPAL')
      .select('id, nome_fantasia, razao_social, cnpj_cpf, id_omie').in('id', ids);
    // sem CPF/CNPJ no cadastro do app: tenta o do cadastro do Omie pelo código do cliente
    const codigos = [...new Set((props || []).filter((p) => !String(p.cnpj_cpf || '').replace(/\D/g, '') && p.id_omie).map((p) => String(p.id_omie)))];
    const { data: cad } = codigos.length
      ? await supabaseAdmin.from('portal_nt_clientes_cadastro_omie').select('cod_cli, cnpj_cpf').in('cod_cli', codigos)
      : { data: [] as { cod_cli: string; cnpj_cpf: string }[] };
    const docOmie = new Map((cad || []).map((c) => [String(c.cod_cli), String(c.cnpj_cpf || '')]));
    const clientes = (props || []).map((p) => ({
      id: Number(p.id),
      nome: String(p.nome_fantasia || p.razao_social || 'Cliente'),
      documento: String(p.cnpj_cpf || '') || docOmie.get(String(p.id_omie)) || '',
    }));
    // o CNPJ/CPF pode vir com ou sem máscara na OS — busca pelas duas formas
    const docs = [...new Set(clientes.flatMap((c) => [c.documento, c.documento.replace(/\D/g, '')]))]
      .filter((d) => d.replace(/\D/g, '').length >= 11);
    if (!docs.length) return json(req, { itens: [], total: 0, clientes: 0 });

    const { data: ordens } = await supabaseAdmin.from('Ordem_Servico')
      .select('Id_Ordem, Cnpj_Cliente, Status, Valor_Total, Data, Tipo_Servico, Revisao')
      .in('Cnpj_Cliente', docs).in('Status', [...STATUS_QUE_CONTAM]).gte('Data', desde.slice(0, 10));
    return json(req, impactoDoVendedor(visitas || [], clientes, (ordens || []) as OsImpacto[]));
  } catch (e) {
    return json(req, { error: e instanceof Error ? e.message : String(e) }, 500);
  }
}
