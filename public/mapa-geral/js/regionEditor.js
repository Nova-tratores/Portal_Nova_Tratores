// =========================================================
// REGION EDITOR - Edicao de regioes diretamente no mapa
// =========================================================
const RegionEditor = {
    _regionPolygonMap: new Map(), // id -> { polygon: L.polygon, data: regionObj }
    _editingRegionId: null,
    _pendingLayer: null, // layer recem-desenhada aguardando salvar
    _contadores: new Map(), // id da regiao -> { clientes, equipamentos_total, por_tipo }
    _tipoLabels: {},        // tipo -> label legivel (carregado do /api/equipamento-tipos)

    init() {
        if (!MapCore.map || !MapCore.map.pm) return;

        // Toolbar do Geoman: SO desenhar novo poligono.
        // EditMode global iria adicionar handles em todos os ~180 poligonos com 34k+ pontos
        // somados, travando o navegador. Edicao de vertices fica disponivel via popup
        // do poligono individual (ver _enableVertexEditFor).
        MapCore.map.pm.addControls({
            position: 'topright',
            drawPolygon: true,
            drawMarker: false,
            drawCircleMarker: false,
            drawCircle: false,
            drawPolyline: false,
            drawRectangle: false,
            drawText: false,
            cutPolygon: false,
            rotateMode: false,
            editMode: false,
            dragMode: false,
            removalMode: false
        });

        // Esconder toolbar por padrao (so mostra quando layer ativa)
        this._setToolbarVisible(false);

        // Evento: novo poligono desenhado
        MapCore.map.on('pm:create', (e) => {
            if (e.shape !== 'Polygon') return;
            this._pendingLayer = e.layer;
            // Remover do mapa temporariamente ate salvar
            MapCore.map.removeLayer(e.layer);
            this.openModal(null, true);
        });
    },

    // Edita vertices de um unico poligono. Chamado pelo botao no popup.
    _enableVertexEditFor(regionId) {
        const entry = this._regionPolygonMap.get(regionId);
        if (!entry) return;
        const poly = entry.polygon;
        // Habilita pm so neste poligono
        poly.options.pmIgnore = false;
        if (poly.pm) {
            poly.pm.enable({ allowSelfIntersection: false, snappable: true });
            // Quando o usuario clicar fora ou apertar Esc (pm:disable), salvar
            poly.once('pm:disable', () => {
                const newCoords = poly.getLatLngs()[0].map(ll => [ll.lat, ll.lng]);
                if (JSON.stringify(newCoords) !== JSON.stringify(entry.data.coords)) {
                    entry.data.coords = newCoords;
                    this._apiUpdate(regionId, { coords: newCoords });
                    Utils.toast('Vertices salvos', 'success');
                }
                poly.options.pmIgnore = true;
            });
            Utils.toast('Arraste os vertices. Clique fora para salvar.', 'info');
            MapCore.map.closePopup();
        }
    },

    _setToolbarVisible(visible) {
        const toolbar = document.querySelector('.leaflet-pm-toolbar');
        if (toolbar) toolbar.style.display = visible ? '' : 'none';
    },

    // Chamado pelo toggle de layer
    onLayerToggle(active) {
        this._setToolbarVisible(active);
    },

    // ---- RENDERIZAR REGIOES NO MAPA ----
    renderRegionsOnMap(regioes) {
        if (!MapCore.regioesLayer) return;
        MapCore.regioesLayer.clearLayers();
        this._regionPolygonMap.clear();

        for (const reg of regioes) {
            this._addRegionToMap(reg);
        }
        // Carrega contadores e labels de tipo em background (nao bloqueia a renderizacao)
        this._refreshContadores();
        if (Object.keys(this._tipoLabels).length === 0) this._loadTipoLabels();
    },

    async _loadTipoLabels() {
        try {
            const r = await fetch('/api/equipamento-tipos');
            const data = await r.json();
            this._tipoLabels = {};
            [...(data.builtin || []), ...(data.custom || [])].forEach(t => {
                this._tipoLabels[t.tipo] = t.label;
            });
        } catch (e) { /* ignore */ }
    },

    async _refreshContadores() {
        try {
            const r = await fetch('/api/regioes/contadores');
            const list = await r.json();
            this._contadores.clear();
            list.forEach(c => this._contadores.set(c.id, c));
        } catch (e) { /* ignore */ }
    },

    _formatContadores(regionId) {
        const c = this._contadores.get(regionId);
        if (!c) return '';
        if (c.clientes === 0) return '<div style="font-size:11px;color:var(--text-muted);margin-top:6px">Sem clientes nesta regiao</div>';
        const linhas = Object.entries(c.por_tipo)
            .sort((a, b) => b[1] - a[1])
            .map(([t, n]) => `${this._tipoLabels[t] || t}: ${n}`);
        return `
            <div style="margin-top:8px;padding:6px 8px;background:rgba(59,130,246,0.08);border-radius:6px;font-size:12px">
                <div style="font-weight:600;margin-bottom:4px">${c.clientes} cliente${c.clientes !== 1 ? 's' : ''} | ${c.equipamentos_total} equipamento${c.equipamentos_total !== 1 ? 's' : ''}</div>
                <div style="color:var(--text-muted);font-size:11px;line-height:1.5">${linhas.join(' &middot; ')}</div>
            </div>
        `;
    },

    _addRegionToMap(reg) {
        if (!reg.id) return;
        let polygon;

        const polyOpts = {
            color: reg.color || '#3b82f6',
            weight: 2, opacity: 0.7, fillOpacity: 0.15,
            smoothFactor: 3,
            interactive: true,
            pmIgnore: true   // Geoman ignora; edicao de vertices via popup individual
        };
        if (reg.multiPolygon && Array.isArray(reg.coords[0]) && Array.isArray(reg.coords[0][0])) {
            const polygons = reg.coords.map(ring =>
                ring.map(c => Array.isArray(c) ? c : [c.lat, c.lng])
            );
            polygon = L.polygon(polygons, polyOpts);
        } else {
            const latlngs = (reg.coords || []).map(c =>
                Array.isArray(c) ? c : [c.lat, c.lng]
            );
            if (latlngs.length < 3) return;
            polygon = L.polygon(latlngs, polyOpts);
        }

        // Popup com botoes de acao + contadores ao vivo
        polygon.bindPopup(() => {
            const div = document.createElement('div');
            div.style.minWidth = '200px';
            const descHtml = reg.description
                ? '<small style="color:var(--text-muted);white-space:pre-line;display:block;margin-top:4px">' +
                  reg.description.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') +
                  '</small>'
                : '';
            div.innerHTML = `
                <b>${reg.nome}</b>
                ${descHtml}
                ${this._formatContadores(reg.id)}
                <hr style="margin:8px 0;border-color:rgba(255,255,255,0.1)">
                <div style="display:flex;gap:6px;flex-wrap:wrap">
                    <button class="region-popup-btn edit" onclick="RegionEditor.openModal('${reg.id}')">Editar</button>
                    <button class="region-popup-btn" onclick="RegionEditor._enableVertexEditFor('${reg.id}')">Vertices</button>
                    <button class="region-popup-btn danger" onclick="RegionEditor.deleteRegion('${reg.id}')">Excluir</button>
                </div>
            `;
            return div;
        });

        polygon.addTo(MapCore.regioesLayer);
        this._regionPolygonMap.set(reg.id, { polygon, data: reg });
    },

    // ---- MODAL DE PROPRIEDADES ----
    openModal(regionId, isNew = false) {
        const modal = document.getElementById('region-modal');
        const title = document.getElementById('region-modal-title');
        const body = document.getElementById('region-modal-body');
        const footer = document.getElementById('region-modal-footer');

        this._editingRegionId = regionId;
        const reg = regionId ? this._regionPolygonMap.get(regionId)?.data : {};

        title.textContent = isNew ? 'Nova Regiao' : 'Editar Regiao';

        body.innerHTML = `
            <div class="crud-form-group">
                <label>Nome *</label>
                <input type="text" id="region-nome" class="crud-input" value="${reg?.nome || ''}" placeholder="Nome da regiao">
            </div>
            <div class="crud-form-group">
                <label>Cor</label>
                <div style="display:flex;align-items:center;gap:10px">
                    <input type="color" id="region-color" value="${reg?.color || '#3b82f6'}" style="width:50px;height:36px;border:none;background:none;cursor:pointer">
                    <span id="region-color-label" style="font-size:13px;color:var(--text-muted)">${reg?.color || '#3b82f6'}</span>
                </div>
            </div>
            <div class="crud-form-group">
                <label>Descricao</label>
                <textarea id="region-desc" class="crud-input" rows="3" placeholder="Descricao opcional">${reg?.description || ''}</textarea>
            </div>
        `;

        // Atualizar label da cor em tempo real
        const colorInput = document.getElementById('region-color');
        colorInput.addEventListener('input', () => {
            document.getElementById('region-color-label').textContent = colorInput.value;
        });

        footer.innerHTML = `
            <button class="crud-btn-cancel" onclick="RegionEditor.closeModal(true)">Cancelar</button>
            <button class="crud-btn-save" onclick="RegionEditor.saveModal(${isNew})">${isNew ? 'Criar' : 'Salvar'}</button>
        `;

        modal.style.display = 'flex';
    },

    closeModal(cancelled = false) {
        document.getElementById('region-modal').style.display = 'none';
        // Se cancelou criacao, descartar layer pendente
        if (cancelled && this._pendingLayer) {
            this._pendingLayer = null;
        }
        this._editingRegionId = null;
    },

    async saveModal(isNew) {
        const nome = document.getElementById('region-nome').value.trim();
        if (!nome) return Utils.toast('Nome obrigatorio', 'error');
        const color = document.getElementById('region-color').value;
        const description = document.getElementById('region-desc').value.trim();

        if (isNew && this._pendingLayer) {
            // Criar nova regiao
            const latlngs = this._pendingLayer.getLatLngs()[0];
            const coords = latlngs.map(ll => [ll.lat, ll.lng]);
            try {
                const resp = await fetch('/api/regioes/single', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ nome, coords, color, description })
                });
                const data = await resp.json();
                if (data.ok) {
                    this._addRegionToMap(data.regiao);
                    Utils.toast('Regiao criada', 'success');
                } else {
                    Utils.toast('Erro: ' + (data.error || ''), 'error');
                }
            } catch (e) {
                Utils.toast('Erro ao salvar regiao', 'error');
            }
            this._pendingLayer = null;
        } else if (this._editingRegionId) {
            // Atualizar regiao existente
            try {
                const resp = await fetch(`/api/regioes/${this._editingRegionId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ nome, color, description })
                });
                const data = await resp.json();
                if (data.ok) {
                    const entry = this._regionPolygonMap.get(this._editingRegionId);
                    if (entry) {
                        entry.data.nome = nome;
                        entry.data.color = color;
                        entry.data.description = description;
                        entry.polygon.setStyle({ color });
                        // Atualizar popup
                        entry.polygon.closePopup();
                    }
                    Utils.toast('Regiao atualizada', 'success');
                }
            } catch (e) {
                Utils.toast('Erro ao atualizar regiao', 'error');
            }
        }

        this.closeModal();
    },

    async deleteRegion(regionId) {
        if (!confirm('Excluir esta regiao?')) return;
        try {
            const resp = await fetch(`/api/regioes/${regionId}`, { method: 'DELETE' });
            const data = await resp.json();
            if (data.ok) {
                const entry = this._regionPolygonMap.get(regionId);
                if (entry) {
                    MapCore.regioesLayer.removeLayer(entry.polygon);
                    this._regionPolygonMap.delete(regionId);
                }
                // Fechar popup se aberto
                MapCore.map.closePopup();
                Utils.toast('Regiao excluida', 'success');
            }
        } catch (e) {
            Utils.toast('Erro ao excluir regiao', 'error');
        }
    },

    // ---- API helpers ----
    async _apiUpdate(id, data) {
        try {
            await fetch(`/api/regioes/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
        } catch (e) {
            console.error('Erro ao atualizar regiao:', e);
        }
    }
};
