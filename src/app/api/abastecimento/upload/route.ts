// POST /api/abastecimento/upload — recebe o CSV mensal da operadora,
// registra o lote e insere os abastecimentos com dedup no banco
// (ON CONFLICT DO NOTHING pela chave placa+data/hora+litros).

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { autenticar } from '@/lib/auth/server';
import { logFrota, podeFrota } from '@/lib/frota/server';
import { decodificarCsv, parseCsvAbastecimento } from '@/lib/abastecimento/parse';
import { autorizacoesDe, chaveAbastecimento, diferencasEntre, separarPorAutorizacao } from '@/lib/abastecimento/dedup';
import type { DuplicadaImport } from '@/lib/abastecimento/tipos';
import { extrairPlacaDeNumPlaca, resolverPlaca } from '@/lib/frota/placa';
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
    // identidade/permissão vêm do token (padrão de segurança do portal).
    // A chave passou a ser `frota:abastecimento:upload`; as antigas
    // (abastecimento / abastecimento:upload) continuam valendo porque o
    // (compat de chaves legadas removida em 16/07 — ninguém mais as tinha).
    const auth = await autenticar(request);
    if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    if (!podeFrota(auth, 'abastecimento:upload')) {
      return NextResponse.json({ error: 'Sem permissão para importar abastecimentos.' }, { status: 403 });
    }

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

    // extrairPlacaDeNumPlaca pega o ÚLTIMO token que parece placa — o split
    // antigo (`partes[1]`) devolvia "4000" em "F-4000 - LNX1234" e undefined
    // quando o NumPlaca não tinha separador.
    const mapaFrota = new Map<string, number>();
    for (const p of placasFrota || []) {
      const placa = resolverPlaca(extrairPlacaDeNumPlaca(p.NumPlaca));
      if (placa) mapaFrota.set(placa, p.IdPlaca);
    }

    // resolverPlaca unifica as grafias erradas (EVG1467 → EVG1E67 etc.), senão
    // o mesmo carro vira dois no relatório.
    const desconhecidas = new Map<string, number>();
    for (const l of linhas) {
      const canonica = resolverPlaca(l.placa);
      l.id_placa = mapaFrota.get(canonica) ?? null;
      if (l.id_placa == null) desconhecidas.set(canonica, (desconhecidas.get(canonica) || 0) + 1);
    }

    // 2b) SEGUNDA camada de dedup: autorização da operadora. A chave única do
    //     banco (placa+data+litros) segura o reenvio do MESMO arquivo, mas não
    //     um reexport com litros/hora corrigidos — a autorização é a identidade
    //     real da transação. Linha sem autorização passa direto (o índice cuida).
    let puladasAutorizacao = 0;
    let linhasParaInserir = linhas;
    // detalhe das duplicadas (pedido do usuário: VER quais foram e poder
    // substituir): registro existente + o que mudou, dos dois tipos de dedup
    const duplicadas: DuplicadaImport[] = [];
    const RESUMO_EXISTENTE = 'id, placa, data_transacao, litros, valor_total, lote_id, autorizacao, valor_unitario, combustivel, hodometro, posto_nome, motorista_nome';
    type ExistenteRow = { id: number; placa: string; data_transacao: string; litros: number; valor_total: number | null; lote_id: number | null; autorizacao: string | null } & Record<string, unknown>;
    const resumoDe = (e: ExistenteRow) => ({
      data_transacao: e.data_transacao, placa: e.placa, litros: Number(e.litros),
      valor_total: e.valor_total == null ? null : Number(e.valor_total),
      lote_id: e.lote_id, autorizacao: e.autorizacao,
    });
    const auts = autorizacoesDe(linhas);
    if (auts.length > 0) {
      const existentes = new Map<string, ExistenteRow>();
      for (let i = 0; i < auts.length; i += 200) {
        const { data: ja, error: errAut } = await supabase
          .from('abastecimentos')
          .select(RESUMO_EXISTENTE)
          .in('autorizacao', auts.slice(i, i + 200));
        if (errAut) throw new Error(`Erro ao conferir autorizações já importadas: ${errAut.message}`);
        for (const r of (ja || []) as ExistenteRow[]) {
          const v = String(r.autorizacao || '').trim();
          if (v && !existentes.has(v)) existentes.set(v, r);
        }
      }
      const sep = separarPorAutorizacao(linhas, existentes.keys());
      linhasParaInserir = sep.aceitas;
      puladasAutorizacao = sep.puladas.length;
      for (const l of sep.puladas) {
        const e = existentes.get(String(l.autorizacao || '').trim());
        if (!e) continue; // repetida dentro do próprio arquivo: não há registro no banco
        duplicadas.push({
          motivo: 'autorizacao', existenteId: e.id, existente: resumoDe(e),
          linha: l, diferencas: diferencasEntre(e, l as unknown as Record<string, unknown>),
        });
      }
    }

    // 2c) duplicadas pela CHAVE do índice (placa+data+litros), detectadas ANTES
    //     do insert só pra LISTAR — o ON CONFLICT continua sendo a proteção de
    //     verdade (corrida entre dois uploads cai nele). Busca paginada porque
    //     o PostgREST corta em 1000 linhas por resposta.
    if (linhasParaInserir.length > 0) {
      const datasOrd = linhasParaInserir.map((l) => l.data_transacao).sort();
      const chavesArquivo = new Map(linhasParaInserir.map((l) => [chaveAbastecimento(l), l]));
      const PAG = 1000;
      for (let de = 0; ; de += PAG) {
        const { data: pag, error: errPag } = await supabase
          .from('abastecimentos')
          .select(RESUMO_EXISTENTE)
          .gte('data_transacao', datasOrd[0])
          .lte('data_transacao', datasOrd[datasOrd.length - 1])
          .range(de, de + PAG - 1);
        if (errPag) throw new Error(`Erro ao conferir o período já importado: ${errPag.message}`);
        for (const e of (pag || []) as ExistenteRow[]) {
          const l = chavesArquivo.get(chaveAbastecimento(e));
          if (l) {
            duplicadas.push({
              motivo: 'chave', existenteId: e.id, existente: resumoDe(e),
              linha: l, diferencas: diferencasEntre(e, l as unknown as Record<string, unknown>),
            });
            chavesArquivo.delete(chaveAbastecimento(e));
          }
        }
        if (!pag || pag.length < PAG) break;
      }
    }
    if (!linhasParaInserir.length) {
      return NextResponse.json(
        { error: `Todas as ${linhas.length} linhas válidas já estavam importadas (autorização da operadora repetida). Nada foi gravado.` },
        { status: 400 },
      );
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
    for (let i = 0; i < linhasParaInserir.length; i += CHUNK) {
      const chunk = linhasParaInserir
        .slice(i, i + CHUNK)
        .map((l: LinhaAbastecimento) => ({ ...l, lote_id: lote.id }));
      const { data, error } = await supabase
        .from('abastecimentos')
        .upsert(chunk, { onConflict: 'placa,data_transacao,litros', ignoreDuplicates: true })
        .select('id');
      if (error) throw new Error(`Erro ao inserir abastecimentos: ${error.message}`);
      novos += data?.length || 0;
    }
    const duplicados = linhasParaInserir.length - novos + duplicadasArquivo + puladasAutorizacao;

    // 5) fecha os contadores do lote
    const datas = linhasParaInserir.map((l) => l.data_transacao).sort();
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
      duplicadosAutorizacao: puladasAutorizacao,
      duplicadas: duplicadas.slice(0, 300),
      duplicadasOcultas: Math.max(0, duplicadas.length - 300),
      erros,
      placasDesconhecidas: [...desconhecidas.entries()]
        .map(([placa, ocorrencias]) => ({ placa, ocorrencias }))
        .sort((a, b) => b.ocorrencias - a.ocorrencias),
    };

    await logFrota(auth, {
      acao: 'upload',
      entidade: 'abastecimento_lote',
      entidadeId: String(lote.id),
      entidadeLabel: `CSV ${lote.arquivo_nome}`,
      detalhes: { totalLinhas, novos, duplicados, duplicadosAutorizacao: puladasAutorizacao, erros: erros.length },
    });

    return NextResponse.json(resultado);
  } catch (e) {
    // rollback manual: apaga o lote (cascade remove o que já entrou)
    if (loteId != null) await supabase.from('abastecimento_lotes').delete().eq('id', loteId);
    const msg = e instanceof Error ? e.message : 'Erro inesperado no upload.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
