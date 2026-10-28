// Autorização do módulo Frota no SERVIDOR. Espelha o gate do cliente
// (lib/permissoes/frota.ts) — se divergirem, a tela mostra o botão e a rota
// nega (ou pior: o contrário).
import { createClient } from '@supabase/supabase-js';
import type { Autenticado } from '@/lib/auth/server';
import { permite } from '@/lib/permissoes/explicitas';
import { registrarAuditLog } from '@/lib/server/audit-notify';

/** Tem acesso ao módulo (o módulo puro OU qualquer permissão granular dele). */
export function temModuloFrota(auth: Autenticado): boolean {
  if (auth.isAdmin) return true;
  return (
    auth.modulos.includes('frota') ||
    auth.modulos.some((m) => m.startsWith('frota:'))
  );
}

/** Mapa dos carros (/frota/mapa e /mapa-geral): Frota OU o módulo "mapa"
 *  (Mapa Técnico do Pós-Vendas, que desde 16/10/2026 é a mesma tela). */
export function temAcessoMapa(auth: Autenticado): boolean {
  return temModuloFrota(auth) || auth.modulos.some((m) => m === 'mapa' || m.startsWith('mapa:'));
}

/** Módulo "Pendências (Frota)" — abrir/acompanhar pendências dos carros sem o
 *  módulo Frota inteiro. Quem tem Frota também passa. */
export function temModuloPendencias(auth: Autenticado): boolean {
  if (auth.isAdmin) return true;
  return auth.modulos.includes('pendencias') || temModuloFrota(auth);
}

/**
 * Pode executar a ação/ver a tela. Match por PREFIXO: quem tem
 * `frota:abastecimento:upload` também passa em `podeFrota(auth,'abastecimento')`
 * — senão seria barrado na própria tela que pode usar.
 */
export function podeFrota(auth: Autenticado, acao: string): boolean {
  if (auth.isAdmin) return true;
  if (auth.modulos.includes('frota')) return true;
  return (
    auth.modulos.includes(`frota:${acao}`) ||
    auth.modulos.some((m) => m.startsWith(`frota:${acao}:`))
  );
}

/** Tirar carro da frota (vender, arquivar, sem uso): ação só de Dev, concedida no Admin. */
export function podeInativar(auth: Autenticado): boolean {
  return permite(auth.modulos, auth.isAdmin, 'frota', 'veiculos:inativar', auth.isDev);
}

// ── Audit log ────────────────────────────────────────────────────────────────
const supaAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  { auth: { persistSession: false } },
);

/**
 * Registra uma ESCRITA do Frota no audit_log (o que o painel de atividades do
 * Admin lê). Best-effort: nunca derruba a operação. Resolve o nome legível do
 * autor em financeiro_usu (fallback: e-mail do token).
 */
export async function logFrota(
  auth: Autenticado,
  params: {
    acao: string; // 'editar' | 'mover_status' | 'upload' ... (ACAO_LABELS do admin)
    entidade: string;
    entidadeId?: string;
    entidadeLabel?: string;
    detalhes?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    let nome = auth.email || 'Usuário';
    const { data } = await supaAdmin
      .from('financeiro_usu')
      .select('nome')
      .eq('id', auth.userId)
      .maybeSingle();
    if (data?.nome) nome = data.nome;

    await registrarAuditLog({
      userId: auth.userId,
      userName: nome,
      sistema: 'frota',
      ...params,
    });
  } catch (e) {
    console.warn('[frota] audit log falhou:', e);
  }
}
