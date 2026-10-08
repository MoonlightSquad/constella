export const INTEREST_TAGS = [
  'sport',
  'it',
  'music',
  'cinema',
  'travel',
  'art',
  'food',
  'books',
  'games',
  'yoga',
  'photography',
  'startups',
] as const;

export const ACHIEVEMENTS = [
  { code: 'first-light', title: 'Complete profile', description: 'Finish onboarding and add photos.', xp: 50, icon: '🎯' },
  { code: 'profile-100', title: 'Filled 100%', description: 'Complete profile with 6 photos.', xp: 80, icon: '🎯' },
  { code: 'first-hello', title: 'First Hello', description: 'Send your first message after a match.', xp: 20, icon: '💬' },
  { code: 'dialog-master', title: 'Dialogue master', description: 'Start 10 chats with 10+ messages each.', xp: 150, icon: '💬' },
  { code: 'good-conversation', title: 'Good conversation', description: 'Exchange at least five messages each.', xp: 100, icon: '💬' },
  { code: 'owl', title: 'Night owl', description: 'Be active after 23:00.', xp: 40, icon: '⚡' },
  { code: 'early-bird', title: 'Early bird', description: 'Be active before 07:00.', xp: 40, icon: '⚡' },
  { code: 'magnet-50', title: 'Magnet', description: 'Receive 50 likes.', xp: 80, icon: '💖' },
  { code: 'magnet-100', title: 'Bright magnet', description: 'Receive 100 likes.', xp: 120, icon: '💖' },
  { code: 'magnet-500', title: 'Star magnet', description: 'Receive 500 likes.', xp: 250, icon: '💖' },
  { code: 'star-patron', title: 'Star patron', description: 'Spend Telegram Stars in Constella.', xp: 100, icon: '🌟' },
  { code: 'streak-7', title: 'Week of fire', description: 'Keep a 7-day streak.', xp: 70, icon: '🔥' },
] as const;

export const DAILY_QUESTS = [
  { code: 'swipe-20', title: '20 swipes today', description: 'Swipe 20 profiles today.', target: 20, xp: 30 },
  { code: 'superlike-1', title: 'Send a Superlike', description: 'Send 1 Superlike for Stars.', target: 1, xp: 40 },
  { code: 'invite-friend', title: 'Invite a friend', description: 'Share your referral link.', target: 1, xp: 50 },
] as const;

export const STREAK_REWARDS: Record<number, { superlikes?: number; freezes?: number; vipHours?: number }> = {
  3: { superlikes: 1 },
  7: { superlikes: 2, freezes: 1 },
  14: { vipHours: 24 },
  30: { vipHours: 72, superlikes: 3 },
};

export const getZodiac = (birthdate: Date) => {
  const day = birthdate.getUTCDate();
  const month = birthdate.getUTCMonth() + 1;
  const signs: [number, number, string][] = [
    [1, 20, 'Capricorn'],
    [2, 19, 'Aquarius'],
    [3, 20, 'Pisces'],
    [4, 20, 'Aries'],
    [5, 21, 'Taurus'],
    [6, 21, 'Gemini'],
    [7, 22, 'Cancer'],
    [8, 23, 'Leo'],
    [9, 23, 'Virgo'],
    [10, 23, 'Libra'],
    [11, 22, 'Scorpio'],
    [12, 21, 'Sagittarius'],
    [12, 32, 'Capricorn'],
  ];
  return signs.find(([m, d]) => month < m || (month === m && day <= d))?.[2] ?? 'Capricorn';
};
