// =========================================================
// SEARCH - Client search with dropdown
// =========================================================

const Search = {
    init() {
        const input = document.getElementById('search-input');
        const dropdown = document.getElementById('search-dropdown');

        input.addEventListener('input', Utils.debounce(async () => {
            const q = input.value.trim();
            if (q.length < 2) {
                dropdown.classList.remove('show');
                return;
            }

            try {
                const results = await Utils.fetchJson(`/api/buscar-clientes?q=${encodeURIComponent(q)}`);
                this.renderResults(results);
            } catch (e) {
                dropdown.classList.remove('show');
            }
        }, 250));

        // Close dropdown on outside click
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.search-bar')) {
                dropdown.classList.remove('show');
            }
        });

        // Close on Escape
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                dropdown.classList.remove('show');
                input.blur();
            }
        });
    },

    renderResults(results) {
        const dropdown = document.getElementById('search-dropdown');

        if (results.length === 0) {
            dropdown.innerHTML = '<div class="search-item"><span class="search-item-name" style="color:var(--text-muted)">Nenhum resultado</span></div>';
            dropdown.classList.add('show');
            return;
        }

        dropdown.innerHTML = results.map(c => `
            <div class="search-item" onclick="Search.selectClient('${c.id}', ${c.lat}, ${c.lng})">
                <div>
                    <div class="search-item-name">${c.nome}</div>
                    <div class="search-item-city">📍 ${c.cidade} - ${c.estado} ${c.ultima_visita ? '| 👁️ ' + Utils.formatDate(c.ultima_visita) : ''}</div>
                </div>
                ${c.equipamentos_count > 0 ? `<span class="search-item-badge equip">🔧 ${c.equipamentos_count}</span>` : ''}
            </div>
        `).join('');

        dropdown.classList.add('show');
    },

    selectClient(id, lat, lng) {
        document.getElementById('search-dropdown').classList.remove('show');
        document.getElementById('search-input').value = '';

        if (lat && lng) {
            MapCore.map.setView([lat, lng], 14, { animate: true });
        }

        // Open detail panel
        Panels.open(id);
    }
};
