'use client';
// Nova demonstração: empresa → cliente → máquina(s) → prazo (30 dias) → cria a remessa na Omie.
// A NF-e é emitida depois, na ficha, quando a pessoa confere o que a Omie calculou.
import { useEffect, useRef, useState } from 'react';
import { Search, Trash2, Truck } from 'lucide-react';
import { fetchAuth } from '@/lib/auth/client';
import { PRAZO_PADRAO_DIAS, somarDias, hojeISO, cfopDemo, validarDemo, dataBR } from '@/lib/remessas/regras';

interface Cliente { codCli: number; nome: string; doc: string | null; cidade: string | null; uf: string | null }
interface Produto { nCodProd: number; codigo: string | null; descricao: string; familia: string | null; estoque: number; valor: number }
interface Item { nCodProd: number; descricao: string; qtd: number; valorUnit: number; estoque: number }
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function useBusca<T>(url: (q: string) => string, campo: string, q: string) {
  const [res, setRes] = useState<T[]>([]);
  const [buscando, setBuscando] = useState(false);
  const seq = useRef(0);
  useEffect(() => {
    if (q.trim().length < 2) { setRes([]); return; }
    const n = ++seq.current;
    setBuscando(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetchAuth(url(q));
        const j = await r.json();
        if (n === seq.current) setRes(j[campo] || []);
      } catch { /* mantém */ } finally { if (n === seq.current) setBuscando(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  return { res, buscando, limpar: () => setRes([]) };
}

export default function NovaDemonstracao({ onCriada }: { onCriada: (r: { conta: 'nova' | 'castro'; idRemessa: number; numero: string }) => void }) {
  const [conta, setConta] = useState<'nova' | 'castro'>('nova');
  const [qCli, setQCli] = useState('');
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [qProd, setQProd] = useState('');
  const [itens, setItens] = useState<Item[]>([]);
  const [prazo, setPrazo] = useState(somarDias(hojeISO(), PRAZO_PADRAO_DIAS));
  const [obs, setObs] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [confirmar, setConfirmar] = useState(false);

  const cli = useBusca<Cliente>((q) => `/api/remessas?conta=${conta}&clientes=${encodeURIComponent(q)}`, 'clientes', cliente ? '' : qCli);
  const prod = useBusca<Produto>((q) => `/api/remessas?conta=${conta}&produtos=${encodeURIComponent(q)}`, 'produtos', qProd);

  const trocarConta = (c: 'nova' | 'castro') => { setConta(c); setCliente(null); setQCli(''); setItens([]); };
  const erros = validarDemo({ nCodCli: cliente?.codCli, itens: itens.map((i) => ({ ...i })), prazoAte: prazo });
  const total = itens.reduce((s, i) => s + i.qtd * i.valorUnit, 0);

  const criar = async () => {
    setEnviando(true); setErro('');
    try {
      const r = await fetchAuth('/api/remessas', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'demonstracao', conta, nCodCli: cliente?.codCli, prazoAte: prazo, obs, itens: itens.map((i) => ({ nCodProd: i.nCodProd, qtd: i.qtd, valorUnit: i.valorUnit, descricao: i.descricao })) }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro || `Erro ${r.status}`);
      onCriada({ conta, idRemessa: j.idRemessa, numero: j.numero });
    } catch (e) { setErro((e as Error).message); setConfirmar(false); }
    finally { setEnviando(false); }
  };

  return (
    <div className="rm-card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="rm-sec">Nova remessa para demonstração</div>
      <div style={{ fontSize: 13, color: 'var(--text-light)' }}>
        A máquina sai do estoque com CFOP 5.912 (cliente em SP) ou 6.912 (fora). Impostos, categoria e local de estoque são copiados da última demonstração da empresa na Omie.
        O portal <b>cria</b> a remessa; a NF-e só é emitida na ficha, depois de você conferir.
      </div>

      <div className="rm-campo">
        <span className="rm-lbl">Empresa</span>
        <div className="rm-chips">
          {(['nova', 'castro'] as const).map((c) => <button key={c} className={`rm-chip ${conta === c ? 'on' : ''}`} onClick={() => trocarConta(c)}>{c.toUpperCase()}</button>)}
        </div>
      </div>

      <div className="rm-campo" style={{ position: 'relative' }}>
        <span className="rm-lbl">Cliente</span>
        {cliente ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <b>{cliente.nome}</b><span style={{ color: 'var(--text-light)', fontSize: 13 }}>{cliente.doc} · {cliente.cidade}</span>
            <span className="rm-selo" style={{ background: 'var(--mx-p-violet, #ede9fe)', color: 'var(--mx-fg-violet, #5b21b6)' }}>CFOP {cfopDemo(cliente.uf)}</span>
            <button className="rm-btn peq" onClick={() => { setCliente(null); setQCli(''); }}>Trocar</button>
          </div>
        ) : (
          <>
            <div style={{ position: 'relative' }}>
              <Search size={15} style={{ position: 'absolute', left: 10, top: 12, opacity: .5 }} />
              <input className="rm-input" style={{ paddingLeft: 32 }} placeholder="Nome ou CPF/CNPJ do cliente" value={qCli} onChange={(e) => setQCli(e.target.value)} />
            </div>
            {(cli.res.length > 0 || cli.buscando) && (
              <div className="rm-lista-flutuante">
                {cli.buscando && !cli.res.length && <div style={{ padding: 10, fontSize: 13 }}>Buscando…</div>}
                {cli.res.map((c) => (
                  <button key={c.codCli} className="rm-lista-item" onClick={() => { setCliente(c); cli.limpar(); }}>
                    <b>{c.nome}</b><span style={{ fontSize: 12, color: 'var(--text-light)' }}>{c.doc} · {c.cidade}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div className="rm-campo" style={{ position: 'relative' }}>
        <span className="rm-lbl">Máquinas</span>
        <div style={{ position: 'relative' }}>
          <Search size={15} style={{ position: 'absolute', left: 10, top: 12, opacity: .5 }} />
          <input className="rm-input" style={{ paddingLeft: 32 }} placeholder="Modelo, chassi ou código" value={qProd} onChange={(e) => setQProd(e.target.value)} />
        </div>
        {(prod.res.length > 0 || prod.buscando) && qProd && (
          <div className="rm-lista-flutuante">
            {prod.buscando && !prod.res.length && <div style={{ padding: 10, fontSize: 13 }}>Buscando…</div>}
            {prod.res.map((p) => (
              <button key={p.nCodProd} className="rm-lista-item" onClick={() => {
                setItens((l) => l.some((i) => i.nCodProd === p.nCodProd) ? l : [...l, { nCodProd: p.nCodProd, descricao: p.descricao, qtd: 1, valorUnit: p.valor, estoque: p.estoque }]);
                setQProd(''); prod.limpar();
              }}>
                <b>{p.descricao}</b>
                <span style={{ fontSize: 12, color: p.estoque > 0 ? 'var(--text-light)' : 'var(--mx-fg-red, #dc2626)' }}>{p.familia || ''} · estoque {p.estoque} · {brl(p.valor)}</span>
              </button>
            ))}
          </div>
        )}
        {itens.length > 0 && (
          <div className="rm-tabela-wrap" style={{ marginTop: 6 }}>
            <table className="rm-tabela" style={{ minWidth: 560 }}>
              <thead><tr><th>Máquina</th><th style={{ width: 90 }}>Qtd</th><th style={{ width: 160 }}>Valor unitário</th><th style={{ width: 44 }} /></tr></thead>
              <tbody>
                {itens.map((i, k) => (
                  <tr key={i.nCodProd} style={{ cursor: 'default' }}>
                    <td><Truck size={13} style={{ verticalAlign: -2 }} /> {i.descricao}{i.estoque <= 0 && <div style={{ fontSize: 11.5, color: 'var(--mx-fg-red, #dc2626)' }}>sem estoque no portal — confira antes de emitir</div>}</td>
                    <td><input className="rm-input" type="number" min={1} step={1} value={i.qtd} onChange={(e) => setItens((l) => l.map((x, j) => j === k ? { ...x, qtd: Number(e.target.value) } : x))} /></td>
                    <td><input className="rm-input" type="number" min={0} step="0.01" value={i.valorUnit} onChange={(e) => setItens((l) => l.map((x, j) => j === k ? { ...x, valorUnit: Number(e.target.value) } : x))} /></td>
                    <td><button className="rm-btn peq perigo" aria-label="Tirar" onClick={() => setItens((l) => l.filter((_, j) => j !== k))}><Trash2 size={14} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rm-grade">
        <div className="rm-campo">
          <span className="rm-lbl">Volta até</span>
          <input className="rm-input" type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
          <span style={{ fontSize: 12, color: 'var(--text-light)' }}>Padrão: {PRAZO_PADRAO_DIAS} dias. Vai escrito na nota.</span>
        </div>
        <div className="rm-campo">
          <span className="rm-lbl">Observação na nota (opcional)</span>
          <input className="rm-input" placeholder="Ex.: demonstração no evento de Taguaí" value={obs} onChange={(e) => setObs(e.target.value)} />
        </div>
      </div>

      {erro && <div className="rm-erro">{erro}</div>}
      {!confirmar ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="rm-btn pri" disabled={erros.length > 0} onClick={() => setConfirmar(true)}>Revisar e criar na Omie</button>
          {erros.length > 0 && <span style={{ fontSize: 12.5, color: 'var(--text-light)' }}>{erros[0]}</span>}
        </div>
      ) : (
        <div className="rm-aviso" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            Vai criar na <b>{conta.toUpperCase()}</b> uma remessa para demonstração (CFOP {cfopDemo(cliente?.uf)}) para <b>{cliente?.nome}</b>:
            {' '}{itens.map((i) => `${i.qtd}× ${i.descricao}`).join('; ')} — total {brl(total)}, volta até {dataBR(prazo)}.
            A NF-e ainda NÃO será emitida.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="rm-btn pri" disabled={enviando} onClick={criar}>{enviando ? 'Criando…' : 'Criar a remessa na Omie'}</button>
            <button className="rm-btn" disabled={enviando} onClick={() => setConfirmar(false)}>Voltar</button>
          </div>
        </div>
      )}
    </div>
  );
}
