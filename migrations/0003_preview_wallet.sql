ALTER TABLE preview_accounts ADD COLUMN balance_cents INTEGER NOT NULL DEFAULT 0
  CHECK (balance_cents BETWEEN 0 AND 99999999);

CREATE TABLE preview_wallet_movements (
  code TEXT PRIMARY KEY,
  username TEXT NOT NULL REFERENCES preview_accounts(username),
  kind TEXT NOT NULL CHECK (kind IN ('credit', 'purchase')),
  cents INTEGER NOT NULL CHECK (cents BETWEEN 1 AND 9999999),
  product_id INTEGER,
  uid TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    (kind = 'credit' AND product_id IS NULL AND uid IS NULL) OR
    (kind = 'purchase' AND product_id IS NOT NULL AND uid IS NOT NULL)
  )
);

CREATE INDEX preview_wallet_movements_user ON preview_wallet_movements(username, created_at);

CREATE TRIGGER preview_wallet_apply AFTER INSERT ON preview_wallet_movements
BEGIN
  UPDATE preview_accounts
  SET balance_cents = balance_cents + CASE NEW.kind WHEN 'credit' THEN NEW.cents ELSE -NEW.cents END
  WHERE username = NEW.username;
END;

CREATE TABLE preview_wallet_prices (
  product_id INTEGER PRIMARY KEY,
  cents INTEGER NOT NULL CHECK (cents BETWEEN 1 AND 9999999)
);
