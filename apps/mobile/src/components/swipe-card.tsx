import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, PanResponder, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';

import { useReducedMotion } from '@/utils/motion';
import { colors, radius } from '@/theme/tokens';

export type SwipeKind = 'spark' | 'pass' | 'super';

const THRESHOLD = 100;
const FLIGHT = 640;
const FLIGHT_MS = 190;

const directionOf = (x: number, y: number): SwipeKind | null => {
  if (Math.abs(x) <= THRESHOLD || Math.abs(y) > Math.abs(x)) return null;
  return x > 0 ? 'spark' : 'pass';
};

/** Вібрація — приємна деталь, а не умова: на пристроях без моторчика просто мовчки пропускаємо. */
const tapFeedback = () => {
  void Haptics.selectionAsync().catch(() => undefined);
};

/**
 * Той самий горизонтальний жест, що в `ConstellaDashboard.vue:263-278` (вправо —
 * іскра, вліво — пропуск). Вертикальний свайп «вгору = суперлайк» тут свідомо
 * прибраний: пан-респондер захопив би жест у ScrollView з біографії, а суперлайк
 * має свою кнопку. Реалізовано на core `Animated`, бо reanimated вимагав би
 * власного babel-плагіна ради одного жесту.
 */
export function SwipeCard({
  resetKey,
  onSwipe,
  disabled,
  children,
}: {
  resetKey: string;
  onSwipe: (kind: SwipeKind) => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  const position = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const handler = useRef(onSwipe);
  const blocked = useRef(Boolean(disabled));
  const calm = useRef(false);
  const reducedMotion = useReducedMotion();
  handler.current = onSwipe;
  blocked.current = Boolean(disabled);
  calm.current = reducedMotion;

  useEffect(() => {
    position.setValue({ x: 0, y: 0 });
  }, [resetKey, position]);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !blocked.current,
      onMoveShouldSetPanResponder: (_event, gesture) =>
        !blocked.current && Math.abs(gesture.dx) > 12 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        position.stopAnimation();
      },
      onPanResponderMove: (_event, gesture) => {
        position.setValue({ x: gesture.dx, y: gesture.dy });
      },
      onPanResponderRelease: (_event, gesture) => {
        const kind = directionOf(gesture.dx, gesture.dy);
        if (!kind) {
          if (calm.current) {
            position.setValue({ x: 0, y: 0 });
            return;
          }
          Animated.spring(position, { toValue: { x: 0, y: 0 }, useNativeDriver: true, friction: 4 }).start();
          return;
        }
        tapFeedback();
        const offset = { x: kind === 'spark' ? FLIGHT : -FLIGHT, y: gesture.dy };
        Animated.timing(position, {
          toValue: offset,
          duration: calm.current ? 0 : FLIGHT_MS,
          useNativeDriver: true,
        }).start(() => {
          position.setValue({ x: 0, y: 0 });
          handler.current(kind);
        });
      },
    }),
  ).current;

  const sparkOpacity = position.x.interpolate({ inputRange: [0, THRESHOLD], outputRange: [0, 1], extrapolate: 'clamp' });
  const passOpacity = position.x.interpolate({ inputRange: [-THRESHOLD, 0], outputRange: [1, 0], extrapolate: 'clamp' });

  return (
    <Animated.View
      {...pan.panHandlers}
      style={[
        styles.card,
        {
          transform: [
            { translateX: position.x },
            { translateY: position.y },
            { rotate: position.x.interpolate({ inputRange: [-300, 300], outputRange: ['-13deg', '13deg'] }) },
          ],
        },
      ]}
    >
      {children}
      <View style={styles.hints} pointerEvents="none">
        <Animated.Text style={[styles.hint, styles.hintSpark, { opacity: sparkOpacity }]}>✦</Animated.Text>
        <Animated.Text style={[styles.hint, styles.hintPass, { opacity: passOpacity }]}>×</Animated.Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  hints: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' },
  hint: { position: 'absolute', fontSize: 44, fontWeight: '700' },
  hintSpark: { top: 26, right: 26, color: colors.gold },
  hintPass: { top: 26, left: 26, color: colors.dangerSoft },
});
