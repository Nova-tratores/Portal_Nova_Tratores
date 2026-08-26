'use client';
// Ações da página pública de rastreio: identifica pela sessão Supabase do
// NAVEGADOR (mesmas credenciais do portal e do app dos mecânicos — padrão do
// /carrinho/[token]); sem sessão, mini-login inline. Os botões variam pelo
// estado; a validação de verdade é do servidor (/api/pecas/unidades/[id]/acoes).
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { authHeaders } from '@/lib/auth/client';
import FormRetirada, { type DadosRetirada } from './FormRetirada';
import type { DestinoTipo, UnidadeStatus } from '@/lib/pecas/unidades';

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

  // form de retirada (destino, OS/pedido, criação de um ou de outro)
  const [formAberto, setFormAberto] = useState(false);

  const [enviando, setEnviando] = useState('');
  const [erro, setErro] = useState('');
  const [recado, setRecado] = useState('');

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
      // liberar devolve em que pedido a peça entrou (e o aviso quando algo não
      // saiu redondo, ex.: peça sem preço de venda). Recarregar por cima disso
      // apagaria o recado antes de alguém ler — só segue sozinho quando não há.
      const recadoPpv = j.ppv
        ? `${j.ppvCriado ? 'Pedido criado' : 'Peça lançada no pedido'} ${j.ppv}.`
        : '';
      if (recadoPpv || j.aviso) {
        setRecado([recadoPpv, j.aviso].filter(Boolean).join(' '));
        return;
      }
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
      {recado && (
        <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 10, padding: '10px 12px', marginBottom: 10 }}>
          <div style={{ fontSize: 12.5, color: '#065f46', fontWeight: 700, lineHeight: 1.5 }}>{recado}</div>
          <button onClick={() => window.location.reload()} style={{ ...btnSec, marginTop: 8 }}>Atualizar a página</button>
        </div>
      )}

      {/* estoque → peguei */}
      {status === 'estoque' && !formAberto && (
        <button onClick={() => setFormAberto(true)} style={btn('#16a34a')}>🤚 Peguei esta peça</button>
      )}
      {status === 'estoque' && formAberto && (
        <FormRetirada
          nome={nome}
          enviando={enviando === 'retirar'}
          onConfirmar={(d: DadosRetirada) => agir('retirar', { ...d })}
          onVoltar={() => setFormAberto(false)}
        />
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
