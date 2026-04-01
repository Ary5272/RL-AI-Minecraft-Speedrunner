/**
 * 🐉 Minecraft Speedrunner Bot
 * 
 *   node main.js            → Train (plays, dies, learns, repeats until dragon dies)
 *   node main.js speedrun   → Speedrun using best learned strategy
 *   node main.js stats      → Show training stats
 */

const fs = require('fs')
const path = require('path')
const mineflayer = require('mineflayer')
const { pathfinder, Movements } = require('mineflayer-pathfinder')
const collectBlock = require('mineflayer-collectblock').plugin
const BotUtils = require('./utils')
const SpeedrunPhases = require('./phases')

// ═══════════════════════════════════
// CONFIG - HARDCODED, NO ARGS NEEDED
// ═══════════════════════════════════
const HOST = 'localhost'
const PORT = 55615
const USERNAME = 'SpeedrunBot'
const VERSION = false
const RL_FILE = path.join(__dirname, 'rl_data.json')

const MODE = process.argv[2] || 'train'  // train, speedrun, or stats

// ═══════════════════════════════════
// DEFAULT STRATEGY PARAMS
// ═══════════════════════════════════
const DEFAULT_PARAMS = {
  minWoodLogs: 16, minCobblestone: 20, minIronOre: 10, minFood: 10,
  minBlazeRods: 7, minEnderPearls: 12, fleeHealthThreshold: 6, searchRadius: 64,
  phase1Timeout: 300, phase2Timeout: 600, phase3Timeout: 300, phase4Timeout: 600,
  phase5Timeout: 900, phase6Timeout: 600, phase7Timeout: 600,
}

const BOUNDS = {
  minWoodLogs:    { min: 8, max: 32, step: 2 },
  minCobblestone: { min: 10, max: 40, step: 5 },
  minIronOre:     { min: 5, max: 20, step: 1 },
  minFood:        { min: 5, max: 20, step: 2 },
  minBlazeRods:   { min: 5, max: 12, step: 1 },
  minEnderPearls: { min: 8, max: 16, step: 1 },
  fleeHealthThreshold: { min: 2, max: 12, step: 1 },
  searchRadius:   { min: 32, max: 128, step: 16 },
  phase1Timeout:  { min: 120, max: 600, step: 30 },
  phase2Timeout:  { min: 300, max: 900, step: 60 },
  phase3Timeout:  { min: 120, max: 600, step: 30 },
  phase4Timeout:  { min: 300, max: 1200, step: 60 },
  phase5Timeout:  { min: 600, max: 1800, step: 60 },
  phase6Timeout:  { min: 300, max: 1200, step: 60 },
  phase7Timeout:  { min: 300, max: 900, step: 60 },
}

const REWARDS = {
  wooden_tools: 10, stone_tools: 20, iron_smelted: 30, full_iron_gear: 40,
  nether_portal: 60, entered_nether: 70, blaze_rods: 80, ender_pearls: 85,
  found_stronghold: 90, entered_end: 95, dragon_killed: 1000,
  death: -50, timeout: -30, per_minute: -1,
}

// ═══════════════════════════════════
// RL AGENT - learns between episodes
// ═══════════════════════════════════
class RLAgent {
  constructor() {
    this.params = { ...DEFAULT_PARAMS }
    this.history = []
    this.episode = 0
    this.bestScore = -Infinity
    this.bestParams = null
    this.learningRate = 0.3
    this.explorationRate = 0.4
    this.dragonKilled = false
    this.load()
  }

  getTrainingParams() {
    const p = { ...this.params }
    // Sometimes explore with random mutations
    if (Math.random() < this.explorationRate) {
      const keys = Object.keys(BOUNDS)
      const n = 1 + Math.floor(Math.random() * 3)
      for (let i = 0; i < n; i++) {
        const k = keys[Math.floor(Math.random() * keys.length)]
        const b = BOUNDS[k]
        const noise = (Math.random() - 0.5) * (b.max - b.min) * 0.3
        p[k] = Math.max(b.min, Math.min(b.max, Math.round((p[k] + noise) / b.step) * b.step))
      }
    }
    return p
  }

  getSpeedrunParams() {
    // Use the best known params, no exploration
    return this.bestParams ? { ...this.bestParams } : { ...this.params }
  }

