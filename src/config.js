export const ELEMENT_IDS = ['fire', 'water', 'earth', 'air'];

export const ARENA_RADIUS = 38;
export const PLAY_RADIUS = 33.2;
export const TOWER_RING_RADIUS = 26;
export const TOWER_RADIUS = 4.35;
export const TOWER_HP = 950;
export const CENTER_RADIUS = 9.5;
export const AVATAR_RADIUS = 1.15;
export const AVATAR_MAX_HP = 320;

export const ELEMENTS = {
  fire: {
    id: 'fire',
    name: 'Fire',
    avatar: 'Pyra',
    role: 'Ember Juggernaut',
    angle: -Math.PI / 2,
    color: 0xff6a2a,
    bright: 0xffc45c,
    deep: 0xb32a08,
    dark: 0x26100b,
    mid: 0x6e2410,
    css: '#ff6a2a',
    brightCss: '#ffc45c',
    tagline: 'Burn the world to ash.',
    desc: 'Lobs splash-fire that ignites foes. Meteor Fall cracks clustered defenders and towers alike.',
    stats: { power: 92, speed: 60, control: 52 },
    health: 330,
    moveSpeed: 9.3,
    attackCd: 0.56,
    damage: 36,
    projectileSpeed: 33,
    splash: 2.6,
    towerMult: 1.0,
    shots: 1,
    spread: 0.05,
    ultName: 'Meteor Fall',
    ultDesc: 'A storm of eight burning meteors rains down at your aim.'
  },
  water: {
    id: 'water',
    name: 'Water',
    avatar: 'Naia',
    role: 'Tide Oracle',
    angle: 0,
    color: 0x30c6ff,
    bright: 0xa8f2ff,
    deep: 0x0b6d9c,
    dark: 0x071722,
    mid: 0x0d4a63,
    css: '#30c6ff',
    brightCss: '#a8f2ff',
    tagline: 'The tide always returns.',
    desc: 'Chilling bolts slow enemies and mend your wounds. Maelstrom restores you and your nexus.',
    stats: { power: 66, speed: 74, control: 88 },
    health: 320,
    moveSpeed: 9.7,
    attackCd: 0.4,
    damage: 27,
    projectileSpeed: 31,
    splash: 1.1,
    towerMult: 1.0,
    shots: 1,
    spread: 0.04,
    ultName: 'Maelstrom',
    ultDesc: 'A cleansing vortex slows rivals, damages them, and heals you and your nexus.'
  },
  earth: {
    id: 'earth',
    name: 'Earth',
    avatar: 'Terrus',
    role: 'Stone Warden',
    angle: Math.PI / 2,
    color: 0x8fce4a,
    bright: 0xdcf9a4,
    deep: 0x4f7f20,
    dark: 0x101a09,
    mid: 0x35491c,
    css: '#8fce4a',
    brightCss: '#dcf9a4',
    tagline: 'The mountain does not yield.',
    desc: 'Heavy boulders stagger foes and shatter stone. Cataclysm erupts in a stunning shockwave.',
    stats: { power: 100, speed: 42, control: 64 },
    health: 360,
    moveSpeed: 8.2,
    attackCd: 0.94,
    damage: 54,
    projectileSpeed: 25,
    splash: 3.0,
    towerMult: 1.35,
    shots: 1,
    spread: 0.03,
    ultName: 'Cataclysm',
    ultDesc: 'Three seismic waves erupt at your aim, damaging and stunning everything caught.'
  },
  air: {
    id: 'air',
    name: 'Air',
    avatar: 'Zephyra',
    role: 'Storm Dancer',
    angle: Math.PI,
    color: 0xb18cff,
    bright: 0xede4ff,
    deep: 0x6f4cc4,
    dark: 0x120d24,
    mid: 0x3f3268,
    css: '#b18cff',
    brightCss: '#ede4ff',
    tagline: 'Nothing holds the wind.',
    desc: 'Twin gale bolts shred at close range. Cyclone drags rivals into a howling vortex.',
    stats: { power: 58, speed: 96, control: 72 },
    health: 300,
    moveSpeed: 10.6,
    attackCd: 0.29,
    damage: 13,
    projectileSpeed: 47,
    splash: 0.8,
    towerMult: 0.72,
    shots: 2,
    spread: 0.055,
    ultName: 'Cyclone',
    ultDesc: 'Summon a roaming vortex that pulls enemies inward and shreds them over time.'
  }
};

export function towerPos(id) {
  const a = ELEMENTS[id].angle;
  return { x: Math.cos(a) * TOWER_RING_RADIUS, z: Math.sin(a) * TOWER_RING_RADIUS };
}

export function spawnPos(id) {
  const a = ELEMENTS[id].angle;
  const r = 18.5;
  return { x: Math.cos(a) * r, z: Math.sin(a) * r };
}

export function icon(id) {
  return `<svg class="icon" aria-hidden="true"><use href="#icon-${id}"></use></svg>`;
}
