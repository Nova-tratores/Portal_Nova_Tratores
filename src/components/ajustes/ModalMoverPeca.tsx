'use client';
// Modal "definir a posição física de UMA peça" (Prateleira / Andar / Caixa) + aviso
// de posição ocupada. Saiu de /ajustes/localizacao (01/10/2026) para ser usado
// também pelo painel "A alocar" de /ajustes/caracteristicas. Não grava nada: devolve
// a posição e os ocupantes a liberar; quem chama faz o POST /api/ajustes/localizacao.
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { authHeaders } from '@/lib/auth/client';
import { casarValorPermitido, chaveProd, cmpSeg, labelSeg, ocupantesDe, posDe, type Pos, type ProdutoLoc } from '@/lib/ajustes/posicao';

type OpcoesLocacao = Record<keyof Pos, string[]>;

// Opções da Omie (lista fixa de Prateleira/Andar/Caixa por empresa), lidas uma vez
// por carregamento da página e compartilhadas entre os modais.
let opcoesCache: Promise<Record<string, OpcoesLocacao> | null> | null = null;
function carregarOpcoes(): Promise<Record<string, OpcoesLocacao> | null> {
  if (!opcoesCache) {
    opcoesCache = (async () => {
      try {
        const r = await fetch('/api/ajustes/localizacao/opcoes', { headers: { ...(await authHeaders()) } });
        const d = await r.json().catch(() => ({}));
        if (!r.ok || !d.porEmpresa) throw new Error(d.erro || `Falha (${r.status})`);
        return d.porEmpresa as Record<string, OpcoesLocacao>;
      } catch (e) {
        console.warn('[ModalMover] opções da Omie indisponíveis:', (e as Error).message);
        opcoesCache = null; // tenta de novo no próximo modal
        return null;
      }
    })();
  }
  return opcoesCache;
}

const box: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10 };
const btn: React.CSSProperties = { border: '1px solid #cbd5e1', background: '#fff', borderRadius: 8, padding: '8px 12px', fontSize: '.8rem', cursor: 'pointer', color: '#334155', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 };
const btnPrim: React.CSSProperties = { ...btn, background: '#1d4ed8', color: '#fff', border: '1px solid #1d4ed8' };
const modalWrap: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 12 };
const modalCard: React.CSSProperties = { ...box, width: 'min(560px, 96vw)', maxHeight: '90vh', overflow: 'auto', padding: 16 };

// aviso de destino ocupado (avisar e deixar decidir): liberar todos ou manter (conflito)
export function AvisoOcupado({ ocupantes, liberar, setLiberar }: { ocupantes: ProdutoLoc[]; liberar: boolean; setLiberar: (v: boolean) => void }) {
  if (ocupantes.length === 0) return null;
  return (
    <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: 10, marginTop: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#b45309', fontWeight: 700, fontSize: '.8rem' }}>
        <AlertTriangle size={15} /> Posição já ocupada por {ocupantes.length} peça(s)
      </div>
      <ul style={{ margin: '6px 0 8px', paddingLeft: 22, color: '#475569', fontSize: '.76rem' }}>
        {ocupantes.slice(0, 6).map((o) => <li key={chaveProd(o)}>{o.codigo || o.codigo_produto} — {o.descricao || ''}</li>)}
        {ocupantes.length > 6 && <li>… +{ocupantes.length - 6}</li>}
      </ul>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.78rem', color: '#334155', cursor: 'pointer' }}>
        <input type="checkbox" checked={liberar} onChange={(e) => setLiberar(e.target.checked)} />
        Liberar a(s) peça(s) atual(is) desta posição (fica só a nova)
      </label>
      {!liberar && <div style={{ color: '#b45309', fontSize: '.72rem', marginTop: 4 }}>Sem marcar, a posição fica com <b>conflito</b> (mais de uma peça).</div>}
    </div>
  );
}

export function Campo({ rotulo, v, set, list }: { rotulo: string; v: string; set: (s: string) => void; list: string }) {
  return (
    <label style={{ fontSize: '.72rem', color: '#64748b', fontWeight: 600 }}>
      {rotulo}
      <input value={v} onChange={(e) => set(e.target.value)} list={list}
        style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: 8, padding: '8px 10px', fontSize: '.9rem', marginTop: 3, fontWeight: 500, color: '#0f172a' }} />
    </label>
  );
}

