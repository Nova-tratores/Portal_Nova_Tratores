'use client';
// Site → Conteúdo e publicar (José, 10/11/2026): "área gerencial do site… alterar tudo por lá, não só por código".
// 12/11 ("tá muito difícil de entender"): estilo NewPortal, organizado por PARTE DO SITE. Cada parte é um cartão que diz
// onde aparece e o que está lá hoje; ao tocar, abre o editor com a explicação de cada campo e a prévia de computador e
// celular daquele pedaço. Gravar → Publicar site (barra no alto, igual Catálogo e Promoções).
import { useCallback, useEffect, useState } from 'react';
import { fetchAuth } from '@/lib/auth/client';
import { SECOES, type Campo as CampoDef, type GrupoConteudo } from '@/lib/site/conteudo';
import { Aviso, ComoLer, quando, tela } from '@/components/site/ui';
import PublicarBarra from '@/components/site/PublicarBarra';
import SubAbas from '@/components/site/SubAbas';
import { ABAS_CONTEUDO } from '@/components/site/abasConteudo';
import { PreviaConteudo } from '@/components/site/Previa';
import { Campo, Quadradinho, Secao, T1, T2, T3, bt, campoNP, cartaoNP, grade, ic } from '@/components/site/np';

type Valores = Record<string, Record<string, unknown>>;

/** Onde cada parte aparece no site e a cor do cartão (a ordem é a do site, de cima para baixo). */
const PARTES: Record<GrupoConteudo, { onde: string; cor: string }> = {
  aviso: { onde: 'Faixa vermelha no alto de todas as páginas', cor: '#dc2626' },
  home: { onde: 'Texto grande por cima do vídeo, na página inicial', cor: '#7c3aed' },
  banners: { onde: 'A frase embaixo do título no topo de cada página', cor: '#0284c7' },
  contato: { onde: 'Rodapé, página Contato, botões de WhatsApp e ligar', cor: '#16a34a' },
  horario: { onde: 'Rodapé, página Contato e o aviso “aberto agora”', cor: '#d97706' },
};
const ORDEM: GrupoConteudo[] = ['aviso', 'home', 'banners', 'contato', 'horario'];

