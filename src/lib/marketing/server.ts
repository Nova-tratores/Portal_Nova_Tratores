// =============================================================================
// Autorização do módulo Marketing & Eventos no SERVIDOR. Espelha o gate do
// cliente (lib/permissoes/marketing.ts) — se divergirem, a tela mostra o botão
// e a rota nega (ou pior: o contrário).
// =============================================================================
import type { Autenticado } from '@/lib/auth/server';
import { registrarAuditLog } from '@/lib/server/audit-notify';
import { supabaseAdmin } from '@/lib/server/supabase-admin';

/** Tem acesso ao módulo (o módulo puro OU qualquer permissão granular dele). */
export function temModuloMarketing(auth: Autenticado): boolean {
  if (auth.isAdmin) return true;
  return (
    auth.modulos.includes('marketing') ||
    auth.modulos.some((m) => m.startsWith('marketing:'))
  );
}

/**
 * Módulo "Captura de Leads" — a tela mobile do estande, sem o módulo grande.
 * Quem tem Marketing também passa.
 */
export function temModuloLead(auth: Autenticado): boolean {
  if (auth.isAdmin) return true;
  return auth.modulos.includes('lead') || temModuloMarketing(auth);
}

/**
 * Pode executar a ação/ver a tela. Match por PREFIXO: quem tem
 * `marketing:apoios:editar` também passa em `podeMarketing(auth,'apoios')`.
 */
export function podeMarketing(auth: Autenticado, acao: string): boolean {
  if (auth.isAdmin) return true;
  if (auth.modulos.includes('marketing')) return true;
  return (
    auth.modulos.includes(`marketing:${acao}`) ||
    auth.modulos.some((m) => m.startsWith(`marketing:${acao}:`))
  );
}

/** Nome legível do autor (financeiro_usu), com fallback pro e-mail do token. */
export async function nomeDoUsuario(auth: Autenticado): Promise<string> {
  try {
    const { data } = await supabaseAdmin
      .from('financeiro_usu')
      .select('nome')
      .eq('id', auth.userId)
      .maybeSingle();
    if (data?.nome) return String(data.nome);
  } catch {
    /* segue com o fallback */
  }
  return auth.email || 'Usuário do portal';
}

/**
 * Registra uma ESCRITA do módulo no audit_log (o painel de Atividades do Admin
 * lê isso). Best-effort: nunca derruba a operação.
 */
export async function logMarketing(
  auth: Autenticado,
  params: {
    acao: string;
    entidade: string;
    entidadeId?: string;
    entidadeLabel?: string;
    detalhes?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    const nome = await nomeDoUsuario(auth);
    await registrarAuditLog({
      userId: auth.userId,
      userName: nome,
      sistema: 'marketing',
      ...params,
    });
  } catch (e) {
    console.warn('[marketing] audit log falhou:', e);
  }
}
