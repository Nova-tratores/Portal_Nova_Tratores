'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
// Avaliação pós-evento. Várias pessoas respondem a mesma ação (vendedor,
// marketing, diretoria) — por isso é tabela e não campo da ação. E é o que faz
// a memória do evento sobreviver à saída de quem organizou.
import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import { gateBtn, estiloSemPermissao } from '@/lib/permissoes/ui';
import { REPETIR_OPCOES, rotulo } from '@/lib/marketing/tipos';
import { apiEnviar, dataBR, Painel, Titulo, Campo, estiloInput, BotaoRosa, Vazio, Erro, ROSA } from '../ui';

const NOTAS = [
  { k: 'nota_geral', label: 'Avaliação geral' },
  { k: 'nota_publico', label: 'Público' },
  { k: 'nota_estrutura', label: 'Estrutura / estande' },
  { k: 'nota_equipe', label: 'Equipe' },
  { k: 'nota_retorno', label: 'Retorno comercial' },
];

function Estrelas({ valor, onMuda, editavel }: { valor: number | null; onMuda: (n: number) => void; editavel: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 3 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!editavel}
          onClick={() => onMuda(n)}
          title={`${n} de 5`}
          style={{
            width: 28, height: 28, borderRadius: 3, cursor: editavel ? 'pointer' : 'default',
            border: '1px solid var(--portal-border)',
            background: (valor ?? 0) >= n ? ROSA : 'var(--portal-bg-card)',
            color: (valor ?? 0) >= n ? '#111111' : 'var(--portal-text-muted, #94a3b8)',
            fontSize: 12, fontWeight: 700,
          }}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

export default function AvaliacaoAba({
  acaoId, avaliacoes, onMudou,
}: { acaoId: string; avaliacoes: any[]; onMudou: () => void }) {
  const { userProfile } = useAuth();
  const { pode } = usePermissoes(userProfile?.id);
  const podeResponder = pode('marketing', 'avaliacao:responder');

  const minha = avaliacoes.find((a) => a.avaliador_id === userProfile?.id);
  const [f, setF] = useState<any>(() => ({
    nota_geral: minha?.nota_geral ?? null,
    nota_publico: minha?.nota_publico ?? null,
    nota_estrutura: minha?.nota_estrutura ?? null,
    nota_equipe: minha?.nota_equipe ?? null,
    nota_retorno: minha?.nota_retorno ?? null,
    funcionou: minha?.funcionou ?? '',
    nao_funcionou: minha?.nao_funcionou ?? '',
    aprendizados: minha?.aprendizados ?? '',
    repetir: minha?.repetir ?? '',
  }));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  const set = (k: string, v: any) => { setF((s: any) => ({ ...s, [k]: v })); setSalvo(false); };

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      await apiEnviar('/api/marketing/avaliacoes', 'POST', { ...f, acao_id: acaoId });
      setSalvo(true);
      onMudou();
    } catch (e2: any) {
      setErro(e2?.message || 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  };

  const outras = avaliacoes.filter((a) => a.avaliador_id !== userProfile?.id);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Painel>
        <Titulo>{minha ? 'Sua avaliação' : 'Avalie esta ação'}</Titulo>
        <form onSubmit={salvar} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
            {NOTAS.map((n) => (
              <div key={n.k} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--portal-text)' }}>{n.label}</span>
                <Estrelas valor={f[n.k]} onMuda={(v) => set(n.k, v)} editavel={podeResponder} />
              </div>
            ))}
          </div>

          <Campo label="O que funcionou" largura="1 1 100%">
            <textarea rows={2} disabled={!podeResponder} style={{ ...estiloInput, resize: 'vertical' }} value={f.funcionou} onChange={(e) => set('funcionou', e.target.value)} />
          </Campo>
          <Campo label="O que fazer diferente" largura="1 1 100%">
            <textarea rows={2} disabled={!podeResponder} style={{ ...estiloInput, resize: 'vertical' }} value={f.nao_funcionou} onChange={(e) => set('nao_funcionou', e.target.value)} />
          </Campo>
          <Campo label="Aprendizados" ajuda="O que a próxima pessoa precisa saber. Esta resposta sobrevive à sua saída." largura="1 1 100%">
            <textarea rows={2} disabled={!podeResponder} style={{ ...estiloInput, resize: 'vertical' }} value={f.aprendizados} onChange={(e) => set('aprendizados', e.target.value)} />
          </Campo>
          <Campo label="Participaria de novo?" largura="1 1 260px">
            <select disabled={!podeResponder} style={estiloInput} value={f.repetir} onChange={(e) => set('repetir', e.target.value)}>
              <option value="">— não respondido —</option>
              {REPETIR_OPCOES.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </Campo>

          {erro && <Erro>{erro}</Erro>}
          {salvo && <div style={{ fontSize: 13, color: '#16a34a', fontWeight: 700 }}>Avaliação salva.</div>}

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            {/* gateBtn já leva o `salvando` como disabled base — não repetir. */}
            <BotaoRosa tipo="submit" {...gateBtn(podeResponder, salvando)} style={estiloSemPermissao(podeResponder)}>
              {salvando ? 'Salvando…' : minha ? 'Atualizar minha avaliação' : 'Salvar avaliação'}
            </BotaoRosa>
          </div>
        </form>
      </Painel>

      {outras.length === 0 ? (
        <Vazio>Ninguém mais avaliou esta ação ainda.</Vazio>
      ) : (
        outras.map((a) => (
          <Painel key={a.id}>
            <Titulo>{a.avaliador_nome} · {dataBR(a.criado_em)}</Titulo>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 13, color: 'var(--portal-text)', marginBottom: 8 }}>
              {NOTAS.filter((n) => a[n.k]).map((n) => (
                <span key={n.k}>{n.label}: <b>{a[n.k]}/5</b></span>
              ))}
            </div>
            {a.funcionou && <div style={{ fontSize: 13, color: 'var(--portal-text)' }}><b>Funcionou:</b> {a.funcionou}</div>}
            {a.nao_funcionou && <div style={{ fontSize: 13, color: 'var(--portal-text)' }}><b>Fazer diferente:</b> {a.nao_funcionou}</div>}
            {a.aprendizados && <div style={{ fontSize: 13, color: 'var(--portal-text)' }}><b>Aprendizados:</b> {a.aprendizados}</div>}
            {a.repetir && <div style={{ fontSize: 13, color: 'var(--portal-text)' }}><b>Repetiria:</b> {rotulo(REPETIR_OPCOES, a.repetir)}</div>}
          </Painel>
        ))
      )}
    </div>
  );
}
