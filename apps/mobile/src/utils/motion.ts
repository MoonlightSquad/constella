import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Системне «зменшити рух» — єдине джерело для анімацій жестів. iOS і Android
 * повідомляють його різними API, тому власна обгортка, а не `useSyncExternalStore`.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let mounted = true;
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (mounted) setReduced(value);
    });
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return reduced;
}
