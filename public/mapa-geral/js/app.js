// =========================================================
// APP - Main orchestrator
// =========================================================

const App = {
    state: {
        clientes: [],
        veiculos: [],
        vendedores: {},
        currentView: 'map',
        cadastroTab: 'veiculos',
        mapEditMode: false
    },
    _selectedPlaca: null,

    async init() {
        console.log('🗺️ MAPA GERAL - Inicializando...');

        // Init map
        MapCore.init();
        RegionEditor.init();

        // Init search
        Search.init();

        // Init sidebar resize
        this.initSidebarResize();

        // Load data
        await this.loadAllData();

        // Setup filter listeners
        this.setupFilters();

        // Auto-refresh vehicles every 15s (tempo real)
        setInterval(() => this.refreshVehicles(), 15000);

        // Set default dates
        const hoje = new Date();
        const mes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
        document.getElementById('data-inicio').value = mes.toISOString().split('T')[0];
        document.getElementById('data-fim').value = hoje.toISOString().split('T')[0];

        console.log('✅ MAPA GERAL pronto!');
    },

    // =========================================================
    // SIDEBAR RESIZE
    // =========================================================
    initSidebarResize() {
        const handle = document.getElementById('sidebar-resize-handle');
        if (!handle) return;

        let dragging = false;

        handle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            dragging = true;
            handle.classList.add('dragging');
            document.body.classList.add('sidebar-resizing');
        });

        document.addEventListener('mousemove', (e) => {
            if (!dragging) return;
            const newWidth = Math.min(600, Math.max(250, e.clientX));
            document.documentElement.style.setProperty('--sidebar-width', newWidth + 'px');
        });

        document.addEventListener('mouseup', () => {
            if (!dragging) return;
            dragging = false;
            handle.classList.remove('dragging');
            document.body.classList.remove('sidebar-resizing');
            MapCore.map.invalidateSize();
        });

        // Touch support
        handle.addEventListener('touchstart', (e) => {
            e.preventDefault();
            dragging = true;
            handle.classList.add('dragging');
            document.body.classList.add('sidebar-resizing');
        });

        document.addEventListener('touchmove', (e) => {
            if (!dragging) return;
            const touch = e.touches[0];
            const newWidth = Math.min(600, Math.max(250, touch.clientX));
            document.documentElement.style.setProperty('--sidebar-width', newWidth + 'px');
        });

        document.addEventListener('touchend', () => {
            if (!dragging) return;
            dragging = false;
            handle.classList.remove('dragging');
            document.body.classList.remove('sidebar-resizing');
            MapCore.map.invalidateSize();
        });
    },

    // =========================================================
    // DATA LOADING
    // =========================================================
    async loadAllData() {
        try {
            const t0 = Date.now();

            // Fase 1: Carrega veiculos e clientes em paralelo
            // Tenta Supabase + Rota Exata local, com fallback pro Railway
            let clientes = [];
            let veiculos = [];

            // Clientes: Supabase como fonte principal, Railway so complementa coordenadas
            try {
                const [supaClientes, railClientes] = await Promise.all([
                    _originalFetch('/api/mapa/clientes').then(r => r.json()).catch(() => []),
                    Utils.fetchJson('/api/clientes-mapa/leve').catch(() => [])
                ]);

                // Mapa de coordenadas do Railway (indexado por nome lowercase)
                // Ignora coords dentro de Piraju (geocoding errado pra cidade da loja)
                const LOJA_LAT = -23.208410, LOJA_LNG = -49.370770;
                const railCoords = new Map();
                for (const c of railClientes) {
                    if (c.nome && c.lat && c.lng) {
                        const distLoja = Utils.calcularDistancia(c.lat, c.lng, LOJA_LAT, LOJA_LNG);
                        if (distLoja > 15) { // ignora tudo dentro de ~15km de Piraju
                            railCoords.set(c.nome.toLowerCase().trim(), { lat: c.lat, lng: c.lng });
                        }
                    }
                }

                // Supabase eh a fonte unica - so complementa coords do Railway se nao tiver
                clientes = supaClientes.map(c => {
                    if (!c.lat && !c.lng) {
                        const key = (c.nome || '').toLowerCase().trim();
                        const coords = railCoords.get(key);
                        if (coords) {
                            return { ...c, lat: coords.lat, lng: coords.lng };
                        }
                    }
                    return c;
                });

                const comCoords = clientes.filter(c => c.lat && c.lng).length;
                console.log(`[Mapa] ${clientes.length} clientes (Supabase), ${comCoords} com coordenadas (${railCoords.size} do Railway)`);
            } catch (e) {
                console.warn('[Mapa] Erro ao carregar clientes:', e);
            }

            // Veiculos: tenta Rota Exata local, fallback Railway
            try {
                veiculos = await _originalFetch('/api/pos/rastreamento?acao=veiculos_mapa').then(r => r.json());
                if (!veiculos || veiculos.length === 0) throw new Error('Vazio');
                console.log(`[Mapa] ${veiculos.length} veiculos do Rota Exata local`);
            } catch (e) {
                console.log('[Mapa] Usando Railway para veiculos...', e.message || '');
                try { veiculos = await Utils.fetchJson('/api/veiculos'); } catch(e2) { console.warn('[Mapa] Railway veiculos falhou:', e2); }
            }

            console.log(`[Mapa] Fase 1: ${clientes.length} clientes + ${veiculos.length} veiculos em ${Date.now() - t0}ms`);

            this.state.clientes = clientes;
            await this._aplicarTecnicosVeiculos(veiculos);
            this.state.veiculos = veiculos;

            // Renderiza marcadores imediatamente
            const filtered = Markers.filterClients(clientes);
            Markers.renderClients(filtered);
            Markers.renderVehicles(veiculos);
            Markers.renderParadas(veiculos);

            // Populate city filter e lista
            this.populateCityFilter(clientes);
            this.renderCadastroList();

            // Fit to client bounds
            const withGeo = clientes.filter(c => c.lat && c.lng);
            if (withGeo.length > 0) {
                MapCore.fitBounds(withGeo);
            }

            // Fase 2: Carrega dados secundarios sem bloquear (vendedores, stats, regioes)
            Promise.all([
                Utils.fetchJson('/api/vendedores').then(v => { this.state.vendedores = v; this.populateVendedorSelect(v); }).catch(() => {}),
                Utils.fetchJson('/api/stats/resumo').then(r => this.updateStats(r)).catch(() => {}),
                Utils.fetchJson('/api/sync-status').then(s => this.updateSyncStatus(s)).catch(() => {}),
                Utils.fetchJson('/api/oportunidades').then(o => Markers.renderOportunidades(o)).catch(() => {}),
                Utils.fetchJson('/api/regioes').then(regioes => {
                    if (regioes && regioes.length > 0) {
                        KmzManager.loadSavedRegions(regioes);
                        const cb = document.getElementById('layer-regioes');
                        if (cb && !cb.checked) {
                            cb.checked = true;
                            MapCore.map.addLayer(MapCore.regioesLayer);
                            RegionEditor.onLayerToggle(true);
                        }
                    }
                }).catch(() => {})
            ]).then(() => console.log(`[Mapa] Fase 2 completa em ${Date.now() - t0}ms`));

        } catch (e) {
            console.error('Erro ao carregar dados:', e);
            Utils.toast('Erro ao carregar dados. Execute a sincronizacao.', 'error');
        }
    },

    populateCityFilter(clientes) {
        const cidades = [...new Set(clientes.map(c => c.cidade).filter(Boolean))].sort();
        const select = document.getElementById('filter-cidade');
        const html = ['<option value="">Todas as cidades</option>'];
        cidades.forEach(c => html.push(`<option value="${c}">${c}</option>`));
        select.innerHTML = html.join('');
    },

    populateVendedorSelect(vendedores) {
        const select = document.getElementById('select-vendedor');
        const nomes = [...new Set(Object.values(vendedores))].sort();
        select.innerHTML = '<option value="">Todos</option>';
        nomes.forEach(n => {
            select.innerHTML += `<option value="${n}">${n}</option>`;
        });
    },

    updateStats(resumo) {
        const el = (id) => document.getElementById(id);
        if (el('stat-clientes')) el('stat-clientes').textContent = resumo.total_clientes || 0;
        if (el('stat-visitas')) el('stat-visitas').textContent = resumo.visitas_mes || 0;
        if (el('stat-equipamentos')) el('stat-equipamentos').textContent = resumo.total_equipamentos || 0;
        if (el('stat-cobertura')) el('stat-cobertura').textContent = (resumo.cobertura_pct || 0) + '%';
    },

    updateSyncStatus(status) {
        for (const [key, date] of Object.entries(status)) {
            const el = document.getElementById(`sync-${key}-status`);
            if (el) el.textContent = `Ultimo: ${Utils.formatDateTime(date)}`;
        }
    },

    setupFilters() {
        const applyFilters = () => {
            const filtered = Markers.filterClients(this.state.clientes);
            Markers.renderClients(filtered);
        };

        document.getElementById('filter-cidade').addEventListener('change', applyFilters);
        document.getElementById('filter-visita').addEventListener('change', applyFilters);
        document.getElementById('select-vendedor').addEventListener('change', applyFilters);
        document.getElementById('filter-equipamento').addEventListener('change', applyFilters);
    },

    async refreshVehicles() {
        try {
            let veiculos;
            try {
                veiculos = await _originalFetch('/api/pos/rastreamento?acao=veiculos_mapa').then(r => r.json());
                if (!veiculos || veiculos.length === 0) throw new Error('vazio');
            } catch { veiculos = await Utils.fetchJson('/api/veiculos'); }
            await this._aplicarTecnicosVeiculos(veiculos);
            this.state.veiculos = veiculos;
            Markers.renderVehicles(veiculos);
            Markers.renderParadas(veiculos);
            this.renderCadastroList();

            // Re-filter clients (default is proximity-based, so always re-filter)
            const filtered = Markers.filterClients(this.state.clientes);
            Markers.renderClients(filtered);
        } catch (e) { /* silent */ }
    },

    // Cruza tecnico_caminhos do dia + tecnico_veiculos com veiculos para mostrar nome do tecnico
    _getSupabase() {
        if (typeof _supabase !== 'undefined') return _supabase;
        if (window.supabase) {
            return window.supabase.createClient(
                'https://citrhumdkfivdzbmayde.supabase.co',
                'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNpdHJodW1ka2ZpdmR6Ym1heWRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxMDgyNzUsImV4cCI6MjA4NDY4NDI3NX0.83x3-NrKoJgtIuSE7Jjsaj0zH-b-XJ3Z8i3XkBkwVoU'
            );
        }
        return null;
    },

    async _aplicarTecnicosVeiculos(veiculos) {
        try {
            const sb = this._getSupabase();
            if (!sb) return;

            const hoje = new Date().toISOString().split('T')[0];
            const placaTecnico = {};

            // 1. Vinculos fixos (tecnico_veiculos) como base
            const { data: vinculos } = await sb
                .from('tecnico_veiculos')
                .select('tecnico_nome, placa, adesao_id');
            this.state.tecnicoVinculos = vinculos || [];
            if (vinculos) {
                for (const v of vinculos) {
                    if (v.placa) placaTecnico[v.placa.replace(/[^A-Z0-9]/g, '').toUpperCase()] = v.tecnico_nome;
                }
            }

            // 2. Checkin diario do app mecanicos sobrescreve (tecnico escolheu carro hoje)
            const { data: checkins } = await sb
                .from('checkin_diario')
                .select('tecnico_nome, placa')
                .eq('data', hoje);
            if (checkins) {
                for (const c of checkins) {
                    if (c.placa) {
                        // Placa pode vir como "MONTANA - FHY8D25", extrair a placa limpa
                        const parts = c.placa.split(' - ');
                        const placaLimpa = (parts[parts.length - 1] || '').replace(/[^A-Z0-9]/g, '').toUpperCase();
                        if (placaLimpa) placaTecnico[placaLimpa] = c.tecnico_nome;
                    }
                }
            }

            // 3. Caminhos do dia sobrescrevem (tecnico escolheu o carro no portal)
            const { data: caminhos } = await sb
                .from('tecnico_caminhos')
                .select('tecnico_nome, placa')
                .not('placa', 'is', null)
                .gte('data_saida', `${hoje}T00:00:00`)
                .lte('data_saida', `${hoje}T23:59:59`);
            if (caminhos) {
                for (const c of caminhos) {
                    if (c.placa) placaTecnico[c.placa.replace(/[^A-Z0-9]/g, '').toUpperCase()] = c.tecnico_nome;
                }
            }

            console.log('[Mapa] Vinculos tecnico-placa:', placaTecnico);

            // Sobrescrever motorista nos veiculos que tem tecnico vinculado
            const tecnicosComCarro = new Set();
            for (const v of veiculos) {
                const placaNorm = (v.placa || '').replace(/[^A-Z0-9]/g, '').toUpperCase();
                if (placaTecnico[placaNorm]) {
                    v.motorista = placaTecnico[placaNorm];
                    v._tecnico = placaTecnico[placaNorm];
                    tecnicosComCarro.add(placaTecnico[placaNorm]);
                }
            }

            // Tecnicos vinculados que nao apareceram em nenhum veiculo com GPS
            // (provavelmente na oficina, sem carro ou carro sem rastreamento)
            if (vinculos) {
                for (const vinc of vinculos) {
                    if (!tecnicosComCarro.has(vinc.tecnico_nome)) {
                        veiculos.push({
                            placa: vinc.placa || '',
                            lat: -23.208410,
                            lng: -49.370770,
                            ignicao: 0,
                            motorista: vinc.tecnico_nome,
                            _tecnico: vinc.tecnico_nome,
                            _semGPS: true,
                            modelo: '',
                            descricao: ''
                        });
                    }
                }
            }
        } catch (e) { console.error('[App] Erro ao aplicar tecnicos:', e); }
    },

    // =========================================================
    // CADASTROS (Vehicle & Client list)
    // =========================================================
    showCadastroTab(tab) {
        this.state.cadastroTab = tab;
        document.querySelectorAll('.cadastro-tab').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tab);
        });
        this.renderCadastroList();
    },

    renderCadastroList() {
        const container = document.getElementById('cadastro-list');
        if (!container) return;

        const search = (document.getElementById('cadastro-search')?.value || '').toLowerCase();
        const tab = this.state.cadastroTab;

        if (tab === 'veiculos') {
            const veiculos = this.state.veiculos
                .filter(v => {
                    if (v._semGPS) return false; // nao listar tecnicos fantasma na lista de veiculos
                    if (!search) return true;
                    return (v.placa || '').toLowerCase().includes(search) ||
                           (v.modelo || '').toLowerCase().includes(search) ||
                           (v.motorista || '').toLowerCase().includes(search);
                });

            container.innerHTML = veiculos.length === 0
                ? '<div style="padding:12px;text-align:center;color:var(--text-muted);font-size:12px;">Nenhum veiculo encontrado</div>'
                : veiculos.map(v => {
                    const tecnico = v._tecnico || v.motorista || '';
                    const primeiroNome = tecnico ? tecnico.split(/\s+/)[0] : '';
                    return `
                    <div class="cadastro-item${App._selectedPlaca === v.placa ? ' selected' : ''}" onclick="App.selectVehicle('${v.placa}')">
                        <div class="cadastro-item-icon ${Markers.isOficina(v.placa) ? 'oficina' : 'comercial'} ${v.ignicao ? 'on' : 'off'}">
                            <img src="${Utils.getVehicleIconUrl(v.modelo)}" alt="" style="width:100%;height:100%;object-fit:contain;"/>
                        </div>
                        <div class="cadastro-item-info">
                            <div class="cadastro-item-name">${primeiroNome || v.placa}</div>
                            <div class="cadastro-item-detail">${v.placa} | ${v.modelo || 'Veiculo'}${v.ano ? ' ' + v.ano : ''}</div>
                        </div>
                        <button class="cadastro-item-delete" onclick="event.stopPropagation(); App.deleteCadastroItem('veiculo','${v.placa}')" title="Excluir">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </button>
                    </div>
                    `;
                }).join('');
        } else {
            const clientes = this.state.clientes
                .filter(c => {
                    if (!search) return true;
                    return (c.nome || '').toLowerCase().includes(search) ||
                           (c.cidade || '').toLowerCase().includes(search);
                })
                .slice(0, 100); // Limit to 100 for performance

            container.innerHTML = clientes.length === 0
                ? '<div style="padding:12px;text-align:center;color:var(--text-muted);font-size:12px;">Nenhum cliente encontrado</div>'
                : clientes.map(c => `
                    <div class="cadastro-item" onclick="if(${c.lat && c.lng ? 'true' : 'false'}) { MapCore.map.setView([${c.lat},${c.lng}], 15); } Panels.open('${c.id}')">
                        <div class="cadastro-item-info">
                            <div class="cadastro-item-name">${Utils.truncate(c.nome, 30)}</div>
                            <div class="cadastro-item-detail">${c.cidade || ''} | ${c.equipamentos_count || 0} equip.</div>
                        </div>
                        <button class="cadastro-item-delete" onclick="event.stopPropagation(); App.deleteCadastroItem('cliente','${c.id}')" title="Excluir">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </button>
                    </div>
                `).join('');
        }
    },

    selectVehicle(placa) {
        // Toggle: if same vehicle clicked again, deselect
        if (this._selectedPlaca === placa) {
            this.clearVehicleSelection();
            return;
        }

        const v = this.state.veiculos.find(v => v.placa === placa);
        if (!v) return;

        this._selectedPlaca = placa;

        // Center map on vehicle
        if (v.lat && v.lng) {
            MapCore.map.setView([v.lat, v.lng], 13);
        }

        // Hide all other vehicle markers, keep only the selected one
        Markers.showOnlyVehicle(placa);

        // Highlight in cadastro list
        this.renderCadastroList();

        // Open vehicle detail panel (with KM data)
        VehiclePanel.open(placa);

        // Load route + stops with client detection
        Routes.loadRouteWithClients(placa, null, this.state.clientes);
    },

    clearVehicleSelection() {
        this._selectedPlaca = null;
        VehiclePanel.close();
        Routes.clearRoute();
        MapCore.rotasLayer.clearLayers();

        // Show all vehicle markers again
        Markers.showAllVehicles();

        this.renderCadastroList();
    },

    async deleteCadastroItem(type, id) {
        const label = type === 'veiculo' ? `veiculo ${id}` : `cliente ${id}`;
        if (!confirm(`Tem certeza que deseja excluir o ${label}?`)) return;

        try {
            let res;
            if (type === 'veiculo') {
                res = await fetch(`/api/veiculos/${id}`, { method: 'DELETE' });
            } else {
                res = await _originalFetch(`/api/mapa/clientes?id=${id}`, { method: 'DELETE' });
            }
            if (!res.ok) throw new Error('Erro ao excluir');

            Utils.toast(`${type === 'veiculo' ? 'Veiculo' : 'Cliente'} excluido!`, 'success');

            // Reload data
            if (type === 'veiculo') {
                await this.refreshVehicles();
            } else {
                await this.loadAllData();
            }
        } catch (e) {
            Utils.toast(`Erro ao excluir ${type}: ${e.message}`, 'error');
        }
    },

    // =========================================================
    // VIEW SWITCHING
    // =========================================================
    switchView(view) {
        this.state.currentView = view;

        // Update nav buttons
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === view);
        });

        // Toggle overlays
        document.getElementById('dashboard-overlay').classList.toggle('show', view === 'dashboard');
        document.getElementById('sync-overlay').classList.toggle('show', view === 'sync');
        document.getElementById('relatorio-overlay').classList.toggle('show', view === 'relatorio');

        if (view === 'dashboard') {
            Dashboard.load();
        }
        if (view === 'relatorio') {
            Relatorio.load();
        }
    },

    // Sidebar toggle
    toggleSidebar() {
        const sidebar = document.getElementById('sidebar');
        sidebar.classList.toggle('collapsed');
        // Invalidate map size after transition
        setTimeout(() => MapCore.map.invalidateSize(), 400);
    },

    // =========================================================
    // MAP EDIT MODE - Drag client markers to reposition
    // =========================================================
    toggleMapEditMode() {
        this.state.mapEditMode = !this.state.mapEditMode;
        const btn = document.getElementById('btn-map-edit');

        if (this.state.mapEditMode) {
            btn.classList.add('active');
            btn.innerHTML = '✓ Concluir Edicao';
            Markers.enableDragging();
            Utils.toast('Modo edicao ativo. Arraste os clientes para reposicionar.', 'info');
        } else {
            btn.classList.remove('active');
            btn.innerHTML = '✏️ Editar Posicoes';
            Markers.disableDragging();
            Utils.toast('Modo edicao desativado.', 'success');
        }
    },

    // =========================================================
    // GEOCODE PROGRESS POLLING
    // =========================================================
    _geocodePolling: null,
    startGeocodePolling() {
        const bar = document.getElementById('geocode-progress');
        const barFill = document.getElementById('geocode-progress-fill');
        const barText = document.getElementById('geocode-progress-text');
        if (!bar) return;
        bar.style.display = 'block';
        this._geocodePolling = setInterval(async () => {
            try {
                const p = await Utils.fetchJson('/api/sync/geocode/progress');
                if (!p || !p.running) return;
                const pct = p.total > 0 ? (p.processed / p.total * 100).toFixed(1) : 0;
                barFill.style.width = pct + '%';
                barText.textContent = `${p.processed}/${p.total} (${pct}%) - ${p.geocoded} novos, ${p.cached} cache, ${p.failed} falhas`;
            } catch (e) { /* ignore */ }
        }, 2000);
    },
    stopGeocodePolling() {
        if (this._geocodePolling) {
            clearInterval(this._geocodePolling);
            this._geocodePolling = null;
        }
        const bar = document.getElementById('geocode-progress');
        if (bar) bar.style.display = 'none';
    },

    // =========================================================
    // MONTHLY ROUTE SYNC
    // =========================================================
    _rotasMensalPolling: null,

    async syncRotasMensal() {
        Utils.toast('Verificando status do mes...', 'info');

        try {
            const now = new Date();
            now.setHours(now.getHours() - 3);
            const mes = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

            // Check status first
            const status = await Utils.fetchJson(`/api/sync/rotas-mensal/status?mes=${mes}`);

            if (status.completo) {
                Utils.toast('Rotas do mes ja estao sincronizadas!', 'success');
                const statusEl = document.getElementById('sync-rotas-mensal-status');
                if (statusEl) statusEl.textContent = `Completo (${status.dias_sincronizados} dias)`;
                return;
            }

            // Start sync
            Utils.toast(`Iniciando sync: ${status.dias_faltantes} dias faltantes...`, 'info');

            fetch(`/api/sync/rotas-mensal`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mes })
            });

            // Start polling progress
            this.startRotasMensalPolling();

        } catch (e) {
            Utils.toast('Erro ao verificar status: ' + e.message, 'error');
        }
    },

    startRotasMensalPolling() {
        const bar = document.getElementById('rotas-mensal-progress');
        const barFill = document.getElementById('rotas-mensal-progress-fill');
        const barText = document.getElementById('rotas-mensal-progress-text');
        if (!bar) return;
        bar.style.display = 'block';

        this._rotasMensalPolling = setInterval(async () => {
            try {
                const p = await Utils.fetchJson('/api/sync/rotas-mensal/progress');
                if (!p) return;

                if (!p.running) {
                    this.stopRotasMensalPolling();
                    if (p.processados > 0) {
                        Utils.toast(`Sync mensal concluido! ${p.baixados} dias baixados.`, 'success');
                        const statusEl = document.getElementById('sync-rotas-mensal-status');
                        if (statusEl) statusEl.textContent = `Concluido: ${p.baixados} baixados, ${p.pulados} ja existiam`;
                    }
                    return;
                }

                const pct = p.total > 0 ? (p.processados / p.total * 100).toFixed(1) : 0;
                barFill.style.width = pct + '%';
                barText.textContent = `${p.veiculo_atual} - Dia ${p.dia_atual} | ${p.processados}/${p.total} (${pct}%) | ${p.baixados} baixados, ${p.pulados} existentes`;
            } catch (e) { /* ignore */ }
        }, 2000);
    },

    stopRotasMensalPolling() {
        if (this._rotasMensalPolling) {
            clearInterval(this._rotasMensalPolling);
            this._rotasMensalPolling = null;
        }
        const bar = document.getElementById('rotas-mensal-progress');
        if (bar) setTimeout(() => { bar.style.display = 'none'; }, 5000);
    },

    // =========================================================
    // SYNC
    // =========================================================
    async sync(type) {
        const btn = event.target.closest('.sync-btn');
        if (btn) btn.classList.add('syncing');

        const log = document.getElementById('sync-log');
        log.innerHTML += `\n> Sincronizando ${type}...\n`;
        log.scrollTop = log.scrollHeight;

        Utils.toast(`Sincronizando ${type}...`, 'info');

        // Iniciar polling de progresso para geocode
        if (type === 'geocode') this.startGeocodePolling();

        try {
            let res, data;

            if (type === 'clientes') {
                // Sync Omie via endpoint local (Next.js) com geocoding
                res = await _originalFetch('/api/mapa/sync-omie', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ geocodificar: true, maxGeocode: 100 })
                });
                data = await res.json();
                log.innerHTML += `✅ Omie: ${data.sincronizados || 0} clientes, ${data.geocodificados || 0} geocodificados\n`;
                await this.loadAllData();
            } else if (type === 'geocode') {
                // Geocodificar via endpoint local (sem sync do Omie)
                res = await _originalFetch('/api/mapa/sync-omie', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ geocodificar: true, maxGeocode: 200 })
                });
                data = await res.json();
                log.innerHTML += `✅ Geocode: ${data.geocodificados || 0} enderecos geocodificados\n`;
                await this.loadAllData();
            } else {
                const url = type === 'all' ? '/api/sync/all' : `/api/sync/${type}`;
                res = await fetch(url);
                data = await res.json();
                log.innerHTML += `✅ ${type}: ${JSON.stringify(data).substring(0, 100)}\n`;
            }

            log.scrollTop = log.scrollHeight;

            if (type === 'all') {
                Utils.toast('Sync completo iniciado em background!', 'success');
            } else {
                Utils.toast(`${type} sincronizado!`, 'success');
                if (['processar', 'geocode'].includes(type)) {
                    await this.loadAllData();
                }
                if (type === 'rotaexata') {
                    await this.refreshVehicles();
                }
            }

            // Refresh sync status
            try {
                const status = await Utils.fetchJson('/api/sync-status');
                this.updateSyncStatus(status);
            } catch (e) { /* ok */ }

        } catch (e) {
            log.innerHTML += `❌ ${type}: ${e.message}\n`;
            Utils.toast(`Erro ao sincronizar ${type}`, 'error');
        }

        if (type === 'geocode') this.stopGeocodePolling();
        if (btn) btn.classList.remove('syncing');
    }
};

// =========================================================
// INIT ON DOM READY
// =========================================================
document.addEventListener('DOMContentLoaded', () => App.init());

// Close tools dropdown when clicking outside
document.addEventListener('click', (e) => {
    const menu = document.getElementById('map-tools-menu');
    const dd = document.getElementById('map-tools-dropdown');
    if (menu && dd && !menu.contains(e.target)) dd.classList.remove('open');
});
