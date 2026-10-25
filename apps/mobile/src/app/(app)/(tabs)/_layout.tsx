import { Text } from 'react-native';
import { Tabs } from 'expo-router/js-tabs';

import { useLocale } from '@/i18n/locale-provider';
import { useDashboard } from '@/state/dashboard';
import { colors, radius, typography } from '@/theme/tokens';

const GLYPHS = { orbit: '✦', sparks: '♡', chats: '◌', quests: '☆', sky: '☾' } as const;

/** Символи вкладок — той самий набір, що в `ConstellaDashboard.vue:106-112`. */
function glyph(symbol: string) {
  return ({ focused, size }: { focused: boolean; size: number }) => (
    <Text style={{ color: focused ? colors.gold : colors.muted, fontSize: size + 6, lineHeight: size + 12 }}>
      {symbol}
    </Text>
  );
}

export default function TabsLayout() {
  const { t } = useLocale();
  const { sparks, unread } = useDashboard();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.bg },
        tabBarActiveTintColor: colors.gold,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { ...typography.caption, fontSize: 11, fontWeight: '600' },
        tabBarStyle: {
          backgroundColor: colors.bgDeep,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 62,
        },
        tabBarItemStyle: { borderRadius: radius.sm },
        tabBarBadgeStyle: { backgroundColor: colors.gold, color: colors.bgDeep, fontSize: 11 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: t('dashboard.orbit'), tabBarIcon: glyph(GLYPHS.orbit) }}
      />
      <Tabs.Screen
        name="sparks"
        options={{
          title: t('dashboard.sparks'),
          tabBarIcon: glyph(GLYPHS.sparks),
          tabBarBadge: sparks > 0 ? sparks : undefined,
        }}
      />
      <Tabs.Screen
        name="chats"
        options={{
          title: t('dashboard.chats'),
          tabBarIcon: glyph(GLYPHS.chats),
          tabBarBadge: unread > 0 ? unread : undefined,
        }}
      />
      <Tabs.Screen name="quests" options={{ title: t('dashboard.quests'), tabBarIcon: glyph(GLYPHS.quests) }} />
      <Tabs.Screen name="sky" options={{ title: t('dashboard.sky'), tabBarIcon: glyph(GLYPHS.sky) }} />
    </Tabs>
  );
}
