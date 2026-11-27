// CARGO, SETOR E LIDERANÇA de cada usuário do portal, vindos do ORGANOGRAMA (José, 27/11/2026).
// Decisões do José:
//   · O setor vem do organograma (departamento do RH; sem RH, a função do portal). A Administração
//     só MOSTRA — um lugar só, sem os dois "setores" discordando.
//   · Líder = PELO CARGO: Gerente, Líder, Supervisor, Coordenador, Diretor, Encarregado, Chefe.
//     O cargo é o do RH, ou o que o admin corrigiu no organograma (org_pessoas.cargo), que vale mais.
// Servidor (service role). Lê só o necessário (portal + RH + org_pessoas) e guarda 5 min na memória:
// o RH é uma chamada externa e isto vai ser consultado em telas protegidas.
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { listarFuncionariosRH } from '@/lib/frota/rh'
import { juntarPessoas, type UsuarioPortal } from './arvore'
import { SETORES_COM_FUNCAO, funcaoNoSetor } from '@/lib/permissoes/funcoes-setor'

/** Nome do setor como aparece no RH e no organograma (categoria da Administração → nome bonito). */
export const NOME_SETOR: Record<string, string> = {
  'Pós Vendas': 'Pós-Vendas', 'Peças': 'Peças', 'Comercial': 'Comercial', 'Financeiro': 'Financeiro', 'T.I.': 'T.I.',
}
export const nomeDoSetor = (categoria: string | null | undefined) => (categoria ? NOME_SETOR[categoria] || categoria : null)

/** Cargo: a função marcada no setor (ex. "Gerente de Peças"); sem lista de funções, o cargo livre. */
export function cargoDe(categoria: string | null | undefined, modulos: string[], cargoLivre: string | null): string | null {
  const temLista = SETORES_COM_FUNCAO.some((s) => s.categoria === categoria)
  if (temLista) return funcaoNoSetor(modulos, categoria)?.rot || cargoLivre || null
  return cargoLivre || null
}

export interface PapelOrg {
  /** Ex.: "Gerente". null = sem cargo no RH nem no organograma. */
  cargo: string | null
  /** Ex.: "Pós-vendas". */
  setor: string | null
  /** true quando o cargo é de liderança (regra LIDER). */
  lider: boolean
}

/** Cargos de liderança (sem acento, sem caixa). */
const LIDER = /\b(gerente|lider|supervisor|supervisora|coordenador|coordenadora|diretor|diretora|encarregado|encarregada|chefe|gestor|gestora)\b/
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
export const cargoDeLider = (cargo: string | null | undefined) => !!cargo && LIDER.test(semAcento(cargo))

let cache: { em: number; mapa: Map<string, PapelOrg> } | null = null
let emCurso: Promise<Map<string, PapelOrg>> | null = null
const VALIDADE = 5 * 60_000

/** userId do portal → { cargo, setor, lider }. Só quem tem login (pessoas "u:"). */
export async function papeisDoPortal(forcar = false): Promise<Map<string, PapelOrg>> {
  if (!forcar && cache && Date.now() - cache.em < VALIDADE) return cache.mapa
  if (emCurso) return emCurso
  emCurso = (async () => {
    try {
      const [us, rh, vinc, perms] = await Promise.all([
        supabaseAdmin.from('financeiro_usu').select('id,nome,email,funcao,avatar_url,ativo'),
        listarFuncionariosRH().catch(() => []),
        supabaseAdmin.from('org_pessoas').select('pessoa_chave,cargo'),
        supabaseAdmin.from('portal_permissoes').select('user_id,categoria,modulos_permitidos'),
      ])
      // A Administração é o lugar único (27/11/2026): setor e função dela valem mais que o RH.
      const adm = new Map(((perms.data || []) as { user_id: string; categoria: string | null; modulos_permitidos: string[] | null }[]).map((x) => [x.user_id, x]))
      const cargoCorrigido = new Map(((vinc.error ? [] : vinc.data) || [])
        .filter((v: { cargo: string | null }) => v.cargo)
        .map((v: { pessoa_chave: string; cargo: string }) => [v.pessoa_chave, v.cargo]))
      const mapa = new Map<string, PapelOrg>()
      for (const p of juntarPessoas((us.data || []) as UsuarioPortal[], rh)) {
        if (!p.chave.startsWith('u:')) continue
        const uid = p.chave.slice(2)
        const a = adm.get(uid)
        const cargo = cargoDe(a?.categoria, a?.modulos_permitidos || [], cargoCorrigido.get(p.chave) || null) || p.cargo || null
        const setor = nomeDoSetor(a?.categoria) || p.setor || null
        mapa.set(uid, { cargo, setor, lider: cargoDeLider(cargo) })
      }
      cache = { em: Date.now(), mapa }
      return mapa
    } finally { emCurso = null }
  })()
  return emCurso
}

/** Papel de um usuário (vazio se não está no organograma). */
export async function papelDe(userId: string): Promise<PapelOrg> {
  return (await papeisDoPortal()).get(userId) || { cargo: null, setor: null, lider: false }
}

/** Chamar quando o admin muda o cargo/chefe no organograma (o próximo pedido relê). */
export function esquecerPapeis(): void { cache = null }
