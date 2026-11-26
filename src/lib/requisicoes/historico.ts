// Histórico da requisição (José, 25/11/2026): "tá muito genérico, não marca a
// ação que o usuário fez". PURO: sem banco.
//
//  - Gravar: registrosDaMudanca(antes, dados) olha O QUE mudou e vira ação com
//    nome (mudou de fase, anexou a nota, marcou pago...) e, nas edições, o valor
//    de ANTES e o de DEPOIS. Campo que não mudou, ou que é carimbo automático
//    (data de envio, quem pagou), não vira linha.
//  - Ler: eventoDoLog(linha do audit_log) vira a frase da tela. Entende também
//    as linhas antigas (que só tinham o valor novo dos campos).

import { ROTULO_FASE } from './inteligencia';

export const CAMPOS_ANEXO: Record<string, string> = {
  foto_nf: 'Nota Fiscal', foto_nf2: 'Nota Fiscal 2', foto_nf3: 'Nota Fiscal 3', foto_nf4: 'Nota Fiscal 4', foto_nf5: 'Nota Fiscal 5',
  boleto_fornecedor: 'Boleto', recibo_fornecedor: 'Recibo',
};

export const ROTULO_CAMPO: Record<string, string> = {
  valor_despeza: 'Valor', valor_cobrado_cliente: 'Valor cobrado do cliente', fornecedor: 'Fornecedor',
  numero_nota: 'Nº da nota', titulo: 'O que é', tipo: 'Tipo', setor: 'Setor', solicitante: 'Solicitante',
  data: 'Data', obs: 'Observação', hodometro: 'KM / Horas', ordem_servico: 'Ordem de Serviço',
  Chassis_Modelo: 'Chassis / Modelo', cliente: 'Cliente', veiculo: 'Veículo', quem_ferramenta: 'Destinação',
  empresa: 'Empresa', projeto_codigo: 'Projeto', cliente_cnpj: 'CPF/CNPJ do cliente',
  enviado_financeiro_data: 'Envio ao financeiro', status: 'Fase',
};

// Mudam junto com outra ação (ou são da tela) e não contam como edição da pessoa
const IGNORAR = new Set([
  'enviado_financeiro_data', 'mostrar_cotacao_pdf', 'updated_at', 'created_at',
  'pago_em', 'pago_por', 'compra_aprovada_por', 'compra_aprovada_em', 'compra_aprovada_por_id',
  'autorizacao_status', 'autorizacao_motivo', 'autorizacao_para', 'autorizacao_pedida_em',
  'autorizacao_valor', 'autorizacao_por', 'autorizacao_por_id', 'autorizacao_em', 'autorizacao_obs',
]);

const CAMPOS_VALOR = new Set(['valor_despeza', 'valor_cobrado_cliente']);

const vazio = (v: unknown) => v == null || String(v).trim() === '' || String(v).trim() === 'null';
const txt = (v: unknown) => (vazio(v) ? '' : String(v).trim());

export interface RegistroHist { acao: string; detalhes: Record<string, unknown> }
export interface Mudanca { campo: string; rotulo: string; de: string; para: string }

