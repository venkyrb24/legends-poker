let currentGameId = null;

// ============ Utility Functions ============
async function fetchAPI(url, options = {}) {
  try {
    const response = await fetch(url, options);
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Fetch error:', error);
    // Silent errors for background sync, alerts for user actions
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
  const gameData = await fetchAPI(`/api/game/${currentGameId}`);
  if (!allPlayers || !gameData) return;

  const currentIds = gameData.players.map(p => p.player_id);
  const available = allPlayers.filter(p => !currentIds.includes(p.id));
  const playerList = document.getElementById('available-players');

  if (available.length) {
    playerList.innerHTML = available.map(p => `
      <div class="player-row">
        <div class="player-name">
          <input type="checkbox" id="add-p-${p.id}" value="${p.id}"> ${sanitizeHTML(p.name)}
        </div>
      </div>
    `).join('');
  } else {
    playerList.innerHTML = '<div class="section-header no-players-message">No players available</div>';
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
      <div class="player-row">
        <div class="player-name">${sanitizeHTML(p.name)}</div>
        <div class="player-delete" onclick="deletePlayer(${p.id})">Delete</div>
      </div>
    `).join('');
  } else {
    playerList.innerHTML = '<div class="section-header no-players-message">No players yet</div>';
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
        <div class="player-name">
          <input type="checkbox" id="p-${p.id}" value="${p.id}"> ${sanitizeHTML(p.name)}
        </div>
      </div>
    `).join('');
  } else {
    playerSelect.innerHTML = '<div class="section-header no-players-message">No players yet.</div>';
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

  const games = await fetchAPI('/api/games');
  const gameData = await fetchAPI(`/api/game/${currentGameId}`);
  if (!games || !gameData) return;

  const thisGame = games.find(g => g.id === currentGameId);
  document.getElementById('game-id').textContent = thisGame ? thisGame.date : `Game #${currentGameId}`;

  let totalBuyins = 0;
  let totalReturns = 0;

  document.getElementById('game-players').innerHTML = gameData.players.map(p => {
    const chips = p.chips_returned || 0;
    const cash = p.cash_return || 0;
    const net = (chips * 0.2) + cash - (p.buyins * 40);
    totalBuyins += p.buyins;
    totalReturns += (chips * 0.2) + cash;
    const badgeClass = net > 0 ? 'win' : net < 0 ? 'lose' : 'even';

    return `
      <div class="player-row">
        <div style="flex:1">
          <div class="player-name">${sanitizeHTML(p.name)}</div>
          <div class="player-meta">
            <div class="player-meta-line"><span>Buy-ins</span><span>${p.buyins}</span></div>
            <div class="player-meta-line"><span>Chips back</span><span>${chips}</span></div>
          </div>
        </div>
        <div class="player-right">
          <div class="net-badge ${badgeClass}">${net > 0 ? '+' : ''}$${Math.round(net)}</div>
          <div class="pot-buttons">
            <button class="btn-chip blue" onclick="quickAddBuyin(${p.buyin_id}, 1)">+1</button>
            <button class="btn-chip red" onclick="quickAddBuyin(${p.buyin_id}, -1)">-1</button>
          </div>
          <div style="display:flex; gap:4px; margin-top:4px;">
            <button class="btn-secondary" style="font-size:11px;padding:4px 8px;flex:1" onclick="editPlayer(${p.buyin_id})">Edit</button>
            <button class="btn-ghost" style="color:var(--danger);font-size:11px;padding:4px 8px;" onclick="removePlayerFromGame(${p.buyin_id})">×</button>
          </div>
        </div>
      </div>
      <div class="edit-panel" id="edit-${p.buyin_id}" style="display:none;margin-bottom:8px;">
        <div style="margin-bottom:10px;">
          <div class="section-header" style="margin:4px 0;">Chips back</div>
          <div class="add-form">
            <button class="btn-secondary" onclick="updateChipsReturned(${p.buyin_id}, -50)">-50</button>
            <button class="btn-secondary" onclick="updateChipsReturned(${p.buyin_id}, -10)">-10</button>
            <input type="number" id="chips-${p.buyin_id}" class="add-input" value="${chips}" onchange="saveChipsReturned(${p.buyin_id})">
            <button class="btn-secondary" onclick="updateChipsReturned(${p.buyin_id}, 10)">+10</button>
            <button class="btn-secondary" onclick="updateChipsReturned(${p.buyin_id}, 50)">+50</button>
          </div>
        </div>
        <div style="margin-bottom:10px;">
          <div class="section-header" style="margin:4px 0;">Return pots (200 chips)</div>
          <div class="add-form">
            <button class="btn-secondary" onclick="updateChipsReturned(${p.buyin_id}, 200)">+1</button>
            <button class="btn-secondary" onclick="updateChipsReturned(${p.buyin_id}, 400)">+2</button>
            <button class="btn-secondary" onclick="updateChipsReturned(${p.buyin_id}, -200)">-1</button>
          </div>
        </div>
        <div>
          <div class="section-header" style="margin:4px 0;">Cash back</div>
          <div class="add-form">
            <button class="btn-secondary" onclick="updateCash(${p.buyin_id}, -10)">-10</button>
            <input type="number" id="cash-${p.buyin_id}" class="add-input" value="${cash}" onchange="saveCash(${p.buyin_id})">
            <button class="btn-secondary" onclick="updateCash(${p.buyin_id}, 10)">+10</button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  const totalChips = totalBuyins * 200;
  const returnChips = Math.floor(totalReturns / 0.2);
  document.getElementById('total-buyins').textContent = `${totalBuyins} pots ($${totalBuyins * 40})`;

  const diff = returnChips - totalChips;
  const returnsSpan = document.getElementById('total-returns');
  if (diff > 0) {
    returnsSpan.innerHTML = `⚠️ $${Math.round(totalReturns)} (+$${Math.round(diff * 0.2)})`;
  } else if (diff < 0) {
    returnsSpan.innerHTML = `⚠️ $${Math.round(totalReturns)} (-$${Math.round(Math.abs(diff) * 0.2)})`;
  } else {
    returnsSpan.textContent = `$${Math.round(totalReturns)} (Match)`;
  }
  await calculate(true);
}

async function removePlayerFromGame(buyinId) {
  if (!confirm('Remove player from game? Data for this session will be lost.')) return;
  if (await fetchAPI(`/api/game/${currentGameId}/remove_player/${buyinId}`, { method: 'DELETE' })) {
    await loadExistingGame();
  }
}

async function quickAddBuyin(buyinId, amount) {
  const gameData = await fetchAPI(`/api/game/${currentGameId}`);
  if (!gameData) return;
  const player = gameData.players.find(p => p.buyin_id === buyinId);
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
  const data = await fetchAPI(`/api/calculate/${currentGameId}`);
  if (!data) return;

  let html = '<div class="settlement-card">';
  data.results.forEach(r => {
    const cls = r.net_cash > 0 ? 'net-win' : r.net_cash < 0 ? 'net-lose' : 'net-even';
    const sign = r.net_cash > 0 ? '+' : '';
    html += `
      <div class="result-row">
        <div class="result-left">${sanitizeHTML(r.name)}: ${r.buyins} buy-ins, ${r.chips_returned || 0} back</div>
        <div class="result-right ${cls}">${sign}$${r.net_cash}</div>
      </div>
    `;
  });
  html += '<div class="settlement-list">';
  if (data.settlements && data.settlements.length) {
    data.settlements.forEach(s => html += `<div class="settlement-item">${sanitizeHTML(s)}</div>`);
  } else {
    html += '<div class="settlement-item">No settlements needed.</div>';
  }
  html += '</div></div>';
  const settlementsDiv = document.getElementById('settlements');
  if (settlementsDiv) settlementsDiv.innerHTML = html;
}

async function loadHistory() {
  const games = await fetchAPI('/api/games');
  if (!games) return;
  const historyList = document.getElementById('history-list');
  if (!games.length) {
    historyList.innerHTML = '<div class="section-header no-players-message">No games yet</div>';
    return;
  }

  let html = '';
  for (const game of games.slice(0, 5)) {
    const data = await fetchAPI(`/api/calculate/${game.id}`);
    if (!data) continue;
    html += `
      <div class="history-card">
        <div class="history-row">
          <span>${sanitizeHTML(game.date)}</span>
          <div class="history-actions">
            <span class="history-link" onclick="resumeGame(${game.id})">View</span>
            <span class="history-delete" onclick="deleteGame(${game.id})">Delete</span>
          </div>
        </div>
    `;
    data.results.forEach(r => {
      const cls = r.net_cash > 0 ? 'net-win' : r.net_cash < 0 ? 'net-lose' : 'net-even';
      const sign = r.net_cash > 0 ? '+' : '';
      html += `
        <div class="result-row" style="font-size:11px">
          <div class="result-left">${sanitizeHTML(r.name)}</div>
          <div class="result-right ${cls}">${sign}$${r.net_cash}</div>
        </div>
      `;
    });
    html += '</div>';
  }
  historyList.innerHTML = html;
}

async function resumeGame(id) {
  currentGameId = id;
  showSection('game');
}

async function deleteGame(id) {
  if (!confirm('Delete this game history?')) return;
  if (await fetchAPI(`/api/game/${id}`, { method: 'DELETE' })) {
    if (currentGameId === id) currentGameId = null;
    await loadHistory();
  }
}

function editPlayer(id) {
  const panel = document.getElementById(`edit-${id}`);
  if (!panel) return;
  const isHidden = panel.style.display === 'none';
  document.querySelectorAll('.edit-panel').forEach(p => p.style.display = 'none');
  if (isHidden) panel.style.display = 'block';
}

async function updateChipsReturned(id, delta) {
  const inp = document.getElementById(`chips-${id}`);
  if (inp) {
    inp.value = Math.max(0, parseInt(inp.value || '0', 10) + delta);
    await saveChipsReturned(id);
  }
}

async function saveChipsReturned(id) {
  const val = parseInt(document.getElementById(`chips-${id}`).value || '0', 10);
  if (await fetchAPI('/api/buyins', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: id, field: 'chips_returned', value: val })
  })) await loadExistingGame();
}

async function updateCash(id, delta) {
  const inp = document.getElementById(`cash-${id}`);
  if (inp) {
    inp.value = Math.max(0, parseInt(inp.value || '0', 10) + delta);
    await saveCash(id);
  }
}

async function saveCash(id) {
  const val = parseInt(document.getElementById(`cash-${id}`).value || '0', 10);
  if (await fetchAPI('/api/buyins', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: id, field: 'cash_return', value: val })
  })) await loadExistingGame();
}

// Initial entry point
window.addEventListener('DOMContentLoaded', () => {
  showSection('home');
  // Pre-load current game if possible
  fetchAPI('/api/games').then(games => {
    if (games && games.length) {
      currentGameId = games[0].id;
      // Don't auto-switch section, just prepare the data
    }
  });
});
