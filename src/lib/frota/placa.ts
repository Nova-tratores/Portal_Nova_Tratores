// =============================================================================
// PLACA — fonte única de normalização/identidade de veículo do portal.
//
// Antes existiam DUAS implementações divergentes:
//   - abastecimento/parse.ts: replace(/[^A-Z0-9]/g,'')   ← correta
//   - rastreamento.ts + 3 outros: replace(/[-\s]/g,'')   ← NÃO removia '.' nem
//     en-dash '–', então "ABC–1234" não casava com "ABC1234" (falha silenciosa)
// E o de-para de `Placas.NumPlaca` ("MODELO - PLACA") era feito com
// `split(/[-–]/)[1]`, que quebra quando o modelo tem hífen ("F-4000 - LNX1234"
// devolvia "4000") ou quando não há separador (devolvia undefined).
//
// Tudo passa por aqui agora. A placa normalizada é a CHAVE do módulo Frota.
// =============================================================================

/** Placa brasileira: ABC1234 (antiga) ou ABC1D23 (Mercosul). */
export const PLACA_RE = /^[A-Z]{3}[0-9][0-9A-Z][0-9]{2}$/;

/** Maiúscula, só letras e números. "sec-1f03 " → "SEC1F03", "ABC–1234" → "ABC1234". */
export function normalizarPlaca(s: string | null | undefined): string {
  return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function ehPlacaValida(placa: string | null | undefined): boolean {
  return PLACA_RE.test(normalizarPlaca(placa));
}

/** Só para exibir: "EPX5402" → "EPX-5402". Nunca use o resultado como chave. */
export function formatarPlaca(placa: string | null | undefined): string {
  const p = normalizarPlaca(placa);
  return p.length === 7 ? `${p.slice(0, 3)}-${p.slice(3)}` : p;
}

/**
 * Extrai a placa de um `Placas.NumPlaca` / `SupaPlacas.NumPlaca`, que guarda
 * "MODELO - PLACA" numa string só, com separador inconsistente.
 *
 * Estratégia: tokeniza, e devolve o ÚLTIMO token que PARECE uma placa. Se
 * nenhum parecer, devolve o último token não-vazio (melhor esforço).
 *
 *   "SAVEIRO - TKY6E68"  → "TKY6E68"
 *   "VOYAGE-SEB9J47"     → "SEB9J47"
 *   "SAVEIRO – DLZ1967"  → "DLZ1967"   (en-dash)
 *   "F-4000 - LNX1234"   → "LNX1234"   (o split antigo devolvia "4000")
 *   "TKY6E68"            → "TKY6E68"   (sem separador; o split antigo dava undefined)
 */
export function extrairPlacaDeNumPlaca(numPlaca: string | null | undefined): string {
  return partesNumPlaca(numPlaca).placa;
}

/**
 * Quebra um `NumPlaca` ("MODELO - PLACA") nas suas duas partes.
 *
 *   "SAVEIRO - TKY6E68" → { tipo: 'SAVEIRO',  placa: 'TKY6E68' }
 *   "F-4000 - LNX1234"  → { tipo: 'F-4000',   placa: 'LNX1234' }
 *   "GOL - AYB-4230"    → { tipo: 'GOL',      placa: 'AYB4230' }
 *   "TKY6E68"           → { tipo: '',         placa: 'TKY6E68' }
 */
export function partesNumPlaca(numPlaca: string | null | undefined): { tipo: string; placa: string } {
  const bruto = String(numPlaca || '');
  const tokens = bruto.split(/[-–—\s/]+/).filter((t) => t.trim() !== '');
  if (tokens.length === 0) return { tipo: '', placa: '' };

  // Varre de trás pra frente procurando a placa. Testa o token sozinho E o par
  // com o token anterior — porque uma placa antiga escrita com hífen
  // ("AYB-4230") vira DOIS tokens e nenhum deles casa sozinho.
  for (let i = tokens.length - 1; i >= 0; i--) {
    const sozinho = normalizarPlaca(tokens[i]);
    if (PLACA_RE.test(sozinho)) {
      return { tipo: tokens.slice(0, i).join(' ').trim(), placa: sozinho };
    }
    if (i > 0) {
      const par = normalizarPlaca(tokens[i - 1] + tokens[i]);
      if (PLACA_RE.test(par)) {
        return { tipo: tokens.slice(0, i - 1).join(' ').trim(), placa: par };
      }
    }
  }

  // Nada parece placa (ex.: pseudo-placas fora do padrão): melhor esforço —
  // o último token é a "placa" e o resto é o tipo.
  return {
    tipo: tokens.slice(0, -1).join(' ').trim(),
    placa: normalizarPlaca(tokens[tokens.length - 1]),
  };
}

// ── Identidades especiais ────────────────────────────────────────────────────

/**
 * "Placas" do cartão-frota que NÃO são veículos: são baldes de abastecimento
 * avulso. O gasto delas é real e CONTA nos custos, mas elas ficam fora de
 * km/L, pátio, ranking de motorista e patrimônio.
 *
 * Atenção: regex não resolve — "CLI0002" e "TRA0001" casam com PLACA_RE
 * (3 letras + 4 dígitos). Só uma lista explícita resolve.
 * Na Fase 1 isto vira linha em `frota_veiculos` com tipo_registro='avulso'.
 */
export const PLACAS_AVULSAS: Record<string, string> = {
  CLI0002: 'Abastecimento — Clientes',
  TRA0001: 'Abastecimento — Tratores',
  '0000000': 'Abastecimento — Quadriciclos',
};

export function ehAvulsa(placa: string | null | undefined): boolean {
  return normalizarPlaca(placa) in PLACAS_AVULSAS;
}

/**
 * Grafias erradas que criavam veículo-fantasma (o mesmo carro contado 2×).
 * A canônica é sempre a que o RASTREADOR usa (ele está no carro físico).
 * Confirmado com o usuário em 13/07/2026.
 * Na Fase 1 isto vira `frota_veiculos_alias`.
 */
export const ALIASES_PLACA: Record<string, string> = {
  EVG1467: 'EVG1E67',   // Caminhão Munck
  SEV9I75: 'SEB9I75',   // Voyage (typo só na tabela Placas)
  TKBB8I49: 'TKB8I49',  // 8 caracteres — placa tem 7
};

/** Normaliza E resolve apelido → a placa canônica do veículo. */
export function resolverPlaca(s: string | null | undefined): string {
  const p = normalizarPlaca(s);
  return ALIASES_PLACA[p] || p;
}
