// BASE DE CONHECIMENTO — quebra um guia em markdown em artigos. PURO.
//
// Feito para `docs/guia-pos-venda-regras.md`, cujo formato é:
//   ## 1. OS — Ordem de Serviço (/pos)
//   **Como a OS muda de fase**
//   - regra …
// Cada "## N. Título (/rota)" é uma tela; cada linha que COMEÇA com **negrito**
// abre um artigo daquela tela. O que vem antes do primeiro negrito vira
// "Visão geral".

import { mdParaBlocos, type Bloco } from "./blocos";
import { normalizarTela } from "./artigos";

export interface ArtigoDoGuia {
  secao: string;   // "OS — Ordem de Serviço"
  tela: string;    // "/pos"
  modulo: string;  // "pos"
  titulo: string;  // "Como a OS muda de fase"
  ordem: number;   // posição dentro da tela (10, 20, …)
  corpo: Bloco[];
}

const RE_SECAO = /^##\s+(?:\d+\.\s*)?(.+?)\s*\((\/[^)\s]*)\)\s*$/;
const RE_ARTIGO = /^\*\*([^*]+)\*\*(.*)$/;

/** "/dre-financeiro/vendas-modelo" → "dre-financeiro". */
export function moduloDaTela(tela: string): string {
  return normalizarTela(tela).split("/")[1] || "geral";
}

export function dividirGuia(md: string): ArtigoDoGuia[] {
  const out: ArtigoDoGuia[] = [];
  let secao: { titulo: string; tela: string } | null = null;
  let atual: { titulo: string; linhas: string[] } | null = null;
  let ordem = 0;

  const fecha = () => {
    if (!secao || !atual) { atual = null; return; }
    const corpo = mdParaBlocos(atual.linhas.join("\n"));
    if (corpo.length) {
      ordem += 10;
      out.push({ secao: secao.titulo, tela: secao.tela, modulo: moduloDaTela(secao.tela), titulo: atual.titulo, ordem, corpo });
    }
    atual = null;
  };

  for (const linha of (md || "").replace(/\r\n/g, "\n").split("\n")) {
    const s = linha.match(RE_SECAO);
    if (s) {
      fecha();
      secao = { titulo: s[1].trim(), tela: normalizarTela(s[2]) };
      ordem = 0;
      atual = { titulo: "Visão geral", linhas: [] };
      continue;
    }
    if (/^#{1,2}\s/.test(linha)) { fecha(); secao = null; continue; } // título do documento ou seção sem rota
    if (!secao) continue;

    const a = linha.match(RE_ARTIGO);
    if (a) {
      fecha();
      const resto = a[2].trim().replace(/^[:—-]\s*/, "").replace(/:$/, "").trim();
      atual = { titulo: a[1].trim().replace(/[:.]$/, ""), linhas: resto ? [resto, ""] : [] };
      continue;
    }
    (atual ??= { titulo: "Visão geral", linhas: [] }).linhas.push(linha);
  }
  fecha();
  return out;
}
