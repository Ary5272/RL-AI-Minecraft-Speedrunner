const { goals } = require('mineflayer-pathfinder')
const Vec3 = require('vec3')

class SpeedrunPhases {
  constructor(bot, mcData, utils, params) {
    this.bot = bot
    this.mcData = mcData
    this.u = utils
    this.p = params
    this.currentPhase = 0
    this.startTime = Date.now()
    this.milestones = []
  }

  elapsed() {
    const ms = Date.now() - this.startTime
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
  }

  log(msg) { console.log(`  [${this.elapsed()}] ${msg}`) }

  milestone(name) {
    if (!this.milestones.includes(name)) {
      this.milestones.push(name)
      console.log(`  🎯 MILESTONE: ${name}`)
    }
  }

  async run() {
    console.log('\n' + '═'.repeat(50))
    console.log('🐉 SPEEDRUN START!')
    console.log('═'.repeat(50))

    const names = ['🌲 Wood & Tools','⛏️  Stone & Iron','🛡️  Gear Up','🟣 Nether Portal','🔥 Nether','👁️  Eye of Ender','🐉 The End']
    const phases = [
      () => this.phase1_WoodAndTools(),
      () => this.phase2_StoneAndIron(),
      () => this.phase3_GearUp(),
      () => this.phase4_NetherPortal(),
      () => this.phase5_Nether(),
      () => this.phase6_EyeOfEnder(),
      () => this.phase7_TheEnd()
    ]

    for (let i = 0; i < phases.length; i++) {
      this.currentPhase = i
      console.log(`\n▶ Phase ${i + 1}: ${names[i]}`)
      await phases[i]()
      console.log(`✅ Phase ${i + 1} complete!`)
    }

    console.log(`\n${'═'.repeat(50)}`)
    console.log(`🎉 SPEEDRUN COMPLETE! Time: ${this.elapsed()}`)
    console.log('═'.repeat(50))
  }

  // ═══════════ PHASE 1: WOOD & TOOLS ═══════════
  async phase1_WoodAndTools() {
    const logTypes = ['oak_log','birch_log','spruce_log','dark_oak_log','jungle_log','acacia_log']
    const plankMap = { oak_log:'oak_planks', birch_log:'birch_planks', spruce_log:'spruce_planks',
      dark_oak_log:'dark_oak_planks', jungle_log:'jungle_planks', acacia_log:'acacia_planks' }

    // Gather logs
    while (this.getTotalLogs() < this.p.minWoodLogs) {
      this.log(`Logs: ${this.getTotalLogs()}/${this.p.minWoodLogs}`)
      let found = false
      for (const t of logTypes) {
        const b = this.u.findBlock(t, 64)
        if (b) { await this.u.goTo(b.position); await this.u.mineBlock(b); await this.u.collectDrops(); found = true; break }
      }
      if (!found) await this.explore()
    }

    // Convert some logs to planks
    for (const [log, plank] of Object.entries(plankMap)) {
      const c = this.u.countItem(log)
      if (c > 4) await this.u.craftItem(plank, c - 4)
    }

    await this.u.craftItem('stick', 8)
    if (!this.u.hasItem('crafting_table')) await this.u.craftItem('crafting_table', 1)
    await this.u.findOrPlaceCraftingTable()
    if (!this.u.hasItem('wooden_pickaxe')) await this.u.craftItem('wooden_pickaxe', 1)
    if (!this.u.hasItem('wooden_axe')) await this.u.craftItem('wooden_axe', 1)
    if (!this.u.hasItem('wooden_sword')) await this.u.craftItem('wooden_sword', 1)

    this.milestone('wooden_tools')
  }

