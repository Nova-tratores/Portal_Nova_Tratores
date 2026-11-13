// Faturar o reembolso da montadora a partir da DRVG (planilha que a Mahindra
// manda). Prévia: lê a planilha, casa cada SG com a garantia do portal e mostra
// o que vai acontecer. Aplicar: aprova/recusa as garantias pela mesma função da
// tela (finalizarGarantia), grava as horas/km que a fábrica pagou e cria a OS de
// reembolso no POS (cliente = montadora). Nada vai à Omie aqui: a OS sai pelo
// "Enviar Omie" e pelo "Faturar" do próprio POS, com as conferências de lá.
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/pos/supabase';
import { TBL_GARANTIAS, TBL_GAR_ANEXOS, BUCKET_GARANTIAS, valoresFabrica } from './constants';
import { registrarEvento } from './server';
import { normSG } from './notas';
import { nfseReembolsoDasGarantias } from './notas-server';
import { finalizarGarantia } from './finalizar';
import { definirPagoFabrica } from './pago-fabrica-server';
import { lerDrvg, montarOsReembolso, type Drvg, type SgDrvg, type AjusteReembolso } from './drvg';
import { TBL_OS } from '@/lib/pos/constants';
import { registrarAuditLog } from '@/lib/server/audit-notify';
import { espelhoPadrao, CODIGOS_INTERNOS, NCOD_SERV_PECAS_REEMBOLSO, type ReembolsoOS } from '@/lib/pos/omie-espelho';

export const TIPO_OS_REEMBOLSO = 'Reembolso de garantia';

export type AcaoSg = 'aprovar' | 'recusar' | 'ja_aprovada' | 'ja_recusada' | 'nao_encontrada' | 'fora_da_fabrica';

export interface LinhaPrevia extends SgDrvg {
  acao: AcaoSg;
  garantia: { id: string; numero: string; status: string; os: string; cliente: string | null; horasPedidas: number; kmPedidos: number } | null;
  /** já tem NFS-e de reembolso (vinculada ou citando a SG) */
  nfse: string | null;
  /** já está numa OS de reembolso ativa do POS */
  osReembolso: string | null;
  /** entra na OS de reembolso que será criada */
  naOs: boolean;
}

export interface PreviaDrvg {
  drvg: Drvg;
  montadora: { id: string; nome: string; taxaHora: number; taxaKm: number };
  cliente: { nome: string; doc: string } | null;
  linhas: LinhaPrevia[];
  os: ReturnType<typeof montarOsReembolso>;
  /** OS de reembolso que já usou este número de DRVG */
  osMesmaDrvg: string | null;
  avisos: string[];
}

type G = {
  id: string; numero: string; numero_externo: string | null; status: string; id_ordem: string; cliente: string | null; created_at: string;
  tecnico_horas: number | null; tecnico_km: number | null; garantista_horas: number | null; garantista_km: number | null; valor_pago_total: number | null;
};

const dinheiro = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const ATIVAS_FABRICA = ['enviada', 'ressarcimento_fabrica'];

export function lerPlanilha(buffer: Buffer): Drvg {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sh = wb.Sheets[wb.SheetNames[0]];
  if (!sh) throw new Error('A planilha está vazia.');
  return lerDrvg(XLSX.utils.sheet_to_json(sh, { header: 1, raw: false, defval: null }) as (string | null)[][]);
}

/** cliente da OS = a montadora como ela aparece nas NFS-e de reembolso já emitidas */
async function clienteDaMontadora(nome: string): Promise<{ nome: string; doc: string } | null> {
  const { data } = await supabase.from('notas_fiscais_docs')
    .select('parte_nome, parte_doc, data_emissao')
    .eq('tipo', 'saida_servico').eq('conta_omie', 'NOVA').ilike('parte_nome', `%${nome}%`)
    .not('parte_doc', 'is', null).order('data_emissao', { ascending: false }).limit(1);
  const r = data?.[0] as { parte_nome: string; parte_doc: string } | undefined;
  if (!r?.parte_doc) return null;
  const d = r.parte_doc.replace(/\D/g, '');
  const doc = d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : d;
  return { nome: r.parte_nome, doc };
}

/** OS de reembolso ativas no POS → id da garantia → OS (e as DRVGs já usadas) */
async function osDeReembolsoAtivas(): Promise<{ porGarantia: Map<string, string>; porDrvg: Map<string, string> }> {
  const porGarantia = new Map<string, string>(), porDrvg = new Map<string, string>();
  const { data } = await supabase.from(TBL_OS).select('Id_Ordem, Status, Omie_Espelho').eq('Tipo_Servico', TIPO_OS_REEMBOLSO);
  for (const o of (data || []) as { Id_Ordem: string; Status: string; Omie_Espelho: { reembolso?: ReembolsoOS | null } | null }[]) {
    if (/cancel/i.test(o.Status || '')) continue;
    const r = o.Omie_Espelho?.reembolso;
    if (!r) continue;
    for (const g of r.garantias || []) porGarantia.set(g.id, o.Id_Ordem);
    if (r.drvg) porDrvg.set(`${r.montadoraId}|${r.drvg}`, o.Id_Ordem);
  }
  return { porGarantia, porDrvg };
}

