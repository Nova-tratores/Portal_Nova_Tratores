'use client';
import { useState } from 'react';
import { ChevronDown, ChevronRight, Check, Plus, ShieldCheck } from 'lucide-react';
import {
  GRUPOS_ORDEM, grupoDoModulo, acoesDoModulo,
  estadoModulo, acoesMarcadas, setTotal, setOff, toggleAcao,
} from '@/lib/permissoes/catalogo';
import { acaoExplicita } from '@/lib/permissoes/explicitas';

interface Props {
  modulos: string[];                              // modulos_permitidos do usuário
  catalogo: { id: string; label: string }[];      // lista de módulos atribuíveis (MODULOS do admin)
  onChange: (novo: string[]) => void;
  disabled?: boolean;
}

// Edição das permissões de um usuário: módulos agrupados em pills, com checklist
// de ações granulares (expansível) nos módulos que têm ações no catálogo.
export default function PermissoesModulos({ modulos, catalogo, onChange, disabled }: Props) {
  const [expandido, setExpandido] = useState<Set<string>>(new Set());
  const toggleExp = (id: string) =>
    setExpandido((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const porGrupo: Record<string, { id: string; label: string }[]> = {};
  for (const m of catalogo) (porGrupo[grupoDoModulo(m.id)] ||= []).push(m);
  const grupos = GRUPOS_ORDEM.filter((g) => porGrupo[g]?.length);

  // desmarcar uma ação quando o módulo está em "acesso total":
  // converte pra granular com todas as ações MENOS a desmarcada.
  // Ação explícita (ex.: Faturar OS) liga/desliga sozinha: o acesso total não a concede.
  const handleAcao = (mod: string, acao: string) => {
    if (acaoExplicita(mod, acao)) {
      onChange(toggleAcao(modulos, mod, acao));
    } else if (estadoModulo(modulos, mod) === 'total') {
      const explicitasMarcadas = modulos.filter((p) => p.startsWith(mod + ':') && acaoExplicita(mod, p.slice(mod.length + 1)));
      const outras = acoesDoModulo(mod).map((a) => a.id).filter((x) => x !== acao && !acaoExplicita(mod, x));
      onChange([...setOff(modulos, mod), ...outras.map((x) => `${mod}:${x}`), ...explicitasMarcadas]);
    } else {
      onChange(toggleAcao(modulos, mod, acao));
    }
  };

  // estilo base de pill
  const pill = (on: boolean, cor: 'vermelho' | 'laranja' = 'vermelho'): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '5px 11px', borderRadius: 999, fontSize: 11.5, fontWeight: 600,
    cursor: disabled ? 'default' : 'pointer', transition: '0.15s', userSelect: 'none',
    border: on
      ? `1px solid ${cor === 'laranja' ? '#fdba74' : '#fecaca'}`
      : '1px solid var(--portal-border)',
    background: on ? (cor === 'laranja' ? '#fff7ed' : '#fef2f2') : 'var(--portal-bg-card)',
    color: on ? (cor === 'laranja' ? '#c2410c' : '#dc2626') : 'var(--portal-text-muted)',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {grupos.map((grupo) => (
        <div key={grupo}>
          <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.6, color: 'var(--portal-text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>{grupo}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {porGrupo[grupo].map((mod) => {
              const estado = estadoModulo(modulos, mod.id);
              const acoes = acoesDoModulo(mod.id);
              const temAcoes = acoes.length > 0;
              const on = estado !== 'off';
              const marcadas = acoesMarcadas(modulos, mod.id);
              const cor = estado === 'parcial' ? 'laranja' : 'vermelho';
              return (
                <button
                  key={mod.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    if (temAcoes) toggleExp(mod.id);
                    else onChange(on ? setOff(modulos, mod.id) : setTotal(modulos, mod.id));
                  }}
                  style={pill(on, cor)}
                >
                  {on && (estado === 'parcial' ? null : <Check size={12} />)}
                  {mod.label}
                  {estado === 'parcial' && <span style={{ fontWeight: 800 }}>{marcadas.size}/{acoes.length}</span>}
                  {temAcoes && (expandido.has(mod.id) ? <ChevronDown size={13} /> : <ChevronRight size={13} />)}
                </button>
              );
            })}
          </div>

          {/* painéis de ações dos módulos expandidos */}
          {porGrupo[grupo]
            .filter((m) => acoesDoModulo(m.id).length > 0 && expandido.has(m.id))
            .map((mod) => {
              const acoes = acoesDoModulo(mod.id);
              const estado = estadoModulo(modulos, mod.id);
              const marcadas = acoesMarcadas(modulos, mod.id);
              return (
                <div key={mod.id} style={{ marginTop: 8, padding: 12, borderRadius: 12, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-secondary)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--portal-text)' }}>{mod.label}</div>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => onChange(estado === 'total' ? setOff(modulos, mod.id) : setTotal(modulos, mod.id))}
                      style={pill(estado === 'total')}
                      title="Concede todas as ações deste módulo"
                    >
                      <ShieldCheck size={12} /> Acesso total
                    </button>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {acoes.map((a) => {
                      const on = acaoExplicita(mod.id, a.id) ? marcadas.has(a.id) : (estado === 'total' || marcadas.has(a.id));
                      return (
                        <button
                          key={a.id}
                          type="button"
                          disabled={disabled}
                          onClick={() => handleAcao(mod.id, a.id)}
                          style={pill(on)}
                        >
                          {on ? <Check size={12} /> : <Plus size={12} />}
                          {a.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
        </div>
      ))}
    </div>
  );
}
