import os
import sqlite3
from datetime import datetime

from flask import Flask, render_template, request, jsonify

app = Flask(__name__)

DB_PATH = os.path.join(os.path.dirname(__file__), "poker.db")


# ---------- Database helpers ----------

def init_db() -> None:
    """Initialize database and seed default players if empty."""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    c.execute(
        """
        CREATE TABLE IF NOT EXISTS players (
            id   INTEGER PRIMARY KEY,
            name TEXT UNIQUE
        )
        """
    )

    c.execute(
        """
        CREATE TABLE IF NOT EXISTS games (
            id   INTEGER PRIMARY KEY,
            date TEXT,
            note TEXT
        )
        """
    )

    c.execute(
        """
        CREATE TABLE IF NOT EXISTS buyins (
            id             INTEGER PRIMARY KEY,
            game_id        INTEGER,
            player_id      INTEGER,
            buyins         INTEGER DEFAULT 0,
            chips_returned INTEGER DEFAULT 0,
            cash_return    INTEGER DEFAULT 0
        )
        """
    )

    # Add default players if none exist
    c.execute("SELECT COUNT(*) FROM players")
    if c.fetchone()[0] == 0:
        default_players = [
            "Venkat",
            "Amar",
            "Anand",
            "Malik",
            "Venku",
            "Ramana",
            "Sunil",
            "Teja",
            "Suveer",
            "Anil",
            "Badri",
            "Tarak",
            "Chandra",
            "Harish B",
            "Giri",
        ]
        for name in default_players:
            try:
                c.execute("INSERT INTO players (name) VALUES (?)", (name,))
            except sqlite3.IntegrityError:
                # Ignore duplicates if they somehow exist
                pass

    conn.commit()
    conn.close()


def get_db() -> sqlite3.Connection:
    """Return a DB connection with row_factory set."""
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    return conn


# ---------- Routes: UI ----------

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/players")
def players_page():
    return render_template("players.html")


# ---------- Routes: Players ----------

@app.route("/api/players", methods=["GET", "POST"])
def handle_players():
    conn = get_db()

    if request.method == "POST":
        name = request.json.get("name", "").strip()
        if not name:
            conn.close()
            return jsonify({"error": "Name required"}), 400

        try:
            conn.execute("INSERT INTO players (name) VALUES (?)", (name,))
            conn.commit()
            conn.close()
            return jsonify({"success": True})
        except sqlite3.IntegrityError:
            conn.close()
            return jsonify({"error": "Already exists"}), 400

    # GET
    players = conn.execute("SELECT * FROM players ORDER BY name").fetchall()
    conn.close()
    return jsonify([dict(p) for p in players])


@app.route("/api/players/<int:player_id>", methods=["DELETE"])
def delete_player(player_id: int):
    conn = get_db()
    conn.execute("DELETE FROM buyins WHERE player_id = ?", (player_id,))
    conn.execute("DELETE FROM players WHERE id = ?", (player_id,))
    conn.commit()
    conn.close()
    return jsonify({"success": True})


# ---------- Routes: Games ----------

@app.route("/api/games", methods=["GET"])
def list_games():
    conn = get_db()
    games = conn.execute("SELECT * FROM games ORDER BY id DESC").fetchall()
    conn.close()
    return jsonify([dict(g) for g in games])


@app.route("/api/game", methods=["POST"])
def new_game():
    """Create a new game. Players are added separately."""
    conn = get_db()
    date = datetime.now().strftime("%m%d%Y-%H%M")
    conn.execute("INSERT INTO games (date, note) VALUES (?, ?)", (date, ""))
    game_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.commit()
    conn.close()
    return jsonify({"success": True, "game_id": game_id})


@app.route("/api/game/<int:game_id>/add_player", methods=["POST"])
def add_player_to_game(game_id: int):
    conn = get_db()

    player_id = request.json.get("player_id")
    if player_id is None:
        conn.close()
        return jsonify({"error": "player_id required"}), 400

    # Check if player already in game
    existing = conn.execute(
        "SELECT id FROM buyins WHERE game_id = ? AND player_id = ?",
        (game_id, player_id),
    ).fetchone()

    if existing:
        conn.close()
        return jsonify({"error": "Player already in game"}), 400

    buyins = request.json.get("buyins", 0)
    chips_returned = request.json.get("chips_returned", 0)

    conn.execute(
        """
        INSERT INTO buyins (game_id, player_id, buyins, chips_returned)
        VALUES (?, ?, ?, ?)
        """,
        (game_id, player_id, buyins, chips_returned),
    )

    conn.commit()
    conn.close()
    return jsonify({"success": True})