  record(result) {
    this.episode++
    this.history.push({ episode: this.episode, ...result, timestamp: new Date().toISOString() })

    if (result.totalReward > this.bestScore) {
      this.bestScore = result.totalReward
      this.bestParams = { ...result.params }
      console.log(`\n  🏆 NEW BEST SCORE: ${result.totalReward.toFixed(1)} (episode ${this.episode})`)
    }

    if (result.milestones.includes('dragon_killed')) {
      this.dragonKilled = true
      console.log('\n  🐉🎉 THE DRAGON HAS BEEN SLAIN! Bot learned to beat the game!')
    }

    // Learn from result
    const avg = this.history.length > 1
      ? this.history.slice(-20).reduce((s, h) => s + h.totalReward, 0) / Math.min(20, this.history.length) : 0
    const advantage = result.totalReward - avg

    if (advantage > 0) {
      // Good run — move toward these params
      for (const k of Object.keys(BOUNDS)) {
        const diff = result.params[k] - this.params[k]
        this.params[k] += diff * this.learningRate * 0.5
        const b = BOUNDS[k]
        this.params[k] = Math.max(b.min, Math.min(b.max, Math.round(this.params[k] / b.step) * b.step))
      }
    } else if (advantage < -20 && this.bestParams) {
      // Bad run — revert toward best
      for (const k of Object.keys(BOUNDS)) {
        const diff = this.bestParams[k] - this.params[k]
        this.params[k] += diff * this.learningRate * 0.3
        const b = BOUNDS[k]
        this.params[k] = Math.max(b.min, Math.min(b.max, Math.round(this.params[k] / b.step) * b.step))
      }
    }

    // Specific learning from death causes
    if (result.deathCause === 'timeout') {
      const tk = `phase${result.maxPhase + 1}Timeout`
      if (BOUNDS[tk]) this.params[tk] = Math.min(BOUNDS[tk].max, this.params[tk] + BOUNDS[tk].step)
    }
    if (result.deathCause?.includes('killed') || result.deathCause?.includes('death')) {
      this.params.minFood = Math.min(BOUNDS.minFood.max, this.params.minFood + BOUNDS.minFood.step)
      this.params.fleeHealthThreshold = Math.min(BOUNDS.fleeHealthThreshold.max, this.params.fleeHealthThreshold + 1)
    }

    // Decay exploration and learning rate
    this.explorationRate = Math.max(0.05, this.explorationRate * 0.995)
    this.learningRate = Math.max(0.05, this.learningRate * 0.998)

    this.save()
  }

  printStatus() {
    const last5 = this.history.slice(-5)
    const avgR = last5.length ? (last5.reduce((s, h) => s + h.totalReward, 0) / last5.length).toFixed(1) : '?'
    const avgP = last5.length ? (last5.reduce((s, h) => s + (h.maxPhase + 1), 0) / last5.length).toFixed(1) : '?'
    console.log(`\n  ╔═══ TRAINING STATUS ════════════════════════════╗`)
    console.log(`  ║ Episode: ${String(this.episode).padEnd(6)} Best Score: ${String(this.bestScore.toFixed(1)).padEnd(10)} ║`)
    console.log(`  ║ Avg Reward(5): ${String(avgR).padEnd(8)} Avg Phase(5): ${String(avgP).padEnd(6)} ║`)
    console.log(`  ║ Explore: ${String((this.explorationRate * 100).toFixed(0) + '%').padEnd(6)} Dragon Killed: ${this.dragonKilled ? '✅ YES' : '❌ Not yet'}  ║`)
    console.log(`  ║ Params: Wood=${this.params.minWoodLogs} Iron=${this.params.minIronOre} Food=${this.params.minFood} FleeHP=${this.params.fleeHealthThreshold} ║`)
    console.log(`  ╚═════════════════════════════════════════════════╝\n`)
  }

  save() {
    try {
      fs.writeFileSync(RL_FILE, JSON.stringify({
        params: this.params, bestParams: this.bestParams, bestScore: this.bestScore,
        episode: this.episode, learningRate: this.learningRate,
        explorationRate: this.explorationRate, dragonKilled: this.dragonKilled,
        history: this.history.slice(-200)
      }, null, 2))
    } catch (e) {}
  }

