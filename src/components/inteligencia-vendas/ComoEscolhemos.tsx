'use client';
// =============================================================================
// INTELIGÊNCIA DE VENDAS — "Como escolhemos os clientes" (José, 21/10/2026: "deixar claro
// como cruzamos os dados para fornecer o melhor cliente"). Tela de APRESENTAÇÃO: fontes →
// cruzamentos → nota 0–100 → grupos e máquina sugerida, mais um exemplo com a conta da nota.
// Tocar numa fonte acende os cruzamentos e os grupos que ela alimenta.
// Sem busca de dados: os pesos espelham lib/inteligencia-vendas/regras.ts (mudou lá, muda aqui).
// =============================================================================
import { useState } from 'react';

type Fonte = { id: string; nome: string; icone: string; tipo: 'publica' | 'empresa'; traz: string; quando: string };
type Cruzamento = { id: string; titulo: string; icone: string; fontes: string[]; resultado: string; grupos: string[] };
type Grupo = { id: string; nome: string; icone: string; cor: string; frase: string };

const FONTES: Fonte[] = [
  { id: 'omie', nome: 'Omie (Nova e Castro)', icone: 'fa-file-invoice-dollar', tipo: 'empresa', traz: 'Cadastro dos clientes, máquinas e peças compradas, pedidos e notas. O mesmo cliente nas duas empresas é juntado pelo CPF/CNPJ.', quando: 'todo dia' },
  { id: 'oficina', nome: 'Oficina (OS)', icone: 'fa-screwdriver-wrench', tipo: 'empresa', traz: 'Marcas que entram na oficina e o horímetro dos tratores escrito nas ordens de serviço.', quando: 'a cada OS' },
  { id: 'revisoes', nome: 'Tratores entregues', icone: 'fa-tractor', tipo: 'empresa', traz: 'Controle de revisões: modelo, ano de entrega e revisões feitas de cada trator vendido.', quando: 'a cada entrega' },
  { id: 'propostas', nome: 'Propostas', icone: 'fa-file-signature', tipo: 'empresa', traz: 'Propostas abertas, ganhas e perdidas, há quantos dias estão paradas, motivo da perda e concorrente.', quando: 'na hora' },
  { id: 'crm', nome: 'CRM do app de vendas', icone: 'fa-mobile-screen', tipo: 'empresa', traz: 'Visitas, negócios, área e culturas anotadas pelo vendedor, GPS da visita e retorno combinado.', quando: 'na hora' },
  { id: 'estoque', nome: 'Estoque da loja', icone: 'fa-warehouse', tipo: 'empresa', traz: 'As máquinas e implementos que estão na loja agora, com preço.', quando: 'todo dia' },
  { id: 'ibge', nome: 'IBGE', icone: 'fa-chart-column', tipo: 'publica', traz: 'Área plantada e valor da produção por cultura em cada cidade, rebanho, população, PIB e quantos tratores existem lá (Censo Agro).', quando: 'todo ano' },
  { id: 'car', nome: 'CAR (imóveis rurais)', icone: 'fa-draw-polygon', tipo: 'publica', traz: 'Cada propriedade rural dos 45 municípios da Nova: desenho, área e cidade (cerca de 34 mil imóveis).', quando: 'carga por safra' },
  { id: 'mapbiomas', nome: 'MapBiomas (satélite)', icone: 'fa-satellite', tipo: 'publica', traz: 'O que se planta em cada imóvel: soja, cana, café, pasto…', quando: 'todo ano' },
  { id: 'sicor', nome: 'Banco Central (crédito rural)', icone: 'fa-building-columns', tipo: 'publica', traz: 'Crédito rural que cada propriedade tomou, inclusive para investir em máquinas.', quando: 'todo ano' },
  { id: 'receita', nome: 'Receita Federal (CNPJ)', icone: 'fa-id-card', tipo: 'publica', traz: 'Empresas rurais abertas na região e a atividade de cada CNPJ (quem é prestador de serviço agrícola).', quando: 'todo mês' },
];

