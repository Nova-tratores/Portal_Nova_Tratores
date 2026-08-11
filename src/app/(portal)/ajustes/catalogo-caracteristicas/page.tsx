'use client';
// Preenche as características "Sistema" e "Sub-sistema" na Omie (conta NOVA) a
// partir do catálogo de peças. Pré-visualiza a proposta (SKU → Sistema/Sub),
// deixa filtrar/selecionar e aplica em massa reutilizando a rota existente
// /api/ajustes/caracteristicas/aplicar-tipo (throttle + bloqueio/retoma + mirror).
// Só propõe valores ÚNICOS por SKU; ambíguos/sem-match ficam de fora (resumo).
import { useState, useCallback, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import SemPermissao from '@/components/SemPermissao';

interface Item {
  codigo_produto: number; codigo: string; descricao: string;
  sistema: string; subsistema: string; sistemaAtual: string; subAtual: string;
  precisaSistema: boolean; precisaSub: boolean;
}
interface Resumo {
  produtosNova: number; comMatch: number; semMatch: number;
  sistemaUnico: number; subUnico: number; ambosAmbiguos: number; aEscrever: number; jaPreenchidos: number;
}

const thStyle: React.CSSProperties = { background: '#f1f5f9', color: '#475569', fontSize: '.65rem', textTransform: 'uppercase', letterSpacing: '.4px', padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', fontWeight: 600, whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 1 };
const tdStyle: React.CSSProperties = { padding: '6px 10px', borderBottom: '1px solid #f1f5f9', color: '#334155', fontSize: '.8rem', verticalAlign: 'top' };

interface ItemLote { empresa: string; codigo_produto: number; valor: string }

export default function CatalogoCaracteristicasPage() {
  const { userProfile } = useAuth();
  const { pode, loading: permLoading } = usePermissoes(userProfile?.id);

  const [itens, setItens] = useState<Item[]>([]);
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [status, setStatus] = useState('');
  const [statusTipo, setStatusTipo] = useState<'ok' | 'erro' | 'info'>('info');
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  const [filtroCli, setFiltroCli] = useState('');
  const [aplicando, setAplicando] = useState(false);
  const [progresso, setProgresso] = useState('');

  const setMsg = useCallback((t: string, tipo: 'ok' | 'erro' | 'info' = 'info') => { setStatus(t); setStatusTipo(tipo); }, []);

  const carregar = useCallback(async (force = false) => {
    setCarregando(true);
    setMsg(force ? 'recalculando a proposta…' : 'a montar a proposta a partir do catálogo (pode levar ~1 min na 1ª vez)…', 'info');
    try {
      const r = await fetch(`/api/ajustes/catalogo-caracteristicas${force ? '?atualizar=1' : ''}`);
      const d = await r.json();
      if (d.erro) { setMsg('Erro: ' + d.erro, 'erro'); return; }
      const lista = (d.itens || []) as Item[];
      setItens(lista);
      setResumo(d.resumo || null);
      setSelecionados(new Set(lista.map((i) => i.codigo_produto))); // default: todos
      setMsg(lista.length ? `${lista.length} produto(s) com algo a preencher.` : 'Nada a preencher. 🎉', lista.length ? 'ok' : 'info');
    } catch (ex) {
      setMsg('Erro de rede: ' + (ex as Error).message, 'erro');
    } finally {
      setCarregando(false);
    }
  }, [setMsg]);

  useEffect(() => {
    if (permLoading || !userProfile) return;
    if (!pode('ajustes', 'catalogo-caract')) return;
    carregar(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permLoading, userProfile]);

  const visiveis = useMemo(() => {
    const t = filtroCli.trim().toLowerCase();
    if (!t) return itens;
    return itens.filter((i) =>
      i.codigo.toLowerCase().includes(t) || i.descricao.toLowerCase().includes(t) ||
      i.sistema.toLowerCase().includes(t) || i.subsistema.toLowerCase().includes(t));
  }, [itens, filtroCli]);

  const toggle = useCallback((cp: number) => {
    setSelecionados((s) => { const n = new Set(s); n.has(cp) ? n.delete(cp) : n.add(cp); return n; });
  }, []);
  const marcarTodos = useCallback((on: boolean) => {
    setSelecionados(on ? new Set(visiveis.map((i) => i.codigo_produto)) : new Set());
  }, [visiveis]);

  // Uma passagem (uma característica) com o loop de bloqueio/retoma da Omie.
  const aplicarPasse = useCallback(async (nome: string, lista: ItemLote[]): Promise<{ aplicados: number; falhas: number; primeiraFalha: string; abortado: boolean }> => {
    const CHUNK = 20, total = lista.length, MAX_ESPERAS = 8;
    let aplicados = 0, falhas = 0, abortado = false, primeiraFalha = '', esperas = 0;
    let fila = lista.slice();
    while (fila.length && !abortado) {
      const lote = fila.slice(0, CHUNK);
      setProgresso(`${nome}: ${aplicados}/${total} feitos, ${fila.length} na fila`);
      try {
        const r = await fetch('/api/ajustes/caracteristicas/aplicar-tipo', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nome, itens: lote }),
        });
        const res = await r.json();
        if (res.erro) { primeiraFalha = res.erro; abortado = true; break; }
        aplicados += res.aplicados || 0;
        (res.resultados || []).filter((x: { ok?: boolean }) => !x.ok).forEach((x: { erro?: string }) => { falhas++; if (!primeiraFalha) primeiraFalha = x.erro || ''; });
        fila = [...(res.pendentes || []), ...fila.slice(lote.length)];
        if (res.bloqueado) {
          if ((res.aplicados || 0) > 0) esperas = 0;
          if (++esperas > MAX_ESPERAS) { primeiraFalha = 'Omie continua bloqueada após várias esperas'; abortado = true; break; }
          const seg = Math.min(Math.max(Number(res.aguardarSegundos) || 60, 15), 300);
          for (let s = seg; s > 0; s--) { setProgresso(`${nome}: Omie bloqueou — retomando em ${s}s (${aplicados}/${total} feitos; não feche)`); await new Promise((ok) => setTimeout(ok, 1000)); }
        } else { esperas = 0; }
      } catch (ex) { primeiraFalha = 'rede: ' + (ex as Error).message; abortado = true; break; }
    }
    return { aplicados, falhas, primeiraFalha, abortado };
  }, []);

  const aplicar = useCallback(async () => {
    const sel = itens.filter((i) => selecionados.has(i.codigo_produto));
    const alvoSis: ItemLote[] = sel.filter((i) => i.precisaSistema).map((i) => ({ empresa: 'NOVA', codigo_produto: i.codigo_produto, valor: i.sistema }));
    const alvoSub: ItemLote[] = sel.filter((i) => i.precisaSub).map((i) => ({ empresa: 'NOVA', codigo_produto: i.codigo_produto, valor: i.subsistema }));
    if (!alvoSis.length && !alvoSub.length) { setMsg('Nada selecionado para gravar.', 'info'); return; }
    if (!confirm(`Gravar na Omie (NOVA):\n• Sistema em ${alvoSis.length} produto(s)\n• Sub-sistema em ${alvoSub.length} produto(s)\n\nSe a Omie bloquear, o sistema espera e retoma — deixe a aba aberta até o fim.`)) return;
    setAplicando(true); setMsg('aplicando…', 'info');
    try {
      const r1 = alvoSis.length ? await aplicarPasse('Sistema', alvoSis) : { aplicados: 0, falhas: 0, primeiraFalha: '', abortado: false };
      const r2 = alvoSub.length ? await aplicarPasse('Sub-sistema', alvoSub) : { aplicados: 0, falhas: 0, primeiraFalha: '', abortado: false };
      setProgresso('');
      // otimista: tira da lista os produtos processados (falhas voltam ao "Atualizar")
      const processados = new Set(sel.map((i) => i.codigo_produto));
      setItens((prev) => prev.filter((i) => !processados.has(i.codigo_produto)));
      setSelecionados(new Set());
      const falhas = r1.falhas + r2.falhas;
      const pf = r1.primeiraFalha || r2.primeiraFalha;
      let msg = `Sistema: ${r1.aplicados}/${alvoSis.length} · Sub-sistema: ${r2.aplicados}/${alvoSub.length}`;
      if (falhas || r1.abortado || r2.abortado) msg += ` · ${falhas} falha(s)${pf ? ' (' + pf.slice(0, 120) + ')' : ''} — use "Atualizar" para reprocessar`;
      setMsg(msg, falhas || r1.abortado || r2.abortado ? 'erro' : 'ok');
    } finally {
      setAplicando(false);
    }
  }, [itens, selecionados, aplicarPasse, setMsg]);

  if (!permLoading && userProfile && !pode('ajustes', 'catalogo-caract')) return <SemPermissao />;

  const statusColor = statusTipo === 'erro' ? '#dc2626' : statusTipo === 'ok' ? '#047857' : '#64748b';
  const todosMarcados = visiveis.length > 0 && visiveis.every((i) => selecionados.has(i.codigo_produto));

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '20px 24px' }}>
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>Sistema / Sub-sistema (do catálogo)</h1>
        <p style={{ color: '#64748b', fontSize: '.82rem', maxWidth: 940 }}>
          Preenche as características <b>Sistema</b> (seção do catálogo) e <b>Sub-sistema</b> (figura/conjunto) na Omie <b>NOVA</b>,
          cruzando <code>catalogo_pecas.code</code> com o SKU (<code>produtos.codigo</code>, tratando o prefixo <code>RP-</code>).
          Só propõe quando o valor é <b>único</b> para o SKU; ambíguos ficam de fora. Revê e aplica — grava na Omie e regista.
        </p>
      </div>

      <div style={{ margin: '6px 0 12px', display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: '.8rem' }}>
        <Link href="/ajustes" style={{ color: '#dc2626', textDecoration: 'none', fontWeight: 600 }}>← Ajustes</Link>
      </div>

      {resumo && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12, fontSize: '.74rem', color: '#475569' }}>
          {[
            ['Produtos NOVA', resumo.produtosNova],
            ['No catálogo', resumo.comMatch],
            ['Sistema único', resumo.sistemaUnico],
            ['Sub único', resumo.subUnico],
            ['A preencher', resumo.aEscrever],
            ['Já preenchidos', resumo.jaPreenchidos],
            ['Ambíguos (fora)', resumo.ambosAmbiguos],
          ].map(([lbl, v]) => (
            <span key={String(lbl)} style={{ background: '#f1f5f9', borderRadius: 6, padding: '4px 10px' }}><b>{v as number}</b> {lbl}</span>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <input value={filtroCli} onChange={(e) => setFiltroCli(e.target.value)} placeholder="filtrar (SKU, descrição, sistema, sub-sistema)…"
          style={{ flex: 1, minWidth: 240, maxWidth: 460, border: '1px solid #cbd5e1', borderRadius: 6, padding: '6px 8px', fontSize: '.8rem' }} />
        <span style={{ fontSize: '.75rem', color: '#475569' }}><b>{selecionados.size}</b> selecionado(s)</span>
        <button onClick={aplicar} disabled={aplicando || carregando || !selecionados.size}
          style={{ padding: '7px 14px', background: '#059669', color: '#fff', border: 'none', borderRadius: 6, fontSize: '.82rem', cursor: 'pointer', opacity: (aplicando || carregando || !selecionados.size) ? 0.5 : 1, fontWeight: 600 }}>
          {aplicando ? 'Aplicando…' : 'Aplicar aos selecionados'}
        </button>
        <button onClick={() => carregar(true)} disabled={aplicando || carregando}
          style={{ padding: '7px 10px', background: '#fff', color: '#64748b', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '.82rem', cursor: 'pointer', opacity: (aplicando || carregando) ? 0.5 : 1 }}>↻ Atualizar</button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: '.75rem' }}>
        <span style={{ color: statusColor }}>{status}</span>
        {progresso && <span style={{ marginLeft: 'auto', color: '#b45309' }}>{progresso}</span>}
      </div>

      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'auto', maxHeight: '64vh' }}>
        {itens.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
            {carregando ? 'A montar a proposta…' : 'Nada a preencher.'}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, width: 30, textAlign: 'center' }}>
                  <input type="checkbox" checked={todosMarcados} onChange={(e) => marcarTodos(e.target.checked)} title="Marcar todos (visíveis)" />
                </th>
                <th style={{ ...thStyle, width: 130 }}>SKU</th>
                <th style={thStyle}>Descrição</th>
                <th style={thStyle}>Sistema</th>
                <th style={thStyle}>Sub-sistema</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.length === 0 ? (
                <tr><td colSpan={5} style={{ ...tdStyle, textAlign: 'center', color: '#94a3b8', padding: 24 }}>Nenhum produto bate com o filtro.</td></tr>
              ) : visiveis.map((i) => (
                <tr key={i.codigo_produto} style={{ borderTop: '1px solid #f1f5f9', background: selecionados.has(i.codigo_produto) ? '#f0fdf4' : undefined }}>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    <input type="checkbox" checked={selecionados.has(i.codigo_produto)} onChange={() => toggle(i.codigo_produto)} />
                  </td>
                  <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '.72rem', whiteSpace: 'nowrap' }}>{i.codigo}</td>
                  <td style={tdStyle}>{i.descricao || '—'}</td>
                  <td style={tdStyle}>
                    {i.sistema ? <span style={{ color: i.precisaSistema ? '#047857' : '#94a3b8' }}>{i.sistema}</span> : <span style={{ color: '#cbd5e1' }}>—</span>}
                    {i.sistemaAtual && i.sistemaAtual !== i.sistema && <div style={{ fontSize: '.66rem', color: '#94a3b8' }}>atual: {i.sistemaAtual}</div>}
                  </td>
                  <td style={tdStyle}>
                    {i.subsistema ? <span style={{ color: i.precisaSub ? '#047857' : '#94a3b8' }}>{i.subsistema}</span> : <span style={{ color: '#cbd5e1' }}>—</span>}
                    {i.subAtual && i.subAtual !== i.subsistema && <div style={{ fontSize: '.66rem', color: '#94a3b8' }}>atual: {i.subAtual}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
