// Block entities for the 3D schematic viewer. The game draws chests, shulker boxes, banners, heads, pots and bells with code rather than
// block models, so their shapes are copied from it here: the same cubes, box UV layout and transforms as its ModelPart and block entity
// renderers, baked into quads for every facing. Used by extract-blocks.mjs.

const mul = (a, b) => { const o = new Array(16).fill(0); for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) for (let k = 0; k < 4; k++) o[r * 4 + c] += a[r * 4 + k] * b[k * 4 + c]; return o }
const chain = (...ms) => ms.reduce(mul)
const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
const T = (x, y, z) => [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z, 0, 0, 0, 1]
const S = (x, y = x, z = x) => [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1]
const RX = a => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0, 0, 0, 0, 1] }
const RY = a => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, 0, 0, 0, 1] }
const RZ = a => { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] }
const deg = d => d * Math.PI / 180
const apply = (m, [x, y, z]) => [0, 1, 2].map(r => m[r * 4] * x + m[r * 4 + 1] * y + m[r * 4 + 2] * z + m[r * 4 + 3])

const YROT = { south: 0, west: 90, north: 180, east: 270 }   // Direction.toYRot()
const HORIZ = ['north', 'east', 'south', 'west']
const STEP = { north: [0, 0, -1], south: [0, 0, 1], west: [-1, 0, 0], east: [1, 0, 0] }
const OPPOSITE = { north: 'south', south: 'north', east: 'west', west: 'east' }
/** Direction.getRotation(): turns "up" to face that way. */
const DIR_ROT = { up: I, down: RX(Math.PI), north: chain(RX(Math.PI / 2), RZ(Math.PI)), south: RX(Math.PI / 2), west: chain(RX(Math.PI / 2), RZ(Math.PI / 2)), east: chain(RX(Math.PI / 2), RZ(-Math.PI / 2)) }
const COLOURS = ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black']
// DyeColor's texture colours, for banner cloth
const DYE = { white: 0xF9FFFE, orange: 0xF9801D, magenta: 0xC74EBD, light_blue: 0x3AB3DA, yellow: 0xFED83D, lime: 0x80C71F, pink: 0xF38BAA, gray: 0x474F52, light_gray: 0x9D9D97, cyan: 0x169C9C, purple: 0x8932B8, blue: 0x3C44AA, brown: 0x835432, green: 0x5E7C16, red: 0xB02E26, black: 0x1D1D21 }

/** CubeListBuilder.addBox (texture offset, corner, size), optionally grown, or with only some faces. */
const cube = (u, v, x, y, z, w, h, d, { grow = 0, only = null } = {}) => ({ u, v, x, y, z, w, h, d, grow, only })
/** PartDefinition: cubes, its offset and rotation (in pixels and radians), and child parts. */
const part = (cubes, { at = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1], kids = [] } = {}) => ({ cubes, at, rot, scale, kids })

