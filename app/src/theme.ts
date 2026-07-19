import { StyleSheet } from 'react-native';

// Stained-glass-inspired palette: deep slate blue + warm gold on warm white.
export const colors = {
  primary: '#2E3A59',
  primaryDark: '#1F2A44',
  accent: '#D9A441',
  bg: '#FAF7F2',
  card: '#FFFFFF',
  text: '#232323',
  muted: '#6B7280',
  border: '#E5E0D8',
  danger: '#B3462E',
  success: '#3E7C4F',
};

export const spacing = { xs: 4, s: 8, m: 16, l: 24, xl: 32 };
export const radius = { s: 8, m: 12, l: 20 };

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  h1: { fontSize: 26, fontWeight: '700', color: colors.primaryDark },
  h2: { fontSize: 19, fontWeight: '600', color: colors.primaryDark },
  body: { fontSize: 16, color: colors.text },
  mutedText: { fontSize: 14, color: colors.muted },
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
    fontSize: 16,
    color: colors.text,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.s,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  buttonSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.s,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonSecondaryText: { color: colors.primary, fontSize: 16, fontWeight: '600' },
});
