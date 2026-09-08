// Página PÚBLICA do questionário pós-evento (destino do link único).
//
// Fica FORA de (portal): sem sidebar, sem header, sem login. Quem abre é uma
// pessoa com o link no WhatsApp, quase sempre no celular.
//
// O trabalho todo é do componente client (autosave), então aqui só passa o
// token adiante e define o metadata.
import type { Metadata } from 'next';
import Formulario from './Formulario';

export const dynamic = 'force-dynamic';

// Link de questionário não deve ser indexado por buscador.
export const metadata: Metadata = {
  title: 'Questionário pós-evento — Nova Tratores',
  robots: { index: false, follow: false },
};

export default async function QuestionarioPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <Formulario token={token} />;
}
