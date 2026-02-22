let currentGameId = null;

// ============ Utility Functions ============
async function fetchAPI(url, options = {}) {
  try {
    const response = await fetch(url, options);
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Fetch error:', error);
    showError(`Failed to load data: ${error.message}`);
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
  if (!currentGameId) {
    showError('No active game');
    return;
  }

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
          <input type="checkbox" id="add-p-${p.id}" value="${p.id}"> 
          ${sanitizeHTML(p.name)}
        </div>
      </div>
    `).join('');
  } else {
    playerList.innerHTML = '<div class="section-header no-players-message">No players available</div>';
  }

  modal.classList.add('active');
}

function closeAddPlayerModal() {
  document.getElementById('add-player-modal').classList.remove('active');
}

async function addPlayersToGame() {
  const checkboxes = document.querySelectorAll('#available-players input:checked');
  const ids = Array.from(checkboxes).map(c => parseInt(c.value, 10));

  if (!ids.length) {
    closeAddPlayerModal();
    return;
  }

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

  if (!name) {
    showError('Player name cannot be empty');
    return;
  }

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

  const result = await fetchAPI(`/api/players/${id}`, { method: 'DELETE' });
  if (result) {
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
          <input type="checkbox" id="p-${p.id}" value="${p.id}"> 
          ${sanitizeHTML(p.name)}
        </div>
      </div>
    `).join('');
  } else {
    playerSelect.innerHTML = '<div class="section-header no-players-message">No players. Add players first!</div>';
  }

  const games = await fetchAPI('/api/games');
  if (!games || !games.length) {
    document.getElementById('game-id').textContent = '—';
    return;
  }

  if (!currentGameId) {
    currentGameId = games[0].id;
  }
  await loadExistingGame();
}

async function createGame() {
  const checkboxes = document.querySelectorAll('#player-select input:checked');
  const playerIds = Array.from(checkboxes).map(c => parseInt(c.value, 10));

  if (!playerIds.length) {
    showError('Select at least one player');
    return;
  }

  try {
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
  } catch (error) {
    showError('Failed to create game');
  }
}

