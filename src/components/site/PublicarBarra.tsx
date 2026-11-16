'use client';
// Barra "Publicar site" das telas Catálogo e Promoções (12/11/2026): diz se há mudança gravada que ainda não está no
// site e publica (o site é gerado de novo em ~2 min). Preço, selo e pronta entrega já aparecem sem publicar.
import { useCallback, useEffect, useState } from 'react';
import { fetchAuth } from '@/lib/auth/client';
import { botao, cartao, quando } from './ui';

type Estado = { pendente: boolean; ultima: { pedido_em: string; por: string | null } | null; podePublicar: boolean; hookConfigurado: boolean };

/** `versao` muda depois de cada gravação na tela → a barra confere de novo. */
export default function PublicarBarra({ versao = 0 }: { versao?: number }) {
  const [e, setE] = useState<Estado | null>(null);
  const [publicando, setPublicando] = useState(false);
  const [msg, setMsg] = useState('');

  const carregar = useCallback(async () => {
    const r = await fetchAuth('/api/site/publicar');
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.ok) setE(j);
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { carregar(); }, [carregar, versao]);

  async function publicar() {
    setPublicando(true); setMsg('');
    const r = await fetchAuth('/api/site/publicar', { method: 'POST' });
    const j = await r.json().catch(() => ({}));
    setPublicando(false);
    setMsg(r.ok && j.ok ? 'Pronto: o site está sendo gerado de novo e fica no ar em uns 2 minutos.' : j.erro || 'Não consegui publicar.');
    carregar();
  }

  if (!e) return null;
  const cor = e.pendente ? '#d97706' : '#16a34a';
  return (
    <div style={{ ...cartao, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', borderColor: `color-mix(in srgb, ${cor} 45%, var(--border))`, background: `color-mix(in srgb, ${cor} 7%, var(--surface))` }}>
      <i className={`fa-solid ${e.pendente ? 'fa-cloud-arrow-up' : 'fa-circle-check'}`} style={{ fontWeight: 900, color: cor, fontSize: 18 }} />
      <span style={{ flex: '1 1 220px', fontSize: 14, display: 'grid' }}>
        <b style={{ fontWeight: 500 }}>{e.pendente ? 'Tem mudança gravada que ainda não está no site' : 'O site está com tudo o que foi gravado aqui'}</b>
        <span style={{ fontSize: 12, color: 'var(--portal-text-muted, #6b7280)' }}>
          {msg || (e.ultima ? `Última publicação ${quando(e.ultima.pedido_em)}${e.ultima.por ? ` por ${e.ultima.por}` : ''}.` : 'O site ainda não foi publicado pelo portal.')}
          {e.pendente && !msg && ' Textos, fotos, máquinas novas e promoções só aparecem depois de publicar.'}
        </span>
      </span>
      {e.podePublicar && (
        <button style={botao(e.pendente ? '#d97706' : '#16a34a', e.pendente)} disabled={publicando || !e.hookConfigurado} onClick={publicar}
          title={e.hookConfigurado ? undefined : 'Falta configurar SITE_DEPLOY_HOOK no portal'}>
          <i className="fa-solid fa-rocket" style={{ fontWeight: 900 }} />{publicando ? 'Publicando…' : 'Publicar site'}
        </button>
      )}
      {e.podePublicar && !e.hookConfigurado && <span style={{ flexBasis: '100%', fontSize: 12, color: 'var(--portal-text-muted, #6b7280)' }}>O botão liga quando o T.I. configurar o SITE_DEPLOY_HOOK (Cloudflare Pages).</span>}
    </div>
  );
}
