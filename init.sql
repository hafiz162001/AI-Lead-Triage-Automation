-- AI Lead Triage Database Schema
-- Auto-executed on PostgreSQL container initialization

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Table: leads
-- Stores validated incoming contact form leads and classification results
CREATE TABLE IF NOT EXISTS leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    category VARCHAR(50) NOT NULL CHECK (category IN ('sales', 'support', 'spam', 'other')),
    urgency VARCHAR(20) NOT NULL CHECK (urgency IN ('low', 'medium', 'high')),
    summary TEXT,
    suggested_reply TEXT,
    needs_human_review BOOLEAN DEFAULT FALSE,
    idempotency_hash VARCHAR(64) NOT NULL UNIQUE,
    raw_payload JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for frequent queries and filtering
CREATE INDEX IF NOT EXISTS idx_leads_category ON leads(category);
CREATE INDEX IF NOT EXISTS idx_leads_urgency ON leads(urgency);
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_idempotency_hash ON leads(idempotency_hash);

-- Table: errors
-- Logs execution failures routed from the n8n Error Trigger workflow
CREATE TABLE IF NOT EXISTS errors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id VARCHAR(100),
    workflow_name VARCHAR(255),
    execution_id VARCHAR(100),
    node_name VARCHAR(255),
    error_message TEXT NOT NULL,
    error_details JSONB,
    payload JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_errors_workflow_name ON errors(workflow_name);
CREATE INDEX IF NOT EXISTS idx_errors_created_at ON errors(created_at DESC);
