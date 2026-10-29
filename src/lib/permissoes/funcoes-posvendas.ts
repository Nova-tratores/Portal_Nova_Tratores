// Funções dentro do setor Pós-Vendas (José, 29/10/2026: "garantista, gerente, auxiliar").
// Ficam em portal_permissoes.modulos_permitidos com prefixo próprio, uma por pessoa, escolhidas na
// Administração → usuário → aba "Pós-Vendas". Usadas pela comissão do escritório (Gestão Pós Vendas).
export const FUNCAO_GERENTE = 'posvendas-funcao:gerente'
export const FUNCAO_GARANTISTA = 'posvendas-funcao:garantista'
export const FUNCAO_AUXILIAR = 'posvendas-funcao:auxiliar'
export const FUNCOES_POSVENDAS = [
  { chave: FUNCAO_GERENTE, rot: 'Gerente do Pós-Vendas', txt: 'muda a % das revisões na comissão do escritório' },
  { chave: FUNCAO_GARANTISTA, rot: 'Garantista', txt: 'comissão: 1% das garantias + % das revisões faturadas no mês' },
  { chave: FUNCAO_AUXILIAR, rot: 'Auxiliar', txt: 'auxiliar do pós-vendas' },
] as const
export const funcaoPosVendas = (modulos: string[]) => FUNCOES_POSVENDAS.find((f) => modulos.includes(f.chave))?.chave || null
export const trocarFuncaoPosVendas = (modulos: string[], chave: string | null) => [...modulos.filter((m) => !m.startsWith('posvendas-funcao:')), ...(chave ? [chave] : [])]
