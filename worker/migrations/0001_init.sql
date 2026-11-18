-- Better Auth's tables (its default SQLite schema), then the app's own.
CREATE TABLE IF NOT EXISTS user (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, emailVerified INTEGER NOT NULL,
  image TEXT, createdAt DATE NOT NULL, updatedAt DATE NOT NULL
);
CREATE TABLE IF NOT EXISTS session (
  id TEXT PRIMARY KEY, expiresAt DATE NOT NULL, token TEXT NOT NULL UNIQUE, createdAt DATE NOT NULL, updatedAt DATE NOT NULL,
  ipAddress TEXT, userAgent TEXT, userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS account (
  id TEXT PRIMARY KEY, accountId TEXT NOT NULL, providerId TEXT NOT NULL, userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  accessToken TEXT, refreshToken TEXT, idToken TEXT, accessTokenExpiresAt DATE, refreshTokenExpiresAt DATE,
  scope TEXT, password TEXT, createdAt DATE NOT NULL, updatedAt DATE NOT NULL
);
CREATE TABLE IF NOT EXISTS verification (
  id TEXT PRIMARY KEY, identifier TEXT NOT NULL, value TEXT NOT NULL, expiresAt DATE NOT NULL, createdAt DATE, updatedAt DATE
);
CREATE INDEX IF NOT EXISTS session_user ON session(userId);
CREATE INDEX IF NOT EXISTS account_user ON account(userId);
CREATE INDEX IF NOT EXISTS verification_identifier ON verification(identifier);

-- Everything a user syncs: kind 'projects' (one row per project) or 'data' (custom materials, library, favourites).
-- A deleted item stays as a tombstone (empty body, deleted = 1) so other devices learn of it.
CREATE TABLE IF NOT EXISTS items (
  user_id TEXT NOT NULL, kind TEXT NOT NULL, id TEXT NOT NULL, body TEXT NOT NULL, rev INTEGER NOT NULL, updated INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, kind, id)
);
