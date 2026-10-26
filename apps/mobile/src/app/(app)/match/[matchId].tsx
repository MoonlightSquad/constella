import { Redirect, useLocalSearchParams } from 'expo-router';

/**
 * Deep link `constella://match/<id>` (P6: тап по пушу). Окремий маршрут-переадресатор,
 * щоб пуш-навігація не залежала від внутрішньої структури табу чатів.
 */
export default function MatchDeepLinkRoute() {
  const params = useLocalSearchParams<{ matchId?: string }>();
  if (!params.matchId) return <Redirect href="/chats" />;
  return <Redirect href={`/chat/${params.matchId}`} />;
}
