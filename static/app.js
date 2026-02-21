// Poker Tracker - Frontend JavaScript

let currentGameId = null;
let currentPlayerId = null;
let currentBuyins = 0;
let currentChips = 0;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Get game ID from DOM if exists
    const gameEl = document.querySelector('.game-info span');
    if (gameEl && document.querySelector('.player-card')) {
        currentGameId = document.querySelector('.player-card').dataset.id ? null : getGameIdFromPage();
    }
    
    setupEventListeners();
});

function getGameIdFromPage() {
    // Try to get game ID from page data
    const playerCards = document.querySelectorAll('.player-card');
    if (playerCards.length > 0) {
        return playerCards[0].closest('.player-list') ? 1 : null;
    }
    return null;
}

function setupEventListeners() {
    // Add player
    document.getElementById('add-player-btn')?.addEventListener('click', addPlayer);
    document.getElementById('new-player-name')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addPlayer();
    });
    
    // Start new game
    document.getElementById('start-game-btn')?.addEventListener('click', startNewGame);
    document.getElementById('new-game-btn')?.addEventListener('click', startNewGame);
    
    // Edit player buttons
    document.querySelectorAll('.btn-edit').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const card = e.target.closest('.player-card');
            openPlayerModal(card.dataset.id, card.dataset.name);
        });
    });
    
    // Player modal - buyin buttons
    document.querySelectorAll('.btn-buyin').forEach(btn => {
        btn.addEventListener('click', () => {
            currentBuyins += parseInt(btn.dataset.amount);
            updateBuyinDisplay();
        });
    });
    
    // Player modal - chip buttons
    document.querySelectorAll('.btn-chips').forEach(btn => {
        btn.addEventListener('click', () => {
            const input = document.getElementById('chips-value');
            input.value = Math.max(0, parseInt(input.value) + parseInt(btn.dataset.delta));
        });
    });
    
    // Save player
    document.getElementById('save-player-btn')?.addEventListener('click', savePlayer);
    
    // Calculate
    document.getElementById('calculate-btn')?.addEventListener('click', calculate);
    
    // Modal close buttons
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
        });
    });
    
    // Close modal on background click
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.add('hidden');
            }
        });
    });
}

async function addPlayer() {
    const input = document.getElementById('new-player-name');
    const name = input.value.trim();
    
    if (!name) return;
    
    const res = await fetch('/api/players', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({name})
    });
    
    const data = await res.json();
    
    if (data.success) {
        input.value = '';
        location.reload(); // Simple refresh to show new player
    } else {
        alert(data.error || 'Failed to add player');
    }
}

async function startNewGame() {
    const res = await fetch('/api/game', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({note: ''})
    });
    
    const data = await res.json();
    
    if (data.success) {
        location.reload();
    }
}

function openPlayerModal(playerId, playerName) {
    currentPlayerId = playerId;
    
    // Find current values from the DOM
    const card = document.querySelector(`.player-card[data-id="${playerId}"]`);
    if (card) {
        const buyinsEl = card.querySelector('.stat .value');
        const chipsEl = card.querySelectorAll('.stat .value')[1];
        
        currentBuyins = parseInt(buyinsEl.textContent) || 0;
        currentChips = parseInt(chipsEl.textContent) || 0;
    } else {
        currentBuyins = 0;
        currentChips = 0;
    }
    
    document.getElementById('modal-player-name').textContent = playerName;
    document.getElementById('chips-value').value = currentChips;
    updateBuyinDisplay();
    
    document.getElementById('player-modal').classList.remove('hidden');
}

function updateBuyinDisplay() {
    // Show current buyins count somewhere visible
    const nameEl = document.getElementById('modal-player-name');
    if (nameEl) {
        nameEl.textContent = `${nameEl.textContent.split(' (')[0]} (${currentBuyins} buy-ins)`;
    }
}

async function savePlayer() {
    const chips = parseInt(document.getElementById('chips-value').value) || 0;
    
    // For a new buyin, we need the game ID - get from data attribute
    const gameInfo = document.querySelector('.game-info');
    let gameId = gameInfo?.dataset.gameId;
    
    if (!gameId || !currentPlayerId) {
        alert('Error: No active game. Refresh and start a new game.');
        return;
    }
    
    // Add buyin (if any) and set chips
    if (currentBuyins > 0 || chips > 0) {
        const res = await fetch('/api/buyins', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                game_id: parseInt(gameId),
                player_id: parseInt(currentPlayerId),
                buyins: currentBuyins,
                chips: chips
            })
        });
        
        const data = await res.json();
        
        if (data.success) {
            document.getElementById('player-modal').classList.add('hidden');
            location.reload();
        } else {
            alert('Error saving: ' + JSON.stringify(data));
        }
    } else {
        // Just update chips
        const res = await fetch('/api/buyins?game_id=' + gameId);
        const data = await res.json();
        
        if (data.buyins) {
            const buyin = data.buyins.find(b => b.player_id == currentPlayerId);
            if (buyin) {
                await fetch('/api/buyins', {
                    method: 'PUT',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        id: buyin.id,
                        field: 'chips',
                        value: chips
                    })
                });
            }
        }
        
        document.getElementById('player-modal').classList.add('hidden');
        location.reload();
    }
}

async function calculate() {
    // Get game ID
    let gameId = null;
    
    // From player cards
    const cards = document.querySelectorAll('.player-card');
    if (cards.length > 0) {
        // We need to fetch the buyins to get game_id
        const res = await fetch('/api/buyins?game_id=1');
        const data = await res.json();
        if (data.buyins && data.buyins.length > 0) {
            gameId = data.buyins[0].game_id;
        }
    }
    
    if (!gameId) {
        alert('No active game');
        return;
    }
    
    const res = await fetch('/api/calculate', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({game_id: gameId})
    });
    
    const data = await res.json();
    
    // Display results
    const resultsBody = document.getElementById('results-body');
    resultsBody.innerHTML = data.results.map(r => {
        const netClass = r.net_cash > 0 ? 'positive' : r.net_cash < 0 ? 'negative' : '';
        return `
            <div class="result-row">
                <span class="name">${r.name}</span>
                <span>${r.buyins} buy-ins, ${r.chips} chips → $${r.net_cash}</span>
            </div>
        `;
    }).join('');
    
    document.getElementById('settlements-list').innerHTML = 
        data.settlements.length > 0 
            ? data.settlements.map(s => `<li>${s}</li>`).join('')
            : '<li>All square!</li>';
    
    document.getElementById('results-modal').classList.remove('hidden');
}