const CRUZAMENTOS: Cruzamento[] = [
  { id: 'mesmo', titulo: 'Quem é o cliente', icone: 'fa-people-arrows', fontes: ['omie', 'crm'], resultado: 'Junta o mesmo CPF/CNPJ da Nova, da Castro e do CRM numa ficha só.', grupos: ['carteira', 'recuperar'] },
  { id: 'maquina', titulo: 'A máquina dele', icone: 'fa-tractor', fontes: ['revisoes', 'oficina', 'omie'], resultado: 'Trator com 5 anos ou mais, horímetro alto ou de outra marca na oficina: hora de renovar ou de apresentar a Mahindra.', grupos: ['carteira'] },
  { id: 'compra', titulo: 'Como ele compra', icone: 'fa-cart-shopping', fontes: ['omie', 'crm'], resultado: 'Comprou trator e nenhum implemento; comprava peças e parou; tem máquina nossa e ninguém visitou.', grupos: ['carteira'] },
  { id: 'parado', titulo: 'Negócio parado', icone: 'fa-hourglass-half', fontes: ['propostas', 'crm'], resultado: 'Proposta esperando resposta, negócio sem atualização, retorno combinado vencido ou perda recente que pode voltar.', grupos: ['recuperar'] },
  { id: 'terra', titulo: 'Terra com dinheiro', icone: 'fa-seedling', fontes: ['car', 'mapbiomas', 'sicor', 'receita'], resultado: 'Propriedade grande, sem cliente nosso ligado, com cultura que usa máquina e crédito tomado para investir.', grupos: ['novos'] },
  { id: 'cultura', titulo: 'Cultura × estoque', icone: 'fa-wheat-awn', fontes: ['ibge', 'crm', 'mapbiomas', 'estoque'], resultado: 'O que se planta (do cliente e da cidade) indica a máquina e o implemento certos, e o app mostra o que temos na loja.', grupos: ['carteira', 'recuperar', 'novos'] },
];

const GRUPOS: Grupo[] = [
  { id: 'carteira', nome: 'Carteira', icone: 'fa-handshake', cor: '#dc2626', frase: 'Já compram com a gente' },
  { id: 'recuperar', nome: 'Recuperar', icone: 'fa-rotate-left', cor: '#d97706', frase: 'Negócio parado ou perdido' },
  { id: 'novos', nome: 'Clientes novos', icone: 'fa-seedling', cor: '#16a34a', frase: 'Ainda não compram' },
];

// Pesos de lib/inteligencia-vendas/regras.ts (a nota é a soma, com teto 100)
const PESOS = [
  { motivo: 'Renovar trator', detalhe: 'trator comprado conosco há 5 anos ou mais', peso: '30 a 45', cor: '#dc2626' },
  { motivo: 'Implemento', detalhe: 'comprou trator e nenhum implemento', peso: '25', cor: '#ea580c' },
  { motivo: 'Outra marca', detalhe: 'trator de outra marca na oficina', peso: '25', cor: '#7c3aed' },
  { motivo: 'Renovar (horímetro)', detalhe: 'horímetro alto numa OS', peso: '20', cor: '#dc2626' },
  { motivo: 'Reabordar', detalhe: 'perdeu proposta entre 3 meses e 2 anos atrás', peso: '20', cor: '#0891b2' },
  { motivo: 'Prestador de serviço', detalhe: 'CNPJ de serviço agrícola', peso: '20', cor: '#2563eb' },
  { motivo: 'Proposta parada', detalhe: 'proposta em aberto sem resposta', peso: '15', cor: '#ca8a04' },
  { motivo: 'Sumiu', detalhe: 'comprava peças e parou nos últimos 12 meses', peso: '15', cor: '#be185d' },
  { motivo: 'Perfil', detalhe: 'área ou cultura combina com uma linha de máquinas', peso: '15', cor: '#16a34a' },
  { motivo: 'Sem visita', detalhe: 'tem máquina nossa e ninguém visitou em 6 meses', peso: '10', cor: '#475569' },
];

// Exemplo da conta (o mesmo cliente fictício dos dados de exemplo do app)
const EXEMPLO = {
  nome: 'Fazenda Água Limpa', cidade: 'Timburi', nota: 80,
  linhas: [
    { motivo: 'Outra marca', texto: 'John Deere e New Holland nas OS da oficina', fonte: 'Oficina (OS)', peso: 25, cor: '#7c3aed' },
    { motivo: 'Renovar', texto: 'trator com 13.200 h numa OS', fonte: 'Oficina (OS)', peso: 20, cor: '#dc2626' },
    { motivo: 'Reabordar', texto: 'perdeu proposta de Mahindra 6110 há 8 meses', fonte: 'Propostas', peso: 20, cor: '#0891b2' },
    { motivo: 'Perfil', texto: 'pastagem e gado de corte, 350 ha', fonte: 'CRM + IBGE', peso: 15, cor: '#16a34a' },
  ],
  maquina: 'Trator Mahindra de 75 cv + roçadeira e distribuidor de calcário do estoque',
};

