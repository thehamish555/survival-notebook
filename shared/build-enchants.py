"""Single source of truth for enchantment rules. Generates enchants.json and copies it to the website and the mod.
   Run from the repo root:  python3 shared/build-enchants.py   (CI fails if the committed copies are stale)"""
import json, shutil, os

E = {  # key (Minecraft registry path): (display name, max level, curse?)
 'protection': ('Protection', 4), 'fire_protection': ('Fire Protection', 4), 'blast_protection': ('Blast Protection', 4), 'projectile_protection': ('Projectile Protection', 4),
 'respiration': ('Respiration', 3), 'aqua_affinity': ('Aqua Affinity', 1), 'thorns': ('Thorns', 3), 'feather_falling': ('Feather Falling', 4),
 'depth_strider': ('Depth Strider', 3), 'frost_walker': ('Frost Walker', 2), 'soul_speed': ('Soul Speed', 3), 'swift_sneak': ('Swift Sneak', 3),
 'sharpness': ('Sharpness', 5), 'smite': ('Smite', 5), 'bane_of_arthropods': ('Bane of Arthropods', 5), 'knockback': ('Knockback', 2),
 'fire_aspect': ('Fire Aspect', 2), 'looting': ('Looting', 3), 'sweeping_edge': ('Sweeping Edge', 3),
 'efficiency': ('Efficiency', 5), 'silk_touch': ('Silk Touch', 1), 'fortune': ('Fortune', 3), 'unbreaking': ('Unbreaking', 3), 'mending': ('Mending', 1),
 'power': ('Power', 5), 'punch': ('Punch', 2), 'flame': ('Flame', 1), 'infinity': ('Infinity', 1),
 'multishot': ('Multishot', 1), 'piercing': ('Piercing', 4), 'quick_charge': ('Quick Charge', 3),
 'impaling': ('Impaling', 5), 'riptide': ('Riptide', 3), 'loyalty': ('Loyalty', 3), 'channeling': ('Channeling', 1),
 'luck_of_the_sea': ('Luck of the Sea', 3), 'lure': ('Lure', 3),
 'density': ('Density', 5), 'breach': ('Breach', 4), 'wind_burst': ('Wind Burst', 3), 'lunge': ('Lunge', 3),
}
CURSES = {'binding_curse': 'Curse of Binding', 'vanishing_curse': 'Curse of Vanishing'}
EXCLUSIVE = [
 ['sharpness', 'smite', 'bane_of_arthropods', 'density', 'breach'],
 ['protection', 'fire_protection', 'blast_protection', 'projectile_protection'],
 ['fortune', 'silk_touch'], ['depth_strider', 'frost_walker'], ['infinity', 'mending'], ['multishot', 'piercing'],
 ['riptide', 'loyalty'], ['riptide', 'channeling'],
]
TOOL_MATS = ['netherite', 'diamond', 'iron', 'copper', 'golden', 'stone', 'wooden']
ARMOR_MATS = ['netherite', 'diamond', 'iron', 'copper', 'golden', 'chainmail', 'leather']
BASE = ['unbreaking', 'mending', 'vanishing_curse']
ARMOR = ['protection', 'fire_protection', 'blast_protection', 'projectile_protection', 'thorns', 'unbreaking', 'mending', 'binding_curse', 'vanishing_curse']
DIG = ['efficiency', 'silk_touch', 'fortune'] + BASE
# key, label, group, mats-or-None (None = single item), enchants
KINDS = [
 ('sword', 'Sword', 'Weapons', TOOL_MATS, ['sharpness', 'smite', 'bane_of_arthropods', 'knockback', 'fire_aspect', 'looting', 'sweeping_edge'] + BASE),
 ('spear', 'Spear', 'Weapons', TOOL_MATS, ['lunge', 'sharpness', 'smite', 'bane_of_arthropods', 'knockback', 'fire_aspect', 'looting'] + BASE),
 ('mace', 'Mace', 'Weapons', None, ['density', 'breach', 'smite', 'bane_of_arthropods', 'wind_burst', 'fire_aspect'] + BASE),
 ('trident', 'Trident', 'Weapons', None, ['impaling', 'riptide', 'loyalty', 'channeling'] + BASE),
 ('bow', 'Bow', 'Weapons', None, ['power', 'punch', 'flame', 'infinity'] + BASE),
 ('crossbow', 'Crossbow', 'Weapons', None, ['quick_charge', 'multishot', 'piercing'] + BASE),
 ('axe', 'Axe', 'Tools', TOOL_MATS, ['sharpness', 'smite', 'bane_of_arthropods'] + DIG),
 ('pickaxe', 'Pickaxe', 'Tools', TOOL_MATS, DIG),
 ('shovel', 'Shovel', 'Tools', TOOL_MATS, DIG),
 ('hoe', 'Hoe', 'Tools', TOOL_MATS, DIG),
 ('shears', 'Shears', 'Tools', None, ['efficiency'] + BASE),
 ('fishing_rod', 'Fishing Rod', 'Tools', None, ['luck_of_the_sea', 'lure'] + BASE),
 ('helmet', 'Helmet', 'Armor', ARMOR_MATS + ['turtle'], ARMOR + ['respiration', 'aqua_affinity']),
 ('chestplate', 'Chestplate', 'Armor', ARMOR_MATS, ARMOR),
 ('leggings', 'Leggings', 'Armor', ARMOR_MATS, ARMOR + ['swift_sneak']),
 ('boots', 'Boots', 'Armor', ARMOR_MATS, ARMOR + ['feather_falling', 'depth_strider', 'frost_walker', 'soul_speed']),
 ('shield', 'Shield', 'Other', None, BASE),
 ('elytra', 'Elytra', 'Other', None, ['unbreaking', 'mending', 'binding_curse', 'vanishing_curse']),
]
def title(m): return 'Turtle Shell' if m == 'turtle' else m.capitalize()
kinds = {}
for key, label, group, mats, ench in KINDS:
    assert all(e in E or e in CURSES for e in ench), key
    variants = [{'label': title(m), 'id': f'{m}_{key}'} for m in mats] if mats else [{'label': label, 'id': key}]
    kinds[key] = {'label': label, 'group': group, 'enchants': ench, 'variants': variants}
enchants = {k: {'name': n, 'max': m} for k, (n, m) in E.items()}
enchants.update({k: {'name': n, 'max': 1, 'curse': True} for k, n in CURSES.items()})
out = json.dumps({'version': 1, 'enchants': enchants, 'exclusive': EXCLUSIVE, 'kinds': kinds}, indent=1)
for p in ['shared/enchants.json', 'web/lib/enchants.json', 'mod/src/main/resources/assets/survival_notebook/enchants.json']:
    os.makedirs(os.path.dirname(p), exist_ok=True); open(p, 'w').write(out + '\n')
print('kinds:', len(kinds), 'enchants:', len(enchants))
