'use client';
// Tratores vendidos recentemente (/revisoes/vendidos): cada trator das notas de
// "Trator Novo", quantos dias faz da venda (marcos de 30, 60 e 90 dias), se já
// está no controle de revisões e, ao clicar, tudo do cliente: contato, onde fica
// (mapa), a nota e as revisões. Visual: estilo POS NewPortal (docs/estilo-pos-newportal.md).
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { fetchAuth } from '@/lib/auth/client';
import FotoMaquina from '@/components/comum/FotoMaquina';
import MapaLocais from '@/components/comum/MapaLocais';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import { ROTULO_FASE, type Fase } from '@/lib/revisoes/vendidos';
import type { TratorVendido } from '@/lib/revisoes/vendidos-server';

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBR = (iso: string | null | undefined) => {
  if (!iso) return '—';
  if (/^\d{2}\/\d{2}\/\d{4}/.test(iso)) return iso.slice(0, 10);
  const d = new Date(iso.slice(0, 10) + 'T12:00:00');
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('pt-BR');
};
const diaMes = (iso: string) => dataBR(iso).slice(0, 5);
const finalChassi = (c: string | null) => (c ? c.slice(-7) : '—');

const COR = { azul: '#2563EB', verde: '#16A34A', ambar: '#D97706', vermelho: '#DC2626', roxo: '#7C3AED', cinza: '#64748B' };
const COR_FASE: Record<Fase, string> = { antes: COR.cinza, fez30: COR.azul, fez60: COR.roxo, fez90: COR.verde };
const MESES = [3, 6, 12, 24];

type Filtro = 'todos' | 'semana' | 'fora' | 'sem50' | Fase;