export async function previaDrvg(buffer: Buffer, montadoraId: string): Promise<PreviaDrvg> {
  const drvg = lerPlanilha(buffer);
  const { data: m } = await supabase.from('garantia_montadoras').select('id, nome, valor_hora, valor_km').eq('id', montadoraId).maybeSingle();
  if (!m) throw new Error('Montadora não encontrada.');
  const cad = valoresFabrica(m);
  const taxaHora = drvg.taxaHora || cad.hora;
  const taxaKm = drvg.taxaKm || cad.km;
  const avisos = [...drvg.avisos];
  if (drvg.taxaHora && cad.hora && Math.abs(drvg.taxaHora - cad.hora) > 0.001) avisos.push(`A DRVG paga ${dinheiro(drvg.taxaHora)}/h e o cadastro da ${m.nome} diz ${dinheiro(cad.hora)}/h. Vale o da DRVG nesta OS.`);
  if (drvg.taxaKm && cad.km && Math.abs(drvg.taxaKm - cad.km) > 0.001) avisos.push(`A DRVG paga ${dinheiro(drvg.taxaKm)}/km e o cadastro da ${m.nome} diz ${dinheiro(cad.km)}/km. Vale o da DRVG nesta OS.`);

  const { data: gs } = await supabase.from(TBL_GARANTIAS)
    .select('id, numero, numero_externo, status, id_ordem, cliente, created_at, tecnico_horas, tecnico_km, garantista_horas, garantista_km, valor_pago_total')
    .eq('montadora_id', montadoraId).not('numero_externo', 'is', null);
  const porSg = new Map<string, G>();
  for (const g of (gs || []) as G[]) {
    const sg = normSG(g.numero_externo);
    if (sg && (!porSg.has(sg) || porSg.get(sg)!.status === 'cancelada')) porSg.set(sg, g);
  }
  const achadas = drvg.sgs.map((s) => porSg.get(s.sg)).filter(Boolean) as G[];
  const nfse = await nfseReembolsoDasGarantias(achadas.map((g) => ({ ...g, montadora: m.nome })));
  const ativas = await osDeReembolsoAtivas();

  const linhas: LinhaPrevia[] = drvg.sgs.map((s) => {
    const g = porSg.get(s.sg);
    let acao: AcaoSg;
    if (!g || g.status === 'cancelada') acao = 'nao_encontrada';
    else if (g.status === 'aprovada') acao = 'ja_aprovada';
    else if (g.status === 'rejeitada') acao = 'ja_recusada';
    else if (!ATIVAS_FABRICA.includes(g.status)) acao = 'fora_da_fabrica';
    else acao = s.negativa ? 'recusar' : 'aprovar';
    const nf = g ? nfse.get(g.id) : undefined;
    const os = g ? ativas.porGarantia.get(g.id) || null : null;
    return {
      ...s, acao, nfse: nf?.numero || null, osReembolso: os,
      naOs: !s.negativa && (acao === 'aprovar' || acao === 'ja_aprovada') && !nf && !os,
      garantia: g ? {
        id: g.id, numero: g.numero, status: g.status, os: g.id_ordem, cliente: g.cliente,
        horasPedidas: Number(g.garantista_horas ?? g.tecnico_horas) || 0, kmPedidos: Number(g.garantista_km ?? g.tecnico_km) || 0,
      } : null,
    };
  });

  const os = montarOsReembolso(linhas.filter((l) => l.naOs).map((l) => ({ ...l, negativa: false })),
    { drvg: drvg.numero, pedidoCompra: drvg.pedidoCompra, taxaHora, taxaKm });
  const aprovadas = linhas.filter((l) => !l.negativa && (l.acao === 'aprovar' || l.acao === 'ja_aprovada'));
  const notas = [...new Set(aprovadas.map((l) => l.nfse).filter(Boolean))];
  const emOs = [...new Set(aprovadas.map((l) => l.osReembolso).filter(Boolean))];
  if (aprovadas.length && aprovadas.every((l) => l.nfse || l.osReembolso)) {
    avisos.push(`Esta DRVG já foi faturada${notas.length ? ` (NFS-e ${notas.join(', ')})` : ''}${emOs.length ? ` (já na ${emOs.join(', ')})` : ''}. Não há nada novo para faturar.`);
  } else if (drvg.totais.total > 0 && Math.abs(os.total - drvg.totais.total) > 0.05) {
    avisos.push(`A OS fica em ${dinheiro(os.total)} e a DRVG manda faturar ${dinheiro(drvg.totais.total)} — confira as SGs que ficaram de fora.`);
  }
  const cliente = await clienteDaMontadora(m.nome);
  if (!cliente) avisos.push(`Não achei o CNPJ da ${m.nome} em nenhuma NFS-e anterior — a OS não pode ser criada por aqui.`);
  const osMesmaDrvg = drvg.numero ? ativas.porDrvg.get(`${m.id}|${drvg.numero}`) || null : null;
  if (osMesmaDrvg) avisos.push(`A DRVG ${drvg.numero} já gerou a ${osMesmaDrvg} no POS.`);

  return { drvg, montadora: { id: m.id, nome: m.nome, taxaHora, taxaKm }, cliente, linhas, os, osMesmaDrvg, avisos };
}

