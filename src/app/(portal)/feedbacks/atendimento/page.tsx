import { redirect } from "next/navigation";
import { destinoAntigo } from "@/lib/feedbacks/telas";

// Rota antiga do Feedbacks (até 23/10/2026). Leva para a tela nova — lib/feedbacks/telas.ts destinoAntigo.
export default async function AntigaAtendimento({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  redirect(destinoAntigo("atendimento", await searchParams));
}
