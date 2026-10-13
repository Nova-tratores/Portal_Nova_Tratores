// PPV — regras de acesso no SERVIDOR (para as rotas /api/ppv/* que exigem login).
import type { Autenticado } from '@/lib/auth/server';

// Acesso ao módulo PPV (espelha o temAcesso('ppv') do usePermissoes, no servidor).
// Quem tem o módulo "puro" (ppv) ou qualquer ação granular (ppv:...) passa.
export function temModuloPPV(auth: Autenticado): boolean {
  if (auth.isAdmin) return true;
  return auth.modulos.includes('ppv') || auth.modulos.some((m) => m.startsWith('ppv:'));
}

/** Tarefas e anexos valem para PPV e OS (mesmas tabelas; o id diz de quem é: PPV-xxxx / OS-xxxx). */
export function temModuloPPVouPOS(auth: Autenticado): boolean {
  return temModuloPPV(auth) || auth.modulos.includes('pos') || auth.modulos.some((m) => m.startsWith('pos:'));
}

// Ação específica do PPV (ex.: 'faturar'). Módulo "puro" concede tudo.
export function podePPV(auth: Autenticado, acao: string): boolean {
  if (auth.isAdmin) return true;
  if (auth.modulos.includes('ppv')) return true;
  return auth.modulos.includes(`ppv:${acao}`);
}
