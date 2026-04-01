# 🐉 Minecraft Speedrunner Bot

AI bot that learns to beat the Ender Dragon through reinforcement learning.

## Setup (one time)

```
cd minecraft_speedrunner
npm install
```

## How to Run

1. Open **Minecraft Java Edition 1.21.10**
2. Create/open a **Survival** world
3. Press **Escape → Open to LAN**
4. Set the port to **55615** and click **Start LAN World**
5. Run the bot:

```
node main.js            # Single speedrun attempt
node main.js --train    # RL training (dies, learns, repeats forever)
node stats.js           # View training progress
```

That's it. The bot connects automatically.

## What Happens

**Single run** — The bot tries one full speedrun (wood → tools → iron → nether → dragon).

**Training mode** — The bot plays over and over. After each death it adjusts its strategy (resource amounts, timeouts, combat settings) and tries again. Leave it running overnight. Progress saves to `rl_data.json` automatically. Stop with `Ctrl+C`, resume anytime.

## Speedrun Route

1. 🌲 Punch trees, craft tools
2. ⛏️ Mine stone & iron, smelt
3. 🛡️ Iron gear, bucket, shield, food
4. 🟣 Build nether portal (water bucket + lava)
5. 🔥 Find fortress, kill blazes, get ender pearls
6. 👁️ Craft eyes of ender, find stronghold
7. 🐉 Enter The End, destroy crystals, kill dragon

## RL Rewards

| Event | Points |
|-------|--------|
| Wooden tools | +10 |
| Stone tools | +20 |
| Iron gear | +40 |
| Nether portal | +60 |
| Blaze rods | +80 |
| Ender pearls | +85 |
| Found stronghold | +90 |
| **Dragon killed** | **+1000** |
| Death | -50 |
| Timeout | -30 |
| Per minute | -1 |

## Tips

- Set difficulty to **Easy** for early training
- Use a **plains biome seed** for easier navigation  
- You can walk next to the bot in-game and watch it play
- Check `node stats.js` to see how it's improving

## Files

```
main.js     → Run this (single run or --train)
phases.js   → 7-phase speedrun logic
utils.js    → Crafting, mining, combat helpers
stats.js    → View training stats
rl_data.json → Auto-saved training progress
```

Built by AIencoder 🤖
