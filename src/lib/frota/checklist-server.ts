// Checklist mensal de veículo — gravação (service role). Usado por:
//   /api/frota/checklist           → usuário do portal (módulo Frota), carro SEM responsável
//   /api/frota/checklist-vendedor  → vendedor do app de vendas, o carro DELE
// Mesmas tabelas do NT Mecânico (veiculo_checklist / veiculo_checklist_itens) e
// fotos na pasta PRIVADA `frota-checklist` (lib/frota/checklist-fotos). Um checklist por (placa, mês).
import { randomUUID } from 'crypto';
import { supabaseAdmin as supabase } from '@/lib/server/supabase-admin';
import { resolverPlaca, extrairPlacaDeNumPlaca } from '@/lib/frota/placa';
import { responsavelVazio } from '@/lib/frota/responsavel';
import { CHECKLIST_ITEMS, calcularScore, camposAtualizacaoItem } from '@/lib/frota/checklist';
import { tipoFotoPneu, type AnalisePneu } from '@/lib/frota/pneu-regras';
import { analisarFotoPneu } from '@/lib/frota/pneu-ia';
import { assinarFoto, assinarFotos, subirFotoChecklist } from '@/lib/frota/checklist-fotos';

export type Resultado = { status: number; body: Record<string, unknown> };
const ok = (body: Record<string, unknown>): Resultado => ({ status: 200, body });
const falha = (error: string, status = 400): Resultado => ({ status, body: { error } });

export const mesAtual = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

/**
 * Veículo que NÃO deve mais entrar na rotina de checklist.
 *
 * Duas razões: saiu da frota (vendido/arquivado/inativo) ou foi desligado à
 * mão (`checklist_desativado` — ex.: carro parado no pátio). A trava fica AQUI,
 * no início do checklist, e não só na tela: o checklist também é aberto pelo
 * app dos mecânicos e pelo app de vendas.
 *
 * Tolerante à migração pendente: sem a coluna, o `select('*')` devolve a linha
 * sem ela e só a regra de ativo/status vale.
 */
export async function checklistBloqueado(placaCanon: string): Promise<string | null> {
  const { data: v } = await supabase.from('frota_veiculos').select('*').eq('placa', placaCanon).maybeSingle();
  if (!v) return null; // veículo fora do cadastro: mantém o comportamento de antes
  const row = v as Record<string, unknown>;
  const status = String(row.status || '').toLowerCase();
  if (row.ativo === false || status === 'vendido' || status === 'arquivado') {
    return 'Veículo inativo (vendido/arquivado) — não faz mais checklist mensal.';
  }
  if (row.checklist_desativado === true) {
    const motivo = String(row.checklist_desativado_motivo || '').trim();
    return `Checklist desativado neste veículo${motivo ? ` — ${motivo}` : '.'}`;
  }
  return null;
}

/** Veículo com responsável na Frota ou atribuído a um técnico (NT Mecânico). */
export async function estaVinculado(placaCanon: string): Promise<boolean> {
  const { data: veic } = await supabase.from('frota_veiculos').select('id').eq('placa', placaCanon).maybeSingle();
  if (veic) {
    const { data: resp } = await supabase.from('frota_responsaveis').select('id, motorista_nome').eq('veiculo_id', veic.id).is('fim', null).maybeSingle();
    if (resp && !responsavelVazio(resp.motorista_nome)) return true;
  }
  const { data: tvs } = await supabase.from('tecnico_veiculos').select('placa');
  return (tvs || []).some((t) => resolverPlaca(extrairPlacaDeNumPlaca(t.placa)) === placaCanon);
}

