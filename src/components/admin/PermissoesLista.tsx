'use client';
// Editor de permissões em LISTA (José, 10/11/2026: "essa distribuição está horrível, melhora").
// Os cartões lado a lado ficavam com alturas diferentes, buracos e cortados na direita. Aqui cada
// módulo é uma LINHA alinhada, em três jeitos para escolher em /admin/teste:
//   'pilulas' — as ações ficam na própria linha, como pílulas de liga/desliga;
//   'sanfona' — a linha mostra só o módulo; a seta abre as ações embaixo;
//   'painel'  — lista à esquerda, ações do módulo escolhido à direita (no celular vira sanfona).
// Mesma regra dos outros editores (lib/permissoes/catalogo): grava o mesmo modulos_permitidos.
import { useMemo, useState } from 'react';
import { Check, Minus, Lock, Search, ChevronDown, ChevronRight } from 'lucide-react';
import {
  GRUPOS_ORDEM, grupoDoModulo, acoesDoModulo,
  estadoModulo, acoesMarcadas, setTotal, setOff, toggleAcao, type EstadoModulo,
} from '@/lib/permissoes/catalogo';
import { acaoExplicita, acaoSoDev } from '@/lib/permissoes/explicitas';

export type ModoLista = 'pilulas' | 'sanfona' | 'painel';
interface Props {
  modulos: string[];
  catalogo: { id: string; label: string }[];
  onChange: (novo: string[]) => void;
  disabled?: boolean;
  souDev?: boolean;
  modo?: ModoLista;
}
type Filtro = 'todos' | 'com' | 'sem';

function Caixa({ estado, travada, p }: { estado: 'on' | 'meio' | 'off'; travada?: boolean; p?: boolean }) {
  return (
    <span aria-hidden className={`pl-cx ${estado} ${p ? 'p' : ''} ${travada ? 'trav' : ''}`}>
      {estado === 'on' && <Check size={p ? 11 : 13} strokeWidth={3.5} />}
      {estado === 'meio' && <Minus size={p ? 11 : 13} strokeWidth={3.5} />}
    </span>
  );
}

