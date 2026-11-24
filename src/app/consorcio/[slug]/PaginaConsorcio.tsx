'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
// A página do cliente: topo com a foto → modelos com parcela → simulador → como é contemplado
// → ficha (número da sorte) → sorteio. Estilo próprio (fica fora do portal, sem as variáveis de tema).
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  lerConfig, parcela, porDia, creditoComEmbutido, totalComTaxas, reais, numeroSorte, type ConfigConsorcio,
} from '@/lib/consorcio/conta';

const VERMELHO = '#C8102E';

function dataLonga(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });
}
function dataHora(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}
function periodo(ini?: string | null, fim?: string | null) {
  if (!ini) return '';
  if (!fim || fim === ini) return dataLonga(ini);
  return `${dataLonga(ini)} a ${dataLonga(fim)}`;
}
/** (43) 99999-9999 enquanto digita */
function mascaraTel(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export default function PaginaConsorcio({ slug, estande }: { slug: string; estande: boolean }) {
  const [dados, setDados] = useState<any>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/consorcio/${encodeURIComponent(slug)}`, { cache: 'no-store' })
      .then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Erro'); setDados(j); })
      .catch((e) => setErroCarga(e.message || 'Não foi possível abrir a página.'));
  }, [slug]);

  if (erroCarga) return <Casca><div className="cs-vazio">{erroCarga}</div></Casca>;
  if (!dados) return <Casca><div className="cs-vazio">Carregando…</div></Casca>;
  return <Casca><Conteudo dados={dados} estande={estande} slug={slug} /></Casca>;
}

function Conteudo({ dados, estande, slug }: { dados: any; estande: boolean; slug: string }) {
  const ev = dados.evento;
  const cfg: ConfigConsorcio = useMemo(() => lerConfig(ev.config), [ev.config]);
  const modelos = cfg.modelos || [];
  const menorDia = modelos.length ? Math.min(...modelos.map((m) => porDia(m.credito, cfg))) : null;
  const fichaRef = useRef<HTMLDivElement>(null);

  // simulador: começa no modelo mais barato (ou 150 mil)
  const [credito, setCredito] = useState<number>(modelos[0]?.credito ?? 150000);
  const [simulou, setSimulou] = useState(false);
  const irParaFicha = () => fichaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const local = [ev.local, ev.cidade].filter(Boolean).join(' · ');

  return (
    <>
      {/* ── Topo ───────────────────────────────────────────── */}
      <header className="cs-hero">
        <div className="cs-hero-in">
          <div className="cs-marca">
            <img src="/Logo_Nova.png" alt="Nova Tratores" />
            <span>Mahindra Consórcio Nacional</span>
          </div>
          {estande && <div className="cs-estande">Modo estande</div>}
          <p className="cs-evento">{ev.nome}{local ? ` · ${local}` : ''}{ev.inicio ? ` · ${periodo(ev.inicio, ev.fim)}` : ''}</p>
          <h1>Seu Mahindra novo,<br /><em>sem juros.</em></h1>
          {menorDia !== null && (
            <p className="cs-sub">Consórcio com parcelas a partir de <strong>{reais(menorDia)} por dia</strong>.</p>
          )}
          {ev.premio && (
            <div className="cs-premio">
              <span>🎁 Cadastre-se e concorra a</span>
              <strong>{ev.premio}</strong>
            </div>
          )}
          <button className="cs-btn" onClick={irParaFicha} disabled={!ev.ativo}>
            {ev.ativo ? 'Quero meu número da sorte' : 'Inscrições encerradas'}
          </button>
        </div>
      </header>

      <main className="cs-main">
        {/* ── Modelos ──────────────────────────────────────── */}
        {modelos.length > 0 && (
          <section>
            <h2>Escolha o seu</h2>
            <p className="cs-legenda">Parcelas em {cfg.prazo_meses} meses, já com seguro de vida.</p>
            <div className="cs-modelos">
              {modelos.map((m) => (
                <article key={m.nome} className="cs-modelo">
                  <h3>{m.nome}</h3>
                  <div className="cs-linha"><span>Crédito</span><strong>{reais(m.credito, 0)}</strong></div>
                  <div className="cs-parcela">{reais(parcela(m.credito, cfg))}<small>/mês</small></div>
                  <div className="cs-dia">ou {reais(porDia(m.credito, cfg))} por dia</div>
                  <div className="cs-linha cs-mini">
                    <span>Usando {cfg.lance_embutido_pct}% de lance embutido, sobra</span>
                    <strong>{reais(creditoComEmbutido(m.credito, cfg), 0)}</strong>
                  </div>
                  <button className="cs-btn-ghost" onClick={() => { setCredito(m.credito); setSimulou(true); document.getElementById('simulador')?.scrollIntoView({ behavior: 'smooth' }); }}>
                    Simular este
                  </button>
                </article>
              ))}
            </div>
          </section>
        )}

        {/* ── Simulador ────────────────────────────────────── */}
        <section id="simulador" className="cs-card">
          <h2>Simule o seu crédito</h2>
          <label className="cs-rotulo" htmlFor="cs-credito">Quanto você quer de crédito?</label>
          <div className="cs-valor">{reais(credito, 0)}</div>
          <input
            id="cs-credito" type="range" min={50000} max={600000} step={1000} value={credito}
            onChange={(e) => { setCredito(Number(e.target.value)); setSimulou(true); }}
            className="cs-range"
          />
          <div className="cs-range-ext"><span>R$ 50 mil</span><span>R$ 600 mil</span></div>
          <div className="cs-sim">
            <div><span>Parcela</span><strong>{reais(parcela(credito, cfg))}</strong></div>
            <div><span>Por dia</span><strong>{reais(porDia(credito, cfg))}</strong></div>
            <div><span>Prazo</span><strong>{cfg.prazo_meses} meses</strong></div>
            <div><span>Total com taxas</span><strong>{reais(totalComTaxas(credito, cfg), 0)}</strong></div>
          </div>
          <p className="cs-obs">
            Sem juros: o custo é a taxa de administração de {cfg.taxa_adm_pct}% + fundo de reserva de {cfg.fundo_reserva_pct}%,
            divididos nas {cfg.prazo_meses} parcelas, e o seguro de vida ({String(cfg.seguro_pct).replace('.', ',')}% ao mês). Valores aproximados.
          </p>
          <button className="cs-btn" onClick={irParaFicha} disabled={!ev.ativo}>Quero esta simulação + número da sorte</button>
        </section>

        {/* ── Como é contemplado ───────────────────────────── */}
        {(cfg.destaques?.length || cfg.grupo) && (
          <section>
            <h2>Como você recebe o trator</h2>
            <ul className="cs-destaques">
              {(cfg.destaques || []).map((d) => <li key={d}>{d}</li>)}
            </ul>
            <div className="cs-grupo">
              {cfg.grupo && <span>Grupo <strong>{cfg.grupo}</strong></span>}
              {cfg.vencimento && <span>Vencimento <strong>{dataLonga(cfg.vencimento)}</strong></span>}
              {cfg.proxima_assembleia && <span>Próxima assembleia <strong>{dataLonga(cfg.proxima_assembleia)}</strong></span>}
            </div>
          </section>
        )}

        {/* ── Ficha ────────────────────────────────────────── */}
        <div ref={fichaRef} style={{ scrollMarginTop: 12 }}>
          <Ficha slug={slug} ev={ev} cfg={cfg} estande={estande} credito={simulou ? credito : null} />
        </div>

        {/* ── Sorteio ──────────────────────────────────────── */}
        {(ev.sorteio_em || dados.ganhadores?.length > 0 || ev.regulamento) && (
          <section className="cs-card">
            <h2>Sorteio</h2>
            {ev.sorteio_em && <p>Será {dataHora(ev.sorteio_em)}, no estande da Nova Tratores.</p>}
            {ev.premio && <p>Prêmio: <strong>{ev.premio}</strong></p>}
            {dados.ganhadores?.length > 0 && (
              <div className="cs-ganhadores">
                {dados.ganhadores.map((g: any) => (
                  <div key={g.numero}><span className="cs-num">{numeroSorte(g.numero)}</span> {g.nome}</div>
                ))}
              </div>
            )}
            {ev.regulamento && (
              <details className="cs-regras"><summary>Regras do sorteio</summary><p>{ev.regulamento}</p></details>
            )}
          </section>
        )}
      </main>

      <footer className="cs-rodape">
        <p>{cfg.administradora || 'Mahindra Consórcio Nacional'}{cfg.grupo ? ` · Grupo ${cfg.grupo}` : ''} · Revenda Nova Tratores</p>
        <p>Valores em reais, parcelas calculadas com seguro. Os valores de referência dos modelos podem mudar conforme os preços praticados
          e estão sujeitos a reajuste sem aviso, de acordo com o fabricante. A simulação não garante contemplação, que acontece só pelos
          meios previstos em contrato e nas normas do Banco Central.</p>
      </footer>
    </>
  );
}

// ── A ficha que dá o número da sorte ──────────────────────────────────────────
function Ficha({ slug, ev, cfg, estande, credito }: { slug: string; ev: any; cfg: ConfigConsorcio; estande: boolean; credito: number | null }) {
  const [vendedor, setVendedor] = useState('');
  const [nome, setNome] = useState('');
  const [tel, setTel] = useState('');
  const [cidade, setCidade] = useState('');
  const [interesse, setInteresse] = useState('');
  const [temTrator, setTemTrator] = useState<boolean | null>(null);
  const [aceite, setAceite] = useState(false);
  const [isca, setIsca] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ numero: number; ja: boolean } | null>(null);

  // o tablet do estande lembra o nome do vendedor
  useEffect(() => { try { setVendedor(localStorage.getItem('cs-vendedor') || ''); } catch { /* sem armazenamento */ } }, []);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (estande && !vendedor.trim()) { setErro('Escreva o seu nome (vendedor) no topo da ficha.'); return; }
    if (!aceite) { setErro('Marque que aceita o contato para participar.'); return; }
    setEnviando(true);
    try {
      if (estande) { try { localStorage.setItem('cs-vendedor', vendedor.trim()); } catch { /* ok */ } }
      const r = await fetch(`/api/consorcio/${encodeURIComponent(slug)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome, telefone: tel, cidade, interesse, tem_trator: temTrator, aceite, credito,
          vendedor: estande ? vendedor : '', site: isca,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Não deu para cadastrar. Tente de novo.');
      setResultado({ numero: j.numero, ja: j.ja_inscrito });
      window.scrollTo({ top: (document.getElementById('cs-ficha')?.offsetTop ?? 0) - 12, behavior: 'smooth' });
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setEnviando(false);
    }
  }

  function proximo() {
    setNome(''); setTel(''); setCidade(''); setInteresse(''); setTemTrator(null); setAceite(false); setResultado(null); setErro(null);
  }

  if (resultado) {
    return (
      <section id="cs-ficha" className="cs-card cs-sorte">
        <p>{resultado.ja ? 'Este telefone já estava cadastrado. O número da sorte é' : 'Pronto! Seu número da sorte é'}</p>
        <div className="cs-sorte-num">{numeroSorte(resultado.numero)}</div>
        {!estande && <p className="cs-obs">Tire um print desta tela. {ev.sorteio_em ? `O sorteio é ${dataHora(ev.sorteio_em)}.` : ''} Um consultor vai te chamar no WhatsApp com a sua simulação.</p>}
        {estande && <button className="cs-btn" onClick={proximo}>Cadastrar o próximo cliente</button>}
      </section>
    );
  }

  return (
    <section id="cs-ficha" className="cs-card">
      <h2>Ganhe seu número da sorte</h2>
      <p className="cs-legenda">Leva 30 segundos. {ev.premio ? `Concorra a ${ev.premio}.` : ''}</p>
      {!ev.ativo ? (
        <div className="cs-vazio">As inscrições deste evento estão encerradas.</div>
      ) : (
        <form onSubmit={enviar} className="cs-form">
          {estande && (
            <label>Vendedor (quem está cadastrando)
              <input value={vendedor} onChange={(e) => setVendedor(e.target.value)} placeholder="Seu nome" />
            </label>
          )}
          <label>Nome completo
            <input value={nome} onChange={(e) => setNome(e.target.value)} required autoComplete="name" />
          </label>
          <label>WhatsApp com DDD
            <input value={tel} onChange={(e) => setTel(mascaraTel(e.target.value))} required inputMode="tel" autoComplete="tel" placeholder="(43) 99999-9999" />
          </label>
          <label>Cidade
            <input value={cidade} onChange={(e) => setCidade(e.target.value)} autoComplete="address-level2" />
          </label>
          <label>Qual trator te interessa?
            <select value={interesse} onChange={(e) => setInteresse(e.target.value)}>
              <option value="">Ainda não sei</option>
              {(cfg.modelos || []).map((m) => <option key={m.nome} value={m.nome}>{m.nome}</option>)}
              <option value="Outro modelo">Outro modelo</option>
            </select>
          </label>
          <div className="cs-pergunta">
            <span>Já tem trator?</span>
            <div className="cs-sn">
              <button type="button" className={temTrator === true ? 'on' : ''} onClick={() => setTemTrator(true)}>Sim</button>
              <button type="button" className={temTrator === false ? 'on' : ''} onClick={() => setTemTrator(false)}>Não</button>
            </div>
          </div>
          {credito && <p className="cs-obs">Sua simulação vai junto: crédito de {reais(credito, 0)} ({reais(parcela(credito, cfg))}/mês).</p>}
          {/* campo-isca: escondido de gente, robô preenche */}
          <input className="cs-isca" tabIndex={-1} autoComplete="off" value={isca} onChange={(e) => setIsca(e.target.value)} aria-hidden="true" name="site" />
          <label className="cs-aceite">
            <input type="checkbox" checked={aceite} onChange={(e) => setAceite(e.target.checked)} />
            <span>Aceito que a Nova Tratores guarde meus dados e me chame no WhatsApp sobre consórcio e o sorteio (LGPD).</span>
          </label>
          {erro && <div className="cs-erro">{erro}</div>}
          <button className="cs-btn" type="submit" disabled={enviando}>{enviando ? 'Enviando…' : 'Gerar meu número da sorte'}</button>
        </form>
      )}
    </section>
  );
}

