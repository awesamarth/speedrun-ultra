-- Gzipped, base64 index snapshot split into chunks (D1 statements are capped ~100KB).
-- Loaded in a single query by the worker; meta.index_key points at the live snapshot.
CREATE TABLE IF NOT EXISTS blobs (
  key TEXT NOT NULL,
  part INTEGER NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (key, part)
);
