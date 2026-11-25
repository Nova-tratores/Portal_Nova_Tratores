import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/pos/supabase';
import { TBL_GARANTIAS, TBL_GAR_PECAS } from '@/lib/garantias/constants';
import { registrarEvento, notificarGarantistas } from '@/lib/garantias/server';
import { protegerRota, autorDe } from '@/lib/ajustes/permissao-server';
import { validarNovaGarantiaSoPecas } from '@/lib/garantias/so-pecas';

const MSG_MIGRATION =
  'Falta aplicar a migration sql/garantias-so-pecas.sql no Supabase (garantia sem OS).';

// POST /api/garantias/so-pecas
// Garantia SÓ DE PEÇAS: sem OS, sem horas/km. Nasce em 'em_analise' com o
// garantista assumido (como a criação manual). Cliente e trator opcionais.
// body: { motivo, cliente?, chassis?, modelo?, pecas: [{cod_produto?, descricao, quantidade, preco_unitario}] }
export async function POST(req: NextRequest) {
  const guarda = await protegerRota(req, [{ modulo: 'garantias', acao: 'criar' }]);
  if (guarda.resposta) return guarda.resposta;
  const user = guarda.user;
  const body = await req.json().catch(() => ({}));

  const v = validarNovaGarantiaSoPecas(body);
  if (!v.ok) return NextResponse.json({ error: v.erro }, { status: 400 });
  const d = v.valor;
  const autor = autorDe(user);
  const garantistaNome = user.nome || autor;

  const now = new Date().toISOString();
  const { data: garantia, error } = await supabase
    .from(TBL_GARANTIAS)
    .insert({
      id_ordem: null,
      so_pecas: true,
      tecnico_nome: 'Sem técnico',
      cliente: d.cliente,
      modelo: d.modelo,
      chassis: d.chassis,
      tecnico_horas: 0,
      tecnico_km: 0,
      tecnico_obs: d.motivo,
      garantista_nome: garantistaNome,
      garantista_user_id: user.id || null,
      garantista_obs: `Garantia só de peças (sem OS). ${d.motivo}`.slice(0, 2000),
      status: 'em_analise',
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();

  if (error || !garantia) {
    const msg = error?.message || '';
    if (error?.code === '23502' || error?.code === '42703' || error?.code === 'PGRST204' || /so_pecas|id_ordem/.test(msg)) {
      return NextResponse.json({ error: MSG_MIGRATION, migracaoFaltando: true }, { status: 503 });
    }
    console.error('[garantias/so-pecas] erro ao criar:', msg);
    return NextResponse.json({ error: 'Falha ao criar a garantia.' }, { status: 500 });
  }

  const { error: errPecas } = await supabase.from(TBL_GAR_PECAS).insert(
    d.pecas.map((p) => ({ garantia_id: garantia.id, ...p, origem: 'manual', fonte_ppv_id: null })),
  );
  if (errPecas) console.warn('[garantias/so-pecas] falha nas peças:', errPecas.message);

  await registrarEvento(garantia.id, {
    tipo: 'criada_manual',
    statusNovo: 'em_analise',
    ator: autor,
    detalhe: `Garantia ${garantia.numero} criada SÓ DE PEÇAS (sem OS) com ${d.pecas.length} peça(s). Motivo: ${d.motivo}`,
  });

  await notificarGarantistas({
    titulo: `Garantia ${garantia.numero} só de peças`,
    descricao: `${garantistaNome} abriu uma garantia só de peças${d.cliente ? ` · ${d.cliente}` : ''}.`,
    link: `/garantias?id=${garantia.id}`,
  });

  return NextResponse.json({ garantia, qtd_pecas: errPecas ? 0 : d.pecas.length });
}
