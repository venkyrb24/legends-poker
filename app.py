import sqlite3
import os
from flask import Flask, render_template, request, jsonify

app = Flask(__name__)
DB_PATH = os.path.join(os.path.dirname(__file__), 'poker.db')

def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS players (id INTEGER PRIMARY KEY, name TEXT UNIQUE)''')
    c.execute('''CREATE TABLE IF NOT EXISTS games (id INTEGER PRIMARY KEY, date TEXT, note TEXT)''')
    c.execute('''CREATE TABLE IF NOT EXISTS buyins (id INTEGER PRIMARY KEY, game_id INTEGER, player_id INTEGER, buyins INTEGER DEFAULT 0, chips_returned INTEGER DEFAULT 0, cash_return INTEGER DEFAULT 0)''')
    conn.commit()
    conn.close()

def get_db():
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    return conn

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/players', methods=['GET', 'POST'])
def handle_players():
    conn = get_db()
    if request.method == 'POST':
        name = request.json.get('name', '').strip()
        if name:
            try:
                conn.execute('INSERT INTO players (name) VALUES (?)', (name,))
                conn.commit()
                return jsonify({'success': True})
            except:
                return jsonify({'error': 'Already exists'})
        return jsonify({'error': 'Name required'})
    players = conn.execute('SELECT * FROM players ORDER BY name').fetchall()
    conn.close()
    return jsonify([dict(p) for p in players])

@app.route('/api/games', methods=['GET'])
def list_games():
    conn = get_db()
    games = conn.execute('SELECT * FROM games ORDER BY id DESC').fetchall()
    conn.close()
    return jsonify([dict(g) for g in games])

@app.route('/api/game', methods=['POST'])
def new_game():
    conn = get_db()
    from datetime import datetime
    date = datetime.now().strftime('%m%d%Y-%H%M')
    conn.execute('INSERT INTO games (date, note) VALUES (?, ?)', (date, ''))
    game_id = conn.execute('SELECT last_insert_rowid()').fetchone()[0]
    # Don't add all players - let user select
    conn.commit()
    conn.close()
    return jsonify({'success': True, 'game_id': game_id})

@app.route('/api/game/<int:game_id>/add_player', methods=['POST'])
def add_player_to_game(game_id):
    conn = get_db()
    player_id = request.json.get('player_id')
    
    # Check if player already in game
    existing = conn.execute('SELECT id FROM buyins WHERE game_id = ? AND player_id = ?', 
                          (game_id, player_id)).fetchone()
    if existing:
        conn.close()
        return jsonify({'error': 'Player already in game'}), 400
    
    buyins = request.json.get('buyins', 0)
    chips_returned = request.json.get('chips_returned', 0)
    conn.execute('INSERT INTO buyins (game_id, player_id, buyins, chips_returned) VALUES (?, ?, ?, ?)', 
                (game_id, player_id, buyins, chips_returned))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

@app.route('/api/players/<int:player_id>', methods=['DELETE'])
def delete_player(player_id):
    conn = get_db()
    conn.execute('DELETE FROM buyins WHERE player_id = ?', (player_id,))
    conn.execute('DELETE FROM players WHERE id = ?', (player_id,))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

@app.route('/api/game/<int:game_id>', methods=['GET', 'DELETE'])
def get_or_delete_game(game_id):
    if request.method == 'DELETE':
        conn = get_db()
        conn.execute('DELETE FROM buyins WHERE game_id = ?', (game_id,))
        conn.execute('DELETE FROM games WHERE id = ?', (game_id,))
        conn.commit()
        conn.close()
        return jsonify({'success': True})
    
    # GET
    conn = get_db()
    players = conn.execute('''
        SELECT b.id as buyin_id, b.buyins, b.chips_returned, b.cash_return, p.name 
        FROM buyins b JOIN players p ON b.player_id = p.id 
        WHERE b.game_id = ?
    ''', (game_id,)).fetchall()
    conn.close()
    return jsonify({'players': [dict(p) for p in players]})

@app.route('/api/buyins', methods=['POST', 'PUT'])
def handle_buyins():
    conn = get_db()
    if request.method == 'POST':
        data = request.json
        buyin_id = data.get('id')
        buyins = data.get('buyins', 0)
        chips_returned = data.get('chips_returned', 0)
        conn.execute('UPDATE buyins SET buyins = buyins + ?, chips_returned = chips_returned + ? WHERE id = ?',
                    (buyins, chips_returned, buyin_id))
    else:
        field = request.json.get('field')
        value = request.json.get('value', 0)
        buyin_id = request.json.get('id')
        conn.execute(f'UPDATE buyins SET {field} = ? WHERE id = ?', (value, buyin_id))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

@app.route('/api/calculate/<int:game_id>')
def calculate(game_id):
    conn = get_db()
    players = conn.execute('''
        SELECT b.buyins, b.chips_returned, b.cash_return, p.name 
        FROM buyins b JOIN players p ON b.player_id = p.id 
        WHERE b.game_id = ?
    ''', (game_id,)).fetchall()
    conn.close()
    
    results = []
    for p in players:
        # At player level, don't cap - they can win chips
        cash_return = p['cash_return'] or 0
        chips_returned = p['chips_returned'] or 0
        total_chips = p['buyins'] * 200
        # Net = value of chips returned + cash returned - money paid for buy-ins
        net = (chips_returned * 0.20) + cash_return - (p['buyins'] * 40)
        results.append({'name': p['name'], 'buyins': p['buyins'], 'chips_held': total_chips - chips_returned, 'chips_returned': chips_returned, 'cash_return': cash_return, 'net_cash': int(net)})
    
    # Settlements
    debtors = sorted([r for r in results if r['net_cash'] < 0], key=lambda x: -x['net_cash'])
    creditors = sorted([r for r in results if r['net_cash'] > 0], key=lambda x: -x['net_cash'])
    
    settlements = []
    while debtors and creditors:
        d = debtors[0]; c = creditors[0]
        amt = min(abs(d['net_cash']), c['net_cash'])
        settlements.append(f"{d['name']} pays {c['name']} ${int(amt)}")
        d['net_cash'] += amt; c['net_cash'] -= amt
        if d['net_cash'] >= 0: debtors.pop(0)
        if c['net_cash'] <= 0: creditors.pop(0)
    
    return jsonify({'results': results, 'settlements': settlements})

if __name__ == '__main__':
    init_db()
    app.run(host='0.0.0.0', port=8080)
