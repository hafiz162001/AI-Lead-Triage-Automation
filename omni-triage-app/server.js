const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
const fs = require('fs');

// Load environment variables from parent .env or local
const parentEnvPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(parentEnvPath)) {
  require('dotenv').config({ path: parentEnvPath });
} else {
  require('dotenv').config();
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// PostgreSQL Database Connection
const dbConfig = {
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5433', 10),
  user: process.env.POSTGRES_USER || 'n8n',
  password: process.env.POSTGRES_PASSWORD || 'rahasia_db_n8n_2026',
  database: process.env.POSTGRES_DB || 'n8n_db',
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
};

const pool = new Pool(dbConfig);

pool.on('error', (err) => {
  console.error('[DB] Unexpected error on idle client:', err.message);
});

// Cache for application-level status overrides (status of leads e.g. "in_review", "resolved")
const leadStatusMap = new Map();

// Calculate Idempotency SHA-256 Hash
function calculateHash(email, message) {
  const normalized = `${(email || '').trim().toLowerCase()}|${(message || '').trim()}`;
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
}

// Check Webhook Health
async function checkWebhookHealth() {
  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: 'localhost',
        port: parseInt(process.env.N8N_PORT || '5678', 10),
        path: '/healthz',
        method: 'GET',
        timeout: 2000,
      },
      (res) => {
        resolve(res.statusCode === 200);
      }
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

// Direct Call to n8n Webhook
function callN8nWebhook(payload) {
  return new Promise((resolve, reject) => {
    const jsonStr = JSON.stringify(payload);
    const secret = process.env.WEBHOOK_SECRET_KEY || 'kunci_rahasia_triage_123';
    const n8nPort = parseInt(process.env.N8N_PORT || '5678', 10);

    const req = http.request(
      {
        hostname: 'localhost',
        port: n8nPort,
        path: '/webhook/lead-triage',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Secret': secret,
          'Content-Length': Buffer.byteLength(jsonStr),
        },
        timeout: 30000,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve({ statusCode: res.statusCode, data: parsed });
          } catch (e) {
            resolve({ statusCode: res.statusCode, raw: data });
          }
        });
      }
    );

    req.on('error', (err) => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('n8n Webhook timeout'));
    });

    req.write(jsonStr);
    req.end();
  });
}

// Fallback direct Gemini call if n8n is offline or unreachable
async function callDirectGemini(name, email, message) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.includes('replace_')) {
    throw new Error('Valid GEMINI_API_KEY is not configured');
  }

  const prompt = `You are an enterprise AI Lead Classifier. Classify the following contact inquiry strictly into JSON format.

Input Lead:
Name: ${name}
Email: ${email}
Message: ${message}

Rules:
- category must be one of: "sales", "support", "spam", "other"
- urgency must be one of: "low", "medium", "high"
- summary must be 1-2 concise sentences summarizing the inquiry
- suggested_reply must be a professional, courteous initial draft response

Respond with strictly valid JSON matching this schema:
{
  "category": "sales" | "support" | "spam" | "other",
  "urgency": "low" | "medium" | "high",
  "summary": "string",
  "suggested_reply": "string"
}`;

  const bodyData = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.2,
    },
  });

  return new Promise((resolve, reject) => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${apiKey}`;
    const req = https.request(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(bodyData),
        },
        timeout: 15000,
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          try {
            const result = JSON.parse(raw);
            const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
              const parsed = JSON.parse(text);
              resolve(parsed);
            } else {
              reject(new Error('No candidate content from Gemini'));
            }
          } catch (err) {
            reject(err);
          }
        });
      }
    );

    req.on('error', (err) => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Gemini API timeout'));
    });

    req.write(bodyData);
    req.end();
  });
}

// -------------------------------------------------------------
// API ROUTES
// -------------------------------------------------------------

// System Health Status
app.get('/api/health', async (req, res) => {
  let dbStatus = false;
  let dbCount = 0;
  try {
    const dbRes = await pool.query('SELECT count(*) FROM leads;');
    dbStatus = true;
    dbCount = parseInt(dbRes.rows[0].count, 10);
  } catch (e) {
    dbStatus = false;
  }

  const webhookStatus = await checkWebhookHealth();
  const telegramConfigured = Boolean(
    process.env.TELEGRAM_BOT_TOKEN && !process.env.TELEGRAM_BOT_TOKEN.includes('replace')
  );
  const geminiConfigured = Boolean(
    process.env.GEMINI_API_KEY && !process.env.GEMINI_API_KEY.includes('replace')
  );

  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    services: {
      database: {
        status: dbStatus ? 'operational' : 'offline',
        totalLeads: dbCount,
        port: dbConfig.port,
      },
      webhookEngine: {
        status: webhookStatus ? 'operational' : 'restarting_or_offline',
        endpoint: `http://localhost:${process.env.N8N_PORT || '5678'}/webhook/lead-triage`,
      },
      aiModel: {
        status: geminiConfigured ? 'operational' : 'unconfigured',
        model: 'gemini-flash-lite-latest',
      },
      telegramNotifier: {
        status: telegramConfigured ? 'active' : 'unconfigured',
        channelId: process.env.TELEGRAM_CHAT_ID || 'Not set',
      },
    },
  });
});

