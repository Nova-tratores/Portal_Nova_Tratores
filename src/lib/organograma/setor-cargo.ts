// SETOR E CARGO CENTRALIZADOS (José, 27/11/2026: "tá contraditório, precisamos centralizar essas
// informações de modo que apareçam assim no RH").
// Lugar ÚNICO de editar: a Administração (setor = portal_permissoes.categoria; cargo = a função do
// setor, ou um cargo livre para setores sem lista de funções). Cada mudança é copiada para:
//   · o organograma (org_pessoas.cargo da pessoa "u:<id>")
//   · o RH (rh_funcionarios.departamento e .cargo), se a pessoa existe lá
// Assim Administração, organograma e RH mostram o mesmo. Servidor (service role).
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { gravarSetorCargoRH } from '@/lib/frota/rh'
import { esquecerPapeis, nomeDoSetor, cargoDe } from './papeis'

/** Grava o cargo no organograma (cria a linha da pessoa se ainda não tem). */
async function gravarCargoOrg(userId: string, cargo: string | null): Promise<void> {
  const chave = `u:${userId}`
  const { data } = await supabaseAdmin.from('org_pessoas').select('pessoa_chave,cargo').eq('pessoa_chave', chave).maybeSingle()
  if (!cargo) return // vazio não apaga o cargo que o organograma já tem
  if (data) {
    if ((data.cargo || null) === cargo) return
    await supabaseAdmin.from('org_pessoas').update({ cargo, atualizado_em: new Date().toISOString() }).eq('pessoa_chave', chave)
  } else if (cargo) {
    await supabaseAdmin.from('org_pessoas').insert({ pessoa_chave: chave, gestor_chave: null, topo: false, fora: false, cargo })
  }
}

export interface ResultadoSync { setor: string | null; cargo: string | null; rh: 'atualizado' | 'nao_encontrado' | 'sem_rh' | 'igual' | 'erro'; erroRh?: string }

/**
 * Copia setor e cargo da Administração para o organograma e o RH.
 * cargoLivre: undefined = mantém o cargo livre que já está no organograma; string/null = troca.
 */
export async function sincronizarSetorCargo(userId: string, cargoLivre?: string | null): Promise<ResultadoSync> {
  const [perm, usu, org] = await Promise.all([
    supabaseAdmin.from('portal_permissoes').select('categoria, modulos_permitidos').eq('user_id', userId).maybeSingle(),
    supabaseAdmin.from('financeiro_usu').select('nome, email').eq('id', userId).maybeSingle(),
    supabaseAdmin.from('org_pessoas').select('cargo').eq('pessoa_chave', `u:${userId}`).maybeSingle(),
  ])
  const categoria = (perm.data?.categoria as string | null) || null
  const modulos = (perm.data?.modulos_permitidos as string[] | null) || []
  const livre = cargoLivre !== undefined ? (cargoLivre?.trim() || null) : ((org.error ? null : org.data?.cargo) || null)
  const cargo = cargoDe(categoria, modulos, livre)
  const setor = nomeDoSetor(categoria)
  await gravarCargoOrg(userId, cargo)
  let rh: ResultadoSync['rh'] = 'sem_rh'
  let erroRh: string | undefined
  try { rh = await gravarSetorCargoRH({ email: usu.data?.email, nome: usu.data?.nome }, { departamento: setor, cargo }) }
  catch (e) { rh = 'erro'; erroRh = e instanceof Error ? e.message : String(e) }
  esquecerPapeis()
  return { setor, cargo, rh, ...(erroRh ? { erroRh } : {}) }
}

export interface LinhaRevisao {
  userId: string
  nome: string
  /** O que a Administração diz (o certo, daqui para a frente). */
  setor: string | null
  cargo: string | null
  /** O que está no RH hoje (null = a pessoa não está no RH). */
  rh: { departamento: string | null; cargo: string | null } | null
  /** true quando o RH (ou o organograma) vai mudar ao aplicar. */
  muda: boolean
}

/** Compara Administração × RH de todo mundo ativo, SEM gravar nada (o botão "Conferir com o RH"). */
export async function revisarTodos(): Promise<LinhaRevisao[]> {
  const { listarFuncionariosRH } = await import('@/lib/frota/rh')
  const [usu, perms, org, rhLista] = await Promise.all([
    supabaseAdmin.from('financeiro_usu').select('id,nome,email,ativo'),
    supabaseAdmin.from('portal_permissoes').select('user_id,categoria,modulos_permitidos'),
    supabaseAdmin.from('org_pessoas').select('pessoa_chave,cargo'),
    listarFuncionariosRH(),
  ])
  const sa = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
  const ativosRH = rhLista.filter((f) => !f.data_demissao && sa(f.status || '') !== 'demitido')
  const perm = new Map(((perms.data || []) as { user_id: string; categoria: string | null; modulos_permitidos: string[] | null }[]).map((p) => [p.user_id, p]))
  const orgCargo = new Map(((org.error ? [] : org.data) || []).map((o: { pessoa_chave: string; cargo: string | null }) => [o.pessoa_chave, o.cargo]))
  const out: LinhaRevisao[] = []
  for (const u of (usu.data || []) as { id: string; nome: string | null; email: string | null; ativo: boolean | null }[]) {
    if (u.ativo === false || !u.nome) continue
    const p = perm.get(u.id)
    if (!p) continue
    const setor = nomeDoSetor(p.categoria)
    const cargo = cargoDe(p.categoria, p.modulos_permitidos || [], orgCargo.get(`u:${u.id}`) || null)
    const email = (u.email || '').trim().toLowerCase()
    const f = (email && ativosRH.find((x) => (x.email || '').trim().toLowerCase() === email)) || ativosRH.find((x) => sa(x.nome) === sa(u.nome!))
    const rh = f ? { departamento: f.departamento || null, cargo: f.cargo || null } : null
    // Vazio na Administração não apaga: só conta como mudança o que vai ser preenchido/trocado.
    const muda = (!!f && ((!!setor && rh!.departamento !== setor) || (!!cargo && rh!.cargo !== cargo))) || (!!cargo && (orgCargo.get(`u:${u.id}`) || null) !== cargo)
    out.push({ userId: u.id, nome: u.nome.trim(), setor, cargo, rh, muda })
  }
  return out.sort((a, b) => Number(b.muda) - Number(a.muda) || a.nome.localeCompare(b.nome, 'pt-BR'))
}