/** O que a alteração `dados` fez, comparando com a requisição `antes`. Vazio = nada a registrar. */
export function registrosDaMudanca(
  antes: Record<string, unknown> | null | undefined,
  dados: Record<string, unknown>,
  extra?: { motivo?: string },
): RegistroHist[] {
  const a = antes || {};
  const out: RegistroHist[] = [];
  const mudou = (c: string) => c in dados && txt(dados[c]) !== txt(a[c]);

  if (mudou('status')) {
    out.push({ acao: 'mover_status', detalhes: { de: txt(a.status) || null, para: txt(dados.status), ...(extra?.motivo ? { motivo: extra.motivo } : {}) } });
  }
  if ('autorizacao_status' in dados && dados.autorizacao_status === 'aguardando' && a.autorizacao_status !== 'aguardando') {
    out.push({ acao: 'pedir_autorizacao', detalhes: { motivo: txt(dados.autorizacao_motivo) || null, para: txt(dados.autorizacao_para) || null } });
  }
  if ('pago' in dados && !!dados.pago !== !!a.pago) {
    out.push({ acao: dados.pago ? 'marcar_pago' : 'desmarcar_pago', detalhes: {} });
  }
  for (const [campo, rotulo] of Object.entries(CAMPOS_ANEXO)) {
    if (!mudou(campo)) continue;
    if (vazio(dados[campo])) out.push({ acao: 'remover_anexo', detalhes: { campo, rotulo } });
    else out.push({ acao: 'anexar', detalhes: { campo, rotulo, trocou: !vazio(a[campo]) } });
  }

  const mudancas: Mudanca[] = [];
  for (const campo of Object.keys(dados)) {
    if (campo === 'status' || campo === 'pago' || campo in CAMPOS_ANEXO || IGNORAR.has(campo)) continue;
    if (!mudou(campo)) continue;
    mudancas.push({ campo, rotulo: ROTULO_CAMPO[campo] || campo, de: txt(a[campo]), para: txt(dados[campo]) });
  }
  if (mudancas.length) out.push({ acao: 'editar', detalhes: { mudancas } });
  return out;
}

// ── leitura ────────────────────────────────────────────────────────────────────

export type TipoEvento = 'criar' | 'editar' | 'fase' | 'lixeira' | 'anexo' | 'pago' | 'pedido' | 'aprovado' | 'recusado' | 'consumido';
export interface EventoHist { tipo: TipoEvento; descricao: string; detalhe?: string }

const fase = (s: unknown) => ROTULO_FASE[String(s || '')] || String(s || '?');
const curto = (s: string, n = 70) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const mostrar = (campo: string, v: string) => {
  if (!v) return '(vazio)';
  if (CAMPOS_VALOR.has(campo)) return `R$ ${v}`;
  if (campo === 'data' && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10).split('-').reverse().join('/');
  return `"${curto(v)}"`;
};

function frasesDasMudancas(ms: Mudanca[]): EventoHist {
  if (ms.length === 1) {
    const m = ms[0];
    return { tipo: 'editar', descricao: `Alterou ${m.rotulo}`, detalhe: m.de ? `de ${mostrar(m.campo, m.de)} para ${mostrar(m.campo, m.para)}` : `colocou ${mostrar(m.campo, m.para)}` };
  }
  return {
    tipo: 'editar',
    descricao: `Alterou ${ms.map((m) => m.rotulo).join(', ')}`,
    detalhe: ms.map((m) => `${m.rotulo}: ${m.de ? `${mostrar(m.campo, m.de)} → ` : ''}${mostrar(m.campo, m.para)}`).join(' · '),
  };
}

/** Linha antiga ("editar" só com os valores novos): tira o que der dela. */
function eventoAntigo(d: Record<string, unknown>): EventoHist {
  if (d.status) {
    if (d.status === 'lixeira') return { tipo: 'lixeira', descricao: 'Moveu para a lixeira' };
    return { tipo: 'fase', descricao: d.status === 'financeiro' ? 'Enviou ao financeiro' : `Mudou a fase para ${fase(d.status)}`, detalhe: typeof d.motivo === 'string' ? d.motivo : undefined };
  }
  const anexo = Object.keys(d).find((k) => k in CAMPOS_ANEXO);
  if (anexo) return vazio(d[anexo]) ? { tipo: 'anexo', descricao: `Removeu o anexo ${CAMPOS_ANEXO[anexo]}` } : { tipo: 'anexo', descricao: `Anexou ${CAMPOS_ANEXO[anexo]}` };
  if (d.autorizacao_status === 'aguardando') return { tipo: 'pedido', descricao: 'Pediu autorização ao Diretor', detalhe: typeof d.autorizacao_motivo === 'string' ? d.autorizacao_motivo : undefined };
  const campos = Object.keys(d).filter((k) => !IGNORAR.has(k));
  if (!campos.length) return { tipo: 'editar', descricao: 'Alterou a requisição' };
  return frasesDasMudancas(campos.map((c) => ({ campo: c, rotulo: ROTULO_CAMPO[c] || c, de: '', para: txt(d[c]) })));
}