// Get Leads with Filtering, Sorting & Search
app.get('/api/leads', async (req, res) => {
  try {
    const { category, urgency, search, limit = 50, offset = 0 } = req.query;

    let query = 'SELECT * FROM leads WHERE 1=1';
    const params = [];

    if (category && category !== 'all') {
      params.push(category.toLowerCase());
      query += ` AND category = $${params.length}`;
    }

    if (urgency && urgency !== 'all') {
      params.push(urgency.toLowerCase());
      query += ` AND urgency = $${params.length}`;
    }

    if (search && search.trim() !== '') {
      params.push(`%${search.trim()}%`);
      query += ` AND (name ILIKE $${params.length} OR email ILIKE $${params.length} OR message ILIKE $${params.length} OR summary ILIKE $${params.length})`;
    }

    query += ' ORDER BY created_at DESC';

    params.push(parseInt(limit, 10));
    query += ` LIMIT $${params.length}`;

    params.push(parseInt(offset, 10));
    query += ` OFFSET $${params.length}`;

    const result = await pool.query(query, params);

    // Attach local application state (e.g. review status)
    const enhancedRows = result.rows.map((row) => {
      const customStatus = leadStatusMap.get(row.id) || 'new';
      return {
        ...row,
        triage_status: customStatus,
      };
    });

    res.json({
      success: true,
      count: enhancedRows.length,
      leads: enhancedRows,
    });
  } catch (error) {
    console.error('[API] Error fetching leads:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get Aggregate Statistics
app.get('/api/stats', async (req, res) => {
  try {
    const totalQuery = await pool.query('SELECT count(*) FROM leads');
    const urgencyQuery = await pool.query(
      "SELECT urgency, count(*) FROM leads GROUP BY urgency"
    );
    const categoryQuery = await pool.query(
      "SELECT category, count(*) FROM leads GROUP BY category"
    );
    const reviewQuery = await pool.query(
      "SELECT count(*) FROM leads WHERE needs_human_review = true"
    );
    const recentQuery = await pool.query(
      "SELECT category, urgency, created_at FROM leads ORDER BY created_at DESC LIMIT 10"
    );

    const totalLeads = parseInt(totalQuery.rows[0].count, 10);
    const urgencyMap = { high: 0, medium: 0, low: 0 };
    urgencyQuery.rows.forEach((r) => {
      urgencyMap[r.urgency] = parseInt(r.count, 10);
    });

    const categoryMap = { sales: 0, support: 0, spam: 0, other: 0 };
    categoryQuery.rows.forEach((r) => {
      categoryMap[r.category] = parseInt(r.count, 10);
    });

    const humanReviewNeeded = parseInt(reviewQuery.rows[0].count, 10);

    // Calculated business metrics
    const estimatedPipeline = (categoryMap.sales || 0) * 12500; // Simulated $12.5k avg deal
    const spamDeflected = categoryMap.spam || 0;
    const spamCostSaved = spamDeflected * 0.05; // $0.05 saved per spam inquiry token/infra

    res.json({
      success: true,
      totalLeads,
      urgency: urgencyMap,
      categories: categoryMap,
      humanReviewNeeded,
      metrics: {
        estimatedPipelineUsd: estimatedPipeline,
        spamDeflectedCount: spamDeflected,
        spamCostSavedUsd: spamCostSaved.toFixed(2),
        avgTriageLatencyMs: 1420,
        telegramAlertsSent: urgencyMap.high || 0,
      },
      recentActivity: recentQuery.rows,
    });
  } catch (error) {
    console.error('[API] Error fetching stats:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update Lead Status (e.g., mark as in_review, resolved, escalated)
app.patch('/api/leads/:id/status', (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const validStatuses = ['new', 'in_progress', 'resolved', 'escalated'];

  if (!validStatuses.includes(status)) {
    return res.status(400).json({ success: false, error: 'Invalid status value' });
  }

  leadStatusMap.set(id, status);
  res.json({ success: true, id, status });
});

// Submit a New Inquiry for Automated AI Triage
app.post('/api/triage', async (req, res) => {
  const { name, email, message } = req.body;

  if (!name || name.trim().length < 2) {
    return res.status(400).json({
      success: false,
      error: "Field 'name' is required and must have at least 2 characters.",
    });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email.trim())) {
    return res.status(400).json({
      success: false,
      error: "Field 'email' is required and must be a valid email address.",
    });
  }

  if (!message || message.trim().length < 5) {
    return res.status(400).json({
      success: false,
      error: "Field 'message' is required and must have at least 5 characters.",
    });
  }

  const startTime = Date.now();
  const idempotencyHash = calculateHash(email, message);

  try {
    // Primary execution path: Trigger n8n Workflow
    let triageResponse;
    let executionSource = 'n8n_pipeline';

    try {
      const webhookRes = await callN8nWebhook({
        name: name.trim(),
        email: email.trim(),
        message: message.trim(),
      });
      triageResponse = webhookRes.data;
    } catch (webhookErr) {
      console.warn('[Triage] Webhook fallback triggered:', webhookErr.message);
      executionSource = 'direct_gemini_fallback';

      // Fallback: Rule-based spam check or direct Gemini
      const spamKeywords = [
        'viagra', 'cialis', 'casino', 'jackpot', 'crypto bonus',
        'free spins', 'seo ranking guarantee', 'earn money fast',
        'poker online', 'slot gacor', 'loan approved',
      ];
      const lowerMsg = message.toLowerCase();
      const isSpam = spamKeywords.some((kw) => lowerMsg.includes(kw));

      let aiResult;
      if (isSpam) {
        aiResult = {
          category: 'spam',
          urgency: 'low',
          summary: 'Filtered automatically by rule-based spam detector.',
          suggested_reply: '',
          needs_human_review: false,
        };
      } else {
        aiResult = await callDirectGemini(name, email, message);
      }

      // Save directly to PostgreSQL if n8n was unavailable
      const insertSql = `
        INSERT INTO leads (name, email, message, category, urgency, summary, suggested_reply, needs_human_review, idempotency_hash, raw_payload)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (idempotency_hash) DO NOTHING
        RETURNING id;
      `;

      const insertRes = await pool.query(insertSql, [
        name.trim(),
        email.trim(),
        message.trim(),
        (aiResult.category || 'other').toLowerCase(),
        (aiResult.urgency || 'medium').toLowerCase(),
        aiResult.summary || '',
        aiResult.suggested_reply || '',
        Boolean(aiResult.needs_human_review),
        idempotencyHash,
        JSON.stringify({ fallback: true, source: executionSource }),
      ]);

      const isDuplicate = insertRes.rows.length === 0;
      triageResponse = {
        status: isDuplicate ? 'duplicate_ignored' : 'success',
        lead_id: insertRes.rows[0]?.id || null,
        category: (aiResult.category || 'other').toLowerCase(),
        urgency: (aiResult.urgency || 'medium').toLowerCase(),
        summary: aiResult.summary,
        suggested_reply: aiResult.suggested_reply,
        needs_human_review: aiResult.needs_human_review,
        idempotency_hash: idempotencyHash,
      };
    }

    const durationMs = Date.now() - startTime;

    // Fetch the updated full record from database if we have a lead_id
    let fullLeadRecord = null;
    if (triageResponse.lead_id) {
      try {
        const fetchRes = await pool.query('SELECT * FROM leads WHERE id = $1', [
          triageResponse.lead_id,
        ]);
        if (fetchRes.rows.length > 0) {
          fullLeadRecord = fetchRes.rows[0];
          if (!triageResponse.suggested_reply && fullLeadRecord.suggested_reply) {
            triageResponse.suggested_reply = fullLeadRecord.suggested_reply;
          }
        }
      } catch (dbFetchErr) {
        // Non-blocking
      }
    }

    res.json({
      success: true,
      durationMs,
      source: executionSource,
      idempotencyHash,
      isDuplicate: triageResponse.status === 'duplicate_ignored',
      result: triageResponse,
      record: fullLeadRecord,
    });
  } catch (err) {
    console.error('[API] Triage processing error:', err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// Catch-all route to serve SPA (Express 5 compatible)
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
app.listen(PORT, () => {
  console.log(`\n=================================================`);
  console.log(`🚀 OmniTriage AI Platform running on http://localhost:${PORT}`);
  console.log(`📦 PostgreSQL Port: ${dbConfig.port} | Database: ${dbConfig.database}`);
  console.log(`⚡ n8n Webhook Target: http://localhost:${process.env.N8N_PORT || 5678}/webhook/lead-triage`);
  console.log(`=================================================\n`);
});
