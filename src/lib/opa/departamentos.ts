// Opa: o departamento é OCULTO e vem do território (decisão do José, 05/11/2026).
// Quem abre o Opa escolhe só o local (pni_locais); o local aponta para um departamento
// (opa_local_departamento) e o gestor desse departamento vira o Responsável e é o
// ÚNICO avisado. Local sem departamento cai no departamento padrão ("Geral").
// Regras PURAS (sem banco) — a casca está em src/app/api/opa/notificar e /departamentos.

export interface Departamento {
  id: string
  nome: string
  gestor_id: string | null
  gestor_nome: string | null
  padrao: boolean
  ativo: boolean
  ordem: number
}

export interface LigacaoLocal { local_id: string; departamento_id: string }

export interface Destino {
  departamento: Departamento | null
  /** por que caiu aqui — vai para o log e para a tela de configuração */
  motivo: 'local' | 'padrao' | 'sem_configuracao'
  /** o gestor que recebe (null = ninguém configurado → aviso geral, como antes) */
  gestorId: string | null
  gestorNome: string | null
}

/** Departamento e gestor de um local. Departamento do local sem gestor (ou inativo) cai no padrão. */
export function destinoDoLocal(localId: string | null | undefined, ligacoes: LigacaoLocal[], departamentos: Departamento[]): Destino {
  const ativos = departamentos.filter((d) => d.ativo)
  const padrao = ativos.find((d) => d.padrao) || null
  const lig = localId ? ligacoes.find((l) => l.local_id === localId) : undefined
  const doLocal = lig ? ativos.find((d) => d.id === lig.departamento_id) || null : null

  if (doLocal && doLocal.gestor_id) return { departamento: doLocal, motivo: 'local', gestorId: doLocal.gestor_id, gestorNome: doLocal.gestor_nome }
  if (padrao && padrao.gestor_id) {
    // departamento do local existe mas está sem gestor: o Opa fica nele, o aviso vai para o gestor geral
    return { departamento: doLocal || padrao, motivo: 'padrao', gestorId: padrao.gestor_id, gestorNome: padrao.gestor_nome }
  }
  return { departamento: doLocal || padrao, motivo: 'sem_configuracao', gestorId: null, gestorNome: null }
}

/**
 * Responsável depois de rotear: o gestor entra quando o Opa está sem responsável ou quando o
 * responsável era o gestor do departamento anterior (troca de território). Responsável que
 * alguém escolheu à mão não é apagado.
 */
export function novoResponsavel(atual: string | null | undefined, gestorAnterior: string | null | undefined, gestorNovo: string | null): string | null {
  const a = (atual || '').trim()
  if (!gestorNovo) return a || null
  if (!a) return gestorNovo
  if (gestorAnterior && a.toLowerCase() === gestorAnterior.trim().toLowerCase()) return gestorNovo
  return a
}

/** valida o nome de um departamento (mesmas regras do CHECK do banco) */
export function validarNomeDepartamento(nome: unknown): string | null {
  const n = String(nome ?? '').replace(/\s+/g, ' ').trim()
  if (!n) return 'Escreva o nome do departamento.'
  if (n.length > 60) return 'Nome com mais de 60 caracteres.'
  return null
}
