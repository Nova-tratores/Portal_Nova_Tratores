// O que a requisição precisa ter para ir à autorização do Diretor (José, 17/11/2026: "para pedir autorização já tem
// que saber o que quer, onde quer, valor, para quem … se for para um cliente, a OS, o projeto e o nome do cliente,
// estar vinculado tudo certinho deve ser obrigatório"). Mesma regra no gatilho do banco (sql/autorizacoes-requisitos.sql);
// aqui é para avisar no formulário antes de salvar.

export const LIMITE_AUTORIZACAO = 200;
const vazio = (v: unknown) => !String(v ?? '').trim();
const digitos = (v: unknown) => String(v ?? '').replace(/\D/g, '');

export type ReqParaAutorizar = {
  titulo?: unknown; fornecedor?: unknown; solicitante?: unknown; setor?: unknown;
  ordem_servico?: unknown; cliente?: unknown; cliente_cnpj?: unknown; projeto_codigo?: unknown; Chassis_Modelo?: unknown;
};

/** o que falta (lista em português). `cnpjDaOS` = CNPJ do cliente da OS escolhida, quando se sabe. */
export function faltaParaAutorizar(r: ReqParaAutorizar, cnpjDaOS?: string | null): string[] {
  const f: string[] = [];
  if (vazio(r.titulo)) f.push('o que é (título)');
  if (vazio(r.fornecedor)) f.push('onde comprar (fornecedor)');
  if (vazio(r.solicitante)) f.push('quem pede');
  if (vazio(r.setor)) f.push('para quem (setor destino)');
  if (String(r.setor || '') === 'Trator-Cliente') {
    if (vazio(r.ordem_servico)) f.push('a OS');
    if (vazio(r.cliente) || !digitos(r.cliente_cnpj)) f.push('o cliente escolhido do cadastro (com CPF/CNPJ)');
    if (vazio(r.projeto_codigo) && vazio(r.Chassis_Modelo)) f.push('o projeto / trator');
    if (cnpjDaOS && digitos(r.cliente_cnpj) && digitos(cnpjDaOS) !== digitos(r.cliente_cnpj)) f.push('a OS é de outro cliente — confira a OS e o cliente');
  }
  return f;
}
