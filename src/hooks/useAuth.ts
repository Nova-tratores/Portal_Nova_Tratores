'use client'
// Sessão do portal — store único no módulo, não estado por componente.
//
// Antes: cada um dos ~30 componentes que chamam useAuth() rodava o seu próprio
// getSession() + query em financeiro_usu. Pior: o erro da query era ignorado, então
// um JWT expirado (a RLS de financeiro_usu só deixa `authenticated` ler) devolvia
// perfil nulo com loading=false — e o portal renderizava inteiro com o utilizador
// genérico "Usuário / Colaborador", sem ser o login de ninguém.
//
// Agora o estado vive aqui, é carregado uma vez por page load e distingue os casos:
//   - sem sessão nenhuma        → manda pro /login (guardando a página atual)
//   - sessão que o servidor não aceita → sessaoExpirada = true (o PortalLayout tranca a tela)
//   - utilizador inativado      → /login?inativo=1 (comportamento antigo, mantido)
import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export interface UserProfile {
  id: string
  nome: string
  funcao: string
  avatar_url: string
  tema?: string
  som_notificacao?: string
  ativo?: boolean
}

// Por que o portal está trancado — cada motivo tem uma explicação diferente para dar
// a quem está do outro lado do ecrã:
//   'expirada'   → a sessão não presta (JWT morto, token revogado, logout noutra aba)
//   'sem-perfil' → o login é válido mas a conta não tem linha em financeiro_usu
//                  (conta removida por apagar a linha, ou nunca configurada)
//   'erro'       → falha de rede/BD a carregar o perfil
export type MotivoBloqueio = 'expirada' | 'sem-perfil' | 'erro'

interface Estado {
  userProfile: UserProfile | null
  loading: boolean
  bloqueio: MotivoBloqueio | null
}

const ESTADO_INICIAL: Estado = { userProfile: null, loading: true, bloqueio: null }

let estado: Estado = ESTADO_INICIAL
const listeners = new Set<() => void>()

function emitir(patch: Partial<Estado>) {
  estado = { ...estado, ...patch }
  listeners.forEach((l) => l())
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => { listeners.delete(l) }
}

const getSnapshot = () => estado
// No SSR o módulo é partilhado entre pedidos, mas nada escreve no store fora de
// effects/callbacks — o servidor vê sempre o estado inicial.
const getServerSnapshot = () => ESTADO_INICIAL

function pathAtual(): string {
  if (typeof window === 'undefined') return ''
  return window.location.pathname + window.location.search
}

function irParaLogin(qs = '') {
  window.location.replace(`/login?redirect_to=${encodeURIComponent(pathAtual())}${qs}`)
}

// Erros do PostgREST que significam "o teu token não presta" — e não "não há linha".
function ehErroDeAuth(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  if (error.code === 'PGRST301') return true
  return /jwt|token|expired/i.test(error.message || '')
}

// Falha de REDE (wifi voltando, PC acordando) não é sessão expirada: o supabase-js
// devolve AuthRetryableFetchError como { error } em vez de lançar. (07/10/2026: a
// tela de "sessão expirada" ao voltar pra aba apagava o que estava digitado.)
function ehFalhaDeRede(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  const e = error as { name?: string; status?: number; message?: string } | null
  if (!e) return false
  return e.name === 'AuthRetryableFetchError' || e.status === 0 || /fetch|network|timeout|load failed/i.test(e.message || '')
}

