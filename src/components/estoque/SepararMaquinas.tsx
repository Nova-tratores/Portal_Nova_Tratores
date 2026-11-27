'use client';
// "Máquinas a separar": notas recebidas em que o fabricante mandou N máquinas numa
// linha só (um SKU do fornecedor com quantidade N). A janela pede a série/chassi de
// cada uma: o produto da nota vira a 1ª máquina e as outras viram produtos novos
// (1 un. cada, mesmo custo), com um projeto "MARCA MODELO SÉRIE" para cada.
import { useCallback, useEffect, useState } from 'react';
import { fetchAuth } from '@/lib/auth/client';
import { descricaoBase, descricaoDaMaquina, projetoDaMaquina } from '@/lib/estoque/separar-maquinas';

interface Pendente {
  idReceb: number; conta: string; numeroNfe: string; fornecedor: string; recebidoEm: string | null;
  seq: number; descricaoNota: string; qtde: number; idProduto: number;
  produto: { codigo: string; descricao: string; familia: string | null; estoque: number };
}
interface Maq { serie: string; descricao: string; projeto: string; descEditada?: boolean; projEditado?: boolean }

const ROXO = '#7c3aed';
const brl = (n: number) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

async function api(url: string, body?: unknown) {
  const r = await fetchAuth(url, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || j.erro || `Erro ${r.status}`);
  return j;
}

export default function SepararMaquinas({ onAviso }: { onAviso: (msg: string, tipo: 'ok' | 'err') => void }) {
  const [lista, setLista] = useState<Pendente[]>([]);
  const [alvo, setAlvo] = useState<Pendente | null>(null);

  const carregar = useCallback(() => {
    api('/api/estoque/recebimentos/separar-maquinas?pendentes=1').then((j) => setLista(j.pendentes || [])).catch(() => setLista([]));
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  if (!lista.length) return null;
  return (
    <>
      <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: '.82rem', color: '#4c1d95' }}>
        <b>Máquinas a separar ({lista.length})</b> — o fabricante mandou várias máquinas num código só. Separe em um produto por série/chassi:
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
          {lista.map((p) => (
            <div key={`${p.conta}-${p.idProduto}`} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ overflowWrap: 'anywhere' }}>
                {p.conta} · NF <b>{p.numeroNfe}</b> · {p.fornecedor} · <b>{p.produto.codigo}</b> {p.produto.descricao.slice(0, 60)} · <b>{p.produto.estoque} no estoque</b>
              </span>
              <button onClick={() => setAlvo(p)} style={{ minHeight: 36, padding: '4px 14px', borderRadius: 6, border: 'none', background: ROXO, color: '#fefefe', fontSize: '.78rem', fontWeight: 600, cursor: 'pointer' }}>
                Separar máquinas
              </button>
            </div>
          ))}
        </div>
      </div>
      {alvo && (
        <JanelaSeparar alvo={alvo} onFechar={() => setAlvo(null)}
          onFeito={(msg) => { setAlvo(null); onAviso(msg, 'ok'); carregar(); }} />
      )}
    </>
  );
}

