# Padrão de telas do portal

Regras definidas pelo José (19/10/2026). Valem para **toda tela nova** e para as telas que forem refeitas.

## 1. Tela cheia
- A tela ocupa a **largura inteira** da área do portal. Nada de `maxWidth` centralizado (ex.: `maxWidth: 1600, margin: '0 auto'`).
- O conteúdo preenche a tela: grades com `minmax(min(Npx, 100%), 1fr)`, cartões que crescem, gráficos com `width: 100%`.
- Margem lateral pequena e proporcional: `padding: 'clamp(12px, 2vw, 28px)'`.
- Celular: sem rolagem lateral da página; tabelas largas rolam dentro do próprio cartão.

## 2. Abas no estilo Chrome
- Navegação do módulo = **guias estilo Chrome** numa faixa colorida com degradê de 135° na cor do módulo.
  - Guia ativa: fundo `#fefefe`, cantos de cima arredondados (`11px 11px 0 0`), sombra `0 -2px 6px rgba(0,0,0,0.15)`, fonte 700.
  - Guia inativa: `rgba(255,255,255,0.30)`, fonte 500.
  - Fonte sempre `#111111` (o modo escuro remapeia `#111827` e `#fff`; `#fefefe` e `#111111` escapam).
- Modelos prontos no código: `components/marketing/MarketingNav.tsx`, `components/inteligencia-vendas/IVNav.tsx` e `GuiaChrome` em `components/opa/pecas/comum.tsx`.
- No celular, as guias rolam por dentro da faixa (`overflowX: 'auto'`).

## 3. Sem título ao lado das abas
- A faixa das abas **não tem título do módulo** ao lado (nada de "Inteligência de Vendas" antes das guias). O nome já está no menu e na guia ativa.

## 4. Visual (gosto do José)
- Painel moderno e neutro, **animado e interativo**, com muita informação, fácil de ler.
- Sem tema de roça ou oficina nas telas (nada de tratores, silo, plantação de enfeite).
- Números que sobem contando, cartões que entram suaves, gráficos que crescem; respeitar `prefers-reduced-motion`.
- Toda tela tem um **"Como ler esta tela"** em linguagem simples.
- Clicar num elemento (gráfico, bolha, cartão) filtra ou abre o detalhe; nada de número solto sem clique.
- **Proibido: card com faixa colorida grossa na lateral** (`border-left: 4px+ solid <cor>` ou `::before` vertical colorido) — José, 19/10/2026: "tira esse tipo de card… para não criar mais card assim". Para destacar, use um ícone ou um selo colorido, ou a cor no próprio número; separe blocos com espaço ou uma linha fina.
- **Fonte do mesmo tamanho das vizinhas.** Nada de número gigante isolado num bloco (ex.: 30px quando o resto da tela usa 16–20px). Valor principal: 18–22px; texto: 13–14px; rótulo: 11–12px em maiúsculas.

## 5. Antes de trocar uma tela
- Montar as opções numa **página de teste** (`/<modulo>/teste`, "Opção 1, 2, 3…", a atual como nº 1), com os dados reais, e só trocar depois que o José escolher.
