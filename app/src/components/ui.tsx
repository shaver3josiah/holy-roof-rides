// CONTRACT (implemented by build agent): the Holey Lift UI kit for React
// Native — shared vocabulary consumed by every screen. Port the web kit in
// the design system faithfully to RN (flat cards, hairline borders, no
// shadows in-product, calm motion). Keep this props surface EXACTLY — screen
// agents build against it in parallel.
//
// Button: variants primary (slate fill), secondary (slate outline), danger
//   (terracotta fill), ghost (text only). Optional leading `icon` renders
//   left of the label (same ink as the label). Pressed = darken fill
//   (primaryPressed/accentPressed) or sunkenPressed wash + 1px translateY.
//   loading shows an ActivityIndicator in place of the label; disabled/loading
//   dampen to 0.55 opacity. Min height 48 (large touch targets).
// Banner: tinted surface + matching ink. notice=gold100/heading,
//   error=danger100/danger, success=success100/success, info=slate100/primary.
// EmptyState: centered, optional Lucide icon (muted), title (h2), reassuring
//   body copy. Never scolds — comfort over nag.
// Badge: tiny pill, gold100 bg, heading ink (WCAG contrast on gold100),
//   12/sansBold, letterSpacing 0.7, uppercase label (the DEACON badge).
// Chip: pill, sunken bg, hairline border, body text; pressed -> sunkenPressed.
// InviteCodeDisplay: the big ceremonial code — styles.code (Space Mono,
//   tracked), centered on a sunken rounded surface with a hairline border.
import React from 'react';
import { ActivityIndicator, Pressable, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { Info, TriangleAlert, CircleCheck, BellRing } from 'lucide-react-native';
import { colors, fonts, palette, radius, spacing, styles, type } from '../theme';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  icon?: React.ComponentType<{ size?: number; color?: string }>;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

const buttonFill: Record<'primary' | 'danger', { base: string; pressed: string }> = {
  primary: { base: colors.primary, pressed: colors.primaryPressed },
  danger: { base: colors.danger, pressed: '#9C3C28' },
};

export function Button({ label, onPress, variant = 'primary', icon: Icon, loading = false, disabled = false, style }: ButtonProps) {
  const isDisabled = disabled || loading;
  const ink = variant === 'primary' || variant === 'danger' ? palette.white : colors.primary;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        buttonBase,
        variant === 'primary' && { backgroundColor: pressed ? buttonFill.primary.pressed : buttonFill.primary.base },
        variant === 'danger' && { backgroundColor: pressed ? buttonFill.danger.pressed : buttonFill.danger.base },
        variant === 'secondary' && {
          backgroundColor: pressed ? colors.sunkenPressed : 'transparent',
          borderWidth: 1,
          borderColor: colors.primary,
        },
        variant === 'ghost' && {
          backgroundColor: pressed ? colors.sunkenPressed : 'transparent',
          paddingHorizontal: spacing.s,
        },
        pressed && !isDisabled ? { transform: [{ translateY: 1 }] } : null,
        isDisabled && { opacity: 0.55 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={ink} />
      ) : Icon ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
          <Icon size={18} color={ink} />
          <Text style={[buttonLabelBase, { color: ink }]}>{label}</Text>
        </View>
      ) : (
        <Text style={[buttonLabelBase, { color: ink }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const buttonBase: ViewStyle = {
  minHeight: 48,
  borderRadius: radius.s,
  alignItems: 'center',
  justifyContent: 'center',
  paddingHorizontal: spacing.l,
};

const buttonLabelBase: TextStyle = {
  fontFamily: fonts.sansSemiBold,
  fontSize: type.base,
};

export interface BannerProps {
  kind: 'notice' | 'error' | 'success' | 'info';
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

const bannerConfig: Record<BannerProps['kind'], { surface: string; ink: string; Icon: React.ComponentType<{ size?: number; color?: string }> }> = {
  notice: { surface: colors.noticeSurface, ink: colors.heading, Icon: BellRing },
  error: { surface: colors.dangerSurface, ink: colors.danger, Icon: TriangleAlert },
  success: { surface: colors.successSurface, ink: colors.success, Icon: CircleCheck },
  info: { surface: colors.slateSurface, ink: colors.primary, Icon: Info },
};

export function Banner({ kind, children, style }: BannerProps) {
  const { surface, ink, Icon } = bannerConfig[kind];
  return (
    <View style={[bannerBase, { backgroundColor: surface }, style]}>
      <Icon size={18} color={ink} />
      <View style={{ flex: 1 }}>
        {typeof children === 'string' ? <Text style={[styles.body, { color: ink }]}>{children}</Text> : children}
      </View>
    </View>
  );
}

const bannerBase: ViewStyle = {
  flexDirection: 'row',
  alignItems: 'flex-start',
  gap: spacing.s,
  borderRadius: radius.m,
  padding: spacing.m,
};

export interface EmptyStateProps {
  icon?: React.ComponentType<{ size?: number; color?: string }>;
  title: string;
  body?: string;
  style?: StyleProp<ViewStyle>;
}

export function EmptyState({ icon: Icon, title, body, style }: EmptyStateProps) {
  return (
    <View style={[emptyBase, style]}>
      {Icon ? <Icon size={28} color={colors.muted} /> : null}
      <Text style={styles.h2}>{title}</Text>
      {body ? <Text style={[styles.mutedText, { textAlign: 'center', maxWidth: 320 }]}>{body}</Text> : null}
    </View>
  );
}

const emptyBase: ViewStyle = {
  alignItems: 'center',
  paddingVertical: spacing.xl,
  paddingHorizontal: spacing.l,
  gap: spacing.xs,
};

export interface BadgeProps {
  label: string;
  style?: StyleProp<ViewStyle>;
}

export function Badge({ label, style }: BadgeProps) {
  return (
    <View style={[badgeBase, style]}>
      <Text style={badgeText}>{label}</Text>
    </View>
  );
}

const badgeBase: ViewStyle = {
  alignSelf: 'flex-start',
  backgroundColor: colors.noticeSurface,
  borderRadius: radius.pill,
  paddingHorizontal: 10,
  paddingVertical: 3,
};

const badgeText: TextStyle = {
  fontFamily: fonts.sansBold,
  fontSize: type.xs,
  letterSpacing: 0.7,
  textTransform: 'uppercase',
  color: colors.heading,
};

export interface ChipProps {
  label: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

export function Chip({ label, onPress, style, textStyle }: ChipProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [chipBase, { backgroundColor: pressed ? colors.sunkenPressed : colors.sunken }, style]}
    >
      <Text style={[styles.body, textStyle]}>{label}</Text>
    </Pressable>
  );
}

const chipBase: ViewStyle = {
  flexDirection: 'row',
  alignItems: 'center',
  alignSelf: 'flex-start',
  borderRadius: radius.pill,
  borderWidth: 1,
  borderColor: colors.border,
  paddingHorizontal: spacing.m,
  paddingVertical: 10,
};

export interface InviteCodeDisplayProps {
  code: string;
  style?: StyleProp<ViewStyle>;
}

export function InviteCodeDisplay({ code, style }: InviteCodeDisplayProps) {
  return (
    <View style={[inviteBase, style]}>
      <Text style={styles.code}>{code}</Text>
    </View>
  );
}

const inviteBase: ViewStyle = {
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: colors.sunken,
  borderRadius: radius.m,
  borderWidth: 1,
  borderColor: colors.border,
  paddingVertical: spacing.l,
  paddingHorizontal: spacing.m,
};
