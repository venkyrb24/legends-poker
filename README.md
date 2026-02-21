# 🃏 Poker Tracker App

iPhone-optimized cash game poker tracker with automatic settlements.

## Quick Start

```bash
cd poker-app
source venv/bin/activate
python app.py
```

Access at: **http://10.0.0.166:5000**

## iPhone Setup

1. Connect iPhone to same WiFi as Mac Mini
2. Open Safari → visit http://10.0.0.166:5000
3. Tap Share → "Add to Home Screen"
4. Enable "Allow JavaScript" if prompted

## Always-On Setup (Optional)

```bash
# Install tmux
brew install tmux

# Start a persistent session
tmux new -s poker

# Inside tmux:
cd poker-app
source venv/bin/activate
python app.py

# Detach: Ctrl+B, then D
# Reattach: tmux attach -t poker
```

## Usage

1. **Add Players** - Type names and tap "Add Player"
2. **Start Game** - Tap "Start New Game"
3. **Buy-ins** - Tap a player → "+1/+2/+3" buttons
4. **Cash Out** - Enter chips at end of game
5. **Calculate** - Tap "Calculate Settlements" → see who pays whom

## Formula

- Buy-in: $40 = 200 chips
- Cash out: `round(chips / 20 * 10)` → nearest $10
- Net: `(buyins × 40) - chip_value`

Example: 3 buy-ins ($120) + 110 chips ($60) → net +$60 (owed)
