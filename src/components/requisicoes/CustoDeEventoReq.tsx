'use client';
// "É custo de evento?" dentro da requisição (24/11/2026, José: "o custo não se cria no Marketing, apenas em
// Requisições"). Mostra de quais eventos/campanhas esta requisição já é custo e lança em outro.
// Só aparece para quem tem o módulo Marketing (a rota exige marketing + custos:vincular para lançar).
// Notas, boleto, recibo e itens NÃO são copiados: o Marketing lê da requisição ao vivo.
import { useEffect, useState } from 'react';
import { PartyPopper, Plus } from 'lucide-react';
import { fetchAuth } from '@/lib/auth/client';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import { TIPOS_ACAO } from '@/lib/marketing/tipos';

type Ligado = { id: string; acao_id: string; acao_nome: string; acao_tipo: string };
type Acao = { id: string; nome: string; tipo: string; data_inicio: string | null };

export default function CustoDeEventoReq({ reqId, ativo }: { reqId: number | string; ativo: boolean }) {
  const { userProfile } = useAuth();
  const { pode } = usePermissoes(userProfile?.id);
  const temMarketing = pode('marketing');
  const podeLancar = pode('marketing', 'custos:vincular');

  const [ligados, setLigados] = useState<Ligado[] | null>(null);
  const [acoes, setAcoes] = useState<Acao[] | null>(null);
  const [escolha, setEscolha] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  const carregar = () => {
    fetchAuth(`/api/marketing/custos/requisicao?req_id=${encodeURIComponent(String(reqId))}`)
      .then((r) => r.json()).then((j) => setLigados(j.custos || [])).catch(() => setLigados([]));
  };

  useEffect(() => {
    if (!ativo || !temMarketing || !reqId || reqId === 'NOVA') return;
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativo, temMarketing, reqId]);

  useEffect(() => {
    if (!ativo || !podeLancar || acoes) return;
    fetchAuth('/api/marketing/custos/requisicao?acoes=1').then((r) => r.json()).then((j) => setAcoes(j.acoes || [])).catch(() => setAcoes([]));
  }, [ativo, podeLancar, acoes]);

  if (!temMarketing || !reqId || reqId === 'NOVA') return null;

  const lancar = async () => {
    if (!escolha) return;
    setSalvando(true); setMsg(null);
    try {
      const r = await fetchAuth('/api/marketing/custos/requisicao', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ req_id: Number(reqId), acao_id: escolha }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Erro ${r.status}`);
      setMsg({ tipo: 'ok', texto: `Lançada como custo de "${j.acao?.nome}". Notas e anexos aparecem lá sozinhos.` });
      setEscolha('');
      carregar();
    } catch (e) {
      setMsg({ tipo: 'erro', texto: e instanceof Error ? e.message : String(e) });
    } finally { setSalvando(false); }
  };

  const jaTem = new Set((ligados || []).map((l) => l.acao_id));
  const rotuloTipo = (t: string) => TIPOS_ACAO.find((x) => x.id === t)?.label || t;

  return (
    <div className="rounded-xl border border-pink-200 bg-pink-50/40 p-4 flex flex-col gap-2">
      <div className="flex items-center gap-2 text-[14px] font-medium text-zinc-900">
        <PartyPopper size={16} className="text-pink-600" /> É custo de evento ou campanha?
      </div>

      {ligados === null ? (
        <span className="text-[12.5px] text-zinc-500">Carregando…</span>
      ) : ligados.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {ligados.map((l) => (
            <a key={l.id} href={`/marketing/${l.acao_id}`} target="_blank" rel="noopener noreferrer"
              className="text-[12.5px] font-medium px-2.5 py-1 rounded-full bg-white border border-pink-300 text-pink-700 hover:bg-pink-100">
              {l.acao_nome} · {rotuloTipo(l.acao_tipo)}
            </a>
          ))}
        </div>
      ) : (
        <span className="text-[12.5px] text-zinc-500">Ainda não é custo de nenhum evento.</span>
      )}

      {podeLancar && (
        <div className="flex flex-col sm:flex-row gap-2">
          <select value={escolha} onChange={(e) => setEscolha(e.target.value)}
            className="h-10 px-3 rounded-lg border border-zinc-300 bg-white text-[14px] outline-none focus:border-pink-400 flex-1 min-w-0">
            <option value="">{acoes === null ? 'Carregando eventos…' : acoes.length ? '— escolher o evento / campanha —' : 'Nenhum evento cadastrado'}</option>
            {(acoes || []).filter((a) => !jaTem.has(a.id)).map((a) => (
              <option key={a.id} value={a.id}>{a.nome} · {rotuloTipo(a.tipo)}{a.data_inicio ? ` · ${a.data_inicio.split('-').reverse().join('/')}` : ''}</option>
            ))}
          </select>
          <button type="button" onClick={lancar} disabled={!escolha || salvando}
            className="h-10 px-4 rounded-lg bg-pink-600 hover:bg-pink-700 text-white text-[13px] font-semibold disabled:opacity-40 flex items-center justify-center gap-1.5 whitespace-nowrap">
            <Plus size={14} /> {salvando ? 'Lançando…' : 'Lançar como custo'}
          </button>
        </div>
      )}
      {msg && <span className={`text-[12.5px] ${msg.tipo === 'ok' ? 'text-green-700' : 'text-red-600'}`}>{msg.texto}</span>}
    </div>
  );
}