  load() {
    try {
      if (fs.existsSync(RL_FILE)) {
        const d = JSON.parse(fs.readFileSync(RL_FILE, 'utf8'))
        this.params = d.params || { ...DEFAULT_PARAMS }
        this.bestParams = d.bestParams
        this.bestScore = d.bestScore ?? -Infinity
        this.episode = d.episode || 0
        this.learningRate = d.learningRate ?? 0.3
        this.explorationRate = d.explorationRate ?? 0.4
        this.dragonKilled = d.dragonKilled || false
        this.history = d.history || []
        console.log(`  📂 Loaded: ${this.episode} episodes | Best: ${this.bestScore.toFixed(1)} | Dragon: ${this.dragonKilled ? '✅' : '❌'}`)
      } else {
        console.log('  📂 No previous training data — starting fresh!')
      }
    } catch (e) { console.log('  📂 Starting fresh!') }
  }
}

// ═══════════════════════════════════
// RUN ONE EPISODE
// ═══════════════════════════════════
function runEpisode(params, label = 'Episode') {
  return new Promise((resolve) => {
    const startTime = Date.now()
    let deathCause = null, maxPhase = 0, milestones = [], totalReward = 0, resolved = false

    function finish() {
      if (resolved) return
      resolved = true
      const minutes = (Date.now() - startTime) / 60000
      totalReward += minutes * REWARDS.per_minute
      resolve({ totalReward, maxPhase, deathCause, milestones,
        timeElapsed: (Date.now() - startTime) / 1000, params: { ...params } })
    }

    console.log(`  Connecting to localhost:${PORT}...`)

    const bot = mineflayer.createBot({ host: HOST, port: PORT, username: USERNAME, version: VERSION })
    bot.loadPlugin(pathfinder)
    bot.loadPlugin(collectBlock)

    bot.on('death', () => {
      deathCause = deathCause || 'death'
      totalReward += REWARDS.death
      console.log('  💀 Bot died!')
    })

    bot.on('error', (err) => {
      console.log(`  ❌ Error: ${err.message}`)
      if (err.message.includes('ECONNREFUSED')) {
        console.log('  Make sure Minecraft is open with LAN on port 55615!')
      }
      finish()
    })

    bot.on('kicked', (reason) => { console.log(`  ❌ Kicked: ${reason}`); finish() })
    bot.on('end', () => finish())

    bot.on('spawn', async () => {
      try {
        const mcData = require('minecraft-data')(bot.version)
        const movements = new Movements(bot)
        movements.allowSprinting = true
        movements.canDig = true
        bot.pathfinder.setMovements(movements)

        const utils = new BotUtils(bot, mcData)
        const speedrun = new SpeedrunPhases(bot, mcData, utils, params)

        console.log(`  ✅ Connected! Version: ${bot.version}`)
        console.log(`  ⏱️  ${label} starting in 3 seconds...`)
        await utils.sleep(3000)
        bot.chat(`${label} starting!`)

        const phases = [
          () => speedrun.phase1_WoodAndTools(),
          () => speedrun.phase2_StoneAndIron(),
          () => speedrun.phase3_GearUp(),
          () => speedrun.phase4_NetherPortal(),
          () => speedrun.phase5_Nether(),
          () => speedrun.phase6_EyeOfEnder(),
          () => speedrun.phase7_TheEnd()
        ]

        for (let i = 0; i < phases.length; i++) {
          speedrun.currentPhase = i
          maxPhase = i
          const timeout = (params[`phase${i + 1}Timeout`] || 600) * 1000

          try {
            await Promise.race([
              phases[i](),
              new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeout))
            ])

            // Collect milestone rewards
            const newMs = speedrun.milestones.filter(m => !milestones.includes(m))
            for (const m of newMs) { milestones.push(m); totalReward += (REWARDS[m] || 0) }

          } catch (phaseErr) {
            if (phaseErr.message === 'timeout') {
              deathCause = 'timeout'
              totalReward += REWARDS.timeout
              console.log(`  ⏰ Phase ${i + 1} timed out!`)
            } else {
              deathCause = deathCause || phaseErr.message
              console.log(`  ❌ Phase ${i + 1} error: ${phaseErr.message}`)
            }
            break
          }
        }

        // Check if dragon was killed
        const finalMs = speedrun.milestones.filter(m => !milestones.includes(m))
        for (const m of finalMs) { milestones.push(m); totalReward += (REWARDS[m] || 0) }

        if (milestones.includes('dragon_killed')) {
          bot.chat(`DRAGON KILLED! Speedrun time: ${speedrun.elapsed()} 🐉🎉`)
        }

      } catch (err) {
        deathCause = deathCause || err.message
        console.log(`  ❌ Error: ${err.message}`)
      }

      try { bot.quit() } catch (e) {}
      finish()
    })
  })
}

