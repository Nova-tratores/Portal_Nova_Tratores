'use client';
// CRM de Desova — página "A Ideia": explica o conceito do módulo inteiro.
import Link from 'next/link';
import { META_VALOR, META_DIAS, brl } from '@/lib/crm/demo';

const CARDS = [
  {
    href: '/crm/roteiro',
    titulo: '1 · Roteiro do Dia',
    quem: 'Vendedor (celular, na estrada)',
    texto:
      'A home do vendedor NÃO é o Kanban — é a lista do que visitar hoje, na ordem certa. O score prioriza negócio grande + chassi velho no pátio + contato esfriando. Cada card mostra a comissão se fechar hoje: é o número que move o vendedor. Registro de visita em 3 cliques, sem teclado.',
  },
  {
    href: '/crm/funil',
    titulo: '2 · Funil (Kanban)',
    quem: 'Gestor',
    texto:
      'Seis estágios com SLA próprio (proposta e negociação apertados; crédito folgado porque banco demora). Desconto abaixo do piso trava o fechamento até o gestor aprovar — a alçada é automática, calculada pelo custo real do chassi.',
  },
  {
    href: '/crm/estoque',
    titulo: '3 · Estoque de Desova',
    quem: 'Todos',
    texto:
      'Cada chassi parado custa 1,5% ao mês sobre o custo congelado — a "sangria por dia". Quanto mais velho, menor a margem exigida e MAIOR o multiplicador de comissão (até 2×). É como a desova acontece sem discurso: o incentivo aponta pro chassi velho.',
  },
  {
    href: '/crm/atendimento',
    titulo: '4 · Cockpit de Atendimento',
    quem: 'Atendente (mesa, WhatsApp)',
    texto:
      'Triagem guiada do WhatsApp: fila por SLA (1ª resposta em 1 hora), conversa no meio e a JORNADA na direita — script pronto pra enviar, respostas viram botões, e cada toque preenche o cadastro e recalcula o score. A qualificação é subproduto da conversa, não formulário depois dela.',
  },
  {
    href: '/crm/painel',
    titulo: '5 · Painel do Gestor',
    quem: 'Gestor / Diretoria',
    texto:
      'Mede RITMO, não volume: quanto precisa faturar POR DIA pra bater a meta, projeção no ritmo atual, cobertura do gap pelo funil, valor travado no banco e aguardando alçada, sangria diária do pátio e perdas por motivo.',
  },
];

export default function CrmIdeiaPage() {
  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 16px 60px', color: 'var(--portal-text)' }}>
      <h1 style={{ fontSize: 26, fontWeight: 800, marginBottom: 4 }}>CRM de Desova — a ideia</h1>
      <p style={{ color: 'var(--portal-text-secondary)', marginBottom: 20, fontSize: 14.5 }}>
        Objetivo: liquidar <strong style={{ color: '#1B7A5F' }}>{brl(META_VALOR)}</strong> em estoque de
        máquinas em <strong style={{ color: '#1B7A5F' }}>{META_DIAS} dias</strong>, com 1 vendedor em campo
        e 1 atendente triando o WhatsApp. Tudo nesta demonstração usa dados de exemplo — nada foi gravado no banco.
      </p>

      <div
        style={{
          background: 'var(--portal-bg-card)',
          border: '1px solid var(--portal-border)',
          borderRadius: 10,
          padding: '16px 20px',
          marginBottom: 22,
          fontSize: 14,
          lineHeight: 1.65,
        }}
      >
        <strong style={{ fontSize: 15 }}>As 3 regras que sustentam tudo:</strong>
        <ol style={{ margin: '8px 0 0 20px', display: 'grid', gap: 8 }}>
          <li>
            <strong>O preço não tem piso fixo — o piso SOBE sozinho.</strong> Chassi parado custa 1,5% a.m.
            sobre o custo congelado na entrada do pátio. O piso de negociação = custo real de hoje + margem
            mínima da faixa de idade. Esperar pra vender fica caro, e o sistema mostra isso em R$/dia.
          </li>
          <li>
            <strong>Desconto tem alçada automática.</strong> Acima do piso o vendedor decide sozinho; entre o
            piso e o custo real, só o gestor; abaixo do break-even, só a diretoria. E o negócio NÃO fecha
            &quot;ganho&quot; com aprovação pendente — é trava no banco de dados, não combinado.
          </li>
          <li>
            <strong>A comissão empurra pro chassi velho.</strong> 10% da margem real (mín. R$ 300) × fator da
            idade: chassi novo paga 1×, chassi com 300 dias paga 1,8×. O vendedor ganha MAIS vendendo o que a
            empresa mais precisa tirar do pátio.
          </li>
        </ol>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 14 }}>
        {CARDS.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            style={{
              display: 'block',
              background: 'var(--portal-bg-card)',
              border: '1px solid var(--portal-border)',
              borderTop: '4px solid #1B7A5F',
              borderRadius: 10,
              padding: '14px 16px',
              textDecoration: 'none',
              color: 'var(--portal-text)',
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 15.5, marginBottom: 2 }}>{c.titulo}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#1B7A5F', marginBottom: 8 }}>{c.quem}</div>
            <div style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--portal-text-secondary)' }}>{c.texto}</div>
            <div style={{ marginTop: 10, fontSize: 13, fontWeight: 700, color: '#1B7A5F' }}>Abrir a tela →</div>
          </Link>
        ))}
      </div>

      <div
        style={{
          marginTop: 22,
          background: 'var(--portal-bg-card)',
          border: '1px solid var(--portal-border)',
          borderRadius: 10,
          padding: '14px 18px',
          fontSize: 13.5,
          lineHeight: 1.6,
          color: 'var(--portal-text-secondary)',
        }}
      >
        <strong style={{ color: 'var(--portal-text)' }}>A jornada completa do lead:</strong>
        <div
          style={{
            marginTop: 8,
            fontFamily: 'monospace',
            fontSize: 12.5,
            overflowX: 'auto',
            whiteSpace: 'nowrap',
            padding: '8px 0',
          }}
        >
          WhatsApp → <b>novo contato</b> (SLA 1h) → <b>triagem guiada</b> (SLA 4h) → <b>qualificado</b> (score ≥ 70)
          → passa pro vendedor → <b>visita</b> → <b>proposta</b> → <b>negociação/alçada</b> → <b>crédito</b> → <b>faturar</b> → ganho
        </div>
        Na triagem existem 3 desfechos válidos — qualificado, nutrição (volta em 30 dias) e descarte com motivo
        (quem queria peça/assistência vai pro pós-venda, não pro lixo). Quando o lead passa pro campo, o vendedor
        recebe o resumo do que já foi conversado e um texto de apresentação pronto: o produtor nunca repete a história.
        <div style={{ marginTop: 10 }}>
          <strong style={{ color: 'var(--portal-text)' }}>Por que ~60 dias e não 90:</strong> financiamento agro
          leva 15–30 dias pra liberar. O que entrar no funil depois do dia 60 dificilmente fatura dentro da janela —
          por isso a priorização de quem tem caixa mensal (leite, suínos, aves) e de quem está no mês de pico da atividade.
        </div>
      </div>
    </div>
  );
}
