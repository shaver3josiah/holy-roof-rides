// Holey Lift design tokens — the "stained glass" system.
// Derived from the Holey Lift Design System (docs/DESIGN.md). Anchor values
// predate the system (they were this app's original palette); ramps and
// semantic roles come from the DS. Keep anchors verbatim — never round them.
import { StyleSheet } from 'react-native';

// --- Color ramps ---
export const palette = {
  slate900: '#1F2A44', // anchor — headings, strongest ink
  slate800: '#263250', // pressed primary
  slate700: '#2E3A59', // anchor — primary buttons, links, active
  slate600: '#3C496B',
  slate400: '#7F8AA6', // disabled slate
  slate200: '#C7CDDB',
  slate100: '#E7EAF1', // tinted slate surface
  gold600: '#C08D2E', // pressed accent
  gold500: '#D9A441', // anchor — accent, DEACON badge, driver car
  gold400: '#E4BA6B',
  gold200: '#F1D9A6',
  gold100: '#FCEFD8', // notice surface
  white: '#FFFFFF',
  warm50: '#FAF7F2', // anchor — page bg
  warm100: '#F3EEE5', // pressed sunken surface
  warm200: '#E5E0D8', // anchor — hairline border
  warm300: '#D3CCC0', // strong border
  ink900: '#232323', // anchor — body text
  // Darkened from the original #6B7280 anchor: that value sat at 4.52:1 on
  // warm50 — technically AA, zero margin. This buys real headroom at 13-14px.
  ink500: '#5B6472', // muted text
  danger600: '#B3462E', // anchor
  danger100: '#FBEAE5', // error surface
  success600: '#3E7C4F', // anchor
  success100: '#E7F3EA', // success surface
};

// Semantic colors. Superset of the pre-DS keys — old screen code keeps compiling.
export const colors = {
  primary: palette.slate700,
  primaryDark: palette.slate900,
  primaryPressed: palette.slate800,
  accent: palette.gold500,
  accentPressed: palette.gold600,
  bg: palette.warm50,
  card: palette.white,
  sunken: palette.warm50,
  sunkenPressed: palette.warm100,
  text: palette.ink900,
  heading: palette.slate900,
  muted: palette.ink500,
  border: palette.warm200,
  borderStrong: palette.warm300,
  danger: palette.danger600,
  dangerSurface: palette.danger100,
  success: palette.success600,
  successSurface: palette.success100,
  noticeSurface: palette.gold100,
  slateSurface: palette.slate100,
  slateDisabled: palette.slate400,
  scrim: 'rgba(0, 0, 0, 0.4)',
};

// --- Type ---
// IMPORTANT: each entry is a specific loaded face (see App.tsx useFonts).
// NEVER pair these with a `fontWeight` style — Android silently drops the
// custom face and falls back to the system font.
export const fonts = {
  display: 'BricolageGrotesque_700Bold',
  displayHeavy: 'BricolageGrotesque_800ExtraBold',
  sans: 'PlusJakartaSans_400Regular',
  sansMedium: 'PlusJakartaSans_500Medium',
  sansSemiBold: 'PlusJakartaSans_600SemiBold',
  sansBold: 'PlusJakartaSans_700Bold',
  mono: 'SpaceMono_700Bold',
};

export const type = {
  xs: 12, // badges
  s: 13, // helper
  sm: 14, // muted/secondary
  base: 16, // body, inputs, buttons
  lg: 19, // h2
  xl: 22,
  xxl: 26, // h1
  xxxl: 32, // invite code hero
};

export const spacing = { xs: 4, s: 8, m: 16, l: 24, xl: 32, xxl: 48 };
export const radius = { xs: 4, s: 8, m: 12, l: 20, pill: 999 };

// Calm and rare: press feedback, gentle settles, one signature "breath" pulse.
export const motion = {
  fast: 120,
  base: 200,
  slow: 300,
  /** Waiting-card breath: opacity 1 -> 0.4 -> 1, `pulse` ms each direction. */
  pulse: 900,
};

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  h1: {
    fontFamily: fonts.display,
    fontSize: type.xxl,
    lineHeight: Math.round(type.xxl * 1.15),
    letterSpacing: -0.3,
    color: colors.heading,
  },
  h2: {
    fontFamily: fonts.sansSemiBold,
    fontSize: type.lg,
    lineHeight: Math.round(type.lg * 1.3),
    color: colors.heading,
  },
  body: {
    fontFamily: fonts.sans,
    fontSize: type.base,
    lineHeight: Math.round(type.base * 1.5),
    color: colors.text,
  },
  mutedText: {
    fontFamily: fonts.sans,
    fontSize: type.sm,
    lineHeight: Math.round(type.sm * 1.5),
    color: colors.muted,
  },
  helperText: {
    fontFamily: fonts.sans,
    fontSize: type.s,
    color: colors.muted,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.m,
    padding: spacing.m,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.s,
    paddingHorizontal: spacing.m,
    paddingVertical: 12,
    fontFamily: fonts.sans,
    fontSize: type.base,
    color: colors.text,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.s,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonText: { color: palette.white, fontFamily: fonts.sansSemiBold, fontSize: type.base },
  buttonSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.s,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonSecondaryText: { color: colors.primary, fontFamily: fonts.sansSemiBold, fontSize: type.base },
  /** Invite codes / PINs / server URLs — always the mono face, tracked wide. */
  code: {
    fontFamily: fonts.mono,
    fontSize: type.xxxl,
    letterSpacing: 3.8,
    color: colors.heading,
  },
});
