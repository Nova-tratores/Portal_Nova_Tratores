// Guarda da porta única: nenhum arquivo fora de src/lib/omie/porta.ts pode montar
// a chamada à Omie por conta própria (objeto com `app_secret:` é o sinal — é o
// corpo que vai para app.omie.com.br). Chamou a Omie? Use `omie()` da porta.
// Plano: docs/omie-fila-agendador-plano.md
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.resolve(__dirname, '../../..');
const PORTA = path.join(SRC, 'lib', 'omie', 'porta.ts');

function arquivos(dir: string): string[] {
  const out: string[] = [];
  for (const nome of fs.readdirSync(dir)) {
    const p = path.join(dir, nome);
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      if (nome === 'node_modules' || nome === '__tests__') continue;
      out.push(...arquivos(p));
    } else if (/\.(ts|tsx|js|mjs)$/.test(nome) && !/\.test\./.test(nome)) {
      out.push(p);
    }
  }
  return out;
}

describe('porta única da Omie', () => {
  it('ninguém fora da porta monta o corpo da chamada à Omie', () => {
    const fora = arquivos(SRC)
      .filter((f) => f !== PORTA)
      .filter((f) => /\bapp_secret\s*:/.test(fs.readFileSync(f, 'utf8')))
      .map((f) => path.relative(SRC, f).split(path.sep).join('/'));
    expect(fora).toEqual([]);
  });
});