export default function TextosSite() {
  const [padrao, setPadrao] = useState<Valores>({});
  const [salvo, setSalvo] = useState<Record<string, { valor: Record<string, unknown>; atualizado_em: string; atualizado_por: string | null }>>({});
  const [edit, setEdit] = useState<Valores>({});
  const [podeEditar, setPodeEditar] = useState(false);
  const [erroSite, setErroSite] = useState('');
  const [erro, setErro] = useState('');
  const [aberto, setAberto] = useState<GrupoConteudo | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState('');
  const [versao, setVersao] = useState(0);

  const carregar = useCallback(async () => {
    const r = await fetchAuth('/api/site/conteudo');
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) { setErro(j.erro || 'Não consegui carregar o conteúdo.'); return; }
    setErro(''); setPadrao(j.padrao || {}); setSalvo(j.salvo || {}); setPodeEditar(!!j.podeEditar); setErroSite(j.erroSite || '');
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { carregar(); }, [carregar]);

  /** Valor mostrado: o que está sendo editado > o que foi gravado > o texto de hoje no site. */
  const valor = (g: GrupoConteudo, c: CampoDef) => {
    const e = edit[g]?.[c.chave];
    if (e !== undefined) return e;
    const s = salvo[g]?.valor?.[c.chave];
    if (s !== undefined) return s;
    return padrao[g]?.[c.chave] ?? (c.tipo === 'liga' ? false : '');
  };
  const valoresDe = (g: GrupoConteudo) => Object.fromEntries(SECOES.find((s) => s.grupo === g)!.campos.map((c) => [c.chave, valor(g, c)]));
  const todos = (): Valores => Object.fromEntries(ORDEM.map((g) => [g, valoresDe(g)]));
  const mexeu = (g: GrupoConteudo) => !!edit[g] && Object.keys(edit[g]).length > 0;
  const muda = (g: GrupoConteudo, chave: string, v: unknown) => setEdit((x) => ({ ...x, [g]: { ...(x[g] || {}), [chave]: v } }));

  /** Uma linha com o que está no site hoje, para o cartão. */
  function resumo(g: GrupoConteudo): string {
    const v = valoresDe(g);
    if (g === 'aviso') return v.ligado === true && String(v.texto || '').trim() ? `Ligada: “${v.texto}”` : 'Desligada: não aparece no site';
    if (g === 'home') return `“${v.titulo}”`;
    if (g === 'contato') return `WhatsApp ${v.whatsapp} · ${v.endereco}, ${v.cidade}/${v.uf}`;
    if (g === 'horario') return `Seg a sex ${String(v.manha).replace('-', '–')} e ${String(v.tarde).replace('-', '–')} · sábado ${v.sabado ? String(v.sabado).replace('-', '–') : 'fechado'}`;
    return '5 páginas: Crédito, Pós-venda, Peças, Contato, Implementos';
  }

  function abrir(g: GrupoConteudo) {
    setAberto(g); setMsg('');
    setTimeout(() => document.getElementById('editor-conteudo')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }

  async function gravar(g: GrupoConteudo) {
    setSalvando(true); setMsg('');
    const r = await fetchAuth('/api/site/conteudo', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ grupo: g, valor: valoresDe(g) }) });
    const j = await r.json().catch(() => ({}));
    setSalvando(false);
    if (!r.ok || !j.ok) { setMsg(j.erro || 'Não consegui gravar.'); return; }
    setSalvo((s) => ({ ...s, [g]: j.salvo }));
    setEdit((x) => { const n = { ...x }; delete n[g]; return n; });
    setVersao((n) => n + 1);
    setAberto(null);
  }

  const sec = aberto ? SECOES.find((s) => s.grupo === aberto)! : null;

  return (
    <div style={{ ...tela, color: T1 }}>
      <SubAbas abas={ABAS_CONTEUDO} />
      {erro && <Aviso>{erro}</Aviso>}
      {erroSite && <Aviso>{erroSite} Os campos aparecem vazios até o portal conseguir ler o site (variável SITE_URL).</Aviso>}
      <PublicarBarra versao={versao} />


      <div style={grade(280)}>
        {ORDEM.map((g) => {
          const s = SECOES.find((x) => x.grupo === g)!;
          const p = PARTES[g];
          const ativo = aberto === g;
          return (
            <button key={g} type="button" onClick={() => (ativo ? setAberto(null) : abrir(g))}
              style={{ ...cartaoNP, display: 'grid', gap: 10, alignContent: 'start', textAlign: 'left', cursor: 'pointer', font: 'inherit', color: T1,
                borderColor: ativo ? p.cor : 'var(--border)', boxShadow: ativo ? `0 0 0 1px ${p.cor}` : 'none', transition: 'transform .25s, box-shadow .25s' }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; }} onMouseLeave={(e) => { e.currentTarget.style.transform = ''; }}>
              <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <Quadradinho icone={s.icone} cor={p.cor} />
                <span style={{ display: 'grid', minWidth: 0 }}>
                  <span style={{ fontSize: 15.5, fontWeight: 500 }}>{s.titulo}</span>
                  <span style={{ fontSize: 12.5, color: T3 }}>{p.onde}</span>
                </span>
              </span>
              <span style={{ fontSize: 13, color: T2, lineHeight: 1.45, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{resumo(g)}</span>
              <span style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: T3 }}>
                {mexeu(g) ? <span style={{ color: '#b45309' }}>{ic('fa-pen')} mudança não gravada</span>
                  : salvo[g] ? <span>Mudado por {salvo[g].atualizado_por || '—'} {quando(salvo[g].atualizado_em)}</span>
                  : <span>Texto original do site</span>}
                <span style={{ marginLeft: 'auto', color: p.cor, fontWeight: 500 }}>{ativo ? 'Fechar' : 'Mudar'} {ic(ativo ? 'fa-chevron-up' : 'fa-chevron-right')}</span>
              </span>
            </button>
          );
        })}
      </div>

      {sec && aberto && (
        <div id="editor-conteudo" style={{ display: 'grid', gap: 14, scrollMarginTop: 80 }}>
          <Secao icone={sec.icone} cor={PARTES[aberto].cor} titulo={sec.titulo} sub={`${PARTES[aberto].onde}. ${sec.descricao}`}>
            <fieldset disabled={!podeEditar || salvando} style={{ border: 0, padding: 0, margin: 0, minWidth: 0, display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))' }}>
              {sec.campos.map((c) => {
                const v = valor(aberto, c);
                const original = String(padrao[aberto]?.[c.chave] ?? '');
                if (c.tipo === 'liga') {
                  return (
                    <label key={c.chave} style={{ gridColumn: '1 / -1', display: 'flex', gap: 12, alignItems: 'center', padding: '12px 14px', borderRadius: 12, cursor: 'pointer',
                      border: `1px solid ${v === true ? '#16a34a' : 'var(--border)'}`, background: v === true ? 'color-mix(in srgb, #16a34a 7%, var(--surface))' : 'var(--surface)' }}>
                      <input type="checkbox" checked={v === true} onChange={(e) => muda(aberto, c.chave, e.target.checked)} style={{ width: 22, height: 22, accentColor: '#16a34a' }} />
                      <span style={{ display: 'grid' }}>
                        <span style={{ fontSize: 14.5 }}>{v === true ? 'Ligada: a faixa aparece no site' : 'Desligada: a faixa não aparece'}</span>
                        <span style={{ fontSize: 12, color: T3 }}>Marque para mostrar. Desmarque quando o aviso não valer mais.</span>
                      </span>
                    </label>
                  );
                }
                const ajuda = [c.ajuda, original && String(v) !== original ? `Hoje no site: “${original}”` : ''].filter(Boolean).join(' · ');
                return (
                  <Campo key={c.chave} rotulo={c.rotulo} ajuda={ajuda || undefined}>
                    {c.tipo === 'longo'
                      ? <textarea rows={3} style={{ ...campoNP, resize: 'vertical' }} value={String(v ?? '')} placeholder={original} onChange={(e) => muda(aberto, c.chave, e.target.value)} />
                      : <input style={campoNP} inputMode={c.tipo === 'telefone' ? 'tel' : undefined} value={String(v ?? '')} placeholder={original} onChange={(e) => muda(aberto, c.chave, e.target.value)} />}
                  </Campo>
                );
              })}
            </fieldset>
          </Secao>

          <section style={cartaoNP}>
            <PreviaConteudo grupo={aberto} valores={todos()} />
            {aberto === 'aviso' && valoresDe('aviso').ligado !== true && (
              <span style={{ display: 'block', marginTop: 8, fontSize: 12, color: T3 }}>A faixa está desligada, então a prévia mostra o site sem ela. Ligue para ver como fica.</span>
            )}
          </section>

          <section style={{ ...cartaoNP, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            {msg && <span style={{ flexBasis: '100%', color: '#dc2626', fontSize: 13 }}>{ic('fa-circle-exclamation')} {msg}</span>}
            {podeEditar && (
              <button style={{ ...bt('#d97706', true), opacity: mexeu(aberto) ? 1 : 0.5 }} disabled={!mexeu(aberto) || salvando} onClick={() => gravar(aberto)}>
                {ic('fa-floppy-disk')}{salvando ? 'Gravando…' : 'Gravar'}
              </button>
            )}
            {mexeu(aberto) && <button style={bt('#64748b')} onClick={() => setEdit((x) => { const n = { ...x }; delete n[aberto]; return n; })}>{ic('fa-rotate-left')}Desfazer</button>}
            <button style={bt('#64748b')} onClick={() => setAberto(null)}>Fechar</button>
            <span style={{ fontSize: 12, color: T3, marginLeft: 'auto' }}>Depois de gravar, toque em <b style={{ fontWeight: 500 }}>Publicar site</b> (no alto) para ir para o site.</span>
          </section>
        </div>
      )}

      <ComoLer>
        Cada cartão é uma parte do site, na ordem em que aparecem de cima para baixo. Toque em <b>Mudar</b>, troque o texto (embaixo de
        cada campo diz para que serve e o que está no site hoje), confira na <b>prévia</b> e toque em <b>Gravar</b>. As mudanças só vão
        para o site quando alguém toca em <b>Publicar site</b>, no alto da tela; leva uns 2 minutos. Campo vazio volta ao texto original.
        Máquinas, preços e fotos ficam na aba <b>Catálogo do site</b>; o carrossel de ofertas, na aba <b>Promoções</b>.
      </ComoLer>
    </div>
  );
}