/** Linha do audit_log → frase da tela. */
export function eventoDoLog(acao: string, detalhes: unknown): EventoHist {
  const d = (detalhes && typeof detalhes === 'object' ? detalhes : {}) as Record<string, any>;
  switch (acao) {
    case 'criar': return { tipo: 'criar', descricao: 'Criou a requisição' };
    case 'mover_status': {
      if (d.para === 'lixeira') return { tipo: 'lixeira', descricao: 'Moveu para a lixeira' };
      if (d.de === 'lixeira') return { tipo: 'fase', descricao: 'Restaurou da lixeira', detalhe: `voltou para ${fase(d.para)}` };
      const desc = d.para === 'financeiro' ? 'Enviou ao financeiro' : `Mudou a fase para ${fase(d.para)}`;
      const partes = [d.de ? `estava em ${fase(d.de)}` : '', d.motivo || ''].filter(Boolean);
      return { tipo: 'fase', descricao: desc, detalhe: partes.join(' · ') || undefined };
    }
    case 'anexar': return { tipo: 'anexo', descricao: d.trocou ? `Trocou o anexo ${d.rotulo}` : `Anexou ${d.rotulo}` };
    case 'remover_anexo': return { tipo: 'anexo', descricao: `Removeu o anexo ${d.rotulo}` };
    case 'marcar_pago': return { tipo: 'pago', descricao: 'Marcou como PAGO' };
    case 'desmarcar_pago': return { tipo: 'recusado', descricao: 'Desmarcou o PAGO' };
    case 'pedir_autorizacao': return { tipo: 'pedido', descricao: 'Pediu autorização ao Diretor', detalhe: [d.para ? `para ${d.para}` : '', d.motivo || ''].filter(Boolean).join(' · ') || undefined };
    case 'autorizar_requisicao': return { tipo: 'aprovado', descricao: 'AUTORIZOU a requisição', detalhe: [d.valor != null ? `R$ ${String(d.valor).replace('.', ',')}` : '', d.obs || ''].filter(Boolean).join(' · ') || undefined };
    case 'recusar_requisicao': return { tipo: 'recusado', descricao: 'NÃO AUTORIZOU a requisição', detalhe: d.obs || undefined };
    case 'aprovar_compra': return { tipo: 'aprovado', descricao: 'Aprovou a compra' };
    case 'retirar_aprovacao': return { tipo: 'recusado', descricao: 'Retirou a aprovação da compra', detalhe: d.antes ? `era de ${d.antes}` : undefined };
    case 'cotacao_indicada':
    case 'cotacao_comprada': {
      const oque = acao === 'cotacao_indicada' ? 'indicada' : 'comprada';
      return { tipo: 'editar', descricao: d.numero ? `Marcou a cotação ${oque}` : `Desmarcou a cotação ${oque}`, detalhe: d.numero ? `${d.numero}${d.fornecedor ? ' · ' + d.fornecedor : ''}` : undefined };
    }
    case 'vincular_nota': return { tipo: 'anexo', descricao: `Ligou a nota fiscal${d.numero ? ` nº ${d.numero}` : ''} do Omie`, detalhe: d.valor_nota != null ? `valor da nota R$ ${String(d.valor_nota).replace('.', ',')}` : undefined };
    case 'deletar': return { tipo: 'lixeira', descricao: 'Moveu para a lixeira' };
    case 'editar':
      if (Array.isArray(d.mudancas) && d.mudancas.length) return frasesDasMudancas(d.mudancas as Mudanca[]);
      return eventoAntigo(d);
    default: return { tipo: 'editar', descricao: acao.replace(/_/g, ' ') };
  }
}