  // ═══════════ PHASE 2: STONE & IRON ═══════════
  async phase2_StoneAndIron() {
    // Mine cobblestone
    while (this.u.countItem('cobblestone') < this.p.minCobblestone) {
      this.log(`Cobble: ${this.u.countItem('cobblestone')}/${this.p.minCobblestone}`)
      const stone = this.u.findBlock('stone', 32) || this.u.findBlock('cobblestone', 32)
      if (stone) { await this.u.goTo(stone.position); await this.u.equipBestPickaxe(); await this.u.mineBlock(stone); await this.u.collectDrops() }
      else await this.digDown(5)
    }

    // Stone tools
    await this.u.findOrPlaceCraftingTable()
    await this.u.craftItem('stone_pickaxe', 2)
    await this.u.craftItem('stone_sword', 1)
    await this.u.craftItem('stone_axe', 1)
    if (!this.u.hasItem('furnace')) await this.u.craftItem('furnace', 1)
    this.milestone('stone_tools')

    // Mine iron
    while (this.u.countItem('raw_iron') + this.u.countItem('iron_ingot') < this.p.minIronOre) {
      const cur = this.u.countItem('raw_iron') + this.u.countItem('iron_ingot')
      this.log(`Iron: ${cur}/${this.p.minIronOre}`)
      const iron = this.u.findBlock('iron_ore', 64) || this.u.findBlock('deepslate_iron_ore', 64)
      if (iron) { await this.u.goTo(iron.position); await this.u.equipBestPickaxe(); await this.u.mineBlock(iron); await this.u.collectDrops() }
      else await this.stripMine(20)
    }

    // Get coal if needed
    if (!this.u.hasItem('coal') && !this.u.hasItem('charcoal')) {
      const coal = this.u.findBlock('coal_ore', 32)
      if (coal) { await this.u.goTo(coal.position); await this.u.equipBestPickaxe(); await this.u.mineBlock(coal); await this.u.collectDrops() }
    }

    // Smelt iron
    const raw = this.u.countItem('raw_iron')
    if (raw > 0) { this.log(`Smelting ${raw} iron...`); await this.u.smelt('raw_iron', 'coal', raw) }
    this.milestone('iron_smelted')
  }

  // ═══════════ PHASE 3: GEAR UP ═══════════
  async phase3_GearUp() {
    await this.u.findOrPlaceCraftingTable()
    if (!this.u.hasItem('iron_pickaxe')) await this.u.craftItem('iron_pickaxe', 1)
    if (!this.u.hasItem('iron_sword')) await this.u.craftItem('iron_sword', 1)
    if (!this.u.hasItem('iron_axe')) await this.u.craftItem('iron_axe', 1)
    if (!this.u.hasItem('bucket')) await this.u.craftItem('bucket', 1)
    if (!this.u.hasItem('shield')) await this.u.craftItem('shield', 1)

    // Get food
    await this.getFood()
    this.milestone('full_iron_gear')
    this.logInventory()
  }

  // ═══════════ PHASE 4: NETHER PORTAL ═══════════
  async phase4_NetherPortal() {
    // Get water bucket
    if (!this.u.hasItem('water_bucket')) {
      const water = this.u.findBlock('water', 64)
      if (water) {
        await this.u.goTo(water.position)
        await this.u.equip('bucket')
        await this.bot.activateBlock(this.bot.blockAt(water.position))
        this.log('Got water bucket!')
      }
    }

    // Find lava
    let lava = this.u.findBlock('lava', 64)
    if (!lava) {
      this.log('Searching for lava...')
      for (let i = 0; i < 10 && !lava; i++) { await this.explore(); lava = this.u.findBlock('lava', 64) }
    }
    if (!lava) { this.log('Digging to Y=10...'); await this.digToY(10); lava = this.u.findBlock('lava', 32) }
    if (!lava) throw new Error('Could not find lava')

    this.log('Found lava! Building portal...')
    await this.u.goTo(lava.position)
    await this.buildNetherPortal(lava.position)
    this.milestone('nether_portal')
  }

