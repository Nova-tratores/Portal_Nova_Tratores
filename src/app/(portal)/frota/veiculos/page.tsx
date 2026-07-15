import { redirect } from 'next/navigation';

// A aba Veículos foi fundida na Visão geral (/frota) — decisão do usuário,
// 15/07/2026. Stub de redirect para não quebrar bookmarks e links antigos.
export default function FrotaVeiculosRedirect() {
  redirect('/frota');
}
