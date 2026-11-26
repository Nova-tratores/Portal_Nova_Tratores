import type { Bloco } from "../../src/lib/conhecimento/blocos";

export type ArtigoSeed = {
  slug: string;
  titulo: string;
  tipo: "tela" | "procedimento" | "regra" | "faq" | "produto";
  modulo: string;
  telas: string[];
  fontes: string[];
  resumo: string;
  tags: string[];
  ordem: number;
  corpo: Bloco[];
};
