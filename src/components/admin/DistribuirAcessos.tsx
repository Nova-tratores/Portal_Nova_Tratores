'use client';
// Distribuir acessos de um usuário (José, 21/10/2026: "deixa uma forma mais interativa para distribuir
// permissões dos apps"). Três abas — Portal (módulos), App Mecânicos e App NT Vendas — no mesmo lugar.
// Portal: cartões com interruptor por módulo, busca, grupos com contador, ações finas no painel ao lado,
// e "copiar acessos de" outra pessoa. Usa as mesmas regras do catálogo (lib/permissoes/catalogo).
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, ShieldCheck, Copy, Smartphone, Wrench, LayoutGrid, Check } from 'lucide-react';
import { GRUPOS_ORDEM, grupoDoModulo, acoesDoModulo, estadoModulo, acoesMarcadas, setTotal, setOff, toggleAcao } from '@/lib/permissoes/catalogo';
import { acaoExplicita, acaoSoDev } from '@/lib/permissoes/explicitas';

type Mod = { id: string; label: string; color?: string };
interface Props {
  nome: string; ehAdmin: boolean; souDev: boolean; disabled?: boolean
  modulos: string[]; catalogo: Mod[]; onModulos: (novo: string[]) => void
  mecanicoRole: 'tecnico' | 'observador' | null; mecanicoNome: string | null; onMecanico: (role: string, nome?: string) => void
  vendedor: boolean; salvandoVendedor?: boolean; onVendedor: (v: boolean) => void
  outros: { id: string; nome: string; modulos: string[] }[]
}

