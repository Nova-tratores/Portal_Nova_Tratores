'use client';
// Visão por Localização física (Feature A). Navega o estoque agrupado por
// posição — Prateleira → Andar → Caixa — lendo as características #PRATELEIRA /
// #ANDAR / #CAIXA (+ #ANDAR2/#CAIXA2, encoding alternativo raro) do JSONB da
// matriz (mesma fonte de /ajustes/caracteristicas: GET /api/ajustes/caracteristicas).
// Ações: "Trocar/Colocar produto" numa posição e "Mover"/"Remover" um produto.
// Escrita via POST /api/ajustes/localizacao (grava Omie + espelho + audit).
// Regra desejada: 1 produto por posição — posições com >1 ganham selo "conflito".
// Touch-first (tablet): sem draggable, alvos grandes.
import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import SemPermissao from '@/components/SemPermissao';
import { authHeaders } from '@/lib/auth/client';
import { ChevronRight, ChevronDown, MapPin, AlertTriangle, Search, ArrowRightLeft, X, PackageOpen, Trash2, Plus, Tag, CheckCircle, ClipboardCheck } from 'lucide-react';

// ---------- tipos ----------
interface Produto {
  empresa: string; codigo_produto: number | string; codigo?: string; descricao?: string;
  modelo?: string; marca?: string; estoque?: number;
  caracteristicas?: Record<string, string>;
}
interface Pos { prat: string; andar: string; caixa: string }

// ---------- helpers ----------
function norm(s: string): string { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase(); }
// lê uma característica pelo nome canônico, sem se importar com casing/acento
function getCar(car: Record<string, string> | undefined, canon: string): string {
  if (!car) return '';
  const alvo = norm(canon);
  for (const k of Object.keys(car)) if (norm(k) === alvo) return String(car[k] ?? '');
  return '';
}
// posição efetiva da peça (coalesce das secundárias raras)
function posDe(p: Produto): Pos & { temLoc: boolean } {
  const car = p.caracteristicas;
  const prat = getCar(car, '#PRATELEIRA').trim();
  const andar = (getCar(car, '#ANDAR') || getCar(car, '#ANDAR2')).trim();
  const caixa = (getCar(car, '#CAIXA') || getCar(car, '#CAIXA2')).trim();
  return { prat, andar, caixa, temLoc: !!(prat || andar || caixa) };
}
function chaveProd(p: { empresa: string; codigo_produto: number | string }): string { return `${p.empresa}|${p.codigo_produto}`; }
function labelSeg(v: string): string { return v.trim() === '' ? '—' : v; }
// ordena segmentos: vazio ('—') por último, resto numérico-aware
function cmpSeg(a: string, b: string): number {
  const ae = a.trim() === '', be = b.trim() === '';
  if (ae && be) return 0;
  if (ae) return 1;
  if (be) return -1;
  return a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' });
}

// remove todas as chaves de localização (qualquer casing) do objeto de características
function limparLocKeys(car: Record<string, string>): Record<string, string> {
  const alvo = new Set(['#prateleira', '#andar', '#caixa', '#andar2', '#caixa2']);
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(car)) if (!alvo.has(norm(k))) out[k] = v;
  return out;
}

const box: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10 };
const btn: React.CSSProperties = { border: '1px solid #cbd5e1', background: '#fff', borderRadius: 8, padding: '8px 12px', fontSize: '.8rem', cursor: 'pointer', color: '#334155', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 };
const btnPrim: React.CSSProperties = { ...btn, background: '#1d4ed8', color: '#fff', border: '1px solid #1d4ed8' };

