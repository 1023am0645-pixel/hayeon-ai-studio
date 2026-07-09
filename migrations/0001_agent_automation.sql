-- HA:YEON AI STUDIO AI Agent automation storage
-- Apply after creating a Cloudflare D1 database and binding it as AGENT_DB.

CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY,
  goal TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  source TEXT NOT NULL DEFAULT 'manual',
  summary TEXT,
  summary_error TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TEXT,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_status_created
ON agent_runs (status, created_at DESC);

CREATE TABLE IF NOT EXISTS agent_run_items (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  employee_name TEXT,
  role TEXT,
  subtask TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  needs_review INTEGER NOT NULL DEFAULT 0,
  result_text TEXT,
  error_text TEXT,
  review_note TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TEXT,
  completed_at TEXT,
  FOREIGN KEY (run_id) REFERENCES agent_runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_agent_run_items_run_order
ON agent_run_items (run_id, sort_order ASC, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_agent_run_items_employee_status
ON agent_run_items (employee_id, status);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  source_run_id TEXT,
  source_item_id TEXT,
  employee_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'todo',
  priority TEXT NOT NULL DEFAULT 'normal',
  result_text TEXT,
  result_error TEXT,
  due_at TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  FOREIGN KEY (source_run_id) REFERENCES agent_runs(id) ON DELETE SET NULL,
  FOREIGN KEY (source_item_id) REFERENCES agent_run_items(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_status_updated
ON tasks (status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_tasks_employee_status
ON tasks (employee_id, status);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_employee_created
ON chat_messages (employee_id, created_at ASC);

CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  run_id TEXT,
  item_id TEXT,
  task_id TEXT,
  employee_id TEXT,
  title TEXT NOT NULL,
  artifact_type TEXT NOT NULL DEFAULT 'markdown',
  content_text TEXT,
  file_url TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (run_id) REFERENCES agent_runs(id) ON DELETE SET NULL,
  FOREIGN KEY (item_id) REFERENCES agent_run_items(id) ON DELETE SET NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_artifacts_run_created
ON artifacts (run_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_artifacts_task_created
ON artifacts (task_id, created_at ASC);
