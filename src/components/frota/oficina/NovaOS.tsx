'use client';
// Abrir uma OS da frota (ou incluir itens numa OS que já existe): o carro, as
// pendências abertas e as preventivas vencidas/vencendo dele, e serviços
// escritos à mão (um por linha).
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { fetchAuth } from '@/lib/auth/client';
import { formatarPlaca } from '@/lib/frota/placa';
import { Janela, botao, campo, postOficina, rotulo, type OsFrota, type VeiculoOpcao } from './comum';

interface Candidatos {
  pendencias: { id: string; titulo: string; descricao: string | null; origem: string; gravidade: string | null }[];
  preventivas: { plano_id: string; nome: string; estado: string; texto: string }[];
}

const ORIGEM: Record<string, string> = {
  manual: 'aberta à mão', checklist: 'checklist', requisicao: 'requisição', os: 'OS do Pós', opa: 'Opa',
  cadastro: 'cadastro', chamado_vendas: 'app de vendas',
};
const GRAV_COR: Record<string, string> = { critica: '#991b1b', grave: '#b91c1c', media: '#b45309', leve: '#475569' };

export default function NovaOS({ veiculos, osExistente, placaInicial, onFechar, onFeito }: {
  veiculos: VeiculoOpcao[];
  /** com OS: só inclui itens nela */
  osExistente?: OsFrota | null;
  placaInicial?: string;
  onFechar: () => void;
  onFeito: (msg: string, id?: string) => void;
}) {
  const [placa, setPlaca] = useState(osExistente?.placa || placaInicial || '');
  const [cand, setCand] = useState<Candidatos | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [pend, setPend] = useState<Set<string>>(new Set());
  const [prev, setPrev] = useState<Set<string>>(new Set());
  const [avulsos, setAvulsos] = useState('');
  const [descricao, setDescricao] = useState('');
  const [oficina, setOficina] = useState<'propria' | 'externa'>('propria');
  const [fornecedor, setFornecedor] = useState('');
  const [osPos, setOsPos] = useState('');
  const [imobiliza, setImobiliza] = useState(true);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!placa) return;
    let vivo = true;
    setCarregando(true);
    fetchAuth(`/api/frota/oficina?candidatos=${encodeURIComponent(placa)}`)
      .then((r) => r.json())
      .then((j) => {
        if (!vivo) return;
        setCand({ pendencias: j.pendencias || [], preventivas: j.preventivas || [] });
        // vencidas já vêm marcadas: é o que mais costuma entrar
        setPrev(new Set((j.preventivas || []).filter((p: { estado: string }) => p.estado === 'vencida').map((p: { plano_id: string }) => p.plano_id)));
        setPend(new Set());
      })
      .catch((e) => vivo && setErro(String(e)))
      .finally(() => vivo && setCarregando(false));
    return () => { vivo = false; };
  }, [placa]);

  const alternar = (s: Set<string>, set: (x: Set<string>) => void, id: string) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    set(n);
  };

  const salvar = async () => {
    setErro('');
    const linhas = avulsos.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!placa) { setErro('Escolha o veículo.'); return; }
    if (!osExistente && !pend.size && !prev.size && !linhas.length && !descricao.trim()) {
      setErro('Escolha pelo menos uma pendência ou preventiva, ou descreva o serviço.');
      return;
    }
    if (osExistente && !pend.size && !prev.size && !linhas.length) { setErro('Marque o que incluir.'); return; }
    setSalvando(true);
    try {
      const base = { pendencia_ids: [...pend], plano_ids: [...prev], avulsos: linhas };
      const r = osExistente
        ? await postOficina({ acao: 'incluir', id: osExistente.id, ...base })
        : await postOficina({ acao: 'abrir', placa, descricao, oficina, fornecedor, os_pos: osPos, imobiliza, ...base });
      if (r.error) { setErro(r.error); return; }
      onFeito(osExistente ? 'Itens incluídos na OS.' : `OS aberta no ${formatarPlaca(placa)}.`, r.id as string | undefined);
    } finally {
      setSalvando(false);
    }
  };

  const caixa = { display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 10px', border: '1px solid var(--portal-border)', background: 'var(--portal-bg-input)', cursor: 'pointer', fontSize: 13.5, color: 'var(--portal-text)' } as const;

  return (
    <Janela titulo={osExistente ? `Incluir na ${osExistente.rotulo} · ${formatarPlaca(osExistente.placa)}` : 'Nova OS da frota'} onFechar={onFechar} largura={620}
      rodape={<>
        <button type="button" onClick={onFechar} style={botao()}>Voltar</button>
        <button type="button" onClick={salvar} disabled={salvando} style={botao('primario')}>
          {salvando && <Loader2 size={15} className="animate-spin" />}{osExistente ? 'Incluir' : 'Abrir a OS'}
        </button>
      </>}>
      {!osExistente && (
        <label style={rotulo}>
          Veículo
          <select id="oficina-placa" value={placa} onChange={(e) => setPlaca(e.target.value)} style={campo}>
            <option value="">Escolha o carro…</option>
            {veiculos.map((v) => <option key={v.placa} value={v.placa}>{formatarPlaca(v.placa)}{v.descricao ? ` · ${v.descricao}` : ''}</option>)}
          </select>
        </label>
      )}

      {placa && (carregando ? (
        <span style={{ fontSize: 13, color: 'var(--portal-text-secondary)' }}>Buscando o que está aberto no carro…</span>
      ) : cand && (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={rotulo}>Pendências abertas do carro ({cand.pendencias.length})</span>
            {!cand.pendencias.length && <span style={{ fontSize: 13, color: 'var(--portal-text-secondary)' }}>Nenhuma pendência aberta fora de outra OS.</span>}
            {cand.pendencias.map((p) => (
              <label key={p.id} style={caixa}>
                <input type="checkbox" checked={pend.has(p.id)} onChange={() => alternar(pend, setPend, p.id)} style={{ marginTop: 3 }} />
                <span style={{ minWidth: 0 }}>
                  <strong>{p.titulo}</strong>
                  <span style={{ display: 'block', fontSize: 12, color: 'var(--portal-text-secondary)' }}>
                    {ORIGEM[p.origem] || p.origem}
                    {p.gravidade && <span style={{ color: GRAV_COR[p.gravidade] || undefined, fontWeight: 700 }}> · {p.gravidade}</span>}
                  </span>
                </span>
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={rotulo}>Preventivas vencidas ou vencendo ({cand.preventivas.length})</span>
            {!cand.preventivas.length && <span style={{ fontSize: 13, color: 'var(--portal-text-secondary)' }}>Nada vencendo no plano do carro.</span>}
            {cand.preventivas.map((p) => (
              <label key={p.plano_id} style={caixa}>
                <input type="checkbox" checked={prev.has(p.plano_id)} onChange={() => alternar(prev, setPrev, p.plano_id)} style={{ marginTop: 3 }} />
                <span><strong>{p.nome}</strong>
                  <span style={{ display: 'block', fontSize: 12, color: p.estado === 'vencida' ? '#b91c1c' : '#b45309', fontWeight: 700 }}>{p.texto}</span>
                </span>
              </label>
            ))}
          </div>
        </>
      ))}

      <label style={rotulo}>
        Outros serviços (um por linha)
        <textarea id="oficina-avulsos" value={avulsos} onChange={(e) => setAvulsos(e.target.value)} rows={2} placeholder="Ex.: trocar palheta do limpador" style={campo} />
      </label>

      {!osExistente && (
        <>
          <label style={rotulo}>
            Observação da OS
            <textarea id="oficina-descricao" value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={2} style={campo} />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: 10 }}>
            <label style={rotulo}>
              Onde vai ser feito
              <select id="oficina-onde" value={oficina} onChange={(e) => setOficina(e.target.value as 'propria' | 'externa')} style={campo}>
                <option value="propria">Oficina própria (Pós-Vendas)</option>
                <option value="externa">Oficina externa</option>
              </select>
            </label>
            {oficina === 'externa' ? (
              <label style={rotulo}>
                Oficina externa
                <input id="oficina-fornecedor" value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} placeholder="Nome da oficina" style={campo} />
              </label>
            ) : (
              <label style={rotulo}>
                Nº da OS do Pós (se houver)
                <input id="oficina-ospos" value={osPos} onChange={(e) => setOsPos(e.target.value)} placeholder="Ex.: OS-0812" style={campo} />
              </label>
            )}
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5, color: 'var(--portal-text)', cursor: 'pointer' }}>
            <input type="checkbox" checked={imobiliza} onChange={(e) => setImobiliza(e.target.checked)} />
            O carro fica parado enquanto estiver na oficina
          </label>
        </>
      )}
      {erro && <p role="alert" style={{ margin: 0, fontSize: 13, color: '#b91c1c', fontWeight: 700 }}>{erro}</p>}
    </Janela>
  );
}
