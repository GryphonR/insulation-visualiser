-- Admins added from the admin page, by email so someone can be added before they sign up.
-- Owners are the ADMIN_EMAILS secret, not rows here, so nobody can remove them from the page.
CREATE TABLE IF NOT EXISTS admins (
  email TEXT PRIMARY KEY, added_by TEXT NOT NULL, added_at INTEGER NOT NULL
);
