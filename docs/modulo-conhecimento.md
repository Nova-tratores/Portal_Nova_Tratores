# Base de conhecimento (KMS) e treinamento (LMS)

> Documento vivo. Entrega 1 (02–05/10/2026): base de conhecimento com o piloto do Pós-Vendas.
> Plano completo das 4 entregas em `C:\Users\hhenr\.claude\plans\estou-pensando-em-considerar-wondrous-papert.md` (resumo abaixo).

## 1. Por que existe

O conhecimento sobre o portal estava espalhado e preso no código: ajuda por tela do DRE e de Compras em TS/JS, guias de garantia em `lib/garantias/guias.ts`, painéis "Como funciona" em JSX, 30 documentos em `docs/` que ninguém vê dentro do portal, e a memória do Tratorilson. Mudar um texto exigia deploy. Não havia treinamento, prova, busca nem registro do que mudou a cada versão.

**Princípio: um conteúdo, vários usos.** O artigo da base é a fonte da verdade. O botão "?" das telas, a busca, o treinamento (entrega 3) e o Tratorilson (entrega 4) leem o mesmo artigo.

**Decisões (02/10/2026):** conteúdo primeiro = uso do portal; IA rascunha, responsável aprova; treinamento com prova (nota mínima 70 %) e prazo (7 dias); detecção de conteúdo velho automática a cada deploy. **Piloto = Pós-Vendas**, responsável **Henri Irneh**.

## 2. Entrega 1 — o que existe

### Banco (`sql/conhecimento-base.sql`, rollback em `sql/rollback-conhecimento-base.sql`)
- `kb_artigos`: `slug` único, `titulo`, `tipo` (tela | procedimento | regra | faq | produto), `modulo` (id do catálogo de permissões ou `geral`), `telas[]` (pathnames que documenta), `fontes[]` (globs de código, usados na entrega 2), `resumo`, `corpo` jsonb (blocos), `tags[]`, `publico[]` (categorias; vazio = quem tem o módulo), `ordem`, `status` (rascunho | publicado | arquivado), `versao` (0 = nunca publicado), `rascunho` jsonb (edição pendente de artigo já publicado), `origem` (manual | ia | seed | entrega), `revisao_pendente_desde` + `revisao_motivo` (entrega 2), `revisar_ate` (validade: 6 meses após publicar), `texto_busca` (minúsculo, sem acento, escrito pelo app) e `busca` tsvector gerado (config `simple`, GIN).
- `kb_artigo_versoes`: snapshot a cada publicação com `resumo_mudanca` e `relevante` (mudança que pede reciclagem, entrega 3).
- `kb_feedback`: ajudou / não ajudou / desatualizado, com comentário e tela; `resolvido_em`.
- `kb_leituras`: quem abriu qual versão (PK artigo + usuário + versão).
- `kb_responsaveis`: módulo → usuário que aprova. Seed: Henri Irneh em pos, garantias, revisoes, sat, ppv, feedbacks, requisicoes, tickets.
- RLS ligado sem policy + REVOKE de anon/authenticated: só `/api/conhecimento/*` (service role). O deploy não quebra sem a migration: a API devolve 503 `migracaoFaltando`, as telas avisam e o botão "?" não aparece.

### Modelo de edição
As colunas guardam o conteúdo **vigente**. Editar artigo já publicado grava em `rascunho`; o leitor continua vendo a versão publicada até o responsável publicar. Artigo nunca publicado guarda o próprio rascunho nas colunas. Publicar: aplica o rascunho, `versao + 1`, snapshot em `kb_artigo_versoes`, limpa `revisao_pendente_*`, renova `revisar_ate`. Publicação concorrente é recusada (409) pelo `eq("versao", a.versao)`.

### Permissões
- **Ler**: qualquer usuário logado; artigo visível se publicado, se o usuário tem acesso ao `modulo` (puro ou qualquer ação) e, quando `publico` não está vazio, se a categoria dele está na lista.
- **Editar**: admin, `conhecimento` / `conhecimento:editar`, ou responsável do módulo.
- **Publicar/arquivar/reabrir**: admin, `conhecimento` / `conhecimento:publicar`, ou responsável do módulo.
- Regras puras em `src/lib/conhecimento/artigos.ts`; casca das rotas em `rota.ts` (`entrar`, `podeEditarModulo`, `podePublicarModulo`, `erroResposta`).
- Registro: módulo `conhecimento` em `permissoes/catalogo.ts` (grupo Outros, ações editar/publicar), `admin/page.tsx`, `navItems` (sempre visível, como dashboard/opa/sat), card no dashboard **sem** entrada em `systemToModulo` (de propósito: ler é de todos), `notif/prefs.ts`.

### Conteúdo em blocos (`src/lib/conhecimento/blocos.ts`)
Não é markdown nem HTML. Tipos: `p`, `titulo`, `lista` (itens com `sub`), `passos` (título/texto/dica), `tabela`, `aviso` (info | atencao | perigo), `termos`, `imagem`, `video`, `codigo`. Texto aceita só `**negrito**` e `` `código` `` (`trechos()`). `sanitizarCorpo` aceita qualquer entrada (navegador, IA, seed) e devolve só blocos válidos com limites; URL só http(s) ou caminho do portal. `mdParaBlocos` converte markdown simples (títulos, listas com um nível de sub-item, tabelas, citação → aviso, ```código```). `textoDeBusca` + `consultaTs` ("orç env" → `orc:* & env:*`) fazem a busca por prefixo sem acento.

