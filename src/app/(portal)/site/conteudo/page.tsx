'use client';
// Site → Conteúdo e publicar (José, 10/11/2026): "área gerencial do site… alterar tudo por lá, não só por código".
// Cada seção grava aqui; o botão Publicar manda o site ser gerado de novo com esse conteúdo (~2 min).
import { useCallback, useEffect, useState } from 'react';
import { fetchAuth } from '@/lib/auth/client';
import { SECOES, type Campo, type GrupoConteudo } from '@/lib/site/conteudo';
import { Aviso, ComoLer, botao, campo, cartao, quando, tela } from '@/components/site/ui';

type Valores = Record<string, Record<string, unknown>>;
type Publicacao = { id: number; pedido_em: string; por: string | null; ok: boolean; resposta: string | null };

export default function ConteudoSitePage() {
  const [padrao, setPadrao] = useState<Valores>({});
  const [salvo, setSalvo] = useState<Record<string, { valor: Record<string, unknown>; atualizado_em: string; atualizado_por: string | null }>>({});
  const [edit, setEdit] = useState<Valores>({});
  const [info, setInfo] = useState<{ erroSite: string; site: string; podeEditar: boolean; podePublicar: boolean; hookConfigurado: boolean; pendente: boolean; publicacoes: Publicacao[] } | null>(null);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState<string | null>(null);
  const [publicando, setPublicando] = useState(false);
  const [msg, setMsg] = useState('');

  const carregar = useCallback(async () => {
    const r = await fetchAuth('/api/site/conteudo');
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) { setErro(j.erro || 'Não consegui carregar o conteúdo.'); return; }
    setErro(''); setPadrao(j.padrao || {}); setSalvo(j.salvo || {});
    setInfo({ erroSite: j.erroSite, site: j.site, podeEditar: j.podeEditar, podePublicar: j.podePublicar, hookConfigurado: j.hookConfigurado, pendente: j.pendente, publicacoes: j.publicacoes || [] });
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { carregar(); }, [carregar]);

  /** Valor mostrado: o que está sendo editado > o que foi salvo > o padrão do site. */
  const valor = (g: GrupoConteudo, c: Campo) => {
    const e = edit[g]?.[c.chave];
    if (e !== undefined) return e;
    const s = salvo[g]?.valor?.[c.chave];
    if (s !== undefined) return s;
    return padrao[g]?.[c.chave] ?? (c.tipo === 'liga' ? false : '');
  };
  const mexeu = (g: GrupoConteudo) => !!edit[g] && Object.keys(edit[g]).length > 0;
  const muda = (g: GrupoConteudo, chave: string, v: unknown) => setEdit((x) => ({ ...x, [g]: { ...(x[g] || {}), [chave]: v } }));

  async function salvar(g: GrupoConteudo) {
    const sec = SECOES.find((s) => s.grupo === g)!;
    const corpo: Record<string, unknown> = {};
    for (const c of sec.campos) corpo[c.chave] = valor(g, c);
    setSalvando(g); setMsg('');
    const r = await fetchAuth('/api/site/conteudo', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ grupo: g, valor: corpo }) });
    const j = await r.json().catch(() => ({}));
    setSalvando(null);
    if (!r.ok || !j.ok) { setMsg(j.erro || 'Não consegui salvar.'); return; }
    setSalvo((s) => ({ ...s, [g]: j.salvo }));
    setEdit((x) => { const n = { ...x }; delete n[g]; return n; });
    setInfo((i) => (i ? { ...i, pendente: true } : i));
    setMsg(`${sec.titulo}: salvo. Toque em "Publicar site" para aparecer no site.`);
  }

  async function publicar() {
    if (!confirm('Publicar o site agora com o conteúdo do portal? Leva uns 2 minutos para aparecer.')) return;
    setPublicando(true); setMsg('');
    const r = await fetchAuth('/api/site/publicar', { method: 'POST' });
    const j = await r.json().catch(() => ({}));
    setPublicando(false);
    setMsg(j.ok ? 'Publicação pedida. Em uns 2 minutos o site novo estará no ar.' : (j.erro || 'Não consegui publicar.'));
    carregar();
  }

  const ultima = info?.publicacoes.find((p) => p.ok);

  return (
    <div style={tela}>
      {erro && <Aviso>{erro}</Aviso>}
      {info?.erroSite && <Aviso>{info.erroSite} Os campos aparecem vazios até o portal conseguir ler o site (variável SITE_URL).</Aviso>}

      <div style={{ ...cartao, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'grid', gap: 2 }}>
          <span style={{ fontWeight: 500, fontSize: 17 }}>
            {info?.pendente ? 'Há mudanças ainda não publicadas' : 'O site está em dia com o portal'}
          </span>
          <span style={{ fontSize: 13, color: 'var(--portal-text-muted, #6b7280)' }}>
            {ultima ? `Última publicação ${quando(ultima.pedido_em)} por ${ultima.por || '—'}` : 'Nenhuma publicação feita pelo portal ainda'}
            {info?.site ? <> · <a href={info.site} target="_blank" rel="noopener">ver o site</a></> : null}
          </span>
        </div>
        {info?.podePublicar && (
          <button style={{ ...botao(info.pendente ? '#dc2626' : '#111111'), minHeight: 44, opacity: publicando ? 0.6 : 1 }} disabled={publicando} onClick={publicar}>
            <i className="fa-solid fa-rocket" style={{ fontWeight: 900 }} /> {publicando ? 'Publicando…' : 'Publicar site'}
          </button>
        )}
      </div>
      {info && !info.hookConfigurado && <Aviso tom="info">Para o botão Publicar funcionar, falta configurar <b>SITE_DEPLOY_HOOK</b> no portal (Cloudflare Pages → projeto do site → Settings → Builds → Deploy hooks). Dá para editar e salvar mesmo assim.</Aviso>}
      {msg && <Aviso tom="info">{msg}</Aviso>}

      <ComoLer>
        Aqui ficam os textos e números que mudam com frequência: telefones, horário, o topo da página inicial, a frase de cada banner e uma
        faixa de aviso no topo do site (feriado, feira, promoção). Mude, toque em <b>Salvar</b> na seção e depois em <b>Publicar site</b>: o site
        é gerado de novo com o conteúdo do portal em uns 2 minutos. Campo vazio volta ao texto padrão do site. Preço, selo e esconder produto ficam
        na aba <b>Catálogo do site</b> e aparecem sem precisar publicar.
      </ComoLer>

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(min(460px, 100%), 1fr))', alignItems: 'start' }}>
        {SECOES.map((sec) => (
          <section key={sec.grupo} style={{ ...cartao, display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <span style={{ flex: 'none', width: 40, height: 40, borderRadius: 10, display: 'grid', placeItems: 'center', background: 'color-mix(in srgb, #dc2626 9%, transparent)', color: '#dc2626' }}>
                <i className={`fa-solid ${sec.icone}`} style={{ fontWeight: 900 }} />
              </span>
              <div style={{ display: 'grid' }}>
                <span style={{ fontWeight: 500, fontSize: 16 }}>{sec.titulo}</span>
                <span style={{ fontSize: 13, color: 'var(--portal-text-muted, #6b7280)' }}>{sec.descricao}</span>
              </div>
            </div>
            {sec.campos.map((c) => {
              const v = valor(sec.grupo, c);
              const desab = !info?.podeEditar;
              if (c.tipo === 'liga') {
                return (
                  <label key={c.chave} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 14 }}>
                    <input type="checkbox" disabled={desab} checked={v === true} onChange={(e) => muda(sec.grupo, c.chave, e.target.checked)} style={{ width: 20, height: 20, accentColor: '#dc2626' }} />
                    {c.rotulo}
                  </label>
                );
              }
              const comum = { style: campo, disabled: desab, value: String(v ?? ''), placeholder: String(padrao[sec.grupo]?.[c.chave] ?? ''), onChange: (e: { target: { value: string } }) => muda(sec.grupo, c.chave, e.target.value) };
              return (
                <label key={c.chave} style={{ display: 'grid', gap: 4, fontSize: 13 }}>
                  {c.rotulo}
                  {c.tipo === 'longo' ? <textarea rows={2} {...comum} /> : <input inputMode={c.tipo === 'telefone' ? 'tel' : undefined} {...comum} />}
                  {c.ajuda && <span style={{ fontSize: 12, color: 'var(--portal-text-muted, #6b7280)' }}>{c.ajuda}</span>}
                </label>
              );
            })}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {info?.podeEditar && <button style={{ ...botao(), opacity: mexeu(sec.grupo) ? 1 : 0.5 }} disabled={!mexeu(sec.grupo) || salvando === sec.grupo} onClick={() => salvar(sec.grupo)}>{salvando === sec.grupo ? 'Salvando…' : 'Salvar'}</button>}
              {mexeu(sec.grupo) && <button style={botao('#dc2626', false)} onClick={() => setEdit((x) => { const n = { ...x }; delete n[sec.grupo]; return n; })}>Desfazer</button>}
              {salvo[sec.grupo] && <span style={{ fontSize: 12, color: 'var(--portal-text-muted, #6b7280)' }}>Mudado por {salvo[sec.grupo].atualizado_por || '—'} {quando(salvo[sec.grupo].atualizado_em)}</span>}
            </div>
          </section>
        ))}
      </div>

      {!!info?.publicacoes.length && (
        <div style={cartao}>
          <div style={{ fontWeight: 500, marginBottom: 8 }}>Últimas publicações</div>
          {info.publicacoes.map((p) => (
            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '6px 0', borderTop: '1px solid var(--border)', fontSize: 13 }}>
              <span>{new Date(p.pedido_em).toLocaleString('pt-BR')} · {p.por || '—'}</span>
              <span style={{ color: p.ok ? '#15803d' : '#dc2626' }}>{p.ok ? 'Publicado' : `Falhou: ${p.resposta || ''}`}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
