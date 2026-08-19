# Portal Nova Tratores — Contexto para o Claude

> Lido automaticamente pelo Claude Code. Resume o estado do projeto e o trabalho em curso,
> para qualquer sessão (em qualquer computador) continuar de onde parámos.
> NÃO colocar segredos aqui (só nomes de variáveis). As chaves vivem no `.env.local` (local) e no Railway (produção).

## Visão geral
- Portal interno da **Nova Tratores** (concessionária Mahindra). **Next.js 16** (App Router, TypeScript), **Supabase** (BD + auth), deploy no **Railway** (e Vercel). Realtime via Supabase.
- Assistente **"Tratorilson"**: chat com IA (OpenAI ou Groq) em `src/app/api/assistente/chat/route.ts`.
  - Persona/conhecimento: `src/lib/assistente/conhecimento.ts`
  - Provider de IA: `src/lib/assistente/ia.ts` (escolhe OpenAI/Groq por env var)

## Trabalho feito recentemente (junho/2026)

### Requisições (`src/app/(portal)/requisicoes`, `src/components/requisicoes`)
- Tratorilson escondido na impressão; PDF (`TemplatePDF.tsx`) sem Hodómetro no Trator-Cliente e sem Chassis no Oficina.
- Trator-Loja: campo Hodómetro + seletor de O.S. no `FormReq.tsx`.
- Kanban: **filtros unificados** numa só busca (com tooltip) + filtro de **data exata** (em vez de período).
- Botão "Alertas" removido; lixeira **sem exclusão permanente**; gestor de tags sem emojis + sem duplicadas; **legendas (tooltips)** nos ícones dos cards.
- Notificação só em **alteração real** (corrigida a falsa por reformatação do valor).

### Papel "Dev" + bloqueio de valor alto + histórico
- Coluna `is_dev` em `portal_permissoes`. SQL: `sql/dev-bloqueio-historico.sql` (**JÁ APLICADO** no Supabase). **Dev = Admin + extras**. 1º dev: `antonio.novatratores@gmail.com`.
- Administração (`src/app/(portal)/admin/page.tsx`): **dropdown Usuário/Admin/Dev** (só um Dev pode dar/tirar Dev). `usePermissoes` expõe `isDev`; `isAdmin = is_admin || is_dev`.
- Requisição com `valor_despeza > R$ 500` fica **bloqueada para edição** (exceto Dev). Pedido de permissão guardado em `requisicao_autorizacoes`; aprovado/recusado no **"Painel do Dev"** (botão preto flutuante nas Requisições). Aprovação vale para **UMA** alteração (depois volta a bloquear).
- **Histórico por card** (`HistoricoModal.tsx`) lê `audit_log` + `requisicao_autorizacoes`.
- Lógica: `src/lib/requisicoes/autorizacao.ts` (`LIMITE_BLOQUEIO = 500`).

### Chat Tratorilson (portal)
- Persona reescrita para tom **natural/humano** (mantém regras de segurança).
- Saudação mais calorosa + **sugestões rápidas** (chips) + opção de **"fixar"** a janela no canto (`TratorinoChat.tsx`).