### Rotas (`src/app/api/conhecimento/`)
- `GET /api/conhecimento?tela=/pos` → artigos publicados da tela, com corpo, do mais específico (`/pos/dashboard`) ao mais geral (`/pos`), ordenados por `ordem`. `?q=&modulo=` → lista; `?fila=1` → o que espera aprovação nos módulos que o usuário edita. Devolve `podeCriar`, `responsaveis`, `souResponsavelDe`.
- `POST /api/conhecimento` → cria rascunho (notifica o responsável se quem criou não publica).
- `GET/PATCH/POST /api/conhecimento/[id ou slug]` → ler (leitor nunca recebe `rascunho`); ações `salvar | publicar | descartar | arquivar | reabrir | meta`; retorno do leitor `leitura | ajudou | nao_ajudou | desatualizado` (os dois últimos notificam o responsável).
- `POST /api/conhecimento/rascunho` → `{modo:"ia"}` a IA (`chamarIA`, JSON) redige a partir do material colado, **só** com o que está no material; `{modo:"converter"}` só converte texto em blocos. Nada é gravado: o editor salva como rascunho.
- `GET/PATCH /api/conhecimento/retornos` → retornos abertos dos módulos que edita; resolver.
- Tudo grava em `audit_log` (`sistema='conhecimento'`).

### Telas
- **Botão "?" no cabeçalho** (`components/conhecimento/BotaoAjuda.tsx`, montado em `PortalLayout.tsx` ao lado do sino): lê `?tela=<pathname>`, cache de 5 min por tela fora do componente, some quando não há artigo. Abre painel lateral com os artigos da tela (um só já abre expandido), aviso "a tela mudou em …" quando `revisao_pendente_desde`, "Isso ajudou?" e "Editar este artigo" para quem edita. Registra leitura.
- `/conhecimento`: busca (debounce 350 ms), chips por módulo, cards agrupados por módulo com responsável; para quem edita, abas **Para aprovar** e **Retornos dos leitores**; botão **Novo artigo**.
- `/conhecimento/[slug]`: leitura, rodapé com "isso ajudou", versão, data, responsável.
- `/conhecimento/editar/[id]` (`novo?modulo=&tela=` cria): título, módulo, resumo, telas, tipo, ordem, palavras-chave; painel **Rascunhar com IA ou colar um texto**; `EditorBlocos` (lista/tabela/termos editados como texto, uma linha por item; áreas guardam o texto cru em estado local e só remontam quando a estrutura muda); prévia ao lado; **Salvar rascunho**, **Descartar edição**, **Arquivar/Reabrir**, e para quem publica: "o que mudou" + checkbox **mudança relevante** + **Publicar versão N**; histórico de versões; aviso de alterações não salvas (`beforeunload`).

### Carga inicial do piloto (`scripts/conhecimento-seed-guia.ts`)
`npx tsx scripts/conhecimento-seed-guia.ts [--dry] [--sobrescrever]` lê `docs/guia-pos-venda-regras.md`: cada `## N. Título (/rota)` é uma tela e cada linha em `**negrito**` vira um artigo (`lib/conhecimento/guia.ts`, `dividirGuia`). Resultado: **39 artigos em 8 telas** (/pos 7, /ppv 6, /garantias 8, /sat 3, /revisoes 4, /feedbacks 3, /requisicoes 5, /tickets 3), todos como rascunho `origem='seed'` com `fontes` por módulo. Idempotente por slug; não sobrescreve artigo editado ou publicado. Depois: `/conhecimento` → "Para aprovar" → Henri revisa e publica.

### Testes
`src/lib/conhecimento/__tests__/conhecimento.test.ts` (13): sanitização, busca sem acento, `trechos`, markdown → blocos, casamento tela × artigo e ordem por especificidade, permissões (módulo, categoria, responsável, ações), validação de conteúdo, validade, `dividirGuia`.

## 3. Entregas seguintes (não feitas)
2. **Mudança do sistema**: `sistema_releases` + workflow em push (`release-registrar.yml`, exige escopo `workflow` no token) → cruza arquivos alterados com `kb_artigos.fontes` e escopo dos commits com `modulo` → `revisao_pendente_desde` + notificação; rascunho de "novidades" por IA com confirmação de leitura.
3. **Treinamento**: `lms_trilhas/etapas/perguntas/atribuicoes/progresso`; trilha "Pós-Vendas — operação da OS" para a categoria Pós Vendas, nota mínima 70 %, prazo 7 dias; reciclagem só quando a versão nova é `relevante`; painel do gestor.
4. **Tratorilson** lê a base (`buscar_conhecimento`), perguntas sem resposta viram lacunas/FAQ.

## 4. Gotchas
- `useSearchParams` em página cliente exige `<Suspense>` (feito em `/conhecimento` e no editor).
- A regra `react-hooks/set-state-in-effect` do lint recusa `setState` síncrono em efeito: o botão "?" usa cache fora do componente + `forcar()` no `finally`, e "aberto" guarda a tela em que foi ligado em vez de ser zerado por efeito.
- Scripts Python com heredoc quebram em aspas/`\n`; gravar o script em arquivo e tratar CRLF (vários arquivos do portal são CRLF).
- Playwright MCP não conectou na sessão de 05/10: a validação visual com usuário logado ficou para depois da migration.
