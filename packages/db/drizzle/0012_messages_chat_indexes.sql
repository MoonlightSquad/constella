-- Індекси під/chat-шлях: історія матчу (`chatMessages`, курсор `afterId`), ack-оновлення
-- статусів і ліміт 12/хв — досі на `messages` не було жодного індексу, тож кожне
-- надсилання робило два seq scan по всій історії. Пишеться вручну (0005+ стиль):
-- `db:generate` ламає історію, бо снапшоти `meta/` зупинилися на 0004.
CREATE INDEX IF NOT EXISTS messages_match_id_created_at_idx ON messages (match_id, created_at DESC);
CREATE INDEX IF NOT EXISTS messages_match_id_id_idx ON messages (match_id, id);
CREATE INDEX IF NOT EXISTS messages_sender_id_created_at_idx ON messages (sender_id, created_at DESC);