@app.route("/api/game/<int:game_id>", methods=["GET", "DELETE"])
def get_or_delete_game(game_id: int):
    if request.method == "DELETE":
        conn = get_db()
        conn.execute("DELETE FROM buyins WHERE game_id = ?", (game_id,))
        conn.execute("DELETE FROM games WHERE id = ?", (game_id,))
        conn.commit()
        conn.close()
        return jsonify({"success": True})

    # GET
    conn = get_db()
    players = conn.execute(
        """
        SELECT
            b.id   AS buyin_id,
            b.player_id,
            b.buyins,
            b.chips_returned,
            b.cash_return,
            p.name
        FROM buyins b
        JOIN players p ON b.player_id = p.id
        WHERE b.game_id = ?
        """,
        (game_id,),
    ).fetchall()
    conn.close()

    return jsonify({"players": [dict(p) for p in players]})


# ---------- Routes: Buyins / updates ----------

@app.route("/api/buyins", methods=["POST", "PUT"])
def handle_buyins():
    conn = get_db()

    if request.method == "POST":
        data = request.json
        buyin_id = data.get("id")
        buyins = data.get("buyins", 0)
        chips_returned = data.get("chips_returned", 0)

        conn.execute(
            """
            UPDATE buyins
            SET buyins = buyins + ?, chips_returned = chips_returned + ?
            WHERE id = ?
            """,
            (buyins, chips_returned, buyin_id),
        )

    else:  # PUT
        allowed_fields = {"buyins", "chips_returned", "cash_return"}
        field = request.json.get("field")
        value = request.json.get("value", 0)
        buyin_id = request.json.get("id")

        if field not in allowed_fields:
            conn.close()
            return jsonify({"error": "Invalid field"}), 400

        conn.execute(
            f"UPDATE buyins SET {field} = ? WHERE id = ?",
            (value, buyin_id),
        )

    conn.commit()
    conn.close()
    return jsonify({"success": True})


# ---------- Routes: Calculation ----------

@app.route("/api/calculate/<int:game_id>")
def calculate(game_id: int):
    """
    Calculate per-player results and settlement suggestions for a game.

    Assumes:
      - Each buy-in = $40 = 200 chips.
      - Each chip = $0.20.
      - net_cash = value_of_chips_returned + cash_return - buyins_cost.
    """
    conn = get_db()
    players = conn.execute(
        """
        SELECT
            b.buyins,
            b.chips_returned,
            b.cash_return,
            p.name
        FROM buyins b
        JOIN players p ON b.player_id = p.id
        WHERE b.game_id = ?
        """,
        (game_id,),
    ).fetchall()
    conn.close()

    results = []
    for p in players:
        cash_return = p["cash_return"] or 0
        chips_returned = p["chips_returned"] or 0
        buyins = p["buyins"] or 0

        total_chips = buyins * 200
        net = (chips_returned * 0.20) + cash_return - (buyins * 40)
        net_rounded = int(round(net))

        results.append(
            {
                "name": p["name"],
                "buyins": buyins,
                "chips_held": total_chips - chips_returned,
                "chips_returned": chips_returned,
                "cash_return": cash_return,
                "net_cash": net_rounded,
            }
        )

    # Settlements: debtors pay creditors until all nets are zero
    debtors = sorted(
        [r for r in results if r["net_cash"] < 0],
        key=lambda x: x["net_cash"],  # most negative first
    )
    creditors = sorted(
        [r for r in results if r["net_cash"] > 0],
        key=lambda x: -x["net_cash"],  # largest winner first
    )

    settlements = []
    while debtors and creditors:
        d = debtors[0]
        c = creditors[0]

        amt = min(abs(d["net_cash"]), c["net_cash"])
        settlements.append(f"{d['name']} pays {c['name']} ${int(amt)}")

        d["net_cash"] += amt
        c["net_cash"] -= amt

        if d["net_cash"] >= 0:
            debtors.pop(0)
        if c["net_cash"] <= 0:
            creditors.pop(0)

    return jsonify({"results": results, "settlements": settlements})


# ---------- Entry point ----------

# Always initialize DB when the module is imported (Render / gunicorn)
init_db()

if __name__ == "__main__":
    # Local dev server
    app.run(host="0.0.0.0", port=8080)