export default function TratoresVendidos() {
  const { userProfile } = useAuth();
  const { pode } = usePermissoes(userProfile?.id);
  const podeControle = pode('revisoes', 'tratores');

  const [meses, setMeses] = useState(6);
  const [seminovos, setSeminovos] = useState(false);
  const [lista, setLista] = useState<TratorVendido[] | null>(null);
  const [erro, setErro] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState<TratorVendido | null>(null);

  const carregar = useCallback(async () => {
    setErro('');
    try {
      const r = await fetchAuth(`/api/revisoes/vendidos?meses=${meses}&seminovos=${seminovos ? 1 : 0}`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.erro || 'Não consegui ler as vendas.');
      setLista(j.tratores);
      setAberto((a) => (a ? (j.tratores as TratorVendido[]).find((t) => t.chave === a.chave) || null : null));
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)); setLista([]); }
  }, [meses, seminovos]);
  useEffect(() => { setLista(null); void carregar(); }, [carregar]);

  const sem50 = (t: TratorVendido) => !!t.controle && !t.controle.revisoes.some((r) => r.horas === 50);
  const contas = useMemo(() => {
    const l = lista || [];
    return {
      todos: l.length,
      semana: l.filter((t) => t.marcoSemana).length,
      fora: l.filter((t) => !t.controle).length,
      sem50: l.filter(sem50).length,
      antes: l.filter((t) => t.fase === 'antes').length,
      fez30: l.filter((t) => t.fase === 'fez30').length,
      fez60: l.filter((t) => t.fase === 'fez60').length,
      fez90: l.filter((t) => t.fase === 'fez90').length,
    };
  }, [lista]);

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (lista || []).filter((t) => {
      if (filtro === 'semana' && !t.marcoSemana) return false;
      if (filtro === 'fora' && t.controle) return false;
      if (filtro === 'sem50' && !sem50(t)) return false;
      if ((['antes', 'fez30', 'fez60', 'fez90'] as string[]).includes(filtro) && t.fase !== filtro) return false;
      if (!q) return true;
      return [t.cliente?.nome, t.cliente?.cidade, t.modelo, t.chassi, t.nota?.numero, t.pedido, t.vendedor].some((x) => String(x || '').toLowerCase().includes(q));
    });
  }, [lista, filtro, busca]);

  return (
    <div className="tv-vn">
      <style>{ESTILO}</style>
      <div className="tv-topo">
        <Link href="/revisoes" className="tv-btn"><i className="fa-solid fa-arrow-left" /> Controle Revisões</Link>
        <div className="tv-seg" role="group" aria-label="Período">
          {MESES.map((m) => (
            <button key={m} type="button" className={m === meses ? 'on' : ''} onClick={() => setMeses(m)}>{m} meses</button>
          ))}
        </div>
        <label className="tv-check"><input type="checkbox" checked={seminovos} onChange={(e) => setSeminovos(e.target.checked)} /> Incluir seminovos</label>
        <div className="tv-busca">
          <i className="fa-solid fa-magnifying-glass" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Cliente, cidade, modelo, chassi, nota…" />
        </div>
      </div>

      <div className="tv-kpis">
        <Kpi cor={COR.azul} icone="fa-tractor" rotulo="Vendidos no período" valor={contas.todos} on={filtro === 'todos'} onClick={() => setFiltro('todos')} />
        <Kpi cor={COR.roxo} icone="fa-phone" rotulo="Fizeram 30, 60 ou 90 dias esta semana" valor={contas.semana} on={filtro === 'semana'} onClick={() => setFiltro('semana')} pulsa={contas.semana > 0} />
        <Kpi cor={COR.vermelho} icone="fa-clipboard-question" rotulo="Fora do controle de revisões" valor={contas.fora} on={filtro === 'fora'} onClick={() => setFiltro('fora')} />
        <Kpi cor={COR.ambar} icone="fa-wrench" rotulo="No controle, sem a 50 h" valor={contas.sem50} on={filtro === 'sem50'} onClick={() => setFiltro('sem50')} />
      </div>

      <div className="tv-fases">
        {(['antes', 'fez30', 'fez60', 'fez90'] as Fase[]).map((f) => (
          <button key={f} type="button" className={`tv-fase ${filtro === f ? 'on' : ''}`} style={{ ['--c' as string]: COR_FASE[f] } as React.CSSProperties} onClick={() => setFiltro(filtro === f ? 'todos' : f)}>
            {ROTULO_FASE[f]} <span>{contas[f]}</span>
          </button>
        ))}
      </div>

      {erro && <div className="tv-aviso">{erro}</div>}
      {lista === null ? (
        <div className="tv-vazio"><i className="fa-solid fa-spinner fa-spin" /> Lendo as notas de trator…</div>
      ) : visiveis.length === 0 ? (
        <div className="tv-vazio">Nenhum trator {filtro !== 'todos' || busca ? 'com esse filtro' : 'vendido nesse período'}.</div>
      ) : (
        <div className="tv-grade">
          {visiveis.map((t) => <Cartao key={t.chave} t={t} onAbrir={() => setAberto(t)} />)}
        </div>
      )}

      {aberto && <Ficha t={aberto} podeControle={podeControle} meses={meses} seminovos={seminovos} onFechar={() => setAberto(null)} onMudou={carregar} />}
    </div>
  );
}

function Kpi({ cor, icone, rotulo, valor, on, onClick, pulsa }: { cor: string; icone: string; rotulo: string; valor: number; on: boolean; onClick: () => void; pulsa?: boolean }) {
  return (
    <button type="button" className={`tv-card tv-kpi ${on ? 'on' : ''}`} style={{ ['--c' as string]: cor } as React.CSSProperties} onClick={onClick}>
      <span className={`tv-ico ${pulsa ? 'tv-pulsa' : ''}`}><i className={`fa-solid ${icone}`} /></span>
      <span>
        <span className="tv-num">{valor}</span>
        <span className="tv-rot">{rotulo}</span>
      </span>
    </button>
  );
}

/** Régua da venda até 90 dias, com os três marcos. */
function Regua({ t }: { t: TratorVendido }) {
  const pct = Math.min(100, (t.dias / 90) * 100);
  return (
    <div className="tv-regua" style={{ ['--c' as string]: COR_FASE[t.fase] } as React.CSSProperties}>
      <div className="tv-regua-barra"><span style={{ width: `${pct}%` }} /></div>
      {t.marcos.map((m) => (
        <span key={m.dias} className={`tv-marco ${m.passou ? 'ok' : ''} ${t.marcoSemana === m.dias ? 'agora' : ''}`} style={{ left: `${(m.dias / 90) * 100}%` }}
          title={m.passou ? `Fez ${m.dias} dias em ${dataBR(m.data)}` : `Faz ${m.dias} dias em ${dataBR(m.data)} (daqui a ${m.diasFalta} dia${m.diasFalta === 1 ? '' : 's'})`}>
          <i />
          <small>{m.dias} d · {diaMes(m.data)}</small>
        </span>
      ))}
    </div>
  );
}