/** Every face as a quad: [texture, tint, then x y z u v for each corner], positions in block pixels, uv in texture pixels. */
function bake(parts, m, texI, tint = 0) {
  const quads = []
  const walk = (p, m0) => {
    const sc = p.scale || [1, 1, 1], m1 = chain(m0, T(p.at[0] / 16, p.at[1] / 16, p.at[2] / 16), RZ(p.rot[2]), RY(p.rot[1]), RX(p.rot[0]), S(sc[0], sc[1], sc[2]))   // ModelPart.translateAndRotate
    for (const c of p.cubes) {
      const g = Array.isArray(c.grow) ? c.grow : [c.grow, c.grow, c.grow]
      let x0 = c.x - g[0], x1 = c.x + c.w + g[0]; const y0 = c.y - g[1], z0 = c.z - g[2], y1 = c.y + c.h + g[1], z1 = c.z + c.d + g[2]
      if (c.mirror) [x0, x1] = [x1, x0]   // a mirrored cube: the texture is flipped left to right
      const V = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]
      const { u, v, w, h, d } = c, U = [u, u + d, u + d + w, u + d + w + w, u + d + w + d, u + d + w + d + w], W = [v, v + d, v + d + h]
      const polys = { down: [[5, 4, 0, 1], U[1], W[0], U[2], W[1]], up: [[2, 3, 7, 6], U[2], W[1], U[3], W[0]], west: [[0, 4, 7, 3], U[0], W[1], U[1], W[2]],
        north: [[1, 0, 3, 2], U[1], W[1], U[2], W[2]], east: [[5, 1, 2, 6], U[2], W[1], U[4], W[2]], south: [[4, 5, 6, 7], U[4], W[1], U[5], W[2]] }
      for (const [dir, [vs, u1, v1, u2, v2]] of Object.entries(polys)) {
        if (c.only && !c.only.includes(dir)) continue
        const uv = [[u2, v1], [u1, v1], [u1, v2], [u2, v2]], pts = vs.map(i => apply(m1, V[i].map(n => n / 16)).map(n => +(n * 16).toFixed(4)))
        const same = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < 1e-6
        if (same(pts[0], pts[1]) || same(pts[1], pts[2])) continue   // the zero-thickness sides of a flat cube
        // Wind it so the viewer's normal points out (the renderers' mirroring flips some): (p3 - p0) x (p1 - p0) along the face's direction
        const n0 = { down: [0, -1, 0], up: [0, 1, 0], north: [0, 0, -1], south: [0, 0, 1], west: [c.mirror ? 1 : -1, 0, 0], east: [c.mirror ? -1 : 1, 0, 0] }[dir], out = [0, 1, 2].map(r => m1[r * 4] * n0[0] + m1[r * 4 + 1] * n0[1] + m1[r * 4 + 2] * n0[2])
        const a = [0, 1, 2].map(i => pts[1][i] - pts[0][i]), b = [0, 1, 2].map(i => pts[3][i] - pts[0][i]), n = [b[1] * a[2] - b[2] * a[1], b[2] * a[0] - b[0] * a[2], b[0] * a[1] - b[1] * a[0]]
        const order = n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0 ? [0, 3, 2, 1] : [0, 1, 2, 3]
        const q = [texI, tint]; order.forEach(k => q.push(...pts[k], uv[k][0], uv[k][1])); quads.push(q)
      }
    }
    for (const k of p.kids) walk(k, m1)
  }
  for (const p of parts) walk(p, m)
  return quads
}

const without = d => ['down', 'up', 'north', 'south', 'west', 'east'].filter(x => x !== d)
/** ChestModel: a single chest, or the left or right half of a double one. */
const chestParts = type => {
  if (type === 'single') return [part([cube(0, 19, 1, 0, 1, 14, 10, 14)]), part([cube(0, 0, 1, 0, 0, 14, 5, 14)], { at: [0, 9, 1] }), part([cube(0, 0, 7, -2, 14, 2, 4, 1)], { at: [0, 9, 1] })]
  const right = type === 'right', only = without(right ? 'east' : 'west')
  return [part([cube(0, 19, right ? 1 : 0, 0, 1, 15, 10, 14, { only })]), part([cube(0, 0, right ? 1 : 0, 0, 0, 15, 5, 14, { only })], { at: [0, 9, 1] }), part([cube(0, 0, right ? 15 : 0, -2, 14, 1, 4, 1)], { at: [0, 9, 1] })]
}

