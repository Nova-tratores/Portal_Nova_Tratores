// Demonstração que vira venda NA CASA DO CLIENTE (27/11/2026) — regras puras (sem banco, sem Omie).
//
// Sequência (cada passo grava a etapa em remessas_vendas_cliente; "Continuar" retoma dali):
//   iniciada      → cria na Omie a nota de entrada de volta SIMBÓLICA 1.913/2.913 (chave da remessa)
//   volta_criada  → emite a NF-e da volta (a máquina volta ao estoque no papel)
//   volta_emitida → cria o Pedido de Máquinas (PVM) a partir da PROPOSTA, com a máquina da remessa
//   pedido_criado → remessa "virou venda" com o nº do PVM + pula as etapas de retorno do roteiro da OS
//   concluida
// Decisões do usuário: sempre a partir de uma proposta; quem dispara precisa de remessas:emitir
// E pedidos-maquinas:faturar. Enviar/faturar o PVM continua no próprio pedido.
import { numeroBR } from '@/lib/propostas/pagamento';

export type EtapaVenda = 'iniciada' | 'volta_criada' | 'volta_emitida' | 'pedido_criado' | 'concluida' | 'cancelada';

export const ETAPAS_VENDA: Record<EtapaVenda, { ordem: number; rotulo: string }> = {
  iniciada: { ordem: 0, rotulo: 'Começou — falta criar a nota de volta' },
  volta_criada: { ordem: 1, rotulo: 'Nota de volta criada — falta emitir a NF-e' },
  volta_emitida: { ordem: 2, rotulo: 'Volta emitida — falta criar o pedido de máquina' },
  pedido_criado: { ordem: 3, rotulo: 'Pedido criado — falta marcar a remessa e o roteiro' },
  concluida: { ordem: 4, rotulo: 'Concluída' },
  cancelada: { ordem: 5, rotulo: 'Cancelada' },
};

export const MOTIVO_PULO_VENDA = 'Vendida no cliente (a máquina não volta para a loja)';
export const PERMISSOES_VENDA = ['remessas:emitir', 'pedidos-maquinas:faturar'] as const;

export const digitos = (s: unknown) => String(s ?? '').replace(/\D/g, '');

/** Quem pode disparar: admin, ou as DUAS ações (a venda emite a volta e leva ao faturamento). */
export function podeVenderNoCliente(u: { isAdmin?: boolean; modulos?: string[] }): boolean {
  if (u.isAdmin) return true;
  const m = new Set(u.modulos || []);
  return PERMISSOES_VENDA.every((k) => m.has(k));
}

/** A remessa aceita começar a venda no cliente? Lista do que impede (vazia = pode). */
export function bloqueiosRemessa(r: {
  tipo: string; situacaoAberta: boolean; nfChave: string | null | undefined; temVoltaViva: boolean;
}): string[] {
  const out: string[] = [];
  if (r.tipo !== 'demonstracao') out.push('Só remessa de demonstração (5.912/6.912) vira venda por aqui.');
  else {
    if (!r.situacaoAberta) out.push('Esta demonstração já foi encerrada (devolvida, renovada ou vendida).');
    if (!r.nfChave) out.push('A remessa ainda não tem NF-e emitida.');
    if (r.temVoltaViva) out.push('Já existe uma nota de volta criada pelo portal para esta remessa — emita/confira a volta normal pela ficha.');
  }
  return out;
}

export interface PropostaVenda {
  id: number; documento: string; cliente: string; deletada: boolean; pedidos: string[]; valor: number; status: string | null;
}

/** A proposta escolhida serve? Cliente igual ao da remessa (CPF/CNPJ), fora da lixeira e sem outro PVM. */
export function bloqueiosProposta(p: PropostaVenda | null, docRemessa: string): string[] {
  if (!p) return ['Escolha a proposta da venda.'];
  const out: string[] = [];
  if (p.deletada) out.push(`A proposta #${p.id} está na lixeira.`);
  const dr = digitos(docRemessa);
  const dp = digitos(p.documento);
  if (!dp) out.push(`A proposta #${p.id} não tem CPF/CNPJ do cliente.`);
  else if (dr && dp !== dr) out.push(`A proposta #${p.id} é de outro cliente (CPF/CNPJ diferente do da remessa).`);
  if (p.pedidos.length) out.push(`A proposta #${p.id} já está no pedido ${p.pedidos.join(', ')}.`);
  if (!(p.valor > 0)) out.push(`A proposta #${p.id} não tem valor.`);
  return out;
}

export function avisosProposta(p: PropostaVenda | null): string[] {
  if (!p) return [];
  return p.status && p.status !== 'Concluida-Vendido' ? [`A proposta está "${p.status}" — ainda não marcada como vendida.`] : [];
}