function SeloControle({ t }: { t: TratorVendido }) {
  if (!t.controle) return <span className="tv-pilula" style={{ ['--c' as string]: COR.vermelho } as React.CSSProperties}><i className="fa-solid fa-circle-exclamation" /> Fora do controle de revisões</span>;
  const ult = t.controle.revisoes[t.controle.revisoes.length - 1];
  return (
    <>
      {ult
        ? <span className="tv-pilula" style={{ ['--c' as string]: COR.verde } as React.CSSProperties}><i className="fa-solid fa-check" /> {ult.horas} h feita em {dataBR(ult.data)}</span>
        : <span className="tv-pilula" style={{ ['--c' as string]: COR.ambar } as React.CSSProperties}><i className="fa-solid fa-wrench" /> Ainda sem a 50 h</span>}
      {t.controle.previsao?.data && (
        <span className="tv-pilula" style={{ ['--c' as string]: COR.cinza } as React.CSSProperties}>Próxima: {t.controle.previsao.revisao} h ~{dataBR(t.controle.previsao.data)}</span>
      )}
    </>
  );
}

function Cartao({ t, onAbrir }: { t: TratorVendido; onAbrir: () => void }) {
  const cor = COR_FASE[t.fase];
  return (
    <button type="button" className={`tv-card tv-trator clicavel ${t.marcoSemana ? 'tv-pulsa' : ''}`} style={{ ['--c' as string]: cor } as React.CSSProperties} onClick={onAbrir}>
      <div className="tv-trator-topo">
        <FotoMaquina modelo={t.modelo} chassi={t.chassi} largura={76} altura={56} cor={cor} />
        <span style={{ minWidth: 0 }}>
          <span className="tv-etq">{t.nota ? <><small>NF</small> {t.nota.numero}</> : <><small>PV</small> {t.pedido}</>}</span>
          <span className="tv-modelo">{t.modelo}</span>
        </span>
        <span className="tv-dias"><b>{t.dias}</b><small>dias</small></span>
      </div>
      <div className="tv-cliente">{t.cliente?.nome || 'Cliente não achado no cadastro'}</div>
      <div className="tv-sub">
        <span><i className="fa-solid fa-location-dot" /> {t.cliente?.cidade || '—'}</span>
        <span><i className="fa-solid fa-barcode" /> …{finalChassi(t.chassi)}</span>
        <span><i className="fa-regular fa-calendar" /> {dataBR(t.dataVenda)}</span>
      </div>
      <Regua t={t} />
      <div className="tv-selos">
        {t.marcoSemana && <span className="tv-pilula" style={{ ['--c' as string]: COR.roxo } as React.CSSProperties}><i className="fa-solid fa-phone" /> Fez {t.marcoSemana} dias esta semana</span>}
        <SeloControle t={t} />
      </div>
    </button>
  );
}