async function backToSelect() {
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
    const totalChips = p.buyins * 200;
    const chipsReturned = p.chips_returned || 0;
    const cashReturn = p.cash_return || 0;
    const net = (chipsReturned * 0.20) + cashReturn - (p.buyins * 40);

    totalBuyins += p.buyins;
    totalReturns += (chipsReturned * 0.20) + cashReturn;

    const badgeClass = net > 0 ? 'win' : net < 0 ? 'lose' : 'even';

    return `
      <div class="player-row">
        <div>
          <div class="player-name">${sanitizeHTML(p.name)}</div>
          <div class="player-meta">
            <div class="player-meta-line">
              <span>Buy-ins</span><span>${p.buyins}</span>
            </div>
            <div class="player-meta-line">
              <span>Chips back</span><span>${chipsReturned}</span>
            </div>
            <div class="player-meta-line">
              <span>Returned</span>
              <span>${chipsReturned} chips ($${(chipsReturned * 0.20 + cashReturn).toFixed(0)})</span>
            </div>
          </div>
        </div>
        <div class="player-right">
          <div class="net-badge ${badgeClass}">
            ${net > 0 ? '+' : ''}$${Math.round(net)}
          </div>
          <div class="pot-buttons">
            <button class="btn-chip blue" onclick="quickAddBuyin(${p.buyin_id}, 1)">+1</button>
            <button class="btn-chip blue" onclick="quickAddBuyin(${p.buyin_id}, 2)">+2</button>
            <button class="btn-chip blue" onclick="quickAddBuyin(${p.buyin_id}, 3)">+3</button>
            <button class="btn-chip red" onclick="quickAddBuyin(${p.buyin_id}, -1)">-1</button>
            <button class="btn-chip red" onclick="quickAddBuyin(${p.buyin_id}, -2)">-2</button>
            <button class="btn-chip red" onclick="quickAddBuyin(${p.buyin_id}, -3)">-3</button>
          </div>
          <button class="btn-secondary" style="margin-top:4px;font-size:11px;padding:4px 8px;"
                  onclick="editPlayer(${p.buyin_id})">
            Edit
          </button>
        </div>
      </div>
      <div class="edit-panel" id="edit-${p.buyin_id}" style="display:none;margin-bottom:8px;">
        <div style="margin-bottom:10px;">
          <div class="section-header" style="margin:4px 0;">Chips back</div>
          <div class="add-form">
            <button class="btn-secondary" onclick="updateChipsReturned(${p.buyin_id}, -50)">-50</button>
            <button class="btn-secondary" onclick="updateChipsReturned(${p.buyin_id}, -10)">-10</button>
            <input type="number" id="chips-${p.buyin_id}" class="add-input"
                   value="${chipsReturned}" onchange="saveChipsReturned(${p.buyin_id})">
            <button class="btn-secondary" onclick="updateChipsReturned(${p.buyin_id}, 10)">+10</button>
            <button class="btn-secondary" onclick="updateChipsReturned(${p.buyin_id}, 50)">+50</button>
          </div>
          <button class="btn-primary" style="margin-top:4px;"
                  onclick="saveChipsReturned(${p.buyin_id})">
            Save chips
          </button>
        </div>

        <div style="margin-bottom:10px;">
          <div class="section-header" style="margin:4px 0;">Return pots (200 chips)</div>
          <div class="add-form">
            <button class="btn-secondary" onclick="updateChipsReturned(${p.buyin_id}, 200)">+1</button>
            <button class="btn-secondary" onclick="updateChipsReturned(${p.buyin_id}, 400)">+2</button>
            <button class="btn-secondary" onclick="updateChipsReturned(${p.buyin_id}, 600)">+3</button>
            <button class="btn-secondary" onclick="updateChipsReturned(${p.buyin_id}, -200)">-1</button>
          </div>
          <div class="add-form" style="margin-top:4px;">
            <input type="number" min="0" id="pots-${p.buyin_id}" class="add-input"
                   placeholder="Pots (#)" onchange="savePots(${p.buyin_id})">
            <button class="btn-secondary" onclick="savePots(${p.buyin_id})">Set pots</button>
          </div>
        </div>

        <div>
          <div class="section-header" style="margin:4px 0;">Cash back</div>
          <div class="add-form">
            <button class="btn-secondary" onclick="updateCash(${p.buyin_id}, -20)">-20</button>
            <button class="btn-secondary" onclick="updateCash(${p.buyin_id}, -10)">-10</button>
            <input type="number" id="cash-${p.buyin_id}" class="add-input"
                   value="${cashReturn}" onchange="saveCash(${p.buyin_id})">
            <button class="btn-secondary" onclick="updateCash(${p.buyin_id}, 10)">+10</button>
            <button class="btn-secondary" onclick="updateCash(${p.buyin_id}, 20)">+20</button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  const totalChips = totalBuyins * 200;
  const returnChips = Math.floor(totalReturns / 0.20);
  document.getElementById('total-buyins').textContent = `${totalBuyins} pots (${totalChips} chips)`;

  const diff = returnChips - totalChips;
  const returnsSpan = document.getElementById('total-returns');
  if (diff > 0) {
    returnsSpan.innerHTML = `⚠️ ${returnChips} chips ($${Math.round(totalReturns)}) - INFLATED +${diff}`;
  } else if (diff < 0) {
    returnsSpan.innerHTML = `⚠️ ${returnChips} chips ($${Math.round(totalReturns)}) - SHORT ${Math.abs(diff)}`;
  } else {
    returnsSpan.textContent = `${returnChips} chips ($${Math.round(totalReturns)}) - MATCH!`;
  }
}

async function quickAddBuyin(buyinId, amount) {
  const gameData = await fetchAPI(`/api/game/${currentGameId}`);
  if (!gameData) return;

  const player = gameData.players.find(p => p.buyin_id === buyinId);
  const currentBuyins = player ? player.buyins : 0;
  const newValue = currentBuyins + amount;

  if (newValue < 0) return;

  const result = await fetchAPI('/api/buyins', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: buyinId, field: 'buyins', value: newValue })
  });

  if (result) {
    await loadExistingGame();
  }
}

// ============ Calculate & Settlements ============
async function calculate() {
  if (!currentGameId) {
    showError('No active game');
    return;
  }

  const data = await fetchAPI(`/api/calculate/${currentGameId}`);
  if (!data) return;

  let html = '<div class="settlement-card">';

  data.results.forEach(r => {
    const cls = r.net_cash > 0 ? 'net-win'
      : r.net_cash < 0 ? 'net-lose'
        : 'net-even';
    const sign = r.net_cash > 0 ? '+' : '';
    html += `
      <div class="result-row">
        <div class="result-left">
          ${sanitizeHTML(r.name)}: ${r.buyins} buy-ins, ${r.chips_returned || 0} back
        </div>
        <div class="result-right ${cls}">
          ${sign}$${r.net_cash}
        </div>
      </div>
    `;
  });

  html += '<div class="settlement-list">';
  if (data.settlements && data.settlements.length) {
    data.settlements.forEach(s => {
      html += `<div class="settlement-item">${sanitizeHTML(s)}</div>`;
    });
  } else {
    html += '<div class="settlement-item">No settlements needed.</div>';
  }
  html += '</div></div>';

  document.getElementById('settlements').innerHTML = html;
}

// ============ History Section ============
async function loadHistory() {
  const games = await fetchAPI('/api/games');
  if (!games) return;

  if (!games.length) {
    document.getElementById('history-list').innerHTML =
      '<div class="section-header no-players-message">No games yet</div>';
    return;
  }

  let html = '';
  for (const game of games.slice(0, 10)) {
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
        <div class="result-row">
          <div class="result-left">
            ${sanitizeHTML(r.name)}: ${r.buyins} buy-ins, ${r.chips_returned || 0} back
          </div>
          <div class="result-right ${cls}">
            ${sign}$${r.net_cash}
          </div>
        </div>
      `;
    });

    if (data.settlements && data.settlements.length) {
      html += '<div class="settlement-list">';
      data.settlements.slice(0, 3).forEach(s => {
        html += `<div class="settlement-item">${sanitizeHTML(s)}</div>`;
      });
      html += '</div>';
    }

    html += '</div>';
  }

  document.getElementById('history-list').innerHTML = html;
}

