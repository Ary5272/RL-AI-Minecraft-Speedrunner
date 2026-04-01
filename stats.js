/**
 * 📊 Training Stats - Run: node stats.js
 */
const fs = require('fs')
const path = require('path')
const FILE = path.join(__dirname, 'rl_data.json')

if (!fs.existsSync(FILE)) { console.log('No training data yet! Run: node main.js --train'); process.exit(0) }
const d = JSON.parse(fs.readFileSync(FILE, 'utf8'))

console.log('\n╔══════════════════════════════════════════╗')
console.log('║       📊 SPEEDRUN RL TRAINING STATS       ║')
console.log('╚══════════════════════════════════════════╝')
console.log(`\nEpisodes: ${d.episode}  |  Best Score: ${d.bestScore}  |  Explore: ${(d.explorationRate * 100).toFixed(1)}%`)

if (d.bestParams) {
  console.log(`\n🏆 Best Params: Wood:${d.bestParams.minWoodLogs} Iron:${d.bestParams.minIronOre} Food:${d.bestParams.minFood} FleeHP:${d.bestParams.fleeHealthThreshold}`)
}
console.log(`⚙️  Current:     Wood:${d.params.minWoodLogs} Iron:${d.params.minIronOre} Food:${d.params.minFood} FleeHP:${d.params.fleeHealthThreshold}`)

if (d.history?.length) {
  console.log('\n📜 Recent Episodes:')
  console.log('─'.repeat(70))
  console.log('  Ep  | Reward  | Phase | Death                 | Time')
  console.log('─'.repeat(70))
  for (const ep of d.history.slice(-15)) {
    console.log(`  ${String(ep.episode).padStart(3)} | ${String(ep.totalReward.toFixed(1)).padStart(7)} |   ${ep.maxPhase + 1}   | ${(ep.deathCause||'survived').substring(0,21).padEnd(21)} | ${(ep.timeElapsed/60).toFixed(1)}m`)
  }
  console.log('─'.repeat(70))

  // Phase distribution
  const pc = new Array(7).fill(0)
  for (const ep of d.history) pc[ep.maxPhase]++
  const names = ['Wood','Stone','Gear','Portal','Nether','Stronghold','End']
  const total = d.history.length
  console.log('\n📊 Phase Distribution:')
  for (let i = 0; i < 7; i++) {
    const pct = ((pc[i]/total)*100).toFixed(0)
    console.log(`   Phase ${i+1} (${names[i].padEnd(10)}): ${'█'.repeat(Math.round(pc[i]/total*30))} ${pct}% (${pc[i]})`)
  }

  // Death causes
  const causes = {}
  for (const ep of d.history) causes[ep.deathCause||'survived'] = (causes[ep.deathCause||'survived']||0) + 1
  console.log('\n💀 Deaths:')
  for (const [c, n] of Object.entries(causes).sort((a,b) => b[1]-a[1])) {
    console.log(`   ${c}: ${n} (${((n/total)*100).toFixed(0)}%)`)
  }

  // Reward trend
  const last = d.history.slice(-10)
  const mx = Math.max(...last.map(e=>e.totalReward)), mn = Math.min(...last.map(e=>e.totalReward))
  const rng = mx - mn || 1
  console.log('\n📈 Reward Trend:')
  for (const ep of last) {
    const bar = Math.round(((ep.totalReward-mn)/rng)*25)
    console.log(`   Ep ${String(ep.episode).padStart(3)}: ${'█'.repeat(bar)}${'░'.repeat(25-bar)} ${ep.totalReward.toFixed(1)}`)
  }
}
console.log('')
