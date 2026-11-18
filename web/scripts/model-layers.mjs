// Reads the game's entity model shapes straight from its code. Mob models are built by small Java methods (createBodyLayer and so on)
// that call CubeListBuilder.addBox, PartPose.offset and the like with fixed numbers. This runs those methods' bytecode from the jar
// with a tiny interpreter that knows just those builder calls, and returns the parts tree: no Java needed, and it follows game updates.

// ---- class files
export function parseClass(buf) {
  let o = 8
  const u1 = () => buf[o++], u2 = () => { const v = buf.readUInt16BE(o); o += 2; return v }, u4 = () => { const v = buf.readUInt32BE(o); o += 4; return v }
  const n = u2(), cp = new Array(n)
  for (let i = 1; i < n; i++) {
    const t = u1()
    switch (t) {
      case 1: { const len = u2(); cp[i] = { t, s: buf.toString('utf8', o, o + len) }; o += len; break }
      case 3: cp[i] = { t, v: buf.readInt32BE(o) }; o += 4; break
      case 4: cp[i] = { t, v: buf.readFloatBE(o) }; o += 4; break
      case 5: cp[i] = { t, v: Number(buf.readBigInt64BE(o)) }; o += 8; i++; break
      case 6: cp[i] = { t, v: buf.readDoubleBE(o) }; o += 8; i++; break
      case 7: case 8: case 16: case 19: case 20: cp[i] = { t, a: u2() }; break
      case 9: case 10: case 11: case 12: case 17: case 18: cp[i] = { t, a: u2(), b: u2() }; break
      case 15: cp[i] = { t, k: u1(), a: u2() }; break
      default: throw new Error('constant pool tag ' + t)
    }
  }
  const utf = i => cp[i].s
  o += 6; const ifs = u2(); o += ifs * 2
  const skipAttrs = () => { const c = u2(); for (let i = 0; i < c; i++) { o += 2; const l = u4(); o += l } }
  const fc = u2(); for (let i = 0; i < fc; i++) { o += 6; skipAttrs() }
  const methods = new Map()
  const mc = u2()
  for (let i = 0; i < mc; i++) {
    o += 2; const name = utf(u2()), desc = utf(u2()), ac = u2()
    for (let k = 0; k < ac; k++) {
      const an = utf(u2()), len = u4(), end = o + len
      if (an === 'Code') { o += 2; const maxLocals = u2(), cl = u4(); methods.set(name + desc, { code: buf.subarray(o, o + cl), maxLocals }); }
      o = end
    }
  }
  const boot = []
  const ac = u2()
  for (let k = 0; k < ac; k++) {
    const an = utf(u2()), len = u4(), end = o + len
    if (an === 'BootstrapMethods') { const c = u2(); for (let i = 0; i < c; i++) { const ref = u2(), na = u2(), args = []; for (let j = 0; j < na; j++) args.push(u2()); boot.push({ ref, args }) } }
    o = end
  }
  return { cp, utf, methods, boot }
}

// ---- what the model builders make
const pose = (x = 0, y = 0, z = 0, xRot = 0, yRot = 0, zRot = 0) => ({ k: 'PartPose', x, y, z, xRot, yRot, zRot, xScale: 1, yScale: 1, zScale: 1 })
const partDef = (cubes = [], p = pose()) => ({ k: 'PartDefinition', cubes, pose: p, children: new Map() })
const deform = (x = 0, y = x, z = x) => ({ k: 'CubeDeformation', x, y, z })
const builder = () => ({ k: 'CubeListBuilder', cubes: [], u: 0, v: 0, mirror: false })
const ENUMS = new Set(['net/minecraft/core/Direction'])

