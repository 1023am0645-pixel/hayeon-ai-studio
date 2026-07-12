-- Automation templates and audit trail for HA:YEON AI STUDIO

CREATE TABLE IF NOT EXISTS automation_templates (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT,
  goal TEXT NOT NULL,
  artifact_type TEXT NOT NULL DEFAULT 'markdown',
  action_type TEXT NOT NULL DEFAULT 'document_draft',
  source_action_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (source_action_id) REFERENCES tool_actions(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_automation_templates_updated
ON automation_templates (updated_at DESC);

CREATE TABLE IF NOT EXISTS automation_audit_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  source_run_id TEXT,
  source_action_id TEXT,
  task_id TEXT,
  title TEXT,
  status TEXT,
  message TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (source_run_id) REFERENCES agent_runs(id) ON DELETE SET NULL,
  FOREIGN KEY (source_action_id) REFERENCES tool_actions(id) ON DELETE SET NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_automation_audit_created
ON automation_audit_events (created_at DESC);
