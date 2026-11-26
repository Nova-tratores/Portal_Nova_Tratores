'use client';
/* eslint-disable @typescript-eslint/no-explicit-any, @next/next/no-img-element */
// A página do cliente, no visual da marca (24/11/2026, José: "estilo visual da empresa", site novatratores
// + post da Black como referência). Regras do manual Mahindra Rise, as mesmas do site (Projetos/website/CLAUDE.md):
//   cores: Vermelho Crescente #E31837, Preto #231F20, Cinza Aço #4D4D4F, Cinza Claro #E6E7E8 (+ o dourado do post);
//   títulos em Quantum Rise (curtos: a letra é muito larga), corpo em Georama SemiExpanded, mínimo 16px, clamp();
//   UM Raio Crescente por layout (20°, vermelho, sem encostar na borda oposta).
// 24/11/2026 (José): o QR code só ATRAI — contagem até a feira, o endereço e "como nos encontrar"; no dia,
// o número do estande e o WhatsApp de quem está lá. A ficha é do VENDEDOR (/consorcio/<slug>/vendedor), que salva e manda o
// resumo final no WhatsApp do cliente.
// Cliente:  topo (contagem/local) → faixa → carta → condições → cartas maiores → como recebe → como nos encontrar → sorteio.
// Vendedor: barra → FICHA → o mesmo conteúdo (para mostrar ao cliente no tablet).
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { authHeaders } from '@/lib/auth/client';
import {
  lerConfig, parcela, porDia, creditoComEmbutido, totalPago, totalComTaxas, reais, numeroSorte, modelosUnicos, parcelaComDesconto, modeloDestaque, lanceDoBolso, whatsappDoAtendimento, faseDoEvento, linkDoMapa,
  mapaEmbutido, datasVivas, diasAte, grupoDaUrgencia, periodoCurto, type ConfigConsorcio,
} from '@/lib/consorcio/conta';

/** De onde o cliente veio (link rastreado, plano 1.4). */
export interface Rastreio { origem: string; vendedor: string; utm: Record<string, string> }