// ═══════════════════════════════════
// SHOW STATS
// ═══════════════════════════════════
function showStats() {
  if (!fs.existsSync(RL_FILE)) {
    console.log('\n  No training data yet! Run: node main.js\n')
    return
  }
  const d = JSON.parse(fs.readFileSync(RL_FILE, 'utf8'))

  console.log('\n  ╔══════════════════════════════════════════════╗')
  console.log('  ║         📊 SPEEDRUN TRAINING STATS            ║')
  console.log('  ╚══════════════════════════════════════════════╝')
  console.log(`\n  Episodes: ${d.episode}  |  Best: ${d.bestScore?.toFixed(1)}  |  Dragon: ${d.dragonKilled ? '✅ YES!' : '❌ Not yet'}`)

  if (d.bestParams) {
    console.log(`\n  🏆 Best Params:`)
    console.log(`     Wood:${d.bestParams.minWoodLogs} Stone:${d.bestParams.minCobblestone} Iron:${d.bestParams.minIronOre} Food:${d.bestParams.minFood}`)
    console.log(`     Blaze:${d.bestParams.minBlazeRods} Pearls:${d.bestParams.minEnderPearls} FleeHP:${d.bestParams.fleeHealthThreshold}`)
  }

  if (d.history?.length) {
    console.log('\n  📜 Last 15 Episodes:')
    console.log('  ' + '─'.repeat(65))
    console.log('    Ep  | Reward  | Phase | Death                 | Time')
    console.log('  ' + '─'.repeat(65))
    for (const ep of d.history.slice(-15)) {
      const num = String(ep.episode).padStart(4)
      const rew = String(ep.totalReward.toFixed(1)).padStart(7)
      const ph = String(ep.maxPhase + 1).padStart(2)
      const death = (ep.deathCause || 'survived').substring(0, 21).padEnd(21)
      const time = (ep.timeElapsed / 60).toFixed(1) + 'm'
      console.log(`    ${num} | ${rew} |   ${ph}  | ${death} | ${time}`)
    }
    console.log('  ' + '─'.repeat(65))

    // Phase distribution
    const pc = new Array(7).fill(0), total = d.history.length
    for (const ep of d.history) pc[ep.maxPhase]++
    const names = ['Wood','Stone','Gear','Portal','Nether','Stronghold','End']
    console.log('\n  📊 Furthest Phase Reached:')
    for (let i = 0; i < 7; i++) {
      const pct = ((pc[i] / total) * 100).toFixed(0)
      console.log(`     Phase ${i + 1} ${names[i].padEnd(10)}: ${'█'.repeat(Math.round(pc[i] / total * 25))} ${pct}% (${pc[i]})`)
    }

    // Death causes
    const causes = {}
    for (const ep of d.history) causes[ep.deathCause || 'survived'] = (causes[ep.deathCause || 'survived'] || 0) + 1
    console.log('\n  💀 Death Causes:')
    for (const [c, n] of Object.entries(causes).sort((a, b) => b[1] - a[1])) {
      console.log(`     ${c}: ${n} (${((n / total) * 100).toFixed(0)}%)`)
    }
  }
  console.log('')
}

