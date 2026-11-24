-- Terms acceptance and the optional product-updates email opt-in, one row per user. No row: nothing syncs until they accept.
CREATE TABLE IF NOT EXISTS consent (
  user_id TEXT PRIMARY KEY, terms_at INTEGER NOT NULL, updates INTEGER NOT NULL DEFAULT 0, updates_at INTEGER
);
