// POST /api/frota/cron/ocorrencias-auto — gera OCORRÊNCIAS automáticas da
// Frota (1×/dia via GitHub Actions, após o fechar-dia; o detector de
// VELOCIDADE roda dentro do próprio fechar-dia, pois precisa dos fixes):
//
//   1. MULTA/AUTUAÇÃO  — frota_multas sincronizadas nos últimos 7 dias;
//      data da ocorrência = data da INFRAÇÃO; anexos = imagens da multa.
//   2. REQUISIÇÃO DE ABASTECIMENTO — TODA requisição (decisão do usuário):
//      queremos o cartão; notificação AGRUPADA por técnico (anti-spam).
//   3. CONSUMO ANORMAL — reusa anomaliasConsumo (2σ abaixo do histórico
//      do próprio veículo) sobre a janela de 90 dias.
//
// Idempotente: auto_chave única (multa:{id} | req:{id} | consumo:{placa}:{mes})
// — re-rodar não duplica nem re-notifica. Sem responsável → não cria (resumo).
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { autenticar } from '@/lib/auth/server';
import { registrarOcorrencia, notificarOcorrencia } from '@/lib/ocorrencias/registrar';
import { resolverTecnicoNome } from '@/lib/ocorrencias/auto-frota';
import { getSubcategoria } from '@/lib/ocorrencias/catalogo';
import { anomaliasConsumo, type LinhaDash } from '@/lib/abastecimento/agregacoes';
import { TIPOS_REQ_ABASTECIMENTO } from '@/lib/abastecimento/requisicoes';

export const runtime = 'nodejs';
export const maxDuration = 300;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } },
);