function dataCurta(iso?: string | null) {
  if (!iso) return '';
  const [, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}`;
}
function dataLonga(iso?: string | null) {
  if (!iso) return '';
  return new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });
}
function dataHora(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}
/** (43) 99999-9999 enquanto digita */
function mascaraTel(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
/** "Mahindra 6075 80cv plataforma e redutor" → { modelo: "6075", resto: "80cv plataforma e redutor" } */
function partesDoNome(nome: string) {
  const sem = nome.replace(/^mahindra\s+/i, '');
  const [modelo, ...resto] = sem.split(/\s+/);
  return { modelo, resto: resto.join(' ') };
}

export default function PaginaConsorcio({ slug, estande, rastreio = { origem: '', vendedor: '', utm: {} } }: { slug: string; estande: boolean; rastreio?: Rastreio }) {
  const [dados, setDados] = useState<any>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);

  useEffect(() => {
    const COPIA = `cs-evento-${slug}`;
    fetch(`/api/consorcio/${encodeURIComponent(slug)}`, { cache: 'no-store' })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || 'Erro');
        setDados(j);
        try { localStorage.setItem(COPIA, JSON.stringify(j)); } catch { /* sem armazenamento */ }
      })
      .catch((e) => {
        // sem internet no estande: abre com a última cópia guardada neste aparelho
        let copia: any = null;
        try { copia = JSON.parse(localStorage.getItem(COPIA) || 'null'); } catch { /* ok */ }
        if (copia) setDados(copia); else setErroCarga(e.message || 'Não foi possível abrir a página.');
      });
    // 26/11 (José: "a ficha do vendedor tem que funcionar offline"): guarda a página para abrir sem internet
    if (estande && 'serviceWorker' in navigator) navigator.serviceWorker.register('/consorcio-sw.js', { scope: '/consorcio/' }).catch(() => { /* sem sw */ });
  }, [slug, estande]);

  if (erroCarga) return <Casca><div className="cs-vazio">{erroCarga}</div></Casca>;
  if (!dados) return <Casca><div className="cs-vazio">Carregando…</div></Casca>;
  return <Casca><Conteudo dados={dados} estande={estande} slug={slug} rastreio={rastreio} /></Casca>;
}

function Conteudo({ dados, estande, slug, rastreio }: { dados: any; estande: boolean; slug: string; rastreio: Rastreio }) {
  const ev = dados.evento;
  const cfg: ConfigConsorcio = useMemo(() => lerConfig(ev.config), [ev.config]);
  const modelos = useMemo(() => modelosUnicos(cfg), [cfg]);
  // 24/11/2026 (José): "a de 146 mil é a principal; as maiores aparecem, mas não como foco" — sem simulador livre
  const destaque = useMemo(() => modeloDestaque(modelos, cfg), [modelos, cfg]);
  const outros = modelos.filter((m) => m !== destaque);
  const grupos = cfg.grupos || [];
  const fichaRef = useRef<HTMLDivElement>(null);

  // o trator escolhido vai para a ficha (e para a simulação no WhatsApp); começa na carta destaque
  const [interesse, setInteresse] = useState<string>(destaque?.nome ?? '');

  // urgência real com o calendário do grupo (plano 1.1): "feche até o vencimento e já concorre na assembleia"
  const urg = grupoDaUrgencia(cfg);
  const diasVenc = urg?.vencimento ? diasAte(urg.vencimento) : null;
  const sa = cfg.super_assembleia;
  const desc = cfg.desconto_parcela;
  const semEntrada = (cfg.condicoes || []).some((c) => /sem entrada/i.test(c));
  // antes / durante / depois da feira: o topo e o "como nos encontrar" mudam sozinhos
  const agora = useAgora();
  const fase = faseDoEvento(ev.inicio, ev.fim, cfg.abertura, agora);
  const mapa = linkDoMapa(cfg.endereco, cfg.coordenadas);
  // botão "Falar com um vendedor": no dia, o WhatsApp de quem está no estande; antes, o do vendedor do QR (?v=) ou o da loja
  const atend = fase.fase === 'durante' && cfg.whatsapp_evento
    ? { numero: String(cfg.whatsapp_evento).replace(/\D/g, '').replace(/^(?!55)/, '55'), nome: null }
    : whatsappDoAtendimento(cfg, rastreio.vendedor);
  const topoRef = useRef<HTMLElement>(null);
  const zap = (nome?: string) => {
    if (!atend) return undefined;
    const m = modelos.find((x) => x.nome === nome) || destaque;
    const oi = atend.nome ? 'Olá, ' + atend.nome + '!' : 'Olá!';
    const t = m
      ? oi + ' Vi o consórcio Mahindra da ' + ev.nome + ' e quero saber mais sobre a carta do ' + m.nome + ' (' + reais(m.credito, 0) + ').'
      : oi + ' Vi o consórcio Mahindra da ' + ev.nome + ' e quero saber mais.';
    return 'https://wa.me/' + atend.numero + '?text=' + encodeURIComponent(t);
  };

  if (estande) {
    return (
      <>
        {/* 25/11 (José: "fácil de preencher"): cabeçalho fino e só a ficha; os tratores ficam dentro dela, por foto */}
        <header className="cs-vend-barra">
          <img src="/Logo_Nova.png" alt="Nova Tratores" className="cs-logo" />
          <div><b>Ficha do cliente</b><small>{ev.nome} · vendedor</small></div>
        </header>
        <section className="cs-vend-fundo2" ref={fichaRef}>
          <Ficha slug={slug} ev={ev} cfg={cfg} modelos={modelos} rastreio={rastreio} assembleia={urg}
            interesse={interesse} setInteresse={setInteresse} interessePadrao={destaque?.nome ?? ''} />
        </section>
      </>
    );
  }

  // Revisão de design (24/11/2026): UMA ação principal (verde, WhatsApp) em todo lugar; mapa só como link;
  // no celular, barra fixa com o botão depois que o topo sai da tela. Cada clique fica registrado (sem formulário).
  const registrar = (modelo: string | undefined, lugar: string) => {
    try {
      const corpo = JSON.stringify({ modelo: modelo || destaque?.nome || '', lugar, origem: rastreio.origem, vendedor: rastreio.vendedor, utm: rastreio.utm });
      navigator.sendBeacon?.(`/api/consorcio/${encodeURIComponent(slug)}/clique`, new Blob([corpo], { type: 'application/json' }));
    } catch { /* o clique segue para o WhatsApp mesmo se não registrar */ }
  };
  const zapBtn = ({ modelo, lugar, rotulo = 'Quero minha simulação', contorno }: { modelo?: string; lugar: string; rotulo?: string; contorno?: boolean }) =>
    atend ? (
      <a className={contorno ? 'cs-zap cs-zap-contorno' : 'cs-zap'} data-zap-alvo={lugar === 'barra' || contorno ? undefined : ''} href={zap(modelo)} target="_blank" rel="noopener noreferrer" onClick={() => registrar(modelo, lugar)}>
        <IconeZap /> {rotulo}
      </a>
    ) : null;

  return (
    <>
      {/* ── Topo: o que é, quanto custa, onde e quando é a feira, e UM botão ── */}
      {/* 25/11/2026 (José): "volta na versão bonita, antes dos botões e do cronômetro" — o topo de 24/11 (16h25),
          com o mesmo alinhamento e as mesmas medidas; só o botão leva ao WhatsApp e o link desce ao mapa */}
      <header className="cs-topo cs-topo-classico" ref={topoRef}>
        <div className="cs-raio" aria-hidden="true"><span /></div>
        <div className="cs-barra">
          <img src="/Logo_Nova.png" alt="Nova Tratores" className="cs-logo" />
          <div className="cs-conc"><small>Concessionária autorizada</small><b>MAHINDRA</b></div>
        </div>
        <div className="cs-topo-in">
          <p className="cs-kicker">
            {ev.nome}{ev.cidade ? ` · ${ev.cidade}` : ''}
            {ev.inicio && <> · <span style={{ whiteSpace: 'nowrap' }}>{periodoCurto(ev.inicio, ev.fim)}</span></>}
          </p>
          <h1 className="cs-h1">Consórcio<span className="cs-so-leitor"> Mahindra na {ev.nome}</span></h1>
          <span className="cs-etiqueta" aria-hidden="true">Mahindra</span>
          {/* 25/11 (José): os 3 trunfos como números grandes, na letra do título (a lista com ✓ "não combinava") */}
          <div className="cs-numeros">
            {urg?.proxima_assembleia && <div><b>{dataCurta(urg.proxima_assembleia)}</b><span>assembleia: compre a carta e já concorra</span></div>}
            {desc && <div><b>{desc.pct}%</b><span>de desconto na {desc.numero}ª parcela</span></div>}
            {sa && <div><b>{sa.cartas}</b><span>contemplações em {sa.quando}</span></div>}
          </div>
          {ev.premio && <div className="cs-premio"><span>Cadastre-se e concorra a</span><strong>{ev.premio}</strong></div>}
          {/* 25/11 (José): a contagem embaixo dos números, e o "Onde será?" embaixo dela */}
          <Contagem fase={fase} ev={ev} cfg={cfg} />
          {/* 25/11 (José): o botão saiu do meio do texto — o WhatsApp virou o ícone flutuante no canto */}
          <div className="cs-acoes">
            {/* Raio Crescente (25/11, rascunho do José): sai da borda, passa embaixo do "Onde será?" e sobe à direita */}
            <span className="cs-raio-link" aria-hidden="true" />
            <a className="cs-link" href="#local"
              onClick={(e) => { e.preventDefault(); document.getElementById('local')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
              Onde será? Ver no mapa →
            </a>
          </div>
        </div>
      </header>


      {/* ── A carta da feira: parcela primeiro, prazo para fechar, e os dois caminhos ── */}
      {destaque && (() => {
        const { modelo, resto } = partesDoNome(destaque.nome);
        const lb = lanceDoBolso(destaque.credito, cfg);
        const embutido = totalComTaxas(destaque.credito, cfg) * (cfg.lance_embutido_pct / 100);
        return (
          <section id="carta" className="cs-secao cs-escuro">
            <div className="cs-in cs-carta">
              <div className="cs-carta-foto">
                {destaque.foto ? <img src={destaque.foto} alt={destaque.nome} /> : <div className="cs-foto-vazia">{modelo}</div>}
              </div>
              <div className="cs-carta-info">
                <h2 className="cs-carta-nome">Mahindra {modelo} <span>{resto}</span></h2>
                <div className="cs-carta-parcela"><Preco v={parcela(destaque.credito, cfg)} /><small>/mês</small></div>
                <div className="cs-carta-dia">
                  ou <b>{reais(porDia(destaque.credito, cfg))} por dia</b> · crédito de {reais(destaque.credito, 0)} · {cfg.prazo_meses} meses
                </div>
                {urg && diasVenc !== null && urg.grupo && destaque.grupos.includes(urg.grupo) && (
                  <div className="cs-prazo">
                    <b>{diasVenc === 0 ? 'Último dia' : `Faltam ${diasVenc} dia${diasVenc === 1 ? '' : 's'}`}</b>
                    <span>feche até {dataCurta(urg.vencimento)} e concorra em {dataCurta(urg.proxima_assembleia)}</span>
                  </div>
                )}
                <div className="cs-caminhos">
                  <div className="cs-caminho">
                    {/* 25/11 (José): não é "sem dinheiro" — é sem entrada; o 1º pagamento já é a 1ª parcela */}
                    <span className="cs-caminho-rot">Sem entrada</span>
                    <b>Comece pela 1ª parcela</b>
                    <ul>
                      <li>O primeiro pagamento já é a 1ª parcela, no Pix</li>
                      <li>Concorre todo mês por sorteio e lance livre</li>
                    </ul>
                  </div>
                  {lb && (
                    <div className="cs-caminho cs-caminho-forte">
                      <span className="cs-caminho-rot">Quero receber logo</span>
                      <b><Preco v={lb.valor} casas={0} /> de lance</b>
                      <ul>
                        <li>Concorre ao lance fixo de {lb.fixoPct}%{urg?.proxima_assembleia && destaque.grupos.includes(urg.grupo) ? ` já em ${dataCurta(urg.proxima_assembleia)}` : ''}</li>
                        <li>Mais {reais(embutido, 0)} saem da própria carta: você recebe {reais(creditoComEmbutido(destaque.credito, cfg), 0)} para comprar</li>
                      </ul>
                    </div>
                  )}
                </div>
                {zapBtn({ modelo: destaque.nome, lugar: 'carta' })}
                <p className="cs-obs">
                  Custo total em {cfg.prazo_meses} meses: <b>{reais(totalPago(destaque.credito, cfg), 0)}</b> (crédito, taxa de administração de {cfg.taxa_adm_pct}%,
                  fundo de reserva de {cfg.fundo_reserva_pct}% e seguro de vida). Simulação de referência: o vendedor confirma os valores na hora.
                </p>
              </div>
            </div>
          </section>
        );
      })()}

      {/* ── Só na Supersafra: 41 × 3, como se paga, e as regras recolhidas ── */}
      {(sa || desc || (cfg.condicoes?.length ?? 0) > 0) && (
        <section className="cs-secao cs-claro cs-largo">
          <div className="cs-in">
            {/* revisão v2 (3): o exclusivo da feira é o desconto; a Super Assembleia é do grupo, fechando aqui ou não */}
            <h2 className="cs-h2">Só na {ev.nome.replace(/\s*\d{4}$/, '')}
              {desc && <span className="cs-h2-sub">{desc.numero}ª parcela {desc.pct === 50 ? 'pela metade' : `com ${desc.pct}% de desconto`}</span>}
            </h2>
            <div className="cs-cond-grade">
              {sa && (
                <div className="cs-super">
                  <span className="cs-super-rot">Super Assembleia · {sa.quando}</span>
                  <p className="cs-super-frase">
                    Em um mês só, <b>{sa.cartas} pessoas</b>{sa.grupo ? ` do grupo ${sa.grupo}` : ''} recebem o crédito para comprar o trator.
                  </p>
                  <div className="cs-super-vs">
                    <div className="cs-super-mes"><b>{sa.cartas}</b><span>contemplações<br />em {sa.quando}</span></div>
                    {sa.por_mes ? <div className="cs-super-normal"><b>{sa.por_mes}</b><span>num mês<br />normal</span></div> : null}
                  </div>
                  {sa.total_ate ? <small className="cs-super-nota">Até {sa.quando}, o grupo{sa.grupo ? ` ${sa.grupo}` : ''} terá até {sa.total_ate} contemplações no total, desde que haja saldo.</small> : null}
                </div>
              )}
              {destaque && (() => {
                const p = parcela(destaque.credito, cfg);
                const temPix = (cfg.condicoes || []).some((c) => /pix/i.test(c));
                const temBoleto = (cfg.condicoes || []).some((c) => /boleto/i.test(c));
                const nd = desc?.numero ?? 0;
                const passos: { quando: string; valor: number; casas?: number; como: string; forte?: boolean }[] = [];
                if (semEntrada) passos.push({ quando: 'Entrada', valor: 0, casas: 0, como: 'sem entrada' });
                passos.push({ quando: '1ª parcela', valor: p, como: temPix ? 'no Pix, no estande' : 'na adesão' });
                for (let n = 2; n < nd; n++) passos.push({ quando: `${n}ª parcela`, valor: p, como: temBoleto ? 'no boleto' : '' });
                if (desc) passos.push({ quando: `${nd}ª parcela`, valor: parcelaComDesconto(destaque.credito, cfg)!, como: `${desc.pct}% de desconto`, forte: true });
                passos.push({ quando: `Da ${Math.max(nd, 1) + 1}ª à ${cfg.prazo_meses}ª`, valor: p, como: temBoleto ? 'no boleto, todo mês' : 'todo mês' });
                return (
                  <div className="cs-paga">
                    <span className="cs-paga-rot">Como você paga a carta de {reais(destaque.credito, 0)}</span>
                    <ol>
                      {passos.map((x) => (
                        <li key={x.quando} className={x.forte ? 'cs-paga-forte' : undefined}>
                          <span className="cs-paga-quando">{x.quando}</span>
                          <b><Preco v={x.valor} casas={x.casas ?? 2} /></b>
                          <span className="cs-paga-como">{x.como}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                );
              })()}
            </div>
            {((cfg.destaques?.length ?? 0) > 0 || grupos.length > 0) && (
              <details className="cs-regras-grupo">
                <summary>Todo mês tem sorteio e lance. Ver as regras e as datas dos grupos</summary>
                <ul>{(cfg.destaques || []).map((d) => <li key={d}>{d}</li>)}</ul>
                <div className="cs-grupos">
                  {grupos.map((g) => {
                    // revisão v2 (A1): só o próximo mês que ainda vale; vencimento passou = a assembleia dele some junto
                    const d = datasVivas(g);
                    return (
                      <div key={g.grupo}>
                        <b>Grupo {g.grupo}</b>
                        {d.vencimento ? <span>Vencimento {dataLonga(d.vencimento)}</span> : null}
                        {d.proxima_assembleia ? <span>Assembleia {dataLonga(d.proxima_assembleia)}</span> : null}
                        {!d.vencimento && !d.proxima_assembleia && <span>Próximas datas: a confirmar</span>}
                      </div>
                    );
                  })}
                </div>
              </details>
            )}
          </div>
        </section>
      )}

      {/* ── Outras cartas: grade cheia no desktop, cartões compactos no celular ── */}
      {outros.length > 0 && (
        <section className="cs-secao cs-claro cs-claro-borda cs-largo">
          <div className="cs-in">
            <h2 className="cs-h2">Outras cartas</h2>
            <p className="cs-lead">O mesmo consórcio sem juros, para quem precisa de mais potência.</p>
            <div className="cs-mais">
              {outros.map((m) => {
                const { modelo, resto } = partesDoNome(m.nome);
                return (
                  <article key={`${m.codigo}-${m.credito}`} className="cs-mais-card">
                    <div className="cs-mais-foto">{m.foto ? <img src={m.foto} alt={m.nome} loading="lazy" /> : <span>{modelo}</span>}</div>
                    <div className="cs-mais-in">
                      <h3><small>Mahindra</small><b>{modelo}</b> <span>{resto}</span></h3>
                      <div className="cs-mais-parcela"><Preco v={parcela(m.credito, cfg)} /><small>/mês</small></div>
                      <dl>
                        <div><dt>Crédito</dt><dd>{reais(m.credito, 0)}</dd></div>
                        <div><dt>Por dia</dt><dd>{reais(porDia(m.credito, cfg))}</dd></div>
                      </dl>
                      {zapBtn({ modelo: m.nome, lugar: 'outras', rotulo: 'Simular este', contorno: true })}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ── Onde será o evento: endereço, link do mapa, mapa, e o botão de fechamento ── */}
      <section id="local" className="cs-secao cs-escuro cs-largo">
        <div className="cs-in">
          <h2 className="cs-h2">{fase.fase === 'durante' ? 'Estamos na feira agora' : 'Onde será o evento'}</h2>
          {fase.fase === 'durante' && cfg.estande_local && <p className="cs-estande-num">{cfg.estande_local}</p>}
          {cfg.endereco && (
            <div className="cs-mapa-grade">
              {/* 25/11 (José: "melhora"): Quando e Onde como dois blocos com rótulo, frase curta e o botão */}
              <div className="cs-mapa-texto">
                {fase.fase === 'antes' && ev.inicio && (
                  <div className="cs-info">
                    <span className="cs-info-rot">Quando</span>
                    <b>{quandoEvento(ev, cfg)}</b>
                  </div>
                )}
                <div className="cs-info">
                  <span className="cs-info-rot">Onde</span>
                  <p className="cs-endereco">{cfg.endereco}</p>
                  {mapa && <a className="cs-link-mapa" href={mapa} target="_blank" rel="noopener noreferrer">Abrir no Google Maps →</a>}
                </div>
                <p className="cs-lead cs-mapa-frase">
                  {fase.fase === 'durante'
                    ? 'Chame no WhatsApp que a gente te encontra no estande.'
                    : fase.fase === 'antes'
                      ? 'Um vendedor faz a sua simulação na hora, no estande.'
                      : 'A feira acabou, mas a condição pode valer ainda. Chame no WhatsApp.'}
                </p>
                {zapBtn({ lugar: 'mapa' })}
              </div>
              <iframe
                className="cs-mapa"
                title={`Mapa: ${cfg.endereco.split('\n')[0]}`}
                src={mapaEmbutido(cfg) || undefined}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          )}
        </div>
      </section>

      {/* ── Sorteio (só aparece se estiver configurado) ─────── */}
      {(ev.sorteio_em || dados.ganhadores?.length > 0 || ev.regulamento) && (
        <section className="cs-secao cs-escuro cs-escuro-borda">
          <div className="cs-in cs-estreito">
            <h2 className="cs-h2">Sorteio</h2>
            {ev.sorteio_em && <p className="cs-lead">{dataHora(ev.sorteio_em)}, no estande da Nova Tratores.</p>}
            {ev.premio && <p className="cs-lead">Prêmio: <strong className="cs-ouro">{ev.premio}</strong></p>}
            {dados.ganhadores?.length > 0 && (
              <div className="cs-ganhadores">
                {dados.ganhadores.map((g: any) => <div key={g.numero}><span className="cs-num">{numeroSorte(g.numero)}</span>{g.nome}</div>)}
              </div>
            )}
            {ev.regulamento && <details className="cs-regras"><summary>Regras do sorteio</summary><p>{ev.regulamento}</p></details>}
          </div>
        </section>
      )}

      {/* ── Rodapé ──────────────────────────────────────────── */}
      <footer className="cs-rodape">
        <p>{cfg.administradora || 'Mahindra Consórcio Nacional'}{grupos.length ? ` · Grupos ${grupos.map((g) => g.grupo).join(', ')}` : ''} · Revenda Nova Tratores · Concessionária autorizada Mahindra</p>
        <p>Valores em reais, parcelas calculadas com seguro. Os valores de referência dos modelos podem mudar conforme os preços praticados
          pelas concessionárias e estão sujeitos a reajuste sem aviso, de acordo com o fabricante. A simulação não garante contemplação,
          que acontece só pelos meios previstos em contrato e nas normas do Banco Central.</p>
      </footer>

      {/* ── WhatsApp flutuante no canto (25/11, José: "algo flutuante, que não fique junto do texto") ── */}
      {atend && (
        <a className="cs-flutua" href={zap()} target="_blank" rel="noopener noreferrer" aria-label="Quero minha simulação no WhatsApp"
          onClick={() => registrar(undefined, 'flutuante')}>
          <IconeZap />
          <span className="cs-flutua-dica">Quero minha simulação</span>
        </a>
      )}
    </>
  );
}

/** "Agora", a cada segundo (os segundos correm e, no dia, a página troca sozinha). */
function useAgora() {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setAgora(new Date()), 1000); return () => clearInterval(t); }, []);
  return agora;
}

const dois = (n: number) => String(n).padStart(2, '0');

/** "Quinta e sexta, 03 e 04/12, a partir das 8h" (sem o "-feira"). */
function quandoEvento(ev: any, cfg: ConfigConsorcio): string {
  if (!ev.inicio) return '';
  const dia = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long' }).replace('-feira', '');
  const d1 = dia(ev.inicio);
  const dias = ev.fim && ev.fim !== ev.inicio ? `${d1} e ${dia(ev.fim)}` : d1;
  const [h, m] = /^\d{1,2}:\d{2}$/.test(String(cfg.abertura || '')) ? String(cfg.abertura).split(':').map(Number) : [8, 0];
  const hora = m ? `${h}h${dois(m)}` : `${h}h`;
  return `${dias.charAt(0).toUpperCase()}${dias.slice(1)}, ${periodoCurto(ev.inicio, ev.fim)}, a partir das ${hora}`;
}

/** Preço com o "R$" na letra do texto (25/11, José: na Quantum Rise o cifrão fica estranho); os números seguem na letra do título. */
function Preco({ v, casas = 2 }: { v: number; casas?: number }) {
  const txt = reais(v, casas).replace(/^R\$\s*/, '');
  return <><span className="cs-moeda">R$</span>{txt}</>;
}

/** O ícone do WhatsApp (traço simples, herda a cor do botão). */
function IconeZap() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.2.3-.9.9-.9 2.2s1 2.6 1.1 2.7c.1.2 1.9 2.9 4.6 4.1 1.7.7 2.4.8 3.2.7.5-.1 1.5-.6 1.8-1.2.2-.6.2-1.1.1-1.2-.1-.1-.2-.2-.4-.3z" />
    </svg>
  );
}

/**
 * A contagem até a feira, no topo (25/11, José: "coloca o timer aqui, e embaixo o onde será?").
 * 4 quadros iguais (dias, horas, min, seg). No dia: "estamos na feira agora" + estande. Depois: some.
 */
function Contagem({ fase, ev, cfg }: { fase: ReturnType<typeof faseDoEvento>; ev: any; cfg: ConfigConsorcio }) {
  if (fase.fase === 'depois') return null;
  if (fase.fase === 'durante') {
    return (
      <div className="cs-cont cs-ao-vivo">
        <span className="cs-cont-rot"><i className="cs-ponto" /> Estamos na {ev.nome} agora</span>
        {cfg.estande_local && <b className="cs-cont-estande">{cfg.estande_local}</b>}
      </div>
    );
  }
  const f = fase.falta || { dias: 0, horas: 0, minutos: 0, segundos: 0 };
  return (
    // 25/11 (José): no estilo dos números do topo — dígitos soltos na letra do título, sem quadros nem animação
    <div className="cs-cont" role="timer" aria-label={`Faltam ${f.dias} dias e ${f.horas} horas para a ${ev.nome}`}>
      <span className="cs-cont-rot">Faltam para a {ev.nome}</span>
      <div className="cs-relogio">
        {([[f.dias, 'dias'], [f.horas, 'horas'], [f.minutos, 'min'], [f.segundos, 'seg']] as [number, string][]).map(([n, u], i) => (
          <Fragment key={u}>
            {i > 0 && <i aria-hidden="true">:</i>}
            <div><b>{dois(n)}</b><span>{u}</span></div>
          </Fragment>
        ))}
      </div>
    </div>
  );
}

/** Botões de escolha única (Quente/Morno/Frio, Sim/Não) no padrão de opção do site. */
function Opcoes<T>({ valor, set, itens }: { valor: T; set: (v: T) => void; itens: [T, string][] }) {
  return (
    <div className="cs-opcoes">
      {itens.map(([v, l]) => <button key={l} type="button" aria-pressed={valor === v} onClick={() => set(v)}>{l}</button>)}
    </div>
  );
}

const VINDA_DE = ['Passou no estande', 'Indicação', 'Redes sociais', 'Já é cliente', 'Outro'];
/** número escrito do jeito brasileiro ("146.685,50") → 146685.5; vazio/inválido → null */
const numBR = (v: string): number | null => {
  const s = v.trim().replace(/[^\d.,]/g, '');
  if (!s) return null;
  const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : /^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, '') : s);
  return Number.isFinite(n) && n > 0 ? n : null;
};
const hojeISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const PASSOS = ['Ligar para o cliente', 'Visitar na propriedade', 'Mandar a proposta', 'Cliente volta ao estande', 'Fechou na feira'];

function Ficha({ slug, ev, cfg, modelos, rastreio, assembleia, interesse, setInteresse, interessePadrao }: {
  slug: string; ev: any; cfg: ConfigConsorcio; modelos: { nome: string; credito: number; grupos: string[]; foto?: string }[];
  rastreio: Rastreio; assembleia: { grupo: string; vencimento?: string | null; proxima_assembleia?: string | null } | null;
  interesse: string; setInteresse: (v: string) => void; interessePadrao: string;
}) {
  const credito = modelos.find((m) => m.nome === interesse)?.credito ?? null;
  const [vendedor, setVendedor] = useState('');
  const [nome, setNome] = useState('');
  const [tel, setTel] = useState('');
  const [cidade, setCidade] = useState('');
  const [temperatura, setTemperatura] = useState<'' | 'quente' | 'morno' | 'frio'>('');
  const [temTrator, setTemTrator] = useState<boolean | null>(null);
  const [usado, setUsado] = useState<boolean | null>(null);
  const [usadoDesc, setUsadoDesc] = useState('');
  const [passo, setPasso] = useState('');
  const [passoData, setPassoData] = useState('');
  const [obs, setObs] = useState('');
  const [aceite, setAceite] = useState(false);
  // planilha "Acompanhamento de Visita" (26/11): endereço, como chegou, fechamento e a proposta
  const [endereco, setEndereco] = useState('');
  const [vindaDe, setVindaDe] = useState('');
  const [fechamento, setFechamento] = useState('');
  const [pCredito, setPCredito] = useState('');
  const [pParcela, setPParcela] = useState('');
  const [pPrazo, setPPrazo] = useState('');
  const [pEmbutido, setPEmbutido] = useState('');
  const [pLance, setPLance] = useState('');
  const [pContemp, setPContemp] = useState('');
  const [pObs, setPObs] = useState('');
  const [verLeads, setVerLeads] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // 26/11 (José): número da sorte EM ESPERA na ficha do vendedor — no lugar dele, a proposta em PDF vai para o WhatsApp do cliente
  const [resultado, setResultado] = useState<{ ja: boolean; offline?: boolean; pdf?: { enviado: boolean; motivo?: string; base64?: string } } | null>(null);
  const topo = useRef<HTMLDivElement>(null);

  // o aparelho do vendedor lembra o nome dele (conveniência do aparelho, não dado do negócio)
  // 26/11 (José): "melhor o vendedor entrar com o perfil do portal, pra gente pegar certinho por vendedor".
  // Com internet, o servidor diz quem é; sem internet, vale o último perfil que entrou neste aparelho.
  const [perfil, setPerfil] = useState<'verificando' | 'fora' | 'dentro'>('verificando');
  useEffect(() => {
    let guardado = '';
    try { guardado = localStorage.getItem('cs-vendedor-perfil') || ''; } catch { /* sem armazenamento */ }
    (async () => {
      try {
        const r = await fetch(`/api/consorcio/${encodeURIComponent(slug)}/eu`, { headers: await authHeaders(), cache: 'no-store' });
        if (r.ok) {
          const j = await r.json();
          setVendedor(j.nome); setPerfil('dentro');
          try { localStorage.setItem('cs-vendedor-perfil', j.nome); } catch { /* ok */ }
          return;
        }
        if (r.status === 401) { try { localStorage.removeItem('cs-vendedor-perfil'); } catch { /* ok */ } setPerfil('fora'); return; }
        throw new Error('servidor');
      } catch {
        if (guardado) { setVendedor(guardado); setPerfil('dentro'); } else setPerfil('fora');
      }
    })();
  }, [slug]);

  // 26/11 (José: "a ficha do vendedor tem que funcionar offline"): sem internet, a ficha fica na FILA DO APARELHO
  // e vai sozinha quando a internet voltar — uma por vez, porque o servidor aceita 1 cadastro a cada 2 s por aparelho.
  // Ficha que o servidor recusar (dado inválido, evento fechado) não some: vai para uma lista à parte.
  const FILA = `cs-fila-${slug}`, RECUSADAS = `cs-fila-recusadas-${slug}`;
  const [pendentes, setPendentes] = useState(0);
  const [recusadas, setRecusadas] = useState(0);
  const [enviadas, setEnviadas] = useState<{ nome: string; pdf: boolean }[]>([]);
  const sincronizando = useRef(false);
  const lerLista = (k: string): { id: number; corpo: any }[] => { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch { return []; } };
  const gravarLista = (k: string, l: { id: number; corpo: any }[]) => { try { localStorage.setItem(k, JSON.stringify(l)); } catch { /* sem armazenamento */ } };
  async function sincronizar() {
    let fila = lerLista(FILA);
    setPendentes(fila.length); setRecusadas(lerLista(RECUSADAS).length);
    if (sincronizando.current || !fila.length || !navigator.onLine) return;
    sincronizando.current = true;
    try {
      while (fila.length) {
        const item = fila[0];
        let r: Response;
        try {
          r = await fetch(`/api/consorcio/${encodeURIComponent(slug)}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify(item.corpo) });
        } catch { break; }                                    // caiu a internet de novo: tenta depois
        if (r.status === 429 || r.status >= 500) break;       // servidor ocupado: tenta depois
        const j = await r.json().catch(() => ({}));
        if (r.ok) setEnviadas((v) => [...v, { nome: String(item.corpo.nome || ''), pdf: !!j.pdf?.enviado }]);
        else { gravarLista(RECUSADAS, [...lerLista(RECUSADAS), { ...item, corpo: { ...item.corpo, _erro: j.error || r.status } }]); setRecusadas((n) => n + 1); }
        fila = lerLista(FILA).filter((x) => x.id !== item.id);
        gravarLista(FILA, fila); setPendentes(fila.length);
        if (fila.length) await new Promise((ok) => setTimeout(ok, 2300));
      }
    } finally { sincronizando.current = false; }
  }
  useEffect(() => {
    sincronizar();
    const aoVoltar = () => { sincronizar(); };
    window.addEventListener('online', aoVoltar);
    const t = setInterval(sincronizar, 20000);
    return () => { window.removeEventListener('online', aoVoltar); clearInterval(t); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const avisoFila = (pendentes > 0 || recusadas > 0 || enviadas.length > 0) && (
    <div className="cs-f-fila" role="status">
      {pendentes > 0 && <p><b>{pendentes} ficha(s) salva(s) neste aparelho</b>, esperando internet. Vão sozinhas quando ela voltar (e a proposta segue para o WhatsApp do cliente); não feche o navegador.</p>}
      {enviadas.length > 0 && (
        <p className="cs-f-fila-ok">Enviadas: {enviadas.map((e) => `${e.nome.split(/\s+/)[0]} (${e.pdf ? 'proposta no WhatsApp' : 'salva, sem PDF'})`).join(' · ')}
          <button type="button" onClick={() => setEnviadas([])}>ok</button></p>
      )}
      {recusadas > 0 && <p className="cs-f-fila-erro">{recusadas} ficha(s) não foram aceitas pelo sistema (dado faltando ou evento fechado). Ficaram guardadas neste aparelho: chame o Marketing.</p>}
    </div>
  );

  // proposta: o que o vendedor digitou; vazio = a conta padrão do trator escolhido
  const creditoProp = numBR(pCredito) ?? credito;
  const padrao = {
    parcela: creditoProp ? parcela(creditoProp, cfg) : null,
    prazo: cfg.prazo_meses || null,
    embutido: cfg.lance_embutido_pct || null,
    lance: creditoProp ? lanceDoBolso(creditoProp, cfg)?.valor ?? null : null,
  };
  const sugestoesContemp = [
    assembleia?.proxima_assembleia ? `Assembleia de ${dataCurta(assembleia.proxima_assembleia)}` : null,
    cfg.super_assembleia?.quando ? `Super Assembleia de ${cfg.super_assembleia.quando}` : null,
  ].filter(Boolean) as string[];

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (perfil !== 'dentro' || !vendedor.trim()) { setErro('Entre com o seu usuário do portal (botão no topo).'); return; }
    if (!temperatura) { setErro('Toque em Quente, Morno ou Frio (passo 3).'); return; }
    if (!aceite) { setErro('Marque que o cliente autorizou o contato (LGPD).'); return; }
    // conferido aqui também: sem internet, o servidor só vê a ficha depois (e aí não dá para corrigir com o cliente)
    if (nome.trim().length < 3) { setErro('Escreva o nome completo do cliente.'); return; }
    const dig = tel.replace(/\D/g, '');
    if (dig.length < 10 || dig.length > 11) { setErro('WhatsApp com DDD, por exemplo (43) 99999-9999.'); return; }
    setEnviando(true);
    try {
      try { localStorage.setItem('cs-vendedor', vendedor.trim()); } catch { /* ok */ }
      const corpo = {
          nome, telefone: tel, cidade, interesse, credito, tem_trator: temTrator, aceite, vendedor,
          origem: rastreio.origem || 'estande', utm: rastreio.utm,
          temperatura, usado_para_lance: usado, usado_descricao: usado ? usadoDesc : '',
          proximo_passo: passo, proximo_passo_data: passoData, observacao: obs,
          endereco, vinda_de: vindaDe,
          fechamento_data: fechamento || (passo === 'Fechou na feira' ? hojeISO() : ''),
          ...(creditoProp ? {
            credito: creditoProp,
            parcela: numBR(pParcela) ?? padrao.parcela, prazo_meses: numBR(pPrazo) ?? padrao.prazo,
            embutido_pct: numBR(pEmbutido) ?? padrao.embutido, lance_proprio: numBR(pLance) ?? padrao.lance,
          } : {}),
          prazo_contemplacao: pContemp, proposta_obs: pObs,
          enviar_pdf: true,
      };
      let r: Response | null = null;
      if (navigator.onLine !== false) {
        try { r = await fetch(`/api/consorcio/${encodeURIComponent(slug)}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify(corpo) }); } catch { r = null; }
      }
      if (!r) {
        // sem internet: guarda no aparelho e segue atendendo
        const fila = [...lerLista(FILA), { id: Date.now(), corpo }];
        gravarLista(FILA, fila); setPendentes(fila.length);
        setResultado({ ja: false, offline: true });
        requestAnimationFrame(() => topo.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
        return;
      }
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Não deu para salvar. Tente de novo.');
      setResultado({ ja: j.ja_inscrito, pdf: j.pdf });
      requestAnimationFrame(() => topo.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setEnviando(false);
    }
  }

  function proximo() {
    setNome(''); setTel(''); setCidade(''); setInteresse(interessePadrao); setTemperatura(''); setTemTrator(null);
    setUsado(null); setUsadoDesc(''); setPasso(''); setPassoData(''); setObs(''); setAceite(false); setResultado(null); setErro(null);
    setEndereco(''); setVindaDe(''); setFechamento(''); setPCredito(''); setPParcela(''); setPPrazo(''); setPEmbutido(''); setPLance(''); setPContemp(''); setPObs('');
    requestAnimationFrame(() => topo.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  if (resultado) {
    const modelo = modelos.find((m) => m.nome === interesse);
    const lb = credito ? lanceDoBolso(credito, cfg) : null;
    const sa = cfg.super_assembleia;
    const semEntrada = (cfg.condicoes || []).some((c) => /sem entrada/i.test(c));
    const primeiroNome = nome.trim().split(/\s+/)[0] || '';
    // O resumo final que vai para o cliente (plano 1.3): a carta, as condições, a data e o próximo passo
    const texto = [
      `Olá, ${primeiroNome}! Aqui é ${vendedor.trim()}, da Nova Tratores, na ${ev.nome}. Obrigado pela visita!`,
      'Segue o resumo do seu consórcio Mahindra:',
      '',
      ...(credito ? [
        `${modelo?.nome || 'Carta'}: crédito de ${reais(credito, 0)}`,
        `Parcela de ${reais(parcela(credito, cfg))} por mês (${reais(porDia(credito, cfg))} por dia), em ${cfg.prazo_meses} meses, sem juros`,
        cfg.desconto_parcela ? `${cfg.desconto_parcela.numero}ª parcela com ${cfg.desconto_parcela.pct}% de desconto: ${reais(parcelaComDesconto(credito, cfg)!)}` : null,
        semEntrada ? 'Sem entrada: você começa pagando só a 1ª parcela' : null,
        lb ? `Lance fixo de ${lb.fixoPct}%: ${reais(lb.valor, 0)} do seu bolso (os outros ${cfg.lance_embutido_pct}% saem da própria carta)` : null,
      ] : []),
      assembleia?.proxima_assembleia ? `Grupo ${assembleia.grupo}: vencimento ${dataCurta(assembleia.vencimento)}, assembleia ${dataCurta(assembleia.proxima_assembleia)}` : null,
      sa && modelo?.grupos.includes(sa.grupo || '') ? `Super Assembleia de ${sa.quando}: ${sa.cartas} contemplações` : null,
      passo ? `\nPróximo passo: ${passo}${passoData ? ` em ${dataCurta(passoData)}` : ''}.` : null,
      '',
      `Qualquer dúvida, é só responder aqui. ${vendedor.trim()} · Nova Tratores`,
    ].filter((l) => l !== null).join('\n');
    const linkCliente = `https://wa.me/55${tel.replace(/\D/g, '')}?text=${encodeURIComponent(texto)}`;

    return (
      <div ref={topo} className="cs-sorte">
        {verLeads && <PainelLeads slug={slug} pendentes={pendentes} onFechar={() => setVerLeads(false)} />}
        {avisoFila}
        {resultado.offline ? (
          <p><b>Sem internet: a ficha de {primeiroNome} ficou salva neste aparelho.</b> Quando a internet voltar, ela vai sozinha e a proposta em PDF segue para o WhatsApp do cliente.</p>
        ) : resultado.pdf?.enviado ? (
          <p><b>Salvo!</b> A proposta em PDF foi enviada para o WhatsApp de {primeiroNome} ({tel}).</p>
        ) : (
          <p><b>Ficha salva{resultado.ja ? ' (o cliente já estava cadastrado; a ficha foi atualizada)' : ''}.</b> O PDF não foi pelo WhatsApp{resultado.pdf?.motivo ? `: ${resultado.pdf.motivo}` : ''}. Baixe o PDF abaixo e mande você mesmo.</p>
        )}
        <div className="cs-sorte-acoes">
          {resultado.pdf?.base64 && (
            <a className="cs-btn cs-btn-claro" href={`data:application/pdf;base64,${resultado.pdf.base64}`} download={`Proposta Consorcio Mahindra - ${primeiroNome}.pdf`}>Baixar o PDF</a>
          )}
          {!resultado.pdf?.enviado && !resultado.offline && (
            <a className="cs-btn cs-btn-zap" href={linkCliente} target="_blank" rel="noopener noreferrer">Mandar resumo em texto</a>
          )}
          <button className="cs-btn cs-btn-claro" onClick={() => { setResultado(null); requestAnimationFrame(() => topo.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })); }}>Editar cliente</button>
          <button className="cs-btn cs-btn-claro" onClick={proximo}>+ Próximo cliente</button>
          <button className="cs-btn cs-btn-claro" onClick={() => setVerLeads(true)}>Ver leads</button>
        </div>
        <details className="cs-f-resumo"><summary>Ver o resumo que vai para o cliente</summary><pre className="cs-resumo">{texto}</pre></details>
      </div>
    );
  }

  // 25/11 (José: "a ideia é que fique fácil de preencher"): o vendedor de pé no estande, com o celular numa mão.
  // Nome do vendedor uma vez só (fica no aparelho); cliente em 3 campos grandes; trator por foto (um toque);
  // temperatura em 3 botões grandes; o resto em "Mais detalhes (opcional)"; botão de salvar sempre à vista.
  return (
    <div ref={topo} className="cs-ficha cs-ficha-rapida">
      {verLeads && <PainelLeads slug={slug} pendentes={pendentes} onFechar={() => setVerLeads(false)} />}
      {perfil === 'verificando' ? (
        <div className="cs-vazio">Carregando...</div>
      ) : perfil === 'fora' ? (
        <div className="cs-f-perfil">
          <b>Entre com o seu usuário do portal</b>
          <p>A ficha fica no seu nome e os leads são contados por vendedor. Entre uma vez com internet; depois funciona até sem sinal.</p>
          <a className="cs-btn" href={`/login?redirect_to=${encodeURIComponent(typeof location !== 'undefined' ? location.pathname : '/')}`}>Entrar no portal</a>
        </div>
      ) : (<>
      <button type="button" className="cs-f-leads" onClick={() => setVerLeads(true)}>Ver leads</button>
      {!ev.ativo ? (
        <div className="cs-vazio">As inscrições deste evento estão encerradas.</div>
      ) : (
        <form onSubmit={enviar} className="cs-form">
          {avisoFila}
          <div className="cs-f-vend-chip">Vendedor: <b>{vendedor}</b> <span>(perfil do portal)</span></div>

          <div className="cs-f-bloco">
            <span className="cs-f-titulo"><i>1</i>Cliente</span>
            <input className="cs-f-grande" value={nome} onChange={(e) => setNome(e.target.value)} required autoComplete="off"
              placeholder="Nome do cliente" aria-label="Nome do cliente" autoCapitalize="words" />
            <input className="cs-f-grande" value={tel} onChange={(e) => setTel(mascaraTel(e.target.value))} required inputMode="tel" autoComplete="off"
              placeholder="WhatsApp com DDD" aria-label="WhatsApp do cliente, com DDD" />
            <input className="cs-f-grande" value={cidade} onChange={(e) => setCidade(e.target.value)} autoComplete="off"
              placeholder="Cidade (opcional)" aria-label="Cidade" autoCapitalize="words" />
            <input className="cs-f-grande" value={endereco} onChange={(e) => setEndereco(e.target.value)} autoComplete="off"
              placeholder="Endereço / propriedade (opcional)" aria-label="Endereço" />
            <span className="cs-f-sub">Como chegou?</span>
            <div className="cs-f-passos">
              {VINDA_DE.map((v) => (
                <button key={v} type="button" aria-pressed={vindaDe === v} onClick={() => setVindaDe(vindaDe === v ? '' : v)}>{v}</button>
              ))}
            </div>
          </div>

          <div className="cs-f-bloco">
            <span className="cs-f-titulo"><i>2</i>Trator de interesse</span>
            <div className="cs-f-tratores">
              {modelos.map((m) => {
                const { modelo } = partesDoNome(m.nome);
                return (
                  <button key={m.nome} type="button" className="cs-f-trator" aria-pressed={interesse === m.nome} onClick={() => setInteresse(m.nome)}>
                    {m.foto ? <img src={m.foto} alt="" loading="lazy" /> : <span className="cs-f-sem" />}
                    <b>{modelo}</b>
                    <small>{reais(parcela(m.credito, cfg))}/mês</small>
                  </button>
                );
              })}
              <button type="button" className="cs-f-trator cs-f-trator-txt" aria-pressed={interesse === ''} onClick={() => setInteresse('')}>
                <b>Ainda não sabe</b>
              </button>
            </div>
            {credito && (
              <p className="cs-f-info">
                Crédito <b>{reais(credito, 0)}</b> · <b>{reais(parcela(credito, cfg))}</b>/mês
                {lanceDoBolso(credito, cfg) ? <> · lance: <b>{reais(lanceDoBolso(credito, cfg)!.valor, 0)}</b> do bolso</> : null}
              </p>
            )}
          </div>

          <div className="cs-f-bloco">
            <span className="cs-f-titulo"><i>3</i>Como o cliente está?</span>
            <div className="cs-f-temp">
              {([['quente', 'Quente', 'quer fechar'], ['morno', 'Morno', 'interessado'], ['frio', 'Frio', 'só olhando']] as const).map(([v, rot, dica]) => (
                <button key={v} type="button" className={`cs-f-t cs-f-t-${v}`} aria-pressed={temperatura === v} onClick={() => setTemperatura(v)}>
                  <b>{rot}</b><small>{dica}</small>
                </button>
              ))}
            </div>
          </div>

          <details className="cs-f-mais">
            <summary>Proposta <span>{creditoProp ? `(${reais(creditoProp, 0)})` : '(opcional)'}</span></summary>
            <p className="cs-f-dica">Já vem com a conta do trator escolhido. Só mude o que negociar diferente.</p>
            <div className="cs-f-grid">
              <label>Crédito (R$)<input inputMode="decimal" value={pCredito} onChange={(e) => setPCredito(e.target.value)} placeholder={credito ? reais(credito, 0).replace('R$', '').trim() : 'Ex.: 146.685'} /></label>
              <label>Parcela (R$)<input inputMode="decimal" value={pParcela} onChange={(e) => setPParcela(e.target.value)} placeholder={padrao.parcela ? reais(padrao.parcela).replace('R$', '').trim() : ''} /></label>
              <label>Prazo (meses)<input inputMode="numeric" value={pPrazo} onChange={(e) => setPPrazo(e.target.value)} placeholder={padrao.prazo ? String(padrao.prazo) : ''} /></label>
              <label>Embutido (%)<input inputMode="decimal" value={pEmbutido} onChange={(e) => setPEmbutido(e.target.value)} placeholder={padrao.embutido ? String(padrao.embutido) : ''} /></label>
              <label>Lance próprio (R$)<input inputMode="decimal" value={pLance} onChange={(e) => setPLance(e.target.value)} placeholder={padrao.lance ? reais(padrao.lance, 0).replace('R$', '').trim() : ''} /></label>
              <label>Prazo de contemplação<input list="cs-contemp" value={pContemp} onChange={(e) => setPContemp(e.target.value)} placeholder={sugestoesContemp[0] || 'Ex.: assembleia de dez/26'} /></label>
            </div>
            <datalist id="cs-contemp">{sugestoesContemp.map((x) => <option key={x} value={x} />)}</datalist>
            <label>Observações da proposta
              <textarea value={pObs} onChange={(e) => setPObs(e.target.value)} rows={2} placeholder="Condição combinada, lance que vai ofertar…" />
            </label>
          </details>

          <details className="cs-f-mais">
            <summary>Mais detalhes <span>(opcional)</span></summary>
            <fieldset className="cs-pergunta"><legend>Já tem trator?</legend>
              <Opcoes valor={temTrator} set={setTemTrator} itens={[[true, 'Sim'], [false, 'Não']]} />
            </fieldset>
            <fieldset className="cs-pergunta"><legend>Tem usado para dar de lance?</legend>
              <Opcoes valor={usado} set={setUsado} itens={[[true, 'Sim'], [false, 'Não']]} />
            </fieldset>
            {usado && (
              <label>Qual usado?
                <input value={usadoDesc} onChange={(e) => setUsadoDesc(e.target.value)} placeholder="Ex.: Massey 265, 2008" />
              </label>
            )}
            <span className="cs-f-sub">Próximo passo</span>
            <div className="cs-f-passos">
              {PASSOS.map((p) => (
                <button key={p} type="button" aria-pressed={passo === p} onClick={() => setPasso(passo === p ? '' : p)}>{p}</button>
              ))}
            </div>
            {passo && (
              <label>Quando?
                <input type="date" value={passoData} onChange={(e) => setPassoData(e.target.value)} />
              </label>
            )}
            <label>Fechou em (data)
              <input type="date" value={fechamento} onChange={(e) => setFechamento(e.target.value)} />
            </label>
            <label>Observação
              <textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={3} placeholder="O que o cliente falou, o que pesa na decisão…" />
            </label>
          </details>

          <label className="cs-aceite cs-f-aceite">
            <input type="checkbox" checked={aceite} onChange={(e) => setAceite(e.target.checked)} />
            <span>Cliente autorizou contato no WhatsApp (LGPD)</span>
          </label>
          {erro && <div className="cs-erro" role="alert">{erro}</div>}
          <div className="cs-f-salvar">
            <button className="cs-btn" type="submit" disabled={enviando}>{enviando ? 'Salvando e enviando…' : 'Salvar e enviar a proposta'}</button>
          </div>
        </form>
      )}
      </>)}
    </div>
  );
}

// 26/11 (José): "um modal onde vemos o total de leads, separado por vendedor, e a gente vê tudo".
// Só com login do portal (a rota recusa sem): a ficha é aberta, a lista de clientes não.
const TEMP_TXT: Record<string, string> = { quente: 'Quente', morno: 'Morno', frio: 'Frio' };
const iniciais = (n: string) => n.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';
const corDoNome = (n: string) => { let h = 0; for (const c of n) h = (h * 31 + c.charCodeAt(0)) % 360; return `hsl(${h} 45% 42%)`; };

// 26/11 (José): "um modal onde vemos o total de leads, separado por vendedor, e a gente vê tudo" + "deixa mais bonito"
// + "barra de pesquisa e por vendedor também, e vários filtros". Só com login do portal (a rota recusa sem).
function PainelLeads({ slug, pendentes, onFechar }: { slug: string; pendentes: number; onFechar: () => void }) {
  const [estado, setEstado] = useState<'carregando' | 'login' | 'erro' | 'ok'>('carregando');
  const [erroTxt, setErroTxt] = useState('');
  const [leads, setLeads] = useState<any[]>([]);
  const [aberto, setAberto] = useState<string | null>(null);
  const [verFiltros, setVerFiltros] = useState(false);
  const [busca, setBusca] = useState('');
  const [fVend, setFVend] = useState('');
  const [fTemp, setFTemp] = useState('');
  const [fTrator, setFTrator] = useState('');
  const [fCidade, setFCidade] = useState('');
  const [fChegou, setFChegou] = useState('');
  const [fSituacao, setFSituacao] = useState('');
  const [fDia, setFDia] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`/api/consorcio/${encodeURIComponent(slug)}/leads`, { headers: await authHeaders(), cache: 'no-store' });
        if (r.status === 401) { setEstado('login'); return; }
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || 'Não deu para carregar.');
        setLeads(j.leads || []); setEstado('ok');
      } catch (e: any) { setErroTxt(navigator.onLine === false ? 'Sem internet agora. O painel precisa de internet.' : e.message); setEstado('erro'); }
    })();
  }, [slug]);
  useEffect(() => { const f = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar(); }; window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f); }, [onFechar]);
  useEffect(() => { const o = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = o; }; }, []);

  const quemDe = (l: any) => (l.vendedor || '').trim() || 'Página (QR code)';
  const hojeTxt = hojeISO();
  const diaDe = (l: any) => { try { const d = new Date(l.criado_em); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; } catch { return ''; } };
  const dt = (iso?: string | null) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? `${m[3]}/${m[2]}` : ''; };
  const hora = (iso: string) => { try { return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
  const opcoes = (k: (l: any) => string) => [...new Set(leads.map(k).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const sem = (x: string) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const situacao = (l: any) => l.fechamento_data ? 'fechou'
    : l.proximo_passo_data && l.proximo_passo_data < hojeTxt ? 'atrasado'
    : l.proximo_passo || l.proximo_passo_data ? 'retorno' : 'sem';

  // todos os filtros menos o de vendedor (os cartões de vendedor mostram quanto cada um tem dentro dos outros filtros)
  const termo = sem(busca.trim()), digBusca = busca.replace(/\D/g, '');
  const passa = (l: any) => {
    if (fTemp && (l.temperatura || 'sem') !== fTemp) return false;
    if (fTrator && (l.interesse || '') !== fTrator) return false;
    if (fCidade && (l.cidade || '') !== fCidade) return false;
    if (fChegou && (l.vinda_de || '') !== fChegou) return false;
    if (fSituacao && situacao(l) !== fSituacao) return false;
    if (fDia && diaDe(l) !== fDia) return false;
    if (termo) {
      const alvo = sem([l.nome, l.cidade, l.endereco, l.interesse, quemDe(l), l.observacao, l.proposta_obs, l.vinda_de].filter(Boolean).join(' '));
      const telOk = digBusca.length >= 3 && String(l.telefone || '').replace(/\D/g, '').includes(digBusca);
      if (!alvo.includes(termo) && !telOk) return false;
    }
    return true;
  };
  const base = leads.filter(passa);
  const lista = fVend ? base.filter((l) => quemDe(l) === fVend) : base;
  const porVendedor = (() => {
    const m = new Map<string, any[]>();
    for (const l of leads) m.set(quemDe(l), []);
    for (const l of base) m.get(quemDe(l))!.push(l);
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'pt-BR'));
  })();
  const conta = (f: (l: any) => boolean) => lista.filter(f).length;
  const nFiltros = [fTemp, fTrator, fCidade, fChegou, fSituacao, fDia].filter(Boolean).length;
  const temFiltro = !!(nFiltros || fVend || busca);
  const limpar = () => { setFVend(''); setFTemp(''); setFTrator(''); setFCidade(''); setFChegou(''); setFSituacao(''); setFDia(''); setBusca(''); };

  const X = <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>;
  const LUPA = <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>;
  const SETA = <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>;

  return (
    <div className="cs-modal" role="dialog" aria-modal="true" aria-label="Leads do evento" onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="cs-pl">
        <header className="cs-pl-cab">
          <div className="cs-pl-cab-l">
            <small>Leads do evento</small>
            <b>{estado === 'ok' ? lista.length : '...'}</b>
            {estado === 'ok' && temFiltro && <span>de {leads.length} no total</span>}
          </div>
          <button type="button" className="cs-pl-x" onClick={onFechar} aria-label="Fechar">{X}</button>
          {estado === 'ok' && (
            <div className="cs-pl-kpis">
              <div><b>{conta((l) => l.temperatura === 'quente')}</b><span>quentes</span></div>
              <div><b>{conta((l) => l.temperatura === 'morno')}</b><span>mornos</span></div>
              <div><b>{conta((l) => l.temperatura === 'frio')}</b><span>frios</span></div>
              <div><b>{conta((l) => !!l.fechamento_data)}</b><span>fecharam</span></div>
            </div>
          )}
        </header>

        <div className="cs-pl-corpo">
          {pendentes > 0 && <p className="cs-pl-aviso">{pendentes} ficha(s) deste aparelho ainda esperando internet. Entram aqui quando forem enviadas.</p>}
          {estado === 'carregando' && <p className="cs-pl-msg">Carregando...</p>}
          {estado === 'erro' && <p className="cs-pl-msg">{erroTxt}</p>}
          {estado === 'login' && (
            <div className="cs-pl-msg">
              <p>Para ver os leads, entre com o seu usuário do portal.</p>
              <a className="cs-btn" href={`/login?redirect_to=${encodeURIComponent(typeof location !== 'undefined' ? location.pathname : '/')}`}>Entrar no portal</a>
            </div>
          )}
          {estado === 'ok' && (<>
            <div className="cs-pl-busca">
              {LUPA}
              <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome, telefone, cidade, trator..." aria-label="Pesquisar leads" />
            </div>
            <div className="cs-pl-acoes">
              <button type="button" className="cs-pl-fbtn" aria-expanded={verFiltros} onClick={() => setVerFiltros(!verFiltros)}>
                Filtros{nFiltros ? <i>{nFiltros}</i> : null}{SETA}
              </button>
              {temFiltro && <button type="button" className="cs-pl-limpar" onClick={limpar}>Limpar</button>}
            </div>
            {verFiltros && (
              <div className="cs-pl-filtros">
                <label>Temperatura<select value={fTemp} onChange={(e) => setFTemp(e.target.value)}>
                  <option value="">Todas</option><option value="quente">Quente</option><option value="morno">Morno</option><option value="frio">Frio</option><option value="sem">Sem temperatura</option>
                </select></label>
                <label>Situação<select value={fSituacao} onChange={(e) => setFSituacao(e.target.value)}>
                  <option value="">Todas</option><option value="fechou">Fechou</option><option value="retorno">Retorno marcado</option><option value="atrasado">Retorno atrasado</option><option value="sem">Sem retorno</option>
                </select></label>
                <label>Trator<select value={fTrator} onChange={(e) => setFTrator(e.target.value)}>
                  <option value="">Todos</option>{opcoes((l) => l.interesse || '').map((x) => <option key={x} value={x}>{x}</option>)}
                </select></label>
                <label>Cidade<select value={fCidade} onChange={(e) => setFCidade(e.target.value)}>
                  <option value="">Todas</option>{opcoes((l) => l.cidade || '').map((x) => <option key={x} value={x}>{x}</option>)}
                </select></label>
                <label>Como chegou<select value={fChegou} onChange={(e) => setFChegou(e.target.value)}>
                  <option value="">Todos</option>{opcoes((l) => l.vinda_de || '').map((x) => <option key={x} value={x}>{x}</option>)}
                </select></label>
                <label>Dia<select value={fDia} onChange={(e) => setFDia(e.target.value)}>
                  <option value="">Todos</option>{opcoes(diaDe).reverse().map((x) => <option key={x} value={x}>{dt(x)}{x === hojeTxt ? ' (hoje)' : ''}</option>)}
                </select></label>
              </div>
            )}

            <h4 className="cs-pl-h">Por vendedor</h4>
            <div className="cs-pl-vends">
              <button type="button" className="cs-pl-vend" aria-pressed={!fVend} onClick={() => setFVend('')}>
                <span className="cs-pl-av" style={{ background: 'var(--grafite)' }}>T</span>
                <span className="cs-pl-vn">Todos</span><b>{base.length}</b>
              </button>
              {porVendedor.map(([v, ls]) => {
                const q = ls.filter((l) => l.temperatura === 'quente').length, m = ls.filter((l) => l.temperatura === 'morno').length, f = ls.filter((l) => l.temperatura === 'frio').length;
                const tot = Math.max(1, ls.length);
                return (
                  <button key={v} type="button" className="cs-pl-vend" aria-pressed={fVend === v} onClick={() => setFVend(fVend === v ? '' : v)}>
                    <span className="cs-pl-av" style={{ background: corDoNome(v) }}>{iniciais(v)}</span>
                    <span className="cs-pl-vn">{v}</span><b>{ls.length}</b>
                    <span className="cs-pl-barra"><i style={{ width: `${(q / tot) * 100}%`, background: 'var(--vermelho)' }} /><i style={{ width: `${(m / tot) * 100}%`, background: 'var(--dourado)' }} /><i style={{ width: `${(f / tot) * 100}%`, background: '#5B8DB8' }} /></span>
                  </button>
                );
              })}
            </div>

            <h4 className="cs-pl-h">{lista.length} {lista.length === 1 ? 'cliente' : 'clientes'}{fVend ? ` de ${fVend}` : ''}</h4>
            {!lista.length && <p className="cs-pl-msg">{temFiltro ? 'Nenhum cliente com esses filtros.' : 'Nenhum lead ainda.'}</p>}
            <div className="cs-pl-lista">
              {lista.map((l) => {
                const ab = aberto === l.id;
                const det: [string, string][] = ([
                  ['Cidade', l.cidade], ['Endereço', l.endereco], ['Como chegou', l.vinda_de], ['Trator', l.interesse],
                  ['Crédito', l.credito ? reais(Number(l.credito), 0) : ''], ['Parcela', l.parcela ? reais(Number(l.parcela)) : ''],
                  ['Prazo', l.prazo_meses ? `${l.prazo_meses} meses` : ''], ['Embutido', l.embutido_pct ? `${l.embutido_pct}%` : ''],
                  ['Lance próprio', l.lance_proprio ? reais(Number(l.lance_proprio), 0) : ''], ['Contemplação', l.prazo_contemplacao],
                  ['Retorno', l.proximo_passo ? `${l.proximo_passo}${l.proximo_passo_data ? ` em ${dt(l.proximo_passo_data)}` : ''}` : ''],
                  ['Fechou em', dt(l.fechamento_data)], ['Já tem trator', l.tem_trator == null ? '' : l.tem_trator ? 'Sim' : 'Não'],
                  ['Usado para lance', l.usado_para_lance ? `Sim${l.usado_descricao ? ` (${l.usado_descricao})` : ''}` : l.usado_para_lance === false ? 'Não' : ''],
                  ['Obs. da proposta', l.proposta_obs], ['Observação', l.observacao],
                ] as [string, string][]).filter(([, v]) => v);
                const sit = situacao(l);
                return (
                  <article key={l.id} className={`cs-pl-lead cs-pl-t-${l.temperatura || 'x'}`}>
                    <button type="button" className="cs-pl-lcab" aria-expanded={ab} onClick={() => setAberto(ab ? null : l.id)}>
                      <span className="cs-pl-av">{iniciais(l.nome)}</span>
                      <span className="cs-pl-ln">
                        <b>{l.nome}</b>
                        <small>{[l.interesse, l.cidade].filter(Boolean).join(' · ') || l.telefone}</small>
                        <em>{quemDe(l)} · {hora(l.criado_em)}</em>
                      </span>
                      <span className="cs-pl-lr">
                        <span className="cs-pl-tag">{TEMP_TXT[l.temperatura] || 'Sem temp.'}</span>
                        {sit === 'fechou' && <span className="cs-pl-sit ok">Fechou</span>}
                        {sit === 'atrasado' && <span className="cs-pl-sit atr">Retorno atrasado</span>}
                        <span className="cs-pl-seta">{SETA}</span>
                      </span>
                    </button>
                    {ab && (
                      <div className="cs-pl-det">
                        <a className="cs-pl-zap" href={`https://wa.me/55${String(l.telefone || '').replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer">Chamar no WhatsApp · {l.telefone}</a>
                        <dl>{det.map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>)}</dl>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </>)}
        </div>
      </div>
    </div>
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

// Fontes da marca: as mesmas da página da Black Friday (public/black-friday/fonts), servidas pelo portal.
const CSS = `
@font-face{font-family:"Quantum Rise";src:url(/black-friday/fonts/quantum-rise-bold.woff2) format("woff2");font-weight:700;font-display:swap}
@font-face{font-family:"Georama SemiExpanded";src:url(/black-friday/fonts/georama-semiexpanded-regular.woff2) format("woff2");font-weight:400;font-display:swap}
@font-face{font-family:"Georama SemiExpanded";src:url(/black-friday/fonts/georama-semiexpanded-semibold.woff2) format("woff2");font-weight:600;font-display:swap}
@font-face{font-family:"Georama SemiExpanded";src:url(/black-friday/fonts/georama-semiexpanded-bold.woff2) format("woff2");font-weight:700;font-display:swap}
.cs{--vermelho:#E31837;--vermelho-esc:#B5122B;--preto:#231F20;--grafite:#2E2A2B;--aco:#4D4D4F;--claro:#E6E7E8;--branco:#fff;
  --dourado:#E5B94E;--borda:#CFD0D2;--marcada:#FDECEF;--raio:14px;
  --titulo:"Quantum Rise","Georama SemiExpanded",system-ui,sans-serif;--fonte:"Georama SemiExpanded",system-ui,-apple-system,"Segoe UI",sans-serif;
  --margem:clamp(1rem,.5rem + 2.5vw,4rem);
  min-height:100vh;background:var(--branco);color:var(--aco);font-family:var(--fonte);font-size:clamp(1rem,.96rem + .2vw,1.125rem);line-height:1.5}
.cs *{box-sizing:border-box}
.cs-vazio{padding:48px 16px;text-align:center}
.cs strong{color:inherit;font-weight:700}

/* topo */
.cs-topo{position:relative;overflow:hidden;color:#fff;background:var(--preto) url(/consorcio/topo.webp) 72% 45%/cover no-repeat}
.cs-topo::before{content:'';position:absolute;inset:0;background:linear-gradient(90deg,rgba(35,31,32,.88) 0%,rgba(35,31,32,.55) 45%,rgba(35,31,32,.05) 75%),linear-gradient(180deg,rgba(35,31,32,.6) 0%,rgba(35,31,32,0) 30%,rgba(35,31,32,.55) 75%,var(--preto) 100%)}
.cs-raio{position:absolute;inset:0;container-type:size;overflow:hidden;pointer-events:none}
/* Raio Crescente: o do manual (20°, vermelho, sai da borda esquerda), mas baixo e curto para correr
   na faixa livre embaixo dos botões, sem cruzar o texto (sobe no máximo ~9% da altura do topo) */
.cs-raio span{position:absolute;left:0;bottom:2cqh;width:min(60cqw,17cqh);height:max(5px,1.2cqmin);background:var(--vermelho);transform-origin:left bottom;transform:rotate(-20deg)}
.cs-barra{position:relative;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px var(--margem)}
.cs-logo{height:clamp(30px,4vw,40px);width:auto}
.cs-conc{display:flex;flex-direction:column;align-items:flex-end;line-height:1.1}
.cs-conc small{font-size:.8rem;opacity:.9}
.cs-conc b{font-family:var(--titulo);font-size:clamp(1rem,.8rem + 1vw,1.4rem);letter-spacing:.02em}
.cs-topo-in{position:relative;max-width:1180px;margin:0 auto;padding:clamp(3rem,12vh,7rem) var(--margem) clamp(3rem,8vh,5rem);display:grid;gap:28px;align-items:center;grid-template-columns:1fr}
.cs-topo-texto{display:flex;flex-direction:column;align-items:flex-start;gap:14px;min-width:0}
.cs-topo-lado{min-width:0;width:100%;max-width:420px}
@media (min-width:980px){.cs-topo-lado{justify-self:end}}
@media (min-width:980px){.cs-topo-in{grid-template-columns:minmax(0,1.25fr) minmax(0,.85fr);min-height:min(78vh,720px)}
  .cs-topo-in .cs-h1{font-size:clamp(2.6rem,1rem + 3.6vw,4.2rem)}}
.cs-estande{background:#facc15;color:var(--preto);font-weight:700;font-size:.85rem;padding:4px 12px;border-radius:99px}
.cs-kicker{margin:0;font-weight:600;font-size:.95rem;letter-spacing:.04em;text-transform:uppercase;color:var(--claro)}
.cs-h1{margin:0;font-family:var(--titulo);font-weight:700;text-transform:uppercase;color:var(--dourado);font-size:clamp(1.8rem,.2rem + 8.6vw,5.8rem);line-height:.95;letter-spacing:.01em}
.cs-etiqueta{display:inline-block;margin-top:-4px;background:var(--vermelho);color:#fff;font-family:var(--titulo);text-transform:uppercase;font-size:clamp(1.15rem,.7rem + 2.4vw,2.2rem);padding:.2em .6em .25em;border-radius:12px;letter-spacing:.03em}
.cs-sub{margin:6px 0 0;max-width:34ch;font-size:clamp(1.125rem,1.05rem + .4vw,1.375rem);color:#fff}
.cs-premio{display:flex;flex-direction:column;border:2px solid var(--dourado);border-radius:var(--raio);padding:10px 16px;background:rgba(35,31,32,.6)}
.cs-premio span{font-size:.9rem;color:var(--claro)}.cs-premio strong{font-size:1.2rem;color:var(--dourado)}
.cs-acoes{display:flex;flex-wrap:wrap;align-items:center;gap:8px 22px;margin-top:6px}
.cs-btn{display:inline-flex;align-items:center;justify-content:center;text-align:center;text-decoration:none;appearance:none;border:0;background:var(--vermelho);color:#fff;font-family:var(--fonte);font-weight:700;font-size:1.05rem;min-height:52px;padding:0 26px;border-radius:10px;cursor:pointer}
.cs-btn:hover{background:var(--vermelho-esc)}
.cs-btn:disabled{opacity:.55;cursor:not-allowed}
.cs-link{appearance:none;border:0;background:none;color:#fff;font-family:var(--fonte);font-weight:700;font-size:1.05rem;cursor:pointer;padding:12px 0}

/* faixa vermelha de números */
.cs-faixa{background:var(--vermelho);color:#fff;display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:18px 24px;padding:22px var(--margem)}
.cs-faixa div{display:flex;flex-direction:column}
.cs-faixa b{font-family:var(--titulo);font-size:clamp(1.05rem,.9rem + .8vw,1.5rem);line-height:1.15}
.cs-faixa span{font-size:.95rem}

/* seções */
.cs-secao{padding:clamp(2.5rem,1.5rem + 4vw,5rem) var(--margem)}
.cs-cinza{background:var(--claro)}
.cs-escuro{background:var(--preto);color:var(--claro)}
.cs-in{max-width:1120px;margin:0 auto}
.cs-estreito{max-width:680px}
.cs-h2{margin:0 0 8px;font-family:var(--titulo);font-weight:700;text-transform:uppercase;color:var(--preto);font-size:clamp(1.5rem,1.1rem + 1.6vw,2.4rem);line-height:1.1}
.cs-escuro .cs-h2{color:#fff}

/* contagem regressiva e local (topo da divulgação) */
.cs-contagem{display:flex;flex-direction:column;align-items:flex-start;gap:6px;background:rgba(35,31,32,.72);border-left:6px solid var(--vermelho);border-radius:0 14px 14px 0;padding:12px 16px}
.cs-contagem-rot{font-weight:700;color:#fff;display:flex;align-items:center;gap:8px}
.cs-contagem-num{display:flex;gap:10px}
.cs-contagem-num div{display:flex;flex-direction:column;align-items:center;min-width:64px;background:var(--preto);border-radius:10px;padding:6px 8px}
.cs-contagem-num b{font-family:var(--titulo);color:var(--dourado);font-size:clamp(1.6rem,1.2rem + 1.5vw,2.2rem);line-height:1}
.cs-contagem-num small{font-size:.8rem;color:var(--claro)}
.cs-contagem-local{font-size:.95rem;color:var(--claro)}
.cs-contagem-mapa{color:#fff;font-weight:700;text-decoration:none}
.cs-contagem-estande{font-family:var(--titulo);color:var(--dourado);font-size:clamp(1.4rem,1.1rem + 1vw,1.9rem)}
.cs-ponto{width:10px;height:10px;border-radius:50%;background:#22c55e;box-shadow:0 0 0 4px rgba(34,197,94,.3);display:inline-block}
.cs-estande-num{font-family:var(--titulo);color:var(--dourado);font-size:clamp(1.5rem,1.2rem + 1.2vw,2rem);margin:0 0 8px}
.cs-endereco{white-space:pre-line;color:#fff;font-weight:600;font-size:1.1rem;margin:0 0 12px}
.cs-ouro{color:var(--dourado)!important}
.cs-escuro .cs-lead{color:var(--claro)}
.cs-urgencia-carta{align-self:stretch;max-width:none;margin-top:10px}

/* mapa */
.cs-mapa-grade{display:grid;gap:18px;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));align-items:start;margin:8px 0 20px}
.cs-mapa{width:100%;aspect-ratio:16/10;border:0;border-radius:var(--raio);background:var(--grafite)}

/* ═══ revisão de design (24/11/2026) ═══ */

.cs-topo-texto{max-width:620px}
.cs .cs-h1{font-size:clamp(2rem,.2rem + 7.6vw,4.8rem)!important;line-height:1}
.cs-evento{align-self:stretch;display:flex;flex-direction:column;gap:10px;background:rgba(20,17,18,.66);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.12);border-left:4px solid var(--dourado);border-radius:14px;padding:16px 18px}
.cs-evento-rot{font-weight:700;color:var(--dourado);text-transform:uppercase;letter-spacing:.06em;font-size:.82rem;display:flex;align-items:center;gap:8px}
.cs-evento-linha{display:grid;grid-template-columns:22px 1fr;gap:8px;color:#fff;font-size:1rem;line-height:1.4}
.cs-evento-linha b{font-weight:700}
.cs-evento-estande{font-family:var(--titulo);color:var(--dourado);font-size:clamp(1.3rem,1rem + 1vw,1.7rem)}
.cs-evento-pe{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px 16px;border-top:1px solid rgba(255,255,255,.14);padding-top:10px}
.cs-evento-pe a{color:var(--dourado);font-weight:700;text-decoration:none}
.cs-evento-pe a:hover{text-decoration:underline}
.cs-tic{display:flex;align-items:baseline;gap:6px;color:var(--claro);font-size:.9rem}
.cs-tic-un{display:inline-flex;align-items:baseline;gap:1px}
.cs-tic-un b{display:inline-block;font-family:var(--titulo);color:#fff;font-size:1.05rem;font-variant-numeric:tabular-nums;animation:cs-desliza .45s cubic-bezier(.2,.8,.2,1)}
@keyframes cs-desliza{from{transform:translateY(-55%);opacity:0}to{transform:none;opacity:1}}
.cs-zap{display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:52px;padding:0 24px;border-radius:12px;background:#1FA855;color:#fff;font-family:var(--fonte);font-weight:700;font-size:1.05rem;text-decoration:none;border:2px solid #1FA855;box-shadow:0 8px 22px rgba(31,168,85,.28);transition:transform .15s ease,background .15s ease}
.cs-zap:hover{background:#178A45;border-color:#178A45;transform:translateY(-1px)}
.cs-zap-contorno{background:#fff;color:#137a3b;box-shadow:none;min-height:44px;font-size:.95rem;padding:0 14px}
.cs-zap-contorno:hover{background:#ecf9f1;color:#137a3b}
.cs-topo-texto .cs-zap{margin-top:4px}
/* carta: foto presa só no desktop (no celular ela cobria o preço) */
.cs-carta-foto{position:static!important;margin-top:0!important}
@media (min-width:1024px){.cs-carta-foto{position:sticky!important;top:24px}}
.cs-carta-nome{margin:0;font-family:var(--titulo);text-transform:uppercase;color:#fff;font-size:clamp(1.3rem,1rem + 1.2vw,1.8rem);line-height:1.15}
.cs-carta-nome span{display:block;margin-top:4px;font-family:var(--fonte);text-transform:none;font-weight:600;font-size:1rem;color:var(--claro)}
.cs-carta .cs-carta-parcela{margin-top:10px;color:var(--dourado);font-size:clamp(1.9rem,1.2rem + 2.8vw,3.4rem);line-height:1;white-space:normal}
@media (max-width:600px){.cs-carta .cs-carta-parcela small{display:block;margin:4px 0 0}}
.cs-carta-dia{color:var(--claro)}
.cs-carta-dia b{color:#fff}
.cs-prazo{align-self:stretch;margin-top:12px;display:flex;flex-wrap:wrap;align-items:center;gap:4px 14px;background:var(--vermelho);color:#fff;border-radius:12px;padding:12px 16px}
.cs-prazo b{font-family:var(--titulo);font-size:clamp(1.05rem,.95rem + .5vw,1.3rem);white-space:nowrap}
.cs-prazo span{font-size:.95rem;line-height:1.35}
.cs-caminhos{align-self:stretch;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,210px),1fr));gap:10px;margin:14px 0 16px}
.cs-caminho{border:1px solid rgba(255,255,255,.16);border-radius:12px;padding:14px 16px;display:flex;flex-direction:column;gap:6px}
.cs-caminho-forte{border-color:var(--dourado);background:rgba(229,185,78,.08)}
.cs-caminho-rot{font-weight:700;text-transform:uppercase;letter-spacing:.06em;font-size:.78rem;color:var(--claro)}
.cs-caminho-forte .cs-caminho-rot{color:var(--dourado)}
.cs-caminho b{font-family:var(--titulo);color:#fff;font-size:clamp(1.1rem,1rem + .5vw,1.35rem)}
.cs-caminho ul{margin:0;padding-left:18px;color:var(--claro);font-size:.92rem;display:flex;flex-direction:column;gap:4px}
/* fundos: escuro (topo e carta) → claro (detalhes e outras cartas) → escuro (mapa e rodapé) */
.cs-claro{background:#fff}
.cs-claro-borda{border-top:1px solid var(--claro)}
.cs-escuro-borda{border-top:1px solid rgba(255,255,255,.08)}
.cs-cond-grade{align-items:start!important}
.cs-regras-grupo{margin-top:18px;border-top:1px solid var(--claro);padding-top:14px}
.cs-regras-grupo summary{cursor:pointer;font-weight:700;color:var(--preto)}
.cs-regras-grupo ul{margin:12px 0;padding-left:20px;display:flex;flex-direction:column;gap:4px}
/* outras cartas: grade cheia no desktop, compacta no celular */
.cs-mais{grid-template-columns:repeat(auto-fit,minmax(min(100%,210px),1fr))!important}
.cs-mais-card{border:1px solid var(--claro)}
.cs-mais-in h3 b{font-size:1.15rem!important}
.cs-mais-in .cs-zap{width:100%}
@media (max-width:600px){
  .cs .cs-mais-card{flex-direction:row;align-items:stretch}
  .cs .cs-mais-foto{flex:0 0 112px;aspect-ratio:auto;border-bottom:0;border-right:1px solid var(--claro)}
  .cs .cs-mais-in{padding:10px 12px;gap:4px}
  .cs .cs-mais-in h3 span{min-height:0}
  .cs .cs-mais-in dl{margin:2px 0 8px}
  .cs .cs-mais-parcela small{display:inline;margin-left:2px}
}
/* mapa */
.cs-link-mapa{display:inline-block;color:var(--dourado);font-weight:700;text-decoration:none;margin-bottom:12px}
.cs-link-mapa:hover{text-decoration:underline}
.cs-mapa-texto{display:flex;flex-direction:column;align-items:flex-start}
/* rodapé sem a faixa vermelha */
footer.cs-rodape{padding-bottom:96px}
/* barra fixa do celular */
.cs-barra-zap{display:none}
@media (max-width:720px){
  .cs-barra-zap{display:block;position:fixed;left:0;right:0;bottom:0;z-index:50;padding:10px 16px calc(10px + env(safe-area-inset-bottom));background:rgba(35,31,32,.94);backdrop-filter:blur(8px);transform:translateY(110%);transition:transform .25s ease}
  .cs-barra-zap.on{transform:none}
  .cs-barra-zap .cs-zap{width:100%}
}
@media (prefers-reduced-motion:reduce){.cs-tic-un b{animation:none}.cs-barra-zap{transition:none}}

/* página do vendedor */
/* fundo: a foto do trator escurecida no alto (a ficha flutua sobre ela) e linhas finas a 20° no cinza */
.cs-vend-fundo{position:relative;overflow:hidden;background:var(--claro) repeating-linear-gradient(-20deg,rgba(35,31,32,.035) 0 2px,transparent 2px 26px)}
.cs-vend-fundo::before{content:'';position:absolute;left:0;right:0;top:0;height:clamp(220px,34vh,340px);
  background:linear-gradient(180deg,rgba(35,31,32,.55) 0%,rgba(35,31,32,.88) 100%),url(/consorcio/topo.webp) center 45%/cover no-repeat}
.cs-vend-fundo .cs-in{position:relative}
.cs-raio-vend{height:clamp(220px,34vh,340px);bottom:auto}
.cs-raio-vend span{bottom:10cqh;width:min(45cqw,60cqh)}
.cs-vend-fundo .cs-ficha{box-shadow:0 18px 40px rgba(35,31,32,.25)}
.cs-barra-vend{display:flex;align-items:center;justify-content:space-between;gap:12px;background:var(--preto);color:#fff;padding:12px var(--margem);font-weight:600}
.cs-barra-vend .cs-logo{height:30px}
.cs-dupla{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px}
.cs-form textarea{font-family:var(--fonte);font-size:1.0625rem;padding:10px 14px;border:1.5px solid var(--borda);border-radius:10px;color:var(--preto);resize:vertical;font-weight:400}
.cs-resumo{white-space:pre-wrap;text-align:left;font-family:var(--fonte);font-size:.95rem;background:var(--grafite);color:var(--claro);border-radius:12px;padding:14px;margin:8px 0 0;max-height:280px;overflow:auto}
.cs-outros-destaque{outline:2px solid var(--vermelho)}

/* cronômetro (painel do topo) */
.cs-crono{display:flex;flex-direction:column;gap:14px;background:rgba(20,17,18,.62);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.12);border-radius:18px;padding:clamp(18px,2.4vw,28px)}
.cs-crono-rot{font-weight:700;color:var(--claro);text-transform:uppercase;letter-spacing:.08em;font-size:.82rem;display:flex;align-items:center;gap:8px}
.cs-crono-num{display:grid;grid-template-columns:repeat(4,1fr);gap:0}
.cs-crono-un{display:flex;flex-direction:column;align-items:center;padding:4px 0}
.cs-crono-un + .cs-crono-un{border-left:1px solid rgba(255,255,255,.14)}
.cs-crono-un b{font-family:var(--titulo);color:var(--dourado);font-size:clamp(1.4rem,.95rem + 1.1vw,1.95rem);line-height:1;letter-spacing:.02em;font-variant-numeric:tabular-nums}
.cs-crono-un small{margin-top:8px;font-size:.75rem;color:var(--claro);text-transform:uppercase;letter-spacing:.1em}
.cs-crono-quando{color:#fff;font-weight:600;font-size:1.05rem;padding-top:14px;border-top:1px solid rgba(255,255,255,.14)}
.cs-crono-local{display:flex;flex-wrap:wrap;align-items:center;gap:4px 14px;color:var(--claro);font-size:.95rem}
.cs-crono-local a{color:var(--dourado);font-weight:700;text-decoration:none;white-space:nowrap}
.cs-crono-local a:hover{text-decoration:underline}
.cs-ao-vivo{border-color:rgba(34,197,94,.45)}

/* a carta do evento (destaque) */
.cs-carta{display:grid;gap:clamp(20px,3vw,40px);grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));align-items:start}
.cs-carta-foto{position:sticky;top:20px;margin-top:28px;background:#fff;border-radius:var(--raio);aspect-ratio:4/3;display:grid;place-items:center;overflow:hidden}
.cs-carta-foto img{width:100%;height:100%;object-fit:contain}
.cs-carta-info{display:flex;flex-direction:column;align-items:flex-start;gap:6px}
.cs-carta-rot{font-weight:600;text-transform:uppercase;letter-spacing:.04em;font-size:.9rem;color:var(--dourado)}
.cs-carta .cs-h2{margin:0}
.cs-modelo-claro{display:block;font-size:clamp(2rem,1.5rem + 2vw,3rem);color:#fff}
.cs-resto-claro{display:block;font-family:var(--fonte);text-transform:none;font-weight:600;font-size:1.05rem;color:var(--claro)}
.cs-carta-credito{display:flex;flex-direction:column;font-family:var(--titulo);color:var(--dourado);font-size:clamp(1.8rem,1.3rem + 2vw,2.6rem);line-height:1.1;margin-top:8px}
.cs-carta-credito small{font-family:var(--fonte);font-size:.9rem;color:var(--claro);font-weight:400}
.cs-carta-parcela{font-family:var(--titulo);color:#fff;font-size:clamp(1.4rem,1.1rem + 1vw,1.8rem);margin-top:4px;white-space:nowrap}
.cs-carta-parcela small{font-family:var(--fonte);font-size:1rem;color:var(--claro);margin-left:2px}
.cs-carta-dia{color:var(--claro)}
.cs-bolso{margin-top:10px;background:var(--vermelho);color:#fff;border-radius:12px;padding:12px 16px;display:flex;flex-direction:column;gap:2px;align-self:stretch}
.cs-bolso b{font-family:var(--titulo);font-size:clamp(1.15rem,1rem + .6vw,1.4rem)}
.cs-bolso span{font-size:.95rem}
.cs-carta-lista{list-style:none;margin:8px 0 14px;padding:0;display:flex;flex-direction:column;gap:6px;color:var(--claro)}
.cs-carta-lista li{padding-left:22px;position:relative}
.cs-carta-lista li::before{content:'';position:absolute;left:0;top:.55em;width:10px;height:10px;border-radius:2px;background:var(--vermelho)}
.cs-carta-lista b{color:#fff}
.cs-carta .cs-obs{margin:12px 0 0}
.cs-super-nota{display:block;margin-top:14px;font-size:.85rem;color:var(--claro)}

/* outras cartas: cartões com foto */
.cs-mais{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(min(100%,188px),1fr))}
.cs-mais-card{background:#fff;border-radius:var(--raio);overflow:hidden;display:flex;flex-direction:column}
.cs-mais-foto{aspect-ratio:4/3;background:#fff;display:grid;place-items:center;border-bottom:1px solid var(--claro)}
.cs-mais-foto img{width:100%;height:100%;object-fit:contain}
.cs-mais-foto span{font-family:var(--titulo);font-size:2rem;color:var(--claro)}
.cs-mais-in{padding:14px 14px 16px;display:flex;flex-direction:column;gap:6px;flex:1}
.cs-mais-in h3{margin:0;font-size:.95rem;font-weight:600;color:var(--aco);line-height:1.3}
.cs-mais-in h3 span{display:block;min-height:2.6em}
.cs-mais-in h3 b{display:block;font-family:var(--titulo);font-size:1.4rem;color:var(--preto)}
.cs-mais-parcela{font-family:var(--titulo);color:var(--vermelho);font-size:clamp(.95rem,.85rem + .3vw,1.08rem);line-height:1.15;white-space:nowrap}
.cs-mais-parcela small{display:block;font-family:var(--fonte);font-size:.85rem;color:var(--aco)}
.cs-mais-in dl{margin:4px 0 10px;display:flex;flex-direction:column;gap:2px;flex:1;border-top:1px solid var(--claro);padding-top:8px}
.cs-mais-in dl div{display:flex;justify-content:space-between;gap:10px;font-size:.9rem}
.cs-mais-in dt{margin:0}.cs-mais-in dd{margin:0;font-weight:700;color:var(--preto);white-space:nowrap}
a.cs-btn-contorno{display:flex;align-items:center;justify-content:center;text-decoration:none}

/* tabela rápida do vendedor */
.cs-h3{margin:0 0 4px;font-family:var(--titulo);text-transform:uppercase;color:var(--preto);font-size:clamp(1.15rem,1rem + .6vw,1.45rem)}
.cs-outros{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.cs-outros li{display:grid;grid-template-columns:72px 1fr auto;grid-template-areas:'foto nome valor' 'foto botao botao';gap:4px 14px;align-items:center;background:#fff;border-radius:12px;padding:10px 14px}
.cs-outros img,.cs-outros-sem{grid-area:foto;width:72px;height:54px;object-fit:contain;background:#fff}
.cs-outros-nome{grid-area:nome;color:var(--aco);font-size:.95rem;line-height:1.3}
.cs-outros-nome b{font-family:var(--titulo);color:var(--preto);font-size:1.05rem;margin-right:4px}
.cs-outros-nome small{display:block;font-size:.8rem}
.cs-outros-valor{grid-area:valor;display:flex;flex-direction:column;align-items:flex-end;text-align:right}
.cs-outros-valor b{color:var(--preto)}
.cs-outros-valor small{font-size:.8rem}
.cs-btn-mini{grid-area:botao;justify-self:end;appearance:none;background:none;border:0;color:var(--vermelho-esc);font-family:var(--fonte);font-weight:700;font-size:.95rem;cursor:pointer;padding:6px 0;min-height:36px}
@media (min-width:720px){.cs-outros li{grid-template-columns:72px 1fr auto auto;grid-template-areas:'foto nome valor botao'}.cs-btn-mini{padding-left:12px}}

/* só na supersafra: 41 x 3 e como se paga */
.cs-condicoes{background:#fff}
.cs-cond-grade{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));margin-top:12px;align-items:stretch}
.cs-super{background:var(--preto);color:var(--claro);border-radius:var(--raio);padding:24px;display:flex;flex-direction:column;gap:14px}
.cs-super-rot,.cs-paga-rot{font-weight:700;text-transform:uppercase;letter-spacing:.06em;font-size:.85rem}
.cs-super-rot{color:var(--dourado)}
.cs-super-frase{margin:0;font-size:1.15rem;color:#fff;line-height:1.4}
.cs-super-frase b{color:var(--dourado)}
.cs-super-vs{display:flex;align-items:center;gap:18px}
.cs-super-vs i{font-style:normal;color:rgba(255,255,255,.35);font-size:1.6rem}
.cs-super-vs div{display:flex;flex-direction:column}
.cs-super-vs b{font-family:var(--titulo);line-height:1}
.cs-super-mes b{color:var(--dourado);font-size:clamp(3.5rem,2.5rem + 4vw,5.5rem)}
.cs-super-normal b{color:rgba(255,255,255,.55);font-size:clamp(2rem,1.5rem + 2vw,3rem)}
.cs-super-vs span{font-size:.95rem;margin-top:6px}
.cs-super-nota{font-size:.88rem;color:var(--claro);border-top:1px solid rgba(255,255,255,.14);padding-top:12px;margin-top:auto}
.cs-paga{border:1.5px solid var(--borda);border-radius:var(--raio);padding:24px;display:flex;flex-direction:column;gap:14px}
.cs-paga-rot{color:var(--vermelho-esc)}
.cs-paga ol{list-style:none;margin:0;padding:0;display:flex;flex-direction:column}
.cs-paga li{position:relative;display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-areas:'quando valor' 'como valor';column-gap:12px;padding:10px 0 10px 26px;border-bottom:1px solid var(--claro)}
.cs-paga li:last-child{border-bottom:0}
.cs-paga li::before{content:'';position:absolute;left:4px;top:16px;width:10px;height:10px;border-radius:50%;background:var(--borda)}
.cs-paga li::after{content:'';position:absolute;left:8px;top:28px;bottom:-14px;width:2px;background:var(--claro)}
.cs-paga li:last-child::after{display:none}
.cs-paga-quando{grid-area:quando;font-weight:700;color:var(--preto)}
.cs-paga-como{grid-area:como;font-size:.9rem}
.cs-paga li b{grid-area:valor;align-self:center;font-family:var(--titulo);color:var(--preto);font-size:clamp(1rem,.9rem + .4vw,1.25rem);white-space:nowrap}
.cs-paga li.cs-paga-forte{background:var(--marcada);border-radius:10px;border-bottom-color:transparent;margin:2px -10px;padding-left:36px;padding-right:10px}
.cs-paga li.cs-paga-forte::before{left:14px;background:var(--vermelho)}
.cs-paga li.cs-paga-forte::after{left:18px}
.cs-paga li.cs-paga-forte b,.cs-paga li.cs-paga-forte .cs-paga-como{color:var(--vermelho-esc);font-weight:700}
.cs-tag-ouro{background:var(--preto)!important;color:var(--dourado)!important}
.cs-dd-verm{color:var(--vermelho-esc)!important}

/* cartões */
.cs-grade{display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(270px,1fr))}
.cs-card{background:#fff;border-radius:var(--raio);overflow:hidden;display:flex;flex-direction:column}
.cs-foto{aspect-ratio:4/3;background:#fff;display:grid;place-items:center;border-bottom:1px solid var(--claro)}
.cs-foto img{width:100%;height:100%;object-fit:contain}
.cs-foto-vazia{font-family:var(--titulo);font-size:2.4rem;color:var(--claro)}
.cs-card-in{padding:16px 18px 18px;display:flex;flex-direction:column;gap:6px;flex:1}
.cs-tags{display:flex;flex-wrap:wrap;gap:6px}
.cs-tags span{background:#F2F2F3;color:var(--aco);font-size:.8rem;font-weight:600;border-radius:99px;padding:3px 10px}
.cs-card h3{margin:4px 0 0;font-size:1rem;font-weight:600;color:var(--aco);line-height:1.3}
.cs-modelo{display:block;font-family:var(--titulo);font-size:1.6rem;color:var(--preto);letter-spacing:.01em}
.cs-resto{text-transform:lowercase}
.cs-parcela{margin-top:6px;font-family:var(--titulo);font-size:clamp(1.3rem,1.1rem + .6vw,1.55rem);color:var(--vermelho);line-height:1.1;white-space:nowrap}
.cs-parcela small{font-family:var(--fonte);font-size:1rem;color:var(--aco);margin-left:2px}
.cs-dia{font-size:1rem}
.cs-dl{margin:8px 0 10px;border-top:1px solid var(--claro);padding-top:8px;display:flex;flex-direction:column;gap:4px;flex:1}
.cs-dl div{display:flex;justify-content:space-between;gap:12px;font-size:.95rem}
.cs-dl dt{margin:0}.cs-dl dd{margin:0;font-weight:700;color:var(--preto);white-space:nowrap}
.cs-btn-contorno{appearance:none;background:#fff;border:2px solid var(--vermelho);color:var(--vermelho-esc);font-family:var(--fonte);font-weight:700;font-size:1rem;min-height:46px;border-radius:10px;cursor:pointer}
.cs-btn-contorno:hover{background:var(--marcada)}

/* simulador */
.cs-rotulo{display:block;font-size:1rem}
.cs-valor{font-family:var(--titulo);font-size:clamp(2rem,1.4rem + 2.5vw,3rem);color:var(--dourado);margin:4px 0 6px}
.cs-range{width:100%;accent-color:var(--vermelho);height:36px}
.cs-range-ext{display:flex;justify-content:space-between;font-size:.85rem;margin-bottom:18px}
.cs-sim{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px}
.cs-sim div{background:var(--grafite);border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:2px}
.cs-sim span{font-size:.85rem}
.cs-sim b{font-family:var(--titulo);font-size:clamp(1rem,.9rem + .6vw,1.35rem);color:#fff}
.cs-obs{font-size:.9rem;margin:0 0 20px;opacity:.85}

/* como recebe */
.cs-passos{list-style:none;margin:16px 0 24px;padding:0;display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}
.cs-passos li{display:flex;gap:14px;align-items:flex-start;background:var(--claro);border-radius:var(--raio);padding:16px;color:var(--preto)}
.cs-passos li span{flex:none;width:34px;height:34px;border-radius:8px;background:var(--vermelho);color:#fff;font-family:var(--titulo);display:grid;place-items:center}
.cs-grupos{display:flex;flex-wrap:wrap;gap:10px}
.cs-grupos div{border:1px solid var(--borda);border-radius:12px;padding:10px 14px;display:flex;flex-direction:column;font-size:.95rem}
.cs-grupos b{font-family:var(--titulo);color:var(--preto);font-size:1.05rem}

/* ficha */
.cs-ficha{background:#fff;border-radius:var(--raio);padding:clamp(20px,3vw,32px)}
.cs-form{display:flex;flex-direction:column;gap:16px}
.cs-form label{display:flex;flex-direction:column;gap:6px;font-weight:600;color:var(--preto);font-size:1rem}
.cs-form input:not([type=checkbox]),.cs-form select{font-family:var(--fonte);font-size:1.0625rem;min-height:3rem;padding:0 14px;border:1.5px solid var(--borda);border-radius:10px;background:#fff;color:var(--preto);width:100%;font-weight:400}
.cs-form input:focus-visible,.cs-form select:focus-visible,.cs-opcoes button:focus-visible{outline:3px solid var(--vermelho);outline-offset:1px}
.cs-pergunta{border:0;margin:0;padding:0;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px 12px}
.cs-pergunta legend{float:left;font-weight:600;color:var(--preto)}
.cs-opcoes{display:flex;flex-wrap:wrap;gap:8px}
.cs-opcoes button{appearance:none;font-family:var(--fonte);border:1.5px solid var(--borda);background:#fff;color:var(--preto);font-size:1rem;min-height:3rem;min-width:76px;padding:0 12px;border-radius:10px;cursor:pointer}
.cs-opcoes button[aria-pressed=true]{background:var(--marcada);border-color:var(--vermelho);color:var(--vermelho-esc);font-weight:700}
.cs-obs-claro{margin:0;font-size:.95rem;background:#F2F2F3;border-radius:10px;padding:10px 12px}
.cs-form .cs-aceite{flex-direction:row;align-items:flex-start;gap:10px;font-weight:400;color:var(--aco);font-size:.95rem}
.cs-aceite input{width:22px;height:22px;margin-top:2px;accent-color:var(--vermelho);flex:none}
.cs-isca{position:absolute!important;left:-9999px!important;width:1px!important;height:1px!important;opacity:0}
.cs-erro{background:var(--marcada);color:var(--vermelho-esc);border-radius:10px;padding:10px 12px;font-weight:600}
.cs-ficha .cs-btn{width:100%}
.cs-sorte{background:var(--preto);color:var(--claro);border-radius:var(--raio);padding:32px 20px;text-align:center}
.cs-sorte p{margin:0;font-size:1.1rem}
.cs-sorte-num{font-family:var(--titulo);color:var(--dourado);font-size:clamp(4.5rem,3rem + 8vw,8rem);line-height:1;margin:14px 0}
.cs-sorte-obs{margin-top:8px!important;font-size:1rem!important}
.cs-sorte .cs-btn{margin-top:18px}
.cs-btn-zap{display:inline-flex;align-items:center;justify-content:center;text-decoration:none;background:#1FA855}
.cs-btn-zap:hover{background:#178A45}
.cs-sorte-acoes{display:flex;flex-direction:column;gap:0;align-items:stretch}
.cs-btn-claro{background:#fff;color:var(--preto)}
.cs-btn-claro:hover{background:var(--claro)}
.cs-urgencia{display:flex;flex-direction:column;gap:2px;border-left:6px solid var(--vermelho);background:rgba(35,31,32,.7);padding:10px 14px;border-radius:0 12px 12px 0;max-width:40ch}
.cs-urgencia b{color:#fff;font-size:1.05rem}
.cs-urgencia span{color:var(--dourado);font-weight:600;font-size:.95rem}

/* sorteio */
.cs-ganhadores{display:flex;flex-direction:column;gap:10px;margin:8px 0 16px}
.cs-ganhadores div{display:flex;align-items:center;gap:12px;color:var(--preto);font-weight:600}
.cs-num{background:var(--vermelho);color:#fff;font-family:var(--titulo);border-radius:8px;padding:4px 10px}
.cs-regras summary{cursor:pointer;color:var(--vermelho-esc);font-weight:700}
.cs-regras p{white-space:pre-wrap;font-size:.95rem}

/* rodapé */
.cs-rodape-faixa{background:var(--vermelho);color:#fff;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;padding:20px var(--margem)}
.cs-rodape-faixa .cs-conc{align-items:flex-start}
.cs-rodape-ev{font-family:var(--titulo);font-size:clamp(1.1rem,.9rem + 1vw,1.6rem);text-transform:uppercase}
.cs-rodape{background:var(--preto);color:#B9B9BB;font-size:.85rem;padding:20px var(--margem) 36px}
.cs-rodape p{max-width:1120px;margin:0 auto 8px}
@media (max-width:520px){.cs-sim{grid-template-columns:1fr 1fr}.cs-acoes .cs-btn{width:100%}}

/* ═══ topo de 25/11/2026 (José): esquerda limpa, contagem à direita ═══ */
.cs-trunfos{list-style:none;margin:8px 0 6px;padding:0;display:flex;flex-direction:column;gap:12px}
.cs-trunfos li{position:relative;padding-left:34px;color:#fff;font-size:clamp(1.02rem,.95rem + .45vw,1.25rem);line-height:1.4}
.cs-trunfos li::before{content:'✓';position:absolute;left:0;top:.1em;width:24px;height:24px;border-radius:50%;background:var(--dourado);color:var(--preto);font-size:.8rem;font-weight:800;display:grid;place-items:center}
.cs-trunfos b{color:var(--dourado)}
.cs-topo-acoes{display:flex;flex-wrap:wrap;align-items:center;gap:14px 22px;margin-top:6px}
.cs-onde{color:#fff;font-weight:700;text-decoration:none;border-bottom:1px solid rgba(255,255,255,.45);padding-bottom:2px}
.cs-onde:hover{border-color:var(--dourado);color:var(--dourado)}
.cs-cont{background:rgba(20,17,18,.62);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.14);border-radius:16px;padding:20px;display:flex;flex-direction:column;gap:14px;color:#fff}
.cs-cont-rot{display:flex;align-items:center;gap:8px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;font-size:.8rem;color:var(--dourado)}
.cs-cont-grade{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
.cs-cont-grade div{background:rgba(255,255,255,.07);border-radius:10px;padding:14px 4px 10px;display:flex;flex-direction:column;align-items:center;gap:6px;overflow:hidden}
.cs-cont-grade b{display:block;font-family:var(--titulo);font-size:clamp(1.4rem,1.1rem + .8vw,1.75rem);line-height:1;font-variant-numeric:tabular-nums;animation:cs-desliza .45s cubic-bezier(.2,.8,.2,1)}
.cs-cont-grade span{font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--claro)}
.cs-cont-data{font-size:.95rem;color:var(--claro);border-top:1px solid rgba(255,255,255,.12);padding-top:12px}
.cs-cont-estande{font-family:var(--titulo);color:var(--dourado);font-size:clamp(1.3rem,1rem + 1vw,1.8rem)}
@media (prefers-reduced-motion:reduce){.cs-cont-grade b{animation:none}}

/* ═══ revisão de design v2 (25/11/2026) ═══ */
/* hero: selo do evento, H1 completo para leitor de tela, card enxuto e foto mais escura no celular */
.cs-selo{display:inline-block;font-weight:700;text-transform:uppercase;letter-spacing:.08em;font-size:.8rem;color:var(--dourado);border:1px solid rgba(229,185,78,.55);border-radius:999px;padding:5px 12px;margin-bottom:-4px}
.cs-so-leitor{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
@media (max-width:600px){
  .cs .cs-evento-end{display:none}
  .cs-topo::after{content:'';position:absolute;inset:0;pointer-events:none;background:linear-gradient(to top,rgba(20,17,18,.88) 35%,rgba(20,17,18,.35) 70%,transparent),linear-gradient(to right,rgba(20,17,18,.6),transparent 80%)}
  .cs-topo-in,.cs-topo .cs-barra{z-index:1}
}
/* carta: prazo vira faixa fina (o preço volta a ser o que mais pesa) */
.cs .cs-prazo{background:rgba(227,24,55,.1);border-left:4px solid var(--vermelho);border-radius:0 10px 10px 0;padding:8px 14px;gap:8px;flex-wrap:wrap;color:var(--claro)}
.cs .cs-prazo b{color:#fff;font-size:1rem}
.cs .cs-prazo b::before{content:'';}
.cs .cs-prazo span{font-size:.92rem}
.cs .cs-prazo span::before{content:'· ';color:var(--vermelho)}
/* foto no meio da coluna (no desktop continua presa ao rolar) */
@media (min-width:1024px){.cs .cs-carta-foto{align-self:center;top:32px}}
/* os dois caminhos: valor numa linha só e listas alinhadas com ✓ */
.cs .cs-caminho b{font-size:clamp(1.05rem,.95rem + .3vw,1.15rem);white-space:nowrap}
.cs .cs-caminho ul{list-style:none;padding-left:0}
.cs .cs-caminho li{position:relative;padding-left:20px}
.cs .cs-caminho li::before{content:'✓';position:absolute;left:0;color:var(--dourado);font-weight:700}
/* só na supersafra: subtítulo com o desconto e o "3" legível */
.cs-h2-sub{display:block;margin-top:6px;font-family:var(--fonte);text-transform:none;font-weight:700;font-size:clamp(1.05rem,.95rem + .5vw,1.35rem);color:var(--vermelho)}
.cs .cs-super-normal b{color:rgba(255,255,255,.78)}
.cs .cs-super-vs i{color:rgba(255,255,255,.6)}
.cs .cs-super-vs span{color:rgba(255,255,255,.82)}
/* outras cartas: "Mahindra" pequeno em cima, modelo sem quebrar, preço na cor do texto (vermelho parecia alerta) */
.cs .cs-mais-in h3 small{display:block;font-size:.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--aco)}
.cs .cs-mais-in h3 b{white-space:nowrap}
.cs .cs-mais-parcela{color:var(--preto)}
@media (max-width:600px){
  /* foto maior sem cortar o trator: as imagens têm muito branco em volta, então amplia e corta só o branco */
  .cs .cs-mais-foto{flex:0 0 120px;overflow:hidden}
  .cs .cs-mais-foto img{object-fit:contain;transform:scale(1.5)}
  .cs .cs-tic{white-space:nowrap}
  .cs .cs-selo{font-size:.68rem;letter-spacing:.05em;white-space:nowrap}
  .cs .cs-prazo span{flex-basis:100%}
  .cs .cs-prazo span::before{content:none}
}
/* ═══ topo, 2ª rodada de 25/11/2026 (José): sem caixa na contagem, bloco mais à esquerda e acima, letra maior, botão novo ═══ */
.cs .cs-topo-in{max-width:1400px;min-height:0;align-items:center;padding:clamp(1.25rem,4vh,2.75rem) var(--margem) clamp(4rem,14vh,9rem)}
.cs .cs-topo-texto{max-width:none}
@media (min-width:980px){
  .cs .cs-topo-in{grid-template-columns:minmax(0,1fr) minmax(0,380px);min-height:0}
  .cs .cs-topo .cs-h1{font-size:clamp(3.2rem,9.4vw - 2.7rem,5.6rem)!important}
  .cs .cs-topo .cs-etiqueta{font-size:clamp(1.5rem,.4rem + 1.9vw,2.5rem)}
}
.cs .cs-trunfos li{font-size:clamp(1.08rem,.9rem + .65vw,1.45rem)}
.cs .cs-trunfos li::before{width:26px;height:26px}
/* contagem solta na foto: sem a caixa de fora, só os quadros dos números */
.cs .cs-cont{background:none;border:0;padding:0;backdrop-filter:none;-webkit-backdrop-filter:none;border-radius:0}
.cs .cs-cont-rot{text-shadow:0 1px 8px rgba(0,0,0,.6)}
.cs .cs-cont-grade div{background:rgba(20,17,18,.72);border:1px solid rgba(255,255,255,.1);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
.cs .cs-cont-data{border-top:0;padding-top:0;color:#fff;text-shadow:0 1px 8px rgba(0,0,0,.7)}
/* botão do WhatsApp: maior, sem o brilho verde em volta, ícone num círculo branco */
.cs .cs-zap{min-height:58px;padding:0 26px 0 12px;gap:12px;border-radius:12px;border:0;background:#1FA855;color:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25);font-family:var(--fonte);font-weight:800;font-size:1rem;text-transform:uppercase;letter-spacing:.05em}
.cs .cs-zap svg{flex:0 0 auto;width:36px;height:36px;padding:7px;border-radius:50%;background:#fff;color:#1FA855}
.cs .cs-zap:hover{background:#178A45;transform:translateY(-1px)}
.cs .cs-zap-contorno{min-height:48px;padding:0 16px 0 8px;font-size:.9rem;background:#fff;color:#137a3b;border:2px solid #1FA855;box-shadow:none}
.cs .cs-zap-contorno svg{width:30px;height:30px;padding:6px;background:#1FA855;color:#fff}
.cs .cs-zap-contorno:hover{background:#ecf9f1;color:#137a3b}
/* ═══ topo clássico (24/11/2026, 16h25), restaurado a pedido do José em 25/11: estas regras vencem as de cima ═══ */
.cs .cs-topo-classico{background-position:60% 45%}
.cs .cs-topo-classico::before{background:linear-gradient(180deg,rgba(35,31,32,.72) 0%,rgba(35,31,32,.35) 35%,rgba(35,31,32,.9) 72%,var(--preto) 100%)}
.cs .cs-topo-classico::after{content:none}
.cs .cs-topo-classico .cs-topo-in{display:flex;flex-direction:column;align-items:flex-start;gap:14px;max-width:1120px;min-height:0;grid-template-columns:none;padding:clamp(6rem,30vh,16rem) var(--margem) clamp(5rem,12vh,7rem)}
.cs .cs-topo-classico .cs-h1{font-size:clamp(1.8rem,.2rem + 8.6vw,5.8rem)!important;line-height:.95}
.cs .cs-topo-classico .cs-etiqueta{font-size:clamp(1.15rem,.7rem + 2.4vw,2.2rem)}
.cs .cs-topo-classico .cs-btn{text-decoration:none}
.cs .cs-topo-classico .cs-link{text-decoration:none}
/* 25/11 (José): bloco mais à esquerda (alinhado com o logo) e mais acima */
.cs .cs-topo-classico .cs-topo-in{max-width:none;margin:0;padding-top:clamp(.5rem,3vh,1.75rem)}
/* 25/11 (José, comparando 4 cores): o dourado da marca, sem sombra; a linha "Supersafra · Carlópolis" também dourada */
.cs .cs-topo-classico .cs-kicker{color:#fff}
/* os 3 trunfos como números grandes (25/11): número dourado na letra do título, frase curta branca embaixo */
.cs-numeros{display:flex;flex-wrap:wrap;gap:16px 0;margin:10px 0 6px}
.cs-numeros div{display:flex;flex-direction:column;gap:6px;padding:0 clamp(18px,2.4vw,36px);border-left:1px solid rgba(255,255,255,.28)}
.cs-numeros div:first-child{padding-left:0;border-left:0}
.cs-numeros b{font-family:var(--titulo);color:var(--dourado);font-size:clamp(2rem,1.3rem + 2.4vw,3.3rem);line-height:1;white-space:nowrap}
.cs-numeros span{color:#fff;font-size:clamp(.9rem,.85rem + .2vw,1rem);line-height:1.3;max-width:17ch}
@media (max-width:600px){
  .cs-numeros{flex-direction:column;gap:12px}
  .cs-numeros div{flex-direction:row;align-items:center;gap:14px;padding:0;border-left:0}
  .cs-numeros b{min-width:4.5em;font-size:1.75rem}
  .cs-numeros span{max-width:none}
}
/* carta (25/11, José gostou): foto à direita e texto à esquerda, alinhado com o topo (no celular a foto continua em cima) */
@media (min-width:768px){.cs .cs-carta-foto{order:2}}
#carta .cs-in{max-width:none}
/* foto do topo espelhada (25/11, José): a imagem vai para uma camada própria virada na horizontal, atrás do degradê */
.cs .cs-topo-classico{background-image:none;isolation:isolate}
.cs .cs-topo-classico::after{content:'';position:absolute;inset:0;z-index:-2;background:var(--preto) url(/consorcio/topo.webp) 40% 45%/cover no-repeat;transform:scaleX(-1)}
.cs .cs-topo-classico::before{z-index:-1}
/* contagem no topo (25/11): embaixo dos números, largura contida */
.cs .cs-topo-classico .cs-cont{width:auto;margin-top:12px;gap:10px}
.cs-relogio{display:flex;align-items:flex-start;gap:clamp(8px,1vw,14px)}
.cs-relogio div{display:flex;flex-direction:column;align-items:center;gap:6px}
.cs-relogio b{font-family:var(--titulo);color:#fff;font-size:clamp(1.8rem,1.2rem + 2vw,2.8rem);line-height:1;min-width:1.9em;text-align:center}
.cs-relogio span{font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--claro)}
.cs-relogio i{font-style:normal;font-family:var(--titulo);color:var(--dourado);font-size:clamp(1.5rem,1rem + 1.6vw,2.3rem);line-height:1}
/* "R$" na letra do texto, menor e alinhado pelo alto do número */
.cs-moeda{font-family:var(--fonte);font-weight:800;font-size:.5em;vertical-align:.62em;margin-right:.25em;letter-spacing:0}
.cs-caminho .cs-moeda,.cs-mais-parcela .cs-moeda{font-size:.72em;vertical-align:.2em;margin-right:.2em}
/* WhatsApp flutuante (25/11): círculo verde fixo no canto, com pulso suave; a dica aparece ao passar o mouse */
.cs-flutua{position:fixed;right:max(18px,env(safe-area-inset-right));bottom:max(18px,env(safe-area-inset-bottom));z-index:60;width:62px;height:62px;border-radius:50%;background:#1FA855;color:#fff;display:grid;place-items:center;box-shadow:0 8px 24px rgba(0,0,0,.35);text-decoration:none;transition:transform .15s ease,background .15s ease}
.cs-flutua svg{width:32px;height:32px}
.cs-flutua::after{content:'';position:absolute;inset:0;border-radius:50%;border:2px solid #1FA855;animation:cs-pulso 2.4s ease-out infinite;pointer-events:none}
@keyframes cs-pulso{0%{transform:scale(1);opacity:.7}70%,100%{transform:scale(1.55);opacity:0}}
.cs-flutua:hover{background:#178A45;transform:scale(1.06)}
.cs-flutua-dica{position:absolute;right:calc(100% + 12px);top:50%;transform:translateY(-50%);white-space:nowrap;background:var(--preto);color:#fff;font-weight:700;font-size:.95rem;padding:8px 14px;border-radius:10px;box-shadow:0 6px 18px rgba(0,0,0,.3);opacity:0;pointer-events:none;transition:opacity .15s ease}
.cs-flutua:hover .cs-flutua-dica,.cs-flutua:focus-visible .cs-flutua-dica{opacity:1}
@media (prefers-reduced-motion:reduce){.cs-flutua::after{animation:none;display:none}}
/* versão B (16h23): o Raio Crescente longo, saindo da borda esquerda e subindo 20° pela foto */
/* 25/11 (José, manual): nada pode sobrepor o Raio — ele corre só na faixa livre embaixo do texto
   (sobe no máximo ~15% da altura do topo; a faixa de baixo ganhou espaço para caber) */
/* 25/11 (José): o traço voltou (preso ao "Onde será?"); a contagem foi para a direita, então nada encosta nele */
.cs .cs-topo-classico .cs-topo-in{padding-bottom:clamp(6.5rem,13vh,8rem)}
/* 25/11 (José: "não é para ele aparecer nessa página"): o topo ocupa a tela inteira; a carta só aparece ao rolar.
   svh = altura visível no celular (sem contar a barra do navegador); vh fica de reserva para navegador antigo */
.cs .cs-topo-classico{min-height:100vh;min-height:100svh;display:flex;flex-direction:column}
.cs .cs-topo-classico .cs-topo-in{flex:1 0 auto;justify-content:center}
#carta.cs-secao{padding-top:clamp(3rem,2rem + 3vw,5rem)}
@media (min-width:1360px){
  /* 25/11 (José): "direita, embaixo" — no canto de baixo do topo, no gramado escuro, na altura do fim do traço */
  .cs .cs-topo-classico .cs-topo-in{position:relative}
  .cs .cs-topo-classico .cs-topo-in > .cs-cont{position:absolute;left:50%;transform:translateX(-50%);bottom:clamp(2.5rem,7vh,4.5rem);margin-top:0;align-items:center;text-align:center}
}
/* 25/11 (rascunho do José): o Raio fica preso ao "Onde será?" — começa na borda da tela ~130px abaixo do link,
   sobe 20° e termina à direita do link, abaixo da contagem (nada encosta nele) */
.cs .cs-topo-classico .cs-raio{display:none}
.cs .cs-topo-classico .cs-acoes{position:relative}
.cs-raio-link{position:absolute;left:calc(-1 * var(--margem));top:calc(100% + 95px);width:clamp(260px,34vw,520px);height:6px;background:var(--vermelho);transform-origin:left center;transform:rotate(-20deg);pointer-events:none}
/* ═══ 25/11 (José: "melhora isso"): Só na Supersafra, Outras cartas e Onde será — mesma largura e alinhamento do topo ═══ */
.cs-largo .cs-in{max-width:none}
.cs .cs-rodape p{max-width:none;margin:0 0 8px}
/* só na supersafra: duas caixas da mesma altura; 41 e 3 lado a lado, cada um com o seu rótulo */
.cs .cs-cond-grade{align-items:stretch!important;gap:20px;margin-top:20px}
.cs .cs-super{padding:28px;gap:18px}
.cs .cs-super-vs{align-items:flex-end;gap:28px;margin-top:auto}
.cs .cs-super-vs div{flex-direction:row;align-items:flex-end;gap:12px}
.cs .cs-super-mes b{font-size:clamp(4rem,3rem + 4vw,6.5rem)}
.cs .cs-super-normal{padding-left:28px;border-left:1px solid rgba(255,255,255,.18)}
.cs .cs-super-normal b{color:#fff;font-size:clamp(2.2rem,1.6rem + 2vw,3.2rem)}
.cs .cs-super-vs span{margin:0 0 .4em;font-size:.95rem;line-height:1.3;color:var(--claro)}
.cs .cs-super-nota{margin-top:0}
.cs .cs-paga{padding:28px}
.cs .cs-paga li b{font-size:clamp(1.05rem,.95rem + .4vw,1.3rem)}
.cs .cs-paga .cs-moeda{font-size:.62em;vertical-align:.3em;margin-right:.2em}
/* outras cartas: fotos do mesmo tamanho, preço maior com o /mês na mesma linha */
.cs .cs-mais{gap:20px}
.cs .cs-mais-card{border:1px solid var(--claro);border-radius:16px;transition:box-shadow .15s ease,transform .15s ease}
.cs .cs-mais-card:hover{box-shadow:0 12px 28px rgba(35,31,32,.1);transform:translateY(-2px)}
.cs .cs-mais-foto{aspect-ratio:4/3;padding:14px}
.cs .cs-mais-foto img{width:100%;height:100%;object-fit:contain}
.cs .cs-mais-in{padding:18px 18px 18px;gap:10px}
.cs .cs-mais-in h3 span{min-height:0}
.cs .cs-mais-parcela{display:flex;align-items:baseline;gap:4px;font-size:clamp(1.35rem,1.1rem + .7vw,1.7rem);color:var(--preto);margin-top:2px}
.cs .cs-mais-parcela small{display:inline;font-family:var(--fonte);font-size:.85rem;color:var(--aco)}
.cs .cs-mais-in dl{margin-top:auto}
/* onde será: rótulos Quando / Onde, mapa maior */
.cs .cs-mapa-grade{grid-template-columns:minmax(0,1fr);gap:28px;margin-top:20px}
@media (min-width:900px){.cs .cs-mapa-grade{grid-template-columns:minmax(0,5fr) minmax(0,7fr);align-items:stretch}}
.cs .cs-mapa-texto{gap:22px;justify-content:center}
.cs-info{display:flex;flex-direction:column;gap:6px}
.cs-info-rot{font-weight:700;text-transform:uppercase;letter-spacing:.08em;font-size:.8rem;color:var(--dourado)}
.cs-info b{color:#fff;font-size:1.15rem}
.cs .cs-endereco{margin:0;font-size:1.1rem;line-height:1.5}
.cs .cs-link-mapa{margin:4px 0 0}
.cs .cs-mapa-frase{margin:0}
.cs .cs-mapa{aspect-ratio:auto;min-height:340px;height:100%}
@media (max-width:600px){
  .cs .cs-super-vs{flex-wrap:wrap;gap:16px}
  .cs .cs-super-normal{padding-left:0;border-left:0}
  /* outras cartas no celular: foto em cima, texto embaixo (lado a lado não cabia) */
  .cs .cs-mais-card{flex-direction:column}
  .cs .cs-mais-foto{flex:none;width:100%;aspect-ratio:16/9;border-right:0;border-bottom:1px solid var(--claro);overflow:hidden}
  .cs .cs-mais-foto img{transform:none}
  .cs .cs-mais-in{padding:16px}
}
/* ═══ página do vendedor no visual da página do cliente (25/11) ═══ */
.cs .cs-vend-topo{min-height:0}
.cs .cs-vend-topo .cs-topo-in{flex:none;padding-top:clamp(1rem,4vh,2.5rem);padding-bottom:clamp(2.5rem,7vh,4rem);gap:10px}
.cs .cs-vend-topo .cs-h1{font-size:clamp(2.4rem,1rem + 6vw,4.6rem)!important}
.cs-vend-ficha{padding-top:clamp(1.5rem,3vw,2.5rem)}
.cs .cs-vend-ficha .cs-ficha{box-shadow:0 18px 40px rgba(0,0,0,.35);border-radius:16px}
.cs .cs-vend-ficha .cs-ficha > .cs-h2{color:var(--preto)}
/* dentro do cartão branco os textos voltam ao cinza escuro (a seção é escura) */
.cs .cs-vend-ficha .cs-ficha .cs-lead,.cs .cs-vend-ficha .cs-ficha .cs-obs-claro{color:var(--aco)}
.cs .cs-vend-ficha .cs-ficha{color:var(--aco)}
/* cartas: no máximo 4 por linha, cada uma com largura para o preço */
.cs .cs-vend-cartas .cs-mais{grid-template-columns:repeat(auto-fill,minmax(250px,1fr))!important}
.cs .cs-vend-cartas .cs-mais-parcela{font-size:clamp(1.2rem,1rem + .5vw,1.45rem);flex-wrap:wrap}
.cs-mais-escolhido{outline:3px solid var(--vermelho);outline-offset:-1px}
.cs-usar{appearance:none;width:100%;min-height:46px;border-radius:10px;border:2px solid var(--vermelho);background:#fff;color:var(--vermelho-esc);font-family:var(--fonte);font-weight:800;font-size:.95rem;text-transform:uppercase;letter-spacing:.05em;cursor:pointer}
.cs-usar:hover{background:var(--marcada)}
.cs-mais-escolhido .cs-usar{background:var(--vermelho);color:#fff}
/* ═══ animação de entrada do topo (25/11, José) ═══
   foto com zoom suave → textos sobem em sequência → traço se desenha → contagem por último.
   Usa as propriedades "scale"/"translate" (separadas do transform), para não brigar com o espelho da foto
   nem com a centralização da contagem. */
@keyframes cs-entra{from{opacity:0;translate:0 18px}to{opacity:1;translate:0 0}}
@keyframes cs-zoom{from{scale:1.08}to{scale:1}}
@keyframes cs-desenha{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0 0 0 0)}}
@media (prefers-reduced-motion:no-preference){
  .cs .cs-topo-classico:not(.cs-vend-topo)::after{animation:cs-zoom 1.6s cubic-bezier(.2,.7,.2,1) both}
  .cs .cs-topo-classico:not(.cs-vend-topo) .cs-barra{animation:cs-entra .6s ease-out both}
  .cs .cs-topo-classico:not(.cs-vend-topo) .cs-topo-in > *{animation:cs-entra .7s cubic-bezier(.2,.7,.2,1) both}
  .cs .cs-topo-classico:not(.cs-vend-topo) .cs-kicker{animation-delay:.15s}
  .cs .cs-topo-classico:not(.cs-vend-topo) .cs-h1{animation-delay:.3s}
  .cs .cs-topo-classico:not(.cs-vend-topo) .cs-etiqueta{animation-delay:.45s}
  .cs .cs-topo-classico:not(.cs-vend-topo) .cs-numeros{animation-delay:.6s}
  .cs .cs-topo-classico:not(.cs-vend-topo) .cs-acoes{animation-delay:.75s}
  .cs .cs-topo-classico:not(.cs-vend-topo) .cs-cont{animation-delay:1s}
  .cs .cs-topo-classico:not(.cs-vend-topo) .cs-raio-link{animation:cs-desenha .8s cubic-bezier(.6,0,.2,1) .9s both}
}
/* ═══ topo no celular (25/11, José: "ficou tudo junto, difícil de ler") — só abaixo de 600px ═══ */
@media (max-width:600px){
  /* foto: escurece de leve só no celular, onde o texto ocupa a tela toda e cai em cima do céu claro */
  .cs .cs-topo-classico:not(.cs-vend-topo)::before{background:linear-gradient(180deg,rgba(20,17,18,.55) 0%,rgba(20,17,18,.62) 45%,rgba(20,17,18,.85) 80%,var(--preto) 100%)}
  .cs .cs-topo-classico .cs-topo-in{gap:0;justify-content:center}
  .cs .cs-topo-classico .cs-kicker{font-size:.72rem;letter-spacing:.06em;white-space:nowrap;margin-bottom:10px}
  .cs .cs-topo-classico .cs-h1{font-size:clamp(1.8rem,9.2vw,2.6rem)!important;margin-bottom:10px}
  .cs .cs-topo-classico .cs-etiqueta{margin-bottom:26px}
  /* números: uma linha cada, número e frase centralizados, linha fina entre eles */
  .cs .cs-numeros{gap:0;margin:0 0 26px;width:100%}
  .cs .cs-numeros div{align-items:center;gap:16px;padding:12px 0;border-top:1px solid rgba(255,255,255,.16)}
  .cs .cs-numeros div:first-child{border-top:0;padding-top:0}
  .cs .cs-numeros b{min-width:4.2em;font-size:1.9rem}
  .cs .cs-numeros span{font-size:.95rem;line-height:1.35}
  .cs .cs-topo-classico .cs-cont{margin:0 0 24px}
  .cs .cs-relogio b{font-size:1.75rem}
  .cs .cs-relogio{gap:6px}
}
/* ═══ celular, 2ª rodada (25/11, José: "não tá legal") ═══ */
@media (max-width:600px){
  /* cabeçalho numa linha: só "MAHINDRA" à direita */
  .cs .cs-topo-classico .cs-conc small{display:none}
  .cs .cs-topo-classico .cs-logo{height:28px}
  /* números: 3 colunas, como no computador, só que menores */
  .cs .cs-numeros{flex-direction:row;flex-wrap:nowrap;gap:0;margin:0 0 24px}
  .cs .cs-numeros div{flex:1 1 0;flex-direction:column;align-items:flex-start;gap:4px;padding:0 0 0 10px;border-top:0;border-left:1px solid rgba(255,255,255,.22)}
  .cs .cs-numeros div:first-child{padding-left:0;border-left:0}
  .cs .cs-numeros b{min-width:0;font-size:clamp(1.25rem,6.4vw,1.6rem)}
  .cs .cs-numeros span{font-size:.78rem;line-height:1.3;max-width:none}
  /* traço mais curto, longe do ícone do WhatsApp */
  .cs-raio-link{width:min(62vw,240px)!important}
}
/* ═══ carta no celular (25/11, José: "muita coisa junta") ═══ */
@media (max-width:600px){
  .cs .cs-carta{gap:22px}
  .cs .cs-carta-info{gap:0}
  .cs .cs-carta .cs-carta-parcela{margin-top:14px;font-size:clamp(2rem,10vw,2.6rem)}
  .cs .cs-carta .cs-carta-parcela small{display:inline;margin:0 0 0 4px}
  .cs .cs-carta-dia{margin-top:8px;font-size:.92rem;line-height:1.45}
  .cs .cs-prazo{margin-top:20px;padding:10px 12px}
  .cs .cs-prazo b{font-size:.95rem}
  .cs .cs-prazo span{font-size:.85rem}
  .cs .cs-caminhos{gap:14px;margin:22px 0 24px}
  .cs .cs-caminho{padding:16px;gap:8px}
  .cs .cs-caminho ul{gap:6px;font-size:.88rem}
  .cs .cs-zap{font-size:.88rem;letter-spacing:.03em;padding:0 16px 0 10px;white-space:nowrap}
  .cs .cs-carta .cs-zap{width:100%}
  .cs .cs-carta .cs-obs{margin-top:16px;font-size:.82rem}
}
/* ═══ "Só na Supersafra" no celular (25/11, José) — menos texto, 41 e 3 lado a lado ═══ */
@media (max-width:600px){
  .cs .cs-largo .cs-h2{font-size:clamp(1.5rem,7.5vw,1.9rem)}
  .cs .cs-h2-sub{font-size:1rem}
  .cs .cs-super{padding:20px;gap:16px}
  .cs .cs-super-rot{font-size:.75rem}
  .cs .cs-super-frase{display:none}
  .cs .cs-super-vs{flex-wrap:nowrap;gap:0;align-items:flex-end;margin-top:0}
  .cs .cs-super-vs div{flex-direction:column;align-items:flex-start;gap:6px}
  .cs .cs-super-mes{padding-right:20px}
  .cs .cs-super-mes b{font-size:3.4rem}
  .cs .cs-super-normal{padding-left:20px;border-left:1px solid rgba(255,255,255,.18)}
  .cs .cs-super-normal b{font-size:2.2rem}
  .cs .cs-super-vs span{margin:0;font-size:.82rem}
  .cs .cs-super-nota{font-size:.8rem}
  .cs .cs-paga{padding:20px 16px}
  .cs .cs-paga-rot{font-size:.75rem}
  .cs .cs-paga li{padding:9px 0 9px 22px}
  .cs .cs-paga-como{font-size:.8rem}
}
/* ═══ celular objetivo (25/11, José: "no celular, tenta ser mais objetivo") — esconde o que repete, encurta o resto ═══ */
@media (max-width:600px){
  /* outras cartas: sem a frase de apoio */
  .cs .cs-largo .cs-lead{display:none}
  /* onde será: sem a frase e sem o botão verde (o ícone flutuante já faz isso); mapa mais baixo */
  .cs .cs-mapa-frase,.cs #local .cs-zap{display:none}
  .cs .cs-mapa-texto{gap:16px}
  .cs .cs-info b{font-size:1rem}
  .cs .cs-endereco{font-size:.95rem}
  .cs .cs-mapa{min-height:220px}
  .cs #local .cs-h2{font-size:clamp(1.5rem,7.5vw,1.9rem)}
  /* carta: a 2ª linha de cada caminho some (fica a principal) */
  .cs .cs-caminho li + li{display:none}
  /* rodapé: só a linha da administradora + o aviso, menor */
  .cs .cs-rodape{font-size:.75rem}
}
/* outras cartas no celular, objetivo: foto mais baixa, sem a tabela crédito/por dia (página do cliente) */
@media (max-width:600px){
  .cs .cs-largo:not(.cs-vend-cartas) .cs-mais-foto{aspect-ratio:16/9;padding:10px}
  .cs .cs-largo:not(.cs-vend-cartas) .cs-mais-foto img{object-fit:contain!important;transform:none!important;width:100%;height:100%}
  .cs .cs-largo:not(.cs-vend-cartas) .cs-mais-in dl{display:none}
  .cs .cs-largo:not(.cs-vend-cartas) .cs-mais-in{gap:6px;padding:12px 14px 14px}
  .cs .cs-mais{gap:14px}
}
/* celular (25/11, José): foto de fundo mais para a direita, mostrando mais o trator (a camada é espelhada, por isso o % sobe) */
@media (max-width:600px){.cs .cs-topo-classico::after{background-position:0% 45%}}
/* ═══ celular (25/11, José): contagem no centro de baixo e tamanhos proporcionais ═══
   ordem de tamanho: CONSÓRCIO > números = contagem > MAHINDRA > textos */
@media (max-width:600px){
  .cs .cs-topo-classico .cs-topo-in{position:relative;justify-content:flex-start;padding-top:clamp(2.5rem,9vh,4.5rem);padding-bottom:190px}
  .cs .cs-topo-classico .cs-kicker{font-size:.68rem}
  .cs .cs-topo-classico .cs-h1{font-size:clamp(1.9rem,9.4vw,2.6rem)!important}
  .cs .cs-topo-classico .cs-etiqueta{font-size:1.05rem;margin-bottom:22px}
  .cs .cs-numeros b{font-size:clamp(1.15rem,5.6vw,1.4rem)}
  .cs .cs-numeros span{font-size:.72rem}
  .cs .cs-topo-classico .cs-acoes .cs-link{font-size:.8rem;padding:4px 0}
  /* contagem: centro de baixo, acima do ícone do WhatsApp */
  .cs .cs-topo-classico .cs-topo-in > .cs-cont{position:absolute;left:50%;transform:translateX(-50%);bottom:92px;margin:0;align-items:center;text-align:center;width:max-content}
  .cs .cs-topo-classico .cs-cont-rot{font-size:.68rem}
  .cs .cs-relogio b{font-size:1.4rem;min-width:1.7em}
  .cs .cs-relogio i{font-size:1.1rem}
  .cs .cs-relogio span{font-size:.6rem}
}
/* ═══ números no celular (25/11, José): na vertical, maiores e pulsando ═══ */
@keyframes cs-pulsa{0%,100%{scale:1;text-shadow:0 0 0 rgba(229,185,78,0)}50%{scale:1.07;text-shadow:0 0 18px rgba(229,185,78,.55)}}
@media (max-width:600px){
  .cs .cs-numeros{flex-direction:column;gap:10px;margin:0 0 20px}
  .cs .cs-numeros div{flex-direction:row;align-items:center;gap:14px;padding:0;border-left:0}
  .cs .cs-numeros div:first-child{padding-left:0}
  .cs .cs-numeros b{min-width:3.9em;font-size:clamp(1.9rem,9vw,2.4rem);transform-origin:left center}
  .cs .cs-numeros span{font-size:.9rem;line-height:1.3}
  .cs .cs-topo-classico .cs-topo-in{padding-top:clamp(1.5rem,5vh,3rem)}
}
@media (max-width:600px) and (prefers-reduced-motion:no-preference){
  .cs .cs-numeros b{animation:cs-pulsa 2.4s ease-in-out infinite}
  .cs .cs-numeros div:nth-child(2) b{animation-delay:.8s}
  .cs .cs-numeros div:nth-child(3) b{animation-delay:1.6s}
}
/* celular (25/11, José): sem o traço vermelho */
@media (max-width:600px){.cs-raio-link{display:none!important}}
/* celular (25/11, José: "não pode comer o texto"): coluna fixa para o número, com folga para o pulso */
@media (max-width:600px){
  .cs .cs-numeros div{display:grid;grid-template-columns:8.4rem minmax(0,1fr);gap:12px}
  .cs .cs-numeros b{min-width:0;font-size:clamp(1.6rem,7.6vw,2rem)}
}
/* ═══ ficha do vendedor, fácil de preencher (25/11, José) ═══
   celular primeiro: campos altos (≥52px) com letra 17px (abaixo de 16px o iPhone dá zoom), um toque por escolha,
   blocos numerados 1-2-3, opcionais recolhidos e o botão de salvar sempre à vista no pé da tela */
.cs-vend-barra{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:12px;background:var(--preto);color:#fff;padding:10px 16px;box-shadow:0 2px 10px rgba(0,0,0,.25)}
.cs-vend-barra .cs-logo{height:26px}
.cs-vend-barra div{display:flex;flex-direction:column;line-height:1.15;margin-left:auto;text-align:right}
.cs-vend-barra b{font-family:var(--titulo);text-transform:uppercase;font-size:.8rem;color:var(--dourado);white-space:nowrap}
.cs-vend-barra small{font-size:.72rem;color:var(--claro)}
.cs-vend-fundo2{background:#F2F2F3;min-height:100vh;padding:16px 12px 32px}
.cs .cs-ficha-rapida{max-width:560px;margin:0 auto;background:none;padding:0;box-shadow:none;border-radius:0}
.cs-ficha-rapida .cs-form{display:flex;flex-direction:column;gap:14px}
.cs-f-bloco{background:#fff;border-radius:16px;padding:16px;display:flex;flex-direction:column;gap:10px;box-shadow:0 1px 3px rgba(35,31,32,.08)}
.cs-f-titulo{display:flex;align-items:center;gap:10px;font-weight:800;color:var(--preto);font-size:1rem}
.cs-f-titulo i{font-style:normal;display:grid;place-items:center;width:26px;height:26px;border-radius:50%;background:var(--vermelho);color:#fff;font-size:.85rem}
.cs .cs-ficha-rapida input,.cs .cs-ficha-rapida select,.cs .cs-ficha-rapida textarea{font-size:17px}
.cs .cs-f-grande{width:100%;min-height:54px;border:1.5px solid var(--borda);border-radius:12px;padding:0 14px;font-family:var(--fonte);color:var(--preto);background:#fff}
.cs .cs-f-grande:focus{outline:none;border-color:var(--vermelho);box-shadow:0 0 0 3px rgba(227,24,55,.15)}
/* vendedor */
.cs-f-vendedor{display:flex;flex-direction:column;gap:6px;background:#fff;border-radius:16px;padding:14px 16px;font-weight:700;color:var(--preto)}
.cs .cs-f-vendedor input{min-height:50px;border:1.5px solid var(--borda);border-radius:12px;padding:0 14px}
.cs-f-vend-chip{display:flex;align-items:center;gap:6px;font-size:.92rem;color:var(--aco);padding:0 4px}
.cs-f-vend-chip b{color:var(--preto)}
.cs-f-vend-chip button{margin-left:auto;appearance:none;border:0;background:none;color:var(--vermelho-esc);font-weight:700;font-size:.9rem;text-decoration:underline;cursor:pointer;padding:6px}
/* tratores por foto */
.cs-f-tratores{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px}
.cs-f-trator{appearance:none;display:flex;flex-direction:column;align-items:center;gap:2px;background:#fff;border:2px solid var(--claro);border-radius:12px;padding:8px 6px 10px;cursor:pointer;font-family:var(--fonte);color:var(--preto);min-height:64px;justify-content:center}
.cs-f-trator img,.cs-f-sem{width:100%;height:62px;object-fit:contain}
.cs-f-trator b{font-family:var(--titulo);font-size:1rem}
.cs-f-trator small{font-size:.75rem;color:var(--aco)}
.cs-f-trator[aria-pressed="true"]{border-color:var(--vermelho);background:var(--marcada);box-shadow:0 0 0 2px var(--vermelho) inset}
.cs-f-trator-txt b{font-family:var(--fonte);font-size:.9rem}
.cs-f-info{margin:0;font-size:.85rem;color:var(--aco);background:#F7F7F8;border-radius:10px;padding:8px 10px}
.cs-f-info b{color:var(--preto)}
/* temperatura */
.cs-f-temp{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.cs-f-t{appearance:none;display:flex;flex-direction:column;align-items:center;gap:2px;min-height:78px;justify-content:center;border-radius:12px;border:2px solid var(--claro);background:#fff;cursor:pointer;font-family:var(--fonte);color:var(--preto)}
.cs-f-t span{font-size:1.4rem;line-height:1}
.cs-f-t b{font-size:1rem}
.cs-f-t small{font-size:.72rem;color:var(--aco)}
.cs-f-t-quente[aria-pressed="true"]{border-color:#E31837;background:#FDECEF}
.cs-f-t-morno[aria-pressed="true"]{border-color:#E5A11E;background:#FFF6E3}
.cs-f-t-frio[aria-pressed="true"]{border-color:#2F7FD1;background:#EAF3FC}
/* mais detalhes */
.cs-f-mais{background:#fff;border-radius:16px;padding:4px 16px;box-shadow:0 1px 3px rgba(35,31,32,.08)}
.cs-f-mais summary{cursor:pointer;font-weight:800;color:var(--preto);padding:14px 0;list-style:none}
.cs-f-mais summary::-webkit-details-marker{display:none}
.cs-f-mais summary::before{content:'+ ';color:var(--vermelho)}
.cs-f-mais[open] summary::before{content:'– '}
.cs-f-mais summary span{font-weight:500;color:var(--aco)}
.cs-f-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px 12px}
.cs-f-grid label{min-width:0}
.cs-f-grid input{width:100%}
.cs-f-fila{background:#FFF7E0;border:1.5px solid var(--dourado);border-radius:14px;padding:10px 14px;font-size:14px;line-height:1.4;text-align:left}
.cs-f-fila p{margin:4px 0}
.cs-f-fila button{margin-left:8px;border:0;background:var(--grafite);color:#fff;border-radius:8px;padding:2px 10px;font-weight:700;cursor:pointer}
.cs-f-fila-ok{color:#1d6b35}
.cs-f-fila-erro{color:var(--vermelho-esc)}
.cs-f-leads{display:block;margin:0 0 10px auto;border:1.5px solid var(--borda);background:#fff;color:var(--preto);font-family:var(--fonte);font-weight:700;font-size:.9rem;border-radius:999px;padding:8px 16px;cursor:pointer}
.cs-modal{position:fixed;inset:0;z-index:60;background:rgba(30,27,28,.55);backdrop-filter:blur(3px);display:flex;align-items:flex-end;justify-content:center}
.cs-pl{width:100%;max-width:760px;height:94vh;display:flex;flex-direction:column;background:#F6F5F3;border-radius:24px 24px 0 0;overflow:hidden;font-family:var(--fonte);color:var(--preto);box-shadow:0 -10px 40px rgba(0,0,0,.25)}
@media (min-width:760px){.cs-modal{align-items:center}.cs-pl{height:88vh;border-radius:24px}}
.cs-pl-cab{position:relative;flex:none;background:linear-gradient(135deg,#E31837 0%,#B5122B 100%);color:#fff;padding:20px 18px 16px}
.cs-pl-cab-l small{display:block;font-size:.74rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;opacity:.85}
.cs-pl-cab-l b{display:inline-block;font-family:var(--titulo);font-size:3rem;line-height:1;margin-top:6px}
.cs-pl-cab-l span{margin-left:10px;font-size:.9rem;opacity:.85}
.cs-pl-x{position:absolute;top:16px;right:16px;width:42px;height:42px;border-radius:50%;border:0;background:rgba(255,255,255,.18);color:#fff;display:grid;place-items:center;cursor:pointer}
.cs-pl-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:14px}
.cs-pl-kpis div{background:rgba(255,255,255,.14);border-radius:12px;padding:8px 6px;text-align:center}
.cs-pl-kpis b{display:block;font-family:var(--titulo);font-size:1.4rem;line-height:1.1}
.cs-pl-kpis span{font-size:.72rem;opacity:.9}
.cs-pl-corpo{flex:1;overflow:auto;padding:14px 14px 28px;-webkit-overflow-scrolling:touch}
.cs-pl-aviso{background:#FFF7E0;border:1.5px solid var(--dourado);border-radius:12px;padding:8px 12px;font-size:.86rem;margin:0 0 12px}
.cs-pl-msg{text-align:center;color:var(--aco);padding:28px 8px}
.cs-pl-msg .cs-btn{margin-top:14px}
.cs-pl-busca{display:flex;align-items:center;gap:10px;background:#fff;border-radius:16px;padding:0 14px;box-shadow:0 2px 10px rgba(35,31,32,.07);color:#8a8486}
.cs-pl-busca input{flex:1;min-width:0;border:0;outline:0;min-height:52px;font-family:var(--fonte);font-size:16px;background:none;color:var(--preto)}
.cs-pl-acoes{display:flex;gap:8px;margin:10px 0 4px}
.cs-pl-fbtn,.cs-pl-limpar{display:inline-flex;align-items:center;gap:6px;border:0;border-radius:999px;padding:9px 14px;font-family:var(--fonte);font-weight:700;font-size:.9rem;cursor:pointer}
.cs-pl-fbtn{background:#fff;color:var(--preto);box-shadow:0 1px 4px rgba(35,31,32,.08)}
.cs-pl-fbtn i{font-style:normal;background:var(--vermelho);color:#fff;border-radius:999px;min-width:20px;height:20px;display:grid;place-items:center;font-size:.75rem}
.cs-pl-fbtn[aria-expanded="true"] svg{transform:rotate(180deg)}
.cs-pl-limpar{background:none;color:var(--vermelho)}
.cs-pl-filtros{display:grid;grid-template-columns:1fr 1fr;gap:10px;background:#fff;border-radius:16px;padding:12px;margin:6px 0 4px;box-shadow:0 2px 10px rgba(35,31,32,.07)}
@media (min-width:760px){.cs-pl-filtros{grid-template-columns:repeat(3,1fr)}}
.cs-pl-filtros label{display:flex;flex-direction:column;gap:4px;font-size:.74rem;font-weight:700;color:var(--aco);text-transform:uppercase;letter-spacing:.06em;min-width:0}
.cs-pl-filtros select{min-height:42px;border:1.5px solid var(--claro);border-radius:10px;background:#F6F5F3;font-family:var(--fonte);font-size:15px;padding:0 8px;color:var(--preto);text-transform:none;letter-spacing:0;min-width:0}
.cs-pl-h{margin:18px 2px 8px;font-size:.78rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--aco)}
.cs-pl-vends{display:flex;gap:10px;overflow-x:auto;padding:2px 2px 8px;scroll-snap-type:x proximity}
.cs-pl-vend{flex:none;width:138px;scroll-snap-align:start;display:grid;grid-template-columns:auto 1fr;column-gap:8px;align-items:center;text-align:left;border:2px solid transparent;background:#fff;border-radius:16px;padding:12px;cursor:pointer;font-family:var(--fonte);color:var(--preto);box-shadow:0 2px 10px rgba(35,31,32,.07)}
.cs-pl-vend[aria-pressed="true"]{border-color:var(--vermelho)}
.cs-pl-vend .cs-pl-av{grid-row:1;grid-column:1}
.cs-pl-vend .cs-pl-vn{grid-row:2;grid-column:1/-1;margin-top:8px;font-weight:700;font-size:.84rem;line-height:1.25;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.cs-pl-vend b{grid-row:1;grid-column:2;justify-self:end;font-family:var(--titulo);font-size:1.6rem;line-height:1}
.cs-pl-barra{grid-row:3;grid-column:1/-1;display:flex;height:5px;border-radius:999px;overflow:hidden;background:var(--claro);margin-top:10px}
.cs-pl-av{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;color:#fff;font-weight:800;font-size:.9rem;flex:none}
.cs-pl-lista{display:grid;gap:10px}
.cs-pl-lead{background:#fff;border-radius:18px;box-shadow:0 2px 10px rgba(35,31,32,.07);overflow:hidden;border-left:5px solid #b9b5b6}
.cs-pl-t-quente{border-left-color:var(--vermelho)}.cs-pl-t-morno{border-left-color:var(--dourado)}.cs-pl-t-frio{border-left-color:#5B8DB8}
.cs-pl-t-quente .cs-pl-av{background:var(--vermelho)}.cs-pl-t-morno .cs-pl-av{background:#C9971F}.cs-pl-t-frio .cs-pl-av{background:#5B8DB8}.cs-pl-t-x .cs-pl-av{background:#9a9597}
.cs-pl-lcab{display:flex;align-items:center;gap:12px;width:100%;border:0;background:none;padding:14px;text-align:left;font-family:var(--fonte);cursor:pointer;color:var(--preto)}
.cs-pl-ln{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.cs-pl-ln b{font-size:1.02rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cs-pl-ln small{font-size:.84rem;color:var(--aco);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cs-pl-ln em{font-style:normal;font-size:.76rem;color:#8a8486;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cs-pl-lr{flex:none;display:flex;flex-direction:column;align-items:flex-end;gap:5px}
.cs-pl-tag{font-size:.72rem;font-weight:800;border-radius:999px;padding:4px 9px;background:#F1EFEC;color:var(--preto)}
.cs-pl-t-quente .cs-pl-tag{background:#FDE7EB;color:#B5122B}.cs-pl-t-morno .cs-pl-tag{background:#FBF1D9;color:#8A6410}.cs-pl-t-frio .cs-pl-tag{background:#E5EEF6;color:#3B6A93}
.cs-pl-sit{font-size:.7rem;font-weight:800;border-radius:999px;padding:3px 8px}
.cs-pl-sit.ok{background:#E3F4E8;color:#1d6b35}.cs-pl-sit.atr{background:#FDE7EB;color:#B5122B}
.cs-pl-seta{color:#b9b5b6;transition:transform .2s}
.cs-pl-lcab[aria-expanded="true"] .cs-pl-seta{transform:rotate(180deg)}
.cs-pl-det{padding:0 14px 16px}
.cs-pl-zap{display:flex;align-items:center;justify-content:center;min-height:46px;border-radius:12px;background:#1FA855;color:#fff;font-weight:700;text-decoration:none;margin-bottom:12px}
.cs-pl-det dl{display:grid;grid-template-columns:auto 1fr;gap:8px 14px;margin:0;background:#F6F5F3;border-radius:12px;padding:12px 14px;font-size:.9rem}
.cs-pl-det dt{color:var(--aco)}.cs-pl-det dd{margin:0;font-weight:700;word-break:break-word}
.cs-f-perfil{background:#fff;border-radius:18px;padding:22px 18px;text-align:center;box-shadow:0 2px 10px rgba(35,31,32,.07)}
.cs-f-perfil b{display:block;font-size:1.15rem;margin-bottom:6px}
.cs-f-perfil p{color:var(--aco);margin:0 0 14px}
.cs-f-dica{margin:0 0 10px;font-size:13px;color:var(--aco)}
.cs-f-mais[open]{padding-bottom:16px}
.cs-f-mais > *:not(summary){margin-top:12px}
.cs-f-sub{display:block;font-weight:700;color:var(--preto);font-size:.95rem}
.cs-f-passos{display:flex;flex-wrap:wrap;gap:6px}
.cs-f-passos button{appearance:none;border:1.5px solid var(--borda);background:#fff;border-radius:999px;padding:9px 13px;font-family:var(--fonte);font-size:.88rem;color:var(--preto);cursor:pointer}
.cs-f-passos button[aria-pressed="true"]{border-color:var(--vermelho);background:var(--marcada);color:var(--vermelho-esc);font-weight:700}
.cs .cs-f-mais label{display:flex;flex-direction:column;gap:6px;font-weight:700;color:var(--preto)}
.cs .cs-f-mais input,.cs .cs-f-mais textarea{border:1.5px solid var(--borda);border-radius:12px;padding:12px 14px;font-family:var(--fonte)}
/* aceite + salvar */
.cs .cs-f-aceite{display:flex;align-items:center;gap:12px;background:#fff;border-radius:16px;padding:14px 16px;font-size:.95rem;color:var(--preto)}
.cs .cs-f-aceite input{width:26px;height:26px;flex:0 0 26px;accent-color:var(--vermelho)}
.cs-f-salvar{position:sticky;bottom:0;z-index:10;margin:0 -12px -32px;padding:12px 12px calc(12px + env(safe-area-inset-bottom));background:linear-gradient(to top,#F2F2F3 75%,rgba(242,242,243,0))}
.cs-f-salvar .cs-btn{width:100%;min-height:58px;font-size:1.05rem;border-radius:14px}
/* resultado */
.cs-vend-fundo2 .cs-sorte{max-width:560px;margin:0 auto;background:#fff;border-radius:16px;padding:24px 18px}
.cs-vend-fundo2 .cs-sorte-acoes{display:flex;flex-direction:column;gap:10px}
.cs-vend-fundo2 .cs-sorte-acoes .cs-btn{width:100%;min-height:56px;font-size:1.05rem}
.cs-f-resumo{margin-top:14px}
.cs-f-resumo summary{cursor:pointer;color:var(--aco);font-size:.9rem;font-weight:700}
`;