  // ═══════════ PHASE 5: NETHER ═══════════
  async phase5_Nether() {
    const portal = this.u.findBlock('nether_portal', 16)
    if (portal) {
      await this.bot.pathfinder.goto(new goals.GoalBlock(portal.position.x, portal.position.y, portal.position.z))
      this.log('Entering the Nether...')
      await this.u.sleep(5000)
    }
    this.milestone('entered_nether')

    // Find fortress
    this.log('Looking for fortress...')
    let fortress = null
    for (let i = 0; i < 20 && !fortress; i++) {
      fortress = this.u.findBlock('nether_bricks', 128)
      if (!fortress) { await this.explore(); this.log(`Searching... (${i + 1})`) }
    }
    if (!fortress) throw new Error('Could not find nether fortress')

    this.log('Found fortress!')
    await this.u.goTo(fortress.position)

    // Kill blazes
    while (this.u.countItem('blaze_rod') < this.p.minBlazeRods) {
      this.log(`Blaze rods: ${this.u.countItem('blaze_rod')}/${this.p.minBlazeRods}`)
      const blaze = this.u.findNearestMob('blaze', 64)
      if (blaze) { await this.u.goToEntity(blaze); await this.fightMob(blaze); await this.u.collectDrops() }
      else await this.explore()
    }
    this.milestone('blaze_rods')

    // Get ender pearls
    await this.getEnderPearls()
    this.milestone('ender_pearls')

    // Return to overworld
    const np = this.u.findBlock('nether_portal', 128)
    if (np) {
      await this.bot.pathfinder.goto(new goals.GoalBlock(np.position.x, np.position.y, np.position.z))
      await this.u.sleep(5000)
    }
  }

  // ═══════════ PHASE 6: EYE OF ENDER ═══════════
  async phase6_EyeOfEnder() {
    await this.u.craftItem('blaze_powder', this.u.countItem('blaze_rod'))
    await this.u.findOrPlaceCraftingTable()
    const eyes = Math.min(this.u.countItem('ender_pearl'), this.u.countItem('blaze_powder'))
    await this.u.craftItem('ender_eye', eyes)
    this.log(`Crafted ${eyes} eyes of ender`)

    // Follow eyes to stronghold
    for (let i = 0; i < 20; i++) {
      if (!this.u.hasItem('ender_eye')) throw new Error('Ran out of eyes!')
      await this.u.equip('ender_eye')
      await this.bot.activateItem()
      this.log('Threw eye of ender...')
      await this.u.sleep(3000)

      const frame = this.u.findBlock('end_portal_frame', 64)
      if (frame) { this.log('FOUND STRONGHOLD!'); await this.u.goTo(frame.position); this.milestone('found_stronghold'); return }
      await this.explore()
    }

    // Try digging down
    this.log('Digging to find stronghold...')
    await this.digDown(30)
    const frame = this.u.findBlock('end_portal_frame', 64)
    if (frame) { await this.u.goTo(frame.position); this.milestone('found_stronghold') }
    else throw new Error('Could not locate stronghold')
  }

  // ═══════════ PHASE 7: THE END ═══════════
  async phase7_TheEnd() {
    // Fill portal frames
    this.log('Filling end portal...')
    const frames = this.u.findBlocks('end_portal_frame', 16, 12)
    for (const fp of frames) {
      const frame = this.bot.blockAt(new Vec3(fp.x, fp.y, fp.z))
      if (frame && this.u.hasItem('ender_eye')) {
        await this.u.goTo(frame.position)
        await this.u.equip('ender_eye')
        try { await this.bot.activateBlock(frame) } catch (e) {}
      }
    }
    await this.u.sleep(2000)

    const endPortal = this.u.findBlock('end_portal', 16)
    if (endPortal) {
      this.log('🐉 ENTERING THE END!')
      await this.bot.pathfinder.goto(new goals.GoalBlock(endPortal.position.x, endPortal.position.y, endPortal.position.z))
      await this.u.sleep(5000)
    }
    this.milestone('entered_end')

    // Destroy crystals
    this.log('Destroying end crystals...')
    for (let i = 0; i < 30; i++) {
      const crystal = this.bot.nearestEntity(e => e.name === 'end_crystal')
      if (!crystal) break
      if (this.u.hasItem('bow') && this.u.hasItem('arrow')) {
        await this.bot.lookAt(crystal.position); await this.u.equip('bow')
        this.bot.activateItem(); await this.u.sleep(1200); this.bot.deactivateItem()
      } else { await this.u.goToEntity(crystal); await this.u.attack(crystal) }
      await this.u.sleep(1000)
    }

    // Fight dragon
    this.log('🐉 FIGHTING THE ENDER DRAGON!')
    const maxTime = 600000
    const start = Date.now()
    while (Date.now() - start < maxTime) {
      const dragon = this.bot.nearestEntity(e => e.name === 'ender_dragon')
      if (!dragon) { this.log('🎉 THE DRAGON IS DEAD!'); this.milestone('dragon_killed'); break }
      if (this.bot.health < 10) await this.eat()
      const dist = dragon.position.distanceTo(this.bot.entity.position)
      if (dist > 6 && this.u.hasItem('bow') && this.u.hasItem('arrow')) {
        await this.bot.lookAt(dragon.position); await this.u.equip('bow')
        this.bot.activateItem(); await this.u.sleep(1000); this.bot.deactivateItem()
      } else if (dist <= 6) { await this.u.equipBestWeapon(); await this.u.attack(dragon) }
      else {
        try { await this.bot.pathfinder.goto(new goals.GoalNear(dragon.position.x, dragon.position.y, dragon.position.z, 5)) }
        catch (e) { await this.bot.lookAt(dragon.position); this.bot.setControlState('forward', true); await this.u.sleep(1000); this.bot.setControlState('forward', false) }
      }
      await this.u.sleep(500)
    }
  }