export default function ComoEscolhemos() {
  const [fonte, setFonte] = useState<string | null>(null);
  const [comoLer, setComoLer] = useState(false);
  const f = FONTES.find((x) => x.id === fonte) || null;
  const cruzAcesos = new Set(fonte ? CRUZAMENTOS.filter((c) => c.fontes.includes(fonte)).map((c) => c.id) : []);
  const gruposAcesos = new Set(fonte ? CRUZAMENTOS.filter((c) => cruzAcesos.has(c.id)).flatMap((c) => c.grupos) : []);
  const apaga = (on: boolean) => (fonte && !on ? 'ce-apagado' : '');

  return (
    <div className="ce">
      <style>{ESTILO}</style>

      <header className="ce-topo">
        <span className="ce-topo-ic"><i className="fas fa-diagram-project" /></span>
        <div className="ce-topo-txt">
          <span className="ce-kicker">Inteligência de Vendas</span>
          <h1>Como escolhemos os clientes</h1>
          <p>Cruzamos dados públicos e os dados da empresa para dizer <b>quem visitar</b>, <b>por quê</b> e <b>o que oferecer</b>. Toque numa fonte para ver o caminho dela.</p>
        </div>
        <button type="button" className="ce-btn" onClick={() => setComoLer((v) => !v)}><i className="fas fa-circle-question" /> Como ler</button>
      </header>
      {comoLer && (
        <div className="ce-aviso">
          Leia da esquerda para a direita: <b>1</b> de onde vêm os dados, <b>2</b> o que cruzamos, <b>3</b> como vira a nota de 0 a 100 e <b>4</b> em qual grupo o cliente cai e o que oferecer. Ao tocar numa fonte, só fica aceso o caminho que ela alimenta.
        </div>
      )}

      {/* ── o fluxo: 4 colunas com setas ── */}
      <section className="ce-fluxo" aria-label="Fluxo dos dados">
        <div className="ce-col" style={{ ['--s' as string]: '#dc2626' }}>
          <h2><span>1</span> De onde vêm</h2>
          <p className="ce-sub">Empresa</p>
          {FONTES.filter((x) => x.tipo === 'empresa').map((x) => (
            <button key={x.id} type="button" className={`ce-fonte ${fonte === x.id ? 'on' : ''} ${apaga(fonte === x.id)}`} onClick={() => setFonte(fonte === x.id ? null : x.id)}>
              <i className={`fas ${x.icone}`} /> {x.nome}
            </button>
          ))}
          <p className="ce-sub">Público</p>
          {FONTES.filter((x) => x.tipo === 'publica').map((x) => (
            <button key={x.id} type="button" className={`ce-fonte pub ${fonte === x.id ? 'on' : ''} ${apaga(fonte === x.id)}`} onClick={() => setFonte(fonte === x.id ? null : x.id)}>
              <i className={`fas ${x.icone}`} /> {x.nome}
            </button>
          ))}
        </div>

        <div className="ce-seta" aria-hidden="true"><span><i className="fas fa-chevron-right" /></span></div>

        <div className="ce-col" style={{ ['--s' as string]: '#ea580c' }}>
          <h2><span>2</span> O que cruzamos</h2>
          {CRUZAMENTOS.map((c) => (
            <div key={c.id} className={`ce-cruz ${cruzAcesos.has(c.id) ? 'on' : ''} ${apaga(cruzAcesos.has(c.id))}`}>
              <b><i className={`fas ${c.icone}`} /> {c.titulo}</b>
              <span>{c.resultado}</span>
              <small>{c.fontes.map((id) => FONTES.find((x) => x.id === id)?.nome).join(' + ')}</small>
            </div>
          ))}
        </div>

        <div className="ce-seta" aria-hidden="true"><span><i className="fas fa-chevron-right" /></span></div>

        <div className="ce-col" style={{ ['--s' as string]: '#7c3aed' }}>
          <h2><span>3</span> A nota (0 a 100)</h2>
          <p className="ce-txt">Cada motivo soma pontos. A nota é a soma, com teto 100. Quanto maior, mais para cima na lista do vendedor.</p>
          <ul className="ce-pesos">
            {PESOS.map((p) => (
              <li key={p.motivo}>
                <span className="ce-ponto" style={{ background: p.cor }} />
                <span className="ce-motivo"><b>{p.motivo}</b><small>{p.detalhe}</small></span>
                <span className="ce-peso" style={{ color: p.cor }}>+{p.peso}</span>
              </li>
            ))}
          </ul>
          <p className="ce-txt">Clientes novos e negócios parados entram por tamanho: área e crédito (novos), valor e dias parado (recuperar).</p>
        </div>

        <div className="ce-seta" aria-hidden="true"><span><i className="fas fa-chevron-right" /></span></div>

        <div className="ce-col" style={{ ['--s' as string]: '#16a34a' }}>
          <h2><span>4</span> Onde o cliente cai</h2>
          {GRUPOS.map((g) => (
            <div key={g.id} className={`ce-grupo ${gruposAcesos.has(g.id) ? 'on' : ''} ${apaga(gruposAcesos.has(g.id))}`} style={{ ['--c' as string]: g.cor }}>
              <i className={`fas ${g.icone}`} />
              <span><b>{g.nome}</b><small>{g.frase}</small></span>
            </div>
          ))}
          <div className="ce-final">
            <p><i className="fas fa-route" /> Entra na <b>rota do vendedor</b>, misturado pelo perfil dele (ex.: 60% carteira, 25% recuperar, 15% novos).</p>
            <p><i className="fas fa-warehouse" /> Vem com a <b>máquina do estoque</b> que serve para a cultura dele.</p>
          </div>
        </div>
      </section>

      {f && (
        <div className="ce-detalhe" role="status">
          <i className={`fas ${f.icone}`} />
          <div>
            <b>{f.nome}</b> <small>· atualiza {f.quando}</small>
            <p>{f.traz}</p>
          </div>
        </div>
      )}

      {/* ── exemplo com a conta ── */}
      <section className="ce-exemplo">
        <div className="ce-ex-cab">
          <div className="ce-medidor" style={{ ['--p' as string]: EXEMPLO.nota }}><span><b>{EXEMPLO.nota}</b><small>de 100</small></span></div>
          <div>
            <span className="ce-kicker">Exemplo com a conta</span>
            <h2>Por que a {EXEMPLO.nome} está no topo</h2>
            <p className="ce-sub2">{EXEMPLO.cidade} · cliente de exemplo</p>
          </div>
        </div>
        <ul>
          {EXEMPLO.linhas.map((l) => (
            <li key={l.motivo}>
              <span className="ce-motivo"><b>{l.motivo}:</b> {l.texto}</span>
              <span className="ce-fonte-chip"><i className="fas fa-database" /> {l.fonte}</span>
              <span className="ce-barra"><span style={{ width: `${(l.peso / 25) * 100}%`, background: l.cor }} /></span>
              <b className="ce-peso" style={{ color: l.cor }}>+{l.peso}</b>
            </li>
          ))}
        </ul>
        <p className="ce-total">Total: <b>{EXEMPLO.linhas.reduce((s, l) => s + l.peso, 0)}</b> → grupo <b style={{ color: '#dc2626' }}>Carteira</b>. Oferecer: {EXEMPLO.maquina}.</p>
      </section>

      {/* ── tabela das fontes ── */}
      <section className="ce-tabela">
        <h2>O que cada fonte traz</h2>
        <div className="ce-tab-rolagem">
          <table>
            <thead><tr><th>Fonte</th><th>O que traz</th><th>Atualiza</th></tr></thead>
            <tbody>
              {FONTES.map((x) => (
                <tr key={x.id}>
                  <td><i className={`fas ${x.icone}`} /> {x.nome}</td>
                  <td>{x.traz}</td>
                  <td className="ce-quando">{x.quando}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

const ESTILO = `
  .ce { padding: 22px clamp(12px, 2.4vw, 32px) 48px; color: var(--portal-text, #0f172a); font-size: 16px }
  .ce h1 { font-size: clamp(26px, 2.6vw, 34px); font-weight: 900; margin: 2px 0 0; letter-spacing: -.5px; line-height: 1.15 }
  .ce h2 { font-size: 15px; font-weight: 900; text-transform: uppercase; letter-spacing: .6px; margin: 0 0 12px; display: flex; align-items: center; gap: 10px }
  .ce-kicker { font-size: 12.5px; font-weight: 900; text-transform: uppercase; letter-spacing: 1.2px; color: #dc2626 }

  .ce-topo { position: relative; overflow: hidden; display: flex; gap: 18px; align-items: center; margin-bottom: 18px; padding: 22px 24px; border-radius: 22px; color: #fefefe; background: radial-gradient(120% 140% at 0% 0%, #ef4444 0%, #b91c1c 45%, #450a0a 100%); box-shadow: 0 18px 40px rgba(127, 29, 29, .25) }
  .ce-topo::after { content: ''; position: absolute; right: -60px; top: -60px; width: 260px; height: 260px; border-radius: 50%; background: rgba(255,255,255,.08) }
  .ce-topo .ce-kicker { color: #fecaca }
  .ce-topo-ic { flex-shrink: 0; width: 64px; height: 64px; border-radius: 18px; display: grid; place-items: center; font-size: 28px; background: rgba(255,255,255,.16); animation: ceFlutua 4s ease-in-out infinite }
  .ce-topo-txt { flex: 1; min-width: 0; position: relative; z-index: 1 }
  .ce-topo p { margin: 8px 0 0; color: #fee2e2; font-size: 17px; line-height: 1.5; max-width: 820px }
  .ce-topo p b { color: #fefefe }
  .ce-btn { position: relative; z-index: 1; flex-shrink: 0; display: inline-flex; align-items: center; gap: 8px; border: 0; background: #fefefe; color: #991b1b; border-radius: 12px; padding: 11px 16px; font: inherit; font-size: 15px; font-weight: 800; cursor: pointer; box-shadow: 0 6px 16px rgba(0,0,0,.15); transition: transform .2s }
  .ce-btn:hover { transform: translateY(-2px) }
  .ce-aviso { background: #fff7ed; color: #7c2d12; border: 1px solid #fed7aa; border-radius: 14px; padding: 14px 18px; font-size: 16px; line-height: 1.5; margin-bottom: 18px; animation: ceEntra .3s ease }

  .ce-fluxo { display: grid; grid-template-columns: minmax(0,1fr) 40px minmax(0,1.25fr) 40px minmax(0,1.1fr) 40px minmax(0,1fr); gap: 4px; align-items: start }
  .ce-col { background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e2e8f0); border-radius: 20px; padding: 16px; display: flex; flex-direction: column; gap: 8px; min-width: 0; box-shadow: 0 6px 20px rgba(15, 23, 42, .05); animation: ceEntra .45s ease both }
  .ce-col h2 { color: var(--s); background: color-mix(in srgb, var(--s) 9%, transparent); margin: -4px -4px 6px; padding: 10px 12px; border-radius: 14px }
  .ce-col h2 span { width: 30px; height: 30px; border-radius: 99px; background: var(--s); color: #fefefe; display: grid; place-items: center; font-size: 15px; flex-shrink: 0; box-shadow: 0 4px 10px color-mix(in srgb, var(--s) 40%, transparent) }
  .ce-sub { font-size: 12.5px; font-weight: 900; text-transform: uppercase; letter-spacing: .8px; color: var(--portal-text-muted, #94a3b8); margin: 8px 0 0 }
  .ce-seta { display: grid; place-items: center; align-self: center }
  .ce-seta span { width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; background: #fef2f2; color: #dc2626; font-size: 15px; animation: ceSeta 1.6s ease-in-out infinite }

  .ce-fonte { display: flex; align-items: center; gap: 10px; text-align: left; border: 1px solid var(--portal-border, #e2e8f0); background: transparent; color: inherit; border-radius: 12px; padding: 10px 12px; font: inherit; font-size: 15.5px; font-weight: 700; cursor: pointer; transition: all .2s }
  .ce-fonte i { width: 30px; height: 30px; border-radius: 9px; display: grid; place-items: center; flex-shrink: 0; color: #dc2626; background: #fef2f2; font-size: 14px }
  .ce-fonte.pub i { color: #2563eb; background: #eff6ff }
  .ce-fonte:hover { transform: translateX(3px) }
  .ce-fonte:hover, .ce-fonte.on { border-color: #dc2626; background: #fef2f2 }
  .ce-fonte.pub:hover, .ce-fonte.pub.on { border-color: #2563eb; background: #eff6ff }
  .ce-fonte.on { box-shadow: 0 0 0 3px #fecaca } .ce-fonte.pub.on { box-shadow: 0 0 0 3px #bfdbfe }

  .ce-cruz { border: 1px solid var(--portal-border, #e2e8f0); border-radius: 14px; padding: 12px 14px; display: flex; flex-direction: column; gap: 5px; transition: all .25s }
  .ce-cruz b { font-size: 16.5px; display: flex; align-items: center; gap: 8px }
  .ce-cruz b i { width: 30px; height: 30px; border-radius: 9px; display: grid; place-items: center; color: #ea580c; background: #fff7ed; font-size: 14px; flex-shrink: 0 }
  .ce-cruz span { font-size: 15px; color: var(--portal-text-muted, #475569); line-height: 1.45 }
  .ce-cruz small { font-size: 13px; font-weight: 700; color: var(--portal-text-muted, #94a3b8) }
  .ce-cruz.on { border-color: #ea580c; box-shadow: 0 0 0 3px #fed7aa; transform: scale(1.02) }

  .ce-txt { font-size: 15px; color: var(--portal-text-muted, #475569); margin: 0; line-height: 1.5 }
  .ce-pesos { list-style: none; margin: 4px 0; padding: 0; display: flex; flex-direction: column; gap: 4px }
  .ce-pesos li { display: flex; align-items: center; gap: 10px; padding: 7px 8px; border-radius: 10px; transition: background .2s }
  .ce-pesos li:hover { background: color-mix(in srgb, var(--s, #7c3aed) 7%, transparent) }
  .ce-ponto { width: 12px; height: 12px; border-radius: 99px; flex-shrink: 0 }
  .ce-motivo { flex: 1; min-width: 0; font-size: 15.5px; line-height: 1.35 }
  .ce-motivo small { display: block; font-size: 13.5px; color: var(--portal-text-muted, #94a3b8) }
  .ce-peso { font-weight: 900; font-size: 17px; white-space: nowrap }

  .ce-grupo { display: flex; align-items: center; gap: 12px; border: 1px solid var(--portal-border, #e2e8f0); border-radius: 16px; padding: 14px; transition: all .25s }
  .ce-grupo i { width: 44px; height: 44px; border-radius: 13px; display: grid; place-items: center; font-size: 19px; background: color-mix(in srgb, var(--c) 13%, transparent); color: var(--c); flex-shrink: 0 }
  .ce-grupo span { display: flex; flex-direction: column; font-size: 17px } .ce-grupo small { font-size: 14px; color: var(--portal-text-muted, #64748b) }
  .ce-grupo.on { border-color: var(--c); box-shadow: 0 0 0 3px color-mix(in srgb, var(--c) 25%, transparent); transform: scale(1.02) }
  .ce-final { margin-top: 6px; display: flex; flex-direction: column; gap: 8px }
  .ce-final p { margin: 0; font-size: 15px; line-height: 1.5; color: var(--portal-text-muted, #475569); background: #f0fdf4; border-radius: 12px; padding: 10px 12px }
  .ce-final i { color: #16a34a; margin-right: 6px }
  .ce-apagado { opacity: .25; filter: grayscale(.6) }

  .ce-detalhe { margin-top: 16px; display: flex; gap: 14px; align-items: flex-start; background: var(--portal-bg-card, #fefefe); border: 2px solid #dc2626; border-radius: 18px; padding: 16px 18px; animation: ceEntra .3s ease }
  .ce-detalhe > i { font-size: 26px; color: #dc2626; margin-top: 2px } .ce-detalhe b { font-size: 18px } .ce-detalhe p { margin: 6px 0 0; font-size: 16px; line-height: 1.5 }
  .ce-detalhe small { font-size: 14px; color: var(--portal-text-muted, #64748b) }

  .ce-exemplo, .ce-tabela { margin-top: 22px; background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e2e8f0); border-radius: 20px; padding: 20px; box-shadow: 0 6px 20px rgba(15, 23, 42, .05) }
  .ce-exemplo h2, .ce-tabela h2 { text-transform: none; letter-spacing: -.2px; font-size: 21px; color: inherit; margin-bottom: 4px }
  .ce-ex-cab { display: flex; align-items: center; gap: 18px; margin-bottom: 16px }
  .ce-medidor { flex-shrink: 0; width: 104px; height: 104px; border-radius: 50%; display: grid; place-items: center; background: conic-gradient(#dc2626 calc(var(--p) * 1%), var(--portal-border, #e2e8f0) 0); animation: ceGira 1s ease-out }
  .ce-medidor span { width: 80px; height: 80px; border-radius: 50%; background: var(--portal-bg-card, #fefefe); display: flex; flex-direction: column; align-items: center; justify-content: center }
  .ce-medidor b { font-size: 32px; font-weight: 900; color: #dc2626; line-height: 1 } .ce-medidor small { font-size: 12.5px; color: var(--portal-text-muted, #64748b) }
  .ce-sub2 { margin: 2px 0 0; font-size: 15px; color: var(--portal-text-muted, #64748b) }
  .ce-exemplo ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px }
  .ce-exemplo li { display: grid; grid-template-columns: minmax(0, 2.4fr) auto minmax(90px, 1fr) 52px; gap: 12px; align-items: center; padding: 10px 12px; border-radius: 12px; background: color-mix(in srgb, var(--portal-border, #e2e8f0) 30%, transparent) }
  .ce-exemplo .ce-motivo { font-size: 16px }
  .ce-fonte-chip { font-size: 13px; font-weight: 700; background: #eff6ff; color: #1d4ed8; border-radius: 99px; padding: 4px 10px; white-space: nowrap }
  .ce-barra { height: 10px; border-radius: 99px; background: var(--portal-border, #e2e8f0); overflow: hidden } .ce-barra span { display: block; height: 100%; border-radius: 99px; animation: ceBarra .9s ease-out both }
  .ce-total { margin: 16px 0 0; font-size: 17px; line-height: 1.5; padding: 14px 16px; border-radius: 14px; background: #fef2f2 }

  .ce-tab-rolagem { overflow-x: auto }
  .ce-tabela table { width: 100%; border-collapse: collapse; font-size: 15.5px; min-width: 560px }
  .ce-tabela th { text-align: left; font-size: 12.5px; text-transform: uppercase; letter-spacing: .6px; color: var(--portal-text-muted, #64748b); padding: 8px 10px; border-bottom: 2px solid var(--portal-border, #e2e8f0) }
  .ce-tabela td { padding: 12px 10px; border-bottom: 1px solid var(--portal-border, #f1f5f9); vertical-align: top; line-height: 1.45 }
  .ce-tabela td:first-child { font-weight: 800; white-space: nowrap } .ce-tabela td i { color: #dc2626; width: 20px }
  .ce-tabela tbody tr:hover { background: color-mix(in srgb, var(--portal-border, #e2e8f0) 30%, transparent) }
  .ce-quando { white-space: nowrap; color: var(--portal-text-muted, #64748b) }

  @keyframes ceEntra { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: none } }
  @keyframes ceSeta { 0%, 100% { transform: translateX(0) } 50% { transform: translateX(5px) } }
  @keyframes ceFlutua { 0%, 100% { transform: translateY(0) } 50% { transform: translateY(-5px) } }
  @keyframes ceGira { from { transform: rotate(-90deg) scale(.8); opacity: 0 } to { transform: none; opacity: 1 } }
  @keyframes ceBarra { from { width: 0 } }

  @media (max-width: 1100px) {
    .ce-fluxo { grid-template-columns: minmax(0,1fr) }
    .ce-seta { transform: rotate(90deg); padding: 4px 0 }
  }
  @media (max-width: 600px) {
    .ce { padding: 12px 10px 30px; font-size: 15px }
    .ce-topo { flex-direction: column; align-items: flex-start; padding: 18px }
    .ce-topo p { font-size: 15.5px }
    .ce-ex-cab { flex-direction: column; align-items: flex-start }
    .ce-exemplo li { grid-template-columns: minmax(0,1fr) 52px }
    .ce-exemplo li .ce-fonte-chip, .ce-exemplo li .ce-barra { grid-column: 1 / -1 }
    .ce-tabela td:first-child { white-space: normal }
  }
  @media (prefers-reduced-motion: reduce) { .ce * { transition: none !important; animation: none !important } }
`;
