import { redirect } from 'next/navigation';

// O pátio virou a Visão geral do módulo Frota (a tela de pátio foi
// descontinuada). Stub de redirect para não quebrar bookmarks. Remover na
// limpeza (Fase 5).
export default function VisualEstoqueFrotaRedirect() {
  redirect('/frota');
}
