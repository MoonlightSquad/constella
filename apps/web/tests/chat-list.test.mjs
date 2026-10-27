import assert from 'node:assert/strict';
import test from 'node:test';
import { chatStampOf, initialsOf, WEEKDAY_KEYS } from '../composables/chat-list.mjs';

// Понеділок 26.10.2026, локальний час — щоб «сьогодні/вчора» не залежали від поясу CI.
const now = new Date(2026, 9, 26, 14, 32);
const local = (month, day, hour = 9, minute = 0) => new Date(2026, month, day, hour, minute);
const stamp = (at) => chatStampOf({ at, now });

test('today shows the clock, whatever time of day it is', () => {
  assert.deepEqual(stamp(local(9, 26, 0, 1)), { kind: 'time' });
  assert.deepEqual(stamp(local(9, 26, 23, 59)), { kind: 'time' });
  // Глянець із майбутнім часовим поясом не повинен вивести «вчора».
  assert.deepEqual(chatStampOf({ at: new Date(2026, 9, 27, 3, 0), now }), { kind: 'time' });
});

test('yesterday is a calendar day, not 24 elapsed hours', () => {
  // Між 23:59 п’ятниці та 00:05 суботи — сім хвилин, але різні доби.
  const late = new Date(2026, 9, 25, 23, 59);
  const justAfterMidnight = new Date(2026, 9, 26, 0, 5);
  assert.deepEqual(
    chatStampOf({ at: late, now: justAfterMidnight }),
    { kind: 'label', key: 'chats.stampYesterday' },
  );
  assert.deepEqual(stamp(local(9, 25, 20, 0)), { kind: 'label', key: 'chats.stampYesterday' });
});

test('the week before today is named by weekday', () => {
  assert.deepEqual(stamp(local(9, 24)), { kind: 'label', key: 'chats.weekdaySat' });
  assert.deepEqual(stamp(local(9, 22)), { kind: 'label', key: 'chats.weekdayThu' });
  // Шостого дня ще день тижня (20.10 — вівторок), сьомого — вже дата.
  assert.deepEqual(stamp(local(9, 20)), { kind: 'label', key: 'chats.weekdayTue' });
  assert.deepEqual(stamp(local(9, 19)), { kind: 'date', text: '19.10' });
});

test('older chats fall back to the date, with the year only across a new year', () => {
  assert.deepEqual(stamp(local(8, 3)), { kind: 'date', text: '03.09' });
  assert.deepEqual(
    chatStampOf({ at: new Date(2025, 9, 18, 12, 0), now }),
    { kind: 'date', text: '18.10.2025' },
  );
});

test('a missing or broken date yields no stamp', () => {
  for (const value of [null, undefined, '', 'not a date', Number.NaN]) {
    assert.equal(chatStampOf({ at: value, now }), null, String(value));
  }
});

test('weekday keys cover all seven days and start on Sunday', () => {
  assert.equal(WEEKDAY_KEYS.length, 7);
  // 25.10.2026 — неділя: `getDay()` 0 повинен вказувати саме на сонячний ключ.
  assert.equal(new Date(2026, 9, 25).getDay(), 0);
  assert.equal(WEEKDAY_KEYS[new Date(2026, 9, 25).getDay()], 'chats.weekdaySun');
  assert.equal(WEEKDAY_KEYS[new Date(2026, 9, 26).getDay()], 'chats.weekdayMon');
});

test('initials take the first letter of the first two words', () => {
  assert.equal(initialsOf('Іван Петренко'), 'ІП');
  assert.equal(initialsOf('marco silva'), 'MS');
  assert.equal(initialsOf('Ann-Marie Smith'), 'AS');
  assert.equal(initialsOf('  оля   петренко  ще й дещо '), 'ОП');
});

test('one word is one letter, nothing is nothing', () => {
  assert.equal(initialsOf('Оля'), 'О');
  assert.equal(initialsOf(''), '');
  assert.equal(initialsOf('   '), '');
  assert.equal(initialsOf(null), '');
  assert.equal(initialsOf(undefined), '');
});
