CREATE TABLE preview_accounts (
  username TEXT PRIMARY KEY,
  salt TEXT NOT NULL,
  password_hash TEXT NOT NULL
);

CREATE TABLE preview_sessions (
  token_hash TEXT PRIMARY KEY,
  username TEXT NOT NULL REFERENCES preview_accounts(username) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

CREATE INDEX preview_sessions_expiry ON preview_sessions(expires_at);

CREATE TABLE preview_auth_attempts (
  scope TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL,
  count INTEGER NOT NULL
);
