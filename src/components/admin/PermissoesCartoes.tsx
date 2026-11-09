'use client';
// Editor de permissões em CARTÕES com caixinhas (protótipo de 09/11/2026, opção 2 em
// /admin/teste). Um cartão por módulo: a caixinha do título dá o módulo inteiro e cada
// linha embaixo é uma ação. Mesma regra do PermissoesModulos (lib/permissoes/catalogo):
// grava o mesmo modulos_permitidos, só muda o jeito de marcar.
import { useMemo, useState } from 'react';
import { Check, Minus, Lock, Search } from 'lucide-react';
import {
  GRUPOS_ORDEM, grupoDoModulo, acoesDoModulo,
  estadoModulo, acoesMarcadas, setTotal, setOff, toggleAcao, type EstadoModulo,
} from '@/lib/permissoes/catalogo';
import { acaoExplicita, acaoSoDev } from '@/lib/permissoes/explicitas';

interface Props {
  modulos: string[];
  catalogo: { id: string; label: string }[];
  onChange: (novo: string[]) => void;
  disabled?: boolean;
  souDev?: boolean;
}

type Filtro = 'todos' | 'com' | 'sem';

const VERMELHO = '#dc2626';

function Caixa({ estado, travada, tamanho = 18 }: { estado: 'on' | 'meio' | 'off'; travada?: boolean; tamanho?: number }) {
  const cheia = estado !== 'off';
  return (
    <span
      aria-hidden
      style={{
        width: tamanho, height: tamanho, flex: 'none', borderRadius: 5,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        border: `2px solid ${cheia ? VERMELHO : 'var(--portal-border)'}`,
        background: cheia ? VERMELHO : 'var(--portal-bg-card)',
        color: '#fefefe', transition: 'background .15s, border-color .15s',
        opacity: travada ? 0.5 : 1,
      }}
    >
      {estado === 'on' && <Check size={tamanho - 6} strokeWidth={3.5} />}
      {estado === 'meio' && <Minus size={tamanho - 6} strokeWidth={3.5} />}
    </span>
  );
}

