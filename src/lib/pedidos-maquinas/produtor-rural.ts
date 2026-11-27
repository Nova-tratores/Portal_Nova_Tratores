// "É produtor rural?" do cliente do Pedido de Máquinas — lido e gravado no
// cadastro do cliente NA OMIE (campo `produtor_rural` S/N; quando nunca foi
// marcado a Omie nem devolve o campo = N). Muda as regras de imposto da nota.
// O AlterarCliente REVALIDA os obrigatórios: reenviamos o cadastro atual junto
// (mesmo jeito de /api/feedbacks/cliente-omie).
import { buscarNcodCli, getAccount, omieNaConta } from '@/lib/ppv/omie';
import { ErroPedido, lerPedido } from './server';

interface ClienteOmie { codigo_cliente_omie?: number; razao_social?: string; produtor_rural?: string; [k: string]: unknown }

const ECO = [
  'razao_social', 'nome_fantasia', 'cnpj_cpf', 'pessoa_fisica', 'email',
  'telefone1_ddd', 'telefone1_numero',
  'endereco', 'endereco_numero', 'complemento', 'bairro', 'cidade', 'estado', 'cep',
] as const;

async function clienteDoPedido(id: number | string) {
  const p = await lerPedido(id);
  const acc = getAccount(p.empresa || 'Nova Tratores');
  let cod = Number(p.cliente_cod_omie) || 0;
  if (!cod) {
    if (!p.cliente_documento) throw new ErroPedido(400, 'Escolha o cliente (com CPF/CNPJ) antes.');
    cod = await buscarNcodCli(String(p.cliente_documento), acc).catch(() => 0);
  }
  if (!cod) throw new ErroPedido(404, `Cliente não achado na Omie (${acc.name}) pelo CPF/CNPJ.`);
  return { pedido: p, acc, cod };
}

async function consultar(acc: ReturnType<typeof getAccount>, cod: number): Promise<ClienteOmie> {
  return omieNaConta<ClienteOmie>(acc, '/geral/clientes/', 'ConsultarCliente', { codigo_cliente_omie: cod });
}

export async function lerProdutorRural(id: number | string) {
  const { acc, cod } = await clienteDoPedido(id);
  const c = await consultar(acc, cod);
  return { produtorRural: c.produtor_rural === 'S', codigoCliente: cod, cliente: c.razao_social || '', empresa: acc.name };
}

export async function gravarProdutorRural(id: number | string, valor: boolean) {
  const { pedido, acc, cod } = await clienteDoPedido(id);
  const atual = await consultar(acc, cod);
  const antes = atual.produtor_rural === 'S';
  if (antes === valor) return { pedidoId: pedido.id, produtorRural: valor, antes, codigoCliente: cod, mudou: false, empresa: acc.name };

  const param: Record<string, unknown> = { codigo_cliente_omie: cod, produtor_rural: valor ? 'S' : 'N' };
  for (const k of ECO) {
    const v = atual[k];
    if (typeof v === 'string' && v !== '') param[k] = v;
  }
  await omieNaConta(acc, '/geral/clientes/', 'AlterarCliente', param);

  const depois = await consultar(acc, cod);
  const gravado = depois.produtor_rural === 'S';
  if (gravado !== valor) throw new ErroPedido(502, 'A Omie aceitou, mas o cadastro não mudou. Confira o cliente na Omie.');
  return { pedidoId: pedido.id, produtorRural: gravado, antes, codigoCliente: cod, mudou: true, empresa: acc.name };
}