  // ═══════════ HELPERS ═══════════

  getTotalLogs() {
    return ['oak_log','birch_log','spruce_log','dark_oak_log','jungle_log','acacia_log']
      .reduce((s, l) => s + this.u.countItem(l), 0)
  }

  async explore() {
    const pos = this.bot.entity.position
    const a = Math.random() * Math.PI * 2
    const d = 30 + Math.random() * 30
    try { await this.bot.pathfinder.goto(new goals.GoalNear(pos.x + Math.cos(a) * d, pos.y, pos.z + Math.sin(a) * d, 5)) }
    catch (e) {}
  }

  async digDown(blocks) {
    for (let i = 0; i < blocks; i++) {
      const below = this.bot.blockAt(this.bot.entity.position.offset(0, -1, 0))
      if (below && !['air','bedrock','lava','water'].includes(below.name)) {
        await this.u.equipBestPickaxe(); await this.u.mineBlock(below); await this.u.sleep(200)
      }
    }
  }

  async digToY(targetY) { while (this.bot.entity.position.y > targetY) await this.digDown(1) }

  async stripMine(length) {
    for (let i = 0; i < length; i++) {
      const dir = this.bot.entity.yaw
      const dx = Math.round(-Math.sin(dir)), dz = Math.round(Math.cos(dir))
      const ahead = this.bot.blockAt(this.bot.entity.position.offset(dx, 0, dz))
      const up = this.bot.blockAt(this.bot.entity.position.offset(dx, 1, dz))
      if (ahead && !['air','lava','water'].includes(ahead.name)) { await this.u.equipBestPickaxe(); await this.u.mineBlock(ahead) }
      if (up && !['air','lava','water'].includes(up.name)) { await this.u.mineBlock(up) }
      this.bot.setControlState('forward', true); await this.u.sleep(300); this.bot.setControlState('forward', false)

      for (const ore of ['iron_ore','deepslate_iron_ore','coal_ore','diamond_ore']) {
        const f = this.u.findBlock(ore, 4)
        if (f) { await this.u.goTo(f.position); await this.u.equipBestPickaxe(); await this.u.mineBlock(f); await this.u.collectDrops() }
      }
    }
  }

  async getFood() {
    let foodCount = this.getFoodCount()
    while (foodCount < this.p.minFood) {
      this.log(`Food: ${foodCount}/${this.p.minFood}`)
      let found = false
      for (const a of ['cow','pig','sheep','chicken']) {
        const mob = this.u.findNearestMob(a, 64)
        if (mob) { await this.fightMob(mob); await this.u.collectDrops(); found = true; break }
      }
      if (!found) await this.explore()
      foodCount = this.getFoodCount()
    }
    for (const m of ['raw_beef','raw_porkchop','raw_chicken','raw_mutton']) {
      const c = this.u.countItem(m)
      if (c > 0) await this.u.smelt(m, 'coal', c)
    }
  }

  getFoodCount() {
    return ['cooked_beef','cooked_porkchop','cooked_chicken','cooked_mutton','bread','apple','raw_beef','raw_porkchop']
      .reduce((s, f) => s + this.u.countItem(f), 0)
  }