/** Adds the block entities to `models` and `blocks`. `tex(path)` registers a texture; returns the ones to keep at full size. */
export function addBlockEntities({ hasBlock, tex, models, blocks, roots }) {
  const big = new Map()
  const bigTex = p => { const i = tex(p); big.set(i, p); return i }
  const seen = new Map()   // the same shape is stored once (banners of every colour, waxed chests)
  const add = quads => { const k = JSON.stringify(quads); if (!seen.has(k)) { models.push({ q: quads }); seen.set(k, models.length - 1) } return { m: seen.get(k) } }
  const variants = (name, list) => { if (hasBlock(name)) blocks[name] = { ...(blocks[name] || {}), v: list.map(([k, q]) => [k, add(q)]) } }

  // Chests (ChestModel, ChestRenderer): single, and each half of a double chest
  const CHESTS = { chest: 'normal', trapped_chest: 'trapped', ender_chest: 'ender', copper_chest: 'copper', exposed_copper_chest: 'copper_exposed', weathered_copper_chest: 'copper_weathered', oxidized_copper_chest: 'copper_oxidized' }
  for (const [name, t] of Object.entries(CHESTS)) for (const n of [name, 'waxed_' + name]) {
    const list = []
    for (const f of HORIZ) {
      const m = chain(T(0.5, 0, 0.5), RY(deg(-YROT[f])), T(-0.5, 0, -0.5))
      if (name === 'ender_chest') list.push([`facing=${f}`, bake(chestParts('single'), m, bigTex(`entity/chest/${t}`))])
      else for (const type of ['single', 'left', 'right']) list.push([`facing=${f},type=${type}`, bake(chestParts(type), m, bigTex(`entity/chest/${t}${type === 'single' ? '' : '_' + type}`))])
    }
    variants(n, list)
  }

  // Shulker boxes (ShulkerModel's shell, ShulkerBoxRenderer), closed
  const shell = [part([cube(0, 0, -8, -16, -8, 16, 12, 16)], { at: [0, 24, 0] }), part([cube(0, 28, -8, -8, -8, 16, 8, 16)], { at: [0, 24, 0] })]
  for (const c of [null, ...COLOURS]) {
    const t = bigTex(`entity/shulker/shulker${c ? '_' + c : ''}`)
    variants(c ? `${c}_shulker_box` : 'shulker_box', Object.entries(DIR_ROT).map(([f, r]) => [`facing=${f}`, bake(shell, chain(T(0.5, 0.5, 0.5), S(0.9995), r, S(1, -1, -1), T(0, -1, 0)), t)]))
  }

  // Heads and skulls (SkullModel, SkullBlockRenderer): on the ground in 16 turns, or on a wall
  const HEADS = { skeleton_skull: ['skeleton/skeleton', 0], wither_skeleton_skull: ['skeleton/wither_skeleton', 0], zombie_head: ['zombie/zombie', 1], creeper_head: ['creeper/creeper', 0], player_head: ['player/wide/steve', 1] }
  const skull = (name, head, t) => {
    variants(name, Array.from({ length: 16 }, (_, r) => [`rotation=${r}`, bake(head, chain(T(0.5, 0, 0.5), RY(deg(-r * 22.5)), S(-1, -1, 1)), t)]))
    variants(name.replace(/_(skull|head)$/, '_wall_$1'), HORIZ.map(f => [`facing=${f}`, bake(head, chain(T(0.5 - STEP[f][0] * 0.25, 0.25, 0.5 - STEP[f][2] * 0.25), RY(deg(-YROT[OPPOSITE[f]])), S(-1, -1, 1)), t)]))
  }
  for (const [name, [path, hat]] of Object.entries(HEADS)) skull(name, [part([cube(0, 0, -4, -8, -4, 8, 8, 8), ...(hat ? [cube(32, 0, -4, -8, -4, 8, 8, 8, { grow: 0.25 })] : [])])], bigTex('entity/' + path))
  // The dragon's and piglin's heads have shapes of their own (DragonHeadModel, PiglinHeadModel)
  for (const [name, L, path] of [['dragon_head', 'DRAGON_SKULL', 'enderdragon/dragon'], ['piglin_head', 'PIGLIN_HEAD', 'piglin/piglin']]) {
    const head = rootParts(roots, L); if (head) skull(name, head, bigTex('entity/' + path))
  }

  // Conduit, not yet switched on (ConduitRenderer draws just its shell)
  const conduit = rootParts(roots, 'CONDUIT_SHELL')
  if (conduit) variants('conduit', [['', bake(conduit, T(0.5, 0.5, 0.5), bigTex('entity/conduit/base'))]])

  // Copper golem statues (CopperGolemStatueBlockRenderer): the copper golem in one of four poses, its root turned upside down as the statue model sets it
  const POSES = { standing: 'COPPER_GOLEM', running: 'COPPER_GOLEM_RUNNING', sitting: 'COPPER_GOLEM_SITTING', star: 'COPPER_GOLEM_STAR' }
  for (const [pre, suffix] of [['', ''], ['exposed_', '_exposed'], ['weathered_', '_weathered'], ['oxidized_', '_oxidized']]) {
    const t = bigTex(`entity/copper_golem/copper_golem${suffix}`), list = []
    for (const [pose, L] of Object.entries(POSES)) {
      const golem = rootParts(roots, L); if (!golem) continue
      golem[0].at = [golem[0].at[0], 0, golem[0].at[2]]; golem[0].rot = [golem[0].rot[0], golem[0].rot[1], Math.PI]
      for (const f of HORIZ) list.push([`copper_golem_pose=${pose},facing=${f}`, bake(golem, chain(T(0.5, 0, 0.5), RY(deg(-YROT[OPPOSITE[f]]))), t)])
    }
    for (const n of [`${pre}copper_golem_statue`, `waxed_${pre}copper_golem_statue`]) variants(n, list)
  }

  // Banners (BannerModel, BannerFlagModel, BannerRenderer): the pole in wood, the cloth tinted the banner's colour
  const poleT = bigTex('entity/banner/banner_base'), clothT = bigTex('entity/banner/base')
  const banner = (standing, m) => [
    ...bake([...(standing ? [part([cube(44, 0, -1, -42, -1, 2, 42, 2)])] : []), part([cube(0, 42, -10, standing ? -44 : -20.5, standing ? -1 : 9.5, 20, 2, 2)])], m, poleT),
    ...bake([part([cube(0, 0, -10, 0, -2, 20, 40, 1)], { at: [0, standing ? -44 : -20.5, standing ? 0 : 10.5] })], m, clothT, 1)]
  const bannerM = a => chain(T(0.5, 0, 0.5), RY(deg(-a)), S(2 / 3, -2 / 3, -2 / 3))
  for (const [c, rgb] of Object.entries(DYE)) {
    variants(`${c}_banner`, Array.from({ length: 16 }, (_, r) => [`rotation=${r}`, banner(true, bannerM(r * 22.5))]))
    variants(`${c}_wall_banner`, HORIZ.map(f => [`facing=${f}`, banner(false, bannerM(YROT[f]))]))
    for (const n of [`${c}_banner`, `${c}_wall_banner`]) if (blocks[n]) blocks[n].t = [rgb >> 16, (rgb >> 8) & 255, rgb & 255]
  }

  // Decorated pot (DecoratedPotRenderer): neck, top and bottom, and four plain sides
  const baseT = bigTex('entity/decorated_pot/decorated_pot_base'), sideT = bigTex('entity/decorated_pot/decorated_pot_side')
  const plate = [cube(-14, 13, 0, 0, 0, 14, 0, 14)], side = [cube(1, 0, 0, 0, 0, 14, 16, 0, { only: ['north'] })]
  const pot = [part([cube(0, 0, 4, 17, 4, 8, 3, 8, { grow: -0.1 }), cube(0, 5, 5, 20, 5, 6, 1, 6, { grow: 0.2 })], { at: [0, 37, 16], rot: [Math.PI, 0, 0] }), part(plate, { at: [1, 16, 1] }), part(plate, { at: [1, 0, 1] })]
  const sides = [part(side, { at: [15, 16, 1], rot: [0, 0, Math.PI] }), part(side, { at: [1, 16, 1], rot: [0, -Math.PI / 2, Math.PI] }), part(side, { at: [15, 16, 15], rot: [0, Math.PI / 2, Math.PI] }), part(side, { at: [1, 16, 15], rot: [Math.PI, 0, 0] })]
  variants('decorated_pot', HORIZ.map(f => { const m = chain(T(0.5, 0.5, 0.5), RY(deg(180 - YROT[f])), T(-0.5, -0.5, -0.5)); return [`facing=${f}`, [...bake(pot, m, baseT), ...bake(sides, m, sideT)]] }))

  // Bell (BellModel): the bell itself, added to its stand's model whichever way that is
  if (blocks.bell?.v) {
    const body = add(bake([part([cube(0, 0, -3, -6, -3, 6, 7, 6)], { at: [8, 12, 8], kids: [part([cube(0, 13, 4, 4, 4, 8, 2, 8)], { at: [-8, -12, -8] })] })], I, bigTex('entity/bell/bell_body')))
    blocks.bell = { mp: [...blocks.bell.v.map(([k, r]) => [k ? Object.fromEntries(k.split(',').map(kv => kv.split('='))) : null, r]), [null, body]] }
  }
  // Books (BookModel): open on a lectern that has one (LecternRenderer), closed and floating over an enchanting table (EnchantTableRenderer, at rest)
  const bookParts = (open, flip1, flip2) => {
    const parts = rootParts(roots, 'BOOK'); if (!parts) return null
    const set = (n, yRot, x) => { const p = find(parts, n); if (p) { p.rot = [p.rot[0], yRot, p.rot[2]]; if (x !== undefined) p.at = [x, p.at[1], p.at[2]] } }
    const sx = Math.sin(open)
    set('left_lid', Math.PI + open); set('right_lid', -open); set('left_pages', open, sx); set('right_pages', -open, sx)
    set('flip_page1', open - open * 2 * flip1, sx); set('flip_page2', open - open * 2 * flip2, sx)
    return parts
  }
  const bookT = bigTex('entity/enchantment/enchanting_table_book')
  const toMp = name => (blocks[name]?.v ? blocks[name].v.map(([k, r]) => [k ? Object.fromEntries(k.split(',').map(kv => kv.split('='))) : null, r]) : blocks[name]?.mp)
  const open = bookParts(1.5, 0.1, 0.9), shut = bookParts(0, 0, 0)
  if (open && blocks.lectern) {
    const CW = { north: 'east', east: 'south', south: 'west', west: 'north' }
    blocks.lectern = { mp: [...toMp('lectern'), ...HORIZ.map(f => [{ facing: f, has_book: 'true' }, add(bake(open, chain(T(0.5, 1.0625, 0.5), RY(deg(-YROT[CW[f]])), RZ(deg(67.5)), T(0, -0.125, 0)), bookT))])] }
  }
  if (shut && blocks.enchanting_table) blocks.enchanting_table = { mp: [...toMp('enchanting_table'), [null, add(bake(shut, chain(T(0.5, 0.85, 0.5), RZ(deg(80))), bookT))]] }
  return big
}