function Ficha({ t, podeControle, meses, seminovos, onFechar, onMudou }: {
  t: TratorVendido; podeControle: boolean; meses: number; seminovos: boolean; onFechar: () => void; onMudou: () => Promise<void> | void;
}) {
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onFechar]);

  const c = t.cliente;
  const faltaNoControle = t.controle && (!t.controle.entrega || !t.controle.cliente);
  const controlar = async () => {
    setSalvando(true); setMsg('');
    try {
      const r = await fetchAuth('/api/revisoes/vendidos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chave: t.chave, meses, seminovos }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.erro || 'Não consegui gravar.');
      setMsg(j.criado ? 'Trator colocado no controle de revisões.' : j.preenchidos.length ? `Completei no controle: ${j.preenchidos.join(', ')}.` : 'Já estava tudo preenchido no controle.');
      await onMudou();
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    finally { setSalvando(false); }
  };

  return (
    <div className="tv-fundo" onClick={onFechar}>
      <div className="tv-janela" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`${t.modelo} — ${c?.nome || ''}`}>
        <div className="tv-janela-topo" style={{ ['--c' as string]: COR_FASE[t.fase] } as React.CSSProperties}>
          <FotoMaquina modelo={t.modelo} chassi={t.chassi} largura={92} altura={68} cor={COR_FASE[t.fase]} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span className="tv-modelo" style={{ fontSize: 18 }}>{t.modelo}</span>
            <span className="tv-sub" style={{ marginTop: 2 }}>{c?.nome || 'Cliente não achado'} · vendido em {dataBR(t.dataVenda)} · {t.dias} dias</span>
          </span>
          <button type="button" className="tv-x" onClick={onFechar} aria-label="Fechar"><i className="fa-solid fa-xmark" /></button>
        </div>

        <div className="tv-janela-corpo">
          {/* 30 / 60 / 90 dias */}
          <section className="tv-card tv-sec">
            <Titulo icone="fa-calendar-check" cor={COR.roxo}>30, 60 e 90 dias da venda</Titulo>
            <div className="tv-marcos">
              {t.marcos.map((m) => (
                <div key={m.dias} className={`tv-marco-box ${m.passou ? 'ok' : ''} ${t.marcoSemana === m.dias ? 'agora' : ''}`}>
                  <span className="tv-num" style={{ fontSize: 20 }}>{m.dias} dias</span>
                  <span className="tv-rot">{m.passou ? `Fez em ${dataBR(m.data)}` : `Faz em ${dataBR(m.data)} · daqui a ${m.diasFalta} dia${m.diasFalta === 1 ? '' : 's'}`}</span>
                </div>
              ))}
            </div>
          </section>

          <div className="tv-duas">
            {/* Cliente */}
            <section className="tv-card tv-sec">
              <Titulo icone="fa-user" cor={COR.azul}>Cliente</Titulo>
              {c ? (
                <>
                  <div className="tv-linha"><span>Nome</span><b>{c.nome}{c.fantasia ? ` (${c.fantasia})` : ''}</b></div>
                  <div className="tv-linha"><span>CPF/CNPJ</span><b>{c.doc || '—'}</b></div>
                  {c.ie && <div className="tv-linha"><span>Inscrição estadual</span><b>{c.ie}</b></div>}
                  <div className="tv-linha"><span>Telefone</span><b>{c.telefone || '—'}</b></div>
                  {c.email && <div className="tv-linha"><span>E-mail</span><b>{c.email}</b></div>}
                  <div className="tv-linha"><span>Endereço</span><b>{[c.endereco, c.bairro].filter(Boolean).join(', ') || '—'}</b></div>
                  <div className="tv-linha"><span>Cidade</span><b>{c.cidade || '—'}{c.cep ? ` · CEP ${c.cep}` : ''}</b></div>
                  <div className="tv-acoes">
                    {c.whats && <a className="tv-btn cheio" style={{ ['--c' as string]: COR.verde } as React.CSSProperties} href={`https://wa.me/${c.whats}`} target="_blank" rel="noreferrer"><i className="fa-brands fa-whatsapp" /> WhatsApp</a>}
                    {c.telefone && <a className="tv-btn" href={`tel:${c.telefone.replace(/\D/g, '')}`}><i className="fa-solid fa-phone" /> Ligar</a>}
                    <a className="tv-btn" href={c.pasta} target="_blank" rel="noreferrer"><i className="fa-solid fa-folder-open" /> Pasta do cliente</a>
                  </div>
                </>
              ) : <div className="tv-rot">O código do cliente da nota não está no cadastro do portal.</div>}
            </section>

            {/* Onde fica */}
            <section className="tv-card tv-sec">
              <Titulo icone="fa-map-location-dot" cor={COR.verde}>Onde fica</Titulo>
              <MapaLocais locais={t.locais} endereco={[c?.endereco, c?.bairro, c?.cidade].filter(Boolean).join(', ') || null} />
            </section>
          </div>

          <div className="tv-duas">
            {/* Venda */}
            <section className="tv-card tv-sec">
              <Titulo icone="fa-file-invoice" cor={COR.azul}>Venda</Titulo>
              <div className="tv-linha"><span>Nota fiscal</span><b>{t.nota ? `${t.nota.numero} · ${dataBR(t.nota.emissao)}` : 'não achei a nota'}</b></div>
              <div className="tv-linha"><span>Pedido</span><b>{t.pedido} · {t.empresa === 'NOVA' ? 'Nova Tratores' : 'Castro'}</b></div>
              <div className="tv-linha"><span>Valor</span><b>{brl(t.valor)}</b></div>
              <div className="tv-linha"><span>Vendedor</span><b>{t.vendedor || '—'}</b></div>
              <div className="tv-linha"><span>Chassi</span><b className="mono">{t.chassi || '—'}</b></div>
              {t.motor && <div className="tv-linha"><span>Motor</span><b className="mono">{t.motor}</b></div>}
              <div className="tv-desc">{t.descricao}</div>
            </section>

            {/* Revisões */}
            <section className="tv-card tv-sec">
              <Titulo icone="fa-screwdriver-wrench" cor={COR.ambar}>Revisões</Titulo>
              {t.controle ? (
                <>
                  <div className="tv-linha"><span>Entrega no controle</span><b>{t.controle.entrega ? dataBR(t.controle.entrega) : <span style={{ color: COR.ambar }}>vazia</span>}</b></div>
                  <div className="tv-revs">
                    {[50, 300, 600, 900].map((h) => {
                      const r = t.controle!.revisoes.find((x) => x.horas === h);
                      return <span key={h} className={`tv-rev ${r ? 'ok' : ''}`}><b>{h} h</b><small>{r ? dataBR(r.data) : 'não feita'}</small></span>;
                    })}
                  </div>
                  {t.controle.previsao && (
                    <div className="tv-rot" style={{ marginTop: 4 }}>
                      Próxima: <b style={{ fontWeight: 500, color: 'var(--portal-text)' }}>{t.controle.previsao.revisao} h</b>
                      {t.controle.previsao.data ? ` por volta de ${dataBR(t.controle.previsao.data)}` : ''} · {t.controle.previsao.situacao.toLowerCase()}. {t.controle.previsao.explicacao}
                    </div>
                  )}
                  <div className="tv-acoes">
                    <Link className="tv-btn" href={`/revisoes?busca=${encodeURIComponent(t.chassi || '')}`}><i className="fa-solid fa-arrow-up-right-from-square" /> Abrir no Controle Revisões</Link>
                    {faltaNoControle && podeControle && (
                      <button type="button" className="tv-btn" onClick={controlar} disabled={salvando}><i className="fa-solid fa-pen" /> {salvando ? 'Gravando…' : 'Completar com os dados da nota'}</button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="tv-rot">Este trator ainda não está no controle de revisões. Sem ele, a 50 h e as próximas não aparecem para ninguém acompanhar.</div>
                  {podeControle ? (
                    <div className="tv-acoes">
                      <button type="button" className="tv-btn cheio" style={{ ['--c' as string]: COR.vermelho } as React.CSSProperties} onClick={controlar} disabled={salvando || !t.chassi}>
                        <i className="fa-solid fa-plus" /> {salvando ? 'Gravando…' : 'Colocar no controle de revisões'}
                      </button>
                    </div>
                  ) : <div className="tv-rot">Peça a quem cuida das revisões para colocar.</div>}
                  <div className="tv-rot" style={{ fontSize: 12 }}>Entra com modelo, chassi, motor, cliente, cidade, vendedor e a data da nota como entrega.</div>
                </>
              )}
              {msg && <div className="tv-rot" style={{ color: msg.startsWith('Não') ? COR.vermelho : COR.verde }}>{msg}</div>}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

function Titulo({ icone, cor, children }: { icone: string; cor: string; children: React.ReactNode }) {
  return (
    <h3 className="tv-tit" style={{ ['--c' as string]: cor } as React.CSSProperties}>
      <span className="tv-ico pequeno"><i className={`fa-solid ${icone}`} /></span>{children}
    </h3>
  );
}

const ESTILO = `
.tv-vn { padding: 18px 22px 40px; color: var(--portal-text, #0f172a); --tv-borda: var(--border, #e2e8f0); --tv-sec: var(--portal-text-secondary, #475569) }
.tv-vn i[class*="fa-"] { font-weight: 900 }
.tv-vn i.fa-regular { font-weight: 400 }
.tv-vn .tv-topo { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 16px }
.tv-vn .tv-btn { display: inline-flex; align-items: center; gap: 7px; height: 38px; padding: 0 14px; border-radius: 11px; border: 1px solid var(--tv-borda); background: var(--surface, #fefefe); color: var(--portal-text, #0f172a); font: inherit; font-size: 14px; cursor: pointer; text-decoration: none; white-space: nowrap; transition: border-color .2s, background .2s }
.tv-vn .tv-btn:hover { border-color: color-mix(in srgb, var(--c, #2563eb) 40%, var(--tv-borda)) }
.tv-vn .tv-btn.cheio { background: var(--c); border-color: var(--c); color: #fefefe }
.tv-vn .tv-btn:disabled { opacity: .55; cursor: wait }
.tv-vn .tv-seg { display: inline-flex; border: 1px solid var(--tv-borda); border-radius: 11px; overflow: hidden; background: var(--surface, #fefefe) }
.tv-vn .tv-seg button { height: 36px; padding: 0 13px; border: 0; background: transparent; font: inherit; font-size: 13.5px; color: var(--tv-sec); cursor: pointer }
.tv-vn .tv-seg button.on { background: color-mix(in srgb, #2563eb 10%, var(--surface, #fefefe)); color: #1d4ed8 }
.tv-vn .tv-check { display: inline-flex; align-items: center; gap: 7px; font-size: 13.5px; color: var(--tv-sec); cursor: pointer }
.tv-vn .tv-busca { flex: 1; min-width: 220px; display: flex; align-items: center; gap: 8px; height: 38px; padding: 0 12px; border-radius: 11px; border: 1px solid var(--tv-borda); background: var(--surface, #fefefe); color: var(--portal-text-muted, #64748b) }
.tv-vn .tv-busca input { flex: 1; border: 0; outline: 0; background: transparent; font: inherit; font-size: 14px; color: var(--portal-text, #0f172a) }

.tv-vn .tv-card { background: var(--surface, #fefefe); border: 1px solid var(--tv-borda); border-radius: 16px; padding: 16px 18px 14px; box-shadow: none; transition: box-shadow .25s, transform .25s, border-color .25s; color: var(--portal-text, #0f172a); text-align: left; font: inherit }
.tv-vn .tv-card.clicavel { cursor: pointer }
.tv-vn .tv-card.clicavel:hover, .tv-vn .tv-kpi:hover { transform: translateY(-2px); box-shadow: 0 14px 28px -20px rgba(15,23,42,.55); border-color: color-mix(in srgb, var(--c, #2563eb) 35%, var(--tv-borda)) }
.tv-vn .tv-ico { width: 40px; height: 40px; border-radius: 11px; display: grid; place-items: center; flex: none; font-size: 16px; color: var(--c); background: color-mix(in srgb, var(--c) 9%, var(--surface, #fefefe)); border: 1px solid color-mix(in srgb, var(--c) 18%, transparent) }
.tv-vn .tv-ico.pequeno { width: 32px; height: 32px; border-radius: 9px; font-size: 14px }
.tv-vn .tv-num { display: block; font-size: 26px; font-weight: 500; letter-spacing: -.01em; font-variant-numeric: tabular-nums; line-height: 1.15 }
.tv-vn .tv-rot { display: block; font-size: 13px; color: var(--tv-sec); line-height: 1.45 }

.tv-vn .tv-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 12px; margin-bottom: 14px }
.tv-vn .tv-kpi { display: flex; align-items: center; gap: 13px; cursor: pointer }
.tv-vn .tv-kpi.on { border-color: var(--c); background: color-mix(in srgb, var(--c) 6%, var(--surface, #fefefe)) }

.tv-vn .tv-fases { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px }
.tv-vn .tv-fase { display: inline-flex; align-items: center; gap: 8px; height: 34px; padding: 0 12px; border-radius: 99px; font: inherit; font-size: 13.5px; cursor: pointer; color: var(--portal-text, #0f172a); background: var(--surface, #fefefe); border: 1px solid color-mix(in srgb, var(--c) 30%, var(--tv-borda)) }
.tv-vn .tv-fase span { font-size: 12px; padding: 0 8px; border-radius: 99px; color: var(--c); background: color-mix(in srgb, var(--c) 12%, var(--surface, #fefefe)) }
.tv-vn .tv-fase.on { background: color-mix(in srgb, var(--c) 10%, var(--surface, #fefefe)); border-color: var(--c) }
.tv-vn .tv-fase.on span { background: var(--c); color: #fefefe }

.tv-vn .tv-grade { display: grid; grid-template-columns: repeat(auto-fill, minmax(330px, 1fr)); gap: 14px }
.tv-vn .tv-trator { display: flex; flex-direction: column; gap: 8px; width: 100% }
.tv-vn .tv-trator-topo { display: grid; grid-template-columns: auto minmax(0,1fr) auto; column-gap: 11px; align-items: center }
.tv-vn .tv-etq { display: inline-flex; align-items: baseline; gap: 5px; font-size: 13px; padding: 0 9px; border-radius: 7px; font-variant-numeric: tabular-nums; background: color-mix(in srgb, var(--c) 8%, var(--surface, #fefefe)); border: 1px solid color-mix(in srgb, var(--c) 20%, transparent); line-height: 1.6 }
.tv-vn .tv-etq small { font-size: 11px; color: color-mix(in srgb, var(--c) 75%, #0f172a) }
.tv-vn .tv-modelo { display: block; font-size: 15.5px; font-weight: 500; margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.tv-vn .tv-dias { text-align: right; line-height: 1 }
.tv-vn .tv-dias b { display: block; font-size: 26px; font-weight: 500; color: var(--c); font-variant-numeric: tabular-nums }
.tv-vn .tv-dias small { font-size: 12px; color: var(--tv-sec) }
.tv-vn .tv-cliente { font-size: 16px; font-weight: 500; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden }
.tv-vn .tv-sub { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 12.5px; color: var(--tv-sec) }
.tv-vn .tv-sub i { color: var(--portal-text-muted, #94a3b8); margin-right: 4px; font-size: 11px }

.tv-vn .tv-regua { position: relative; height: 40px; margin: 6px 10px 2px }
.tv-vn .tv-regua-barra { position: absolute; left: 0; right: 0; top: 7px; height: 6px; border-radius: 99px; background: var(--portal-bg-secondary, #eef2f6); overflow: hidden }
.tv-vn .tv-regua-barra span { position: absolute; inset: 0 auto 0 0; border-radius: 99px; background: var(--c); transition: width .7s cubic-bezier(.16,1,.3,1) }
.tv-vn .tv-marco { position: absolute; top: 0; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: 4px }
.tv-vn .tv-marco i { width: 20px; height: 20px; border-radius: 50%; background: var(--surface, #fefefe); border: 2px solid var(--tv-borda) }
.tv-vn .tv-marco.ok i { background: var(--c); border-color: var(--c) }
.tv-vn .tv-marco.agora i { box-shadow: 0 0 0 5px color-mix(in srgb, #7C3AED 22%, transparent); border-color: #7C3AED }
.tv-vn .tv-marco small { font-size: 11px; color: var(--tv-sec); white-space: nowrap; font-variant-numeric: tabular-nums }
.tv-vn .tv-marco:last-child small { transform: translateX(-30%) }
.tv-vn .tv-selos { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 2px }
.tv-vn .tv-pilula { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; padding: 2px 10px; border-radius: 99px; color: var(--c); background: color-mix(in srgb, var(--c) 10%, var(--surface, #fefefe)); border: 1px solid color-mix(in srgb, var(--c) 20%, transparent); white-space: nowrap }
.tv-vn .tv-pulsa { animation: tvPulsa 2.4s ease-in-out infinite }
@keyframes tvPulsa { 0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, #7C3AED 0%, transparent) } 50% { box-shadow: 0 0 0 6px color-mix(in srgb, #7C3AED 20%, transparent) } }
@media (prefers-reduced-motion: reduce) { .tv-vn .tv-pulsa { animation: none } }
.tv-vn .tv-vazio, .tv-vn .tv-aviso { padding: 40px 16px; text-align: center; color: var(--tv-sec); font-size: 14px }
.tv-vn .tv-aviso { padding: 12px 14px; border-radius: 12px; color: #b91c1c; background: color-mix(in srgb, #dc2626 7%, var(--surface, #fefefe)); margin-bottom: 12px; text-align: left }

.tv-vn .tv-fundo { position: fixed; inset: 0; z-index: 10000; background: rgba(15,23,42,.45); display: flex; align-items: center; justify-content: center; padding: 16px }
.tv-vn .tv-janela { width: 100%; max-width: 1080px; max-height: 92vh; overflow: auto; border-radius: 18px; background: var(--portal-bg-secondary, #f8fafc) }
.tv-vn .tv-janela-topo { position: sticky; top: 0; z-index: 2; display: flex; align-items: center; gap: 12px; padding: 14px 18px; background: var(--surface, #fefefe); border-bottom: 1px solid var(--tv-borda) }
.tv-vn .tv-x { width: 36px; height: 36px; border-radius: 10px; border: 1px solid var(--tv-borda); background: var(--surface, #fefefe); cursor: pointer; color: var(--tv-sec) }
.tv-vn .tv-janela-corpo { padding: 16px 18px 20px; display: flex; flex-direction: column; gap: 14px }
.tv-vn .tv-duas { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 14px }
.tv-vn .tv-sec { display: flex; flex-direction: column; gap: 9px }
.tv-vn .tv-tit { display: flex; align-items: center; gap: 10px; margin: 0 0 4px; font-size: 16px; font-weight: 500 }
.tv-vn .tv-linha { display: grid; grid-template-columns: 140px minmax(0,1fr); gap: 10px; font-size: 14px }
.tv-vn .tv-linha span { color: var(--tv-sec); font-size: 13px }
.tv-vn .tv-linha b { font-weight: 400; overflow-wrap: anywhere }
.tv-vn .mono { font-family: ui-monospace, monospace }
.tv-vn .tv-acoes { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px }
.tv-vn .tv-desc { font-size: 12.5px; color: var(--tv-sec); padding: 9px 11px; border-radius: 10px; background: var(--portal-bg-secondary, #f1f5f9) }
.tv-vn .tv-marcos { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px }
.tv-vn .tv-marco-box { padding: 12px 14px; border-radius: 12px; border: 1px dashed var(--tv-borda) }
.tv-vn .tv-marco-box.ok { border-style: solid; border-color: color-mix(in srgb, #16a34a 30%, var(--tv-borda)); background: color-mix(in srgb, #16a34a 5%, var(--surface, #fefefe)) }
.tv-vn .tv-marco-box.agora { border-color: #7C3AED; background: color-mix(in srgb, #7C3AED 7%, var(--surface, #fefefe)) }
.tv-vn .tv-revs { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px }
.tv-vn .tv-rev { display: flex; flex-direction: column; padding: 8px 10px; border-radius: 10px; border: 1px dashed var(--tv-borda) }
.tv-vn .tv-rev b { font-weight: 500; font-size: 14px }
.tv-vn .tv-rev small { font-size: 12px; color: var(--tv-sec) }
.tv-vn .tv-rev.ok { border-style: solid; border-color: color-mix(in srgb, #16a34a 30%, var(--tv-borda)); background: color-mix(in srgb, #16a34a 6%, var(--surface, #fefefe)) }
@media (max-width: 640px) {
  .tv-vn { padding: 12px 12px 30px }
  .tv-vn .tv-grade { grid-template-columns: minmax(0, 1fr) }
  .tv-vn .tv-duas { grid-template-columns: minmax(0, 1fr) }
  .tv-vn .tv-marcos { grid-template-columns: minmax(0, 1fr) }
  .tv-vn .tv-revs { grid-template-columns: repeat(2, minmax(0, 1fr)) }
  .tv-vn .tv-linha { grid-template-columns: 110px minmax(0,1fr) }
  .tv-vn .tv-fundo { padding: 0 }
  .tv-vn .tv-janela { max-height: 100vh; height: 100%; border-radius: 0 }
}
`;