/** Runs a static method that builds a model (returns a LayerDefinition or MeshDefinition). */
export function makeReader(readClassBytes) {
  const classes = new Map()
  const load = name => { if (!classes.has(name)) { const b = readClassBytes(name); classes.set(name, b ? parseClass(b) : null) } return classes.get(name) }

  function run(owner, name, desc, args) {
    const cls = load(owner); if (!cls) throw new Error(`no class ${owner}`)
    const m = cls.methods.get(name + desc); if (!m) throw new Error(`no method ${owner}.${name}${desc}`)
    const { cp, utf } = cls, code = m.code, loc = new Array(Math.max(m.maxLocals, args.length)).fill(undefined), st = []
    // arguments: longs/doubles take two slots
    let li = 0; const params = desc.slice(1, desc.indexOf(')')).match(/\[*(L[^;]+;|[ZBCSIFJD])/g) || []
    params.forEach((p, i) => { loc[li] = args[i]; li += p === 'J' || p === 'D' ? 2 : 1 })
    const ref = i => { const r = cp[i], c = cp[r.a], nt = cp[r.b]; return { owner: utf(c.a), name: utf(nt.a), desc: utf(nt.b) } }
    const ldc = i => { const c = cp[i]; if (c.t === 8) return utf(c.a); if (c.t === 7) return { k: 'Class', name: utf(c.a) }; return c.v }
    let pc = 0, steps = 0
    const s2 = () => { const v = code.readInt16BE(pc); pc += 2; return v }, u2 = () => { const v = code.readUInt16BE(pc); pc += 2; return v }
    for (;;) {
      if (++steps > 2e6) throw new Error('runaway method ' + name)
      const at = pc, op = code[pc++]
      switch (op) {
        case 0x00: break
        case 0x01: st.push(null); break
        case 0x02: case 0x03: case 0x04: case 0x05: case 0x06: case 0x07: case 0x08: st.push(op - 3); break
        case 0x09: case 0x0a: st.push(op - 9); break
        case 0x0b: case 0x0c: case 0x0d: st.push(op - 0x0b); break
        case 0x0e: case 0x0f: st.push(op - 0x0e); break
        case 0x10: st.push(code.readInt8(pc++)); break
        case 0x11: st.push(s2()); break
        case 0x12: st.push(ldc(code[pc++])); break
        case 0x13: case 0x14: st.push(ldc(u2())); break
        case 0x15: case 0x16: case 0x17: case 0x18: case 0x19: st.push(loc[code[pc++]]); break
        case 0x1a: case 0x1b: case 0x1c: case 0x1d: st.push(loc[op - 0x1a]); break
        case 0x1e: case 0x1f: case 0x20: case 0x21: st.push(loc[op - 0x1e]); break
        case 0x22: case 0x23: case 0x24: case 0x25: st.push(loc[op - 0x22]); break
        case 0x26: case 0x27: case 0x28: case 0x29: st.push(loc[op - 0x26]); break
        case 0x2a: case 0x2b: case 0x2c: case 0x2d: st.push(loc[op - 0x2a]); break
        case 0x2e: case 0x2f: case 0x30: case 0x31: case 0x32: case 0x33: case 0x34: case 0x35: { const i = st.pop(), a = st.pop(); st.push(a[i]); break }
        case 0x36: case 0x37: case 0x38: case 0x39: case 0x3a: loc[code[pc++]] = st.pop(); break
        case 0x3b: case 0x3c: case 0x3d: case 0x3e: loc[op - 0x3b] = st.pop(); break
        case 0x3f: case 0x40: case 0x41: case 0x42: loc[op - 0x3f] = st.pop(); break
        case 0x43: case 0x44: case 0x45: case 0x46: loc[op - 0x43] = st.pop(); break
        case 0x47: case 0x48: case 0x49: case 0x4a: loc[op - 0x47] = st.pop(); break
        case 0x4b: case 0x4c: case 0x4d: case 0x4e: loc[op - 0x4b] = st.pop(); break
        case 0x4f: case 0x50: case 0x51: case 0x52: case 0x53: case 0x54: case 0x55: case 0x56: { const v = st.pop(), i = st.pop(), a = st.pop(); a[i] = v; break }
        case 0x57: st.pop(); break
        case 0x58: st.pop(); st.pop(); break
        case 0x59: st.push(st[st.length - 1]); break
        case 0x5a: { const a = st.pop(), b = st.pop(); st.push(a, b, a); break }
        case 0x5b: { const a = st.pop(), b = st.pop(), c = st.pop(); st.push(a, c, b, a); break }
        case 0x5c: { const a = st.pop(), b = st.pop(); st.push(b, a, b, a); break }
        case 0x5f: { const a = st.pop(), b = st.pop(); st.push(a, b); break }
        case 0x60: case 0x61: case 0x62: case 0x63: { const b = st.pop(), a = st.pop(); st.push(op === 0x62 || op === 0x63 ? a + b : (a + b) | 0); if (op === 0x61) st[st.length - 1] = a + b; break }
        case 0x64: case 0x65: case 0x66: case 0x67: { const b = st.pop(), a = st.pop(); st.push(op === 0x64 ? (a - b) | 0 : a - b); break }
        case 0x68: case 0x69: case 0x6a: case 0x6b: { const b = st.pop(), a = st.pop(); st.push(op === 0x68 ? Math.imul(a, b) : a * b); break }
        case 0x6c: case 0x6d: case 0x6e: case 0x6f: { const b = st.pop(), a = st.pop(); st.push(op === 0x6c || op === 0x6d ? Math.trunc(a / b) : a / b); break }
        case 0x70: case 0x71: case 0x72: case 0x73: { const b = st.pop(), a = st.pop(); st.push(a % b); break }
        case 0x74: case 0x75: case 0x76: case 0x77: st.push(-st.pop()); break
        case 0x78: { const b = st.pop(), a = st.pop(); st.push(a << b); break }
        case 0x7a: { const b = st.pop(), a = st.pop(); st.push(a >> b); break }
        case 0x7e: { const b = st.pop(), a = st.pop(); st.push(a & b); break }
        case 0x80: { const b = st.pop(), a = st.pop(); st.push(a | b); break }
        case 0x84: { const i = code[pc++], c = code.readInt8(pc++); loc[i] += c; break }
        case 0x85: case 0x86: case 0x87: case 0x89: case 0x8a: case 0x8c: case 0x8d: case 0x90: break   // widening/narrowing to float/double/long
        case 0x88: case 0x8b: case 0x8e: st.push(Math.trunc(st.pop())); break
        case 0x91: case 0x92: case 0x93: break
        case 0x94: case 0x95: case 0x96: case 0x97: case 0x98: { const b = st.pop(), a = st.pop(); st.push(a > b ? 1 : a < b ? -1 : 0); break }
        case 0x99: case 0x9a: case 0x9b: case 0x9c: case 0x9d: case 0x9e: {
          const off = s2(), v = st.pop(), ok = [v === 0, v !== 0, v < 0, v >= 0, v > 0, v <= 0][op - 0x99]
          if (ok) pc = at + off; break
        }
        case 0x9f: case 0xa0: case 0xa1: case 0xa2: case 0xa3: case 0xa4: case 0xa5: case 0xa6: {
          const off = s2(), b = st.pop(), a = st.pop(), ok = [a === b, a !== b, a < b, a >= b, a > b, a <= b, a === b, a !== b][op - 0x9f]
          if (ok) pc = at + off; break
        }
        case 0xa7: pc = at + s2(); break
        case 0xac: case 0xad: case 0xae: case 0xaf: case 0xb0: return st.pop()
        case 0xb1: return undefined
        case 0xb2: { const r = ref(u2()); st.push(getStatic(r)); break }
        case 0xb3: { u2(); st.pop(); break }
        case 0xb4: { const r = ref(u2()), obj = st.pop(); st.push(obj?.[r.name] ?? 0); break }
        case 0xb5: { const r = ref(u2()), v = st.pop(), obj = st.pop(); if (obj) obj[r.name] = v; break }
        case 0xb6: case 0xb7: case 0xb8: case 0xb9: {
          const r = ref(u2()); if (op === 0xb9) pc += 2
          const n = (r.desc.slice(1, r.desc.indexOf(')')).match(/\[*(L[^;]+;|[ZBCSIFJD])/g) || []).length
          const a = st.splice(st.length - n, n), self = op === 0xb8 ? undefined : st.pop()
          const out = call(r, self, a)
          if (!r.desc.endsWith(')V')) st.push(out)
          break
        }
        case 0xba: {   // invokedynamic: string concatenation only
          const i = u2(); pc += 2
          const c = cp[i], nt = cp[c.b], nm = utf(nt.a), d = utf(nt.b), b = cls.boot[c.a]
          const n = (d.slice(1, d.indexOf(')')).match(/\[*(L[^;]+;|[ZBCSIFJD])/g) || []).length, a = st.splice(st.length - n, n)
          if (nm !== 'makeConcatWithConstants') { st.push({ k: 'Lambda', name: nm }); break }
          const recipe = ldc(b.args[0]); let k = 0
          st.push(recipe.replace(/\u0001/g, () => String(a[k++])))
          break
        }
        case 0xbb: { const c = cp[u2()]; st.push({ k: 'New', cls: utf(c.a) }); break }
        case 0xbc: { pc++; st.push(new Array(st.pop()).fill(0)); break }
        case 0xbd: { u2(); st.push(new Array(st.pop()).fill(null)); break }
        case 0xbe: st.push(st.pop().length); break
        case 0xc0: case 0xc1: u2(); if (op === 0xc1) st.push(st.pop() ? 1 : 0); break
        case 0xc6: case 0xc7: { const off = s2(), v = st.pop(); if ((op === 0xc6) === (v == null)) pc = at + off; break }
        default: throw new Error(`opcode 0x${op.toString(16)} in ${owner}.${name}`)
      }
    }
  }

  function getStatic({ owner, name }) {
    if (owner.endsWith('/PartPose') && name === 'ZERO') return pose()
    if (owner.endsWith('/CubeDeformation') && name === 'NONE') return deform()
    if (ENUMS.has(owner)) return { k: 'Enum', name }
    if (owner === 'net/minecraft/util/Mth' && name === 'PI') return Math.PI
    return { k: 'Static', owner, name }
  }

  function call({ owner, name, desc }, self, a) {
    const short = owner.slice(owner.lastIndexOf('/') + 1)
    // constructors of the builder types
    if (name === '<init>') {
      if (self?.k === 'New') {
        if (short === 'CubeDeformation') Object.assign(self, a.length === 1 ? deform(a[0]) : deform(a[0], a[1], a[2]))
        else if (short === 'MeshDefinition') Object.assign(self, { k: 'MeshDefinition', root: partDef() })
      }
      return
    }
    switch (short + '.' + name) {
      case 'MeshDefinition.getRoot': return self.root
      case 'CubeListBuilder.create': return builder()
      case 'CubeListBuilder.texOffs': self.u = a[0]; self.v = a[1]; return self
      case 'CubeListBuilder.mirror': self.mirror = a.length ? !!a[0] : true; return self
      case 'CubeListBuilder.addBox': {
        // addBox(x,y,z,w,h,d), (x..d, deform), (x..d, mirror), (x..d, Set<Direction>), (name, x..d, deform, u, v) and (x..d, deform, uScale, vScale)
        let i = 0; if (typeof a[0] === 'string') i = 1
        const [x, y, z, w, h, d] = a.slice(i, i + 6), rest = a.slice(i + 6)
        const c = { u: self.u, v: self.v, x, y, z, w, h, d, grow: [0, 0, 0], mirror: self.mirror, only: null }
        for (const r of rest) {
          if (r?.k === 'CubeDeformation') c.grow = [r.x, r.y, r.z]
          else if (r?.k === 'Set') c.only = r.items
          else if (typeof r === 'boolean' || (rest.length === 1 && (r === 0 || r === 1) && desc.includes('FFFFFFZ'))) c.mirror = !!r
        }
        if (i === 1 && rest.length >= 3) { c.u = rest[1]; c.v = rest[2] }
        self.cubes.push(c); return self
      }
      case 'PartPose.offset': return pose(a[0], a[1], a[2])
      case 'PartPose.rotation': return pose(0, 0, 0, a[0], a[1], a[2])
      case 'PartPose.offsetAndRotation': return pose(...a)
      case 'PartPose.withScale': return { ...self, xScale: a[0], yScale: a[0], zScale: a[0] }
      case 'PartPose.translated': return { ...self, x: self.x + a[0], y: self.y + a[1], z: self.z + a[2] }
      case 'PartPose.scaled': return { ...self, xScale: self.xScale * a[0], yScale: self.yScale * a[0], zScale: self.zScale * a[0] }
      case 'PartPose.withRotation': case 'PartPose.offsetAndRotation_': return pose(self.x, self.y, self.z, a[0], a[1], a[2])
      case 'CubeDeformation.extend': return a.length === 1 ? deform(self.x + a[0], self.y + a[0], self.z + a[0]) : deform(self.x + a[0], self.y + a[1], self.z + a[2])
      case 'PartDefinition.addOrReplaceChild': { const p = partDef(a[1].cubes, a[2]); self.children.set(a[0], p); return p }
      case 'PartDefinition.getChild': return self.children.get(a[0])
      case 'PartDefinition.clearChild': self.children.set(a[0], partDef()); return self.children.get(a[0])
      case 'PartDefinition.clearRecursively': self.cubes = []; for (const k of self.children.keys()) self.children.set(k, partDef([], self.children.get(k).pose)); return self
      case 'LayerDefinition.create': return { k: 'LayerDefinition', mesh: a[0], w: a[1], h: a[2] }
      case 'EnumSet.of': return { k: 'Set', items: a.map(e => e.name.toLowerCase()) }
      case 'Util.allOfEnumExcept': return { k: 'Set', items: ['down', 'up', 'north', 'south', 'west', 'east'].filter(d => !a.some(e => e?.name?.toLowerCase() === d)) }
      case 'Math.cos': case 'Mth.cos': return Math.cos(a[0])
      case 'Math.sin': case 'Mth.sin': return Math.sin(a[0])
      case 'Math.toRadians': return a[0] * Math.PI / 180
      case 'Float.valueOf': case 'Integer.valueOf': case 'Float.floatValue': return a[0] ?? self
      case 'ImmutableList.of': case 'List.of': return a
    }
    // anything else inside the game's model code (shared helpers like HumanoidModel.createMesh): run it too
    if (owner.startsWith('net/minecraft/client/model/') && !self) return run(owner, name, desc, a)
    throw new Error(`can't run ${owner}.${name}${desc}`)
  }

  /** Runs owner.name (a static model method with no arguments, or with args) and returns its parts tree, texture size and part names. */
  return function layer(owner, name, desc, args = []) {
    const out = run(owner, name, desc, args)
    const mesh = out?.k === 'LayerDefinition' ? out.mesh : out
    return { root: mesh.root, w: out?.w ?? 64, h: out?.h ?? 64 }
  }
}