// ---- entities: mobs, armor stands, boats, minecarts and item frames. Shapes come from the game's own model code (model-layers.mjs),
// placed the way each renderer places them, with the entity's position at the origin, facing yaw 0. The viewer turns each one to its yaw.

/** A parts tree from model-layers.mjs as bake() parts, keeping names so poses can be set and parts picked. */
const partsOf = node => [...node.children].map(([name, c]) => ({ ...part(c.cubes, { at: [c.pose.x, c.pose.y, c.pose.z], rot: [c.pose.xRot, c.pose.yRot, c.pose.zRot], scale: [c.pose.xScale, c.pose.yScale, c.pose.zScale], kids: partsOf(c) }), name }))
/** A whole layer from LayerDefinitions.createRoots, its root's pose kept (layers the game shrinks keep their size there), or null. */
function rootParts(roots, name) {
  const r = roots?.get(name); if (!r || r.failed) return null
  const p = r.root.pose
  return [{ ...part(r.root.cubes, { at: [p.x, p.y, p.z], rot: [p.xRot, p.yRot, p.zRot], scale: [p.xScale, p.yScale, p.zScale], kids: partsOf(r.root) }), name: 'root' }]
}
/** ModelPart.translateAndRotate for one part, in block units. */
const poseOf = p => chain(T(p.at[0] / 16, p.at[1] / 16, p.at[2] / 16), RZ(p.rot[2]), RY(p.rot[1]), RX(p.rot[0]), S(...(p.scale || [1, 1, 1])))
const round = m => m.map(v => +v.toFixed(5))
/** Where a held item goes for each hand (ItemInHandLayer): the model root, then the arm (ArmedModel.translateToHand), then turned to point forward.
 *  Block units, through matrix m. Only for models with both arms. */