// ═══════════════════════════════════
// TRAINING LOOP
// ═══════════════════════════════════
async function train() {
  console.log('\n  ╔══════════════════════════════════════════════╗')
  console.log('  ║   🧠 TRAINING MODE                            ║')
  console.log('  ║   Bot plays, dies, learns, repeats.           ║')
  console.log('  ║   Keeps going until it beats the dragon!      ║')
  console.log('  ║   Ctrl+C to stop (progress auto-saves)        ║')
  console.log('  ╚══════════════════════════════════════════════╝\n')

  const agent = new RLAgent()

  for (let ep = agent.episode; ep < 10000; ep++) {
    console.log(`\n${'═'.repeat(50)}`)
    console.log(`  🎮 TRAINING EPISODE ${ep + 1}`)
    console.log('═'.repeat(50))

    const params = agent.getTrainingParams()
    const result = await runEpisode(params, `Training #${ep + 1}`)
    agent.record(result)

    // Summary
    const phaseNames = ['Wood','Stone','Gear','Portal','Nether','Stronghold','End']
    console.log(`\n  📋 Episode ${ep + 1} Result:`)
    console.log(`     Reward: ${result.totalReward.toFixed(1)} | Reached: Phase ${result.maxPhase + 1} (${phaseNames[result.maxPhase]})`)
    console.log(`     ${result.deathCause ? '💀 ' + result.deathCause : '✅ Survived'} | Time: ${(result.timeElapsed / 60).toFixed(1)}m`)
    if (result.milestones.length) console.log(`     Milestones: ${result.milestones.join(', ')}`)

    agent.printStatus()

    // If dragon killed, celebrate but keep training to get faster
    if (result.milestones.includes('dragon_killed')) {
      console.log('\n  🐉🎉🎉🎉 DRAGON KILLED! THE BOT DID IT! 🎉🎉🎉🐉')
      console.log('  Continuing to train for faster times...\n')
    }

    console.log('  ⏳ Next episode in 10 seconds... (Ctrl+C to stop)\n')
    await new Promise(r => setTimeout(r, 10000))
  }
}

// ═══════════════════════════════════
// SPEEDRUN MODE
// ═══════════════════════════════════
async function speedrun() {
  console.log('\n  ╔══════════════════════════════════════════════╗')
  console.log('  ║   🐉 SPEEDRUN MODE                            ║')
  console.log('  ║   Using best learned strategy!                ║')
  console.log('  ╚══════════════════════════════════════════════╝\n')

  const agent = new RLAgent()

  if (!agent.bestParams) {
    console.log('  ⚠️  No training data found! Using default params.')
    console.log('  Run "node main.js" first to train the bot.\n')
  } else {
    console.log(`  Using best params from episode ${agent.episode} (score: ${agent.bestScore.toFixed(1)})`)
    console.log(`  Wood:${agent.bestParams.minWoodLogs} Iron:${agent.bestParams.minIronOre} Food:${agent.bestParams.minFood} FleeHP:${agent.bestParams.fleeHealthThreshold}\n`)
  }

  const params = agent.getSpeedrunParams()
  const result = await runEpisode(params, '🐉 SPEEDRUN')

  console.log(`\n  ${'═'.repeat(50)}`)
  console.log(`  🐉 SPEEDRUN RESULT:`)
  console.log(`     Reward: ${result.totalReward.toFixed(1)}`)
  console.log(`     Furthest Phase: ${result.maxPhase + 1}/7`)
  console.log(`     ${result.deathCause ? '💀 ' + result.deathCause : '🎉 SURVIVED'}`)
  console.log(`     Time: ${(result.timeElapsed / 60).toFixed(1)} minutes`)
  if (result.milestones.length) console.log(`     Milestones: ${result.milestones.join(', ')}`)
  if (result.milestones.includes('dragon_killed')) {
    console.log(`\n  🐉🎉 SPEEDRUN COMPLETE! THE DRAGON IS DEAD! 🎉🐉`)
  }
  console.log(`  ${'═'.repeat(50)}\n`)
}

// ═══════════════════════════════════
// MAIN
// ═══════════════════════════════════
console.log('')
console.log('  🐉 MINECRAFT SPEEDRUNNER BOT')
console.log(`  Port: ${PORT} | Version: ${VERSION}`)
console.log(`  Mode: ${MODE}`)

if (MODE === 'stats') {
  showStats()
} else if (MODE === 'speedrun') {
  process.on('SIGINT', () => { console.log('\n  Stopped!'); process.exit(0) })
  speedrun().catch(console.error)
} else {
  // Default: train
  process.on('SIGINT', () => { console.log('\n\n  🛑 Training stopped! Progress saved to rl_data.json'); process.exit(0) })
  train().catch(console.error)
}