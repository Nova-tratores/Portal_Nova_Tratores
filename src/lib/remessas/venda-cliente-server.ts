// Demonstração que vira venda NA CASA DO CLIENTE (27/11/2026) — servidor. Regras em ./venda-cliente.ts.
// Andamento em remessas_vendas_cliente (sql/remessas-venda-cliente.sql): cada passo grava a etapa antes
// de seguir, então "Continuar" retoma do ponto onde parou e nada é criado em dobro.
import { supabaseAdmin as sb } from '@/lib/server/supabase-admin';
import { lerFicha, criarRetorno, emitirNF, marcar, ErroRemessa, type Quem } from './server';
import { SITUACOES } from './regras';
import {
  bloqueiosRemessa, bloqueiosProposta, avisosProposta, itensDoPedido, etapasParaPular, propostaDaLinha, obsVoltaVenda, digitos,
  MOTIVO_PULO_VENDA, type EtapaVenda, type PropostaVenda, type ProdutoCadastro, type ItemRemessaVenda,
} from './venda-cliente';
import { T, log, recalcularTotal, ajustarCategoria, projetoDoChassi } from '@/lib/pedidos-maquinas/server';
import { CONTA_PADRAO } from '@/lib/pedidos-maquinas/regras';
import { importarPropostaNoPedido, COLS_PROPOSTA } from '@/lib/pedidos-maquinas/importar-server';
import { pularEtapas } from '@/lib/pops/roteiros-server';

type Low = 'nova' | 'castro';
const MSG = 'Falta aplicar sql/remessas-venda-cliente.sql no banco.';
const agora = () => new Date().toISOString();
const faltou = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === '42P01' || e.code === 'PGRST205' || e.code === '42703' || /remessas_vendas_cliente|remessa_id|venda/.test(e.message || ''));

interface Processo {
  id: string; conta_omie: Low; id_remessa: number; proposta_id: number; os_id: string | null; retorno_emissao_id: string | null;
  pedido_maquina_id: number | null; etapa: EtapaVenda; erro: string | null;
}

async function processoAtivo(conta: Low, idRemessa: number): Promise<Processo | null> {
  const { data, error } = await sb.from('remessas_vendas_cliente').select('*').eq('conta_omie', conta).eq('id_remessa', idRemessa).neq('etapa', 'cancelada').maybeSingle();
  if (error) throw faltou(error) ? new ErroRemessa(MSG, 503, true) : error;
  return (data as Processo) || null;
}
async function gravar(id: string, campos: Partial<Processo> & { concluido_em?: string }) {
  const { error } = await sb.from('remessas_vendas_cliente').update({ ...campos, atualizado_em: agora() }).eq('id', id);
  if (error) throw error;
}

/** Propostas do mesmo CPF/CNPJ (o campo da proposta é texto livre, com ou sem máscara). */
async function propostasDoCliente(doc: string, extraId?: number): Promise<PropostaVenda[]> {
  const d = digitos(doc);
  const linhas: Record<string, unknown>[] = [];
  if (d.length >= 11) {
    const { data, error } = await sb.from('v_formulario').select(COLS_PROPOSTA).ilike('"Cpf/Cpnj"', `%${d.split('').join('%')}%`)
      .is('deleted_at', null).order('id', { ascending: false }).limit(40);
    if (error) throw error;
    linhas.push(...((data || []) as unknown as Record<string, unknown>[]).filter((r) => digitos(r['Cpf/Cpnj']) === d));
  }
  if (extraId && !linhas.some((r) => Number(r.id) === extraId)) {
    const { data } = await sb.from('v_formulario').select(COLS_PROPOSTA).eq('id', extraId).maybeSingle();
    if (data) linhas.push(data as unknown as Record<string, unknown>);
  }
  const ids = linhas.map((r) => Number(r.id));
  const { data: peds } = ids.length
    ? await sb.from(T.pedidos).select('id_pedido, proposta_id').in('proposta_id', ids).neq('status', 'cancelado')
    : { data: [] as { id_pedido: string; proposta_id: number }[] };
  return linhas.map((r) => propostaDaLinha(r, ((peds || []) as { id_pedido: string; proposta_id: number }[]).filter((p) => p.proposta_id === Number(r.id)).map((p) => p.id_pedido)));
}

