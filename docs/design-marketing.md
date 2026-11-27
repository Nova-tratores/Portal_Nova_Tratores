# Regras de design — Portal Nova Tratores (módulo Marketing)

> Recebido do José em 27/11/2026. Vale para qualquer tela nova ou mexida no Marketing.
> **Regra de ouro: nenhuma cor cinza.** Os neutros são tons quentes de creme, areia e café.
> Tokens em código: `src/components/marketing/redes/nt.ts` (classe `.nt` + variáveis `--nt-*`).

## 1. Cores

### 1.1 Tokens (modo claro)

```css
:root {
  --nt-fundo:          #FBF7F2; /* creme — fundo da página */
  --nt-superficie:     #FFFFFF; /* cards, gavetas, modais */
  --nt-superficie-2:   #F5EEE6; /* areia clara — blocos de número, colunas do kanban */
  --nt-superficie-3:   #EDE3D7; /* areia — hover, item selecionado */
  --nt-borda:          #E8DCCD;
  --nt-borda-forte:    #D6C4B0;
  --nt-texto:          #2B1D17; /* café */
  --nt-texto-2:        #6B5547;
  --nt-texto-3:        #8C7464; /* metadados — nunca para info importante */
  --nt-marca:          #D7262C;
  --nt-marca-hover:    #B81E23;
  --nt-marca-suave:    #FDECEC;
  --nt-marca-texto:    #A11A1F;
  --nt-sobre-marca:    #FFFFFF;
  --nt-bom:            #2E7D4F;  --nt-bom-suave:     #E7F4EC;
  --nt-atencao:        #B7791F;  --nt-atencao-suave: #FDF3E1;
  --nt-info:           #1F6FA8;  --nt-info-suave:    #E6F0F8;
}
```

### 1.2 Tokens (modo escuro)

```css
[data-mode="dark"] {
  --nt-fundo: #17110E; --nt-superficie: #211915; --nt-superficie-2: #2A201B; --nt-superficie-3: #352821;
  --nt-borda: #3A2C24; --nt-borda-forte: #4E3B30;
  --nt-texto: #F6EEE6; --nt-texto-2: #C9B6A6; --nt-texto-3: #9C8676;
  --nt-marca: #F0464B; --nt-marca-hover: #F7686C; --nt-marca-suave: #3A1A1A; --nt-marca-texto: #FFB3B5;
  --nt-bom: #5CC48A; --nt-bom-suave: #1C3326;
  --nt-atencao: #E8A94A; --nt-atencao-suave: #3A2A12;
  --nt-info: #6BB0E3; --nt-info-suave: #162B3B;
}
```

### 1.3 Como usar as cores
- **Proibido:** gray, slate, zinc, neutral, #888, #ccc, #f5f5f5 ou qualquer cinza puro.
- **Vermelho da marca é raro:** logo, **1 botão principal por tela**, a linha da Nova nos gráficos, item ativo da navegação.
- **Cor só significa algo:** verde = bom, âmbar = atenção, azul = informação. Nada de cor para enfeitar título de seção.
- **Problema crítico** usa vermelho **sempre com ícone de alerta**.
- **Texto sobre fundo colorido:** par "suave + texto" da mesma cor. Nunca texto café em fundo colorido.
- **Nunca `opacity` em texto** — usar `--nt-texto-2` / `--nt-texto-3`.
- **Sem gradiente** em faixas, abas ou botões.

### 1.4 Gráficos
- A Nova é sempre vermelha (`--nt-marca`). Concorrentes em café/areia, do mais escuro ao mais claro: `#6B5547`, `#8C7464`, `#A8907D`, `#C2AC98`, `#D6C4B0`, `#E8DCCD`.
- Valor escrito junto da barra/ponto. Trilha da barra: `--nt-superficie-2`.

## 2. Tipografia
- Uma fonte (Inter ou Geist), números com `tabular-nums`. Pesos 400 e 600 só.
- Escala fechada: KPI 40/600 · título da tela 24/600 · título de bloco 17/600 · texto 15/400 · legenda 13/400.
- Caixa normal ("Fazer a nossa versão"). Número primeiro, texto depois; parágrafo longo da IA atrás de "Ver análise".

## 3. Espaço, cantos e sombra
- Espaçamento 4, 8, 12, 16, 24, 32, 48. Entre blocos 24–32; dentro do card 16–20.
- Cantos: botões e campos 10 · cards 16 · chips 999.
- Borda 1px `--nt-borda`; hover de card `--nt-borda-forte`.
- Sombra só no que flutua: `0 8px 24px rgba(43, 29, 23, 0.10)`.

## 4. Movimento
| Situação | Animação | Duração |
|---|---|---|
| Hover em card | sobe 3px + borda mais forte | 180ms |
| Ação escondida no card | aparece no hover (fade + sobe 6px) | 180ms |
| Número de KPI ao carregar | conta de 0 até o valor | 800ms |
| Barra de gráfico | cresce da esquerda | 700ms |
| Gaveta lateral | desliza da direita | 250ms |
| Card arrastado no kanban | levanta e os outros abrem espaço | 200ms |
| Publicou / salvou | toast "Publicado ✓" | 3s |
- Curva `cubic-bezier(0.2, 0.8, 0.2, 1)`. Nada acima de 800ms. Respeitar `prefers-reduced-motion`.
- Carregamento: esqueleto em `--nt-superficie-2`. Nunca tela branca nem spinner sozinho.

## 5. Navegação e padrões de tela
- Sem duas linhas de abas. O módulo tem 3 modos num seletor em pílula: **Hoje · Fábrica · Placar** (fundo `--nt-superficie-2`; ativo `--nt-superficie`).
- Celular: os 3 modos viram barra fixa embaixo, com ícone + nome.
- Configurações (contas, acessos) numa engrenagem no canto.
- Detalhe abre em **gaveta lateral**, não em página nova.
- Ação mora no item (cada card tem seu botão).
- Ctrl+K abre busca/comando.
- Tela vazia convida: título + 1 botão. Nunca só "Sem dados".
- Marketing se mostra com imagem.

## 6. Componentes
- Botão principal: `--nt-marca`, texto branco, 1 por tela.
- Botão secundário: transparente, borda `--nt-borda-forte`, texto `--nt-texto`; hover `--nt-superficie-3`.
- Chip de filtro: pílula; desligado = borda forte + texto-2; ligado = fundo marca + branco.
- KPI: fundo `--nt-superficie-2`, sem borda, canto 16, legenda 13 em cima, número 40, 1 linha de contexto.
- Card: superfície, borda 1px, canto 16, padding 16–20.
- Selo de status: pílula com par suave + texto.
- Botão de IA: secundário com ícone de brilho — **não roxo**.

## 7. Bibliotecas
shadcn/ui · motion · @number-flow/react · @dnd-kit/core · vaul · cmdk · sonner · recharts (cores da 1.4).

## 8. Checklist antes de aprovar uma tela
- [ ] Nenhum cinza no código
- [ ] No máximo 1 botão vermelho
- [ ] Toda cor significa algo
- [ ] Números importantes grandes, sem passar o mouse
- [ ] Só tamanhos de fonte da tabela
- [ ] Detalhes abrem em gaveta
- [ ] Carregamento com esqueleto
- [ ] Funciona no celular (toque ≥ 44px)
- [ ] Modo escuro testado