/** Máquina é cadastrada pelo chassi/nº de série: o código do produto É o chassi quando é uma palavra
 *  só com algum dígito, 4+ caracteres (ex.: MDI07513V50005756, 01007250138, 20478). */
export function chassiDoCodigo(codigo: string | null | undefined): string | null {
  const s = String(codigo || '').trim().toUpperCase();
  if (s.length < 4 || !/\d/.test(s) || /\s/.test(s)) return null;
  return s.slice(0, 40);
}

export interface ItemRemessaVenda { nCodProd: number; qtd: number; valorUnit: number; descricao?: string | null }
export interface ProdutoCadastro { codigo: string; codigo_produto: number; descricao: string; familia_nome?: string | null; marca?: string | null; modelo?: string | null }
export interface ItemPedidoVenda {
  codigo: string; codigo_produto: number; descricao: string; familia: string | null; marca: string | null; modelo: string | null;
  chassi: string | null; qtde: number; preco: number; desconto: number;
}

/**
 * Itens do pedido de máquina a partir da remessa. Preço: uma máquina só → o valor da PROPOSTA;
 * várias → cada uma pelo valor da remessa, e a diferença para a proposta fica como aviso.
 */
export function itensDoPedido(itens: ItemRemessaVenda[], produtos: ProdutoCadastro[], valorProposta: number): { itens: ItemPedidoVenda[]; avisos: string[] } {
  const avisos: string[] = [];
  const porId = new Map(produtos.map((p) => [Number(p.codigo_produto), p]));
  const out: ItemPedidoVenda[] = [];
  for (const it of itens) {
    const p = porId.get(Number(it.nCodProd));
    if (!p) { avisos.push(`Produto ${it.descricao || it.nCodProd} não está no cadastro do portal — inclua a máquina à mão no pedido.`); continue; }
    out.push({
      codigo: p.codigo, codigo_produto: Number(p.codigo_produto), descricao: p.descricao || it.descricao || p.codigo,
      familia: p.familia_nome || null, marca: p.marca || null, modelo: p.modelo || null,
      chassi: chassiDoCodigo(p.codigo), qtde: it.qtd > 0 ? it.qtd : 1, preco: Number(it.valorUnit) || 0, desconto: 0,
    });
  }
  if (out.length === 1 && valorProposta > 0) {
    const naRemessa = out[0].qtde * out[0].preco;
    if (naRemessa > 0 && Math.abs(valorProposta - naRemessa) / naRemessa > 0.2) {
      avisos.push(`A proposta vale ${brl(valorProposta)} e a máquina saiu na remessa por ${brl(naRemessa)} — confira se é a proposta certa.`);
    }
    out[0].preco = Math.round((valorProposta / out[0].qtde) * 100) / 100;
  }
  else if (out.length > 1 && valorProposta > 0) {
    const soma = Math.round(out.reduce((s, i) => s + i.qtde * i.preco, 0) * 100) / 100;
    if (Math.abs(soma - valorProposta) > 0.009) avisos.push(`A remessa tem ${out.length} máquinas: os preços vieram da remessa (soma ${brl(soma)}) e a proposta vale ${brl(valorProposta)}. Ajuste no pedido.`);
  }
  if (out.some((i) => !i.chassi)) avisos.push('Máquina sem chassi reconhecido no código — confira o chassi no pedido.');
  return { itens: out, avisos };
}

/** Etapas do roteiro da OS que deixam de fazer sentido: as não começadas e a de retorno em andamento. */
const RETORNO = /retir|volta|retorno|cheg|recebimento/i;
export function etapasParaPular<E extends { status: string; nome: string; ordem: number }>(etapas: E[]): E[] {
  const ord = [...etapas].sort((a, b) => a.ordem - b.ordem);
  const algumaFeita = ord.some((e) => e.status === 'concluida' || e.status === 'pulada');
  return ord.filter((e) => e.status === 'pendente' || (e.status === 'liberada' && algumaFeita && RETORNO.test(e.nome)));
}

/** Observação da nota de volta simbólica. */
export function obsVoltaVenda(propostaId: number): string {
  return `Retorno simbólico: máquina vendida ao cliente na demonstração (proposta #${propostaId}), sem voltar à loja.`;
}

export function propostaDaLinha(row: Record<string, unknown>, pedidos: string[]): PropostaVenda {
  return {
    id: Number(row.id), documento: digitos(row['Cpf/Cpnj']), cliente: String(row.Cliente || '').trim(),
    deletada: !!row.deleted_at, pedidos, valor: numeroBR(row.Valor_Total), status: (row.status as string) || null,
  };
}

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
