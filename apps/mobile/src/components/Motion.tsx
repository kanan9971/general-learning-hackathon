import * as Haptics from 'expo-haptics';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
  type WithSpringConfig,
  type WithTimingConfig,
} from 'react-native-reanimated';
import {
  Platform,
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

/**
 * Physical motion personality — three curves only, used everywhere:
 *  snappy  = things arriving (reveals, releases, pops)
 *  smooth  = things moving from A to B (progress, sliding pills)
 *  snap    = instant tactile feedback (press-in, hover)
 */
export const Motion = {
  snappy: { stiffness: 400, damping: 30, mass: 1 } satisfies WithSpringConfig,
  smooth: { stiffness: 200, damping: 24, mass: 1 } satisfies WithSpringConfig,
  snap: { duration: 160, easing: Easing.bezier(0.22, 1, 0.36, 1) } satisfies WithTimingConfig,
} as const;

export const STAGGER_MS = 70;
export const MAX_STAGGER = 5;

export type HapticKind = 'none' | 'selection' | 'light' | 'medium' | 'success' | 'error';

/** Fire-and-forget haptic. No-op on web and when the platform has no engine. */
export function haptic(kind: HapticKind) {
  if (Platform.OS === 'web' || kind === 'none') return;
  const run =
    kind === 'selection'
      ? Haptics.selectionAsync()
      : kind === 'light'
        ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
        : kind === 'medium'
          ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
          : kind === 'success'
            ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
            : Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  run.catch(() => null);
}

const ReanimatedPressable = Animated.createAnimatedComponent(Pressable);

export type PressState = { pressed: boolean; hovered: boolean };

export type AnimatedPressableProps = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle> | ((state: PressState) => StyleProp<ViewStyle>);
  /** Haptic on press-in (native only). Default none; buttons and selectors opt in. */
  haptic?: HapticKind;
  /** Scale while pressed. 0.97 for buttons/cards, closer to 1 for wide rows. */
  pressScale?: number;
  /** Pixels to lift on hover (web only). Cards use 2, buttons 1. */
  lift?: number;
};

/**
 * Universal press physics: compress on press-in (snap), spring back on release, lift on hover.
 * Never changes handler logic — it only wraps `Pressable` and forwards every event.
 */
export function AnimatedPressable({
  children,
  style,
  onPressIn,
  onPressOut,
  onHoverIn,
  onHoverOut,
  disabled,
  haptic: hapticKind = 'none',
  pressScale = 0.97,
  lift = 0,
  ...rest
}: AnimatedPressableProps) {
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);
  const y = useSharedValue(0);
  const [pressed, setPressed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value }, { scale: scale.value }],
  }));

  // Reanimated drops function styles. Resolve Pressable's state callback first.
  const resolved = typeof style === 'function' ? style({ pressed, hovered }) : style;

  return (
    <ReanimatedPressable
      {...rest}
      disabled={disabled}
      onHoverIn={(e) => {
        setHovered(true);
        if (!reduced && !disabled && lift) y.set(withSpring(-lift, Motion.snappy));
        onHoverIn?.(e);
      }}
      onHoverOut={(e) => {
        setHovered(false);
        if (!reduced) y.set(withSpring(0, Motion.snappy));
        onHoverOut?.(e);
      }}
      onPressIn={(e) => {
        setPressed(true);
        if (!disabled) {
          haptic(hapticKind);
          if (!reduced) scale.set(withTiming(pressScale, Motion.snap));
        }
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        setPressed(false);
        if (!reduced) scale.set(withSpring(1, Motion.snappy));
        onPressOut?.(e);
      }}
      style={[resolved, animatedStyle]}
    >
      {children}
    </ReanimatedPressable>
  );
}

/** Staggered fade-up entry. Caps individual delays at 6 items. */
export function Reveal({
  index = 0,
  children,
  style,
}: {
  index?: number;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const reduced = useReducedMotion();
  const delay = Math.min(Math.max(index, 0), MAX_STAGGER) * STAGGER_MS;
  const entering = reduced
    ? FadeIn.duration(160)
    : FadeInDown.duration(550)
        .springify()
        .damping(Motion.snappy.damping)
        .stiffness(Motion.snappy.stiffness)
        .mass(Motion.snappy.mass)
        .delay(delay);

  return (
    <Animated.View entering={entering} style={style}>
      {children}
    </Animated.View>
  );
}

/**
 * A short "pop" (1 → 1.04 → 1) the moment something becomes selected, so the choice registers
 * physically. Returns an animated style to put on a wrapping `Animated.View`. Silent on first render.
 */
export function useSelectionPop(selected: boolean) {
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (selected && !reduced) {
      scale.set(withSequence(withTiming(1.04, Motion.snap), withSpring(1, Motion.snappy)));
    }
  }, [reduced, scale, selected]);
  return useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
}

/** Opacity 0 → 1 while `on` (e.g. a press overlay). Snap in, spring out. */
export function useFade(on: boolean, to = 1) {
  const reduced = useReducedMotion();
  const v = useSharedValue(0);
  useEffect(() => {
    v.set(reduced ? (on ? to : 0) : on ? withTiming(to, Motion.snap) : withSpring(0, Motion.snappy));
  }, [on, reduced, to, v]);
  return useAnimatedStyle(() => ({ opacity: v.value }));
}
