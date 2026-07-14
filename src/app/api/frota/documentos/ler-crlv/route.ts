// POST /api/frota/documentos/ler-crlv { documento_id }
//
// Lê o arquivo do CRLV anexado ao veículo (Storage), extrai os dados com IA
// (lib/frota/crlv.ts) e devolve o JSON estruturado + avisos. NÃO grava nada —
// a Ficha usa a resposta pra PRÉ-PREENCHER o formulário de edição e o humano
// confere antes de salvar (o PATCH normal cuida de whitelist, travas e log).
//
// Permissão: veiculos:editar (o propósito é editar a ficha).
// Requer OPENAI_API_KEY no ambiente (mesmo provider do Tratorilson).
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { autenticar } from '@/lib/auth/server';
import { logFrota, podeFrota } from '@/lib/frota/server';
import { lerCrlv } from '@/lib/frota/crlv';
import { resolverPlaca } from '@/lib/frota/placa';

export const runtime = 'nodejs';
export const maxDuration = 60;

const BUCKET = 'frota-documentos';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } },
);

export async function POST(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!podeFrota(auth, 'veiculos:editar')) {
    return NextResponse.json({ error: 'Sem permissão para editar veículos.' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const documentoId = String(body?.documento_id || '');
  if (!documentoId) return NextResponse.json({ error: 'Informe o documento_id.' }, { status: 400 });

  const { data: doc } = await supabase.from('frota_documentos').select('*').eq('id', documentoId).maybeSingle();
  if (!doc) return NextResponse.json({ error: 'Documento não encontrado.' }, { status: 404 });
  if (!doc.arquivo_url) return NextResponse.json({ error: 'Este documento não tem arquivo anexado.' }, { status: 400 });

  const { data: veiculo } = await supabase
    .from('frota_veiculos')
    .select('id, placa, placa_exibicao, modelo')
    .eq('id', doc.veiculo_id)
    .maybeSingle();
  if (!veiculo) return NextResponse.json({ error: 'Veículo do documento não encontrado.' }, { status: 404 });

  // caminho no bucket a partir da URL pública (mesma lógica do DELETE)
  const marca = `/object/public/${BUCKET}/`;
  const i = doc.arquivo_url.indexOf(marca);
  if (i < 0) return NextResponse.json({ error: 'URL do arquivo fora do padrão do bucket.' }, { status: 500 });
  const path = decodeURIComponent(doc.arquivo_url.slice(i + marca.length));

  const { data: arquivo, error: errDown } = await supabase.storage.from(BUCKET).download(path);
  if (errDown || !arquivo) {
    return NextResponse.json({ error: `Não consegui baixar o arquivo: ${errDown?.message || 'vazio'}` }, { status: 500 });
  }
  const buffer = Buffer.from(await arquivo.arrayBuffer());

  try {
    const { dados, fonte } = await lerCrlv(buffer, doc.nome_arquivo);

    const avisos: string[] = [];
    if (dados.placa && resolverPlaca(dados.placa) !== veiculo.placa) {
      avisos.push(
        `⚠️ A placa no documento (${dados.placa}) é DIFERENTE da placa deste veículo (${veiculo.placa_exibicao || veiculo.placa}) — confira se o CRLV é do carro certo.`,
      );
    }
    if (!dados.placa && !dados.renavam && !dados.chassi) {
      avisos.push('Não reconheci os campos principais — o arquivo pode não ser um CRLV ou estar ilegível.');
    }

    await logFrota(auth, {
      acao: 'ler_crlv',
      entidade: 'documento',
      entidadeId: doc.id,
      entidadeLabel: `CRLV · ${veiculo.placa_exibicao || veiculo.placa}`,
      detalhes: { fonte, placa_no_documento: dados.placa, proprietario: dados.proprietario },
    });

    return NextResponse.json({ dados, avisos, fonte });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const amigavel = msg.includes('OPENAI_API_KEY')
      ? 'A leitura por IA precisa da OPENAI_API_KEY configurada no ambiente.'
      : `Falha na leitura: ${msg}`;
    return NextResponse.json({ error: amigavel }, { status: 500 });
  }
}
