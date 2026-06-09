// =========================================================
// PANELS - Client detail slide-in panel
// =========================================================

const Panels = {
    currentClientId: null,

    open(clienteId) {
        this.currentClientId = clienteId;

        // Fechar painel do veiculo se estiver aberto
        try { if (VehiclePanel.currentPlaca) App.clearVehicleSelection(); } catch(e) {}

        const panel = document.getElementById('detail-panel');
        if (!panel) return;

        const header = document.getElementById('panel-header');
        const body = document.getElementById('panel-body');

        // 1) Abre o painel imediatamente
        panel.classList.add('open');

        // 2) Busca no state local (instantaneo)
        const local = (App.state.clientes || []).find(cl => String(cl.id) === String(clienteId));
        if (local) {
            this._currentClient = local;
            this.renderPanel(local);
        } else {
            header.innerHTML = '<div style="padding:20px;color:var(--text-muted)"><div class="spinner"></div> Carregando...</div>';
            body.innerHTML = '';
        }

        // 3) Tenta buscar dados completos da API (em background, sem bloquear)
        fetch('/api/mapa/clientes?id=' + clienteId)
            .then(r => r.ok ? r.json() : null)
            .then(c => {
                if (c && !c.error && this.currentClientId === clienteId) {
                    this._currentClient = c;
                    this.renderPanel(c);
                }
            })
            .catch(() => {
                // Se a API falhou e nao tinha dados locais, mostra erro
                if (!local && this.currentClientId === clienteId) {
                    header.innerHTML = '<div style="padding:20px;color:var(--accent-red)">Cliente nao encontrado</div>';
                }
            });
    },

    close() {
        document.getElementById('detail-panel').classList.remove('open');
        this.currentClientId = null;
        this._currentClient = null;
    },

    renderPanel(c) {
        const header = document.getElementById('panel-header');
        const body = document.getElementById('panel-body');

        const diasVisita = Utils.diasDesde(c.ultima_visita);
        const visitaLabel = c.ultima_visita
            ? `${diasVisita}d atras (${Utils.formatDate(c.ultima_visita)})`
            : 'Nunca visitado';
        const visitaColor = diasVisita <= 30 ? 'var(--accent-green)' : diasVisita <= 90 ? 'var(--accent-yellow)' : 'var(--accent-red)';

        const nome = c.nome || c.nome_fantasia || c.razao_social || 'Cliente';
        header.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:flex-start">
                <div class="panel-client-name">${nome}</div>
                <button class="panel-edit-btn" onclick="CrudModal.openClient('${c.id}')">Editar</button>
            </div>
            <div style="font-size:12px;color:var(--text-muted);margin-top:2px">${c.razao_social || ''}</div>
            <div class="panel-client-info">
                <span>${c.cidade || ''} ${c.estado ? '- ' + c.estado : ''}</span>
                <span>${c.cnpj_cpf || ''}</span>
            </div>
            <div class="panel-client-info">
                <span>${c.telefone || '-'}</span>
                <span>${c.email || '-'}</span>
            </div>
            <div class="panel-client-info">
                <span>${c.endereco || ''}</span>
            </div>
            <div class="panel-client-info">
                <span style="color:${visitaColor}">${visitaLabel}</span>
            </div>
        `;

        body.innerHTML = '';

        // Coordenadas e posicao no mapa
        const lat = c.lat || '';
        const lng = c.lng || '';
        const hasCoords = lat && lng;
        body.innerHTML += `
            <div class="panel-section">
                <div class="panel-section-title">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                    Localizacao no Mapa
                </div>
                <div class="panel-coords-row">
                    <div class="panel-coord-field">
                        <label>Latitude</label>
                        <input type="text" id="panel-lat" class="sb-input" value="${lat}" placeholder="-23.1234" style="font-size:12px">
                    </div>
                    <div class="panel-coord-field">
                        <label>Longitude</label>
                        <input type="text" id="panel-lng" class="sb-input" value="${lng}" placeholder="-49.1234" style="font-size:12px">
                    </div>
                </div>
                <div style="display:flex;gap:8px;margin-top:8px">
                    <button class="vp-btn primary" onclick="Panels.saveCoords()" style="flex:1">Salvar posicao</button>
                    ${hasCoords ? `<button class="vp-btn" onclick="Panels.flyToClient()" style="flex:0 0 auto">Ver no mapa</button>` : ''}
                </div>
                <div style="display:flex;gap:8px;margin-top:6px">
                    <button class="vp-btn" onclick="Panels.copyFromNearestVehicle()" style="flex:1;font-size:10px">Copiar posicao do veiculo mais proximo</button>
                </div>
                ${!hasCoords ? '<div style="font-size:11px;color:var(--accent-red);margin-top:6px">Cliente sem coordenadas - defina a posicao manualmente</div>' : ''}
            </div>
        `;
    },

    async saveCoords() {
        if (!this.currentClientId) return;
        const lat = parseFloat(document.getElementById('panel-lat').value);
        const lng = parseFloat(document.getElementById('panel-lng').value);

        if (isNaN(lat) || isNaN(lng)) {
            Utils.toast('Coordenadas invalidas', 'error');
            return;
        }

        try {
            const resp = await fetch('/api/mapa/clientes', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: this.currentClientId, lat, lng })
            });
            if (!resp.ok) throw new Error('Erro ao salvar');

            // Update local state
            const stateClient = App.state.clientes.find(c => String(c.id) === String(this.currentClientId));
            if (stateClient) {
                stateClient.lat = lat;
                stateClient.lng = lng;
            }
            if (this._currentClient) {
                this._currentClient.lat = lat;
                this._currentClient.lng = lng;
            }

            // Re-render markers
            const filtered = Markers.filterClients(App.state.clientes);
            Markers.renderClients(filtered);

            Utils.toast('Posicao salva!', 'success');

            // Fly to new position
            MapCore.map.setView([lat, lng], 14);
        } catch (e) {
            Utils.toast('Erro ao salvar posicao: ' + e.message, 'error');
        }
    },

    flyToClient() {
        const lat = parseFloat(document.getElementById('panel-lat').value);
        const lng = parseFloat(document.getElementById('panel-lng').value);
        if (!isNaN(lat) && !isNaN(lng)) {
            MapCore.map.setView([lat, lng], 15);
        }
    },

    copyFromNearestVehicle() {
        const veiculos = (App.state.veiculos || []).filter(v => v.lat && v.lng);
        if (veiculos.length === 0) {
            Utils.toast('Nenhum veiculo com posicao disponivel', 'error');
            return;
        }

        // Find nearest vehicle (or first stopped one)
        const stopped = veiculos.filter(v => !v.ignicao);
        const source = stopped.length > 0 ? stopped : veiculos;

        // If client has coords, find nearest; otherwise use first stopped
        const c = this._currentClient;
        let best = source[0];
        if (c && c.lat && c.lng) {
            let minDist = Infinity;
            for (const v of source) {
                const d = Utils.calcularDistancia(c.lat, c.lng, v.lat, v.lng);
                if (d < minDist) { minDist = d; best = v; }
            }
        }

        document.getElementById('panel-lat').value = best.lat;
        document.getElementById('panel-lng').value = best.lng;
        Utils.toast(`Coordenadas copiadas do veiculo ${best.placa}`, 'info');
    },

    /* ── Equipamentos, Feedbacks, etc (desativados — descomentar se precisar) ──
    _currentEquips: [],
    _editingEquipId: null,
    _equipTipos: null,

    async _ensureEquipTipos() { ... },
    async openEquipModal(equipId = null) { ... },
    async saveEquipamento() { ... },
    async deleteEquipamento(equipId) { ... },
    async addFeedback() { ... },
    async deleteFeedback(id) { ... },
    */
};
