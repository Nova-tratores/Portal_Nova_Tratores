// Quem pode usar as rotas /api/supervisor-vendas/* (até 15/10/2026 elas não
// pediam login: posição ao vivo da frota, rotas, visitas do CRM e o vínculo
// carro↔pessoa ficavam abertos a qualquer um na internet).
//
// - leitura de rastreamento (posições, rota, histórico): Frota OU Supervisor
//   de Vendas ou o módulo "mapa" (Mapa Técnico) — as telas usam o mesmo mapa;
// - o resto (CRM, vínculo de carros, check-in): só Supervisor de Vendas.
import { NextResponse } from 'next/server';
import { autenticar, type Autenticado } from '@/lib/auth/server';
import { temAcessoMapa } from '@/lib/frota/server';

export function temSupervisorVendas(auth: Autenticado): boolean {
  if (auth.isAdmin) return true;
  return auth.modulos.some((m) => m === 'supervisor-vendas' || m.startsWith('supervisor-vendas:'));
}

export async function acessoSupervisor(
  req: Request,
  { frota = false }: { frota?: boolean } = {},
): Promise<{ auth: Autenticado; resposta?: undefined } | { resposta: NextResponse; auth?: undefined }> {
  const auth = await autenticar(req);
  if (!auth) return { resposta: NextResponse.json({ error: 'Não autenticado' }, { status: 401 }) };
  if (temSupervisorVendas(auth) || (frota && temAcessoMapa(auth))) return { auth };
  return { resposta: NextResponse.json({ error: 'Sem permissão' }, { status: 403 }) };
}
