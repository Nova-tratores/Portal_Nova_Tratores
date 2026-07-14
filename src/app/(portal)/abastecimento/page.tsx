import { redirect } from 'next/navigation';

// O Abastecimento virou submódulo do Frota. Stub de redirect para não quebrar
// bookmarks e links já colados em avisos/chat. Remover na limpeza (Fase 5).
export default function AbastecimentoRedirect() {
  redirect('/frota/abastecimento');
}