/** OS com roteiro ativo da mesma máquina (chassi no Projeto) ou do mesmo cliente (CNPJ). */
async function osCandidatas(chassis: string[], doc: string) {
  const { data: rs, error } = await sb.from('pops_os_roteiros').select('id, os_id, nome').eq('status', 'ativo').limit(300);
  if (error || !rs?.length) return [];
  const osIds = [...new Set(rs.map((r) => r.os_id as string))];
  const [{ data: oss }, { data: ets }] = await Promise.all([
    sb.from('Ordem_Servico').select('Id_Ordem, Projeto, Os_Cliente, Cnpj_Cliente, Status').in('Id_Ordem', osIds),
    sb.from('pops_os_etapas').select('id, os_roteiro_id, ordem, nome, status').in('os_roteiro_id', rs.map((r) => r.id as string)),
  ]);
  const finais = chassis.map((c) => c.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(-6)).filter((c) => c.length >= 5);
  const d = digitos(doc);
  const out: Array<{ osId: string; cliente: string; projeto: string; motivo: string; roteiros: Array<{ id: string; nome: string; etapas: Array<{ id: string; nome: string; status: string; ordem: number }>; pular: string[] }> }> = [];
  for (const os of (oss || []) as Array<{ Id_Ordem: string; Projeto: string | null; Os_Cliente: string | null; Cnpj_Cliente: string | null }>) {
    const proj = String(os.Projeto || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
    const pelaMaquina = finais.some((f) => proj.includes(f));
    const peloCliente = !!d && digitos(os.Cnpj_Cliente) === d;
    if (!pelaMaquina && !peloCliente) continue;
    const roteiros = rs.filter((r) => r.os_id === os.Id_Ordem).map((r) => {
      const etapas = ((ets || []) as Array<{ id: string; os_roteiro_id: string; ordem: number; nome: string; status: string }>)
        .filter((e) => e.os_roteiro_id === r.id).sort((a, b) => a.ordem - b.ordem);
      return { id: r.id as string, nome: r.nome as string, etapas, pular: etapasParaPular(etapas).map((e) => e.id) };
    });
    out.push({ osId: os.Id_Ordem, cliente: os.Os_Cliente || '', projeto: os.Projeto || '', motivo: pelaMaquina ? 'mesma máquina' : 'mesmo cliente', roteiros });
  }
  return out.sort((a, b) => (a.motivo === 'mesma máquina' ? -1 : 1) - (b.motivo === 'mesma máquina' ? -1 : 1));
}

async function produtosDaRemessa(conta: Low, itens: ItemRemessaVenda[]): Promise<ProdutoCadastro[]> {
  const ids = itens.map((i) => Number(i.nCodProd)).filter(Boolean);
  if (!ids.length) return [];
  const { data } = await sb.from('produtos').select('codigo, codigo_produto, descricao, familia_nome, marca, modelo, conta_omie').in('codigo_produto', ids);
  return ((data || []) as Array<ProdutoCadastro & { conta_omie: string }>).filter((p) => String(p.conta_omie || '').toLowerCase() === conta);
}

/** Tudo o que a janela mostra antes de confirmar. */
export async function previaVendaCliente(conta: Low, idRemessa: number, propostaId?: number) {
  const ficha = await lerFicha(conta, idRemessa);
  const processo = await processoAtivo(conta, idRemessa);
  const l = ficha.linha;
  const voltaViva = (ficha.emissoes as Array<{ tipo: string; status: string; venda?: boolean }>)
    .some((e) => e.tipo === 'retorno' && !e.venda && e.status !== 'falhou' && e.status !== 'cancelada');
  const bloqueios = processo ? [] : bloqueiosRemessa({ tipo: l.tipo, situacaoAberta: SITUACOES[l.situacao].aberta, nfChave: ficha.nf?.chave, temVoltaViva: voltaViva });
  const itensRem = (ficha.itens as ItemRemessaVenda[]);
  const [propostas, produtos] = await Promise.all([propostasDoCliente(l.cnpj, propostaId || processo?.proposta_id), produtosDaRemessa(conta, itensRem)]);
  const escolhida = propostas.find((p) => p.id === (processo?.proposta_id || propostaId)) || null;
  const pedido = itensDoPedido(itensRem, produtos, escolhida?.valor || 0);
  const oss = await osCandidatas(pedido.itens.map((i) => i.chassi || i.codigo), l.cnpj);
  return {
    remessa: { conta, idRemessa, numero: l.numero, cliente: l.destinatario, cnpj: l.cnpj, cfop: l.cfop, total: l.total, nf: ficha.nf },
    cfopVolta: l.cfop.startsWith('6') ? '2.913' : '1.913',
    bloqueios, processo, propostas,
    proposta: escolhida ? { ...escolhida, bloqueios: bloqueiosProposta(escolhida, l.cnpj), avisos: avisosProposta(escolhida) } : null,
    itens: pedido.itens, avisosItens: pedido.avisos, oss, omieErro: ficha.omieErro,
  };
}

/** Cria o PVM (ou acha o que um passo interrompido já criou) com a máquina da remessa e a proposta. */
async function criarPedido(p: Processo, quem: Quem): Promise<{ id: number; id_pedido: string }> {
  const { data: ja } = await sb.from(T.pedidos).select('id, id_pedido').eq('remessa_conta', p.conta_omie).eq('remessa_id', p.id_remessa).neq('status', 'cancelado').limit(1);
  if (ja?.length) return ja[0] as { id: number; id_pedido: string };
  const prev = await previaVendaCliente(p.conta_omie, p.id_remessa, p.proposta_id);
  if (!prev.itens.length) throw new ErroRemessa('Não achei a máquina da remessa no cadastro do portal para montar o pedido.', 409);
  const empresa = p.conta_omie === 'castro' ? 'Castro Peças' : 'Nova Tratores';
  const { data: novo, error } = await sb.from(T.pedidos).insert({
    criado_por: quem.nome, empresa, conta_corrente: CONTA_PADRAO, consumo_final: true,
    remessa_conta: p.conta_omie, remessa_id: p.id_remessa,
    observacao: `Venda na demonstração: remessa nº ${prev.remessa.numero}${prev.remessa.nf ? ` (NF ${prev.remessa.nf.numero})` : ''} — a máquina ficou com o cliente.`,
  }).select('id, id_pedido').single();
  if (error) throw error;
  await log(novo.id, 'Pedido criado pela venda no cliente (demonstração)', quem.nome, { remessa: `${p.conta_omie}-${p.id_remessa}` });
  for (const it of prev.itens) {
    const { error: eIt } = await sb.from(T.itens).insert({ pedido_id: novo.id, ...it, descricao: it.descricao.slice(0, 300) });
    if (eIt) throw eIt;
  }
  await recalcularTotal(novo.id);
  await ajustarCategoria(novo.id);
  const ch = prev.itens.find((i) => i.chassi)?.chassi;
  if (ch) { const proj = await projetoDoChassi(ch, empresa); if (proj) await sb.from(T.pedidos).update({ projeto: proj }).eq('id', novo.id); }
  await importarPropostaNoPedido(novo.id, p.proposta_id, { cliente: true, itens: true, parcelas: true }, quem.nome);
  return novo as { id: number; id_pedido: string };
}

/**
 * Confirmar / Continuar. Anda o quanto puder; falha da Omie grava o erro na etapa e devolve
 * { ok:false } para a tela mostrar "Continuar".
 */
export async function executarVendaCliente(a: { conta: Low; idRemessa: number; propostaId: number; osId: string | null; quem: Quem }) {
  let p = await processoAtivo(a.conta, a.idRemessa);
  if (!p) {
    const prev = await previaVendaCliente(a.conta, a.idRemessa, a.propostaId);
    const b = [...prev.bloqueios, ...(prev.proposta ? prev.proposta.bloqueios : ['Escolha a proposta da venda.'])];
    if (!prev.itens.length) b.push('A máquina da remessa não está no cadastro do portal.');
    if (b.length) throw new ErroRemessa(b.join(' '), 409);
    const { data, error } = await sb.from('remessas_vendas_cliente').insert({
      conta_omie: a.conta, id_remessa: a.idRemessa, proposta_id: a.propostaId, os_id: a.osId || null,
      user_id: a.quem.id, user_nome: a.quem.nome,
    }).select('*').single();
    if (error) {
      if (error.code === '23505') throw new ErroRemessa('Esta venda já foi começada por outra pessoa agora há pouco — abra a ficha de novo.', 409);
      throw faltou(error) ? new ErroRemessa(MSG, 503, true) : error;
    }
    p = data as Processo;
  } else if (a.osId !== undefined && a.osId !== p.os_id && p.etapa !== 'concluida') {
    await gravar(p.id, { os_id: a.osId || null }); p.os_id = a.osId || null;
  }

  const parar = async (erro: string) => { await gravar(p!.id, { erro }); return { ok: false as const, etapa: p!.etapa, erro }; };
  try {
    if (p.etapa === 'iniciada') {
      const r = await criarRetorno({ conta: a.conta, idRemessa: a.idRemessa, obs: obsVoltaVenda(p.proposta_id), quem: a.quem, venda: true });
      p.retorno_emissao_id = r.emissaoId; p.etapa = 'volta_criada';
      await gravar(p.id, { retorno_emissao_id: r.emissaoId, etapa: 'volta_criada', erro: null });
    }
    if (p.etapa === 'volta_criada') {
      const r = await emitirNF(p.retorno_emissao_id!, a.quem);
      if (!r.ok) return parar(`A NF-e da volta não saiu: ${r.erro || 'sem resposta da Omie'}`);
      p.etapa = 'volta_emitida';
      await gravar(p.id, { etapa: 'volta_emitida', erro: null });
    }
    let pedido: { id: number; id_pedido: string } | null = null;
    if (p.etapa === 'volta_emitida') {
      pedido = await criarPedido(p, a.quem);
      p.pedido_maquina_id = pedido.id; p.etapa = 'pedido_criado';
      await gravar(p.id, { pedido_maquina_id: pedido.id, etapa: 'pedido_criado', erro: null });
    }
    if (p.etapa === 'pedido_criado') {
      if (!pedido) {
        const { data } = await sb.from(T.pedidos).select('id, id_pedido').eq('id', p.pedido_maquina_id!).single();
        pedido = data as { id: number; id_pedido: string };
      }
      await marcar(a.conta, a.idRemessa, 'virou_venda', a.quem, { pedido: pedido.id_pedido, obs: `Vendida no cliente — proposta #${p.proposta_id}` });
      let puladas = 0;
      if (p.os_id) {
        const { data: rs } = await sb.from('pops_os_roteiros').select('id').eq('os_id', p.os_id).eq('status', 'ativo');
        for (const r of rs || []) {
          const { data: ets } = await sb.from('pops_os_etapas').select('id, ordem, nome, status').eq('os_roteiro_id', r.id);
          const ids = etapasParaPular((ets || []) as Array<{ id: string; ordem: number; nome: string; status: string }>).map((e) => e.id);
          puladas += (await pularEtapas(r.id as string, ids, MOTIVO_PULO_VENDA, a.quem.id)).puladas;
        }
      }
      p.etapa = 'concluida';
      await gravar(p.id, { etapa: 'concluida', erro: null, concluido_em: agora() });
      return { ok: true as const, etapa: p.etapa, pedido, puladas };
    }
    return { ok: true as const, etapa: p.etapa, pedido: null, puladas: 0 };
  } catch (e) {
    const msg = (e as Error).message || String(e);
    await gravar(p.id, { erro: msg }).catch(() => undefined);
    throw e;
  }
}

/** Desistir antes da volta sair (nada foi emitido): libera a remessa para outra decisão. */
export async function cancelarVendaCliente(conta: Low, idRemessa: number) {
  const p = await processoAtivo(conta, idRemessa);
  if (!p) return { ok: true };
  if (p.etapa !== 'iniciada' && p.etapa !== 'volta_criada') throw new ErroRemessa('A NF-e da volta já foi emitida — a venda só pode seguir em frente.', 409);
  if (p.etapa === 'volta_criada') {
    const { data: em } = await sb.from('remessas_emissoes').select('status').eq('id', p.retorno_emissao_id!).maybeSingle();
    if (em?.status === 'faturada') throw new ErroRemessa('A NF-e da volta já saiu — use "Continuar".', 409);
    if (em) await sb.from('remessas_emissoes').update({ status: 'cancelada', erro: 'Venda no cliente desistida antes de emitir (cancele a nota na Omie se ela ficou criada).', atualizado_em: agora() }).eq('id', p.retorno_emissao_id!);
  }
  await gravar(p.id, { etapa: 'cancelada' });
  return { ok: true };
}