function Casca({ children }: { children: React.ReactNode }) {
  return (
    <div className="cs">
      <style>{CSS}</style>
      {children}
    </div>
  );
}

const CSS = `
.cs{--v:${VERMELHO};--v2:#8f0b20;--tx:#1a1a1a;--mu:#5b5b5b;--bg:#f6f3ee;--card:#fff;--bd:#e6e0d6;
  min-height:100vh;background:var(--bg);color:var(--tx);font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;line-height:1.45}
.cs *{box-sizing:border-box}
.cs-vazio{padding:40px 16px;text-align:center;color:var(--mu)}
.cs-hero{position:relative;color:#fff;background:#111 url('/Trator2.jpg') center 40%/cover no-repeat}
.cs-hero::before{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.55) 0%,rgba(0,0,0,.35) 40%,rgba(20,0,4,.92) 100%)}
.cs-hero-in{position:relative;max-width:720px;margin:0 auto;padding:20px 16px 32px;min-height:88vh;display:flex;flex-direction:column;justify-content:flex-end;gap:14px}
.cs-marca{position:absolute;top:18px;left:16px;right:16px;display:flex;align-items:center;justify-content:space-between;gap:10px}
.cs-marca img{height:34px;width:auto;background:#fff;border-radius:8px;padding:4px 8px}
.cs-marca span{font-size:12px;letter-spacing:.06em;text-transform:uppercase;opacity:.9;text-align:right}
.cs-estande{align-self:flex-start;background:#facc15;color:#111;font-weight:700;font-size:12px;padding:4px 10px;border-radius:99px}
.cs-evento{margin:0;font-size:14px;text-transform:uppercase;letter-spacing:.08em;color:#ffd7dd}
.cs h1{margin:0;font-size:clamp(34px,9vw,56px);line-height:1.02;font-weight:800;letter-spacing:-.02em}
.cs h1 em{font-style:normal;color:#ff4d63}
.cs-sub{margin:0;font-size:18px;max-width:30ch}
.cs-premio{display:flex;flex-direction:column;gap:2px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.25);border-radius:14px;padding:12px 14px;backdrop-filter:blur(4px)}
.cs-premio span{font-size:13px;opacity:.9}.cs-premio strong{font-size:18px}
.cs-btn{appearance:none;border:0;background:var(--v);color:#fff;font-weight:700;font-size:17px;padding:16px 20px;border-radius:14px;cursor:pointer;width:100%;box-shadow:0 6px 18px rgba(200,16,46,.35)}
.cs-btn:disabled{opacity:.55;cursor:not-allowed}
.cs-btn-ghost{appearance:none;background:transparent;border:1.5px solid var(--v);color:var(--v);font-weight:600;font-size:15px;padding:10px 14px;border-radius:12px;cursor:pointer;width:100%}
.cs-main{max-width:720px;margin:0 auto;padding:24px 16px 8px;display:flex;flex-direction:column;gap:28px}
.cs h2{margin:0 0 6px;font-size:24px;letter-spacing:-.01em}
.cs-legenda{margin:0 0 14px;color:var(--mu);font-size:15px}
.cs-modelos{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(260px,1fr))}
.cs-modelo{background:var(--card);border:1px solid var(--bd);border-radius:18px;padding:18px;display:flex;flex-direction:column;gap:8px}
.cs-modelo h3{margin:0 0 4px;font-size:17px}
.cs-linha{display:flex;justify-content:space-between;gap:10px;font-size:15px;color:var(--mu)}
.cs-linha strong{color:var(--tx);white-space:nowrap}
.cs-mini{font-size:13px;border-top:1px dashed var(--bd);padding-top:8px}
.cs-parcela{font-size:32px;font-weight:800;color:var(--v);font-variant-numeric:tabular-nums}
.cs-parcela small{font-size:15px;font-weight:600;color:var(--mu);margin-left:2px}
.cs-dia{margin-top:-6px;color:var(--mu);font-size:15px}
.cs-card{background:var(--card);border:1px solid var(--bd);border-radius:20px;padding:20px 18px}
.cs-rotulo{font-size:15px;color:var(--mu)}
.cs-valor{font-size:34px;font-weight:800;margin:2px 0 8px;font-variant-numeric:tabular-nums}
.cs-range{width:100%;accent-color:var(--v);height:32px}
.cs-range-ext{display:flex;justify-content:space-between;font-size:12px;color:var(--mu);margin-bottom:14px}
.cs-sim{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px}
.cs-sim div{background:var(--bg);border-radius:12px;padding:10px 12px;display:flex;flex-direction:column}
.cs-sim span{font-size:13px;color:var(--mu)}.cs-sim strong{font-size:19px;font-variant-numeric:tabular-nums}
.cs-obs{font-size:13px;color:var(--mu);margin:0 0 14px}
.cs-destaques{list-style:none;margin:8px 0 14px;padding:0;display:flex;flex-direction:column;gap:10px}
.cs-destaques li{background:var(--card);border:1px solid var(--bd);border-radius:14px;padding:12px 14px 12px 42px;position:relative;font-size:16px}
.cs-destaques li::before{content:'✓';position:absolute;left:14px;top:11px;color:#fff;background:var(--v);width:20px;height:20px;border-radius:50%;font-size:12px;display:grid;place-items:center;font-weight:800}
.cs-grupo{display:flex;flex-wrap:wrap;gap:8px}
.cs-grupo span{font-size:13px;background:#efe9df;border-radius:99px;padding:6px 12px;color:var(--mu)}
.cs-grupo strong{color:var(--tx)}
.cs-form{display:flex;flex-direction:column;gap:14px}
.cs-form label{display:flex;flex-direction:column;gap:6px;font-size:14px;color:var(--mu)}
.cs-form input:not([type=checkbox]),.cs-form select{font-size:17px;padding:13px 14px;border:1.5px solid var(--bd);border-radius:12px;background:#fff;color:var(--tx);width:100%}
.cs-form input:focus,.cs-form select:focus{outline:2px solid var(--v);outline-offset:1px;border-color:transparent}
.cs-pergunta{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:15px;color:var(--mu)}
.cs-sn{display:flex;gap:8px}
.cs-sn button{appearance:none;border:1.5px solid var(--bd);background:#fff;color:var(--tx);font-size:16px;padding:10px 20px;border-radius:12px;cursor:pointer}
.cs-sn button.on{background:var(--v);border-color:var(--v);color:#fff;font-weight:700}
.cs-form .cs-aceite{flex-direction:row;align-items:flex-start;gap:10px;font-size:14px}
.cs-aceite input{width:22px;height:22px;margin-top:1px;accent-color:var(--v);flex:none}
.cs-isca{position:absolute!important;left:-9999px!important;width:1px!important;height:1px!important;opacity:0}
.cs-erro{background:#fde8ea;color:#8f0b20;border-radius:12px;padding:10px 12px;font-size:15px}
.cs-sorte{text-align:center;background:linear-gradient(160deg,#c8102e,#6d0717);color:#fff;border:0}
.cs-sorte p{margin:0 0 6px;font-size:17px}
.cs-sorte .cs-obs{color:#ffd7dd;margin-top:12px}
.cs-sorte-num{font-size:96px;font-weight:900;letter-spacing:.04em;line-height:1;margin:8px 0;font-variant-numeric:tabular-nums}
.cs-sorte .cs-btn{background:#fff;color:var(--v);margin-top:12px}
.cs-ganhadores{display:flex;flex-direction:column;gap:8px;margin:10px 0}
.cs-ganhadores div{display:flex;align-items:center;gap:10px;font-size:17px}
.cs-num{background:var(--v);color:#fff;font-weight:800;border-radius:10px;padding:4px 10px;font-variant-numeric:tabular-nums}
.cs-regras summary{cursor:pointer;color:var(--v);font-weight:600}
.cs-regras p{white-space:pre-wrap;font-size:14px;color:var(--mu)}
.cs-rodape{max-width:720px;margin:0 auto;padding:20px 16px 40px;font-size:12px;color:var(--mu)}
.cs-rodape p{margin:0 0 8px}
@media (min-width:700px){.cs-hero-in{min-height:72vh;padding-bottom:48px}.cs-btn{width:auto;align-self:flex-start;padding:16px 28px}}
`;
