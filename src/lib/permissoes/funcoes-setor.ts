// Função da pessoa dentro do setor (Categoria do Admin). José, 10/11/2026: "isso só aparece
// para quem é do pós-vendas. Em peças: Pecista, Gerente de Peças ou Auxiliar de Peças; em
// comercial: Vendedor, Diretor, Administrativo ou Auxiliar Comercial".
// Fica em portal_permissoes.modulos_permitidos com prefixo próprio por setor, uma por pessoa
// (o Pós-Vendas já era assim desde 29/10 e a comissão do escritório lê essas chaves).
// "Diretor" aqui é só a função no Comercial — quem autoriza comissão e ficha continua sendo
// o is_diretor (nível na Administração).
import { FUNCOES_POSVENDAS } from './funcoes-posvendas'

export interface FuncaoSetor { chave: string; rot: string; txt: string }
export interface SetorComFuncao { categoria: string; nome: string; prefixo: string; funcoes: readonly FuncaoSetor[] }

export const SETORES_COM_FUNCAO: SetorComFuncao[] = [
  { categoria: 'Pós Vendas', nome: 'Pós-Vendas', prefixo: 'posvendas-funcao:', funcoes: FUNCOES_POSVENDAS },
  {
    categoria: 'Peças', nome: 'Peças', prefixo: 'pecas-funcao:', funcoes: [
      { chave: 'pecas-funcao:pecista', rot: 'Pecista', txt: 'atende balcão, separa e confere peças' },
      { chave: 'pecas-funcao:gerente', rot: 'Gerente de Peças', txt: 'responde pelo setor de peças' },
      { chave: 'pecas-funcao:auxiliar', rot: 'Auxiliar de Peças', txt: 'apoio ao setor de peças' },
    ],
  },
  {
    categoria: 'Comercial', nome: 'Comercial', prefixo: 'comercial-funcao:', funcoes: [
      { chave: 'comercial-funcao:vendedor', rot: 'Vendedor', txt: 'vende máquinas e implementos' },
      { chave: 'comercial-funcao:diretor', rot: 'Diretor', txt: 'diretor do comercial' },
      { chave: 'comercial-funcao:administrativo', rot: 'Administrativo', txt: 'administrativo do comercial' },
      { chave: 'comercial-funcao:auxiliar', rot: 'Auxiliar Comercial', txt: 'apoio ao comercial' },
    ],
  },
]

export const setorComFuncao = (categoria?: string | null) => SETORES_COM_FUNCAO.find((s) => s.categoria === categoria) || null
const PREFIXOS = SETORES_COM_FUNCAO.map((s) => s.prefixo)
const ehChaveFuncao = (m: string) => PREFIXOS.some((p) => m.startsWith(p))

/** a função marcada no setor (ou null) */
export function funcaoNoSetor(modulos: string[], categoria?: string | null): FuncaoSetor | null {
  const s = setorComFuncao(categoria)
  return s?.funcoes.find((f) => modulos.includes(f.chave)) || null
}
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '')

/**
 * Texto embaixo do nome (cartão do usuário no topo). José, 16/11/2026: "se a pessoa tiver um cargo dentro do
 * setor aparece o setor e o cargo; se tiver mais de um, como o Dougras (diretor, vendedor e comercial),
 * coloca Diretor Comercial". Diretor (nível ou função) ganha de tudo → "Diretor <Setor>"; função do setor →
 * "<função> · <setor>" (sem repetir quando a função já leva o setor, ex. "Gerente de Peças"); sem função = setor.
 */
export function cargoExibicao(p: { setor?: string | null; modulos?: string[] | null; isDiretor?: boolean }): string {
  const setor = String(p.setor || '').trim()
  const modulos = p.modulos || []
  const marcadas = SETORES_COM_FUNCAO.flatMap((s) => s.funcoes.filter((f) => modulos.includes(f.chave)).map((f) => ({ ...f, setor: s })))
  const nomeSetor = setor || marcadas[0]?.setor.nome || ''
  if (p.isDiretor || marcadas.some((f) => f.chave.endsWith(':diretor'))) return nomeSetor ? `Diretor ${nomeSetor}` : 'Diretor'
  // da mesma categoria primeiro; gerente antes das outras
  const f = marcadas.sort((a, b) => Number(b.setor.categoria === setor) - Number(a.setor.categoria === setor)
    || Number(b.chave.endsWith(':gerente')) - Number(a.chave.endsWith(':gerente')))[0]
  if (!f) return setor
  const s = f.setor.nome
  return semAcento(f.rot).includes(semAcento(s)) || !s ? f.rot : `${f.rot} · ${s}`
}

/** troca a função do setor (null = sem função) */
export function trocarFuncaoSetor(modulos: string[], categoria: string, chave: string | null): string[] {
  const s = setorComFuncao(categoria)
  if (!s) return modulos
  return [...modulos.filter((m) => !m.startsWith(s.prefixo)), ...(chave ? [chave] : [])]
}
/** ao trocar a Categoria, some a função de outro setor (ela não vale mais) */
export function limparFuncoesDeOutrosSetores(modulos: string[], categoria?: string | null): string[] {
  const s = setorComFuncao(categoria)
  return modulos.filter((m) => !ehChaveFuncao(m) || (!!s && m.startsWith(s.prefixo)))
}