function urlsImagens(imagens: unknown): string[] {
  if (!Array.isArray(imagens)) return [];
  return imagens
    .map((i: unknown) => {
      if (typeof i === 'string') return i;
      const o = i as Record<string, unknown>;
      return String(o?.url || o?.imagem || o?.link || '');
    })
    .filter((u) => /^https?:\/\//.test(u));
}

/** Responsável do veículo NA DATA (padrão da API de multas). */
async function responsavelNaData(veiculoId: string | null, placa: string, dia: string): Promise<string | null> {
  if (veiculoId) {
    const { data: uso } = await supabase
      .from('vw_frota_uso_diario')
      .select('pessoa_nome')
      .eq('veiculo_id', veiculoId)
      .eq('data', dia)
      .limit(1);
    if (uso?.[0]?.pessoa_nome) return String(uso[0].pessoa_nome);
    const { data: resp } = await supabase
      .from('frota_responsaveis')
      .select('motorista_nome, inicio, fim')
      .eq('veiculo_id', veiculoId)
      .lte('inicio', dia)
      .or(`fim.is.null,fim.gte.${dia}`)
      .limit(1);
    if (resp?.[0]?.motorista_nome) return String(resp[0].motorista_nome);
  }
  return null;
}

export async function POST(req: NextRequest) {
  const CRON_SECRET = process.env.CRON_SECRET;
  const header = req.headers.get('authorization') || '';
  const ehCron = !!CRON_SECRET && header === `Bearer ${CRON_SECRET}`;
  if (!ehCron) {
    const auth = await autenticar(req);
    if (!auth?.isAdmin) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const resumo = {
    multas_criadas: 0,
    reqs_abastecimento_criadas: 0,
    consumo_criadas: 0,
    sem_responsavel: [] as string[],
    erros: [] as string[],
  };

  // ── 1. Multas oficiais (sincronizadas nos últimos 7 dias) ────────────────
  try {
    const desde = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const { data: multas } = await supabase
      .from('frota_multas')
      .select('id, veiculo_id, placa, descricao, numero_auto, valor, pontos, dt_multa, responsavel_id, motorista_nome, local_endereco, local_lat, local_lng, imagens, created_at')
      .gte('created_at', desde);
    for (const m of multas || []) {
      const dia = String(m.dt_multa || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
      // Motorista definido NA MÃO na tela de multas vence a cadeia automática
      let manual: string | null = null;
      if (m.responsavel_id) {
        const { data: mot } = await supabase
          .from('frota_motoristas')
          .select('nome')
          .eq('id', m.responsavel_id)
          .maybeSingle();
        manual = mot?.nome ? String(mot.nome) : null;
      }
      const resp = manual || (await responsavelNaData(m.veiculo_id, m.placa, dia)) || (m.motorista_nome ? String(m.motorista_nome) : null);
      if (!resp) { resumo.sem_responsavel.push(`multa ${m.placa} ${dia}`); continue; }
      const { nome } = await resolverTecnicoNome(supabase, resp);
      const mapsUrl = m.local_lat && m.local_lng ? `https://www.google.com/maps?q=${m.local_lat},${m.local_lng}` : null;
      const obs =
        `Multa de trânsito (${m.placa}) em ${dia.split('-').reverse().join('/')}: ` +
        `${m.descricao || 'infração'}${m.numero_auto ? ` — auto ${m.numero_auto}` : ''}. ` +
        `Valor R$ ${Number(m.valor || 0).toFixed(2)}${m.pontos ? `, ${m.pontos} pts na CNH` : ''}.` +
        `${m.local_endereco ? ` Local: ${m.local_endereco}.` : ''}`;
      const r = await registrarOcorrencia(supabase, {
        tecnico_nome: nome,
        categoria: 'frota',
        subcategoria: 'multa_autuacao',
        observacao: obs,
        origem: 'auto',
        auto_chave: `multa:${m.id}`,
        data: dia,
        anexos: urlsImagens(m.imagens).slice(0, 5).map((url, i) => ({ url, tipo: 'imagem' as const, nome: `multa-${i + 1}.jpg`, tamanho: 0 })),
        detalhes: { multa_id: m.id, placa: m.placa, valor: m.valor, maps_url: mapsUrl },
        criado_por: 'sistema',
      });
      if (r.inseriu) resumo.multas_criadas++;
    }
  } catch (e) {
    resumo.erros.push(`multas: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── 2. Requisições de abastecimento (últimas 48h — TODA conta) ───────────
  try {
    const desde = new Date(Date.now() - 48 * 3600_000).toISOString().slice(0, 10);
    const { data: reqs } = await supabase
      .from('Requisicao')
      .select('id, data, tipo, solicitante, veiculo, litros_combustivel, status')
      .in('tipo', [...TIPOS_REQ_ABASTECIMENTO])
      .gte('data', desde)
      .not('status', 'in', '("lixeira","cancelada")');
    const porTecnico = new Map<string, number>();
    for (const q of reqs || []) {
      if (!q.solicitante) continue;
      const { nome } = await resolverTecnicoNome(supabase, String(q.solicitante));
      const obs =
        `Abastecimento por REQUISIÇÃO #${q.id} (${q.tipo})${q.veiculo ? ` — veículo ${q.veiculo}` : ''}` +
        `${q.litros_combustivel ? `, ${q.litros_combustivel}L` : ''}. O padrão é abastecer com o cartão-frota.`;
      const r = await registrarOcorrencia(supabase, {
        tecnico_nome: nome,
        categoria: 'frota',
        subcategoria: 'requisicao_abastecimento',
        observacao: obs,
        origem: 'auto',
        auto_chave: `req:${q.id}`,
        data: String(q.data || '').slice(0, 10) || undefined,
        detalhes: { requisicao_id: q.id, tipo: q.tipo },
        criado_por: 'sistema',
        notificar: false, // notificação agrupada abaixo (anti-spam)
      });
      if (r.inseriu) {
        resumo.reqs_abastecimento_criadas++;
        porTecnico.set(nome, (porTecnico.get(nome) || 0) + 1);
      }
    }
    // Aviso AGRUPADO: 1 notificação por técnico por rodada
    const sub = getSubcategoria('frota', 'requisicao_abastecimento');
    for (const [nome, qtd] of porTecnico) {
      await notificarOcorrencia(supabase, {
        tecnico_nome: nome,
        label: `${qtd}× Requisição p/ abastecimento`,
        pontos: (sub?.pontos || 5) * qtd,
        observacao: `${qtd} requisição(ões) de abastecimento nas últimas 48h — o padrão é usar o cartão-frota.`,
        origem: 'auto',
      });
    }
  } catch (e) {
    resumo.erros.push(`requisicoes: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── 3. Consumo anormal (janela de 90 dias, 2σ abaixo do histórico) ───────
  try {
    const desde = new Date(Date.now() - 90 * 86_400_000).toISOString();
    const { data: abast } = await supabase
      .from('abastecimentos')
      .select('placa, id_placa, modelo_veiculo, filial_nome, motorista_nome, posto_nome, posto_cidade, combustivel, litros, valor_total, hodometro, data_transacao, capacidade_tanque, ordem_servico, departamento')
      .gte('data_transacao', desde)
      .order('data_transacao', { ascending: true });
    const anomalias = anomaliasConsumo((abast || []) as LinhaDash[]);
    const mesAtual = new Date().toISOString().slice(0, 7);
    for (const a of anomalias) {
      // responsável ATUAL do veículo (a anomalia é do trecho mais recente)
      const { data: veic } = await supabase.from('frota_veiculos').select('id').eq('placa', a.placa).maybeSingle();
      const hoje = new Date().toISOString().slice(0, 10);
      const resp = await responsavelNaData(veic?.id ?? null, a.placa, hoje);
      if (!resp) { resumo.sem_responsavel.push(`consumo ${a.placa}`); continue; }
      const { nome } = await resolverTecnicoNome(supabase, resp);
      const obs =
        `Consumo anormal (${a.placa}${a.modelo ? ` ${a.modelo}` : ''}): último trecho fez ` +
        `${a.kmlRecente.toFixed(1)} km/l contra média histórica de ${a.kmlMedio.toFixed(1)} km/l ` +
        `(${a.desvios.toFixed(1)} desvios abaixo, ${a.trechos} trechos analisados).`;
      const r = await registrarOcorrencia(supabase, {
        tecnico_nome: nome,
        categoria: 'frota',
        subcategoria: 'consumo_anormal',
        observacao: obs,
        origem: 'auto',
        auto_chave: `consumo:${a.placa}:${mesAtual}`,
        detalhes: { placa: a.placa, kml_recente: a.kmlRecente, kml_medio: a.kmlMedio, desvios: a.desvios },
        criado_por: 'sistema',
      });
      if (r.inseriu) resumo.consumo_criadas++;
    }
  } catch (e) {
    resumo.erros.push(`consumo: ${e instanceof Error ? e.message : String(e)}`);
  }

  console.log('[frota] ocorrencias-auto:', JSON.stringify(resumo));
  return NextResponse.json({ ok: true, resumo });
}

// O GitHub Actions chama via curl sem -X (GET) — mesmo handler.
export { POST as GET };
