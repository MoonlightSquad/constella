/**
 * Палітра продукту — вирахована зі scoped-CSS `apps/web` (hex там розкидані по
 * 1 400 рядках `ConstellaDashboard.vue`). В мобільному це єдине джерело істини.
 */
export const colors = {
  bg: '#0d1718',
  bgDeep: '#101c1d',
  surface: '#132122',
  surfaceRaised: '#18211e',
  border: '#2b3c3d',
  borderStrong: '#344748',
  text: '#f3f5f2',
  textSoft: '#c5d0cc',
  muted: '#91a19d',
  mutedSoft: '#aab9b6',
  gold: '#e4b46c',
  goldDeep: '#d9ad6d',
  goldSoft: '#e4c28b',
  goldDim: '#9d815c',
  mint: '#82c7b7',
  mintSoft: '#85c9b9',
  mintDim: '#4a756b',
  danger: '#f29b8e',
  dangerSoft: '#ff9c8f',
  dangerDim: '#30291f',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 18,
  pill: 999,
} as const;

export const typography = {
  display: { fontSize: 30, lineHeight: 36, fontWeight: '700' as const },
  title: { fontSize: 21, lineHeight: 27, fontWeight: '700' as const },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' as const },
  label: { fontSize: 12, lineHeight: 16, fontWeight: '600' as const, letterSpacing: 0.6 },
  caption: { fontSize: 11, lineHeight: 15 },
} as const;