function JanelaSeparar({ alvo, onFechar, onFeito }: { alvo: Pendente; onFechar: () => void; onFeito: (msg: string) => void }) {
  const [info, setInfo] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [maqs, setMaqs] = useState<Maq[]>([]);
  const [erro, setErro] = useState('');
  const [erros, setErros] = useState<string[]>([]);
  const [conferido, setConferido] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [ocupado, setOcupado] = useState<'' | 'conferir' | 'separar'>('');

  useEffect(() => {
    api(`/api/estoque/recebimentos/separar-maquinas?conta=${alvo.conta}&produto=${alvo.idProduto}`)
      .then((j) => {
        setInfo(j);
        // Padrão: a 1ª é o produto da nota como está hoje (código e descrição do fornecedor, ou os
        // que você criou no Dar entrada); as outras já vêm com a descrição da nota, sem a série.
        const pr = j.produto || {};
        setMaqs((j.maquinas || []).map((_: unknown, i: number) => (i === 0 && pr.codigo
          ? { serie: String(pr.codigo), descricao: String(pr.descricao || ''), projeto: projetoDaMaquina(pr.marca, pr.modelo, String(pr.codigo)), descEditada: true }
          : { serie: '', descricao: descricaoBase(pr.descricao || alvo.descricaoNota), projeto: '' })));
      })
      .catch((e) => setErro(e.message));
  }, [alvo]);

  const base = info?.produto?.descricao || alvo.descricaoNota;
  const marca = info?.produto?.marca || '';
  const modelo = info?.produto?.modelo || '';

  function mudar(i: number, campo: keyof Maq, v: string) {
    setConferido(null); setErros([]);
    setMaqs((ms) => ms.map((m, k) => {
      if (k !== i) return m;
      const n = { ...m, [campo]: v };
      if (campo === 'serie') {
        if (!m.descEditada) n.descricao = v.trim() ? descricaoDaMaquina(base, v) : descricaoBase(base);
        if (!m.projEditado) n.projeto = v.trim() ? projetoDaMaquina(marca, modelo, v) : '';
      }
      if (campo === 'descricao') n.descEditada = true;
      if (campo === 'projeto') n.projEditado = true;
      return n;
    }));
  }
  function quantidade(n: number) {
    setConferido(null); setErros([]);
    setMaqs((ms) => (n > ms.length ? [...ms, ...Array.from({ length: n - ms.length }, () => ({ serie: '', descricao: descricaoBase(base), projeto: '' }))] : ms.slice(0, n)));
  }

  async function enviar(gravar: boolean) {
    setOcupado(gravar ? 'separar' : 'conferir'); setErro(''); setErros([]);
    try {
      const j = await api('/api/estoque/recebimentos/separar-maquinas', {
        conta: alvo.conta, idProduto: alvo.idProduto, idReceb: alvo.idReceb, numeroNfe: alvo.numeroNfe, seq: alvo.seq, gravar,
        maquinas: maqs.map((m) => ({ serie: m.serie, descricao: m.descricao, projeto: m.projeto })),
      });
      if (!j.ok) { setErros(j.erros || ['Não deu para separar.']); setConferido(null); return; }
      if (!gravar) { setConferido(j.plano); return; }
      const extra = (j.avisos || []).length ? ` Atenção: ${(j.avisos as string[]).join(' ')}` : '';
      onFeito(`Separadas ${maqs.length} máquinas da NF ${alvo.numeroNfe}: ${maqs.map((m) => m.serie.toUpperCase()).join(', ')}.${extra}`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado('');
    }
  }

  const estoque = Number(info?.local?.fisico || 0);
  const max = Math.min(10, Math.max(2, Math.floor(estoque)));
  return (
    <div className="sep-fundo" onClick={(e) => { if (e.target === e.currentTarget && !ocupado) onFechar(); }}>
      <style>{`
        .sep-fundo { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 110; display: flex; justify-content: center; align-items: center; }
        .sep-janela { background: var(--surface, #fff); color: var(--text, #111); border-radius: 14px; padding: 20px; width: 95%; max-width: 820px; max-height: 92vh; overflow-y: auto; box-shadow: 0 8px 30px rgba(0,0,0,.15); display: flex; flex-direction: column; gap: 12px; }
        .sep-maq { border: 1px solid var(--border, #e5e7eb); border-left: 4px solid ${ROXO}; border-radius: 8px; padding: 10px 12px; display: grid; grid-template-columns: 180px 1fr; gap: 8px 12px; align-items: center; }
        .sep-maq label { font-size: 12px; font-weight: 700; color: var(--text-light, #6b7280); }
        .sep-in { width: 100%; min-height: 40px; padding: 6px 10px; border: 1px solid var(--border, #d1d5db); border-radius: 6px; font-size: 14px; background: var(--surface, #fff); color: inherit; box-sizing: border-box; }
        .sep-btn { min-height: 42px; padding: 6px 16px; border-radius: 8px; border: 1px solid var(--border, #d1d5db); background: var(--surface, #fff); color: inherit; font-weight: 600; cursor: pointer; }
        .sep-btn.prim { background: ${ROXO}; border-color: ${ROXO}; color: #fefefe; }
        .sep-btn:disabled { opacity: .5; cursor: default; }
        @media (max-width: 640px) {
          .sep-fundo { align-items: stretch; }
          .sep-janela { width: 100%; max-width: none; max-height: none; height: 100%; border-radius: 0; padding: 16px; }
          .sep-maq { grid-template-columns: 1fr; }
        }
      `}</style>
      <div className="sep-janela" role="dialog" aria-label="Separar máquinas">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>Separar máquinas · NF {alvo.numeroNfe}</div>
            <div style={{ fontSize: 13, color: 'var(--text-light, #6b7280)' }}>{alvo.fornecedor} · {alvo.conta}</div>
          </div>
          <button className="sep-btn" onClick={onFechar} disabled={!!ocupado} aria-label="Fechar">✕</button>
        </div>

        {!info && !erro && <div>Lendo o produto e o estoque na Omie…</div>}
        {info && (
          <div style={{ fontSize: 14, background: 'var(--surface-2, #f9fafb)', borderRadius: 8, padding: '8px 12px' }}>
            Produto da nota: <b>{info.produto.codigo}</b> · {info.produto.descricao}<br />
            {info.produto.marca} {info.produto.modelo} · {info.produto.familia} ·{' '}
            {info.local ? <>{info.local.nome}: <b>{info.local.fisico} un.</b> a {brl(info.local.cmc)} cada</> : 'sem estoque'}
            {info.produto.lote && <div style={{ marginTop: 4, fontSize: 12, color: '#b45309' }}>Este produto tem controle de lote ligado na Omie. Se a Omie recusar o ajuste por causa do lote, nada fica gravado.</div>}
          </div>
        )}

        {info && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 14 }}>
              Quantas máquinas separar:
              <select className="sep-in" style={{ width: 90 }} value={maqs.length} onChange={(e) => quantidade(Number(e.target.value))}>
                {Array.from({ length: Math.max(1, max - 1) }, (_, k) => k + 2).map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              <span style={{ color: 'var(--text-light, #6b7280)', fontSize: 12 }}>A 1ª é o produto da nota (troca o código para a série); as outras viram produtos novos com 1 un. e o mesmo custo.</span>
            </div>
            {maqs.map((m, i) => (
              <div key={i} className="sep-maq">
                <label>Máquina {i + 1}{i === 0 ? ' (produto da nota)' : ' (produto novo)'} · série/chassi</label>
                <input className="sep-in" value={m.serie} placeholder="Ex.: G0725 37111" onChange={(e) => mudar(i, 'serie', e.target.value)} autoFocus={i === 0} />
                <label>Descrição</label>
                <input className="sep-in" value={m.descricao} onChange={(e) => mudar(i, 'descricao', e.target.value)} />
                <label>Projeto (Omie)</label>
                <input className="sep-in" value={m.projeto} onChange={(e) => mudar(i, 'projeto', e.target.value.toUpperCase())} maxLength={70} />
              </div>
            ))}
          </>
        )}

        {erros.length > 0 && <div style={{ color: '#b91c1c', fontSize: 13 }}>{erros.map((e, i) => <div key={i}>• {e}</div>)}</div>}
        {erro && <div style={{ color: '#b91c1c', fontSize: 13 }}>{erro}</div>}

        {conferido && (
          <div style={{ fontSize: 13, background: '#f5f3ff', color: '#4c1d95', borderRadius: 8, padding: '8px 12px' }}>
            <b>Vai acontecer na Omie:</b><br />
            • {conferido.origem.codigoAntes} vira <b>{conferido.origem.codigoDepois}</b> e fica com {conferido.origem.estoqueDepois} un.<br />
            {conferido.novos.map((n: { codigo: string; custo: number }) => <span key={n.codigo}>• produto novo <b>{n.codigo}</b> com 1 un. a {brl(n.custo)}<br /></span>)}
            • projetos: {conferido.projetos.join(' · ')}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button className="sep-btn" onClick={onFechar} disabled={!!ocupado}>Voltar</button>
          <button className="sep-btn" onClick={() => enviar(false)} disabled={!info || !!ocupado}>{ocupado === 'conferir' ? 'Conferindo na Omie…' : 'Conferir'}</button>
          <button className="sep-btn prim" onClick={() => enviar(true)} disabled={!conferido || !!ocupado}>{ocupado === 'separar' ? 'Separando na Omie…' : 'Separar na Omie'}</button>
        </div>
      </div>
    </div>
  );
}
