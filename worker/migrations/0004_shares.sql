-- Read-only snapshots shared by link. The id is the link's secret (a random UUID); the body is already stripped of the customer's details by the app.
CREATE TABLE IF NOT EXISTS shares (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, project_id TEXT NOT NULL, name TEXT NOT NULL, body TEXT NOT NULL, created INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS shares_user ON shares(user_id, project_id);