// ============================================================================
export default function LocalizacaoPage() {
  const { userProfile } = useAuth();
  const { pode, loading: permLoading } = usePermissoes(userProfile?.id);

  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [empresas, setEmpresas] = useState<string[]>([]);
  const [empresa, setEmpresa] = useState<string>('');
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [abertos, setAbertos] = useState<Set<string>>(new Set());

  // modais de escrita
  const [mover, setMover] = useState<Produto | null>(null);          // mover ESTE produto
  const [colocar, setColocar] = useState<Pos | null>(null);          // colocar/trocar produto NESTA posição
  const [salvando, setSalvando] = useState(false);

  // "Conferir por posição": marca própria de localização (localizacao_conferida)
  const [conferidas, setConferidas] = useState<Map<string, { status: 'conferido' | 'divergente'; nome?: string }>>(new Map());
  const [abrirConferir, setAbrirConferir] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro(null);
    try {
      const r = await fetch('/api/ajustes/caracteristicas', { headers: { ...(await authHeaders()) } });
      const d = await r.json();
      if (d.erro) throw new Error(d.erro);
      const ps: Produto[] = d.produtos || [];
      setProdutos(ps);
      const emps = Array.from(new Set(ps.map((p) => String(p.empresa)))).sort();
      setEmpresas(emps);
      setEmpresa((e) => e || emps[0] || '');
    } catch (e) { setErro((e as Error).message); }
    finally { setCarregando(false); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  // carrega as conferências (compartilhadas) no mount
  const carregarConferidas = useCallback(async () => {
    try {
      const r = await fetch('/api/ajustes/localizacao/conferir', { headers: { ...(await authHeaders()) } });
      const d = await r.json();
      if (Array.isArray(d.conferidas)) {
        const m = new Map<string, { status: 'conferido' | 'divergente'; nome?: string }>();
        for (const c of d.conferidas) m.set(`${c.empresa}|${c.codigo_produto}`, { status: c.status, nome: c.conferido_nome });
        setConferidas(m);
      }
    } catch { /* silencioso — a tela funciona sem os selos */ }
  }, []);
  useEffect(() => { carregarConferidas(); }, [carregarConferidas]);

  const podeEditar = pode('ajustes', 'localizacao');
  const [flash, setFlash] = useState<string | null>(null);

  const statusConf = useCallback((p: Produto): 'conferido' | 'divergente' | null => conferidas.get(chaveProd(p))?.status ?? null, [conferidas]);

  // grava ✓/⚠ (ou limpa, se clicar de novo no mesmo) — otimista + POST.
  async function marcarConferencia(p: Produto, status: 'conferido' | 'divergente') {
    const key = chaveProd(p);
    const atual = conferidas.get(key)?.status;
    const novo: 'conferido' | 'divergente' | null = atual === status ? null : status;
    setConferidas((prev) => {
      const m = new Map(prev);
      if (novo) m.set(key, { status: novo, nome: userProfile?.nome }); else m.delete(key);
      return m;
    });
    try {
      const { prat, andar, caixa } = posDe(p);
      await fetch('/api/ajustes/localizacao/conferir', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ empresa: p.empresa, codigo_produto: p.codigo_produto, status: novo, posicao: `${prat}|${andar}|${caixa}` }),
      });
    } catch { carregarConferidas(); }
  }

  // adiciona a peça à FILA COMPARTILHADA de etiquetas (aba Etiquetas do /ppv).
  // Monta a linha no mesmo formato do EtiquetasPanel (conta/empresa/codigo/descricao/locacao).
  async function addEtiqueta(p: Produto) {
    const EMPRESA_LABEL: Record<string, string> = { NOVA: 'NOVA TRATORES', CASTRO: 'CASTRO PEÇAS' };
    const ordem = ['#PRATELEIRA', '#ANDAR', '#CAIXA'];
    const pares: string[] = [];
    for (const k of ordem) {
      const v = getCar(p.caracteristicas, k).trim();
      if (v && !/^0+$/.test(v) && !/^x+$/i.test(v)) pares.push(`${k.slice(1)} ${v}`);
    }
    const linha = {
      conta: p.empresa,
      empresa: EMPRESA_LABEL[p.empresa] || p.empresa,
      codigo: p.codigo || String(p.codigo_produto),
      descricao: (p.descricao || '').trim(),
      locacao: pares.join(' · '),
    };
    try {
      const r = await fetch('/api/ppv/etiquetas/fila', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ linhas: [linha], copias: 1 }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.erro) throw new Error(d.erro || 'falha');
      setFlash(`Etiqueta na fila: ${linha.codigo}`);
      setTimeout(() => setFlash(null), 2200);
    } catch (e) { alert('Erro ao adicionar à fila: ' + (e as Error).message); }
  }

  // produtos da empresa selecionada
  const daEmpresa = useMemo(() => produtos.filter((p) => String(p.empresa) === empresa), [produtos, empresa]);

  // separa localizados / sem localização; monta árvore prat→andar→caixa
  const { arvore, semLoc, totalLoc, totalConflitos, totalPosicoes } = useMemo(() => {
    const comLoc: Produto[] = []; const sem: Produto[] = [];
    for (const p of daEmpresa) (posDe(p).temLoc ? comLoc : sem).push(p);
    // Map<prat, Map<andar, Map<caixa, Produto[]>>>
    const tree = new Map<string, Map<string, Map<string, Produto[]>>>();
    let conflitos = 0, posicoes = 0;
    for (const p of comLoc) {
      const { prat, andar, caixa } = posDe(p);
      let ma = tree.get(prat); if (!ma) tree.set(prat, ma = new Map());
      let mc = ma.get(andar); if (!mc) ma.set(andar, mc = new Map());
      let arr = mc.get(caixa); if (!arr) mc.set(caixa, arr = []);
      arr.push(p);
    }
    // conta posições/conflitos
    for (const ma of tree.values()) for (const mc of ma.values()) for (const arr of mc.values()) {
      posicoes++; if (arr.length > 1) conflitos++;
    }
    return { arvore: tree, semLoc: sem, totalLoc: comLoc.length, totalConflitos: conflitos, totalPosicoes: posicoes };
  }, [daEmpresa]);

  // filtro de busca (código / descrição / localização)
  const termo = norm(busca);
  const casa = useCallback((p: Produto): boolean => {
    if (!termo) return true;
    const { prat, andar, caixa } = posDe(p);
    const alvo = `${p.codigo || ''} ${p.descricao || ''} ${prat} ${andar} ${caixa}`;
    return norm(alvo).includes(termo);
  }, [termo]);

  // segmentos ordenados, aplicando busca (mantém posição se algum produto casa)
  const prateleiras = useMemo(() => {
    const keys = Array.from(arvore.keys());
    if (termo) {
      return keys.filter((prat) => {
        for (const mc of arvore.get(prat)!.values()) for (const arr of mc.values()) if (arr.some(casa)) return true;
        return false;
      }).sort(cmpSeg);
    }
    return keys.sort(cmpSeg);
  }, [arvore, termo, casa]);

  // lista ordenada de posições (folhas), na mesma ordem da árvore e respeitando a
  // busca — é o "deck" do Conferir por posição.
  const deckPosicoes = useMemo(() => {
    const out: Pos[] = [];
    for (const prat of Array.from(arvore.keys()).sort(cmpSeg))
      for (const andar of Array.from(arvore.get(prat)!.keys()).sort(cmpSeg))
        for (const caixa of Array.from(arvore.get(prat)!.get(andar)!.keys()).sort(cmpSeg)) {
          const arr = arvore.get(prat)!.get(andar)!.get(caixa)!;
          if (termo && !arr.some(casa)) continue;
          out.push({ prat, andar, caixa });
        }
    return out;
  }, [arvore, termo, casa]);

  function toggle(k: string) { setAbertos((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; }); }
  // ao buscar, abre tudo que casa
  const buscando = termo.length > 0;
  const estaAberto = (k: string) => buscando || abertos.has(k);

  // ---------- escrita ----------
  // aplica localização localmente (otimista) — usa chaves canônicas
  function aplicarLocalOtimista(alvos: Array<{ empresa: string; codigo_produto: number | string }>, pos: Pos | null) {
    setProdutos((prev) => prev.map((p) => {
      const alvo = alvos.find((a) => chaveProd(a) === chaveProd(p));
      if (!alvo) return p;
      const car = limparLocKeys(p.caracteristicas || {});
      if (pos) { car['#PRATELEIRA'] = pos.prat; car['#ANDAR'] = pos.andar; car['#CAIXA'] = pos.caixa; }
      return { ...p, caracteristicas: car };
    }));
  }

  async function postLoc(body: Record<string, unknown>): Promise<void> {
    const r = await fetch('/api/ajustes/localizacao', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify(body),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.erro) throw new Error(d.erro || `Falha (${r.status})`);
  }

  // define a posição de UM produto, liberando ocupantes anteriores (se houver)
  async function definir(target: Produto, pos: Pos, liberar: Produto[]) {
    setSalvando(true);
    try {
      await postLoc({
        acao: 'definir', empresa: target.empresa, codigo_produto: target.codigo_produto,
        prateleira: pos.prat, andar: pos.andar, caixa: pos.caixa,
        liberar: liberar.map((p) => ({ empresa: p.empresa, codigo_produto: p.codigo_produto })),
      });
      aplicarLocalOtimista(liberar, null);
      aplicarLocalOtimista([target], pos);
      setMover(null); setColocar(null);
    } catch (e) { alert('Erro ao gravar: ' + (e as Error).message); }
    finally { setSalvando(false); }
  }
  async function remover(target: Produto) {
    if (!confirm(`Remover ${target.codigo || target.codigo_produto} da posição? (limpa a localização na Omie)`)) return;
    setSalvando(true);
    try {
      await postLoc({ acao: 'liberar', empresa: target.empresa, codigo_produto: target.codigo_produto });
      aplicarLocalOtimista([target], null);
    } catch (e) { alert('Erro: ' + (e as Error).message); }
    finally { setSalvando(false); }
  }

  // ---------- render ----------
  if (!permLoading && userProfile && !pode('ajustes', 'localizacao')) return <SemPermissao />;

  return (
    <div style={{ padding: 16, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <MapPin size={22} color="#1d4ed8" />
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>Localização física</h1>
      </div>
      <p style={{ color: '#64748b', fontSize: '.8rem', margin: '0 0 12px' }}>
        Estoque por posição (Prateleira → Andar → Caixa). Baseado nas características{' '}
        <Link href="/ajustes/caracteristicas" style={{ color: '#1d4ed8' }}>#Prateleira / #Andar / #Caixa</Link>.
        Regra: <b>1 produto por posição</b> — posições com mais ganham selo <span style={{ color: '#b45309' }}>conflito</span>.
      </p>

      {/* barra: empresa + busca + resumo */}
      <div style={{ ...box, padding: 12, marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {empresas.map((e) => (
            <button key={e} onClick={() => setEmpresa(e)}
              style={{ ...btn, padding: '8px 14px', background: e === empresa ? '#1d4ed8' : '#fff', color: e === empresa ? '#fff' : '#334155', borderColor: e === empresa ? '#1d4ed8' : '#cbd5e1' }}>
              {e}
            </button>
          ))}
        </div>
        <div style={{ position: 'relative', flex: '1 1 220px' }}>
          <Search size={15} color="#94a3b8" style={{ position: 'absolute', left: 10, top: 10 }} />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar código, descrição ou localização (ex.: PRATELEIRA 6, 9 D 02)"
            style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: 8, padding: '8px 10px 8px 32px', fontSize: '.82rem' }} />
        </div>
        <button onClick={() => setAbrirConferir(true)} title="Conferir posição por posição (flashcard)"
          style={{ ...btnPrim, background: '#16a34a', border: '1px solid #16a34a' }}>
          <ClipboardCheck size={15} /> Conferir
        </button>
      </div>

      {carregando && <div style={{ color: '#64748b', padding: 20 }}>Carregando matriz…</div>}
      {erro && <div style={{ color: '#b91c1c', padding: 12, background: '#fef2f2', borderRadius: 8 }}>{erro}</div>}

      {!carregando && !erro && (
        <>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 10, fontSize: '.78rem', color: '#475569' }}>
            <span><b>{totalLoc}</b> peças localizadas</span>
            <span><b>{totalPosicoes}</b> posições</span>
            <span style={{ color: totalConflitos ? '#b45309' : '#475569' }}><b>{totalConflitos}</b> conflitos</span>
            <span><b>{semLoc.length}</b> sem localização</span>
          </div>

          {/* árvore */}
          <div style={{ ...box, overflow: 'hidden' }}>
            {prateleiras.length === 0 && <div style={{ padding: 20, color: '#94a3b8' }}>Nenhuma posição encontrada.</div>}
            {prateleiras.map((prat) => {
              const kP = `P|${prat}`;
              const andares = Array.from(arvore.get(prat)!.keys()).sort(cmpSeg);
              // contagem de peças da prateleira (respeitando busca)
              let nPecas = 0; for (const mc of arvore.get(prat)!.values()) for (const arr of mc.values()) nPecas += arr.filter(casa).length;
              if (buscando && nPecas === 0) return null;
              return (
                <div key={kP} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <button onClick={() => toggle(kP)} style={{ ...linhaBtn, background: '#f8fafc', fontWeight: 700 }}>
                    {estaAberto(kP) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    <span style={{ color: '#1d4ed8' }}>Prateleira {labelSeg(prat)}</span>
                    <span style={{ marginLeft: 'auto', color: '#94a3b8', fontSize: '.72rem', fontWeight: 500 }}>{nPecas} peça(s)</span>
                  </button>
                  {estaAberto(kP) && andares.map((andar) => {
                    const kA = `${kP}|A|${andar}`;
                    const caixas = Array.from(arvore.get(prat)!.get(andar)!.keys()).sort(cmpSeg);
                    let nA = 0; for (const arr of arvore.get(prat)!.get(andar)!.values()) nA += arr.filter(casa).length;
                    if (buscando && nA === 0) return null;
                    return (
                      <div key={kA} style={{ paddingLeft: 18 }}>
                        <button onClick={() => toggle(kA)} style={{ ...linhaBtn, fontWeight: 600, color: '#334155' }}>
                          {estaAberto(kA) ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                          Andar {labelSeg(andar)}
                          <span style={{ marginLeft: 'auto', color: '#94a3b8', fontSize: '.72rem', fontWeight: 500 }}>{nA} peça(s)</span>
                        </button>
                        {estaAberto(kA) && caixas.map((caixa) => {
                          const arr = arvore.get(prat)!.get(andar)!.get(caixa)!;
                          const visiveis = arr.filter(casa);
                          if (buscando && visiveis.length === 0) return null;
                          const conflito = arr.length > 1;
                          const pos: Pos = { prat, andar, caixa };
                          return (
                            <div key={`${kA}|C|${caixa}`} style={{ paddingLeft: 20, paddingRight: 10, paddingBottom: 8, borderTop: '1px solid #f8fafc' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0 4px' }}>
                                <span style={{ fontWeight: 600, color: '#0f172a', fontSize: '.82rem' }}>Caixa {labelSeg(caixa)}</span>
                                {conflito && (
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a', borderRadius: 999, padding: '1px 8px', fontSize: '.68rem', fontWeight: 700 }}>
                                    <AlertTriangle size={12} /> conflito · {arr.length}
                                  </span>
                                )}
                                {podeEditar && (
                                  <button onClick={() => setColocar(pos)} style={{ ...btn, marginLeft: 'auto', padding: '5px 10px', fontSize: '.72rem' }}>
                                    <Plus size={13} /> Colocar / trocar
                                  </button>
                                )}
                              </div>
                              {visiveis.map((p) => (
                                <div key={chaveProd(p)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', background: '#fff', border: '1px solid #eef2f7', borderRadius: 8, marginBottom: 4 }}>
                                  <PackageOpen size={15} color="#94a3b8" />
                                  <div style={{ minWidth: 0 }}>
                                    <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '.8rem' }}>{p.codigo || p.codigo_produto}</div>
                                    <div style={{ color: '#64748b', fontSize: '.72rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 520 }}>{p.descricao || '—'}</div>
                                  </div>
                                  {statusConf(p) && (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '1px 7px', borderRadius: 999, fontSize: '.66rem', fontWeight: 700,
                                      background: statusConf(p) === 'conferido' ? '#dcfce7' : '#ffedd5', color: statusConf(p) === 'conferido' ? '#16a34a' : '#c2410c' }}>
                                      {statusConf(p) === 'conferido' ? <CheckCircle size={11} /> : <AlertTriangle size={11} />}
                                      {statusConf(p) === 'conferido' ? 'conferido' : 'não bate'}
                                    </span>
                                  )}
                                  <span style={{ marginLeft: 'auto', color: '#94a3b8', fontSize: '.72rem' }}>estq {p.estoque ?? 0}</span>
                                  <button title="Adicionar à fila de etiquetas" onClick={() => addEtiqueta(p)} style={{ ...btn, padding: '5px 8px' }}><Tag size={14} /></button>
                                  {podeEditar && <>
                                    <button title="Mover para outra posição" onClick={() => setMover(p)} style={{ ...btn, padding: '5px 8px' }}><ArrowRightLeft size={14} /></button>
                                    <button title="Remover da posição" onClick={() => remover(p)} style={{ ...btn, padding: '5px 8px', color: '#b91c1c', borderColor: '#fecaca' }}><Trash2 size={14} /></button>
                                  </>}
                                </div>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* sem localização */}
          <SemLocalizacao itens={semLoc} termo={termo} casa={casa} podeEditar={podeEditar} onDefinir={(p) => setMover(p)} />
        </>
      )}

      {flash && (
        <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: '#0f172a', color: '#fff', padding: '10px 16px', borderRadius: 10, fontSize: '.82rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, zIndex: 60, boxShadow: '0 6px 20px rgba(0,0,0,.25)' }}>
          <Tag size={15} /> {flash}
        </div>
      )}

      {mover && (
        <ModalMover produto={mover} produtosEmpresa={daEmpresa} salvando={salvando}
          onCancelar={() => setMover(null)} onConfirmar={definir} />
      )}
      {colocar && (
        <ModalColocar posicao={colocar} produtosEmpresa={daEmpresa} salvando={salvando}
          onCancelar={() => setColocar(null)} onConfirmar={definir} />
      )}
      {abrirConferir && (
        <ModalConferirPosicao deck={deckPosicoes} daEmpresa={daEmpresa} conferidas={conferidas}
          onMarcar={marcarConferencia} onTrocar={setColocar} onEtiqueta={addEtiqueta}
          onClose={() => setAbrirConferir(false)} />
      )}
    </div>
  );
}

const linhaBtn: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', border: 'none', background: 'transparent', padding: '10px 12px', cursor: 'pointer', fontSize: '.84rem', color: '#0f172a' };

// ---------------------------------------------------------------------------
// Sem localização (lista grande — capada + busca)
function SemLocalizacao({ itens, termo, casa, podeEditar, onDefinir }: {
  itens: Produto[]; termo: string; casa: (p: Produto) => boolean; podeEditar: boolean; onDefinir: (p: Produto) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const TETO = 200;
  const filtrados = useMemo(() => (termo ? itens.filter(casa) : itens), [itens, termo, casa]);
  const mostra = filtrados.slice(0, TETO);
  return (
    <div style={{ ...box, marginTop: 12, overflow: 'hidden' }}>
      <button onClick={() => setAberto((v) => !v)} style={{ ...linhaBtn, background: '#f8fafc', fontWeight: 700 }}>
        {aberto ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        Sem localização
        <span style={{ marginLeft: 'auto', color: '#94a3b8', fontSize: '.72rem', fontWeight: 500 }}>{filtrados.length} peça(s)</span>
      </button>
      {aberto && (
        <div style={{ padding: 10 }}>
          {mostra.map((p) => (
            <div key={chaveProd(p)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderBottom: '1px solid #f1f5f9' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '.8rem' }}>{p.codigo || p.codigo_produto}</div>
                <div style={{ color: '#64748b', fontSize: '.72rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 560 }}>{p.descricao || '—'}</div>
              </div>
              {podeEditar && <button onClick={() => onDefinir(p)} style={{ ...btn, marginLeft: 'auto', padding: '5px 10px', fontSize: '.72rem' }}><MapPin size={13} /> Definir</button>}
            </div>
          ))}
          {filtrados.length > TETO && <div style={{ color: '#94a3b8', fontSize: '.72rem', padding: '8px 4px' }}>Mostrando {TETO} de {filtrados.length} — refine a busca.</div>}
          {filtrados.length === 0 && <div style={{ color: '#94a3b8', fontSize: '.78rem', padding: 8 }}>Nenhuma peça.</div>}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ocupantes de uma posição (exceto o próprio alvo), da empresa
function ocupantesDe(produtosEmpresa: Produto[], pos: Pos, excetoKey?: string): Produto[] {
  return produtosEmpresa.filter((p) => {
    if (excetoKey && chaveProd(p) === excetoKey) return false;
    const q = posDe(p);
    return q.prat === pos.prat.trim() && q.andar === pos.andar.trim() && q.caixa === pos.caixa.trim();
  });
}

// aviso de destino ocupado (avisar e deixar decidir): liberar todos ou manter (conflito)
function AvisoOcupado({ ocupantes, liberar, setLiberar }: { ocupantes: Produto[]; liberar: boolean; setLiberar: (v: boolean) => void }) {
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

const modalWrap: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 12 };
const modalCard: React.CSSProperties = { ...box, width: 'min(560px, 96vw)', maxHeight: '90vh', overflow: 'auto', padding: 16 };

// ---------------------------------------------------------------------------
// Conferir por posição (flashcard touch): percorre as posições em ordem, mostra
// a(s) peça(s) que deveriam estar ali e grava ✓ conferido / ⚠ não bate na
// `localizacao_conferida`. Ordem CONGELADA ao abrir; ocupantes FRESCOS (refletem
// movimentações feitas na conferência). z-index 45 → o "Trocar" (ModalColocar,
// z50) empilha por cima.
function ModalConferirPosicao({ deck, daEmpresa, conferidas, onMarcar, onTrocar, onEtiqueta, onClose }: {
  deck: Pos[];
  daEmpresa: Produto[];
  conferidas: Map<string, { status: 'conferido' | 'divergente'; nome?: string }>;
  onMarcar: (p: Produto, status: 'conferido' | 'divergente') => void;
  onTrocar: (pos: Pos) => void;
  onEtiqueta: (p: Produto) => void;
  onClose: () => void;
}) {
  const [ordem] = useState<Pos[]>(deck);          // ordem congelada ao abrir
  const [idx, setIdx] = useState(0);
  const total = ordem.length;
  const pos = total ? ordem[Math.min(idx, total - 1)] : null;
  const ocupantes = pos ? daEmpresa.filter((p) => { const q = posDe(p); return q.prat === pos.prat && q.andar === pos.andar && q.caixa === pos.caixa; }) : [];
  const ir = useCallback((d: number) => setIdx((i) => Math.max(0, Math.min(total - 1, i + d))), [total]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); else if (e.key === 'ArrowRight') ir(1); else if (e.key === 'ArrowLeft') ir(-1); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ir, onClose]);
  const naFrente = idx >= total - 1;
  const bigBtn: React.CSSProperties = { flex: 1, padding: '14px 12px', borderRadius: 12, fontSize: '1rem', fontWeight: 800, border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', zIndex: 45, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, width: 560, maxWidth: '96vw', maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 16px 50px rgba(0,0,0,.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid #e2e8f0' }}>
          <ClipboardCheck size={18} color="#16a34a" />
          <b style={{ fontSize: '.92rem', color: '#1e293b' }}>Conferir por posição</b>
          <span style={{ fontSize: '.78rem', color: '#64748b' }}>{Math.min(idx + 1, total)} / {total}</span>
          <button onClick={onClose} title="Fechar (Esc)" style={{ marginLeft: 'auto', background: 'none', border: 'none', fontSize: '1.5rem', color: '#94a3b8', cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ overflow: 'auto', padding: 16, flex: 1 }}>
          {!pos ? (
            <div style={{ color: '#94a3b8', textAlign: 'center', padding: '24px 0' }}>Nenhuma posição para conferir.</div>
          ) : (
            <>
              <div style={{ textAlign: 'center', marginBottom: 6 }}>
                <div style={{ fontSize: '.7rem', textTransform: 'uppercase', letterSpacing: '.5px', color: '#94a3b8' }}>Posição</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1d4ed8' }}>{labelSeg(pos.prat)} · {labelSeg(pos.andar)} · {labelSeg(pos.caixa)}</div>
                <div style={{ fontSize: '.72rem', color: '#64748b' }}>Prateleira · Andar · Caixa</div>
              </div>
              {ocupantes.length > 1 && (
                <div style={{ textAlign: 'center', marginBottom: 10 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a', borderRadius: 999, padding: '2px 10px', fontSize: '.72rem', fontWeight: 700 }}>
                    <AlertTriangle size={12} /> conflito · {ocupantes.length} peças nesta posição
                  </span>
                </div>
              )}
              {ocupantes.length === 0 && <div style={{ color: '#94a3b8', textAlign: 'center', padding: '10px 0' }}>Posição vazia (peça foi movida).</div>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {ocupantes.map((p) => {
                  const st = conferidas.get(chaveProd(p))?.status ?? null;
                  return (
                    <div key={chaveProd(p)} style={{ border: '1px solid #eef2f7', borderRadius: 12, padding: 12, background: st === 'conferido' ? '#f0fdf4' : st === 'divergente' ? '#fff7ed' : '#fff' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: '.62rem', fontWeight: 800, color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 4, padding: '1px 5px' }}>{p.empresa}</span>
                        <span style={{ fontWeight: 800, color: '#0f172a', fontSize: '1rem' }}>{p.codigo || p.codigo_produto}</span>
                        <span style={{ marginLeft: 'auto', color: '#94a3b8', fontSize: '.72rem' }}>estq {p.estoque ?? 0}</span>
                      </div>
                      <div style={{ color: '#475569', fontSize: '.85rem', margin: '4px 0 10px' }}>{p.descricao || '—'}</div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => onMarcar(p, 'conferido')} style={{ ...bigBtn, background: st === 'conferido' ? '#16a34a' : '#dcfce7', color: st === 'conferido' ? '#fff' : '#16a34a' }}>
                          <CheckCircle size={18} /> Confere
                        </button>
                        <button onClick={() => onMarcar(p, 'divergente')} style={{ ...bigBtn, background: st === 'divergente' ? '#ea580c' : '#ffedd5', color: st === 'divergente' ? '#fff' : '#c2410c' }}>
                          <AlertTriangle size={18} /> Não bate
                        </button>
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <button onClick={() => onTrocar(pos)} style={{ ...btn, flex: 1, justifyContent: 'center' }}><ArrowRightLeft size={14} /> Trocar/colocar</button>
                        <button onClick={() => onEtiqueta(p)} style={{ ...btn, flex: 1, justifyContent: 'center' }}><Tag size={14} /> Etiqueta</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderTop: '1px solid #e2e8f0' }}>
          <button onClick={() => ir(-1)} disabled={idx === 0} style={{ ...btn, padding: '12px 16px', opacity: idx === 0 ? 0.5 : 1 }}>‹ Anterior</button>
          <div style={{ flex: 1, textAlign: 'center', fontSize: '.8rem', color: '#64748b' }}>{Math.min(idx + 1, total)} de {total}</div>
          {naFrente
            ? <button onClick={onClose} style={{ ...btnPrim, padding: '12px 16px', background: '#16a34a', border: '1px solid #16a34a' }}>Concluir ✓</button>
            : <button onClick={() => ir(1)} style={{ ...btnPrim, padding: '12px 16px' }}>Próxima ›</button>}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mover ESTE produto para uma posição digitada
function ModalMover({ produto, produtosEmpresa, salvando, onCancelar, onConfirmar }: {
  produto: Produto; produtosEmpresa: Produto[]; salvando: boolean;
  onCancelar: () => void; onConfirmar: (target: Produto, pos: Pos, liberar: Produto[]) => void;
}) {
  const atual = posDe(produto);
  const [prat, setPrat] = useState(atual.prat);
  const [andar, setAndar] = useState(atual.andar);
  const [caixa, setCaixa] = useState(atual.caixa);
  const [liberar, setLiberar] = useState(false);
  // sugestões (datalist) a partir dos valores existentes
  const sugP = useMemo(() => Array.from(new Set(produtosEmpresa.map((p) => posDe(p).prat).filter(Boolean))).sort(cmpSeg), [produtosEmpresa]);
  const sugA = useMemo(() => Array.from(new Set(produtosEmpresa.map((p) => posDe(p).andar).filter(Boolean))).sort(cmpSeg), [produtosEmpresa]);
  const sugC = useMemo(() => Array.from(new Set(produtosEmpresa.map((p) => posDe(p).caixa).filter(Boolean))).sort(cmpSeg), [produtosEmpresa]);
  const pos: Pos = { prat: prat.trim(), andar: andar.trim(), caixa: caixa.trim() };
  const ocupantes = ocupantesDe(produtosEmpresa, pos, chaveProd(produto));
  const vazio = !pos.prat && !pos.andar && !pos.caixa;

  return (
    <div style={modalWrap} onClick={onCancelar}>
      <div style={modalCard} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>Mover peça</h2>
          <button onClick={onCancelar} style={{ ...btn, marginLeft: 'auto', padding: 6 }}><X size={16} /></button>
        </div>
        <div style={{ color: '#334155', fontSize: '.82rem', marginBottom: 4 }}><b>{produto.codigo || produto.codigo_produto}</b> — {produto.descricao || ''}</div>
        <div style={{ color: '#94a3b8', fontSize: '.74rem', marginBottom: 10 }}>Empresa {produto.empresa} · atual: {labelSeg(atual.prat)} · {labelSeg(atual.andar)} · {labelSeg(atual.caixa)}</div>
        <datalist id="sug-prat">{sugP.map((v) => <option key={v} value={v} />)}</datalist>
        <datalist id="sug-andar">{sugA.map((v) => <option key={v} value={v} />)}</datalist>
        <datalist id="sug-caixa">{sugC.map((v) => <option key={v} value={v} />)}</datalist>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <Campo rotulo="Prateleira" v={prat} set={setPrat} list="sug-prat" />
          <Campo rotulo="Andar" v={andar} set={setAndar} list="sug-andar" />
          <Campo rotulo="Caixa" v={caixa} set={setCaixa} list="sug-caixa" />
        </div>
        <AvisoOcupado ocupantes={ocupantes} liberar={liberar} setLiberar={setLiberar} />
        <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
          <button onClick={onCancelar} style={btn}>Cancelar</button>
          <button disabled={salvando || vazio} onClick={() => onConfirmar(produto, pos, liberar ? ocupantes : [])}
            style={{ ...btnPrim, opacity: salvando || vazio ? .6 : 1 }}>{salvando ? 'Gravando…' : 'Mover para cá'}</button>
        </div>
      </div>
    </div>
  );
}

// Colocar / trocar produto NESTA posição (escolhe a peça por busca)
function ModalColocar({ posicao, produtosEmpresa, salvando, onCancelar, onConfirmar }: {
  posicao: Pos; produtosEmpresa: Produto[]; salvando: boolean;
  onCancelar: () => void; onConfirmar: (target: Produto, pos: Pos, liberar: Produto[]) => void;
}) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Produto | null>(null);
  const [liberar, setLiberar] = useState(false);
  const termo = norm(q);
  const resultados = useMemo(() => {
    if (termo.length < 2) return [];
    return produtosEmpresa.filter((p) => norm(`${p.codigo || ''} ${p.descricao || ''}`).includes(termo)).slice(0, 40);
  }, [produtosEmpresa, termo]);
  // ocupantes atuais da posição (exceto o selecionado)
  const ocupantes = ocupantesDe(produtosEmpresa, posicao, sel ? chaveProd(sel) : undefined);

  return (
    <div style={modalWrap} onClick={onCancelar}>
      <div style={modalCard} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>Colocar peça na posição</h2>
          <button onClick={onCancelar} style={{ ...btn, marginLeft: 'auto', padding: 6 }}><X size={16} /></button>
        </div>
        <div style={{ color: '#94a3b8', fontSize: '.76rem', marginBottom: 10 }}>Posição: <b style={{ color: '#1d4ed8' }}>{labelSeg(posicao.prat)} · {labelSeg(posicao.andar)} · {labelSeg(posicao.caixa)}</b></div>
        {!sel ? (
          <>
            <div style={{ position: 'relative', marginBottom: 8 }}>
              <Search size={15} color="#94a3b8" style={{ position: 'absolute', left: 10, top: 10 }} />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar peça por código ou descrição…"
                style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: 8, padding: '8px 10px 8px 32px', fontSize: '.82rem' }} />
            </div>
            <div style={{ maxHeight: 300, overflow: 'auto' }}>
              {termo.length < 2 && <div style={{ color: '#94a3b8', fontSize: '.78rem', padding: 8 }}>Digite ao menos 2 letras.</div>}
              {termo.length >= 2 && resultados.length === 0 && <div style={{ color: '#94a3b8', fontSize: '.78rem', padding: 8 }}>Nada encontrado.</div>}
              {resultados.map((p) => {
                const q2 = posDe(p);
                return (
                  <button key={chaveProd(p)} onClick={() => setSel(p)} style={{ display: 'block', width: '100%', textAlign: 'left', border: '1px solid #eef2f7', background: '#fff', borderRadius: 8, padding: '8px 10px', marginBottom: 4, cursor: 'pointer' }}>
                    <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '.8rem' }}>{p.codigo || p.codigo_produto}</div>
                    <div style={{ color: '#64748b', fontSize: '.72rem' }}>{p.descricao || '—'}{q2.temLoc && <span style={{ color: '#b45309' }}> · já em {labelSeg(q2.prat)}·{labelSeg(q2.andar)}·{labelSeg(q2.caixa)}</span>}</div>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 10 }}>
              <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '.82rem' }}>{sel.codigo || sel.codigo_produto}</div>
              <div style={{ color: '#64748b', fontSize: '.74rem' }}>{sel.descricao || '—'}</div>
              <button onClick={() => { setSel(null); setLiberar(false); }} style={{ ...btn, marginTop: 8, padding: '4px 10px', fontSize: '.72rem' }}>Trocar peça</button>
            </div>
            <AvisoOcupado ocupantes={ocupantes} liberar={liberar} setLiberar={setLiberar} />
            <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
              <button onClick={onCancelar} style={btn}>Cancelar</button>
              <button disabled={salvando} onClick={() => onConfirmar(sel, posicao, liberar ? ocupantes : [])}
                style={{ ...btnPrim, opacity: salvando ? .6 : 1 }}>{salvando ? 'Gravando…' : 'Colocar aqui'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Campo({ rotulo, v, set, list }: { rotulo: string; v: string; set: (s: string) => void; list: string }) {
  return (
    <label style={{ fontSize: '.72rem', color: '#64748b', fontWeight: 600 }}>
      {rotulo}
      <input value={v} onChange={(e) => set(e.target.value)} list={list}
        style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: 8, padding: '8px 10px', fontSize: '.9rem', marginTop: 3, fontWeight: 500, color: '#0f172a' }} />
    </label>
  );
}