export interface ResultadoSg { sg: string; garantia: string | null; ok: boolean; mensagem: string }

/** guarda a DRVG uma vez e anexa como "retorno da fábrica" em cada garantia que vai ser finalizada */
async function anexarDrvg(buffer: Buffer, nome: string, garantias: { id: string }[], ator: string) {
  if (!garantias.length) return;
  const limpo = nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '-').replace(/[^a-zA-Z0-9.\-_]/g, '') || 'drvg.xlsx';
  const path = `drvg/${Date.now()}_${limpo}`;
  const { error } = await supabase.storage.from(BUCKET_GARANTIAS).upload(path, buffer, {
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', upsert: true,
  });
  if (error) throw new Error(`Não consegui guardar a planilha: ${error.message}`);
  const url = supabase.storage.from(BUCKET_GARANTIAS).getPublicUrl(path).data.publicUrl;
  for (const g of garantias) {
    await supabase.from(TBL_GAR_ANEXOS).insert({ garantia_id: g.id, categoria: 'retorno_fabrica', url, nome_arquivo: nome, content_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', enviado_por: ator });
    await supabase.from(TBL_GARANTIAS).update({ retorno_fabrica_url: url, updated_at: new Date().toISOString() }).eq('id', g.id);
    await registrarEvento(g.id, { tipo: 'retorno_fabrica', ator, detalhe: `DRVG anexada (${nome})` });
  }
}

export async function aplicarDrvg(buffer: Buffer, nomeArquivo: string, montadoraId: string, opts: { criarOs: boolean; pedidoCompra?: string; ajuste?: AjusteReembolso | null }, ator: string): Promise<{
  resultados: ResultadoSg[]; os: string | null; osErro: string | null; previa: PreviaDrvg;
}> {
  const previa = await previaDrvg(buffer, montadoraId);
  const { drvg } = previa;
  const ref = `DRVG ${drvg.numero || nomeArquivo}`;
  const resultados: ResultadoSg[] = [];
  const finalizar = previa.linhas.filter((l) => l.acao === 'aprovar' || l.acao === 'recusar');
  await anexarDrvg(buffer, nomeArquivo, finalizar.map((l) => l.garantia!), ator);

  const aprovadasAgora = new Set<string>();
  for (const l of finalizar) {
    const g = l.garantia!;
    const aprovar = l.acao === 'aprovar';
    const r = await finalizarGarantia(g.id, {
      resultado: aprovar ? 'aprovada' : 'rejeitada',
      garantista_horas: g.horasPedidas, garantista_km: g.kmPedidos,
      garantista_obs: `${ref}${l.obs ? `: ${l.obs}` : ''}`.slice(0, 500),
      ...(aprovar ? {} : { motivo_recusa: `${ref}: ${l.obs || 'negativa da fábrica'}`.slice(0, 500) }),
    }, ator);
    if (r.status !== 200) {
      resultados.push({ sg: l.sg, garantia: g.numero, ok: false, mensagem: String(r.json.error || 'não finalizou') });
      continue;
    }
    if (aprovar) {
      aprovadasAgora.add(g.id);
      // o que a fábrica PAGOU (pode ser menos do que pedimos)
      if (Math.abs(l.horas - g.horasPedidas) > 0.001 || Math.abs(l.km - g.kmPedidos) > 0.001) {
        const p = await definirPagoFabrica(g.id, l.horas, l.km, ator);
        if (!p.ok) { resultados.push({ sg: l.sg, garantia: g.numero, ok: false, mensagem: `aprovada, mas não gravou as horas/km pagas: ${p.erro}` }); continue; }
      }
    }
    resultados.push({ sg: l.sg, garantia: g.numero, ok: true, mensagem: aprovar ? `aprovada · pagou ${l.horasTexto} h e ${l.km} km` : 'recusada' });
  }

  let os: string | null = null, osErro: string | null = null;
  if (opts.criarOs) {
    const entra = previa.linhas.filter((l) => l.naOs && (l.acao === 'ja_aprovada' || aprovadasAgora.has(l.garantia!.id)));
    if (!entra.length) osErro = 'Nenhuma SG aprovada para faturar.';
    else if (!previa.cliente) osErro = `Sem o CNPJ da ${previa.montadora.nome} para a OS.`;
    else if (previa.osMesmaDrvg) osErro = `A DRVG ${drvg.numero} já tem a ${previa.osMesmaDrvg}.`;
    else {
      try {
        os = await criarOsReembolso(previa, entra, (opts.pedidoCompra || drvg.pedidoCompra || '').trim(), opts.ajuste || null, ator);
      } catch (e) { osErro = e instanceof Error ? e.message : String(e); }
    }
  }
  return { resultados, os, osErro, previa };
}

async function criarOsReembolso(previa: PreviaDrvg, entra: LinhaPrevia[], pedidoCompra: string, ajuste: AjusteReembolso | null, ator: string): Promise<string> {
  const { montadora, drvg, cliente } = previa;
  const conta = montarOsReembolso(entra.map((l) => ({ ...l, negativa: false })), { drvg: drvg.numero, pedidoCompra, taxaHora: montadora.taxaHora, taxaKm: montadora.taxaKm, ajuste });
  const ajustou = conta.ajuste.hora + conta.ajuste.km + conta.ajuste.pecas > 0;

  const { data: resId } = await supabase.from(TBL_OS).select('Id_Ordem').order('Id_Ordem', { ascending: false }).limit(1);
  const ultimo = resId?.length ? parseInt(String(resId[0].Id_Ordem).split('-')[1], 10) || 0 : 0;
  const idOs = `OS-${String(ultimo + 1).padStart(4, '0')}`;
  const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });

  const esp = espelhoPadrao({ garantia: true });
  const contrato = CODIGOS_INTERNOS.find((c) => c.codigo.toLowerCase() === `${montadora.nome}-pgo`.toLowerCase())?.codigo || '';
  esp.info = { ...esp.info, categoria: '1.01.01', contrato }; // 3. #Serv Prest Garantia — o mesmo das OS 5357–5359
  if (conta.pecas > 0) {
    esp.extras = [{ id: 'reembolso-pecas', codigo: 'Peças', nome: 'Peças', descricao: '', qtde: 1, unit: conta.pecas, cobrar: true, nCod: NCOD_SERV_PECAS_REEMBOLSO }];
  }
  const reembolso: ReembolsoOS = {
    montadoraId: montadora.id, montadora: montadora.nome, drvg: drvg.numero, pedidoCompra, valorDrvg: drvg.totais.total,
    garantias: entra.map((l) => ({ id: l.garantia!.id, numero: l.garantia!.numero, sg: l.sg })),
    criadoPor: ator, criadoEm: new Date().toISOString(),
    ajuste: ajustou ? conta.ajuste : null,
  };

  const { error } = await supabase.from(TBL_OS).insert({
    Id_Ordem: idOs, Status: 'Enviar Omie', Data: hoje,
    Os_Cliente: cliente!.nome, Cnpj_Cliente: cliente!.doc, Endereco_Cliente: '', Cidade_Cliente: '',
    Os_Tecnico: '', Os_Tecnico2: '',
    Tipo_Servico: TIPO_OS_REEMBOLSO, Revisao: '', Projeto: '',
    Serv_Solicitado: conta.texto,
    Qtd_HR: conta.horas, Valor_HR: montadora.taxaHora, Qtd_KM: conta.km, Valor_KM: montadora.taxaKm,
    Valor_Total: conta.total, ID_PPV: '', Desconto: 0, Desconto_Hora: conta.ajuste.hora, Desconto_KM: conta.ajuste.km,
    Previsao_Faturamento: hoje,
    Omie_Espelho: { ...esp, reembolso },
  });
  if (error) throw new Error(`Não consegui criar a OS: ${error.message}`);

  for (const l of entra) {
    await registrarEvento(l.garantia!.id, {
      tipo: 'reembolso_os', ator,
      detalhe: `Na OS de reembolso ${idOs} (DRVG ${drvg.numero || '—'}) para faturar contra a ${montadora.nome}.${ajustou ? ` Valores ajustados para bater com a DRVG (${dinheiro(conta.total)}).` : ''}`,
    });
  }
  await registrarAuditLog({
    userName: ator, sistema: 'garantias', acao: 'reembolso_os', entidade: 'Ordem_Servico', entidadeId: idOs,
    entidadeLabel: `${idOs} · DRVG ${drvg.numero}`, detalhes: { drvg: drvg.numero, total: conta.total, sgs: conta.sgs, ajuste: ajustou ? conta.ajuste : null },
  });
  return idOs;
}
