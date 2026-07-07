// POST /api/abastecimento/upload — recebe o CSV mensal da operadora,
// registra o lote e insere os abastecimentos com dedup no banco
// (ON CONFLICT DO NOTHING pela chave placa+data/hora+litros).

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { autenticar } from '@/lib/auth/server';
import { decodificarCsv, normalizarPlaca, parseCsvAbastecimento } from '@/lib/abastecimento/parse';
import type { LinhaAbastecimento, ResultadoUpload } from '@/lib/abastecimento/tipos';

export const runtime = 'nodejs';
export const maxDuration = 60; // CSVs históricos podem ter milhares de linhas

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const CHUNK = 500;

export async function POST(request: Request) {
  let loteId: number | null = null;
  try {
    // identidade/permissão vêm do token (padrão de segurança do portal)
    const auth = await autenticar(request);
    if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    const podeUpload =
      auth.isAdmin || auth.modulos.includes('abastecimento') || auth.modulos.includes('abastecimento:upload');
    if (!podeUpload) return NextResponse.json({ error: 'Sem permissão para importar abastecimentos.' }, { status: 403 });

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const usuario = (formData.get('usuario') as string) || auth.email || '';
    const usuarioId = auth.userId;
    if (!file) return NextResponse.json({ error: 'Arquivo não enviado.' }, { status: 400 });

    // 1) parse do CSV (erros de linha não abortam o upload)
    const texto = decodificarCsv(await file.arrayBuffer());
    let parse;
    try {
      parse = parseCsvAbastecimento(texto);
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : 'CSV inválido.' }, { status: 400 });
    }
    const { linhas, erros, duplicadasArquivo } = parse;
    const totalLinhas = linhas.length + erros.length + duplicadasArquivo;
    if (!linhas.length) {
      return NextResponse.json(
        { error: 'Nenhuma linha válida no arquivo.', erros },
        { status: 400 },
      );
    }

    // 2) cruza as placas com a frota (Placas.NumPlaca = "TIPO-PLACA")
    const { data: placasFrota, error: errPlacas } = await supabase
      .from('Placas')
      .select('IdPlaca, NumPlaca');
    if (errPlacas) throw new Error(`Erro ao ler a frota (Placas): ${errPlacas.message}`);

    const mapaFrota = new Map<string, number>();
    for (const p of placasFrota || []) {
      const partes = String(p.NumPlaca || '').split(/[-–]/);
      const placa = normalizarPlaca(partes[1] || partes[0]);
      if (placa) mapaFrota.set(placa, p.IdPlaca);
    }

    const desconhecidas = new Map<string, number>();
    for (const l of linhas) {
      l.id_placa = mapaFrota.get(l.placa) ?? null;
      if (l.id_placa == null) desconhecidas.set(l.placa, (desconhecidas.get(l.placa) || 0) + 1);
    }

    // 3) cria o lote
    const { data: lote, error: errLote } = await supabase
      .from('abastecimento_lotes')
      .insert({
        arquivo_nome: file.name,
        enviado_por: usuario,
        enviado_por_id: usuarioId,
        total_linhas: totalLinhas,
        erros: erros.length,
      })
      .select('id, arquivo_nome, created_at')
      .single();
    if (errLote || !lote) throw new Error(`Erro ao criar o lote: ${errLote?.message}`);
    loteId = lote.id;

    // 4) insere em chunks com dedup: ignoreDuplicates => ON CONFLICT DO NOTHING;
    //    o .select() devolve só as linhas realmente inseridas (contagem exata).
    let novos = 0;
    for (let i = 0; i < linhas.length; i += CHUNK) {
      const chunk = linhas
        .slice(i, i + CHUNK)
        .map((l: LinhaAbastecimento) => ({ ...l, lote_id: lote.id }));
      const { data, error } = await supabase
        .from('abastecimentos')
        .upsert(chunk, { onConflict: 'placa,data_transacao,litros', ignoreDuplicates: true })
        .select('id');
      if (error) throw new Error(`Erro ao inserir abastecimentos: ${error.message}`);
      novos += data?.length || 0;
    }
    const duplicados = linhas.length - novos + duplicadasArquivo;

    // 5) fecha os contadores do lote
    const datas = linhas.map((l) => l.data_transacao).sort();
    await supabase
      .from('abastecimento_lotes')
      .update({
        novos,
        duplicados,
        periodo_min: datas[0],
        periodo_max: datas[datas.length - 1],
      })
      .eq('id', lote.id);

    const resultado: ResultadoUpload = {
      lote: { id: lote.id, arquivo_nome: lote.arquivo_nome, created_at: lote.created_at },
      totalLinhas,
      novos,
      duplicados,
      erros,
      placasDesconhecidas: [...desconhecidas.entries()]
        .map(([placa, ocorrencias]) => ({ placa, ocorrencias }))
        .sort((a, b) => b.ocorrencias - a.ocorrencias),
    };
    return NextResponse.json(resultado);
  } catch (e) {
    // rollback manual: apaga o lote (cascade remove o que já entrou)
    if (loteId != null) await supabase.from('abastecimento_lotes').delete().eq('id', loteId);
    const msg = e instanceof Error ? e.message : 'Erro inesperado no upload.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
