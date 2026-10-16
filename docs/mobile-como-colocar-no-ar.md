# Portal no celular — o que mudou e o que fazer para colocar no ar

> Branch: **`mobile/responsivo-entrega`** (criada a partir da `main` de 16/10/2026, já com a Agenda coletiva).
> Nada aqui muda o computador: toda mudança visual vale só em tela de até 768px (celular / tablet em pé).
> Não precisa de migration, variável de ambiente nem configuração nova.

---

## 1. Passo a passo para funcionar

### Passo 1 — Conferir no seu computador (opcional, recomendado)

```bash
cd C:\Users\joseo\Projetos\Portal_Nova_Tratores
git fetch origin
git switch mobile/responsivo-entrega
npm install
npm run dev
```

Abra `http://localhost:3000` no Chrome, aperte **F12 → ícone de celular (Ctrl+Shift+M)** e escolha um iPhone ou Android. Navegue pelos módulos.

**Para abrir no seu celular de verdade** (mesmo Wi-Fi do computador):
1. No lugar de `npm run dev`, rode `npx next dev -H 0.0.0.0 -p 3000`.
2. No computador, rode `ipconfig` e pegue o "Endereço IPv4" (ex.: `192.168.0.15`).
3. No celular, abra `http://192.168.0.15:3000`.

> ⚠️ O ambiente local usa o **banco de produção**: o que você salvar no teste é real.
> ⚠️ Se outra sessão do Claude estiver trabalhando na pasta do portal, combine antes de trocar de branch: o `git switch` muda os arquivos da pasta para todo mundo.

### Passo 2 — Colocar no ar (main → Railway)

O Railway publica sozinho tudo o que entra na `main`. Escolha **um** dos jeitos:

**A) Pelo GitHub (mais fácil):**
1. Abra https://github.com/Nova-tratores/Portal_Nova_Tratores/compare/main...mobile/responsivo-entrega
2. Clique em **Create pull request** e depois em **Merge pull request**.

**B) Pelo terminal:**
```bash
git switch main
git pull
git merge mobile/responsivo-entrega
npm run build        # regra do projeto: build tem que passar antes de subir
git push
```

### Passo 3 — Depois do deploy (~5 min no Railway)

- Peça para a equipe **fechar e abrir de novo** o portal no celular. Quem instalou o app na tela inicial também precisa fechar e reabrir. O portal já recarrega sozinho depois de um deploy quando a aba está parada (`AutoAtualiza`).
- Confira a lista do item 4 no seu celular.

### Passo 4 — Se algo der errado

No GitHub, abra o pull request já mesclado e clique em **Revert**; o Railway volta para a versão anterior.
Pelo terminal: `git revert -m 1 <hash do merge> && git push`.

---

## 2. O que mudou

### Base (vale para todas as telas)
- **Barra do topo mais baixa no celular** (84px → 60px). As telas que dependiam da altura fixa agora usam a variável `--portal-header-h`.
- **Kit mobile** `src/app/mobile.css`:
  - **Redes de segurança globais:**
    - a página nunca rola de lado;
    - campos com 16px, o que acaba com o "pulo" de zoom do iPhone;
    - imagens nunca passam da largura da tela;
    - toque sem atraso.
  - **Classes `m-*`** para as telas: tabela que rola com 1ª coluna fixa, janela que vira folha de baixo ou tela cheia, faixa de abas que rola, rodapé fixo de ações etc.
- **Configurações** abre em tela cheia no celular.
- Tela do iPhone com "ilha/notch" aproveitada (`viewport-fit=cover`).

### Dashboard (celular)
- **Ícones:** grade compacta estilo tela inicial (4 por linha), com as categorias recolhíveis. A página caiu de ~3.600px para ~2.300px de altura.
- **Topo:** saudação com o primeiro nome e a data.
- **Pastas e favoritos:** faixa **Todos · Favoritos · suas pastas**, e o botão **Editar** para favoritar, reordenar favoritos (setas) e montar pastas. São as **mesmas pastas e favoritos do computador**.
- **Mais usados por você:** atalhos automáticos.
- **Sincronizar com Omie:** o botão também aparece no celular.
- **Visual:** respeita o modo escuro.

### Por módulo

