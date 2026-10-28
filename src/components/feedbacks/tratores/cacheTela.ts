// Último resultado de cada leitura do Radar Tratores guardado no navegador (José, 28/10/2026: "isso já
// deve ficar tudo carregado, e não ficar carregando sempre"). A tela mostra o guardado na hora e
// atualiza por trás. Memória do módulo (troca de aba sem recarregar) + localStorage (abrir de novo).
// O localStorage pode falhar (aba anônima, cota cheia): aí fica só a memória.

const memoria = new Map<string, unknown>();
const PREFIXO = "radar-tratores:v1:";
const VALIDADE_MS = 3 * 24 * 3_600_000;

export function lerGuardado<T>(chave: string): T | null {
  if (memoria.has(chave)) return memoria.get(chave) as T;
  try {
    const bruto = localStorage.getItem(PREFIXO + chave);
    if (!bruto) return null;
    const { em, dados } = JSON.parse(bruto) as { em: number; dados: T };
    if (!em || Date.now() - em > VALIDADE_MS) return null;
    memoria.set(chave, dados);
    return dados;
  } catch { return null; }
}

export function guardar<T>(chave: string, dados: T) {
  memoria.set(chave, dados);
  try { localStorage.setItem(PREFIXO + chave, JSON.stringify({ em: Date.now(), dados })); } catch { /* sem espaço: fica só na memória */ }
}