function handsOf(parts, m) {
  const right = pathTo(parts, 'right_arm'), left = pathTo(parts, 'left_arm')
  if (!right || !left) return {}
  const hand = (path, side) => round(chain(m, ...path.map(poseOf), RX(deg(-90)), RY(Math.PI), T(side / 16, 2 / 16, -10 / 16)))
  return { hands: [hand(right, 1), hand(left, -1)] }
}
/** The parts from the top down to the one named, or null. */
const pathTo = (parts, name) => { for (const p of parts) { if (p.name === name) return [p]; const k = pathTo(p.kids, name); if (k) return [p, ...k] } return null }
const find = (parts, name) => { for (const p of parts) { if (p.name === name) return p; const k = find(p.kids, name); if (k) return k } return null }
// Model layers (LayerDefinitions names, lower case) drawn as mobs
const MOB_LAYERS = `allay armadillo armadillo_baby axolotl axolotl_baby bat bee bee_baby blaze bogged bogged_outer_layer breeze camel camel_baby cat cat_baby cave_spider
  chicken chicken_baby cold_chicken cod copper_golem cow cow_baby cold_cow cold_cow_baby warm_cow warm_cow_baby creaking creeper dolphin dolphin_baby donkey donkey_baby
  drowned drowned_outer_layer drowned_baby drowned_baby_outer_layer elder_guardian enderman endermite evoker fox fox_baby frog ghast giant glow_squid glow_squid_baby goat
  goat_baby guardian happy_ghast happy_ghast_baby hoglin hoglin_baby horse horse_baby husk husk_baby illusioner llama llama_baby magma_cube mooshroom mooshroom_baby mule
  mule_baby nautilus nautilus_baby zombie_nautilus ocelot ocelot_baby panda panda_baby parched parrot phantom pig pig_baby cold_pig piglin piglin_brute piglin_baby pillager
  polar_bear polar_bear_baby pufferfish_big pufferfish_medium pufferfish_small rabbit rabbit_baby ravager salmon salmon_small salmon_large sheep sheep_baby sheep_wool
  sheep_baby_wool silverfish skeleton skeleton_horse skeleton_horse_baby slime slime_outer sniffer sniffer_baby spider squid squid_baby stray stray_outer_layer strider
  strider_baby tadpole trader_llama trader_llama_baby tropical_fish_large tropical_fish_large_pattern tropical_fish_small tropical_fish_small_pattern turtle turtle_baby vex
  villager villager_baby vindicator wandering_trader warden witch wither wither_skeleton wolf wolf_baby zoglin zoglin_baby zombie zombie_baby zombie_horse zombie_horse_baby
  zombie_villager zombie_villager_baby zombified_piglin zombified_piglin_baby`.split(/\s+/)