| Grupo | Situação | Principais mudanças |
|---|---|---|
| **Financeiro** (19 telas) | ✅ Completo — 4 rodadas de teste (claro, escuro, 360px, 768px, desktop conferido) | Janela do card em tela cheia; pílulas para pular entre colunas dos kanbans; tabelas do dashboard/relatório/histórico viraram cartões com "Filtros"; aviso de fornecedores recolhido. **Bug corrigido** (vale também no PC): data quebrada no histórico de RH. |
| **Frota** (18 telas) | ✅ Completo — 3 rodadas | Aba Hoje (era ~12 mil px) em blocos recolhíveis; Manutenções, Checklists, Paradas, Multas e Avarias em cartões; mapa ilustrado do veículo com painel de peças em folha; `/pendencias` com botões grandes e formulário em tela cheia; Abastecimento com exportação recolhida. **Bug corrigido:** `/pendencias` quebrava com "Unexpected token '<'". |
| **Peças** — PPV, Orçamentos, Requisições, Opa (20 telas) | ✅ Completo — 4 rodadas | Janela do pedido (PPV) refeita: rola como página, itens em cartões, Salvar fixo; menu ⋮ do PPV no celular; Opa com botão **"Tirar foto"** (câmera direto) e Publicar fixo; filtros da Lista do Opa em folha; dashboard sem valores cortados. |
| **Serviços / OS** — POS, Revisões, Garantias, SAT… | ⚠️ **Parcial** — o agente foi interrompido no meio | Mudanças em 17 arquivos (inclui `OSDrawer`, `PosMobile`, `DashboardOS`, `RelacaoOS`, Revisões, Garantias). Compila, mas **não passou pelas 3 rodadas**. |
| **DRE Financeiro / Vendas por Modelo** | ⚠️ **Parcial** | 19 arquivos (tabelas com 1ª coluna fixa, `dre-mobile.css`). Sem as 3 rodadas. |
| **Estoque / Ajustes / Visual Estoque** | ⚠️ **Parcial** | 23 arquivos (inclui `NavMobile`, contagem de inventário, localização, características, baixa de contas). Sem as 3 rodadas. |
| **Comercial / Clientes / CRM / Feedbacks** | ⚠️ **Parcial** | 26 arquivos (Pasta Clientes, cockpit de atendimento, leads, propostas…). Sem as 3 rodadas. |
| **Central de Trabalho / POPs / Admin / outros** | ⚠️ **Parcial** | 35 arquivos (quadros, tickets, cronograma, reuniões, POPs, admin…). Sem as 3 rodadas. |

> Os grupos ⚠️ **compilam** (o build de produção passou com tudo junto), mas não terminaram a conferência visual. Recomendação: **antes do Passo 2**, peça ao Claude para retomar esses 5 grupos (os agentes guardaram o progresso) e só então colocar no ar. Se preferir colocar no ar já, confira esses módulos com atenção no Passo 1.

---

## 3. Problemas encontrados que NÃO são de layout (ficaram anotados)

1. **Nomes com código HTML cru** (aparece no PC também): ex. `DISCO MAHINDRA 12&quot;`, `FELIZARDO &amp; FELIZARDO`. Vem dos dados (sincronização com a Omie). É preciso decodificar na gravação ou na exibição.
2. **Modo escuro** (já existia, também no PC):
   - janela do PPV: campos Cliente, Vendedor e Parcelas quase invisíveis e caixa de totais branca;
   - chips azuis da `/pendencias` e selo "RASTREADO" da Ficha com pouco contraste;
   - texto `#424242` no histórico de RH.
3. **Mapa da frota** (`src/components/supervisor/MapaCarros.tsx`): apareceu uma vez o erro "reading 'x'" (o mapa ainda sem tamanho). Falta proteger o `fitBounds`/`setView`.
4. **Preventivas da frota** aparecem como "não ativada": a migration `sql/frota-preventiva.sql` ainda não foi aplicada (pendência antiga do CLAUDE.md).
5. **Requisições no PC (1440px)**: o título dos cards corta por causa das 4 colunas (já existia).
6. **Logs do financeiro**: um registro com "NF #undefined" (dado gravado assim).

---

## 4. Checklist rápido no celular depois do deploy

- [ ] Dashboard: abrir um app, buscar "nota", Editar → favoritar → Pronto, tema escuro.
- [ ] Menu ☰, sino, foto (Chat, Lembretes, Configurações).
- [ ] POS: abrir uma OS e passar por todas as abas da janela.
- [ ] PPV: abrir um pedido e rolar até o Salvar.
- [ ] Opa: "Novo Opa" → "Tirar foto" abre a câmera (não publique se for só teste).
- [ ] Financeiro: kanban → pílulas das colunas → abrir um card.
- [ ] Frota: `/pendencias` → "Abrir pendência" (feche sem enviar).
- [ ] Pasta Clientes: buscar um cliente e abrir uma OS.
- [ ] Estoque: dashboard, notas de entrada, contagem de inventário.
- [ ] Central de Trabalho: quadros e abrir um ticket.

---

## 5. Limpeza (quando o trabalho de mobile terminar)

- **Usuário de teste:** `mobile.teste@novatratores.com` (nome "Teste Mobile (Claude)", admin) foi criado só para tirar os prints. Ele deve ser apagado no fim: o Claude apaga ao encerrar, ou você remove em **Admin → usuários**. Enquanto existir, ele aparece na lista de usuários.
- **Pasta do portal:** ficaram arquivos **de outras sessões do Claude**, que não fazem parte deste trabalho:
  - a cópia da Agenda coletiva (já está na `main`);
  - uma mudança em `src/lib/push-mecanicos.ts` (segredo do push do app dos técnicos), **ainda sem commit**: confira com a sessão que cuida do app dos mecânicos.
- **Cópia de trabalho:** a branch foi montada em `C:\Users\joseo\Projetos\Portal_NT_mobile` (git worktree). Depois do merge, apague com `git worktree remove ../Portal_NT_mobile` a partir da pasta do portal.
