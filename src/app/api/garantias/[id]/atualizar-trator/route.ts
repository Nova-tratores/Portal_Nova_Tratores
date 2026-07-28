import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/pos/supabase';
import { TBL_GARANTIAS, STATUS_FINALIZADOS } from '@/lib/garantias/constants';
import { registrarEvento } from '@/lib/garantias/server';
import type { GarantiaStatus } from '@/lib/garantias/types';

// POST /api/garantias/[id]/atualizar-trator
// Corrige o CHASSI/MODELO da garantia — necessário quando a garantia nasceu
// antes do trator existir no controle de revisões (`tratores`): o modelo vinha
// do Projeto da OS inteiro ("JIVO 2025 MBN1KGC...") e o chassi ficava vazio,
// o que quebraria a SG enviada à fábrica.
//
// body:
//   { ator?, chassis, modelo }  -> edição MANUAL (grava o que veio)
//   { ator? }                   -> AUTO: busca no controle de revisões
//     1. trator cujo Chassis aparece dentro do Projeto/modelo da garantia
//     2. Chassis do relatório do técnico (Ordem_Servico_Tecnicos)
//     3. cliente com UM único trator cadastrado
// Bloqueado em garantia finalizada (aprovada/rejeitada).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const ator = String(body.ator || '').trim() || 'Garantista';

  const { data: garantia } = await supabase
    .from(TBL_GARANTIAS)
    .select('id, numero, status, id_ordem, cliente, modelo, chassis')
    .eq('id', id)
    .maybeSingle();
  if (!garantia) return NextResponse.json({ error: 'Garantia não encontrada.' }, { status: 404 });

  if (STATUS_FINALIZADOS.includes(garantia.status as GarantiaStatus)) {
    return NextResponse.json(
      { error: 'Garantia finalizada — chassi/modelo não podem mais mudar.' },
      { status: 400 },
    );
  }

  const norm = (s: string | null | undefined) =>
    String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

  let novoChassis = String(body.chassis ?? '').trim();
  let novoModelo = String(body.modelo ?? '').trim();
  let fonte = 'manual';

  const manual = novoChassis !== '' || novoModelo !== '';
  if (!manual) {
    // ── AUTO: controle de revisões (tratores) ──
    interface TratorRow { Chassis: string | null; Modelo: string | null; Cliente: string | null }
    const projetoNorm = norm(garantia.modelo);

    // Candidatos: por cliente (o cadastro recém-feito) — sem sufixos tipo
    // "( cnpj )" que o Os_Cliente carrega e o cadastro de tratores não tem.
    const clienteLimpo = String(garantia.cliente || '')
      .replace(/\(.*?\)/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
    const { data: porCliente } = clienteLimpo
      ? await supabase
          .from('tratores')
          .select('Chassis, Modelo, Cliente')
          .ilike('Cliente', `%${clienteLimpo}%`)
          .limit(20)
      : { data: [] };
    let candidatos: TratorRow[] = (porCliente || []) as TratorRow[];

    // 1) chassi do trator aparece dentro do Projeto/modelo da garantia
    let achado =
      candidatos.find((t) => t.Chassis && projetoNorm.includes(norm(t.Chassis))) || null;

    // (se o cliente não casou, tenta o match do chassi no Projeto na base toda —
    // barato: busca só os chassis que terminam igual ao fim do projeto)
    if (!achado && projetoNorm.length >= 8) {
      const cauda = projetoNorm.slice(-17); // chassi tem até 17 caracteres
      const { data: porChassi } = await supabase
        .from('tratores')
        .select('Chassis, Modelo, Cliente')
        .not('Chassis', 'is', null)
        .limit(2000);
      achado =
        ((porChassi || []) as TratorRow[]).find(
          (t) => t.Chassis && norm(t.Chassis).length >= 8 && cauda.includes(norm(t.Chassis)),
        ) || null;
    }

    // 2) chassi preenchido depois no relatório do técnico
    if (!achado && garantia.id_ordem) {
      const { data: tecRow } = await supabase
        .from('Ordem_Servico_Tecnicos')
        .select('Chassis')
        .eq('Ordem_Servico', garantia.id_ordem)
        .maybeSingle();
      const chassiTec = String(tecRow?.Chassis || '').trim();
      if (chassiTec) {
        const { data: doChassi } = await supabase
          .from('tratores')
          .select('Chassis, Modelo, Cliente')
          .ilike('Chassis', chassiTec)
          .limit(1);
        achado = ((doChassi || []) as TratorRow[])[0] || { Chassis: chassiTec, Modelo: null, Cliente: null };
      }
    }

    // 3) cliente com UM único trator cadastrado
    if (!achado && candidatos.length === 1) achado = candidatos[0];

    if (!achado) {
      return NextResponse.json(
        {
          error:
            'Não achei o trator no controle de revisões (nem pelo chassi do Projeto, nem pelo relatório do técnico, nem pelo cliente). Confira o cadastro em Revisões ou corrija manualmente.',
        },
        { status: 404 },
      );
    }
    novoChassis = String(achado.Chassis || '').trim();
    // Modelo limpo do cadastro; fallback: Projeto sem o chassi embutido
    novoModelo = String(achado.Modelo || '').trim();
    if (!novoModelo && garantia.modelo && novoChassis) {
      novoModelo = String(garantia.modelo)
        .replace(new RegExp(novoChassis.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '')
        .replace(/\s{2,}/g, ' ')
        .trim();
    }
    fonte = 'controle de revisões';
  }

  if (!novoChassis && !novoModelo) {
    return NextResponse.json({ error: 'Informe o chassi e/ou o modelo.' }, { status: 400 });
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (novoChassis) patch.chassis = novoChassis;
  if (novoModelo) patch.modelo = novoModelo;
  const { error: errUpd } = await supabase.from(TBL_GARANTIAS).update(patch).eq('id', id);
  if (errUpd) return NextResponse.json({ error: `Falha ao gravar: ${errUpd.message}` }, { status: 500 });

  await registrarEvento(id, {
    tipo: 'sincronizada_os',
    ator,
    detalhe: `Chassi/modelo corrigidos (${fonte}): ${novoChassis || '—'} · ${novoModelo || '—'} (antes: ${garantia.chassis || '—'} · ${garantia.modelo || '—'}).`,
  });

  return NextResponse.json({ ok: true, chassis: novoChassis || garantia.chassis, modelo: novoModelo || garantia.modelo, fonte });
}
