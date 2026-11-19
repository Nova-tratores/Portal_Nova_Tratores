'use client';
// Site → Pedidos do site (José, 10/11/2026): pedidos de proposta que chegam pela página de crédito do site.
// O cliente já foi para o WhatsApp; aqui fica o registro para ninguém esquecer de responder.
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { fetchAuth } from '@/lib/auth/client';
import SubAbas, { ABAS_PEDIDOS_CATALOGO } from '@/components/marketing/redes/SubAbas';
import { Aviso, ComoLer, Conta, Numero, botao, campo, cartao, grade, quando, real, tela } from '@/components/marketing/redes/ui';

type Pedido = {
  id: string; criado_em: string; nome: string; telefone: string; cidade: string | null; interesse: string | null
  linha: string | null; valor: number | null; usado: boolean; obs: string | null; origem: string | null
  simulacao: { programa?: string; parcela?: number; parcelas?: number; periodo?: string } | null
  status: string; responsavel_nome: string | null; atendido_em: string | null; notas: string | null
};

const STATUS: { id: string; rotulo: string; cor: string; icone: string }[] = [
  { id: 'novo', rotulo: 'Novo', cor: '#dc2626', icone: 'fa-bell' },
  { id: 'em_contato', rotulo: 'Em contato', cor: '#d97706', icone: 'fa-comments' },
  { id: 'proposta', rotulo: 'Proposta enviada', cor: '#7c3aed', icone: 'fa-file-signature' },
  { id: 'ganho', rotulo: 'Vendido', cor: '#16a34a', icone: 'fa-handshake' },
  { id: 'perdido', rotulo: 'Perdido', cor: '#6b7280', icone: 'fa-xmark' },
  { id: 'descartado', rotulo: 'Descartado', cor: '#9ca3af', icone: 'fa-trash' },
];
const LINHA: Record<string, string> = {
  pronaf1: 'Pronaf (renda até R$ 150 mil)', pronaf5: 'Pronaf (renda acima de R$ 150 mil)', pronamp: 'Pronamp',
  moderfrota: 'Moderfrota', finame: 'FINAME', consorcio: 'Consórcio Mahindra', 'nao-sei': 'Não sabe a linha',
};
const st = (id: string) => STATUS.find((s) => s.id === id) || STATUS[0];
const whats = (tel: string) => { const d = tel.replace(/\D/g, ''); return `https://wa.me/${d.length <= 11 ? `55${d}` : d}`; };

export default function PedidosSitePage() {
  return <Suspense fallback={null}><Pedidos /></Suspense>;
}

