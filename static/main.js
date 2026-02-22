let currentGameId = null;
let activeEditId = null;

// ============ Utility Functions ============
async function fetchAPI(url, options = {}) {
    try {
        const response = await fetch(url, options);
        if (!response.ok) throw new Error(`API error: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error('Fetch error:', error);
        if (options.method && options.method !== 'GET') {
            showError(`Operation failed: ${error.message}`);
        }
        return null;
    }
}

function showError(message) {
    alert(`Error: ${message}`);
}

function sanitizeHTML(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============ Section Navigation ============
function showSection(id) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    const section = document.getElementById(id);
    if (section) {
        section.classList.add('active');
        if (id === 'players') loadPlayers();
        if (id === 'game') loadGame();
        if (id === 'history') loadHistory();
    }
}

// ============ Modal Functions ============
async function showAddPlayerModal() {
    if (!currentGameId) return showError('No active game');
    const modal = document.getElementById('add-player-modal');
    const allPlayers = await fetchAPI('/api/players');
    const data = await fetchAPI(`/api/game/${currentGameId}`);
    if (!allPlayers || !data) return;

    const currentIds = data.players.map(p => p.player_id);
    const available = allPlayers.filter(p => !currentIds.includes(p.id));
    const playerList = document.getElementById('available-players');

    if (available.length) {
        playerList.innerHTML = available.map(p => `
            <div class="player-row">
                <span class="player-name">${sanitizeHTML(p.name)}</span>
                <input type="checkbox" id="add-p-${p.id}" value="${p.id}" style="width: 24px; height: 24px;">
            </div>
        `).join('');
    } else {
        playerList.innerHTML = '<div class="section-header">No players available</div>';
    }
    modal.classList.add('active');
}

function closeAddPlayerModal() {
    const modal = document.getElementById('add-player-modal');
    if (modal) modal.classList.remove('active');
}

async function addPlayersToGame() {
    const checkboxes = document.querySelectorAll('#available-players input:checked');
    const ids = Array.from(checkboxes).map(c => parseInt(c.value, 10));
    if (!ids.length) return closeAddPlayerModal();

    try {
        for (const id of ids) {
            await fetchAPI(`/api/game/${currentGameId}/add_player`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ player_id: id, buyins: 1, chips_returned: 0 })
            });
        }
        closeAddPlayerModal();
        await loadExistingGame();
    } catch (error) {
        showError('Failed to add players');
    }
}

// ============ Players Section ============
async function loadPlayers() {
    const players = await fetchAPI('/api/players');
    if (!players) return;
    const playerList = document.getElementById('player-list');
    if (players.length) {
        playerList.innerHTML = players.map(p => `
            <div class="player-item">
                <span>${sanitizeHTML(p.name)}</span>
                <button class="btn-delete" onclick="deletePlayer(${p.id})">Delete</button>
            </div>
        `).join('');
    } else {
        playerList.innerHTML = '<div class="section-header">No players yet</div>';
    }
}

async function addPlayer() {
    const inp = document.getElementById('new-player');
    const name = inp.value.trim();
    if (!name) return showError('Player name cannot be empty');

    const result = await fetchAPI('/api/players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
    });
    if (result) {
        inp.value = '';
        await loadPlayers();
    }
}

async function deletePlayer(id) {
    if (!confirm('Delete this player?')) return;
    if (await fetchAPI(`/api/players/${id}`, { method: 'DELETE' })) {
        await loadPlayers();
    }
}

// ============ Game Section ============
async function loadGame() {
    document.getElementById('game-start').style.display = 'block';
    document.getElementById('game-play').style.display = 'none';
    document.getElementById('settlements').innerHTML = '';

    const players = await fetchAPI('/api/players');
    if (!players) return;
    const playerSelect = document.getElementById('player-select');
    if (players.length) {
        playerSelect.innerHTML = players.map(p => `
            <div class="player-row">
                <span class="player-name">${sanitizeHTML(p.name)}</span>
                <input type="checkbox" id="p-${p.id}" value="${p.id}" style="width: 24px; height: 24px;">
            </div>
        `).join('');
    } else {
        playerSelect.innerHTML = '<div class="section-header">No players yet.</div>';
    }

    const games = await fetchAPI('/api/games');
    if (!games || !games.length) {
        document.getElementById('game-id').textContent = '—';
        return;
    }
    if (!currentGameId) currentGameId = games[0].id;
    await loadExistingGame();
}

async function createGame() {
    const checkboxes = document.querySelectorAll('#player-select input:checked');
    const playerIds = Array.from(checkboxes).map(c => parseInt(c.value, 10));
    if (!playerIds.length) return showError('Select at least one player');

    const gameData = await fetchAPI('/api/game', { method: 'POST' });
    if (!gameData) return;

    currentGameId = gameData.game_id;
    for (const playerId of playerIds) {
        await fetchAPI(`/api/game/${currentGameId}/add_player`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ player_id: playerId, buyins: 1, chips_returned: 0 })
        });
    }
    await loadExistingGame();
}

async function backToSelect() {
    if (!confirm('Start a new game? Progress is saved in History.')) return;
    currentGameId = null;
    await loadGame();
}

async function loadExistingGame() {
    if (!currentGameId) return;
    document.getElementById('game-start').style.display = 'none';
    document.getElementById('game-play').style.display = 'block';

    const data = await fetchAPI(`/api/game/${currentGameId}`);
    if (!data) return;

    const gameMeta = data.game;
    const players = data.players;
    document.getElementById('game-id').textContent = gameMeta ? gameMeta.date : \`Game #\${currentGameId}\`;

    let totalBuyins = 0;
    let totalReturns = 0;

    document.getElementById('game-players').innerHTML = players.map(p => {
        const chips = p.chips_returned || 0;
        const cash = p.cash_return || 0;
        const net = (chips * 0.2) + cash - (p.buyins * 40);
        
        totalBuyins += p.buyins;
        totalReturns += (chips * 0.2) + cash;

        const badgeClass = net > 0 ? 'win' : (net < 0 ? 'lose' : 'even');

        return \`
            <div class="player-card">
                <div class="player-main">
                    <div class="player-info">
                        <div class="player-name-row">
                            <span class="player-name">\${sanitizeHTML(p.name)}</span>
                            <span class="net-badge \${badgeClass}">\${net > 0 ? '+' : ''}$\${Math.round(net)}</span>
                        </div>
                        <div class="player-meta">
                            <span class="player-meta-line"><span>Buy-ins</span> <span>\${p.buyins}</span></span>
                            <span class="player-meta-line"><span>Chips</span> <span>\${chips}</span></span>
                        </div>
                    </div>
                    <div class="pot-buttons">
                        <button class="btn-chip blue" onclick="quickAddBuyin(\${p.buyin_id}, 1)">+B</button>
                        <button class="btn-chip red" onclick="quickAddBuyin(\${p.buyin_id}, -1)">-B</button>
                        <button class="btn-chip white" onclick="editPlayer(\${p.buyin_id})">Edit</button>
                        <span class="player-delete" onclick="removePlayerFromGame(\${p.buyin_id})">×</span>
                    </div>
                </div>
                
                <div id="edit-\${p.buyin_id}" class="edit-panel" style="display: none;">
                    <div class="section-header">Update Chips/Cash</div>
                    <div class="add-form">
                        <input type="number" id="chips-\${p.buyin_id}" class="add-input" value="\${chips}">
                        <button class="add-btn" onclick="saveChipsReturned(\${p.buyin_id})">Save</button>
                    </div>
                    <div class="pot-buttons">
                        <button class="btn-chip" onclick="updateChipsReturned(\${p.buyin_id}, -200)">-1 Pot</button>
                        <button class="btn-chip" onclick="updateChipsReturned(\${p.buyin_id}, 200)">+1 Pot</button>
                    </div>
                </div>
            </div>
        \`;
    }).join('');

    if (activeEditId) {
        const panel = document.getElementById(\`edit-\${activeEditId}\`);
        if (panel) panel.style.display = 'block';
    }

    document.getElementById('total-buyins').textContent = \`\${totalBuyins} pots ($\${totalBuyins * 40})\`;
    
    const returnsSpan = document.getElementById('total-returns');
    const expectedReturns = totalBuyins * 40;
    const diff = totalReturns - expectedReturns;
    
    if (Math.abs(diff) > 0.1) {
        returnsSpan.innerHTML = \`⚠️ $\${Math.round(totalReturns)} (\${diff > 0 ? '+' : '-'}$\${Math.round(Math.abs(diff))})\`;
    } else {
        returnsSpan.textContent = \`$\${Math.round(totalReturns)} (Match)\`;
    }

    await calculate(true);
}

async function removePlayerFromGame(buyinId) {
    if (!confirm('Remove player from game?')) return;
    if (await fetchAPI(\`/api/game/\${currentGameId}/remove_player/\${buyinId}\`, { method: 'DELETE' })) {
        await loadExistingGame();
    }
}

async function quickAddBuyin(buyinId, amount) {
    const data = await fetchAPI(\`/api/game/\${currentGameId}\`);
    if (!data) return;
    const player = data.players.find(p => p.buyin_id === buyinId);
    const current = player ? player.buyins : 0;
    const newValue = Math.max(0, current + amount);
    
    if (await fetchAPI('/api/buyins', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: buyinId, field: 'buyins', value: newValue })
    })) {
        await loadExistingGame();
    }
}

async function calculate(silent = false) {
    if (!currentGameId) return;
    const data = await fetchAPI(\`/api/calculate/\${currentGameId}\`);
    if (!data) return;

    let html = '<div class="settlement-grid">';
    data.results.forEach(r => {
        const sign = r.net_cash > 0 ? '+' : '';
        const cls = r.net_cash > 0 ? 'net-win' : (r.net_cash < 0 ? 'net-lose' : 'net-even');
        html += \`
            <div class="settlement-row \${cls}">
                <span>\${sanitizeHTML(r.name)}</span>
                <span>\${sign}$\${r.net_cash}</span>
            </div>
        \`;
    });
    html += '</div>';

    if (data.settlements && data.settlements.length) {
        html += '<div class="settlement-list">';
        data.settlements.forEach(s => html += \`<div class="settlement-item">\${sanitizeHTML(s)}</div>\`);
        html += '</div>';
    }

    const settlementsDiv = document.getElementById('settlements');
    if (settlementsDiv) settlementsDiv.innerHTML = html;
}

async function loadHistory() {
    const games = await fetchAPI('/api/games');
    if (!games) return;
    const historyList = document.getElementById('history-list');

    if (!games.length) {
        historyList.innerHTML = '<div class="section-header">No games yet</div>';
        return;
    }

    let html = '';
    for (const game of games.slice(0, 10)) {
        const data = await fetchAPI(\`/api/calculate/\${game.id}\`);
        if (!data) continue;

        html += \`
            <div class="history-item">
                <div class="history-header">
                    <strong>\${sanitizeHTML(game.date)}</strong>
                    <div class="history-actions">
                        <button class="btn-chip blue" onclick="resumeGame(\${game.id})">View</button>
                        <button class="btn-chip red" onclick="deleteGame(\${game.id})">Delete</button>
                    </div>
                </div>
                <div class="history-summary">
        \`;
        
        data.results.forEach(r => {
            const cls = r.net_cash > 0 ? 'net-win' : (r.net_cash < 0 ? 'net-lose' : 'net-even');
            const sign = r.net_cash > 0 ? '+' : '';
            html += \`
                <div class="history-player \${cls}">
                    <span>\${sanitizeHTML(r.name)}</span>
                    <span>\${sign}$\${r.net_cash}</span>
                </div>
            \`;
        });
        
        html += \`
                </div>
            </div>
        \`;
    }
    historyList.innerHTML = html;
}

async function resumeGame(id) {
    currentGameId = id;
    showSection('game');
}

async function deleteGame(id) {
    if (!confirm('Delete this game history?')) return;
    if (await fetchAPI(\`/api/game/\${id}\`, { method: 'DELETE' })) {
        if (currentGameId === id) currentGameId = null;
        await loadHistory();
    }
}

function editPlayer(id) {
    const panel = document.getElementById(\`edit-\${id}\`);
    if (!panel) return;
    const isHidden = panel.style.display === 'none';
    
    document.querySelectorAll('.edit-panel').forEach(p => p.style.display = 'none');
    
    if (isHidden) {
        panel.style.display = 'block';
        activeEditId = id;
    } else {
        activeEditId = null;
    }
}

async function updateChipsReturned(id, delta) {
    const inp = document.getElementById(\`chips-\${id}\`);
    if (inp) {
        const newVal = Math.max(0, parseInt(inp.value || '0', 10) + delta);
        inp.value = newVal;
        await saveChipsReturned(id);
    }
}

async function saveChipsReturned(id) {
    const input = document.getElementById(\`chips-\${id}\`);
    if (!input) return;
    const val = parseInt(input.value || '0', 10);
    
    const result = await fetchAPI('/api/buyins', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: id, field: 'chips_returned', value: val })
    });
    
    if (result) {
        await loadExistingGame();
    }
}

window.addEventListener('DOMContentLoaded', () => {
    showSection('home');
    fetchAPI('/api/games').then(games => {
        if (games && games.length) {
            currentGameId = games[0].id;
        }
    });
});