/** Checklist do mês + itens + perguntas + dados do veículo. */
export async function estadoDoMes(placa: string): Promise<Resultado> {
  const { data: checklist } = await supabase
    .from('veiculo_checklist').select('*')
    .eq('placa', placa).eq('mes_referencia', mesAtual()).maybeSingle();
  let itens: unknown[] = [];
  if (checklist) {
    const { data } = await supabase.from('veiculo_checklist_itens').select('*').eq('checklist_id', checklist.id).order('created_at');
    itens = await assinarFotos(data || []);
  }
  const { data: veic } = await supabase.from('frota_veiculos').select('placa_exibicao, modelo, marca').eq('placa', placa).maybeSingle();
  return ok({ checklist: checklist || null, itens, items: CHECKLIST_ITEMS, veiculo: veic || null });
}

/** Cria (ou retoma) o checklist do mês. As travas de quem pode ficam com quem chama. */
export async function iniciarChecklist(p: { placa: string; nome: string; km?: unknown; loc?: unknown }): Promise<Resultado> {
  const bloqueio = await checklistBloqueado(p.placa);
  if (bloqueio) return falha(bloqueio);
  const mesRef = mesAtual();
  const km = p.km != null && p.km !== '' && Number.isFinite(Number(p.km)) ? Number(p.km) : null;
  const { data: existente } = await supabase.from('veiculo_checklist').select('id, status').eq('placa', p.placa).eq('mes_referencia', mesRef).maybeSingle();
  if (existente) {
    if (existente.status === 'completo' || existente.status === 'suspeito') return falha('Checklist deste mês já foi concluído.');
    if (km != null) await supabase.from('veiculo_checklist').update({ km }).eq('id', existente.id);
    const { data: itens } = await supabase.from('veiculo_checklist_itens').select('*').eq('checklist_id', existente.id).order('created_at');
    return ok({ id: existente.id, itens: await assinarFotos(itens || []), items: CHECKLIST_ITEMS });
  }

  const insertData: Record<string, unknown> = {
    tecnico_nome: p.nome,
    placa: p.placa, mes_referencia: mesRef, status: 'pendente',
    share_token: randomUUID().replace(/-/g, ''),
    inicio_em: new Date().toISOString(), loc_inicio: p.loc || null,
  };
  if (km != null) insertData.km = km;
  const { data, error } = await supabase.from('veiculo_checklist').insert(insertData).select().single();
  if (error) return falha(error.message, 500);
  return ok({ id: data.id, itens: [], items: CHECKLIST_ITEMS });
}

/** Checklist por id (para conferir de quem é antes de salvar/concluir). */
export async function checklistPorId(id: string) {
  const { data } = await supabase.from('veiculo_checklist').select('id, placa, status').eq('id', id).maybeSingle();
  return data as { id: string; placa: string; status: string } | null;
}