  async fightMob(entity) {
    if (!entity?.isValid) return
    await this.u.equipBestWeapon()
    for (let i = 0; i < 30 && entity.isValid; i++) {
      if (this.bot.health < this.p.fleeHealthThreshold) { await this.eat(); break }
      if (entity.position.distanceTo(this.bot.entity.position) > 3.5) await this.u.goToEntity(entity)
      await this.u.attack(entity)
      await this.u.sleep(500)
    }
  }

  async eat() {
    for (const f of ['cooked_beef','cooked_porkchop','cooked_chicken','cooked_mutton','bread','apple']) {
      if (this.u.hasItem(f)) { await this.u.equip(f); await this.bot.consume(); return }
    }
  }

  async getEnderPearls() {
    while (this.u.countItem('ender_pearl') < this.p.minEnderPearls) {
      this.log(`Pearls: ${this.u.countItem('ender_pearl')}/${this.p.minEnderPearls}`)
      const enderman = this.u.findNearestMob('enderman', 64)
      if (enderman) {
        await this.bot.lookAt(enderman.position.offset(0, 1.6, 0))
        await this.u.sleep(500)
        await this.fightMob(enderman)
        await this.u.collectDrops()
      } else await this.explore()
    }
  }

  async buildNetherPortal(lavaPos) {
    if (!this.u.hasItem('water_bucket')) throw new Error('Need water bucket!')

    // Pour water next to lava to make obsidian
    const near = this.bot.blockAt(lavaPos.offset(1, 0, 0))
    if (near) {
      await this.u.goTo(near.position); await this.u.equip('water_bucket')
      await this.bot.activateBlock(near); await this.u.sleep(2000)
      const w = this.u.findBlock('water', 8)
      if (w) { await this.u.equip('bucket'); await this.bot.activateBlock(this.bot.blockAt(w.position)) }
    }

    // Mine obsidian
    let obsCount = 0
    while (obsCount < 10) {
      const obs = this.u.findBlock('obsidian', 16)
      if (obs) {
        await this.u.goTo(obs.position); await this.u.equip('iron_pickaxe'); await this.u.mineBlock(obs)
        await this.u.collectDrops(); obsCount = this.u.countItem('obsidian')
        this.log(`Obsidian: ${obsCount}/10`)
      } else {
        const moreLava = this.u.findBlock('lava', 16)
        if (moreLava) {
          const spot = this.bot.blockAt(moreLava.position.offset(0, 1, 0))
          if (spot?.name === 'air') {
            await this.u.goTo(spot.position); await this.u.equip('water_bucket')
            await this.bot.activateBlock(spot); await this.u.sleep(2000)
            await this.u.equip('bucket')
            const w2 = this.u.findBlock('water', 8)
            if (w2) await this.bot.activateBlock(this.bot.blockAt(w2.position))
          }
        } else break
      }
    }
    if (obsCount < 10) throw new Error(`Only ${obsCount}/10 obsidian`)

    // Build frame
    this.log('Building portal frame...')
    const base = this.bot.entity.position.offset(2, 0, 0)
    const portalBlocks = [
      base, base.offset(1,0,0), base.offset(2,0,0), base.offset(3,0,0),
      base.offset(0,1,0), base.offset(0,2,0), base.offset(0,3,0),
      base.offset(3,1,0), base.offset(3,2,0), base.offset(3,3,0),
    ]
    for (const pos of portalBlocks) {
      if (this.u.hasItem('obsidian')) {
        await this.u.equip('obsidian')
        const ref = this.bot.blockAt(pos.offset(0, -1, 0))
        if (ref) { try { await this.bot.placeBlock(ref, { x: 0, y: 1, z: 0 }) } catch (e) {} }
      }
    }

    // Light it
    if (!this.u.hasItem('flint_and_steel')) {
      await this.u.findOrPlaceCraftingTable()
      await this.u.craftItem('flint_and_steel', 1)
    }
    if (this.u.hasItem('flint_and_steel')) {
      await this.u.equip('flint_and_steel')
      const inside = this.bot.blockAt(base.offset(1, 1, 0))
      if (inside) { await this.bot.activateBlock(inside); this.log('Portal lit! 🟣') }
    }
  }

  logInventory() {
    this.log('Inventory:')
    for (const item of this.bot.inventory.items()) console.log(`    ${item.name} x${item.count}`)
  }
}

module.exports = SpeedrunPhases