const DIR3 = ['down', 'up', 'north', 'south', 'west', 'east']   // the Facing byte's order in entity data

/** A block model's boxes (from extract-blocks) as quads on the sheet's 16 px tiles, through matrix m (block units). */
function boxQuads(boxes, m) {
  const corners = (dir, [x0, y0, z0], [x1, y1, z1]) => ({
    up: [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], down: [[x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x0, y0, z0]],
    north: [[x1, y1, z0], [x0, y1, z0], [x0, y0, z0], [x1, y0, z0]], south: [[x0, y1, z1], [x1, y1, z1], [x1, y0, z1], [x0, y0, z1]],
    west: [[x0, y1, z0], [x0, y1, z1], [x0, y0, z1], [x0, y0, z0]], east: [[x1, y1, z1], [x1, y1, z0], [x1, y0, z0], [x1, y0, z1]] })[dir]
  const defUv = (dir, [x0, y0, z0], [x1, y1, z1]) => ({ down: [x0, 16 - z1, x1, 16 - z0], up: [x0, z0, x1, z1], north: [16 - x1, 16 - y1, 16 - x0, 16 - y0],
    south: [x0, 16 - y1, x1, 16 - y0], west: [z0, 16 - y1, z1, 16 - y0], east: [16 - z1, 16 - y1, 16 - z0, 16 - y0] })[dir]
  const quads = []
  for (const [from, to, rot, faces] of boxes) {
    const er = rot ? chain(T(rot[2] / 16, rot[3] / 16, rot[4] / 16), { x: RX, y: RY, z: RZ }[rot[0]](deg(rot[1])), T(-rot[2] / 16, -rot[3] / 16, -rot[4] / 16)) : I
    for (const [dir, [t, uv0, , tint, uvrot]] of Object.entries(faces)) {
      const uv = uv0 || defUv(dir, from, to)
      let uvs = [[uv[0], uv[1]], [uv[2], uv[1]], [uv[2], uv[3]], [uv[0], uv[3]]]
      for (let r = 0; r < ((uvrot || 0) / 90) % 4; r++) uvs = [uvs[3], uvs[0], uvs[1], uvs[2]]
      const q = [t, tint ? 1 : 0]
      corners(dir, from, to).forEach((p, k) => q.push(...apply(chain(m, er), p.map(n => n / 16)).map(n => +(n * 16).toFixed(4)), uvs[k][0], uvs[k][1]))
      quads.push(q)
    }
  }
  return quads
}