export default function DistribuirAcessos(p: Props) {
  const [aba, setAba] = useState<'portal' | 'mecanicos' | 'vendas'>('portal');
  const [busca, setBusca] = useState('');
  const [grupo, setGrupo] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [copiar, setCopiar] = useState('');

  const porGrupo = useMemo(() => {
    const m: Record<string, Mod[]> = {};
    for (const x of p.catalogo) (m[grupoDoModulo(x.id)] ||= []).push(x);
    return m;
  }, [p.catalogo]);
  const grupos = GRUPOS_ORDEM.filter((g) => porGrupo[g]?.length);
  const ligados = p.catalogo.filter((m) => estadoModulo(p.modulos, m.id) !== 'off').length;
  const q = busca.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const visivel = (m: Mod) => (!grupo || grupoDoModulo(m.id) === grupo) && (!q || m.label.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q));
  const ligarModulo = (id: string, on: boolean) => p.onModulos(on ? setTotal(p.modulos, id) : setOff(p.modulos, id));
  const ligarGrupo = (g: string, on: boolean) => {
    let n = p.modulos;
    for (const m of porGrupo[g] || []) n = on ? setTotal(n, m.id) : setOff(n, m.id);
    p.onModulos(n);
  };
  const handleAcao = (mod: string, acao: string) => {
    if (acaoExplicita(mod, acao)) p.onModulos(toggleAcao(p.modulos, mod, acao));
    else if (estadoModulo(p.modulos, mod) === 'total') {
      const explicitas = p.modulos.filter((x) => x.startsWith(mod + ':') && acaoExplicita(mod, x.slice(mod.length + 1)));
      const outras = acoesDoModulo(mod).map((a) => a.id).filter((x) => x !== acao && !acaoExplicita(mod, x));
      p.onModulos([...setOff(p.modulos, mod), ...outras.map((x) => `${mod}:${x}`), ...explicitas]);
    } else p.onModulos(toggleAcao(p.modulos, mod, acao));
  };
  const modSel = sel ? p.catalogo.find((m) => m.id === sel) : null;

  return (
    <div className="da">
      <style>{ESTILO_DA}</style>
      <div className="da-abas">
        <button type="button" className={aba === 'portal' ? 'on' : ''} onClick={() => setAba('portal')}><LayoutGrid size={15} />Portal<em>{ligados}</em></button>
        <button type="button" className={aba === 'mecanicos' ? 'on' : ''} onClick={() => setAba('mecanicos')}><Wrench size={15} />App Mecânicos<em className={p.mecanicoRole ? 'ok' : ''}>{p.mecanicoRole === 'tecnico' ? 'técnico' : p.mecanicoRole === 'observador' ? 'observador' : 'sem acesso'}</em></button>
        <button type="button" className={aba === 'vendas' ? 'on' : ''} onClick={() => setAba('vendas')}><Smartphone size={15} />App NT Vendas<em className={p.vendedor ? 'ok' : ''}>{p.vendedor ? 'ativo' : 'sem acesso'}</em></button>
      </div>

      {aba === 'portal' && (
        <div className="da-portal">
          {p.ehAdmin && <p className="da-aviso"><ShieldCheck size={14} /> {p.nome.split(' ')[0]} é Admin e já vê tudo — estas marcações só valem se voltar a Usuário.</p>}
          <div className="da-barra">
            <label className="da-busca"><Search size={15} /><input placeholder="buscar módulo…" value={busca} onChange={(e) => setBusca(e.target.value)} /></label>
            <div className="da-grupos">
              <button type="button" className={!grupo ? 'on' : ''} onClick={() => setGrupo(null)}>Todos <small>{ligados}/{p.catalogo.length}</small></button>
              {grupos.map((g) => {
                const lig = porGrupo[g].filter((m) => estadoModulo(p.modulos, m.id) !== 'off').length;
                return <button key={g} type="button" className={grupo === g ? 'on' : ''} onClick={() => setGrupo(grupo === g ? null : g)}>{g} <small className={lig ? 'ok' : ''}>{lig}/{porGrupo[g].length}</small></button>;
              })}
            </div>
            <div className="da-mais">
              {grupo && <>
                <button type="button" disabled={p.disabled} onClick={() => ligarGrupo(grupo, true)}>Liberar {grupo}</button>
                <button type="button" disabled={p.disabled} onClick={() => ligarGrupo(grupo, false)}>Tirar {grupo}</button>
              </>}
              <label className="da-copiar"><Copy size={14} />
                <select value={copiar} disabled={p.disabled} onChange={(e) => { const o = p.outros.find((x) => x.id === e.target.value); setCopiar(''); if (o && confirm(`Copiar os acessos de ${o.nome} para ${p.nome}? Os acessos atuais de ${p.nome} serão trocados.`)) p.onModulos([...o.modulos]); }}>
                  <option value="">copiar acessos de…</option>
                  {p.outros.filter((o) => o.modulos.length).map((o) => <option key={o.id} value={o.id}>{o.nome} ({new Set(o.modulos.map((m) => m.split(':')[0])).size})</option>)}
                </select>
              </label>
            </div>
          </div>
          <div className={`da-corpo ${modSel ? 'com-lado' : ''}`}>
            <div className="da-grade">
              {grupos.map((g) => {
                const ms = porGrupo[g].filter(visivel);
                if (!ms.length) return null;
                return (
                  <section key={g} className="da-sec">
                    <h4>{g}</h4>
                    <div className="da-cards">
                      {ms.map((m, k) => {
                        const est = estadoModulo(p.modulos, m.id);
                        const acoes = acoesDoModulo(m.id);
                        const marc = acoesMarcadas(p.modulos, m.id);
                        const on = est !== 'off';
                        return (
                          <div key={m.id} className={`da-card ${est} ${sel === m.id ? 'sel' : ''}`} style={{ '--c': m.color || '#dc2626', '--d': `${k * 25}ms` } as React.CSSProperties}
                            onClick={() => acoes.length ? setSel(sel === m.id ? null : m.id) : (!p.disabled && ligarModulo(m.id, !on))}>
                            <span className="da-ic">{m.label.charAt(0)}</span>
                            <span className="da-tx"><b>{m.label}</b><small>{est === 'total' ? (acoes.length ? 'acesso total' : 'liberado') : est === 'parcial' ? `${marc.size} de ${acoes.length} ações` : 'sem acesso'}{acoes.length ? ' · ajustar ›' : ''}</small></span>
                            <button type="button" className={`da-sw ${on ? 'on' : ''} ${est === 'parcial' ? 'meio' : ''}`} disabled={p.disabled} aria-label={on ? 'Tirar acesso' : 'Dar acesso'} onClick={(e) => { e.stopPropagation(); ligarModulo(m.id, !on); }}><i /></button>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
            {modSel && (
              <aside className="da-lado" style={{ '--c': modSel.color || '#dc2626' } as React.CSSProperties}>
                <div className="da-lado-cab"><b>{modSel.label}</b><button type="button" onClick={() => setSel(null)} aria-label="Fechar">×</button></div>
                <button type="button" className={`da-total ${estadoModulo(p.modulos, modSel.id) === 'total' ? 'on' : ''}`} disabled={p.disabled}
                  onClick={() => ligarModulo(modSel.id, estadoModulo(p.modulos, modSel.id) !== 'total')}><ShieldCheck size={15} />Acesso total</button>
                <div className="da-acoes">
                  {acoesDoModulo(modSel.id).map((a) => {
                    const est = estadoModulo(p.modulos, modSel.id);
                    const marc = acoesMarcadas(p.modulos, modSel.id);
                    const on = acaoExplicita(modSel.id, a.id) ? marc.has(a.id) : (est === 'total' || marc.has(a.id));
                    const trav = acaoSoDev(modSel.id, a.id) && !p.souDev;
                    return (
                      <button key={a.id} type="button" className="da-acao" disabled={p.disabled || trav} title={trav ? 'Só um Dev pode dar ou tirar esta permissão' : undefined} onClick={() => handleAcao(modSel.id, a.id)}>
                        <span className={`da-sw pq ${on ? 'on' : ''}`}><i /></span>
                        <span>{a.label}{acaoExplicita(modSel.id, a.id) && <small> · precisa marcar à parte</small>}</span>
                      </button>
                    );
                  })}
                </div>
              </aside>
            )}
          </div>
        </div>
      )}

      {aba === 'mecanicos' && (
        <div className="da-app">
          <p className="da-app-txt">O app dos mecânicos (relatórios, fotos e jornada) usa o mesmo login do portal.</p>
          <div className="da-opcoes">
            {([['', 'Sem acesso', 'não entra no app dos mecânicos'], ['tecnico', 'Técnico', 'preenche relatórios das suas OS, fotos e jornada'], ['observador', 'Observador', 'só acompanha o que os técnicos lançam']] as const).map(([v, rot, txt]) => (
              <button key={v} type="button" disabled={p.disabled} className={`da-op ${(p.mecanicoRole || '') === v ? 'on' : ''}`} onClick={() => p.onMecanico(v)}>
                <span className="da-radio">{(p.mecanicoRole || '') === v && <Check size={13} />}</span><span><b>{rot}</b><small>{txt}</small></span>
              </button>
            ))}
          </div>
          {p.mecanicoRole && <p className="da-app-txt">Aparece no app como <b>{p.mecanicoNome || p.nome}</b>.</p>}
        </div>
      )}

      {aba === 'vendas' && (
        <div className="da-app">
          <button type="button" className={`da-grande ${p.vendedor ? 'on' : ''}`} disabled={p.salvandoVendedor} onClick={() => p.onVendedor(!p.vendedor)}>
            <span className={`da-sw ${p.vendedor ? 'on' : ''}`}><i /></span>
            <span><b>{p.vendedor ? `${p.nome.split(' ')[0]} entra no app NT Vendas` : 'Liberar o app NT Vendas'}</b><small>com o mesmo login do portal — visitas, carteira, propostas e rota do vendedor</small></span>
          </button>
        </div>
      )}
    </div>
  );
}

const ESTILO_DA = `
@keyframes daEntra { from { opacity: 0; transform: translateY(6px) } }
.da { display: grid; gap: 14px; animation: daEntra .25s both; font-family: inherit }
.da-abas { display: inline-flex; gap: 4px; background: #f1f5f9; border-radius: 999px; padding: 4px; justify-self: start; flex-wrap: wrap }
.da-abas button { display: inline-flex; align-items: center; gap: 7px; border: none; background: none; border-radius: 999px; padding: 8px 14px; font-family: inherit; font-size: 13.5px; color: #475569; cursor: pointer; transition: all .15s }
.da-abas button.on { background: #fefefe; color: #0f172a; box-shadow: 0 1px 4px rgba(15,23,42,.12) } .da-abas em { font-style: normal; font-size: 11.5px; border-radius: 99px; padding: 1px 8px; background: #e2e8f0; color: #475569 } .da-abas em.ok { background: #dcfce7; color: #166534 }
.da-aviso { margin: 0; display: flex; align-items: center; gap: 6px; font-size: 13px; color: #92400e; background: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; padding: 8px 12px }
.da-portal { display: grid; gap: 12px }
.da-barra { display: flex; gap: 10px; align-items: center; flex-wrap: wrap }
.da-busca { display: inline-flex; align-items: center; gap: 6px; border: 1px solid #e2e8f0; background: #fefefe; border-radius: 999px; padding: 7px 12px; color: #94a3b8 } .da-busca input { border: none; outline: none; font-family: inherit; font-size: 13.5px; width: 170px; color: #0f172a; background: none }
.da-grupos { display: flex; gap: 5px; flex-wrap: wrap } .da-grupos button { border: 1px solid #e2e8f0; background: #fefefe; border-radius: 999px; padding: 6px 12px; font-family: inherit; font-size: 12.5px; color: #334155; cursor: pointer; transition: all .15s }
.da-grupos button:hover { border-color: #94a3b8 } .da-grupos button.on { background: #0f172a; border-color: #0f172a; color: #fefefe } .da-grupos small { font-size: 11px; color: #94a3b8 } .da-grupos small.ok { color: #059669 } .da-grupos button.on small { color: #cbd5e1 }
.da-mais { display: flex; gap: 6px; align-items: center; margin-left: auto; flex-wrap: wrap } .da-mais > button { border: 1px solid #e2e8f0; background: #fefefe; border-radius: 999px; padding: 6px 12px; font-family: inherit; font-size: 12.5px; cursor: pointer; color: #334155 } .da-mais > button:hover { border-color: #0f172a }
.da-copiar { display: inline-flex; align-items: center; gap: 6px; border: 1px dashed #cbd5e1; border-radius: 999px; padding: 4px 6px 4px 12px; color: #64748b } .da-copiar select { border: none; background: none; font-family: inherit; font-size: 12.5px; color: #334155; outline: none; cursor: pointer; max-width: 200px }
.da-corpo { display: grid; grid-template-columns: 1fr; gap: 14px; align-items: start } .da-corpo.com-lado { grid-template-columns: 1fr 300px } @media (max-width: 1000px) { .da-corpo.com-lado { grid-template-columns: 1fr } }
.da-grade { display: grid; gap: 14px } .da-sec h4 { margin: 0 0 7px; font-size: 11px; font-weight: 500; color: #64748b; text-transform: uppercase; letter-spacing: .6px }
.da-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 8px }
.da-card { display: flex; align-items: center; gap: 10px; border: 1px solid #e2e8f0; background: #fefefe; border-radius: 14px; padding: 10px 12px; cursor: pointer; transition: border-color .15s, box-shadow .2s, transform .15s, background .2s; animation: daEntra .3s var(--d) both; user-select: none }
.da-card:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(15,23,42,.08) }
.da-card.total { border-color: color-mix(in srgb, var(--c) 40%, transparent); background: color-mix(in srgb, var(--c) 5%, #fefefe) } .da-card.parcial { border-color: #fcd34d; background: #fffdf5 } .da-card.sel { box-shadow: 0 0 0 2px var(--c) }
.da-ic { width: 32px; height: 32px; border-radius: 10px; display: grid; place-items: center; font-size: 14px; color: #94a3b8; background: #f1f5f9; flex-shrink: 0; transition: all .2s } .da-card.total .da-ic, .da-card.parcial .da-ic { background: var(--c); color: #fefefe }
.da-tx { display: grid; flex: 1; min-width: 0 } .da-tx b { font-size: 13px; font-weight: 500; color: #0f172a; overflow: hidden; text-overflow: ellipsis; white-space: nowrap } .da-tx small { font-size: 11.5px; color: #94a3b8 } .da-card.total .da-tx small { color: #059669 } .da-card.parcial .da-tx small { color: #b45309 }
.da-sw { width: 36px; height: 21px; border-radius: 99px; border: none; background: #e2e8f0; position: relative; flex-shrink: 0; cursor: pointer; padding: 0; transition: background .2s } .da-sw i { position: absolute; top: 2px; left: 2px; width: 17px; height: 17px; border-radius: 50%; background: #fefefe; box-shadow: 0 1px 3px rgba(15,23,42,.25); transition: transform .22s cubic-bezier(.3,1.4,.5,1) }
.da-sw.on { background: #059669 } .da-sw.on i { transform: translateX(15px) } .da-sw.meio { background: #f59e0b } .da-sw.pq { width: 30px; height: 18px } .da-sw.pq i { width: 14px; height: 14px } .da-sw.pq.on i { transform: translateX(12px) } .da-sw:disabled { opacity: .5; cursor: not-allowed }
.da-lado { position: sticky; top: 0; border: 1px solid #e2e8f0; border-radius: 16px; background: #fefefe; padding: 14px; display: grid; gap: 10px; box-shadow: 0 12px 30px rgba(15,23,42,.08); animation: daEntra .2s both }
.da-lado-cab { display: flex; justify-content: space-between; align-items: center } .da-lado-cab b { font-size: 15px; font-weight: 500 } .da-lado-cab button { width: 28px; height: 28px; border-radius: 50%; border: none; background: #f1f5f9; cursor: pointer; font-size: 16px; color: #64748b }
.da-total { display: inline-flex; align-items: center; gap: 7px; justify-self: start; border: 1px solid #e2e8f0; background: #fefefe; border-radius: 999px; padding: 7px 14px; font-family: inherit; font-size: 13px; cursor: pointer; color: #334155 } .da-total.on { background: #059669; border-color: #059669; color: #fefefe }
.da-acoes { display: grid; gap: 2px; max-height: 420px; overflow: auto } .da-acao { display: flex; align-items: center; gap: 10px; border: none; background: none; border-radius: 9px; padding: 7px 6px; font-family: inherit; font-size: 13px; color: #0f172a; text-align: left; cursor: pointer } .da-acao:hover:not(:disabled) { background: #f8fafc } .da-acao small { color: #b45309 } .da-acao:disabled { opacity: .5; cursor: not-allowed }
.da-app { display: grid; gap: 12px; max-width: 760px } .da-app-txt { margin: 0; font-size: 13.5px; color: #475569 } .da-app-txt b { font-weight: 500; color: #0f172a }
.da-opcoes { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 8px }
.da-op { display: flex; gap: 10px; align-items: flex-start; border: 1px solid #e2e8f0; background: #fefefe; border-radius: 14px; padding: 12px; font-family: inherit; text-align: left; cursor: pointer; transition: all .15s } .da-op:hover { border-color: #94a3b8 } .da-op.on { border-color: #0f172a; box-shadow: 0 0 0 1px #0f172a }
.da-op b { display: block; font-size: 14px; font-weight: 500; color: #0f172a } .da-op small { font-size: 12.5px; color: #64748b }
.da-radio { width: 20px; height: 20px; border-radius: 50%; border: 2px solid #cbd5e1; display: grid; place-items: center; flex-shrink: 0; color: #fefefe } .da-op.on .da-radio { background: #0f172a; border-color: #0f172a }
.da-grande { display: flex; gap: 14px; align-items: center; border: 1px solid #e2e8f0; background: #fefefe; border-radius: 16px; padding: 16px 18px; font-family: inherit; text-align: left; cursor: pointer; transition: all .2s } .da-grande.on { border-color: #fecaca; background: #fff7f7 } .da-grande b { display: block; font-size: 15px; font-weight: 500; color: #0f172a } .da-grande small { font-size: 13px; color: #64748b } .da-grande .da-sw.on { background: #dc2626 }
`;

/** O editor de acessos num modal (José, 21/10/2026: "faz um modal"). */
export function ModalAcessos({ avatar, funcao, email, onFechar, ...p }: Props & { avatar?: string; funcao?: string; email?: string; onFechar: () => void }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }
    window.addEventListener('keydown', esc)
    const ov = document.body.style.overflow; document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', esc); document.body.style.overflow = ov }
  }, [onFechar])
  if (typeof document === 'undefined') return null
  return createPortal(
    <div className="mda-fundo" onMouseDown={(e) => { if (e.target === e.currentTarget) onFechar() }}>
      <style>{ESTILO_MDA}</style>
      <div className="mda" role="dialog" aria-label={`Acessos de ${p.nome}`}>
        <header className="mda-cab">
          <span className="mda-av">{avatar ? <img src={avatar} alt="" /> : p.nome.charAt(0)}</span>
          <div><b>Acessos de {p.nome}</b><small>{[funcao, email].filter(Boolean).join(' · ')} · cada mudança grava na hora</small></div>
          <button type="button" className="mda-x" onClick={onFechar} aria-label="Fechar">×</button>
        </header>
        <div className="mda-corpo"><DistribuirAcessos {...p} /></div>
        <footer className="mda-pe"><span>As mudanças valem na hora: a pessoa vê sem precisar sair e entrar.</span><button type="button" onClick={onFechar}>Pronto</button></footer>
      </div>
    </div>, document.body)
}

const ESTILO_MDA = `
@keyframes mdaFundo { from { opacity: 0 } } @keyframes mdaSobe { from { opacity: 0; transform: translateY(16px) scale(.985) } }
.mda-fundo { position: fixed; inset: 0; z-index: 100100; background: rgba(15,23,42,.45); backdrop-filter: blur(3px); display: grid; place-items: center; padding: 16px; animation: mdaFundo .18s both }
.mda { width: min(1200px, 100%); height: min(860px, calc(100vh - 32px)); display: grid; grid-template-rows: auto 1fr auto; background: #fefefe; border-radius: 20px; box-shadow: 0 30px 80px rgba(15,23,42,.35); overflow: hidden; animation: mdaSobe .25s cubic-bezier(.2,.8,.2,1) both; font-family: inherit; color: #0f172a }
.mda-cab { display: flex; gap: 14px; align-items: center; padding: 18px 24px; border-bottom: 1px solid #eef2f7 } .mda-cab > div { display: grid; flex: 1; min-width: 0 } .mda-cab b { font-size: 19px; font-weight: 500 } .mda-cab small { font-size: 13px; color: #64748b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.mda-av { width: 46px; height: 46px; border-radius: 50%; overflow: hidden; display: grid; place-items: center; background: linear-gradient(135deg, #dc2626, #b91c1c); color: #fefefe; font-size: 18px; flex-shrink: 0 } .mda-av img { width: 100%; height: 100%; object-fit: cover }
.mda-x { width: 36px; height: 36px; border-radius: 50%; border: 1px solid #e2e8f0; background: #fefefe; color: #64748b; font-size: 20px; cursor: pointer } .mda-x:hover { border-color: #0f172a; color: #0f172a }
.mda-corpo { overflow: auto; padding: 18px 24px }
.mda-pe { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 12px 24px; border-top: 1px solid #eef2f7; background: #f8fafc } .mda-pe span { font-size: 13px; color: #64748b } .mda-pe button { border: none; background: #0f172a; color: #fefefe; border-radius: 999px; padding: 10px 22px; font-family: inherit; font-size: 14px; cursor: pointer } .mda-pe button:hover { background: #1d4ed8 }
`
