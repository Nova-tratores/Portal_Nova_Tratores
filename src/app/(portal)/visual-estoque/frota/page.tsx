import { redirect } from 'next/navigation';

// O pátio da frota foi absorvido pelo módulo Frota. Stub de redirect para não
// quebrar bookmarks. Remover na limpeza (Fase 5).
export default function VisualEstoqueFrotaRedirect() {
  redirect('/frota/patio');
}
