'use client'
// "Tem coisa digitada e NÃO salva?" — registro global do navegador.
//
// Os formulários avisam aqui (useAlteracoesPendentes / useRascunho). Quem lê:
//  - AutoAtualiza: não recarrega o portal depois de um deploy enquanto houver
//    pendência (nem se a pessoa digitou algo nos últimos minutos);
//  - ProtecaoAlteracoes: pergunta "sair sem salvar?" ao fechar/recarregar/trocar
//    de tela por link comum (beforeunload).
import { useEffect } from 'react'

const pendentes = new Set<string>()
let ultimaDigitacao = 0

export function marcarPendente(chave: string, pendente: boolean) {
  if (pendente) pendentes.add(chave)
  else pendentes.delete(chave)
}

export function temPendencias(): boolean {
  return pendentes.size > 0
}

export function registrarDigitacao() {
  ultimaDigitacao = Date.now()
}

/** A pessoa digitou em algum campo nos últimos `ms` milissegundos? */
export function digitouHaPouco(ms: number): boolean {
  return Date.now() - ultimaDigitacao < ms
}

/** Formulário diz se tem alteração não salva; some sozinho ao desmontar. */
export function useAlteracoesPendentes(chave: string, pendente: boolean) {
  useEffect(() => {
    marcarPendente(chave, pendente)
  }, [chave, pendente])
  useEffect(() => () => marcarPendente(chave, false), [chave])
}