// Campo com as opções da Omie (a locação é lista fixa lá). Valor atual fora da lista
// aparece marcado para a pessoa trocar.
function CampoLista({ rotulo, v, set, opcoes }: { rotulo: string; v: string; set: (s: string) => void; opcoes: string[] }) {
  const foraDaLista = v.trim() !== '' && !opcoes.includes(v);
  return (
    <label style={{ fontSize: '.72rem', color: '#64748b', fontWeight: 600 }}>
      {rotulo}
      <select value={v} onChange={(e) => set(e.target.value)}
        style={{ width: '100%', border: `1px solid ${foraDaLista ? '#f87171' : '#cbd5e1'}`, borderRadius: 8, padding: '8px 10px', fontSize: '.9rem', marginTop: 3, fontWeight: 500, color: '#0f172a', background: '#fff' }}>
        <option value="">— vazio —</option>
        {foraDaLista && <option value={v}>{v} (não existe na Omie)</option>}
        {opcoes.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

// Mover ESTE produto para uma posição digitada
export function ModalMover({ produto, produtosEmpresa, salvando, onCancelar, onConfirmar, titulo = 'Mover peça', rotuloConfirmar = 'Mover para cá', nota }: {
  produto: ProdutoLoc; produtosEmpresa: ProdutoLoc[]; salvando: boolean;
  onCancelar: () => void; onConfirmar: (target: ProdutoLoc, pos: Pos, liberar: ProdutoLoc[]) => void;
  /** textos do painel "A alocar" (padrão = os da tela de Localização) */
  titulo?: string; rotuloConfirmar?: string; nota?: React.ReactNode;
}) {
  const atual = posDe(produto);
  const [prat, setPrat] = useState(atual.prat);
  const [andar, setAndar] = useState(atual.andar);
  const [caixa, setCaixa] = useState(atual.caixa);
  const [liberar, setLiberar] = useState(false);
  // opções da Omie desta empresa: undefined = carregando, null = indisponível (texto livre)
  const [opcoes, setOpcoes] = useState<OpcoesLocacao | null | undefined>(undefined);
  useEffect(() => {
    let vivo = true;
    carregarOpcoes().then((todas) => {
      if (!vivo) return;
      const da = todas ? todas[String(produto.empresa).toUpperCase()] : undefined;
      const lista = da && (da.prat.length || da.andar.length || da.caixa.length)
        ? { prat: [...da.prat].sort(cmpSeg), andar: [...da.andar].sort(cmpSeg), caixa: [...da.caixa].sort(cmpSeg) }
        : null;
      setOpcoes(lista);
      if (lista) {
        // valor salvo com outra grafia ("h", "4") já aparece com a da lista ("H", "04")
        setPrat((x) => casarValorPermitido(x, lista.prat) ?? x);
        setAndar((x) => casarValorPermitido(x, lista.andar) ?? x);
        setCaixa((x) => casarValorPermitido(x, lista.caixa) ?? x);
      }
    });
    return () => { vivo = false; };
  }, [produto.empresa]);
  // sugestões (datalist) a partir dos valores existentes
  const sugP = useMemo(() => Array.from(new Set(produtosEmpresa.map((p) => posDe(p).prat).filter(Boolean))).sort(cmpSeg), [produtosEmpresa]);
  const sugA = useMemo(() => Array.from(new Set(produtosEmpresa.map((p) => posDe(p).andar).filter(Boolean))).sort(cmpSeg), [produtosEmpresa]);
  const sugC = useMemo(() => Array.from(new Set(produtosEmpresa.map((p) => posDe(p).caixa).filter(Boolean))).sort(cmpSeg), [produtosEmpresa]);
  const pos: Pos = { prat: prat.trim(), andar: andar.trim(), caixa: caixa.trim() };
  const ocupantes = ocupantesDe(produtosEmpresa, pos, chaveProd(produto));
  const vazio = !pos.prat && !pos.andar && !pos.caixa;

  return (
    <div style={modalWrap} onClick={onCancelar}>
      <div className="est-touch" style={modalCard} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>{titulo}</h2>
          <button onClick={onCancelar} style={{ ...btn, marginLeft: 'auto', padding: 6 }}><X size={16} /></button>
        </div>
        <div style={{ color: '#334155', fontSize: '.82rem', marginBottom: 4 }}><b>{produto.codigo || produto.codigo_produto}</b> — {produto.descricao || ''}</div>
        <div style={{ color: '#94a3b8', fontSize: '.74rem', marginBottom: 10 }}>Empresa {produto.empresa} · atual: {labelSeg(atual.prat)} · {labelSeg(atual.andar)} · {labelSeg(atual.caixa)}</div>
        {nota && <div style={{ color: '#475569', fontSize: '.76rem', marginBottom: 10 }}>{nota}</div>}
        <datalist id="sug-prat">{sugP.map((v) => <option key={v} value={v} />)}</datalist>
        <datalist id="sug-andar">{sugA.map((v) => <option key={v} value={v} />)}</datalist>
        <datalist id="sug-caixa">{sugC.map((v) => <option key={v} value={v} />)}</datalist>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
          {opcoes ? (<>
            <CampoLista rotulo="Prateleira" v={prat} set={setPrat} opcoes={opcoes.prat} />
            <CampoLista rotulo="Andar" v={andar} set={setAndar} opcoes={opcoes.andar} />
            <CampoLista rotulo="Caixa" v={caixa} set={setCaixa} opcoes={opcoes.caixa} />
          </>) : (<>
            <Campo rotulo="Prateleira" v={prat} set={setPrat} list="sug-prat" />
            <Campo rotulo="Andar" v={andar} set={setAndar} list="sug-andar" />
            <Campo rotulo="Caixa" v={caixa} set={setCaixa} list="sug-caixa" />
          </>)}
        </div>
        {opcoes === undefined && <div style={{ color: '#94a3b8', fontSize: '.72rem', marginTop: 6 }}>Carregando as opções da Omie…</div>}
        {opcoes === null && <div style={{ color: '#b45309', fontSize: '.72rem', marginTop: 6 }}>Não deu para ler as opções da Omie agora: digite (o sistema confere antes de gravar).</div>}
        <AvisoOcupado ocupantes={ocupantes} liberar={liberar} setLiberar={setLiberar} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
          <button onClick={onCancelar} style={btn}>Cancelar</button>
          <button disabled={salvando || vazio || opcoes === undefined} onClick={() => onConfirmar(produto, pos, liberar ? ocupantes : [])}
            style={{ ...btnPrim, opacity: salvando || vazio || opcoes === undefined ? .6 : 1 }}>{salvando ? 'Gravando…' : rotuloConfirmar}</button>
        </div>
      </div>
    </div>
  );
}
