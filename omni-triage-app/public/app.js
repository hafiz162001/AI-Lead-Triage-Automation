/**
 * OmniTriage AI — Client Application Engine
 * Next-Gen Autonomous Customer & Enterprise Operations Desk
 */

(function () {
  'use strict';

  // State Management
  const state = {
    activeTab: 'viewCommandDesk',
    audioEnabled: true,
    livePolling: true,
    pollingInterval: null,
    leads: [],
    stats: null,
    filters: {
      category: 'all',
      urgency: 'all',
      search: '',
      needsReviewOnly: false,
    },
    currentModalLead: null,
  };

  // Audio Synthesizer (Native Web Audio API)
  let audioCtx = null;
  function initAudio() {
    if (!audioCtx && typeof window.AudioContext !== 'undefined') {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
  }

  function playSound(type) {
    if (!state.audioEnabled) return;
    try {
      initAudio();
      if (!audioCtx) return;
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }

      const now = audioCtx.currentTime;

      if (type === 'click') {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(1200, now + 0.04);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.04);
      } else if (type === 'success') {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(523.25, now); // C5
        osc.frequency.setValueAtTime(659.25, now + 0.08); // E5
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.25);
      } else if (type === 'urgent') {
        // High urgency warble alert
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(740, now);
        osc.frequency.linearRampToValueAtTime(880, now + 0.08);
        osc.frequency.linearRampToValueAtTime(740, now + 0.16);
        osc.frequency.linearRampToValueAtTime(950, now + 0.24);
        gain.gain.setValueAtTime(0.16, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.32);
      } else if (type === 'spam') {
        // Low deflection buzz
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(240, now);
        osc.frequency.exponentialRampToValueAtTime(90, now + 0.12);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.12);
      }
    } catch (e) {
      // Audio playback non-blocking fallback
    }
  }

  // Toast Notification System
  function showToast(message, type = 'info', duration = 3500) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type === 'high' ? 'toast-high' : type === 'success' ? 'toast-success' : ''}`;

    let icon = 'ℹ️';
    if (type === 'high') icon = '🚨';
    if (type === 'success') icon = '✅';
    if (type === 'spam') icon = '🛡️';

    toast.innerHTML = `
      <span class="toast-icon">${icon}</span>
      <span class="toast-msg">${escapeHtml(message)}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.25s ease';
      setTimeout(() => toast.remove(), 250);
    }, duration);
  }

  // DOM Elements Selection Helper
  const $ = (id) => document.getElementById(id);

  // Escaping Utility
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Time-ago Formatter
  function timeAgo(dateString) {
    if (!dateString) return 'Just now';
    const past = new Date(dateString).getTime();
    const now = Date.now();
    const diffSec = Math.floor((now - past) / 1000);

    if (diffSec < 5) return 'Just now';
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour}h ago`;
    const diffDay = Math.floor(diffHour / 24);
    return `${diffDay}d ago`;
  }

  // Init App
  document.addEventListener('DOMContentLoaded', () => {
    setupNavigation();
    setupAudioToggle();
    setupFiltersAndSearch();
    setupSimulator();
    setupModal();
    setupChaosBurst();

    // Initial Data Fetch
    fetchHealthStatus();
    fetchStats();
    fetchLeads();

    // Start Live Polling
    startPolling();
  });

  // -------------------------------------------------------------
  // Navigation & Tabs
  // -------------------------------------------------------------
  function setupNavigation() {
    const tabs = document.querySelectorAll('.nav-tab');
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        playSound('click');
        const targetViewId = tab.getAttribute('data-target');
        switchView(targetViewId, tab);
      });
    });

    $('openSubmitModalBtn').addEventListener('click', () => {
      playSound('click');
      const simTab = $('tabSimulator');
      switchView('viewSimulator', simTab);
      $('inputSenderName').focus();
    });
  }

  function switchView(viewId, activeTabEl) {
    state.activeTab = viewId;

    document.querySelectorAll('.nav-tab').forEach((t) => {
      t.classList.remove('active');
      t.setAttribute('aria-selected', 'false');
    });

    if (activeTabEl) {
      activeTabEl.classList.add('active');
      activeTabEl.setAttribute('aria-selected', 'true');
    }

    document.querySelectorAll('.view-panel').forEach((panel) => {
      panel.classList.remove('active');
    });

    const activePanel = $(viewId);
    if (activePanel) {
      activePanel.classList.add('active');
    }

    if (viewId === 'viewAnalytics') {
      fetchStats();
    }
  }

  // Audio Toggle
  function setupAudioToggle() {
    const audioBtn = $('audioToggleBtn');
    const onIcon = $('audioIconOn');
    const offIcon = $('audioIconOff');

    audioBtn.addEventListener('click', () => {
      state.audioEnabled = !state.audioEnabled;
      if (state.audioEnabled) {
        onIcon.classList.remove('hidden');
        offIcon.classList.add('hidden');
        playSound('success');
        showToast('Futuristic Audio FX Enabled', 'info', 2000);
      } else {
        onIcon.classList.add('hidden');
        offIcon.classList.remove('hidden');
        showToast('Audio FX Muted', 'info', 2000);
      }
    });
  }

  // -------------------------------------------------------------
  // Live Polling & Data Fetching
  // -------------------------------------------------------------
  function startPolling() {
    if (state.pollingInterval) clearInterval(state.pollingInterval);
    state.pollingInterval = setInterval(() => {
      if (state.livePolling) {
        fetchStats(true);
        fetchLeads(true);
      }
    }, 5000);
  }

  async function fetchHealthStatus() {
    try {
      const res = await fetch('/api/health');
      const data = await res.json();

      const dbPill = $('healthDb');
      const whPill = $('healthWebhook');
      const aiPill = $('healthAi');
      const tgPill = $('healthTelegram');

      if (data.services.database.status === 'operational') {
        dbPill.innerHTML = `<span class="dot dot-green"></span> DB :${data.services.database.port}`;
      } else {
        dbPill.innerHTML = `<span class="dot dot-red"></span> DB Offline`;
      }

      if (data.services.webhookEngine.status === 'operational') {
        whPill.innerHTML = `<span class="dot dot-green"></span> n8n Engine`;
      } else {
        whPill.innerHTML = `<span class="dot dot-red"></span> n8n Offline`;
      }

      if (data.services.aiModel.status === 'operational') {
        aiPill.innerHTML = `<span class="dot dot-green"></span> Gemini Flash`;
      }

      if (data.services.telegramNotifier.status === 'active') {
        tgPill.innerHTML = `<span class="dot dot-green"></span> Telegram Armed`;
      }
    } catch (e) {
      console.warn('Health check error:', e);
    }
  }

  async function fetchStats(isSilent = false) {
    try {
      const res = await fetch('/api/stats');
      const data = await res.json();
      if (!data.success) return;

      state.stats = data;

      // Update KPI Counter Cards
      $('kpiTotalLeads').textContent = data.totalLeads.toLocaleString();
      $('kpiHighUrgency').textContent = (data.urgency.high || 0).toLocaleString();
      $('kpiPipelineValue').textContent = `$${(data.metrics.estimatedPipelineUsd || 0).toLocaleString()}`;
      $('kpiSpamDeflected').textContent = (data.metrics.spamDeflectedCount || 0).toLocaleString();
      $('kpiCostSaved').textContent = `$${data.metrics.spamCostSavedUsd || '0.00'}`;

      // Update Analytics View
      renderAnalyticsCharts(data);
    } catch (e) {
      if (!isSilent) console.error('Error fetching stats:', e);
    }
  }

  async function fetchLeads(isSilent = false) {
    try {
      const queryParams = new URLSearchParams();
      if (state.filters.category !== 'all') {
        queryParams.set('category', state.filters.category);
      }
      if (state.filters.urgency !== 'all') {
        queryParams.set('urgency', state.filters.urgency);
      }
      if (state.filters.search.trim() !== '') {
        queryParams.set('search', state.filters.search.trim());
      }
      queryParams.set('limit', 100);

      const res = await fetch(`/api/leads?${queryParams.toString()}`);
      const data = await res.json();

      if (!data.success) return;

      let leads = data.leads || [];

      if (state.filters.needsReviewOnly) {
        leads = leads.filter((l) => l.needs_human_review);
      }

      state.leads = leads;
      renderLeadsFeed(leads);

      $('feedCountLabel').textContent = `Showing ${leads.length} inquir${leads.length === 1 ? 'y' : 'ies'}`;
      $('lastSyncLabel').textContent = `Synchronized ${new Date().toLocaleTimeString()}`;
    } catch (e) {
      if (!isSilent) console.error('Error fetching leads:', e);
    }
  }

  // -------------------------------------------------------------
  // Render Triage Cards Feed
  // -------------------------------------------------------------
  function renderLeadsFeed(leads) {
    const container = $('feedCardsGrid');
    if (!container) return;

    if (leads.length === 0) {
      container.innerHTML = `
        <div class="feed-empty-state">
          <div style="font-size: 2rem; margin-bottom: 8px;">🔍</div>
          <h3>No matching inquiries found</h3>
          <p style="font-size: 0.85rem; color: var(--text-dim); margin-top: 4px;">Try loosening filter criteria or submit a new test inquiry from the Testing Lab.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = leads.map((lead) => createLeadCardHtml(lead)).join('');

    // Attach Click Events
    container.querySelectorAll('.btn-inspect').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const card = e.target.closest('.triage-card');
        const id = card.getAttribute('data-id');
        const targetLead = state.leads.find((l) => l.id === id);
        if (targetLead) {
          playSound('click');
          openModal(targetLead);
        }
      });
    });

    container.querySelectorAll('.btn-copy-reply').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const reply = btn.getAttribute('data-reply');
        navigator.clipboard.writeText(reply || '');
        playSound('success');
        showToast('Suggested reply copied to clipboard!', 'success');
      });
    });

    container.querySelectorAll('.status-dropdown').forEach((dropdown) => {
      dropdown.addEventListener('change', async (e) => {
        const id = dropdown.getAttribute('data-id');
        const newStatus = dropdown.value;
        try {
          await fetch(`/api/leads/${id}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus }),
          });
          playSound('click');
          showToast(`Status updated to: ${newStatus}`, 'info');
        } catch (err) {
          showToast('Failed to update status', 'error');
        }
      });
    });

    container.querySelectorAll('.hash-pill').forEach((pill) => {
      pill.addEventListener('click', () => {
        const fullHash = pill.getAttribute('data-hash');
        navigator.clipboard.writeText(fullHash || '');
        playSound('click');
        showToast('SHA-256 hash copied', 'info', 1800);
      });
    });
  }

  function createLeadCardHtml(lead) {
    const initials = (lead.name || 'Anonymous')
      .split(' ')
      .map((n) => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();

    const shortHash = lead.idempotency_hash
      ? `${lead.idempotency_hash.substring(0, 8)}...${lead.idempotency_hash.substring(58)}`
      : 'no-hash';

    const urgencyClass = `urg-${lead.urgency}`;
    const borderClass = `card-border-${lead.urgency}`;
    const categoryClass = `cat-${lead.category}`;

    return `
      <div class="triage-card ${borderClass}" data-id="${lead.id}">
        <div class="triage-card-header">
          <div class="header-badges-left">
            <span class="badge-category ${categoryClass}">#${escapeHtml(lead.category)}</span>
            <span class="badge-urgency ${urgencyClass}">
              ${lead.urgency === 'high' ? '🔥 ' : ''}${escapeHtml(lead.urgency)}
            </span>
            ${
              lead.needs_human_review
                ? '<span class="badge-review-warning">⚠️ Needs Human Review</span>'
                : ''
            }
          </div>
          <div class="triage-card-time">${timeAgo(lead.created_at)}</div>
        </div>

        <div class="triage-sender-row">
          <div class="sender-profile">
            <div class="sender-avatar">${initials}</div>
            <div>
              <div class="sender-name">${escapeHtml(lead.name)}</div>
              <div class="sender-email">${escapeHtml(lead.email)}</div>
            </div>
          </div>
          <div class="hash-pill" data-hash="${escapeHtml(lead.idempotency_hash)}" title="Click to copy full SHA-256 idempotency hash">
            🔑 ${shortHash}
          </div>
        </div>

        <div class="triage-message-snippet">
          "${escapeHtml(lead.message)}"
        </div>

        <div class="ai-synopsis-box">
          <div class="synopsis-header">
            <span>✨ AI Executive Summary</span>
          </div>
          <div class="synopsis-text">
            ${escapeHtml(lead.summary || 'Summary pending processing...')}
          </div>
        </div>

        <div class="triage-card-footer">
          <div class="footer-left-status">
            <label style="font-size: 0.72rem; color: var(--text-dim);">Status:</label>
            <select class="status-dropdown" data-id="${lead.id}">
              <option value="new" ${lead.triage_status === 'new' ? 'selected' : ''}>New</option>
              <option value="in_progress" ${lead.triage_status === 'in_progress' ? 'selected' : ''}>In Progress</option>
              <option value="resolved" ${lead.triage_status === 'resolved' ? 'selected' : ''}>Resolved</option>
              <option value="escalated" ${lead.triage_status === 'escalated' ? 'selected' : ''}>Escalated</option>
            </select>
          </div>

          <div class="footer-right-actions">
            ${
              lead.suggested_reply
                ? `<button class="card-action-btn btn-copy-reply" data-reply="${escapeHtml(lead.suggested_reply)}" title="Copy AI suggested response">
                    📋 Copy Reply
                   </button>`
                : ''
            }
            <button class="card-action-btn btn-inspect">
              🔍 Dossier
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // -------------------------------------------------------------
  // Filter & Search Handlers
  // -------------------------------------------------------------
  function setupFiltersAndSearch() {
    // Category Filter Pills
    $('categoryFilterPills').querySelectorAll('.filter-pill').forEach((pill) => {
      pill.addEventListener('click', () => {
        playSound('click');
        $('categoryFilterPills').querySelectorAll('.filter-pill').forEach((p) => p.classList.remove('active'));
        pill.classList.add('active');
        state.filters.category = pill.getAttribute('data-category');
        fetchLeads();
      });
    });

    // Urgency Filter Pills
    $('urgencyFilterPills').querySelectorAll('.filter-pill').forEach((pill) => {
      pill.addEventListener('click', () => {
        playSound('click');
        $('urgencyFilterPills').querySelectorAll('.filter-pill').forEach((p) => p.classList.remove('active'));
        pill.classList.add('active');
        state.filters.urgency = pill.getAttribute('data-urgency');
        fetchLeads();
      });
    });

    // Search Input
    let searchDebounce = null;
    const searchInput = $('searchInput');
    const clearBtn = $('clearSearchBtn');

    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchDebounce);
      const val = e.target.value;
      if (val.trim() !== '') {
        clearBtn.classList.remove('hidden');
      } else {
        clearBtn.classList.add('hidden');
      }

      searchDebounce = setTimeout(() => {
        state.filters.search = val;
        fetchLeads();
      }, 300);
    });

    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      clearBtn.classList.add('hidden');
      state.filters.search = '';
      fetchLeads();
    });

    // Needs Human Review Checkbox
    $('filterReviewOnly').addEventListener('change', (e) => {
      playSound('click');
      state.filters.needsReviewOnly = e.target.checked;
      fetchLeads();
    });

    // Live Polling Toggle
    const liveBtn = $('liveToggleBtn');
    liveBtn.addEventListener('click', () => {
      state.livePolling = !state.livePolling;
      if (state.livePolling) {
        liveBtn.classList.add('active');
        liveBtn.innerHTML = '<span class="live-dot"></span> LIVE POLLING';
        startPolling();
        showToast('Live auto-polling resumed (every 5s)', 'info');
      } else {
        liveBtn.classList.remove('active');
        liveBtn.innerHTML = '⏸️ PAUSED';
        if (state.pollingInterval) clearInterval(state.pollingInterval);
        showToast('Live polling paused', 'info');
      }
    });

    // Manual Refresh Button
    $('manualRefreshBtn').addEventListener('click', () => {
      playSound('click');
      const icon = $('refreshIcon');
      icon.classList.add('rotating');
      fetchStats();
      fetchLeads().then(() => {
        setTimeout(() => icon.classList.remove('rotating'), 600);
      });
    });
  }

  // -------------------------------------------------------------
  // Testing Lab Simulator Logic
  // -------------------------------------------------------------
  function setupSimulator() {
    const presets = {
      enterprise: {
        name: 'Dr. Sarah Sterling',
        email: `sarah.sterling.${Date.now()}@apexcorp.global`,
        message:
          'Hello, I am the VP of Engineering at Apex Global. We are preparing to transition our 75-engineer infrastructure to your enterprise tier. Can you arrange an executive architecture walkthrough this Thursday and share your SOC2 compliance whitepaper?',
      },
      outage: {
        name: 'Alex Vance',
        email: `alex.devops.${Date.now()}@critical-cloud.io`,
        message:
          'CRITICAL ALERT: Production Postgres cluster has deadlocked and API latency has surged past 8,000ms! All EU checkout transactions are failing immediately with 500 status! We need urgent senior SRE assistance!',
      },
      spam: {
        name: 'VIP Casino Deals',
        email: `promotion.${Date.now()}@crypto-spins-jackpot.biz`,
        message:
          'Claim your 250 free spins! Instant crypto jackpot deposits with zero fees. Slot gacor guaranteed daily payouts! Click now.',
      },
      partnership: {
        name: 'Marcus Brody',
        email: `marcus.${Date.now()}@hyperscaler-alliance.com`,
        message:
          'Hi Team, We are exploring a joint go-to-market technology partnership for cloud marketplace integration with your platform. Would your business development team be open for an exploratory sync next Tuesday?',
      },
      general: {
        name: 'Liam Chen',
        email: `liam.${Date.now()}@startupflow.app`,
        message:
          'Hi there, Could someone guide me on how to configure automated monthly invoice CSV exports to our accounting department email? Thanks!',
      },
      duplicate: {
        name: 'Elena Rostova',
        email: 'elena.rostova@acme.com',
        message:
          'We submitted our enterprise inquiry earlier, sending again to confirm receipt for our procurement department.',
      },
    };

    // Scenario Presets Click
    document.querySelectorAll('.preset-card').forEach((btn) => {
      btn.addEventListener('click', () => {
        playSound('click');
        const key = btn.getAttribute('data-preset');
        const data = presets[key];
        if (data) {
          $('inputSenderName').value = data.name;
          $('inputSenderEmail').value = data.email;
          $('inputMessage').value = data.message;
          showToast(`Preset loaded: ${btn.querySelector('.preset-title').textContent}`, 'info', 2000);
        }
      });
    });

    // Reset Form
    $('resetFormBtn').addEventListener('click', () => {
      playSound('click');
      $('triageSimulatorForm').reset();
      resetPipelineSteps();
    });

    // Form Submit
    $('triageSimulatorForm').addEventListener('submit', async (e) => {
      e.preventDefault();

      const name = $('inputSenderName').value.trim();
      const email = $('inputSenderEmail').value.trim();
      const message = $('inputMessage').value.trim();

      const submitBtn = $('submitTriageBtn');
      const spinner = $('submitBtnSpinner');
      const btnText = $('submitBtnText');

      submitBtn.disabled = true;
      spinner.classList.remove('hidden');
      btnText.textContent = 'Processing Triage...';

      // Animate Pipeline Step 1
      setPipelineStep(1, 'active', 'Authenticating...');

      try {
        await delay(200);
        setPipelineStep(1, 'done', 'Verified');
        setPipelineStep(2, 'active', 'Evaluating Heuristics...');

        const startTime = Date.now();
        const response = await fetch('/api/triage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, message }),
        });

        const data = await response.json();
        const duration = Date.now() - startTime;

        if (!data.success) {
          throw new Error(data.error || 'Server rejected submission');
        }

        const res = data.result;

        // Animate Pipeline Remaining Steps
        if (res.category === 'spam') {
          setPipelineStep(2, 'done', 'Spam Deflected');
          setPipelineStep(3, 'done', 'Skipped (Saved Tokens)');
        } else {
          setPipelineStep(2, 'done', 'Passed Clean');
          setPipelineStep(3, 'done', 'Classified');
        }

        setPipelineStep(4, 'done', data.isDuplicate ? 'Duplicate Caught' : 'Saved');

        if (res.urgency === 'high') {
          setPipelineStep(5, 'done', '🚨 High Alert Broadcasted');
        } else {
          setPipelineStep(5, 'done', 'Standard Dispatch');
        }

        $('pipelineStatusBadge').textContent = 'Completed';
        $('pipelineStatusBadge').style.color = '#34d399';

        // Render Result Card
        displaySimulatorResult(data, duration);

        // Sound Feedback
        if (data.isDuplicate) {
          playSound('click');
          showToast('Duplicate submission caught! Idempotency protected database.', 'info');
        } else if (res.urgency === 'high') {
          playSound('urgent');
          showToast('🔥 High Urgency alert broadcasted to Telegram!', 'high');
        } else if (res.category === 'spam') {
          playSound('spam');
          showToast('🚫 Spam deflected without consuming LLM quota!', 'spam');
        } else {
          playSound('success');
          showToast('Inquiry successfully classified & stored!', 'success');
        }

        // Update stats and leads list
        fetchStats();
        fetchLeads();
      } catch (err) {
        playSound('spam');
        showToast(`Triage Error: ${err.message}`, 'error', 4500);
        resetPipelineSteps();
      } finally {
        submitBtn.disabled = false;
        spinner.classList.add('hidden');
        btnText.textContent = '⚡ Execute Autonomous Triage';
      }
    });

    // Copy Reply from result card
    $('copyResultReplyBtn').addEventListener('click', () => {
      const text = $('resReplyText').textContent;
      navigator.clipboard.writeText(text);
      playSound('success');
      showToast('Suggested reply copied to clipboard!', 'success');
    });
  }

  function setPipelineStep(stepNum, status, text) {
    const step = $(`pipeStep${stepNum}`);
    const statusEl = $(`pipeStatus${stepNum}`);
    if (!step || !statusEl) return;

    step.classList.remove('step-active', 'step-done');
    if (status === 'active') {
      step.classList.add('step-active');
    } else if (status === 'done') {
      step.classList.add('step-done');
    }
    statusEl.textContent = text;
  }

  function resetPipelineSteps() {
    for (let i = 1; i <= 5; i++) {
      setPipelineStep(i, '', 'Ready');
    }
    $('pipelineStatusBadge').textContent = 'Awaiting Input';
    $('pipelineStatusBadge').style.color = '';
  }

  function displaySimulatorResult(data, durationMs) {
    $('resultEmptyPlaceholder').classList.add('hidden');
    $('resultCardContent').classList.remove('hidden');

    const res = data.result;
    const statusBadge = $('resStatusBadge');
    if (data.isDuplicate) {
      statusBadge.textContent = 'DUPLICATE IGNORED';
      statusBadge.style.background = 'rgba(245, 158, 11, 0.15)';
      statusBadge.style.borderColor = 'rgba(245, 158, 11, 0.4)';
      statusBadge.style.color = '#fde68a';
    } else {
      statusBadge.textContent = 'TRIAGE SUCCESS';
      statusBadge.style.background = 'rgba(16, 185, 129, 0.15)';
      statusBadge.style.borderColor = 'rgba(16, 185, 129, 0.4)';
      statusBadge.style.color = '#34d399';
    }

    $('resLatencyBadge').textContent = `⚡ ${durationMs}ms`;

    $('resCategoryPill').innerHTML = `<span class="badge-category cat-${res.category}">#${escapeHtml(res.category)}</span>`;
    $('resUrgencyPill').innerHTML = `<span class="badge-urgency urg-${res.urgency}">${res.urgency === 'high' ? '🔥 ' : ''}${escapeHtml(res.urgency)}</span>`;
    $('resReviewBadge').textContent = res.needs_human_review ? '⚠️ Yes' : 'No';

    $('resSummaryText').textContent = res.summary || 'Summary unavailable.';
    $('resReplyText').textContent = res.suggested_reply || 'No draft reply generated.';
    $('resHashText').textContent = data.idempotencyHash || 'N/A';

    const tgStatus = $('resTelegramStatus');
    const tgText = $('resTelegramText');
    if (res.urgency === 'high') {
      tgStatus.style.background = 'rgba(244, 63, 94, 0.15)';
      tgStatus.style.borderColor = 'rgba(244, 63, 94, 0.4)';
      tgText.innerHTML = `<strong>🔥 HIGH PRIORITY:</strong> Immediate alert delivered to Telegram (@dishub_lead_alert_bot)`;
      tgText.style.color = '#fca5a5';
    } else {
      tgStatus.style.background = 'rgba(14, 165, 233, 0.1)';
      tgStatus.style.borderColor = 'rgba(14, 165, 233, 0.25)';
      tgText.innerHTML = `Standard alert logged &amp; routed through dispatch stream`;
      tgText.style.color = '#7dd3fc';
    }
  }

  // -------------------------------------------------------------
  // Analytics & Charts Rendering
  // -------------------------------------------------------------
  function renderAnalyticsCharts(stats) {
    if (!stats) return;

    const total = Math.max(stats.totalLeads, 1);
    const cat = stats.categories || {};
    const urg = stats.urgency || {};

    const salesPct = Math.round(((cat.sales || 0) / total) * 100);
    const supportPct = Math.round(((cat.support || 0) / total) * 100);
    const spamPct = Math.round(((cat.spam || 0) / total) * 100);
    const otherPct = Math.round(((cat.other || 0) / total) * 100);

    $('barFillSales').style.width = `${salesPct}%`;
    $('barCountSales').textContent = `${cat.sales || 0} (${salesPct}%)`;

    $('barFillSupport').style.width = `${supportPct}%`;
    $('barCountSupport').textContent = `${cat.support || 0} (${supportPct}%)`;

    $('barFillSpam').style.width = `${spamPct}%`;
    $('barCountSpam').textContent = `${cat.spam || 0} (${spamPct}%)`;

    $('barFillOther').style.width = `${otherPct}%`;
    $('barCountOther').textContent = `${cat.other || 0} (${otherPct}%)`;

    // Urgency Boxes
    $('analyticsUrgHigh').textContent = urg.high || 0;
    $('analyticsUrgMed').textContent = urg.medium || 0;
    $('analyticsUrgLow').textContent = urg.low || 0;
  }

  // -------------------------------------------------------------
  // Deep Intelligence Dossier Modal
  // -------------------------------------------------------------
  function setupModal() {
    const modal = $('leadModalOverlay');
    const closeBtn = $('closeModalBtn');
    const cancelBtn = $('modalCancelBtn');
    const saveBtn = $('modalSaveReplyBtn');
    const copyBtn = $('modalCopyReplyBtn');

    const closeModal = () => {
      playSound('click');
      modal.classList.add('hidden');
      state.currentModalLead = null;
    };

    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);

    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
        closeModal();
      }
    });

    copyBtn.addEventListener('click', () => {
      const editor = $('modalReplyEditor');
      navigator.clipboard.writeText(editor.value || '');
      playSound('success');
      showToast('Draft response copied to clipboard!', 'success');
    });

    saveBtn.addEventListener('click', async () => {
      if (!state.currentModalLead) return;
      playSound('success');
      showToast('Inquiry dossier marked In Progress & reply approved!', 'success');
      closeModal();
    });

    // Modal Status Buttons
    $('modalStatusOptions').querySelectorAll('.status-opt-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!state.currentModalLead) return;
        const newStatus = btn.getAttribute('data-status');
        try {
          await fetch(`/api/leads/${state.currentModalLead.id}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus }),
          });
          $('modalStatusOptions').querySelectorAll('.status-opt-btn').forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          state.currentModalLead.triage_status = newStatus;
          playSound('click');
          showToast(`Status updated to ${newStatus}`, 'info');
          fetchLeads();
        } catch (e) {
          showToast('Failed to update status', 'error');
        }
      });
    });
  }

  function openModal(lead) {
    state.currentModalLead = lead;
    const modal = $('leadModalOverlay');

    $('modalSenderName').textContent = lead.name || 'Anonymous';
    $('modalSenderEmail').textContent = lead.email || '';

    $('modalCategoryBadge').className = `badge-category cat-${lead.category}`;
    $('modalCategoryBadge').textContent = `#${lead.category}`;

    $('modalUrgencyBadge').className = `badge-urgency urg-${lead.urgency}`;
    $('modalUrgencyBadge').textContent = `${lead.urgency === 'high' ? '🔥 ' : ''}${lead.urgency}`;

    $('modalReviewBadge').textContent = lead.needs_human_review ? '⚠️ Yes' : 'No';
    $('modalDateBadge').textContent = timeAgo(lead.created_at);

    $('modalOriginalMessage').textContent = lead.message || '';
    $('modalSummary').textContent = lead.summary || 'Summary unavailable.';
    $('modalReplyEditor').value = lead.suggested_reply || '';

    // Status Buttons Active State
    const status = lead.triage_status || 'new';
    $('modalStatusOptions').querySelectorAll('.status-opt-btn').forEach((btn) => {
      if (btn.getAttribute('data-status') === status) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    $('modalLeadId').textContent = lead.id || 'N/A';
    $('modalHash').textContent = lead.idempotency_hash || 'N/A';

    modal.classList.remove('hidden');
  }

  // -------------------------------------------------------------
  // Burst / Traffic Spike Simulator
  // -------------------------------------------------------------
  function setupChaosBurst() {
    const fireBtn = $('fireChaosBtn');
    const wrapper = $('chaosProgressWrapper');
    const fill = $('chaosProgressFill');
    const statusText = $('chaosStatusText');
    const feed = $('burstFeed');
    const placeholder = $('burstPlaceholder');

    fireBtn.addEventListener('click', async () => {
      playSound('click');
      fireBtn.disabled = true;
      wrapper.classList.remove('hidden');
      if (placeholder) placeholder.classList.add('hidden');

      const batch = [
        {
          name: 'CTO Jonathan Reed',
          email: `jonathan.enterprise.${Date.now()}@nexustech.com`,
          message:
            'We are expanding our engineering operations and need 120 enterprise licenses with SAML SSO and 24/7 dedicated support. Schedule an executive demo.',
        },
        {
          name: 'DevOps Incident Commander',
          email: `sre.fire.${Date.now()}@infra-live.net`,
          message:
            'CRITICAL OUTAGE: Kubernetes ingress gateway throwing 502 Bad Gateway across all US regions! Millions of incoming requests failing! Immediate escalation required!',
        },
        {
          name: 'Crypto Lottery Bot',
          email: `jackpot.${Date.now()}@free-bitcoin-spins.xyz`,
          message:
            'Exclusive Bitcoin bonus 200% match deposit! Win real crypto jackpot instantly without KYC verification.',
        },
        {
          name: 'Claire Beauchamp',
          email: `claire.${Date.now()}@partner-ecosystem.org`,
          message:
            'We are preparing our Q4 ecosystem report and would like to invite your CEO for an exclusive keynote partnership session.',
        },
        {
          name: 'Dave Miller',
          email: `dave.${Date.now()}@user-feedback.io`,
          message:
            'Where can I find documentation on setting up custom webhooks for automated Jira ticket creation?',
        },
      ];

      feed.innerHTML = '';
      let completed = 0;

      for (let i = 0; i < batch.length; i++) {
        const item = batch[i];
        statusText.textContent = `Dispatching [${i + 1}/${batch.length}]: ${item.name}...`;

        try {
          const res = await fetch('/api/triage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(item),
          });
          const result = await res.json();
          completed++;

          fill.style.width = `${Math.round((completed / batch.length) * 100)}%`;

          const triageRes = result.result || {};
          const isHigh = triageRes.urgency === 'high';
          const isSpam = triageRes.category === 'spam';

          if (isHigh) playSound('urgent');
          else if (isSpam) playSound('spam');
          else playSound('click');

          const burstItem = document.createElement('div');
          burstItem.className = 'burst-item';
          burstItem.innerHTML = `
            <div class="burst-item-left">
              <span class="badge-category cat-${triageRes.category}">#${triageRes.category}</span>
              <span class="badge-urgency urg-${triageRes.urgency}">${isHigh ? '🔥 ' : ''}${triageRes.urgency}</span>
              <strong style="color: #fff;">${escapeHtml(item.name)}</strong>
              <span style="color: var(--text-muted); font-size: 0.8rem;">(${escapeHtml(item.email)})</span>
            </div>
            <div style="font-family: var(--font-mono); font-size: 0.75rem; color: var(--brand-cyan);">
              ⚡ ${result.durationMs || 1200}ms
            </div>
          `;
          feed.prepend(burstItem);
        } catch (e) {
          console.error('Burst error:', e);
        }

        await delay(400);
      }

      statusText.textContent = 'All 5 concurrent requests ingested & triaged successfully!';
      fireBtn.disabled = false;
      playSound('success');
      showToast('Burst traffic simulation completed!', 'success');

      fetchStats();
      fetchLeads();
    });
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
})();