export default function PermissoesCartoes({ modulos, catalogo, onChange, disabled, souDev = false }: Props) {
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');

  // mesma regra do editor atual: desmarcar uma ação com o módulo em "acesso total"
  // vira granular com todas as outras; ação explícita liga/desliga sozinha.
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
  const handleModulo = (mod: string, estado: EstadoModulo) =>
    onChange(estado === 'total' ? setOff(modulos, mod) : setTotal(modulos, mod));

  const q = busca.trim().toLowerCase();
  const visiveis = useMemo(() => catalogo.filter((m) => {
    const est = estadoModulo(modulos, m.id);
    if (filtro === 'com' && est === 'off') return false;
    if (filtro === 'sem' && est !== 'off') return false;
    if (!q) return true;
    return m.label.toLowerCase().includes(q) || m.id.includes(q)
      || acoesDoModulo(m.id).some((a) => a.label.toLowerCase().includes(q));
  }), [catalogo, modulos, filtro, q]);

  const porGrupo: Record<string, { id: string; label: string }[]> = {};
  for (const m of visiveis) (porGrupo[grupoDoModulo(m.id)] ||= []).push(m);
  const grupos = GRUPOS_ORDEM.filter((g) => porGrupo[g]?.length);
  const comAcesso = catalogo.filter((m) => estadoModulo(modulos, m.id) !== 'off').length;

  const chip = (ativo: boolean): React.CSSProperties => ({
    padding: '6px 12px', borderRadius: 999, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
    border: `1px solid ${ativo ? VERMELHO : 'var(--portal-border)'}`,
    background: ativo ? '#fef2f2' : 'var(--portal-bg-card)', color: ativo ? VERMELHO : 'var(--portal-text-secondary)',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* barra: busca + filtro + contagem */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, flex: '1 1 240px', maxWidth: 380, padding: '7px 10px', borderRadius: 10, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-card)' }}>
          <Search size={15} color="var(--portal-text-muted)" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar módulo ou ação…"
            style={{ border: 'none', outline: 'none', background: 'transparent', color: 'var(--portal-text)', fontSize: 13.5, width: '100%' }} />
        </label>
        <button type="button" style={chip(filtro === 'todos')} onClick={() => setFiltro('todos')}>Todos ({catalogo.length})</button>
        <button type="button" style={chip(filtro === 'com')} onClick={() => setFiltro('com')}>Com acesso ({comAcesso})</button>
        <button type="button" style={chip(filtro === 'sem')} onClick={() => setFiltro('sem')}>Sem acesso ({catalogo.length - comAcesso})</button>
      </div>

      {grupos.length === 0 && (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--portal-text-muted)', fontSize: 13.5 }}>Nenhum módulo com esse filtro.</div>
      )}

      {grupos.map((grupo) => (
        <section key={grupo}>
          <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: 0.6, color: 'var(--portal-text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>
            {grupo} <span style={{ fontWeight: 600 }}>· {porGrupo[grupo].length}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(250px, 100%), 1fr))', gap: 10, alignItems: 'start' }}>
            {porGrupo[grupo].map((mod) => {
              const estado = estadoModulo(modulos, mod.id);
              const acoes = acoesDoModulo(mod.id);
              const marcadas = acoesMarcadas(modulos, mod.id);
              const nMarcadas = acoes.filter((a) => acaoExplicita(mod.id, a.id) ? marcadas.has(a.id) : (estado === 'total' || marcadas.has(a.id))).length;
              const caixa: 'on' | 'meio' | 'off' = estado === 'total' ? 'on' : estado === 'parcial' ? 'meio' : 'off';
              return (
                <div key={mod.id} className="perm-cartao" style={{
                  borderRadius: 12, border: `1px solid ${estado === 'off' ? 'var(--portal-border)' : '#fecaca'}`,
                  background: 'var(--portal-bg-card)', overflow: 'hidden', transition: 'border-color .15s',
                }}>
                  <button type="button" disabled={disabled} onClick={() => handleModulo(mod.id, estado)}
                    title={estado === 'total' ? 'Tirar o módulo inteiro' : 'Dar o módulo inteiro'}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px',
                      border: 'none', background: estado === 'off' ? 'transparent' : '#fef2f2',
                      cursor: disabled ? 'default' : 'pointer', textAlign: 'left',
                    }}>
                    <Caixa estado={caixa} />
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 700, color: estado === 'off' ? 'var(--portal-text)' : '#111111' }}>{mod.label}</span>
                    {acoes.length > 0 && (
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: estado === 'off' ? 'var(--portal-text-muted)' : VERMELHO, whiteSpace: 'nowrap' }}>
                        {nMarcadas}/{acoes.length}
                      </span>
                    )}
                  </button>
                  {acoes.length > 0 ? (
                    <div style={{ padding: '4px 4px 6px', maxHeight: 248, overflowY: 'auto', borderTop: '1px solid var(--portal-border)' }}>
                      {acoes.map((a) => {
                        const explicita = acaoExplicita(mod.id, a.id);
                        const on = explicita ? marcadas.has(a.id) : (estado === 'total' || marcadas.has(a.id));
                        const travada = acaoSoDev(mod.id, a.id) && !souDev;
                        return (
                          <button key={a.id} type="button" disabled={disabled || travada} onClick={() => handleAcao(mod.id, a.id)}
                            title={travada ? 'Só um Dev pode dar ou tirar esta permissão' : explicita ? 'Vai à parte: o módulo inteiro não dá esta ação' : undefined}
                            style={{
                              width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '6px 8px', borderRadius: 8,
                              border: 'none', background: 'transparent', textAlign: 'left',
                              cursor: disabled || travada ? 'not-allowed' : 'pointer',
                            }}>
                            <Caixa estado={on ? 'on' : 'off'} travada={travada} tamanho={16} />
                            <span style={{ flex: 1, fontSize: 12.5, color: on ? 'var(--portal-text)' : 'var(--portal-text-secondary)' }}>{a.label}</span>
                            {travada && <Lock size={12} color="var(--portal-text-muted)" />}
                            {explicita && !travada && (
                              <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 999, background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa' }}>à parte</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{ padding: '0 12px 10px 40px', fontSize: 11.5, color: 'var(--portal-text-muted)' }}>Liga ou desliga o módulo inteiro</div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