async function carregarPerfil(): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      emitir({ userProfile: null, loading: false })
      irParaLogin()
      return
    }

    // getSession() só lê o localStorage e não valida nada: devolve sessão mesmo com
    // o JWT expirado ou o refresh token revogado. getUser() bate no servidor — é este
    // passo que fecha o buraco do "utilizador fantasma".
    const { data: userData, error: erroUser } = await supabase.auth.getUser()
    if (erroUser || !userData?.user) {
      // rede caiu e já havia perfil carregado → mantém a tela como está
      if (erroUser && ehFalhaDeRede(erroUser)) {
        if (estado.userProfile) { emitir({ loading: false }); return }
        emitir({ userProfile: null, loading: false, bloqueio: 'erro' })
        return
      }
      emitir({ userProfile: null, loading: false, bloqueio: 'expirada' })
      return
    }

    const { data: prof, error } = await supabase
      .from('financeiro_usu')
      .select('*')
      .eq('id', userData.user.id)
      .maybeSingle()

    if (error && estado.userProfile && !ehErroDeAuth(error)) { emitir({ loading: false }); return } // oscilação: mantém o perfil
    if (error) {
      // Rede/BD a falhar não é sessão morta, mas também não autoriza inventar perfil.
      emitir({ userProfile: null, loading: false, bloqueio: ehErroDeAuth(error) ? 'expirada' : 'erro' })
      return
    }
    // Login válido sem linha em financeiro_usu: acontece com contas removidas por
    // apagar a linha (em vez de ativo=false) e com contas nunca configuradas. Não
    // redirecionar — login → portal → sem perfil → login… daria bounce infinito.
    if (!prof) {
      emitir({ userProfile: null, loading: false, bloqueio: 'sem-perfil' })
      return
    }
    if (prof.ativo === false) {
      await supabase.auth.signOut()
      emitir({ userProfile: null, loading: false })
      window.location.replace('/login?inativo=1')
      return
    }
    emitir({ userProfile: prof as UserProfile, loading: false, bloqueio: null })
  } catch {
    if (estado.userProfile) { emitir({ loading: false }); return } // oscilação de rede: mantém
    emitir({ userProfile: null, loading: false, bloqueio: 'erro' })
  }
}

let carregamento: Promise<void> | null = null
let subscritoAuth = false

function garantirSubscricaoAuth() {
  if (subscritoAuth || typeof window === 'undefined') return
  subscritoAuth = true
  supabase.auth.onAuthStateChange((evento, session) => {
    // O carregamento inicial é feito por carregarPerfil(); ignorar evita query dupla.
    if (evento === 'INITIAL_SESSION') return
    if (evento === 'SIGNED_OUT' || !session) {
      // Inclui a falha de refresh do token (o supabase-js emite sessão nula) e o
      // logout feito noutra aba.
      emitir({ userProfile: null, loading: false, bloqueio: 'expirada' })
      return
    }
    // O supabase-js emite SIGNED_IN a CADA volta pra aba. Mesmo usuário já carregado
    // → não recarrega o perfil (senão toda a página re-renderiza e formulários sofrem).
    if (estado.userProfile && estado.userProfile.id === session.user.id && !estado.bloqueio) return
    emitir({ bloqueio: null })
    carregamento = carregarPerfil()
  })
}

/** Confirma no servidor que a sessão continua válida; marca expirada se não estiver. */
export async function revalidarSessao(): Promise<void> {
  if (estado.bloqueio) return
  try {
    const { data, error } = await supabase.auth.getUser()
    if (error && ehFalhaDeRede(error)) return // sem rede não dá pra saber: não derruba
    if (error || !data?.user) emitir({ userProfile: null, loading: false, bloqueio: 'expirada' })
  } catch {
    // Offline: não derruba a sessão por causa de uma falha de rede.
  }
}

export function useAuth() {
  const router = useRouter()
  const { userProfile, loading, bloqueio } = useSyncExternalStore(
    subscribe, getSnapshot, getServerSnapshot,
  )

  useEffect(() => {
    garantirSubscricaoAuth()
    if (!carregamento) carregamento = carregarPerfil()
  }, [])

  const setUserProfile = useCallback(
    (v: UserProfile | null | ((p: UserProfile | null) => UserProfile | null)) => {
      emitir({ userProfile: typeof v === 'function' ? v(estado.userProfile) : v })
    },
    [],
  )

  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut()
    emitir({ userProfile: null, loading: false, bloqueio: null })
    router.push('/login')
  }, [router])

  return { userProfile, setUserProfile, loading, handleLogout, router, bloqueio }
}
