// Design tokens transcribed from the CityShare design handoff
// ("CityShare Handoff Spec.dc.html" section 10, and the README design
// tokens table). React Native styles don't accept oklch(), so those
// values are converted to hex here — the oklch source is kept in a
// comment next to each so a future palette tweak can be re-derived.

export const colors = {
  ink: '#171A17',
  paper: '#F5F4F0',
  card: '#FFFFFF',
  sand: '#ECEBE5',

  // oklch(0.55 0.15 145) — actions/supply on light surfaces
  shareGreen: '#278733',
  // oklch(0.72 0.15 145) — same role on dark surfaces (verification, driver, Partner mode)
  greenOnDark: '#61BD67',
  // oklch(0.78 0.15 145) — button hover/pressed on dark surfaces
  greenOnDarkHover: '#75D079',
  // oklch(0.96 0.02 145) — Express card header strips
  greenTint: '#EAF6EA',
  // oklch(0.32 0.06 145) / oklch(0.85 0.13 145) — "MATCHED"/"VERIFIED" chip
  matchedChipBg: '#1E3B1F',
  matchedChipInk: '#96E498',

  partnerTan: '#B9A97F',
  tanTint: '#F3F1EA',

  disputeRed: '#8F3A3A',

  warningAmber: '#D8B166',
  warningBg: '#F8F0E6',
  warningInk: '#8A7130',

  // oklch(0.95 0.025 220) / oklch(0.42 0.09 230) — the AC comfort-fact chip only
  acBlueBg: '#DDF3FA',
  acBlueInk: '#005574',

  darkSurfaceBg: '#12140F',
  darkSurfaceCard: '#1C1F17',
  darkSurfaceCardAlt: '#22261F',
  darkSurfaceBorder: '#2E332A',
  darkSurfaceBorderAlt: '#343A31',

  hairlineOnWhite: '#EEEDEA',
  hairlineOnPaper: '#DDD9D0',

  mutedOnDark: '#9AA09A',
  mutedOnDarkAlt: '#8B918A',
  textOnDark: '#F5F4F0',
} as const;

export const fonts = {
  display: 'Outfit_400Regular',
  displayMedium: 'Outfit_500Medium',
  displaySemiBold: 'Outfit_600SemiBold',
  mono: 'IBMPlexMono_400Regular',
  monoMedium: 'IBMPlexMono_500Medium',
  monoSemiBold: 'IBMPlexMono_600SemiBold',
} as const;

export const radii = {
  phoneFrame: 38,
  sheet: 20,
  card: 14,
  button: 13,
  chip: 9,
  pill: 999,
} as const;

export const spacing = {
  xs: 7,
  sm: 9,
  smd: 10,
  md: 12,
  mdl: 14,
  lg: 16,
  xl: 20,
  xxl: 26,
} as const;