/** Salva um item (multipart), com a foto no bucket `requisicoes`. */
export async function salvarItemChecklist(fd: FormData): Promise<Resultado> {
  const checklistId = String(fd.get('checklist_id') || '');
  const itemKey = String(fd.get('item_key') || '');
  const resposta = String(fd.get('resposta') || '');
  const observacao = String(fd.get('observacao') || '');
  const def = CHECKLIST_ITEMS.find((i) => i.key === itemKey);
  const categoria = String(fd.get('categoria') || def?.cat || '');
  const titulo = String(fd.get('titulo') || def?.titulo || '');
  const fotoCampo = fd.get('foto');
  const foto = fotoCampo && typeof fotoCampo !== 'string' ? fotoCampo : null;
  if (!checklistId || !itemKey) return falha('Dados incompletos');
  if (resposta !== 'ok' && resposta !== 'problema') return falha('Resposta inválida');

  const chk = await checklistPorId(checklistId);
  if (!chk) return falha('Checklist não encontrado', 404);
  if (chk.status === 'completo' || chk.status === 'suspeito') return falha('Checklist deste mês já foi concluído.');

  let fotoUrl: string | null = null;
  let fotoTamanho: number | null = null;
  let iaAnalise: AnalisePneu | null | undefined;
  if (foto) {
    const ext = (foto.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const path = `checklist/${checklistId}/${itemKey}.${ext}`;
    const buffer = Buffer.from(await foto.arrayBuffer());
    fotoTamanho = buffer.length;
    // Pneu: a IA confere se a foto mostra a banda / a lateral legível. Não
    // comprovou → devolve para tirar de novo; quem insiste manda forcar=1 e o
    // item fica gravado com a análise (vira alerta e desconta no score).
    const tipoPneu = tipoFotoPneu(itemKey);
    if (tipoPneu) {
      iaAnalise = await analisarFotoPneu(buffer, foto.type || 'image/jpeg', tipoPneu);
      if (iaAnalise && !iaAnalise.comprova && String(fd.get('forcar') || '') !== '1') {
        return { status: 422, body: { error: iaAnalise.motivo || 'A foto não comprova o item.', refazer: true, analise: iaAnalise } };
      }
    }
    const up = await subirFotoChecklist(path, buffer, foto.type || 'image/jpeg');
    if ('erro' in up) return falha(`Falha no upload da foto: ${up.erro}`, 500);
    fotoUrl = up.ref;
  }

  const { data: existing } = await supabase.from('veiculo_checklist_itens').select('id').eq('checklist_id', checklistId).eq('item_key', itemKey).maybeSingle();
  const campos = camposAtualizacaoItem({ resposta, observacao, fotoUrl, fotoTamanho, agora: new Date().toISOString(), iaAnalise });
  if (!existing && !fotoUrl) return falha('Tire a foto do item.');
  const gravar = (c: Record<string, unknown>) => existing
    ? supabase.from('veiculo_checklist_itens').update(c).eq('id', existing.id)
    : supabase.from('veiculo_checklist_itens').insert({ checklist_id: checklistId, item_key: itemKey, categoria, titulo, ...c });
  const { error: errGravar } = await gravar(campos);
  // sem a coluna ia_analise (sql/frota-checklist-pneu-ia.sql não aplicada) grava o resto
  if (errGravar && 'ia_analise' in campos && /ia_analise/.test(errGravar.message)) {
    const resto = { ...campos };
    delete resto.ia_analise;
    await gravar(resto);
  }
  await supabase.from('veiculo_checklist').update({ status: 'em_andamento' }).eq('id', checklistId).eq('status', 'pendente');
  return ok({ ok: true, foto_url: await assinarFoto(fotoUrl), analise: iaAnalise ?? null });
}

/** Fecha o checklist: duração, score de confiança e título. */
export async function concluirChecklist(checklistId: string, loc: unknown): Promise<Resultado> {
  const { data: checklist } = await supabase.from('veiculo_checklist').select('*').eq('id', checklistId).maybeSingle();
  if (!checklist) return falha('Checklist não encontrado', 404);
  if (checklist.status === 'completo' || checklist.status === 'suspeito') return falha('Checklist deste mês já foi concluído.');
  const { data: itens } = await supabase.from('veiculo_checklist_itens').select('*').eq('checklist_id', checklistId);
  if (!itens || itens.length === 0) return falha('Nenhum item foi salvo. Refaça o checklist.');

  const duracao = Math.round((Date.now() - new Date(checklist.inicio_em).getTime()) / 1000);
  const { score, alertas } = calcularScore({ ...checklist, duracao_total_seg: duracao, loc_fim: loc }, itens);
  const status = score < 50 ? 'suspeito' : 'completo';

  const [refY, refM] = String(checklist.mes_referencia || '').split('-');
  const mesNome = new Date(Number(refY), Number(refM) - 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  let titulo = `Checklist ${checklist.placa} de ${mesNome}`;
  if (checklist.km) titulo += ` com ${Number(checklist.km).toLocaleString('pt-BR')} km`;

  const { error } = await supabase.from('veiculo_checklist').update({
    status, fim_em: new Date().toISOString(), duracao_total_seg: duracao,
    score_confianca: score, alertas: JSON.stringify(alertas), loc_fim: loc || null, titulo,
  }).eq('id', checklistId);
  if (error) return falha(error.message, 500);

  return ok({ status, score, alertas, duracao, titulo, share_token: checklist.share_token || null });
}
