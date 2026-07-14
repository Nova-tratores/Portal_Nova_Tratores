// POST /api/frota/veiculos/[placa]/responsavel — troca o responsável FIXO.
//
// O Frota é o ESCRITOR (decisão do usuário): trocar aqui propaga para
// `comercial_veiculos` (write-through), então o cron de rotas, o supervisor de
// vendas e o cruzamento de visitas continuam funcionando — só que alimentados
// pelo Frota. Nada de editar em dois lugares.
//
// body: { nome: string, motorista_id?: uuid|null, inicio?: 'YYYY-MM-DD', obs?: string }
//       nome vazio = carro fica SEM responsável (fecha o período aberto).
// Permissão: frota:veiculos:responsavel.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { autenticar } from '@/lib/auth/server';
import { logFrota, podeFrota } from '@/lib/frota/server';
import { resolverPlaca } from '@/lib/frota/placa';

export const runtime = 'nodejs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } },
);

export async function POST(req: NextRequest, { params }: { params: Promise<{ placa: string }> }) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!podeFrota(auth, 'veiculos:responsavel')) {
    return NextResponse.json({ error: 'Sem permissão para trocar o responsável.' }, { status: 403 });
  }

  const { placa: placaParam } = await params;
  const placa = resolverPlaca(decodeURIComponent(placaParam));
  const { data: v } = await supabase
    .from('frota_veiculos')
    .select('id, placa, placa_exibicao, descricao, modelo, adesao_id, comercial_id, categoria')
    .eq('placa', placa)
    .maybeSingle();
  if (!v) return NextResponse.json({ error: 'Veículo não encontrado.' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const nome = String(body.nome || '').trim();
  const motoristaId: string | null = body.motorista_id || null;
  const inicio: string = /^\d{4}-\d{2}-\d{2}$/.test(String(body.inicio || ''))
    ? body.inicio
    : new Date().toISOString().slice(0, 10);

  // (para o audit log: quem era o responsável até agora)
  const { data: anterior } = await supabase
    .from('frota_responsaveis')
    .select('motorista_nome')
    .eq('veiculo_id', v.id)
    .is('fim', null)
    .maybeSingle();

  // 1) fecha o período aberto (o histórico é o ponto: "quem, de quando a quando")
  const { error: errFecha } = await supabase
    .from('frota_responsaveis')
    .update({ fim: inicio })
    .eq('veiculo_id', v.id)
    .is('fim', null);
  if (errFecha) return NextResponse.json({ error: errFecha.message }, { status: 500 });

  // 2) abre o novo (se veio nome; nome vazio = carro sem responsável)
  if (nome) {
    const { error: errAbre } = await supabase.from('frota_responsaveis').insert({
      veiculo_id: v.id,
      motorista_id: motoristaId,
      motorista_nome: nome,
      inicio,
      fim: null,
      origem: 'manual',
      obs: String(body.obs || '').trim() || null,
    });
    if (errAbre) return NextResponse.json({ error: errAbre.message }, { status: 500 });
  }

  // 3) WRITE-THROUGH -> comercial_veiculos (o que o resto do portal lê).
  //    Melhor esforço: a troca no Frota vale mesmo se o espelho falhar.
  let writeThrough = 'nenhum';
  try {
    let alvoId: string | null = v.comercial_id;
    if (!alvoId) {
      // match por placa normalizada (comercial_veiculos guarda "AYB-4230" etc.)
      const { data: todos } = await supabase.from('comercial_veiculos').select('id, placa');
      alvoId = (todos || []).find((c) => resolverPlaca(c.placa) === v.placa)?.id ?? null;
    }
    if (alvoId) {
      await supabase
        .from('comercial_veiculos')
        .update({ pessoa_nome: nome || '', pessoa_id: null, vinculo_tipo: nome ? 'portal' : null })
        .eq('id', alvoId);
      writeThrough = 'atualizado';
    } else if (v.adesao_id != null) {
      // carro rastreado sem linha lá: cria — de quebra o cron de rotas passa a
      // gravar o trajeto dele (era só o comercial; o plano queria a frota toda)
      const { data: nova } = await supabase
        .from('comercial_veiculos')
        .insert({
          placa: v.placa_exibicao || v.placa,
          descricao: v.descricao || v.modelo || null,
          adesao_id: v.adesao_id,
          categoria: v.categoria === 'oficina' ? 'oficina' : 'comercial',
          ativo: true,
          pessoa_nome: nome || '',
          pessoa_id: null,
          ...(nome ? { vinculo_tipo: 'portal' } : {}),
        })
        .select('id')
        .single();
      if (nova?.id) {
        await supabase.from('frota_veiculos').update({ comercial_id: nova.id }).eq('id', v.id);
        writeThrough = 'criado';
      }
    }
  } catch (e) {
    console.warn('[frota] write-through comercial_veiculos falhou:', e);
    writeThrough = 'falhou';
  }

  await logFrota(auth, {
    acao: 'editar',
    entidade: 'responsavel',
    entidadeId: v.placa,
    entidadeLabel: `${v.placa_exibicao || v.placa} — responsável`,
    detalhes: {
      de: anterior?.motorista_nome || null,
      para: nome || null,
      inicio,
      write_through: writeThrough,
    },
  });

  return NextResponse.json({ ok: true, write_through: writeThrough });
}
