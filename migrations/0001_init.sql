-- One row per open role. `x` holds the final extraction (fields + evidence) as JSON.
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  company TEXT NOT NULL,
  company_slug TEXT,
  url TEXT NOT NULL,
  location TEXT,
  workplace TEXT,            -- remote | hybrid | onsite | NULL (from labels.workplace, else workplace_type)
  remote INTEGER NOT NULL,   -- API remote flag
  function TEXT,             -- labels.function, else function
  specialty TEXT,
  seniority TEXT,
  min_exp_label TEXT,        -- labels.min_experience as published
  employment_type TEXT,
  published_at TEXT,
  comp_summary TEXT,
  tier TEXT,
  -- denormalised extraction columns (for stats + SQL prefilter)
  geo_mode TEXT,             -- onsite | restricted | anywhere | NULL
  geo_allowed TEXT,          -- JSON array of codes
  geo_conflict INTEGER NOT NULL DEFAULT 0,
  visa TEXT,                 -- yes | no | NULL
  auth_kind TEXT,            -- citizen | clearance | us_person | work_authorization | NULL
  min_years INTEGER,
  x TEXT NOT NULL,           -- JSON Final extraction
  health TEXT NOT NULL DEFAULT '[]', -- JSON array of data-health flags
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS jobs_function ON jobs(function);
CREATE INDEX IF NOT EXISTS jobs_published ON jobs(published_at);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