/** Entity shapes for the viewer: { key: { q, pic? } }. layer(owner, method, desc) reads a model from the game's code; box(ref) gives a block model's boxes. */
export function addEntities({ layer, bigTex, box, roots }) {
  const out = {}, L = '()Lnet/minecraft/client/model/geom/builders/LayerDefinition;', M = '()Lnet/minecraft/client/model/geom/builders/MeshDefinition;'
  const model = (cls, method, desc = L) => partsOf(layer('net/minecraft/client/model/' + cls, method, desc).root)
  // LivingEntityRenderer: turned (180 - yaw; the viewer adds the yaw), flipped, and lifted so the feet are on the ground
  const living = (scale = 1) => chain(RY(Math.PI), S(scale), S(-1, -1, 1), T(0, -1.501, 0))

  out.iron_golem = { q: bake(model('animal/golem/IronGolemModel', 'createBodyLayer'), living(), bigTex('entity/iron_golem/iron_golem')) }

  // Snow golem, with its carved pumpkin (SnowGolemHeadLayer) on its head
  {
    const parts = model('animal/golem/SnowGolemModel', 'createBodyLayer'), head = find(parts, 'head'), base = living()
    const hm = chain(base, T(head.at[0] / 16, head.at[1] / 16, head.at[2] / 16), RZ(head.rot[2]), RY(head.rot[1]), RX(head.rot[0]))
    const pumpkin = boxQuads(box('block/carved_pumpkin'), chain(hm, T(0, -0.34375, 0), RY(Math.PI), S(0.625, -0.625, -0.625), T(-0.5, -0.5, -0.5)))
    const body = bake(parts, base, bigTex('entity/snow_golem/snow_golem'))
    out.snow_golem = { q: [...body, ...pumpkin] }
    out.snow_golem_sheared = { q: body }
  }

  // Mobs: every model below as the game registers it (sizes included), stood up by LivingEntityRenderer. Their textures (with the mob's
  // variant, colour or job) are picked and loaded by the viewer, so these have no texture of their own here.
  // Texture coordinates are kept in the layer's own texture size (s), which can differ from the picture's (the ghast's is drawn at twice the size)
  const HIDE = { armadillo: ['cube'], armadillo_baby: ['cube'], breeze: ['wind_body'], turtle: ['egg_belly'], turtle_baby: ['egg_belly'] }   // shown only rolled up, as wind, or with an egg
  const CHESTS = ['left_chest', 'right_chest']   // donkeys, mules and llamas carrying chests
  const keep = (parts, drop) => parts.filter(p => !drop.includes(p.name)).map(p => ({ ...p, kids: keep(p.kids, drop) }))
  const only = (parts, pick) => parts.flatMap(p => (pick.includes(p.name) ? [p] : (() => { const k = only(p.kids, pick); return k.length ? [{ ...p, cubes: [], kids: k }] : [] })()))
  for (const L of MOB_LAYERS) {
    const r = roots.get(L.toUpperCase()), parts = rootParts(roots, L.toUpperCase()); if (!parts) { console.warn('No model layer', L); continue }
    const m = L === 'wither' ? living(2) : living(), body = keep(parts, [...(HIDE[L] || []), ...CHESTS]), chests = only(parts, CHESTS)
    out['m:' + L] = { q: bake(body, m, -1), s: [r.w, r.h], ...handsOf(parts, m) }
    if (bake(chests, m, -1).length) out[`m:${L}:chests`] = { q: bake(chests, m, -1), s: [r.w, r.h] }
  }
  // Mooshrooms' mushrooms (MushroomCowMushroomLayer): two on the back, one on the head, as red or brown mushroom blocks
  {
    const parts = rootParts(roots, 'MOOSHROOM'), head = parts && pathTo(parts, 'head')
    if (head) {
      const back = chain(living(), T(0.2, -0.35, 0.5)), cross = chain(RY(deg(-48)), S(-1, -1, 1), T(-0.5, -0.5, -0.5))
      const spots = [chain(back, cross), chain(back, RY(deg(42)), T(0.1, 0, -0.6), cross), chain(living(), ...head.map(poseOf), T(0, -0.7, -0.2), RY(deg(-78)), S(-1, -1, 1), T(-0.5, -0.5, -0.5))]
      for (const c of ['red', 'brown']) out[`mooshroom_mushrooms_${c}`] = { q: spots.flatMap(m => boxQuads(box(`block/${c}_mushroom`), m)) }
    }
  }
  const knot = rootParts(roots, 'LEASH_KNOT'); if (knot) out['m:leash_knot'] = { q: bake(knot, S(-1, -1, 1), -1), s: [roots.get('LEASH_KNOT').w, roots.get('LEASH_KNOT').h] }
  const crystal = rootParts(roots, 'END_CRYSTAL'); if (crystal) out['m:end_crystal'] = { q: bake(crystal, chain(S(2), T(0, -0.5, 0)), -1), s: [roots.get('END_CRYSTAL').w, roots.get('END_CRYSTAL').h] }

  // Armour (HumanoidArmorLayer): the humanoid model grown a little, keeping each slot's parts. Leggings are the inner, smaller layer.
  {
    const MESH = '(Lnet/minecraft/client/model/geom/builders/CubeDeformation;F)Lnet/minecraft/client/model/geom/builders/MeshDefinition;'
    const humanoid = grow => partsOf(layer('net/minecraft/client/model/HumanoidModel', 'createMesh', MESH, [{ k: 'CubeDeformation', x: grow, y: grow, z: grow }, 0]).root)
    const SLOTS = { head: [['head'], 1, true], chest: [['body', 'left_arm', 'right_arm'], 1, false], legs: [['body', 'left_leg', 'right_leg'], 0.5, false], feet: [['left_leg', 'right_leg'], 1, false] }
    for (const [slot, [names, grow, kids]] of Object.entries(SLOTS)) {
      const parts = humanoid(grow).filter(p => names.includes(p.name)).map(p => (kids ? p : { ...p, kids: [] }))
      out['armor:' + slot] = { q: bake(parts, living(), -1), s: [64, 32] }
    }
  }

  // Armor stand in its default pose; arms and base plate kept apart since stands can hide them
  {
    const parts = model('object/armorstand/ArmorStandModel', 'createBodyLayer'), t = bigTex('entity/armorstand/armorstand')
    const pose = (n, x, y, z) => { const p = find(parts, n); if (p) p.rot = [deg(x), deg(y), deg(z)] }
    pose('left_arm', -10, 0, -10); pose('right_arm', -15, 0, 10); pose('left_leg', -1, 0, -1); pose('right_leg', 1, 0, 1)
    const arms = new Set(['left_arm', 'right_arm']), m = living()
    out.armor_stand = { q: bake(parts.filter(p => !arms.has(p.name) && p.name !== 'base_plate'), m, t), ...handsOf(parts, m) }
    out.armor_stand_arms = { q: bake(parts.filter(p => arms.has(p.name)), m, t) }
    out.armor_stand_plate = { q: bake(parts.filter(p => p.name === 'base_plate'), m, t) }
  }

  // Boats and rafts (AbstractBoatRenderer), paddles resting where the game leaves them
  {
    const m = chain(T(0, 0.375, 0), RY(Math.PI), S(-1, -1, 1), RY(Math.PI / 2))
    const rest = parts => {
      const x = -Math.PI / 3 + (-0.2617994 + Math.PI / 3) * 0.5, y = -Math.PI / 4 + (Math.PI / 2) * (Math.sin(1) + 1) / 2
      for (const [n, side] of [['left_paddle', 0], ['right_paddle', 1]]) { const p = find(parts, n); if (p) p.rot = [x, side ? Math.PI - y : y, p.rot[2]] }
      return parts
    }
    for (const w of ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'cherry', 'dark_oak', 'mangrove', 'pale_oak', 'poplar']) {
      out[`${w}_boat`] = { q: bake(rest(model('object/boat/BoatModel', 'createBoatModel')), m, bigTex(`entity/boat/${w}`)) }
      out[`${w}_chest_boat`] = { q: bake(rest(model('object/boat/BoatModel', 'createChestBoatModel')), m, bigTex(`entity/chest_boat/${w}`)) }
    }
    out.bamboo_raft = { q: bake(rest(model('object/boat/RaftModel', 'createRaftModel')), m, bigTex('entity/boat/bamboo')) }
    out.bamboo_chest_raft = { q: bake(rest(model('object/boat/RaftModel', 'createChestRaftModel')), m, bigTex('entity/chest_boat/bamboo')) }
  }

  // Minecarts (AbstractMinecartRenderer) and what rides in them, 0.75 the size of the block
  {
    const base = chain(T(0, 0.375, 0), RY(Math.PI)), cart = bake(model('object/cart/MinecartModel', 'createBodyLayer'), chain(base, S(-1, -1, 1)), bigTex('entity/minecart/minecart'))
    const inside = offset => chain(base, S(0.75), T(-0.5, (offset - 8) / 16, 0.5), RY(Math.PI / 2))
    out.minecart = { q: cart }
    out.chest_minecart = { q: [...cart, ...bake(chestParts('single'), chain(inside(8), T(0.5, 0, 0.5), RY(Math.PI), T(-0.5, 0, -0.5)), bigTex('entity/chest/normal'))] }
    out.hopper_minecart = { q: [...cart, ...boxQuads(box('block/hopper'), inside(1))] }
    out.furnace_minecart = { q: [...cart, ...boxQuads(box('block/furnace'), inside(6))] }
    out.tnt_minecart = { q: [...cart, ...boxQuads(box('block/tnt'), inside(6))] }
  }

  // Shulker (ShulkerRenderer), shut, on the floor
  {
    const parts = model('monster/shulker/ShulkerModel', 'createBodyLayer')
    for (const c of [null, ...COLOURS]) out[c ? `shulker_${c}` : 'shulker'] = { q: bake(parts, living(), bigTex(`entity/shulker/shulker${c ? '_' + c : ''}`)) }
  }

  // Item frames (ItemFrameRenderer): the frame against its wall, and where the item goes (a square the viewer fills with the item's icon)
  for (const f of DIR3) {
    const horiz = !['up', 'down'].includes(f), xr = horiz ? 0 : (f === 'up' ? -90 : 90), yr = horiz ? 180 - YROT[f] : 180
    const m = chain(T(0.5, 0.5, 0.5), RX(deg(xr)), RY(deg(yr)), T(-0.5, -0.5, -0.5))
    for (const n of ['item_frame', 'glow_item_frame']) out[`${n}:${f}`] = { q: boxQuads(box('block/' + n), m) }
    const z = 0.5 + 0.4375 - 0.004, at = (x, y) => apply(m, [x, y, z]).map(v => +(v * 16).toFixed(4))
    out[`frame_item:${f}`] = { q: [[0, 0, ...at(0.75, 0.75), 0, 0, ...at(0.25, 0.75), 64, 0, ...at(0.25, 0.25), 64, 64, ...at(0.75, 0.25), 0, 64]] }
  }
  return out
}
