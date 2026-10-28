"use client";
// Feedbacks → Tratores (26/10/2026): radar dos tratores novos — chegada da fábrica, pátio, venda,
// 30/60/90 dias e revisão de 50 h, tudo pelas notas fiscais. Permissão: a mesma da aba Hoje
// (lib/feedbacks/telas.ts). Corpo em components/feedbacks/tratores/RadarTratores.tsx.
import Casca from "@/components/feedbacks/hoje/Casca";
import RadarTratores from "@/components/feedbacks/tratores/RadarTratores";

export default function FeedbacksTratoresPage() {
  return (
    <Casca>
      <RadarTratores />
    </Casca>
  );
}
