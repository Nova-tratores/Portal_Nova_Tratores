'use client'
// Proteção do que está digitado (montado uma vez no layout do portal):
//  - anota a hora da última digitação (o AutoAtualiza usa para não recarregar);
//  - se há formulário com alteração não salva, o navegador pergunta antes de
//    fechar, recarregar ou sair por um link comum (as guias do módulo Peças).
import { useEffect } from 'react'
import { registrarDigitacao, temPendencias } from '@/lib/rascunho/pendencias'

export default function ProtecaoAlteracoes() {
  useEffect(() => {
    const aoDigitar = (e: Event) => {
      const el = e.target as HTMLElement | null
      if (!el) return
      const tag = el.tagName
      if (tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable) { registrarDigitacao(); return }
      if (tag === 'INPUT') {
        const tipo = (el as HTMLInputElement).type
        // campo de busca não é trabalho a perder
        if (tipo !== 'search' && !/busca|pesquis|search|filtr/i.test((el as HTMLInputElement).placeholder || '')) registrarDigitacao()
      }
    }
    const antesDeSair = (e: BeforeUnloadEvent) => {
      if (!temPendencias()) return
      e.preventDefault()
      e.returnValue = '' // Chrome exige para mostrar a pergunta
    }
    document.addEventListener('input', aoDigitar, true)
    window.addEventListener('beforeunload', antesDeSair)
    return () => {
      document.removeEventListener('input', aoDigitar, true)
      window.removeEventListener('beforeunload', antesDeSair)
    }
  }, [])
  return null
}
