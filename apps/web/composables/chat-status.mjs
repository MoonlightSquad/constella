/**
 * Статус вихідного повідомлення для галочок у бульбашці.
 *
 * Чужі повідомлення статусу не мають — повертаємо `null`, щоб шаблон не ліпив
 * галочку туди, де її бути не може. `pending` — локальна мітка: рядок ще не
 * отримав відповіді сервера, тому `deliveredAt`/`readAt` у нього завідомо null.
 */
export function messageTickOf(message, userId) {
  if (!message || message.senderId !== userId) return null;
  if (message.pending) return 'pending';
  if (message.readAt) return 'read';
  if (message.deliveredAt) return 'delivered';
  return 'sent';
}

export const TICK_GLYPH = { pending: '◷', sent: '✓', delivered: '✓✓', read: '✓✓' };

export const TICK_LABEL_KEY = {
  pending: 'dashboard.messagePending',
  sent: 'dashboard.messageSent',
  delivered: 'dashboard.messageDelivered',
  read: 'dashboard.messageRead',
};