async function resumeGame(id) {
  currentGameId = id;
  showSection('game');
}

async function deleteGame(id) {
  if (!confirm('Delete this game?')) return;

  const result = await fetchAPI(`/api/game/${id}`, { method: 'DELETE' });
  if (result) {
    if (currentGameId === id) currentGameId = null;
    await loadHistory();
  }
}

// ============ Edit Panel Functions ============
function editPlayer(id) {
  document.querySelectorAll('.edit-panel').forEach(p => {
    p.style.display = 'none';
  });
  const panel = document.getElementById(`edit-${id}`);
  if (panel) {
    panel.style.display = (panel.style.display === 'none' || !panel.style.display) ? 'block' : 'none';
  }
}

async function updateChipsReturned(buyinId, delta) {
  const input = document.getElementById(`chips-${buyinId}`);
  const current = parseInt(input.value || '0', 10);
  input.value = Math.max(0, current + delta);
  await saveChipsReturned(buyinId);
}

async function saveChipsReturned(buyinId) {
  const chips = parseInt(document.getElementById(`chips-${buyinId}`).value || '0', 10);
  const result = await fetchAPI('/api/buyins', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: buyinId, field: 'chips_returned', value: chips })
  });

  if (result) {
    await loadExistingGame();
  }
}

async function savePots(buyinId) {
  const potsInput = document.getElementById(`pots-${buyinId}`);
  const pots = parseInt(potsInput.value || '0', 10);
  const chips = Math.max(0, pots * 200);

  const result = await fetchAPI('/api/buyins', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: buyinId, field: 'chips_returned', value: chips })
  });

  if (result) {
    await loadExistingGame();
  }
}

async function updateCash(buyinId, delta) {
  const input = document.getElementById(`cash-${buyinId}`);
  const current = parseInt(input.value || '0', 10);
  input.value = Math.max(0, current + delta);
  await saveCash(buyinId);
}

async function saveCash(buyinId) {
  const cash = parseInt(document.getElementById(`cash-${buyinId}`).value || '0', 10);
  const result = await fetchAPI('/api/buyins', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: buyinId, field: 'cash_return', value: cash })
  });

  if (result) {
    await loadExistingGame();
  }
}