export default function PermissoesLista({ modulos, catalogo, onChange, disabled, souDev = false, modo = 'pilulas' }: Props) {
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [aberto, setAberto] = useState<string | null>(null);

  // ações que só Dev mexe ficam como estão quando quem edita não é Dev
  const travadasDe = (mod: string) => souDev ? [] : modulos.filter((x) => x.startsWith(mod + ':') && acaoSoDev(mod, x.slice(mod.length + 1)));
  const desligar = (lista: string[], mod: string) => [...setOff(lista, mod), ...travadasDe(mod)];

  const handleAcao = (mod: string, acao: string) => {
    if (acaoExplicita(mod, acao)) onChange(toggleAcao(modulos, mod, acao));
    else if (estadoModulo(modulos, mod) === 'total') {
      const explicitas = modulos.filter((x) => x.startsWith(mod + ':') && acaoExplicita(mod, x.slice(mod.length + 1)));
      const outras = acoesDoModulo(mod).map((a) => a.id).filter((x) => x !== acao && !acaoExplicita(mod, x));
      onChange([...setOff(modulos, mod), ...outras.map((x) => `${mod}:${x}`), ...explicitas]);
    } else onChange(toggleAcao(modulos, mod, acao));
  };
  const handleModulo = (mod: string, estado: EstadoModulo) => onChange(estado === 'total' ? desligar(modulos, mod) : setTotal(modulos, mod));
  const handleGrupo = (ids: string[], dar: boolean) => {
    let n = modulos;
    for (const id of ids) n = dar ? setTotal(n, id) : desligar(n, id);
    onChange(n);
  };

  const q = busca.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const sem = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const visiveis = useMemo(() => catalogo.filter((m) => {
    const est = estadoModulo(modulos, m.id);
    if (filtro === 'com' && est === 'off') return false;
    if (filtro === 'sem' && est !== 'off') return false;
    return !q || sem(m.label).includes(q) || m.id.includes(q) || acoesDoModulo(m.id).some((a) => sem(a.label).includes(q));
  }), [catalogo, modulos, filtro, q]);

  const porGrupo: Record<string, { id: string; label: string }[]> = {};
  for (const m of visiveis) (porGrupo[grupoDoModulo(m.id)] ||= []).push(m);
  const grupos = GRUPOS_ORDEM.filter((g) => porGrupo[g]?.length);
  const comAcesso = catalogo.filter((m) => estadoModulo(modulos, m.id) !== 'off').length;

  const infoMod = (id: string) => {
    const estado = estadoModulo(modulos, id);
    const acoes = acoesDoModulo(id);
    const marcadas = acoesMarcadas(modulos, id);
    const on = (a: string) => acaoExplicita(id, a) ? marcadas.has(a) : (estado === 'total' || marcadas.has(a));
    const n = acoes.filter((a) => on(a.id)).length;
    const caixa: 'on' | 'meio' | 'off' = estado === 'total' ? 'on' : estado === 'parcial' ? 'meio' : 'off';
    return { estado, acoes, on, n, caixa };
  };

  const subtitulo = (id: string) => {
    const { estado, acoes, n } = infoMod(id);
    if (!acoes.length) return estado === 'off' ? 'sem acesso' : 'com acesso';
    if (estado === 'off') return `sem acesso · ${acoes.length} ações`;
    if (estado === 'total') return n === acoes.length ? 'tudo' : `módulo inteiro · ${n} de ${acoes.length}`;
    return `${n} de ${acoes.length} ações`;
  };

  /** ações em pílulas (modo 1) */
  const pilulas = (id: string) => {
    const { acoes, on } = infoMod(id);
    if (!acoes.length) return <span className="pl-so">liga ou desliga o módulo inteiro</span>;
    return (
      <div className="pl-pills">
        {acoes.map((a) => {
          const ligada = on(a.id);
          const travada = acaoSoDev(id, a.id) && !souDev;
          const aParte = acaoExplicita(id, a.id);
          return (
            <button key={a.id} type="button" disabled={disabled || travada} onClick={() => handleAcao(id, a.id)}
              className={`pl-pill ${ligada ? 'on' : ''} ${aParte ? 'aparte' : ''}`}
              title={travada ? 'Só um Dev pode dar ou tirar esta permissão' : aParte ? 'À parte: o módulo inteiro não dá esta ação, marque sozinha' : undefined}>
              {travada ? <Lock size={11} /> : ligada ? <Check size={12} strokeWidth={3} /> : null}{a.label}
            </button>
          );
        })}
      </div>
    );
  };

  /** ações em caixinhas (sanfona e painel) */
  const caixinhas = (id: string) => {
    const { acoes, on } = infoMod(id);
    if (!acoes.length) return <p className="pl-so pad">Este módulo não tem ações separadas: a caixinha do módulo liga ou desliga tudo.</p>;
    return (
      <div className="pl-cxs">
        {acoes.map((a) => {
          const ligada = on(a.id);
          const travada = acaoSoDev(id, a.id) && !souDev;
          const aParte = acaoExplicita(id, a.id);
          return (
            <button key={a.id} type="button" disabled={disabled || travada} onClick={() => handleAcao(id, a.id)} className={`pl-acao ${ligada ? 'on' : ''}`}
              title={travada ? 'Só um Dev pode dar ou tirar esta permissão' : undefined}>
              <Caixa estado={ligada ? 'on' : 'off'} travada={travada} p />
              <span className="pl-rot">{a.label}</span>
              {travada && <Lock size={12} className="pl-cad" />}
              {aParte && !travada && <em className="pl-tag">à parte</em>}
            </button>
          );
        })}
      </div>
    );
  };

  const selPainel = modo === 'painel' ? (aberto && visiveis.some((m) => m.id === aberto) ? aberto : visiveis[0]?.id || null) : aberto;
  const modSel = selPainel ? catalogo.find((m) => m.id === selPainel) : null;

  const linha = (m: { id: string; label: string }) => {
    const { estado, acoes, caixa } = infoMod(m.id);
    const abre = modo !== 'pilulas' && selPainel === m.id;
    return (
      <div key={m.id} className={`pl-linha ${estado !== 'off' ? 'tem' : ''} ${abre ? 'aberta' : ''}`}>
        <div className="pl-cab">
          <button type="button" className="pl-mod" disabled={disabled} onClick={() => handleModulo(m.id, estado)}
            title={estado === 'total' ? 'Tirar o módulo inteiro' : 'Dar o módulo inteiro'}>
            <Caixa estado={caixa} />
          </button>
          <button type="button" className="pl-nome" onClick={() => modo === 'pilulas' ? handleModulo(m.id, estado) : setAberto(abre && modo === 'sanfona' ? null : m.id)} disabled={modo === 'pilulas' && disabled}>
            <b>{m.label}</b>
            <small className={estado !== 'off' ? 'ok' : ''}>{subtitulo(m.id)}</small>
          </button>
          {(modo === 'painel' || (modo === 'sanfona' && acoes.length > 0)) && (
            <button type="button" className="pl-seta" onClick={() => setAberto(abre && modo === 'sanfona' ? null : m.id)} aria-label={abre ? 'Fechar ações' : 'Ver ações'}>
              {acoes.length > 0 && <span className="pl-n">{infoMod(m.id).n}/{acoes.length}</span>}
              {modo === 'sanfona' || abre ? <ChevronDown size={16} style={{ transform: abre && modo === 'sanfona' ? 'rotate(180deg)' : undefined }} /> : <ChevronRight size={16} />}
            </button>
          )}
          {modo === 'pilulas' && pilulas(m.id)}
        </div>
        {modo === 'sanfona' && abre && <div className="pl-dentro">{caixinhas(m.id)}</div>}
        {modo === 'painel' && abre && <div className="pl-dentro so-estreito">{caixinhas(m.id)}</div>}
      </div>
    );
  };

  const lista = (
    <div className="pl-grupos">
      {grupos.length === 0 && <div className="pl-vazio">Nenhum módulo com esse filtro.</div>}
      {grupos.map((g) => {
        const ids = porGrupo[g].map((m) => m.id);
        const lig = ids.filter((id) => estadoModulo(modulos, id) !== 'off').length;
        return (
          <section key={g} className="pl-grupo">
            <header>
              <span className="pl-gnome">{g}</span>
              <small>{lig} de {ids.length} com acesso</small>
              <span className="pl-gbts">
                <button type="button" disabled={disabled || lig === ids.length} onClick={() => handleGrupo(ids, true)}>Dar todos</button>
                <button type="button" disabled={disabled || lig === 0} onClick={() => handleGrupo(ids, false)}>Tirar todos</button>
              </span>
            </header>
            <div className="pl-linhas">{porGrupo[g].map(linha)}</div>
          </section>
        );
      })}
    </div>
  );

  return (
    <div className={`pl modo-${modo}`}>
      <style>{ESTILO_PL}</style>
      <div className="pl-barra">
        <label className="pl-busca"><Search size={15} /><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar módulo ou ação…" /></label>
        <div className="pl-filtros">
          <button type="button" className={filtro === 'todos' ? 'on' : ''} onClick={() => setFiltro('todos')}>Todos <small>{catalogo.length}</small></button>
          <button type="button" className={filtro === 'com' ? 'on' : ''} onClick={() => setFiltro('com')}>Com acesso <small>{comAcesso}</small></button>
          <button type="button" className={filtro === 'sem' ? 'on' : ''} onClick={() => setFiltro('sem')}>Sem acesso <small>{catalogo.length - comAcesso}</small></button>
        </div>
      </div>

      {modo === 'painel' ? (
        <div className="pl-duas">
          {lista}
          <aside className="pl-lado">
            {modSel ? (() => {
              const { estado, acoes, n } = infoMod(modSel.id);
              const pct = acoes.length ? Math.round((n / acoes.length) * 100) : estado === 'off' ? 0 : 100;
              return (
                <>
                  <div className="pl-lado-cab">
                    <small>{grupoDoModulo(modSel.id)}</small>
                    <b>{modSel.label}</b>
                    <span className={`pl-status ${estado}`}>
                      {estado === 'off' ? 'Sem acesso' : estado === 'total' ? 'Módulo inteiro' : 'Parte do módulo'}
                      {acoes.length > 0 && <em>{n} de {acoes.length} ações</em>}
                    </span>
                    <span className="pl-barrinha"><i style={{ width: `${pct}%` }} /></span>
                    <div className="pl-seg">
                      <button type="button" className={estado === 'total' ? 'on' : ''} disabled={disabled || estado === 'total'} onClick={() => handleModulo(modSel.id, 'off')}><Check size={14} />Dar tudo</button>
                      <button type="button" className={estado === 'off' ? 'on' : ''} disabled={disabled || estado === 'off'} onClick={() => handleModulo(modSel.id, 'total')}>Tirar tudo</button>
                    </div>
                  </div>
                  {acoes.length > 0 && <small className="pl-lado-tit">Ou escolha o que pode fazer</small>}
                  {caixinhas(modSel.id)}
                </>
              );
            })() : <p className="pl-so pad">Escolha um módulo na lista.</p>}
          </aside>
        </div>
      ) : lista}
    </div>
  );
}

