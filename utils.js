const { goals } = require('mineflayer-pathfinder')

class BotUtils {
  constructor(bot, mcData) {
    this.bot = bot
    this.mcData = mcData
  }

  // ════════════════ INVENTORY ════════════════

  countItem(name) {
    const item = this.mcData.itemsByName[name]
    if (!item) return 0
    return this.bot.inventory.count(item.id)
  }

  hasItem(name, count = 1) { return this.countItem(name) >= count }

  getItem(name) {
    const item = this.mcData.itemsByName[name]
    if (!item) return null
    return this.bot.inventory.findInventoryItem(item.id, null)
  }

  async equip(name, dest = 'hand') {
    const item = this.getItem(name)
    if (item) { await this.bot.equip(item, dest); return true }
    return false
  }

  async equipBestWeapon() {
    for (const w of ['diamond_sword','iron_sword','stone_sword','wooden_sword','diamond_axe','iron_axe','stone_axe','wooden_axe']) {
      if (await this.equip(w)) return true
    }
    return false
  }

  async equipBestPickaxe() {
    for (const p of ['diamond_pickaxe','iron_pickaxe','stone_pickaxe','wooden_pickaxe']) {
      if (await this.equip(p)) return true
    }
    return false
  }

  // ════════════════ CRAFTING ════════════════

  async craftItem(name, count = 1) {
    const item = this.mcData.itemsByName[name]
    if (!item) return false

    const recipe = this.bot.recipesFor(item.id, null, 1, null)[0]
    const recipeTable = this.bot.recipesFor(item.id, null, 1, true)[0]

    if (!recipe && !recipeTable) return false

    if (!recipe && recipeTable) {
      if (!await this.findOrPlaceCraftingTable()) return false
    }

    try {
      for (let i = 0; i < Math.min(count, 64); i++) {
        const r = this.bot.recipesFor(item.id, null, 1, recipe ? null : true)[0]
        if (!r) break
        if (recipe) {
          await this.bot.craft(r, 1, null)
        } else {
          const table = this.bot.findBlock({ matching: this.mcData.blocksByName.crafting_table.id, maxDistance: 4 })
          if (table) await this.bot.craft(r, 1, table)
        }
      }
      return true
    } catch (err) { return false }
  }

  async findOrPlaceCraftingTable() {
    let table = this.bot.findBlock({ matching: this.mcData.blocksByName.crafting_table.id, maxDistance: 32 })
    if (table) {
      if (this.bot.entity.position.distanceTo(table.position) > 4) await this.goTo(table.position)
      return table
    }

    const plankTypes = ['oak_planks','birch_planks','spruce_planks','dark_oak_planks','jungle_planks','acacia_planks']
    if (plankTypes.some(p => this.countItem(p) >= 4)) {
      const tableItem = this.mcData.itemsByName.crafting_table
      const r = this.bot.recipesFor(tableItem.id, null, 1, null)[0]
      if (r) await this.bot.craft(r, 1, null)
    }

    if (this.hasItem('crafting_table')) {
      const ref = this.bot.blockAt(this.bot.entity.position.offset(1, -1, 0))
      if (ref) {
        await this.equip('crafting_table')
        try {
          await this.bot.placeBlock(ref, { x: 0, y: 1, z: 0 })
          return this.bot.findBlock({ matching: this.mcData.blocksByName.crafting_table.id, maxDistance: 4 })
        } catch (e) {}
      }
    }
    return null
  }

  // ════════════════ SMELTING ════════════════

  async smelt(inputName, fuelName = 'coal', count = 1) {
    let furnace = this.bot.findBlock({ matching: this.mcData.blocksByName.furnace.id, maxDistance: 32 })

    if (!furnace && this.countItem('cobblestone') >= 8) {
      await this.craftItem('furnace', 1)
      if (this.hasItem('furnace')) {
        const ref = this.bot.blockAt(this.bot.entity.position.offset(0, -1, 1))
        if (ref) {
          await this.equip('furnace')
          try {
            await this.bot.placeBlock(ref, { x: 0, y: 1, z: 0 })
            furnace = this.bot.findBlock({ matching: this.mcData.blocksByName.furnace.id, maxDistance: 4 })
          } catch (e) {}
        }
      }
    }
    if (!furnace) return false
    if (this.bot.entity.position.distanceTo(furnace.position) > 4) await this.goTo(furnace.position)

    try {
      const fb = await this.bot.openFurnace(furnace)
      if (!this.hasItem(fuelName)) {
        for (const f of ['coal','charcoal','oak_planks','birch_planks','spruce_planks','oak_log','birch_log','spruce_log']) {
          if (this.hasItem(f)) { fuelName = f; break }
        }
      }
      const inp = this.mcData.itemsByName[inputName]
      const fuel = this.mcData.itemsByName[fuelName]
      if (inp && fuel) {
        await fb.putFuel(fuel.id, null, Math.ceil(count / 8) + 1)
        await fb.putInput(inp.id, null, count)
        await this.sleep(count * 10000 + 2000)
        await fb.takeOutput()
      }
      fb.close()
      return true
    } catch (err) { return false }
  }

  // ════════════════ MOVEMENT ════════════════

  async goTo(pos) {
    try { await this.bot.pathfinder.goto(new goals.GoalNear(pos.x, pos.y, pos.z, 2)); return true }
    catch (e) { return false }
  }

  async goToEntity(entity) {
    try { await this.bot.pathfinder.goto(new goals.GoalFollow(entity, 2)); return true }
    catch (e) { return false }
  }

  // ════════════════ BLOCKS ════════════════

  findBlock(name, maxDist = 64) {
    const b = this.mcData.blocksByName[name]
    return b ? this.bot.findBlock({ matching: b.id, maxDistance: maxDist }) : null
  }

  findBlocks(name, maxDist = 64, count = 10) {
    const b = this.mcData.blocksByName[name]
    return b ? this.bot.findBlocks({ matching: b.id, maxDistance: maxDist, count }) : []
  }

  async mineBlock(block) {
    if (!block) return false
    try {
      await this.goTo(block.position)
      if (block.name.includes('log') || block.name.includes('planks')) {
        for (const a of ['iron_axe','stone_axe','wooden_axe']) { if (await this.equip(a)) break }
      } else { await this.equipBestPickaxe() }
      await this.bot.dig(block)
      return true
    } catch (e) { return false }
  }

  async collectDrops() { await this.sleep(300) }

  // ════════════════ COMBAT ════════════════

  async attack(entity) {
    if (!entity?.isValid) return false
    try { await this.equipBestWeapon(); await this.bot.attack(entity); return true }
    catch (e) { return false }
  }

  findNearestMob(name, maxDist = 32) {
    return this.bot.nearestEntity(e => {
      if (!e?.isValid || e.type !== 'mob') return false
      if (name && e.name !== name) return false
      return e.position.distanceTo(this.bot.entity.position) < maxDist
    })
  }

  // ════════════════ HELPERS ════════════════

  sleep(ms) { return new Promise(r => setTimeout(r, ms)) }
}

module.exports = BotUtils
