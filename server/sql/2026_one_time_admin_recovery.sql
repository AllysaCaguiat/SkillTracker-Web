-- Run ONCE in your existing Neon neondb production database. Does not change users or passwords.
CREATE TABLE IF NOT EXISTS admin_recovery_guard (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  used_at TIMESTAMPTZ
);
INSERT INTO admin_recovery_guard(id,used_at) VALUES(1,NULL) ON CONFLICT(id) DO NOTHING;