### Abastecimento ∪ Requisições (24/07/2026)
- A tela **Frota → Abastecimento** agora une DUAS fontes NA LEITURA (nada é escrito em `abastecimentos`): CSV do cartão-frota + requisições de abastecimento (Veicular/Trator/Quadri). **Só requisição com `status='financeiro'`** conta (decisão do usuário: em aberto o valor não é confirmado); como é leitura ao vivo, as antigas já no financeiro entraram sozinhas, sem backfill. Lib: `src/lib/abastecimento/requisicoes.ts` (parse BR/US de valor/litros, hodômetro só-dígitos, resolve placa via `frota_veiculos.supa_placa_id`).
- Trator/Quadri não têm placa → pseudo-placas **TRATOR**/**QUADRI** (chassis fica no "modelo" na aba Transações; nos rankings viram "Tratores/Quadriciclos (requisições)").
- Requisição só tem DATA (vira meio-dia -03:00) e não informa combustível → fica **fora** do heatmap dia×hora, da auditoria de intervalos e do km/L (`PLACAS_SEM_CONSUMO` + `origem: 'requisicao'` em `agregacoes.ts`).
- Coluna/selo **Origem** (Cartão × Req. #id com link pro card) na aba Transações, no popup de drill-down, no CSV e no PDF analítico.

### Frota → Pendências (17/08/2026)
- Aba nova **Pendências** (ao lado de Custos (TCO), registrada em `frota/paginas.ts` → nav+permissão+gate automáticos). Tela `/frota/pendencias`: por veículo (dashboard com foto × lista, modal ao clicar). **TODA pendência é registrada** na tabela `frota_pendencias`, com 3 origens: `manual` (equipe), `cadastro` (régua da Ficha — `pendenciasDetalhadas` em lib/frota/pendencias, agora com slug estável) e `checklist` (item "problema" do checklist mais recente, auto-classificado no componente via mapa).
- **Sincronização automática** (GET `/api/frota/pendencias?sync=1`): abre sozinha as de cadastro/checklist e FECHA sozinha quando a causa some (Ficha corrigida; item OK no checklist seguinte). Cadastro resolvida na mão reabre em 30 dias se a causa continuar (graça).
- Taxonomia **Sistema › Subsistema › Componente** (`frota_componentes`, seed com vida útil meses/km); resolução rastreada (quem/quando/como + vínculo Requisição `/requisicoes?req=` ou OS por número); **alerta de recorrência**: mesmo componente + intervalo < vida útil → "era pra durar mais". Ação `classificar` no PATCH pra definir componente depois.
- Migration `sql/frota-pendencias.sql` v1 **APLICADA** (17/08); taxonomia v3 (77 componentes, do interior ao exterior — sistema "Interior" incluso) inserida via script. ⚠️ Conferir se os ALTERs v2 (`km`, `responsavel`) foram rodados. APIs: `/api/frota/pendencias` (GET/POST/PATCH), `/api/frota/componentes`, `/api/frota/veiculo-historico`, `POST /api/frota/pendencias/sync` (qualquer usuário autenticado — dispara o motor). Motor em `lib/frota/pendencias-sync.ts`.
- **Integração automática (17/08):** requisição **"Veicular Manutenção"** exige placa+hodômetro (FormReq) e abre pendência no carro na criação (dispara o sync); fecha sozinha quando `status='financeiro'`. **OS do Pós** com a placa no campo `Projeto` (ex. "CARGO-AQJ3H59") abre pendência e fecha quando a OS conclui/cancela. Origens novas: `requisicao`, `os`.
- **Módulo "Pendências (Frota)"** (17/08): tela `/pendencias` mobile-first pra abrir/acompanhar pendências dos carros SEM o módulo Frota inteiro (id `pendencias` no Admin/catálogo/menu; `temModuloPendencias` libera as rotas de leitura + pendências). Abertura exige **FOTO** (camera capture → bucket `anexos/pendencias/`) e **responsável obrigatório = usuário do portal** (regra também nos forms da aba Frota→Pendências e no POST da API).
- **Ficha (Visão geral):** modal central com mapa Sistema›Subsistema›Componente (azulejos, vermelho piscando = pendência, links azuis pra `?placa=`), foto do responsável (RH → avatar do portal), **Histórico de pendências** (abertas + resolvidas/requisições sem abastecimento/OSs em dropdowns) e **Linha do tempo** clicável (feito × não feito). Visual do módulo: azul escuro `#1e40af` (menu tb; Comercial virou rosa), guias Chrome na faixa azul, fontes pretas, bordas quadradas, cards com faixa lateral azul, sem-foto por último. Aba Pendências: tela cheia, sem KPIs, botão "+ Nova pendência" global (km + responsável obrigatório se o carro tem técnico). Checklist do Danilo movido pra FXM4G90 + vínculo corrigido (17/08).

### Tickets internos (v1 — julho/2026)
- Módulo `/tickets` (motor genérico do doc "conceito-sistema-tickets", ADRs 001–007): fila/pedidos/acompanhando/gerencial, timeline imutável, transferência sem aceite, participantes permanentes, resolvido→fechado (auto-fecha em 7 dias via GitHub Actions `tickets-auto-fechar.yml`).
- Tabelas em `public` (`tickets`, `tickets_participantes`, `tickets_eventos`); leitura via RLS (`tickets_pode_ver`), escrita SÓ via `/api/tickets/*` (service role). Migration `sql/create-tickets.sql` **JÁ APLICADA** no Supabase (10/07/2026, verificada via REST).
- Permissão: módulo `tickets` no Admin; visão gerencial = admins. Notificações in-app (tipo `tickets`). v2 (Solicitação de Compras) desenhada, aba "Em breve" na navegação.

## WhatsApp (EM CONSTRUÇÃO)
Objetivo: Tratorilson **atende clientes no WhatsApp** (revisão / manutenção / peças / vendedor / outros), recolhe dados e (futuro) cria OS/PPV no portal.
- **Spec detalhada do "modo cliente": `docs/tratorilson-whatsapp.md`** (ler isto!).
- ✅ **ENVIO testado e a funcionar** (Meta Cloud API, com o número de **TESTE** da Meta).
- ✅ **Webhook construído** (1ª versão): `src/app/api/whatsapp/webhook/route.ts` (GET verifica, POST recebe) + `src/lib/whatsapp.ts` (enviar + responderCliente, ligado à IA). Persona do modo cliente: `PERSONA_CLIENTE_WHATSAPP` em `src/lib/assistente/conhecimento.ts`.
  - Memória de conversa é **em memória do processo** (reinicia no redeploy) — TODO: persistir no Supabase.
  - Esta 1ª versão **conversa e recolhe dados / dá contactos**; ainda NÃO cria OS/PPV nem agenda (próximo passo).
- ⏳ **Falta para testar:** configurar o **webhook na Meta** (URL pública do Railway + verify token) e ter um **token válido** (o de teste expira ~24h).
- Credenciais usadas no teste (TEMPORÁRIAS): número de teste da Meta, Phone number ID e token temporário (~24h).
- **Para produção:** ligar o **NÚMERO REAL** da empresa ao mesmo app Meta + gerar **TOKEN PERMANENTE** (System User) e atualizar as variáveis no Railway. **O código não muda** — só as credenciais.

## Variáveis de ambiente (Railway) — só NOMES
- **Supabase:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- **IA (Tratorilson):** `AI_PROVIDER` (openai|groq), `OPENAI_API_KEY`, `OPENAI_MODEL` (gpt-4o-mini), `GROQ_API_KEY` (reserva)
  - ⚠️ A chave **OpenAI está no `.env.local` local mas FALTA no Railway** (em produção usa Groq por enquanto). Pôr `AI_PROVIDER=openai` + `OPENAI_API_KEY` no Railway para usar a OpenAI em produção.
- **Outras (já no Railway):** Omie (`OMIE_APP_KEY/SECRET...`), Gmail (`GMAIL_USER`, `GMAIL_APP_PASSWORD`), `ORS_API_KEY`, Rotaexata, etc.
- **Status dos crons (tela /agendamentos):** `GITHUB_TOKEN` (PAT fine-grained, só leitura — **Actions: Read** + Metadata no repo `Nova-tratores/Portal_Nova_Tratores`) — a rota `/api/agendamentos/status` consulta a GitHub Actions API para mostrar a última execução de cada cron. Opcional `GITHUB_REPO` (default `Nova-tratores/Portal_Nova_Tratores`). Se faltar, a tela funciona mas mostra aviso "configure GITHUB_TOKEN". Pôr no `.env.local` e no Railway.
- **WhatsApp (a adicionar ao publicar):** `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN` (inventar um), e opcional `WHATSAPP_APP_SECRET`.
- **Frota ↔ RH (aba Motoristas, 17/07/2026):** `RH_SUPABASE_URL` + `RH_SUPABASE_SERVICE_KEY` (service key do Supabase do projeto `rh-nova-tratores` — a RLS de `rh_funcionarios` bloqueia anon). O portal lê os funcionários SEM salário (select explícito em `src/lib/frota/rh.ts` — único ponto que toca o RH) e mescla com `frota_motoristas` por CPF (de-para persistido em `pessoa_id`). CNH (número/categoria/validade) + flag "é motorista" são editáveis no portal (`campos_manuais` protege do sync). Se as env faltarem, a aba funciona só com dados locais e mostra aviso. **Migration:** `sql/frota-motoristas-rh.sql`. Já no `.env.local`; pôr no Railway.
- **E-mail de envio do financeiro (por usuário):** `EMAIL_ENC_KEY` (AES-256 das senhas de app guardadas em `financeiro_envio_config` — lib/cripto). Gerada e adicionada ao `.env.local` em 18/08/2026; **falta pôr o MESMO valor no Railway**. Se trocar a chave, todas as senhas salvas param de descriptografar.
- **Auditoria ajustes:** `CMC_HMAC_SECRET` (inventar um segredo forte) — assina (HMAC-SHA256) cada correção de estoque negativo gravada em `cmc_correcoes`, para tamper-evidence. Se faltar, a correção ainda funciona mas fica **sem assinatura**. Pôr no `.env.local` e no Railway. Migration `sql/cmc-correcoes-assinatura.sql` (colunas `assinatura` + `assinatura_payload`) **JÁ APLICADA** no Supabase (03/07/2026).
- **Alimentação da OS → Requisição AUTOMÁTICA (16/07/2026, JÁ NO AR):** migração `sql/add-requisicao-origem.sql` **APLICADA**. Motor: `sincronizarAlimentacaoOS` em `src/lib/pos/alimentacao-os.ts` — lançou alimentação na OS → Requisicao nasce em `status='pedido'` (em aberto, dá pra descontar em folha); editou/removeu acompanha; **concluiu a OS → promove pra `financeiro`** com valor atualizado + nota anexada (`foto_nf`). Admin anexa a nota pelo bloco de Alimentação da OS (rota `/api/pos/ordens/[id]/alimentacao-nota`). Requisição MANUAL de Alimentação na OS desliga o automático. Decisão do usuário: SEM backfill das OSs antigas em andamento — cada uma abre a sua na próxima vez que for salva ("modo natural"). Exceção (23/07/2026): backfill pontual de 11 OSs CONCLUÍDAS antes do motor (0363, 0446, 0447, 0469, 0473, 0506, 0527, 0546, 0553, 0563 — reqs #6423–6433, todas sem nota anexada na OS), rodando o próprio `sincronizarAlimentacaoOS` via tsx; OS concluída nunca é salva de novo, então o modo natural não as alcançava.

### Sistema Peças unificado + modo escuro geral (18/08/2026)
- **Peças = sistema interno do PPV**: barra laranja padronizada (`PecasNav.tsx` + `.ppv-topbar*` no globals) em TODAS as telas — Pré-Pedido de Venda | Catálogo | Etiquetas | Retiradas | Orçamentos | Requisições. Guias fechadas com fonte preta; ativa "abre" pro fundo (escuro no dark). Skin `.pecas-skin` (tudo quadrado, acentos laranja) em Orçamentos/Requisições/Retiradas/Catálogo/Etiquetas — kanban do PPV intocado (é a referência visual).
- **Requisições**: vermelho→laranja no app todo (TemplatePDF intocado), sem título, busca/pílulas maiores, botão Dev inline (era FAB), **modo Lista** (toggle no Kanban), colunas full-width, capa em grade 2 col + Fornecedor, chips de anexo acesos em laranja FLUORESCENTE (`.chip-anexo-on`). Seletor de solicitante com FOTO (avatar_url) no FormReq e CardReq; O.S. puxa cliente+CNPJ+chassis+horímetro (`Ordem_Servico_Tecnicos`, fallback Projeto) via `puxarDadosOS`; Trator-Loja reordenado (O.S. primeiro, um campo só de chassis). `parseBR` do FormFornecedor aceita "800.00" (US) — antes virava 80.000.
- **Catálogo**: botão "Ordenar" (setas ▲▼ por card, grava `catalogo_modelos.ordem` via PATCH /api/catalogo; 0 = ordem automática); sem animações de pulo/pisca; home 🏠 e carrinho 🛒 como ícones; figura cabe na tela (painel de peças ABERTO por padrão); scroll = pan vertical, Ctrl+scroll = zoom.
- **Carrinhos**: sem cliente; "Adicionar produtos em…" → Incluir em PPV/Orçamento ABERTO (criar-doc `alvoId`) ou Criar novo (compacto, cliente+técnico; criar PPV redireciona `/ppv?id=` pro modal do pedido); clicar num PPV abre modal-workspace (busca=Novo Item + peças do pedido + peças do carrinho com Copiar); PDF/copiar códigos; peça sem cadastro NÃO bloqueia mais PPV (entra preço 0 — bloqueio removido do criar-doc TAMBÉM); Zeitten virou linha discreta; abas renomeadas (Lista de peças | Incluir ou Criar Pedido); GET /api/orcamentos devolve `{orcamentos:[...]}` e EXIGE `?q=` (senão cai no ramo por-OS).
- **PPV**: modal "Novo Item" (mais usados via /api/ppv/produtos/mais-usados + busca + atalhos Catálogo/Kit; seleção JÁ adiciona, modal fica aberto; kitSinal abre ImportarKit); cards com nº neon + infos em lista + "Criado por" (`criadoPor`=email_usuario na rota pedidos); coluna Custo (CMC) por item na tabela (cmcPorItem); ItemOrcamentoModal com histórico num painel lateral esquerdo colado.
- **MODO ESCURO (globals.css, bloco @media screen)**: sistema de remapa por atributo — React serializa hex→rgb, e `backgroundColor` vira `background-color:` (cobrir OS DOIS!). Textos escuros→claros, fundos/bordas claras→tema, âmbar escuro→claro, laranjas/azuis de texto→tons claros. Botões laranja/azul/vermelho → legenda PRETA no escuro (pedido do usuário). Cards de grupo do dashboard: classes `dash-group-<key>` com cores NEON + letras pretas. Pasta Clientes convertida pra vars do tema (cuidado: replace em massa de `'#111827'` pegou FUNDOS — corrigidos pra #dc2626). Deep-link `/clientes?cod=&doc=` abre a pasta.
- **Cores dos módulos** (menu + dashboard): Comercial VERMELHO, Estoque cinza-prata, Frota azul-escuro (FrotaNav: fonte preta nas guias, ativa `#fefefe` — `#fff` é convertido pelo dark!).

### Tela dividida + grupo Serviços + acabamentos (19/08/2026)
- **Tela dividida `/split`**: dois sistemas lado a lado (iframes same-origin, mesma sessão/permissões), seletor por lado, divisor arrastável, empilha no celular, escolha salva em `localStorage portal-split`. Botão de colunas no header (alterna: na /split vira "voltar pra uma tela só", vermelho aceso). Dentro dos painéis o header do portal SOME (`emIframe` no PortalLayout + classe `.em-iframe` zera os `top: 84px`).
- **Grupo SERVIÇOS = sistema interno do POS**: `ServicosNav` (faixa azul 38BDF8→0369A1, guias Chrome, 9 sistemas) injetada pelo layout do route group `(portal)/(servicos)` — pos, garantias, mecanicos, sat, mapa-geral, fotos-tecnicos, lousa movidos pra lá (URLs iguais); **revisoes e cronograma ficaram FORA do grupo** (pastas travadas pelo dev server) com layout.tsx local injetando a mesma faixa — se quiser, mover depois e apagar os layouts locais.
- Faixas com degradê 135° também no Financeiro (verde D8F0B2→A9D47D) e Frota (3B82F6→1E3A8A); faixas roláveis por dentro no celular (responsividade). Financeiro: botões da faixa e chips de setor em VERDE NEON (#A6FF3B); aba ativa preta c/ fonte branca; títulos de coluna pretos (classe `fin-col-title` + exceções nas regras globais de h3/sticky do dark — cuidado com elas!). POS: drawer da OS 100% escuro (os-* com var(--surface) e overrides), Salvar/Enviar Omie AZUL NEON (#00C2FF), ícones da capa neon. Impressão SEMPRE clara (`@media print` reseta as vars). Deep-link `/clientes?cod=&doc=`.
- ⚠️ Padrões aprendidos do modo escuro: React serializa `background` hex→rgb no atributo, `backgroundColor`→`background-color:` (cobrir os dois); `#fff`/`#111827`/etc são REMAPADOS pelas regras dark — pra fugir da conversão use `#fefefe`/`#111111`; dev server + builds dividem `.next` e servem CSS defasado (reiniciar o dev resolve).

## Próximos passos
1. Construir o **webhook do WhatsApp** (`/api/whatsapp/webhook`: GET verifica, POST recebe) + função de **enviar** + ligação ao assistente (modo cliente — ver `docs/tratorilson-whatsapp.md`).
2. **Publicar no Railway** e configurar as variáveis do WhatsApp + a chave OpenAI.
3. Configurar o webhook no painel da Meta (URL pública + verify token).
4. Ligar o **número real** da empresa (token permanente).
5. Construir as **"ações"** do modo cliente (criar OS/PPV, importar kit por horas, agendar técnico por dia, calcular distância à loja, ler fotos/vídeos na manutenção).

## Ambiente de desenvolvimento
- Windows + PowerShell. Git/Node instalados via winget. `.env.local` tem as credenciais (está no `.gitignore`).
- `npm run dev` para local. **Validar sempre `npm run build` antes de fazer push** (o deploy é automático a partir do `main`).
