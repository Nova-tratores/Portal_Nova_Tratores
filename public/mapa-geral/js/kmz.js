// =========================================================
// KMZ IMPORT / EXPORT
// =========================================================

const KmzManager = {
    _locations: [],
    _regions: [],
    MATCH_RADIUS_KM: 0.5,

    // Paleta de cores para regioes sem estilo definido
    _colorPalette: [
        '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6',
        '#ec4899', '#06b6d4', '#f97316', '#6366f1', '#14b8a6',
        '#e11d48', '#84cc16', '#0ea5e9', '#a855f7', '#d946ef'
    ],

    // ---- IMPORT ----
    importFile() {
        if (typeof JSZip === 'undefined') {
            Utils.toast('Biblioteca JSZip nao carregou. Verifique sua conexao.', 'error');
            return;
        }

        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.kmz,.kml';
        input.style.display = 'none';

        input.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            this._processFile(file);
        });

        document.body.appendChild(input);
        input.click();
        document.body.removeChild(input);
    },

    async _processFile(file) {
        this._openModal();
        this._setLoading(true);

        try {
            let kmlText;
            const ext = file.name.split('.').pop().toLowerCase();

            if (ext === 'kmz') {
                const arrayBuffer = await file.arrayBuffer();
                const zip = await JSZip.loadAsync(arrayBuffer);
                const kmlFile = Object.keys(zip.files).find(name => name.toLowerCase().endsWith('.kml'));
                if (!kmlFile) {
                    Utils.toast('Nenhum arquivo KML encontrado no KMZ', 'error');
                    this.closeModal();
                    return;
                }
                kmlText = await zip.files[kmlFile].async('string');
            } else {
                kmlText = await file.text();
            }

            const parser = new DOMParser();
            const doc = parser.parseFromString(kmlText, 'text/xml');

            if (doc.querySelector('parsererror')) {
                Utils.toast('Erro ao processar KML: XML invalido', 'error');
                this.closeModal();
                return;
            }

            // Extrair estilos do KML
            const styles = this._parseStyles(doc);

            const placemarks = doc.querySelectorAll('Placemark');
            const locations = [];
            const regions = [];
            let colorIdx = 0;

            placemarks.forEach((pm, i) => {
                const nameEl = pm.querySelector('name');
                const descEl = pm.querySelector('description');
                const nome = nameEl ? nameEl.textContent.trim() : '';
                const description = descEl ? descEl.textContent.trim().replace(/<[^>]*>/g, '') : '';

                // Verificar se tem Polygon
                const polygonEl = pm.querySelector('Polygon');
                if (polygonEl) {
                    const coords = this._parsePolygonCoords(polygonEl);
                    if (coords.length >= 3) {
                        // Extrair cor do estilo
                        let color = null;
                        const styleUrl = pm.querySelector('styleUrl');
                        if (styleUrl) {
                            const styleId = styleUrl.textContent.trim().replace('#', '');
                            color = styles[styleId] || null;
                        }
                        // Estilo inline
                        const inlineStyle = pm.querySelector('Style');
                        if (inlineStyle && !color) {
                            color = this._extractColorFromStyle(inlineStyle);
                        }
                        if (!color) {
                            color = this._colorPalette[colorIdx % this._colorPalette.length];
                            colorIdx++;
                        }

                        regions.push({
                            index: i,
                            nome: nome || `Regiao ${regions.length + 1}`,
                            coords,
                            color,
                            description,
                            selected: true
                        });
                    }
                    return;
                }

                // Verificar se tem MultiGeometry com Polygon
                const multiGeo = pm.querySelector('MultiGeometry');
                if (multiGeo) {
                    const polys = multiGeo.querySelectorAll('Polygon');
                    if (polys.length > 0) {
                        let color = null;
                        const styleUrl = pm.querySelector('styleUrl');
                        if (styleUrl) {
                            const styleId = styleUrl.textContent.trim().replace('#', '');
                            color = styles[styleId] || null;
                        }
                        const inlineStyle = pm.querySelector('Style');
                        if (inlineStyle && !color) {
                            color = this._extractColorFromStyle(inlineStyle);
                        }
                        if (!color) {
                            color = this._colorPalette[colorIdx % this._colorPalette.length];
                            colorIdx++;
                        }

                        const allCoords = [];
                        polys.forEach(poly => {
                            const coords = this._parsePolygonCoords(poly);
                            if (coords.length >= 3) allCoords.push(coords);
                        });

                        if (allCoords.length > 0) {
                            regions.push({
                                index: i,
                                nome: nome || `Regiao ${regions.length + 1}`,
                                coords: allCoords.length === 1 ? allCoords[0] : allCoords,
                                multiPolygon: allCoords.length > 1,
                                color,
                                description,
                                selected: true
                            });
                        }
                        return;
                    }
                }

                // Verificar se tem Point
                const coordsEl = pm.querySelector('Point coordinates');
                if (coordsEl) {
                    const coordsText = coordsEl.textContent.trim();
                    const parts = coordsText.split(',');
                    if (parts.length >= 2) {
                        const lng = parseFloat(parts[0]);
                        const lat = parseFloat(parts[1]);
                        if (!isNaN(lat) && !isNaN(lng)) {
                            locations.push({
                                index: i,
                                nome: nome || `Local ${locations.length + 1}`,
                                lat, lng, description,
                                selected: true,
                                match: null, matchType: null, action: 'new'
                            });
                        }
                    }
                }
            });

            if (locations.length === 0 && regions.length === 0) {
                Utils.toast('Nenhum local ou regiao encontrado no arquivo', 'error');
                this.closeModal();
                return;
            }

            // Correlacionar pontos com clientes existentes
            if (locations.length > 0) this._matchExisting(locations);

            this._locations = locations;
            this._regions = regions;
            this._renderImportModal();
        } catch (err) {
            console.error('Erro KMZ:', err);
            Utils.toast('Arquivo KMZ invalido ou corrompido', 'error');
            this.closeModal();
        }
    },

    _parseStyles(doc) {
        const styles = {};
        doc.querySelectorAll('Style').forEach(s => {
            const id = s.getAttribute('id');
            if (!id) return;
            const color = this._extractColorFromStyle(s);
            if (color) styles[id] = color;
        });
        // StyleMap -> pega o normal
        doc.querySelectorAll('StyleMap').forEach(sm => {
            const id = sm.getAttribute('id');
            if (!id) return;
            const pairs = sm.querySelectorAll('Pair');
            pairs.forEach(pair => {
                const key = pair.querySelector('key');
                if (key && key.textContent.trim() === 'normal') {
                    const url = pair.querySelector('styleUrl');
                    if (url) {
                        const refId = url.textContent.trim().replace('#', '');
                        if (styles[refId]) styles[id] = styles[refId];
                    }
                    const inlineStyle = pair.querySelector('Style');
                    if (inlineStyle) {
                        const color = this._extractColorFromStyle(inlineStyle);
                        if (color) styles[id] = color;
                    }
                }
            });
        });
        return styles;
    },

    _extractColorFromStyle(styleEl) {
        // KML colors are in aabbggrr format (alpha, blue, green, red)
        const polyStyle = styleEl.querySelector('PolyStyle color') || styleEl.querySelector('LineStyle color');
        if (!polyStyle) return null;
        const kmlColor = polyStyle.textContent.trim();
        if (kmlColor.length < 8) return null;
        const r = kmlColor.substring(6, 8);
        const g = kmlColor.substring(4, 6);
        const b = kmlColor.substring(2, 4);
        return `#${r}${g}${b}`;
    },

    _parsePolygonCoords(polygonEl) {
        const coordsEl = polygonEl.querySelector('outerBoundaryIs LinearRing coordinates')
            || polygonEl.querySelector('LinearRing coordinates')
            || polygonEl.querySelector('coordinates');
        if (!coordsEl) return [];

        const text = coordsEl.textContent.trim();
        const points = text.split(/\s+/).filter(s => s.includes(','));
        const coords = [];

        for (const point of points) {
            const [lng, lat] = point.split(',').map(Number);
            if (!isNaN(lat) && !isNaN(lng)) {
                coords.push([lat, lng]);
            }
        }
        return coords;
    },

    // Gera ate 3 sugestoes de cliente Omie por similaridade de nome.
    // Coordenada nao e exigida (clientes Omie podem ter lat/lng null).
    _matchExisting(locations) {
        const clientes = App.state.clientes || [];
        if (clientes.length === 0) return;

        const omie = clientes.filter(c => c.codigo_omie);
        locations.forEach(loc => {
            const locNorm = this._normalizeName(loc.nome);
            if (!locNorm) { loc.suggestions = []; loc.action = 'manual'; return; }

            const ranked = [];
            for (const c of omie) {
                const nomeN = this._normalizeName(c.nome);
                const razaoN = this._normalizeName(c.razao_social || '');
                let score = 0;
                if (nomeN === locNorm || razaoN === locNorm) score = 100;
                else if (nomeN.startsWith(locNorm) || razaoN.startsWith(locNorm)) score = 80;
                else if (nomeN.includes(locNorm) || razaoN.includes(locNorm)) score = 60;
                else if (locNorm.length >= 5 && (nomeN.includes(locNorm.slice(0, 6)) || razaoN.includes(locNorm.slice(0, 6)))) score = 40;
                if (score > 0) ranked.push({ c, score });
            }
            ranked.sort((a, b) => b.score - a.score || a.c.nome.length - b.c.nome.length);
            const top = ranked.slice(0, 3).map(({ c, score }) => ({ ...c, _score: score }));
            loc.suggestions = top;

            // Auto-seleciona top se score >= 80 (match forte)
            if (top.length > 0 && top[0]._score >= 80) {
                loc.match = top[0];
                loc.matchType = top[0]._score === 100 ? 'exact' : 'name';
                loc.action = 'link';
                loc.copyFields = { lat_lng: true, nome: false, endereco: false };
                loc.selected = true;
            } else {
                loc.match = null;
                loc.action = 'manual'; // padrao quando nao casa: cria como manual
                loc.selected = true;
            }
        });
    },

    _normalizeName(name) {
        if (!name) return '';
        return name.toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]/g, '').trim();
    },

    // ---- MODAL ----
    _openModal() {
        document.getElementById('kmz-modal').style.display = 'flex';
    },

    closeModal() {
        document.getElementById('kmz-modal').style.display = 'none';
        this._locations = [];
        this._regions = [];
    },

    _setLoading(show) {
        if (show) {
            document.getElementById('kmz-modal-title').textContent = 'Importar KMZ';
            document.getElementById('kmz-modal-body').innerHTML = '<div class="kmz-loading"><div class="spinner"></div> Processando arquivo...</div>';
            document.getElementById('kmz-modal-footer').innerHTML = '';
        }
    },

    _renderImportModal() {
        const body = document.getElementById('kmz-modal-body');
        const title = document.getElementById('kmz-modal-title');
        const locs = this._locations;
        const regs = this._regions;

        const totalItems = locs.length + regs.length;
        title.textContent = `Importar KMZ - ${totalItems} itens encontrados`;

        let html = '';

        // ---- SECAO REGIOES ----
        if (regs.length > 0) {
            html += `
                <div class="kmz-section-header">
                    <span class="kmz-badge region">🗺️ ${regs.length} regiao${regs.length > 1 ? 'es' : ''}</span>
                    <label class="kmz-select-all-inline">
                        <input type="checkbox" id="kmz-select-all-regions" checked onchange="KmzManager._toggleAllRegions(this.checked)">
                        Todas
                    </label>
                </div>
                <div class="kmz-location-list" style="max-height:${locs.length > 0 ? '200px' : '400px'}">
            `;

            regs.forEach((reg, i) => {
                html += `
                    <div class="kmz-location-item">
                        <input type="checkbox" data-reg-idx="${i}" ${reg.selected ? 'checked' : ''} onchange="KmzManager._toggleRegion(${i}, this.checked)">
                        <span class="kmz-color-dot" style="background:${reg.color}"></span>
                        <div class="kmz-location-info">
                            <div class="kmz-location-name">${this._escapeHtml(reg.nome)}</div>
                            <div class="kmz-location-coords">${reg.multiPolygon ? 'Multi-poligono' : `${(reg.coords || []).length} pontos`}${reg.description ? ' — ' + this._escapeHtml(reg.description).substring(0, 40) : ''}</div>
                        </div>
                    </div>
                `;
            });
            html += '</div>';
        }

        // ---- SECAO LOCALIZACOES ----
        if (locs.length > 0) {
            const newCount = locs.filter(l => !l.match).length;
            const matchCount = locs.filter(l => l.match).length;

            html += `
                <div class="kmz-section-header" style="${regs.length > 0 ? 'margin-top:12px;' : ''}">
                    <span class="kmz-badge new">📍 ${locs.length} localizacao${locs.length > 1 ? 'es' : ''}</span>
                    ${matchCount > 0 ? `<span class="kmz-badge match">${matchCount} correlacionados</span>` : ''}
                    <label class="kmz-select-all-inline">
                        <input type="checkbox" id="kmz-select-all-locs" ${locs.every(l => l.selected) ? 'checked' : ''} onchange="KmzManager._toggleAll(this.checked)">
                        Todas
                    </label>
                </div>
                <div class="kmz-location-list" style="max-height:${regs.length > 0 ? '200px' : '400px'}">
            `;

            // Ordena: nao vinculados (manual/skip) primeiro, depois com match Omie
            const sorted = [...locs.map((l, i) => ({ ...l, _i: i }))].sort((a, b) => {
                const aHas = !!a.match, bHas = !!b.match;
                if (aHas !== bHas) return aHas ? 1 : -1;
                return 0;
            });

            sorted.forEach(loc => {
                const i = loc._i;
                html += this._renderLocationCard(this._locations[i], i);
            });
            html += '</div>';
        }

        body.innerHTML = html;
        this._renderFooter();
    },

    // Renderiza 1 card de localizacao com: sugestoes, busca, acao, campos a copiar
    _renderLocationCard(loc, i) {
        const hasMatch = !!loc.match;
        const action = loc.action || 'manual';
        const copyFields = loc.copyFields || { lat_lng: true, nome: false, endereco: false };
        const matchedBlock = hasMatch ? this._renderMatchedBlock(loc, i) : '';
        const suggestionsBlock = (!hasMatch && (loc.suggestions || []).length > 0) ? this._renderSuggestions(loc, i) : '';

        // Mensagem para nao vinculado
        const notLinkedHint = (!hasMatch && (loc.suggestions || []).length === 0)
            ? '<div class="kmz-match-label" style="color:var(--text-muted);font-size:11px;margin-top:4px">Sem sugestao automatica</div>'
            : '';

        return `
            <div class="kmz-location-item ${hasMatch ? 'has-match' : ''}" data-loc-idx="${i}">
                <input type="checkbox" data-idx="${i}" ${loc.selected ? 'checked' : ''} onchange="KmzManager._toggleItem(${i}, this.checked)">
                <div class="kmz-location-info" style="flex:1">
                    <div class="kmz-location-name">${this._escapeHtml(loc.nome)}</div>
                    <div class="kmz-location-coords">${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}${loc.description ? ' — ' + this._escapeHtml(loc.description).substring(0, 50) : ''}</div>
                    ${matchedBlock}
                    ${suggestionsBlock}
                    ${notLinkedHint}
                    <div style="margin-top:6px;display:flex;gap:6px;align-items:center;flex-wrap:wrap">
                        <select class="kmz-action-select" data-idx="${i}" onchange="KmzManager._setAction(${i}, this.value)" style="font-size:11px">
                            ${hasMatch ? `<option value="link" ${action === 'link' ? 'selected' : ''}>Vincular ao Omie</option>` : ''}
                            <option value="manual" ${action === 'manual' ? 'selected' : ''}>Criar como manual</option>
                            <option value="skip" ${action === 'skip' ? 'selected' : ''}>Pular</option>
                        </select>
                        <button class="kmz-search-btn" onclick="KmzManager._openSearch(${i})" title="Buscar outro cliente Omie">🔍 Buscar Omie</button>
                    </div>
                    <div id="kmz-search-results-${i}" class="kmz-search-results" style="display:none"></div>
                </div>
            </div>
        `;
    },

    _renderMatchedBlock(loc, i) {
        const c = loc.match;
        const cf = loc.copyFields || { lat_lng: true, nome: false, endereco: false };
        const tag = loc.matchType === 'exact' ? 'Nome identico' : 'Nome similar';
        const stats = `${c.equipamentos_count || 0} eq | ${c.total_os_count || 0} OS | ${c.total_pv_count || 0} PV`;
        return `
            <div class="kmz-match-card">
                <div style="font-size:11px;color:var(--accent-green);margin-bottom:3px">${tag} - vinculado a Omie:</div>
                <div style="font-size:12px;font-weight:600">${this._escapeHtml(c.nome)}</div>
                <div style="font-size:11px;color:var(--text-muted)">${this._escapeHtml(c.cnpj_cpf || '')} | ${this._escapeHtml(c.cidade || '')} - ${this._escapeHtml(c.estado || '')} | ${stats}</div>
                <div style="margin-top:6px;display:flex;gap:10px;flex-wrap:wrap;font-size:11px">
                    <label style="display:flex;align-items:center;gap:4px">
                        <input type="checkbox" ${cf.lat_lng ? 'checked' : ''} onchange="KmzManager._toggleCopyField(${i}, 'lat_lng', this.checked)">
                        Coordenadas (lat/lng)
                    </label>
                    <label style="display:flex;align-items:center;gap:4px">
                        <input type="checkbox" ${cf.nome ? 'checked' : ''} onchange="KmzManager._toggleCopyField(${i}, 'nome', this.checked)">
                        Nome (KMZ)
                    </label>
                    ${loc.description ? `
                    <label style="display:flex;align-items:center;gap:4px">
                        <input type="checkbox" ${cf.endereco ? 'checked' : ''} onchange="KmzManager._toggleCopyField(${i}, 'endereco', this.checked)">
                        Endereco (descricao KMZ)
                    </label>
                    ` : ''}
                </div>
            </div>
        `;
    },

    _renderSuggestions(loc, i) {
        const sugs = (loc.suggestions || []).slice(0, 3);
        if (sugs.length === 0) return '';
        const lis = sugs.map((s, idx) => `
            <div class="kmz-suggestion" onclick="KmzManager._linkTo(${i}, ${idx})">
                <span style="color:var(--accent-blue)">${this._escapeHtml(s.nome)}</span>
                <span style="color:var(--text-muted);font-size:10px;margin-left:6px">${this._escapeHtml(s.cidade || '')} | ${s.equipamentos_count || 0} eq</span>
            </div>
        `).join('');
        return `<div class="kmz-suggestions"><div style="font-size:10px;color:var(--text-muted);margin-bottom:2px">Sugestoes Omie:</div>${lis}</div>`;
    },

    _toggleCopyField(idx, field, checked) {
        if (!this._locations[idx].copyFields) this._locations[idx].copyFields = {};
        this._locations[idx].copyFields[field] = checked;
    },

    _linkTo(idx, sugIdx) {
        const loc = this._locations[idx];
        const sug = (loc.suggestions || [])[sugIdx];
        if (!sug) return;
        loc.match = sug;
        loc.matchType = sug._score === 100 ? 'exact' : 'name';
        loc.action = 'link';
        loc.selected = true;
        loc.copyFields = loc.copyFields || { lat_lng: true, nome: false, endereco: false };
        this._rerenderCard(idx);
        this._renderFooter();
    },

    _linkToFromSearch(idx, omieClient) {
        const loc = this._locations[idx];
        loc.match = omieClient;
        loc.matchType = 'manual';
        loc.action = 'link';
        loc.selected = true;
        loc.copyFields = loc.copyFields || { lat_lng: true, nome: false, endereco: false };
        // fecha resultado da busca
        const box = document.getElementById('kmz-search-results-' + idx);
        if (box) box.style.display = 'none';
        this._rerenderCard(idx);
        this._renderFooter();
    },

    _unlink(idx) {
        const loc = this._locations[idx];
        loc.match = null;
        loc.matchType = null;
        loc.action = 'manual';
        this._rerenderCard(idx);
        this._renderFooter();
    },

    _rerenderCard(idx) {
        const card = document.querySelector(`[data-loc-idx="${idx}"]`);
        if (!card) return;
        const wrapper = document.createElement('div');
        wrapper.innerHTML = this._renderLocationCard(this._locations[idx], idx);
        card.replaceWith(wrapper.firstElementChild);
    },

    // ---- BUSCA OMIE MANUAL ----
    _searchTimers: {},
    _openSearch(idx) {
        const box = document.getElementById('kmz-search-results-' + idx);
        if (!box) return;
        if (box.style.display === 'block') { box.style.display = 'none'; return; }
        const loc = this._locations[idx];
        box.style.display = 'block';
        box.innerHTML = `
            <input type="text" class="kmz-search-input" placeholder="Buscar por nome, razão social ou CNPJ..." oninput="KmzManager._searchOmie(${idx}, this.value)" value="${this._escapeHtml(loc.nome.slice(0, 30))}">
            <div id="kmz-search-list-${idx}" class="kmz-search-list"></div>
        `;
        // Dispara busca inicial com o nome do KMZ
        this._searchOmie(idx, loc.nome.slice(0, 30));
    },

    _searchOmie(idx, query) {
        clearTimeout(this._searchTimers[idx]);
        this._searchTimers[idx] = setTimeout(async () => {
            const list = document.getElementById('kmz-search-list-' + idx);
            if (!list) return;
            const q = (query || '').trim();
            if (q.length < 2) { list.innerHTML = '<div style="font-size:11px;color:var(--text-muted);padding:6px">Digite ao menos 2 caracteres</div>'; return; }
            list.innerHTML = '<div style="font-size:11px;color:var(--text-muted);padding:6px">Buscando...</div>';
            try {
                const r = await fetch('/api/mapa/clientes?busca=' + encodeURIComponent(q));
                const data = await r.json();
                if (data.length === 0) {
                    list.innerHTML = '<div style="font-size:11px;color:var(--text-muted);padding:6px">Nenhum cliente Omie encontrado</div>';
                    return;
                }
                // Guardar resultado para clique
                this._lastSearchResults = this._lastSearchResults || {};
                this._lastSearchResults[idx] = data;
                list.innerHTML = data.slice(0, 8).map((c, i) => `
                    <div class="kmz-search-item" onclick="KmzManager._pickFromSearch(${idx}, ${i})">
                        <div style="font-size:12px;font-weight:600">${this._escapeHtml(c.nome)}</div>
                        <div style="font-size:10px;color:var(--text-muted)">${this._escapeHtml(c.cnpj_cpf || '')} | ${this._escapeHtml(c.cidade || '')} - ${this._escapeHtml(c.estado || '')} | ${c.equipamentos_count} eq, ${c.total_os_count} OS, ${c.total_pv_count} PV</div>
                    </div>
                `).join('');
            } catch (e) {
                list.innerHTML = '<div style="font-size:11px;color:var(--accent-red);padding:6px">Erro na busca</div>';
            }
        }, 300);
    },

    _pickFromSearch(idx, resultIdx) {
        const data = (this._lastSearchResults || {})[idx] || [];
        const sug = data[resultIdx];
        if (sug) this._linkToFromSearch(idx, sug);
    },

    _getMatchLabel(loc) {
        if (!loc.match) return '';
        const c = loc.match;
        const dist = Utils.calcularDistancia(loc.lat, loc.lng, c.lat, c.lng);
        const distStr = dist < 1 ? `${Math.round(dist * 1000)}m` : `${dist.toFixed(1)}km`;

        if (loc.matchType === 'exact') return `<div class="kmz-match-label exact">Mesmo nome e local — "${this._escapeHtml(c.nome)}" (${distStr})</div>`;
        if (loc.matchType === 'name') return `<div class="kmz-match-label name">Mesmo nome — "${this._escapeHtml(c.nome)}" (${distStr} de distancia)</div>`;
        return `<div class="kmz-match-label coords">Proximo de "${this._escapeHtml(c.nome)}" (${distStr})</div>`;
    },

    _setAction(idx, action) {
        const loc = this._locations[idx];
        loc.action = action;
        if (action === 'skip') {
            loc.selected = false;
        } else {
            loc.selected = true;
        }
        const cb = document.querySelector(`.kmz-location-item input[data-idx="${idx}"]`);
        if (cb) cb.checked = loc.selected;
        this._updateSelectAll();
        this._renderFooter();
    },

    _renderFooter() {
        const footer = document.getElementById('kmz-modal-footer');
        const selLocs = this._locations.filter(l => l.selected);
        const selRegs = this._regions.filter(r => r.selected);
        const links = selLocs.filter(l => l.action === 'link');
        const manuais = selLocs.filter(l => l.action === 'manual');

        const parts = [];
        if (selRegs.length > 0) parts.push(`${selRegs.length} regiao${selRegs.length > 1 ? 'es' : ''}`);
        if (links.length > 0) parts.push(`${links.length} vincula${links.length > 1 ? 'coes' : 'cao'} Omie`);
        if (manuais.length > 0) parts.push(`${manuais.length} novo${manuais.length > 1 ? 's' : ''}`);
        const total = selLocs.length + selRegs.length;
        const label = parts.length > 0 ? `Importar (${parts.join(' + ')})` : 'Nenhum selecionado';

        footer.innerHTML = `
            <button class="crud-btn-cancel" onclick="KmzManager.closeModal()">Cancelar</button>
            <button class="crud-btn-save" id="kmz-btn-import" onclick="KmzManager._importSelected()" ${total === 0 ? 'disabled' : ''}>${label}</button>
        `;
    },

    // ---- TOGGLES ----
    _toggleAllRegions(checked) {
        this._regions.forEach(r => r.selected = checked);
        document.querySelectorAll('.kmz-location-item input[data-reg-idx]').forEach(cb => cb.checked = checked);
        this._renderFooter();
    },

    _toggleRegion(idx, checked) {
        this._regions[idx].selected = checked;
        const allChecked = this._regions.every(r => r.selected);
        const selAll = document.getElementById('kmz-select-all-regions');
        if (selAll) selAll.checked = allChecked;
        this._renderFooter();
    },

    _toggleAll(checked) {
        this._locations.forEach(l => {
            l.selected = checked;
            if (checked && l.action === 'skip') l.action = l.match ? 'link' : 'manual';
            if (!checked) l.action = 'skip';
        });
        document.querySelectorAll('.kmz-location-item input[data-idx]').forEach(cb => cb.checked = checked);
        document.querySelectorAll('.kmz-action-select').forEach(sel => {
            const idx = parseInt(sel.dataset.idx);
            sel.value = this._locations[idx].action;
        });
        this._renderFooter();
    },

    _toggleItem(idx, checked) {
        const loc = this._locations[idx];
        loc.selected = checked;
        if (!checked) {
            loc.action = 'skip';
        } else if (loc.action === 'skip') {
            loc.action = loc.match ? 'link' : 'manual';
        }
        const sel = document.querySelector(`.kmz-action-select[data-idx="${idx}"]`);
        if (sel) sel.value = loc.action;
        this._updateSelectAll();
        this._renderFooter();
    },

    _updateSelectAll() {
        const allChecked = this._locations.every(l => l.selected);
        const cb = document.getElementById('kmz-select-all-locs');
        if (cb) cb.checked = allChecked;
    },

    // ---- IMPORT EXECUTE ----
    async _importSelected() {
        const selLocs = this._locations.filter(l => l.selected);
        const selRegs = this._regions.filter(r => r.selected);

        if (selLocs.length === 0 && selRegs.length === 0) {
            Utils.toast('Selecione ao menos um item', 'error');
            return;
        }

        const btn = document.getElementById('kmz-btn-import');
        if (btn) { btn.disabled = true; btn.textContent = 'Importando...'; }

        try {
            let createdCount = 0, linkedCount = 0, regionsCount = 0;

            if (selLocs.length > 0) {
                const newClientes = [];   // criar como manual (POST batch)
                const linkUpdates = [];   // vincular (PUT no cliente Omie existente)

                selLocs.forEach(loc => {
                    if (loc.action === 'link' && loc.match) {
                        const cf = loc.copyFields || { lat_lng: true, nome: false, endereco: false };
                        const patch = { origem: 'importado' };
                        if (cf.lat_lng !== false) { patch.lat = loc.lat; patch.lng = loc.lng; }
                        if (cf.nome) patch.nome = loc.nome;
                        if (cf.endereco && loc.description) patch.endereco = loc.description;
                        linkUpdates.push({ id: loc.match.id, patch });
                    } else if (loc.action === 'manual') {
                        newClientes.push({
                            nome: loc.nome, lat: loc.lat, lng: loc.lng,
                            endereco: loc.description || '',
                            cidade: 'Desconhecida' // batch exige cidade
                        });
                    }
                });

                if (newClientes.length > 0) {
                    for (const nc of newClientes) {
                        const resp = await fetch('/api/mapa/clientes', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(nc)
                        });
                        if (resp.ok) createdCount++;
                    }
                }

                for (const upd of linkUpdates) {
                    const resp = await fetch('/api/mapa/clientes', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id: upd.id, ...upd.patch })
                    });
                    if (resp.ok) linkedCount++;
                }
            }

            // Importar regioes
            if (selRegs.length > 0) {
                const regioes = selRegs.map(r => ({
                    nome: r.nome,
                    coords: r.coords,
                    multiPolygon: r.multiPolygon || false,
                    color: r.color,
                    description: r.description
                }));

                const resp = await fetch('/api/regioes', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ regioes })
                });
                const data = await resp.json();
                if (!resp.ok) throw new Error(data.error || 'Erro ao salvar regioes');
                regionsCount = selRegs.length;

                // Renderizar no mapa imediatamente
                this._renderRegionsOnMap(regioes);

                // Ativar camada se estava desligada
                const cb = document.getElementById('layer-regioes');
                if (cb && !cb.checked) {
                    cb.checked = true;
                    cb.dispatchEvent(new Event('change'));
                }
            }

            const msgs = [];
            if (regionsCount > 0) msgs.push(`${regionsCount} regiao${regionsCount > 1 ? 'es' : ''}`);
            if (linkedCount > 0) msgs.push(`${linkedCount} vincula${linkedCount > 1 ? 'coes' : 'cao'} ao Omie`);
            if (createdCount > 0) msgs.push(`${createdCount} criado${createdCount > 1 ? 's' : ''}`);
            Utils.toast(msgs.join(', ') + ' importado(s)!', 'success');

            this.closeModal();
            if (selLocs.length > 0) App.loadAllData();
        } catch (err) {
            Utils.toast('Erro ao importar: ' + err.message, 'error');
            if (btn) { btn.disabled = false; this._renderFooter(); }
        }
    },

    // ---- REGIOES NO MAPA ----
    _renderRegionsOnMap(regioes) {
        RegionEditor.renderRegionsOnMap(regioes);
    },

    loadSavedRegions(regioes) {
        if (!regioes || regioes.length === 0) return;
        RegionEditor.renderRegionsOnMap(regioes);
    },

    clearRegions() {
        if (MapCore.regioesLayer) MapCore.regioesLayer.clearLayers();
        RegionEditor._regionPolygonMap.clear();
        fetch('/api/regioes', { method: 'DELETE' }).then(() => {
            Utils.toast('Regioes removidas', 'success');
        });
    },

    // ---- EXPORT ----
    exportKmz() {
        if (typeof JSZip === 'undefined') {
            Utils.toast('Biblioteca JSZip nao carregou. Verifique sua conexao.', 'error');
            return;
        }

        const clientes = (App.state.clientes || []).filter(c => c.lat && c.lng);

        if (clientes.length === 0) {
            Utils.toast('Nenhum cliente com coordenadas para exportar', 'error');
            return;
        }

        let placemarks = '';
        clientes.forEach(c => {
            const name = this._escapeXml(c.nome || 'Sem nome');
            const desc = this._escapeXml([c.endereco, c.cidade, c.estado].filter(Boolean).join(', ') +
                (c.telefone ? ' | Tel: ' + c.telefone : '') +
                (c.email ? ' | Email: ' + c.email : ''));

            placemarks += `
    <Placemark>
      <name>${name}</name>
      <description>${desc}</description>
      <Point>
        <coordinates>${c.lng},${c.lat},0</coordinates>
      </Point>
    </Placemark>`;
        });

        const today = new Date().toISOString().split('T')[0];
        const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>MAPA-GERAL Export</name>
    <description>Exportado em ${today} - ${clientes.length} locais</description>${placemarks}
  </Document>
</kml>`;

        const zip = new JSZip();
        zip.file('doc.kml', kml);

        zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.google-earth.kmz' }).then(blob => {
            saveAs(blob, `mapa-geral-${today}.kmz`);
            Utils.toast(`KMZ exportado com ${clientes.length} locais!`, 'success');
        }).catch(err => {
            console.error('Erro export KMZ:', err);
            Utils.toast('Erro ao gerar arquivo KMZ', 'error');
        });
    },

    // ---- HELPERS ----
    _escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    _escapeXml(text) {
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }
};
