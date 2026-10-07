# Base de conhecimento (KMS) e treinamento (LMS)

> Documento vivo. Entrega 1 (02–05/10/2026): base de conhecimento com o piloto do Pós-Vendas. Entrega 2 (05/10/2026): versões, artigos desatualizados e novidades.
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

## 3. Entrega 2 — o que acontece quando o sistema muda (05/10/2026)

O deploy é automático a cada push e antes ninguém ficava sabendo. Agora cada versão é registrada e gera duas coisas: artigos marcados para conferência e um rascunho de "O que mudou".

### Fluxo
1. **Workflow** `.github/workflows/release-registrar.yml` (primeiro por `push` do repositório; os outros 44 são cron). Monta `{sha, sha_anterior, commits:[{sha, titulo, autor, data, arquivos[]}]}` com `git rev-list` + `git diff-tree`, espera 6 min (o deploy do Railway leva uns 4) e chama `POST /api/conhecimento/releases` com `x-cron-secret` (mesmos segredos `CRON_SECRET` e `PORTAL_URL` dos crons). Tem `workflow_dispatch` para rodar à mão.
2. **Rota** (`CRON_SECRET`, fail-closed, idempotente por `sha`) → `registrarRelease` em `lib/conhecimento/releases-db.ts`:
   - grava `sistema_releases`;
   - **artigos afetados**: artigo PUBLICADO cujas `fontes` (globs) casam com algum arquivo alterado que muda a tela → `revisao_pendente_desde` (mantém a data mais antiga) + `revisao_motivo` `{release, commits[], arquivos[]}` acumulado;
   - **novidade**: para cada módulo com responsável e com commit `feat`/`fix`/`perf`, a IA reescreve os títulos dos commits em linguagem de quem usa a tela (JSON `{titulo, itens[]}`); se a IA falhar, vai o texto direto dos commits (`novidadeSemIA`). Entra em `kb_novidades` como **rascunho**;
   - **um aviso por responsável** com a contagem de artigos e novidades.
3. **Responsável**:
   - no editor do artigo, o painel vermelho mostra os commits e os arquivos tocados, com **"Conferi, o texto continua valendo"** (ação `revisado`, tira o selo sem versão nova) ou editar e publicar;
   - em `/conhecimento/novidades`, "Para você aprovar": edita título e texto com prévia, vê de onde saiu (commits), **Publicar**, salvar ou descartar. Também dá para escrever uma novidade à mão.
4. **Leitor**: o aviso **"O que mudou no portal"** (`components/conhecimento/Novidades.tsx`, montado em `(portal)/layout.tsx`) aparece no canto uma vez, com as novidades publicadas nos últimos 30 dias dos módulos que ele usa; "Entendi" grava em `kb_novidades_lidas`. Histórico em `/conhecimento/novidades`. Enquanto o artigo está marcado, o botão "?" mostra "A tela mudou em DD/MM. Este texto pode estar desatualizado."

### Regras puras (`lib/conhecimento/releases.ts`, 10 testes)
- `lerCommit`: `tipo(escopo): descrição`. `modulosDoEscopo`: `pos/ppv` → pos e ppv; `feedbacks/relatorios` → feedbacks; apelidos (`pecas` → ppv, `os` → pos…). Só módulos **com responsável** contam (é assim que o piloto fica restrito ao Pós-Vendas sem lista fixa no código).
- `moduloDoArquivo`: `src/{app/(portal)[/(grupo)], app/api, components, lib}/<modulo>/…`. `mudaATela`: fora testes, `.md`, e tudo que não está em `src/`.
- `globParaRegex`: `**` atravessa pastas, `*` não. `artigosAfetados`, `novidadesPorModulo`, `juntarMotivo`, `lerPayloadRelease`.

### Banco (`sql/sistema-releases.sql`, rollback `sql/rollback-sistema-releases.sql`)
`sistema_releases` (sha único, commits, arquivos, modulos, contagens), `kb_novidades` (`texto` em markdown simples "- item"; status rascunho | publicado | descartado; origem ia | manual; commits de origem), `kb_novidades_lidas`. RLS ligado sem policy + REVOKE.

### Simulação com os 12 últimos commits reais (05/10)
Módulos por commit corretos (inclusive `feat(etiquetas)` → ppv pelos arquivos e `feat(revisoes)` → revisoes e pos). 1 artigo publicado marcado (Garantias). Rascunho de novidade para pos, garantias, tickets, ppv, revisoes e feedbacks. **Limite conhecido:** o seed deu a cada artigo as fontes do módulo inteiro (`src/lib/pos/**`…), então qualquer mudança no módulo marca TODOS os artigos dele (se os 39 estivessem publicados, 31 seriam marcados). O painel com os commits e o botão "Conferi" resolvem rápido; refinar as `fontes` por artigo reduz o ruído.

### Acabamentos da entrega 1 que entraram junto
- Aba Artigos, para quem edita: filtro **Tudo | Só publicados | Só rascunhos e edições pendentes**.
- Publicar ou confirmar um artigo limpa o cache do botão "?" (`limparCacheAjuda`), então ele aparece na hora para quem publicou; os outros navegadores levam até 5 min ou um recarregamento.

## 3b. Entregas seguintes (não feitas)
3. **Treinamento**: `lms_trilhas/etapas/perguntas/atribuicoes/progresso`; trilha "Pós-Vendas — operação da OS" para a categoria Pós Vendas, nota mínima 70 %, prazo 7 dias; reciclagem só quando a versão nova é `relevante`; painel do gestor.
4. **Tratorilson** lê a base (`buscar_conhecimento`), perguntas sem resposta viram lacunas/FAQ.
- Não feito na entrega 2: rascunho de ARTIGO vindo junto com a entrega de código (pasta `conhecimento/rascunhos/`), e registro de visita de rota no servidor para achar telas usadas sem artigo.

## 4. Gotchas
- `useSearchParams` em página cliente exige `<Suspense>` (feito em `/conhecimento` e no editor).
- A regra `react-hooks/set-state-in-effect` do lint recusa `setState` síncrono em efeito: o botão "?" usa cache fora do componente + `forcar()` no `finally`, e "aberto" guarda a tela em que foi ligado em vez de ser zerado por efeito.
- Scripts Python com heredoc quebram em aspas/`\n`; gravar o script em arquivo e tratar CRLF (vários arquivos do portal são CRLF).
- Playwright MCP não conectou na sessão de 05/10: a validação visual com usuário logado ficou para depois da migration.
