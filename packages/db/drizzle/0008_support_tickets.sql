CREATE TABLE support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject text NOT NULL CHECK (char_length(subject) BETWEEN 5 AND 120),
  category text NOT NULL DEFAULT 'general' CHECK (category IN ('general','account','billing','safety','technical')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','waiting_user','resolved','closed')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal','high')),
  assigned_to_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);
CREATE INDEX support_tickets_user_updated_idx ON support_tickets(user_id, updated_at DESC);
CREATE INDEX support_tickets_status_updated_idx ON support_tickets(status, updated_at DESC);
CREATE TABLE support_messages (
  id bigserial PRIMARY KEY,
  ticket_id uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  author_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  author_role text NOT NULL CHECK (author_role IN ('user','support')),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 5000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX support_messages_ticket_created_idx ON support_messages(ticket_id, created_at);