const ESTILO_PL = `
.pl { container-type: inline-size; display: grid; gap: 14px; min-width: 0; font-family: inherit; color: var(--portal-text, #0f172a) }
.pl button { font-family: inherit }
.pl-barra { display: flex; flex-wrap: wrap; gap: 8px; align-items: center }
.pl-busca { display: flex; align-items: center; gap: 7px; flex: 1 1 220px; max-width: 360px; padding: 8px 12px; border-radius: 999px; border: 1px solid var(--portal-border, #e2e8f0); background: var(--portal-bg-card, #fefefe); color: var(--portal-text-muted, #94a3b8) }
.pl-busca input { border: none; outline: none; background: transparent; color: var(--portal-text, #0f172a); font-size: 13.5px; width: 100%; min-width: 0 }
.pl-filtros { display: flex; gap: 4px; padding: 3px; border-radius: 999px; background: var(--portal-bg-secondary, #f1f5f9) }
.pl-filtros button { border: none; background: transparent; border-radius: 999px; padding: 6px 12px; font-size: 12.5px; color: var(--portal-text-secondary, #475569); cursor: pointer; white-space: nowrap }
.pl-filtros button small { font-size: 11px; color: var(--portal-text-muted, #94a3b8); margin-left: 2px }
.pl-filtros button.on { background: var(--portal-bg-card, #fefefe); color: var(--portal-text, #0f172a); box-shadow: 0 1px 3px rgba(15,23,42,.12) }

.pl-grupos { display: grid; gap: 16px; min-width: 0 }
.pl-grupo { display: grid; gap: 6px; min-width: 0 }
.pl-grupo > header { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; padding: 0 4px }
.pl-gnome { font-size: 11.5px; font-weight: 700; letter-spacing: .6px; text-transform: uppercase; color: var(--portal-text-secondary, #475569) }
.pl-grupo > header small { font-size: 12px; color: var(--portal-text-muted, #94a3b8) }
.pl-gbts { margin-left: auto; display: flex; gap: 4px }
.pl-gbts button { border: none; background: none; font-size: 12px; color: var(--portal-text-secondary, #64748b); cursor: pointer; padding: 3px 8px; border-radius: 999px }
.pl-gbts button:hover:not(:disabled) { background: var(--portal-bg-secondary, #f1f5f9); color: var(--portal-text, #0f172a) }
.pl-gbts button:disabled { opacity: .35; cursor: default }

.pl-linhas { display: grid; border: 1px solid var(--portal-border, #e2e8f0); border-radius: 14px; overflow: hidden; background: var(--portal-bg-card, #fefefe) }
.pl-linha { border-top: 1px solid var(--portal-border, #eef2f7); min-width: 0 } .pl-linha:first-child { border-top: none }
.pl-linha.tem { background: color-mix(in srgb, #dc2626 3%, var(--portal-bg-card, #fefefe)) }
.pl-cab { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 4px 10px; padding: 8px 12px; min-width: 0 }
.modo-pilulas .pl-cab { grid-template-columns: auto minmax(160px, 260px) minmax(0, 1fr); align-items: start; padding: 10px 12px }
.modo-pilulas .pl-cab > .pl-mod, .modo-pilulas .pl-cab > .pl-nome { margin-top: 2px }
.pl-mod { border: none; background: none; padding: 4px; margin: -4px; cursor: pointer; display: grid; place-items: center }
.pl-nome { border: none; background: none; padding: 0; text-align: left; cursor: pointer; display: grid; gap: 1px; min-width: 0 }
.pl-nome b { font-size: 13.5px; font-weight: 600; color: var(--portal-text, #0f172a); overflow-wrap: anywhere }
.pl-nome small { font-size: 12px; color: var(--portal-text-muted, #94a3b8) } .pl-nome small.ok { color: #b91c1c }
.pl-seta { border: none; background: none; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; color: var(--portal-text-muted, #94a3b8); padding: 6px; border-radius: 8px; min-height: 36px }
.pl-seta:hover { background: var(--portal-bg-secondary, #f1f5f9); color: var(--portal-text, #0f172a) }
.pl-n { font-size: 11.5px; font-variant-numeric: tabular-nums }
.pl-linha.aberta .pl-nome b { color: #b91c1c }

.pl-cx { width: 20px; height: 20px; flex: none; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; border: 2px solid var(--portal-border, #cbd5e1); background: var(--portal-bg-card, #fefefe); color: #fefefe; transition: background .15s, border-color .15s }
.pl-cx.p { width: 17px; height: 17px; border-radius: 5px }
.pl-cx.on, .pl-cx.meio { background: #dc2626; border-color: #dc2626 } .pl-cx.trav { opacity: .5 }

.pl-pills { display: flex; flex-wrap: wrap; gap: 6px; min-width: 0 }
.pl-pill { display: inline-flex; align-items: center; gap: 5px; border: 1px solid var(--portal-border, #e2e8f0); background: var(--portal-bg-card, #fefefe); color: var(--portal-text-secondary, #64748b); border-radius: 999px; padding: 5px 11px; font-size: 12.5px; cursor: pointer; transition: all .12s; text-align: left }
.pl-pill:hover:not(:disabled) { border-color: #94a3b8; color: var(--portal-text, #0f172a) }
.pl-pill.on { background: #fef2f2; border-color: #fecaca; color: #b91c1c }
.pl-pill.aparte { border-style: dashed } .pl-pill:disabled { cursor: not-allowed; opacity: .6 }
.pl-so { font-size: 12.5px; color: var(--portal-text-muted, #94a3b8); align-self: center } .pl-so.pad { margin: 0; padding: 4px 2px; line-height: 1.5 }

.pl-dentro { padding: 2px 12px 12px 44px }
.pl-cxs { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(230px, 100%), 1fr)); gap: 2px 8px }
.pl-acao { display: flex; align-items: center; gap: 9px; border: none; background: none; text-align: left; padding: 7px 8px; border-radius: 8px; cursor: pointer; min-height: 36px; font-size: 13px; color: var(--portal-text-secondary, #475569) }
.pl-acao:hover:not(:disabled) { background: var(--portal-bg-secondary, #f8fafc) } .pl-acao.on { color: var(--portal-text, #0f172a) } .pl-acao:disabled { cursor: not-allowed }
.pl-acao > .pl-rot { flex: 1; min-width: 0 } .pl-cad { color: var(--portal-text-muted, #94a3b8); flex: none }
.pl-tag { font-style: normal; font-size: 10.5px; padding: 1px 7px; border-radius: 999px; background: #fff7ed; color: #c2410c; flex: none }
.pl-vazio { padding: 28px; text-align: center; color: var(--portal-text-muted, #94a3b8); font-size: 13.5px; border: 1px dashed var(--portal-border, #e2e8f0); border-radius: 14px }

.pl-duas { display: grid; grid-template-columns: minmax(0, 1fr) minmax(280px, 380px); gap: 16px; align-items: start }
.pl-lado { position: sticky; top: 0; display: grid; gap: 12px; align-content: start; border: 1px solid var(--portal-border, #e2e8f0); border-radius: 18px; background: var(--portal-bg-card, #fefefe); padding: 18px; max-height: calc(100vh - 220px); overflow: auto; box-shadow: 0 6px 24px rgba(15,23,42,.06) }
.pl-lado-cab { display: grid; gap: 6px; padding-bottom: 14px; border-bottom: 1px solid var(--portal-border, #eef2f7) }
.pl-lado-cab small { font-size: 11px; letter-spacing: .6px; text-transform: uppercase; color: var(--portal-text-muted, #94a3b8) }
.pl-lado-cab b { font-size: 19px; font-weight: 600; line-height: 1.25 }
.pl-status { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 500; color: var(--portal-text-muted, #64748b) }
.pl-status::before { content: ''; width: 8px; height: 8px; border-radius: 50%; background: #cbd5e1 }
.pl-status.total, .pl-status.parcial { color: #b91c1c } .pl-status.total::before { background: #dc2626 } .pl-status.parcial::before { background: #f87171 }
.pl-status em { font-style: normal; font-weight: 400; color: var(--portal-text-muted, #94a3b8) }
.pl-barrinha { height: 5px; border-radius: 99px; background: var(--portal-bg-secondary, #f1f5f9); overflow: hidden } .pl-barrinha i { display: block; height: 100%; background: #dc2626; border-radius: 99px; transition: width .2s }
.pl-seg { margin-top: 4px; display: grid; grid-template-columns: 1fr 1fr; gap: 4px; padding: 4px; border-radius: 12px; background: var(--portal-bg-secondary, #f1f5f9) }
.pl-seg button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; border: none; background: transparent; border-radius: 9px; padding: 9px 10px; font-size: 13px; font-weight: 500; color: var(--portal-text-secondary, #475569); cursor: pointer; min-height: 38px }
.pl-seg button:hover:not(:disabled) { background: var(--portal-bg-card, #fefefe); color: var(--portal-text, #0f172a) }
.pl-seg button.on { background: var(--portal-bg-card, #fefefe); color: var(--portal-text, #0f172a); box-shadow: 0 1px 3px rgba(15,23,42,.12); cursor: default }
.pl-seg button:first-child.on { color: #b91c1c }
.pl-lado-tit { font-size: 11px; letter-spacing: .6px; text-transform: uppercase; color: var(--portal-text-muted, #94a3b8); margin-bottom: -4px }
.pl-lado .pl-cxs { grid-template-columns: 1fr; gap: 6px }
.pl-lado .pl-acao { border: 1px solid var(--portal-border, #eef2f7); border-radius: 12px; padding: 10px 12px; min-height: 46px; font-size: 13.5px; transition: border-color .12s, background .12s }
.pl-lado .pl-acao:hover:not(:disabled) { border-color: #cbd5e1; background: var(--portal-bg-card, #fefefe) }
.pl-lado .pl-acao.on { border-color: #fecaca; background: #fef2f2; color: #7f1d1d }
.pl-dentro.so-estreito { display: none }

@container (max-width: 760px) {
  .pl-duas { grid-template-columns: minmax(0, 1fr) } .pl-lado { display: none } .pl-dentro.so-estreito { display: block }
  .modo-pilulas .pl-cab { grid-template-columns: auto minmax(0, 1fr) } .modo-pilulas .pl-pills, .modo-pilulas .pl-cab > .pl-so { grid-column: 2 }
  .pl-dentro { padding-left: 12px }
}
@container (max-width: 480px) { .pl-busca { max-width: none; flex-basis: 100% } .pl-filtros { width: 100%; justify-content: space-between } .pl-filtros button { padding: 6px 9px } }
`;
