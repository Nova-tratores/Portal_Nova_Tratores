'use client';
// Ações da página pública de rastreio: identifica pela sessão Supabase do
// NAVEGADOR (mesmas credenciais do portal e do app dos mecânicos — padrão do
// /carrinho/[token]); sem sessão, mini-login inline. Os botões variam pelo
// estado; a validação de verdade é do servidor (/api/pecas/unidades/[id]/acoes).
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { authHeaders } from '@/lib/auth/client';
import type { DestinoTipo, UnidadeStatus } from '@/lib/pecas/unidades';

interface OSAberta { id: string; cliente: string; status: string }

const btn = (bg: string, cor = '#fff'): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  padding: '10px 16px', borderRadius: 10, border: 'none', background: bg, color: cor,
  fontSize: 14, fontWeight: 800, cursor: 'pointer', width: '100%',
});
const btnSec: React.CSSProperties = {
  ...btn('#fff', '#334155'), border: '1px solid #cbd5e1', fontWeight: 700, fontSize: 13,
};
const inp: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10,
  border: '1px solid #cbd5e1', fontSize: 14, background: '#fff', color: '#0f172a',
};

export default function AcoesUnidade({ unidadeId, numero, status, destinoTipo, retiradoPor }: {
  unidadeId: string;
  numero: string;
  status: UnidadeStatus;
  destinoTipo: DestinoTipo | null;
  retiradoPor: string | null;
}) {
  const [userId, setUserId] = useState<string | null>(null);
  const [nome, setNome] = useState('');
  const [podeLiberar, setPodeLiberar] = useState(false);
  const [carregouSessao, setCarregouSessao] = useState(false);

  // mini-login
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [entrando, setEntrando] = useState(false);

  // form de retirada
  const [formAberto, setFormAberto] = useState(false);
  const [destino, setDestino] = useState<DestinoTipo>('os');
  const [oss, setOss] = useState<OSAberta[]>([]);
  const [osSel, setOsSel] = useState('');
  const [filtroOs, setFiltroOs] = useState('');
  const [obs, setObs] = useState('');

  const [enviando, setEnviando] = useState('');
  const [erro, setErro] = useState('');

  const carregarSessao = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) { setUserId(null); return; }
      setUserId(session.user.id);
      const { data: prof } = await supabase.from('financeiro_usu').select('nome').eq('id', session.user.id).maybeSingle();
      setNome(prof?.nome || session.user.email || 'Usuário');
      const { data: perm } = await supabase
        .from('portal_permissoes')
        .select('is_admin, is_dev, modulos_permitidos')
        .eq('user_id', session.user.id)
        .maybeSingle();
      const mods: string[] = perm?.modulos_permitidos || [];
      setPodeLiberar(perm?.is_admin === true || perm?.is_dev === true || mods.includes('ppv') || mods.includes('ppv:rastreio_liberar'));
    } finally {
      setCarregouSessao(true);
    }
  }, []);

  useEffect(() => { carregarSessao(); }, [carregarSessao]);

  // OSs abertas pro select do destino (rota existente do PPV)
  useEffect(() => {
    if (!formAberto || oss.length > 0) return;
    (async () => {
      try {
        const r = await fetch('/api/ppv/ordens-servico?abertas=1');
        const j = await r.json();
        if (r.ok && Array.isArray(j.ordens || j)) setOss(j.ordens || j);
      } catch { /* select fica vazio; dá pra digitar depois */ }
    })();
  }, [formAberto, oss.length]);

  const entrar = async () => {
    setEntrando(true);
    setErro('');
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
      if (error) { setErro('E-mail ou senha inválidos.'); return; }
      await carregarSessao();
    } finally {
      setEntrando(false);
    }
  };

  const agir = async (acao: string, extra: Record<string, unknown> = {}) => {
    setEnviando(acao);
    setErro('');
    try {
      const r = await fetch(`/api/pecas/unidades/${unidadeId}/acoes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ acao, ...extra }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(j.error || 'Falha na ação.'); return; }
      window.location.reload();
    } catch {
      setErro('Erro de conexão.');
    } finally {
      setEnviando('');
    }
  };

  const card: React.CSSProperties = { background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 16, marginTop: 12 };

  if (!carregouSessao) return null;

  // terminais sem ação pra ninguém
  if (status === 'cancelada' || (status === 'aplicada' && !podeLiberar)) return null;

  // ── sem sessão: mini-login ────────────────────────────────────────────────
  if (!userId) {
    if (status === 'aplicada') return null;
    return (
      <div style={card}>
        <div style={{ fontSize: 13.5, fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>
          {status === 'estoque' ? 'Vai pegar esta peça?' : 'Entrar para agir'}
        </div>
        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10, lineHeight: 1.5 }}>
          Entre com o mesmo e-mail e senha do portal / app dos mecânicos.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input type="email" placeholder="E-mail" value={email} onChange={e => setEmail(e.target.value)} style={inp} autoComplete="email" />
          <input type="password" placeholder="Senha" value={senha} onChange={e => setSenha(e.target.value)} style={inp} autoComplete="current-password"
            onKeyDown={e => { if (e.key === 'Enter') entrar(); }} />
          {erro && <div style={{ fontSize: 12.5, color: '#dc2626', fontWeight: 700 }}>{erro}</div>}
          <button onClick={entrar} disabled={entrando || !email.trim() || !senha} style={btn('#C41E2A')}>
            {entrando ? 'Entrando…' : 'Entrar'}
          </button>
        </div>
      </div>
    );
  }

  const souRetirador = !!retiradoPor && retiradoPor === userId;

  return (
    <div style={card}>
      <div style={{ fontSize: 11.5, color: '#94a3b8', marginBottom: 10 }}>
        Logado como <strong style={{ color: '#334155' }}>{nome}</strong>
      </div>
      {erro && <div style={{ fontSize: 12.5, color: '#dc2626', fontWeight: 700, marginBottom: 8 }}>{erro}</div>}

      {/* estoque → peguei */}
      {status === 'estoque' && !formAberto && (
        <button onClick={() => setFormAberto(true)} style={btn('#16a34a')}>🤚 Peguei esta peça</button>
      )}
      {status === 'estoque' && formAberto && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>Pra onde vai a peça?</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {([['os', 'Ordem de serviço'], ['balcao', 'Venda balcão'], ['uso_interno', 'Uso interno']] as [DestinoTipo, string][]).map(([v, rot]) => (
              <button key={v} onClick={() => setDestino(v)} style={{
                padding: '7px 12px', borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                border: destino === v ? '2px solid #C41E2A' : '1px solid #cbd5e1',
                background: destino === v ? '#fef2f2' : '#fff', color: destino === v ? '#C41E2A' : '#334155',
              }}>{rot}</button>
            ))}
          </div>
          {destino === 'os' && (
            <>
              <input placeholder="Filtrar OS (nº ou cliente)…" value={filtroOs} onChange={e => setFiltroOs(e.target.value)} style={inp} />
              <select value={osSel} onChange={e => setOsSel(e.target.value)} style={inp}>
                <option value="">Selecione a OS…</option>
                {oss
                  .filter(o => !filtroOs.trim() || `${o.id} ${o.cliente}`.toLowerCase().includes(filtroOs.trim().toLowerCase()))
                  .slice(0, 80)
                  .map(o => <option key={o.id} value={o.id}>{o.id} · {o.cliente}</option>)}
              </select>
            </>
          )}
          <input placeholder="Observação (opcional)" value={obs} onChange={e => setObs(e.target.value)} style={inp} />
          <button
            onClick={() => agir('retirar', { destino_tipo: destino, destino_os: destino === 'os' ? osSel : undefined, obs })}
            disabled={!!enviando || (destino === 'os' && !osSel)}
            style={btn('#16a34a')}
          >
            {enviando === 'retirar' ? 'Registrando…' : 'Confirmar retirada'}
          </button>
          <button onClick={() => setFormAberto(false)} style={btnSec}>Voltar</button>
        </div>
      )}

      {/* retirada_pendente */}
      {status === 'retirada_pendente' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {podeLiberar && (
            <>
              <button onClick={() => agir('liberar')} disabled={!!enviando} style={btn('#2563eb')}>
                {enviando === 'liberar' ? 'Liberando…' : '✓ Liberar retirada'}
              </button>
              {/* OS abate pelo relatório do técnico; PPV aplica só no faturamento
                  (aplicar direto aqui viraria "vendida" sem NF) */}
              {destinoTipo !== 'os' && destinoTipo !== 'ppv' && (
                <button onClick={() => agir('liberar', { aplicar_direto: true })} disabled={!!enviando} style={btnSec}>
                  Liberar e já concluir (entregue)
                </button>
              )}
              <button
                onClick={() => { const m = prompt('Motivo da recusa:'); if (m != null && m.trim()) agir('recusar', { motivo: m.trim() }); }}
                disabled={!!enviando}
                style={btnSec}
              >✕ Recusar</button>
            </>
          )}
          {souRetirador && (
            <button onClick={() => agir('cancelar_retirada')} disabled={!!enviando} style={btnSec}>Cancelar minha retirada</button>
          )}
          {!podeLiberar && !souRetirador && (
            <div style={{ fontSize: 12.5, color: '#64748b' }}>Aguardando o departamento de peças liberar.</div>
          )}
        </div>
      )}

      {/* liberada */}
      {status === 'liberada' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {destinoTipo === 'os' && (
            <div style={{ fontSize: 12.5, color: '#64748b', lineHeight: 1.5 }}>
              O abate acontece sozinho quando o técnico enviar o relatório da OS marcando a peça como usada.
            </div>
          )}
          {podeLiberar && (
            <button onClick={() => agir('concluir')} disabled={!!enviando} style={btn('#111827')}>
              {enviando === 'concluir' ? 'Concluindo…' : 'Concluir (peça aplicada)'}
            </button>
          )}
          {(podeLiberar || souRetirador) && (
            <button
              onClick={() => { const m = prompt('Motivo da devolução (opcional):') || ''; agir('devolver', { motivo: m.trim() }); }}
              disabled={!!enviando}
              style={btnSec}
            >Registrar devolução</button>
          )}
        </div>
      )}

      {/* devolucao_pendente */}
      {status === 'devolucao_pendente' && (
        podeLiberar
          ? <button onClick={() => agir('receber_devolucao')} disabled={!!enviando} style={btn('#16a34a')}>
              {enviando === 'receber_devolucao' ? 'Confirmando…' : '✓ Confirmar devolução recebida (volta ao estoque)'}
            </button>
          : <div style={{ fontSize: 12.5, color: '#64748b' }}>Leve a peça de volta ao balcão pra conferência.</div>
      )}

      {/* extraviada / aplicada (só liberador vê ações extras) */}
      {status === 'extraviada' && podeLiberar && (
        <button onClick={() => agir('recuperar')} disabled={!!enviando} style={btn('#16a34a')}>Recuperar pro estoque</button>
      )}
      {(status === 'retirada_pendente' || status === 'liberada' || status === 'devolucao_pendente') && podeLiberar && (
        <button
          onClick={() => { if (confirm(`Marcar a ${numero} como extraviada?`)) agir('extraviar'); }}
          disabled={!!enviando}
          style={{ ...btnSec, marginTop: 8, color: '#dc2626', borderColor: '#fca5a5' }}
        >Marcar extraviada</button>
      )}
      {status === 'estoque' && podeLiberar && !formAberto && (
        <button
          onClick={() => { const m = prompt('Motivo do cancelamento (opcional):') || ''; if (confirm(`Cancelar a unidade ${numero}? (etiqueta deixa de valer)`)) agir('cancelar', { motivo: m.trim() }); }}
          disabled={!!enviando}
          style={{ ...btnSec, marginTop: 8, color: '#dc2626', borderColor: '#fca5a5' }}
        >Cancelar unidade</button>
      )}
    </div>
  );
}