function Pedidos() {
  const busca = useSearchParams();
  const [pedidos, setPedidos] = useState<Pedido[] | null>(null);
  const [erro, setErro] = useState('');
  const [filtro, setFiltro] = useState<string>('abertos');
  const [aberto, setAberto] = useState<string | null>(busca?.get('id') ?? null);
  const [rascunhoNotas, setRascunhoNotas] = useState<{ id: string; txt: string } | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    const r = await fetchAuth('/api/marketing/pedidos?dias=365');
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) { setErro(j.erro || 'Não consegui carregar os pedidos.'); setPedidos([]); return; }
    setErro(''); setPedidos(j.pedidos);
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { carregar(); const t = setInterval(carregar, 60_000); return () => clearInterval(t); }, [carregar]);

  const conta = useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of pedidos || []) c[p.status] = (c[p.status] || 0) + 1;
    return c;
  }, [pedidos]);
  const lista = useMemo(() => (pedidos || []).filter((p) =>
    filtro === 'todos' ? true : filtro === 'abertos' ? ['novo', 'em_contato', 'proposta'].includes(p.status) : p.status === filtro,
  ), [pedidos, filtro]);
  const atual = (pedidos || []).find((p) => p.id === aberto) || null;
  const notas = rascunhoNotas && rascunhoNotas.id === atual?.id ? rascunhoNotas.txt : atual?.notas || '';
  const setNotas = (txt: string) => atual && setRascunhoNotas({ id: atual.id, txt });

  async function mudar(corpo: Record<string, unknown>) {
    if (!atual) return;
    setSalvando(true);
    const r = await fetchAuth('/api/marketing/pedidos', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: atual.id, ...corpo }) });
    const j = await r.json().catch(() => ({}));
    setSalvando(false);
    if (!r.ok || !j.ok) { alert(j.erro || 'Não consegui salvar.'); return; }
    setPedidos((ps) => (ps || []).map((p) => (p.id === atual.id ? j.pedido : p)));
  }

  return (
    <div style={tela}>
      <SubAbas abas={ABAS_PEDIDOS_CATALOGO} />
      {erro && <Aviso>{erro}</Aviso>}
      <div style={grade(180)}>
        <Numero icone="fa-bell" cor="#dc2626" rotulo="Novos (sem resposta)" valor={<Conta valor={conta.novo || 0} />} ativo={filtro === 'novo'} onClick={() => setFiltro(filtro === 'novo' ? 'abertos' : 'novo')} />
        <Numero icone="fa-comments" cor="#d97706" rotulo="Em contato" valor={<Conta valor={conta.em_contato || 0} />} ativo={filtro === 'em_contato'} onClick={() => setFiltro(filtro === 'em_contato' ? 'abertos' : 'em_contato')} />
        <Numero icone="fa-file-signature" cor="#7c3aed" rotulo="Proposta enviada" valor={<Conta valor={conta.proposta || 0} />} ativo={filtro === 'proposta'} onClick={() => setFiltro(filtro === 'proposta' ? 'abertos' : 'proposta')} />
        <Numero icone="fa-handshake" cor="#16a34a" rotulo="Vendidos" valor={<Conta valor={conta.ganho || 0} />} ativo={filtro === 'ganho'} onClick={() => setFiltro(filtro === 'ganho' ? 'abertos' : 'ganho')} />
      </div>

      <ComoLer>
        Cada linha é um pedido de proposta feito na página de <b>Crédito</b> do site. O cliente já foi levado ao WhatsApp da loja com a
        mensagem pronta; aqui fica o registro. Toque num pedido para ver a simulação, <b>assumir</b> e mudar a fase
        (Novo → Em contato → Proposta enviada → Vendido/Perdido). Os cartões de cima filtram a lista. Quem tem o módulo Site recebe o
        aviso no sino e no celular a cada pedido novo.
      </ComoLer>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {[['abertos', 'Em aberto'], ['todos', 'Todos'], ['perdido', 'Perdidos'], ['descartado', 'Descartados']].map(([id, r]) => (
          <button key={id} style={botao('#d97706', filtro === id)} onClick={() => setFiltro(id)}>{r}</button>
        ))}
      </div>

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(min(380px, 100%), 1fr))', alignItems: 'start' }}>
        <div style={{ ...cartao, padding: 0, overflow: 'hidden' }}>
          {pedidos === null && <p style={{ padding: 16, margin: 0 }}>Carregando…</p>}
          {pedidos && !lista.length && <p style={{ padding: 16, margin: 0, color: 'var(--portal-text-muted, #6b7280)' }}>Nenhum pedido aqui.</p>}
          {lista.map((p) => {
            const s = st(p.status);
            return (
              <button key={p.id} onClick={() => setAberto(p.id)}
                style={{ display: 'flex', gap: 12, alignItems: 'center', width: '100%', padding: '12px 16px', border: 0, borderBottom: '1px solid var(--border)', background: aberto === p.id ? 'color-mix(in srgb, #d97706 6%, var(--surface))' : 'transparent', color: 'var(--portal-text)', font: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
                <span style={{ flex: 'none', width: 36, height: 36, borderRadius: 10, display: 'grid', placeItems: 'center', background: `color-mix(in srgb, ${s.cor} 10%, transparent)`, color: s.cor }}>
                  <i className={`fa-solid ${s.icone}`} style={{ fontWeight: 900 }} />
                </span>
                <span style={{ flex: 1, minWidth: 0, display: 'grid' }}>
                  <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nome}{p.cidade ? ` · ${p.cidade}` : ''}</span>
                  <span style={{ fontSize: 13, color: 'var(--portal-text-muted, #6b7280)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.interesse || 'Máquina não escolhida'}{p.valor ? ` · ${real(p.valor)}` : ''}
                  </span>
                </span>
                <span style={{ flex: 'none', fontSize: 12, color: 'var(--portal-text-muted, #6b7280)', textAlign: 'right' }}>{quando(p.criado_em)}<br />{s.rotulo}</span>
              </button>
            );
          })}
        </div>

        {atual ? (
          <div style={{ ...cartao, display: 'grid', gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'start' }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 500 }}>{atual.nome}</div>
                <div style={{ fontSize: 13, color: 'var(--portal-text-muted, #6b7280)' }}>{atual.cidade || 'Cidade não informada'} · pedido {quando(atual.criado_em)}</div>
              </div>
              <a href={whats(atual.telefone)} target="_blank" rel="noopener" style={botao('#16a34a')}><i className="fa-brands fa-whatsapp" /> {atual.telefone}</a>
            </div>
            <dl style={{ ...grade(160), margin: 0 }}>
              {[
                ['Máquina', atual.interesse || 'Ainda não sabe'],
                ['Linha de crédito', LINHA[atual.linha || ''] || '—'],
                ['Quer financiar', real(atual.valor)],
                ['Usado na troca', atual.usado ? 'Sim' : 'Não'],
                ['Simulou no site', atual.simulacao?.parcela ? `${atual.simulacao.parcelas}× ${real(atual.simulacao.parcela)} (${atual.simulacao.periodo})` : '—'],
                ['Responsável', atual.responsavel_nome || 'Ninguém assumiu'],
              ].map(([k, v]) => (
                <div key={k}><dt style={{ fontSize: 12, color: 'var(--portal-text-muted, #6b7280)' }}>{k}</dt><dd style={{ margin: 0, fontWeight: 500 }}>{v}</dd></div>
              ))}
            </dl>
            {atual.obs && <p style={{ margin: 0, padding: 12, borderRadius: 10, background: 'var(--portal-bg)' }}>“{atual.obs}”</p>}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {!atual.responsavel_nome && <button disabled={salvando} style={botao('#111111')} onClick={() => mudar({ assumir: true, status: atual.status === 'novo' ? 'em_contato' : atual.status })}>Assumir</button>}
              {STATUS.map((s) => (
                <button key={s.id} disabled={salvando || atual.status === s.id} onClick={() => mudar({ status: s.id })}
                  style={{ ...botao(s.cor, atual.status === s.id), opacity: salvando ? 0.6 : 1 }}>{s.rotulo}</button>
              ))}
            </div>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 13 }}>Anotações internas</span>
              <textarea rows={3} value={notas} onChange={(e) => setNotas(e.target.value)} style={campo} placeholder="Ex.: liguei, volta a falar na quinta" />
            </label>
            <div><button disabled={salvando || notas === (atual.notas || '')} style={botao()} onClick={() => mudar({ notas })}>Salvar anotação</button></div>
          </div>
        ) : (
          <div style={{ ...cartao, color: 'var(--portal-text-muted, #6b7280)' }}>Toque num pedido para ver os detalhes.</div>
        )}
      </div>
    </div>
  );
}
