// Yeh chat.service.js module ka kaam aur exports handle karta hai.
// Ismein application ka relevant runtime logic safely maintain hota hai.
/**
 * AI Assistant & Decision Recommendation Engine for Datalytics
 *
 * `/api/chat/recommendations` (used by the Decision Making and Reports
 * modules on the frontend) previously ignored the request body entirely
 * and always returned the same hardcoded object, which is why:
 *  - Decision Making always showed the same generic "decisions" no matter
 *    what dataset/prompt was sent.
 *  - Reports generation failed to parse (the frontend expects a
 *    `generated_response.content` string it can split on "=== TITLE ===",
 *    but the old handler returned a plain object with no `content` field
 *    at all, so `normalizeReportPayload` always produced 0 sections).
 *
 * This now actually calls the configured LLM (via ai.service.js) using the
 * prompt + mode the frontend sends, and returns `{ generated_response: { content } }`
 * as the frontend expects. If no AI provider is configured (no GROQ_API_KEY /
 * OPEN_AI_KEY) or the call fails, it falls back to a clearly-labeled static
 * response in the correct shape so the UI still completes instead of breaking.
 */
const { askAi } = require('./ai.service');

/**
 * Builds a rich, grounded context block from the session's real dataset
 * and model results — feature stats, model metrics, feature importances —
 * instead of just row/column counts. This is what makes Decision Making
 * and Reports "deep": the LLM reasons over actual numbers from the
 * dataset/trained model, not just column names.
 */
function buildDatasetContext(session) {
  const rows = session?.rows || [];
  const columns = session?.dataset_columns || (rows[0] ? Object.keys(rows[0]) : []);
  const meta = session?.preprocess_meta || {};
  const modelResults = session?.model_results || null;

  return {
    rowCount: rows.length,
    columns,
    taskType: meta?.task_type || session?.task_type || null,
    targetCol: meta?.target_col || null,
    bestModel: session?.best_model_name || null,
    featureStats: meta?.feature_stats || null,
    numericFeats: meta?.numeric_feats || [],
    categoricalFeats: meta?.label_encoded_feats ? Object.keys(meta.label_encoded_feats) : [],
    bestMetrics: modelResults?.best_metrics || null,
    primaryMetric: modelResults?.primary_metric || null,
    featureImportance: modelResults?.feature_importance || [],
    modelSource: modelResults?.source || 'simulation',
    sampleRows: rows.slice(0, 5),
  };
}

/** Renders buildDatasetContext()'s output into a compact text block for
 * the system prompt — real numbers the model can reason over. */
function formatContextForPrompt(context) {
  const lines = [];
  lines.push(`Dataset: ${context.rowCount} rows, ${context.columns.length} columns (${context.columns.join(', ') || 'unknown'}).`);
  if (context.targetCol) {
    lines.push(`Target column: "${context.targetCol}" | Task type: ${context.taskType || 'unknown'}.`);
  }
  if (context.featureStats && Object.keys(context.featureStats).length) {
    const statLines = Object.entries(context.featureStats)
      .slice(0, 10)
      .map(([col, s]) => `  - ${col}: mean=${s.mean}, std=${s.std}, min=${s.min}, max=${s.max}, median=${s.median}`);
    lines.push('Numeric feature statistics:');
    lines.push(...statLines);
  }
  if (context.categoricalFeats.length) {
    lines.push(`Categorical features: ${context.categoricalFeats.join(', ')}.`);
  }
  if (context.bestModel) {
    lines.push(`Best trained model: ${context.bestModel} (source: ${context.modelSource}).`);
  }
  if (context.bestMetrics) {
    const metricStr = Object.entries(context.bestMetrics)
      .filter(([k]) => k !== 'Model')
      .map(([k, v]) => `${k}=${v}`)
      .join(', ');
    lines.push(`Best model metrics: ${metricStr}.`);
  }
  if (context.featureImportance?.length) {
    const topFeatures = context.featureImportance
      .slice(0, 5)
      .map((f) => `${f.feature}: ${f.importance}`)
      .join(', ');
    lines.push(`Top feature importances: ${topFeatures}.`);
  }
  if (context.sampleRows?.length) {
    lines.push(`Sample rows (first ${context.sampleRows.length}): ${JSON.stringify(context.sampleRows)}`);
  }
  return lines.join('\n');
}

function buildStaticDecisions(context) {
  const columns = context.columns || [];
  return {
    top_decisions: [
      {
        decision: `Optimize feature engineering on key signals (${columns.slice(0, 3).join(', ') || 'Primary Attributes'})`,
        reason: 'Feature variance and correlation indicate high predictive contribution.',
        expected_outcome: 'Improve predictive accuracy and reduce model variance by 12-18%.',
        priority: 'High',
      },
      {
        decision: 'Scale deployment of the best-performing model to production inference',
        reason: 'The strongest cross-validated model demonstrated the highest stability and score.',
        expected_outcome: 'Lower inference error rate and robust generalization across unseen data.',
        priority: 'High',
      },
      {
        decision: 'Implement automated data drift monitoring for categorical distributions',
        reason: 'Categorical distribution shifts could degrade classification boundaries over time.',
        expected_outcome: 'Real-time alerting before model degradation impacts downstream decisions.',
        priority: 'Medium',
      },
    ],
    inventory_decisions: [
      {
        category: 'Increase',
        entities: `${columns[0] || 'Top Features'} Segments`,
        action: 'Scale allocation and monitor customer demand velocity.',
      },
      {
        category: 'Maintain',
        entities: `${columns[1] || 'Secondary'} Baseline`,
        action: 'Keep standard monitoring intervals.',
      },
    ],
    growth_opportunities: [
      { opportunity: 'Expand high-propensity segments identified by unsupervised clustering.' },
      { opportunity: 'Automate weekly retraining pipelines with incoming verified ground truth.' },
    ],
    losses_problems: [
      {
        problem: 'Outliers and missing values in secondary features causing variance.',
        fix: 'Apply robust scaling and median imputation on non-normal distributions.',
      },
    ],
    future_strategy: [
      {
        strategy: 'Continuous hyperparameter tuning via Bayesian Optimization.',
        preparation: 'Set up automated evaluation harness with rolling window validation.',
      },
    ],
    smart_actions: [
      { automation: 'Trigger automatic alert when model error exceeds threshold.' },
    ],
  };
}

/** Static fallback formatted as `=== SECTION ===` text, matching what the
 * Reports UI's normalizeReportPayload() expects to split on. Uses whatever
 * real stats are available on the session even without an AI provider, so
 * the fallback isn't purely generic. */
function buildStaticReportText(context) {
  const statLines = context.featureStats && Object.keys(context.featureStats).length
    ? Object.entries(context.featureStats)
        .slice(0, 8)
        .map(([col, s]) => `- ${col}: mean=${s.mean}, std=${s.std}, range=[${s.min}, ${s.max}]`)
        .join('\n')
    : 'No numeric feature statistics available yet — run Data Exploration first.';

  const metricsLine = context.bestMetrics
    ? Object.entries(context.bestMetrics).filter(([k]) => k !== 'Model').map(([k, v]) => `${k}=${v}`).join(', ')
    : null;

  return `=== DATASET OVERVIEW ===
Rows: ${context.rowCount}. Columns: ${context.columns.join(', ') || 'Not available'}.
(AI provider not configured — showing a static overview built from real dataset stats. Set GROQ_API_KEY or OPEN_AI_KEY in server/.env to enable full AI-generated deep reports.)

=== STATISTICAL DEEP-DIVE ===
${statLines}

=== MODEL / PREDICTION ===
Best model on record: ${context.bestModel || 'None yet — run Prediction first.'}${metricsLine ? `\nMetrics: ${metricsLine}` : ''}

=== RECOMMENDATIONS ===
Configure an AI provider to get tailored, data-driven recommendations here.

=== DECISION SUMMARY ===
Best model on record: ${context.bestModel || 'None yet — run Prediction first.'}
`;
}

/**
 * Core entry point used by POST /api/chat/recommendations.
 * `message` is the full prompt built by the frontend (DecisionMakingStep.jsx
 * / ReportDownload.jsx); `mode` is 'decision_making' or 'recommendation_insights'.
 *
 * The system prompt is built from buildDatasetContext()/formatContextForPrompt()
 * so the model reasons over real feature statistics, real trained-model
 * metrics, and real feature importances — not just column names — which is
 * what makes the generated decisions/reports specific to this dataset
 * instead of generic boilerplate.
 */
async function generateRecommendations(session, message, mode = 'recommendation_insights') {
  const context = buildDatasetContext(session);
  const contextBlock = formatContextForPrompt(context);

  const systemPrompt = `You are Datalytics' AI analytics engine, an expert data scientist and business analyst.
Ground every claim in the real dataset facts below — reference actual column names, actual statistics, and actual model metrics wherever relevant. Do not invent numbers that aren't implied by this context. Be specific and avoid generic filler.
Write in a formal, professional business-report register (executive/consulting tone) — precise, decisive, third-person analytical language. Avoid casual chatbot phrasing, hedging words, and exclamation marks.

REAL DATASET CONTEXT:
${contextBlock}

Follow the user's requested output format exactly.`;

  const userPrompt = message && String(message).trim()
    ? String(message)
    : 'Generate actionable recommendations based on the dataset context above.';

  try {
    const content = await askAi(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      // decision_making stays low-temperature for consistent, decisive
      // output. recommendation_insights (Reports) gets the largest token
      // budget — the End-to-End Report prompt asks for 11 in-depth
      // sections (including a Statistical Deep-Dive), which needs more
      // room than a single decision-JSON payload to avoid truncation.
      { temperature: mode === 'decision_making' ? 0.35 : 0.6, max_tokens: mode === 'decision_making' ? 3500 : 5000 },
    );
    return { generated_response: { content }, mode };
  } catch (err) {
    // Defensive fallback: never let a missing/failed AI provider break the
    // Decision Making or Reports flows — degrade to static content instead.
    console.warn('[generateRecommendations] AI call failed, using static fallback:', err.message);
    const content = mode === 'decision_making'
      ? JSON.stringify(buildStaticDecisions(context))
      : buildStaticReportText(context);
    return { generated_response: { content }, mode, aiUnavailable: true };
  }
}

async function processChatMessage(session, message = '', mode = 'chat', history = []) {
  const context = buildDatasetContext(session);
  const contextBlock = formatContextForPrompt(context);
  const rows = session?.rows || [];
  const cols = session?.dataset_columns || (rows[0] ? Object.keys(rows[0]) : []);
  const datasetName = session?.dataset_name || 'dataset.csv';

  const userQuery = String(message || '').trim();

  const systemPrompt = `You are Eighteen AI, the intelligent conversational data scientist for Datalytics.
You are helping the user explore, analyze, and understand their dataset.

ACTIVE DATASET INFO:
- Dataset Name: ${datasetName}
- Total Rows: ${context.rowCount || rows.length}
- Total Columns: ${context.columns.length || cols.length}
- Column Names: ${context.columns.join(', ') || cols.join(', ') || 'No columns available'}
${contextBlock ? `\nDATASET CONTEXT & METRICS:\n${contextBlock}` : ''}

INSTRUCTIONS:
1. Answer the user's questions clearly, accurately, and directly based on the dataset above.
2. If asked for exact numbers (like number of rows, number of columns, specific values, stats), provide the exact figures immediately.
3. Be professional, friendly, and structured. Use Markdown formatting, bullet points, and bold headers where appropriate.
4. If the user asks about ML modeling, data cleaning, or next steps, give actionable recommendations.`;

  const conversationMessages = [
    { role: 'system', content: systemPrompt },
  ];

  if (Array.isArray(history) && history.length > 0) {
    for (const h of history.slice(-6)) {
      if (h.role && h.content) {
        conversationMessages.push({ role: h.role, content: String(h.content) });
      }
    }
  }

  conversationMessages.push({ role: 'user', content: userQuery || 'Hello, summarize my dataset.' });

  try {
    const aiReply = await askAi(conversationMessages, {
      temperature: 0.5,
      max_tokens: 1500,
    });

    return {
      reply: aiReply,
      mode,
      timestamp: new Date().toISOString(),
      source: 'ai',
    };
  } catch (err) {
    console.warn('[processChatMessage] AI call failed or unavailable, using smart data-driven fallback:', err.message);

    // Smart dataset fallback answering based on real session numbers
    const lowerQuery = userQuery.toLowerCase();
    let smartFallback = '';

    if (lowerQuery.includes('column') || lowerQuery.includes('coumk') || lowerQuery.includes('feature')) {
      smartFallback = `Your dataset **${datasetName}** has **${cols.length} columns**:\n\n` +
        cols.map((c, i) => `${i + 1}. \`${c}\``).join('\n') +
        `\n\nTotal columns: **${cols.length}** | Total rows: **${rows.length}**`;
    } else if (lowerQuery.includes('row') || lowerQuery.includes('count') || lowerQuery.includes('size') || lowerQuery.includes('record')) {
      smartFallback = `Your dataset **${datasetName}** has **${rows.length.toLocaleString()} rows** and **${cols.length} columns**.`;
    } else {
      const colList = cols.slice(0, 8).map(c => `\`${c}\``).join(', ');
      smartFallback = `### 📊 Dataset Overview: **${datasetName}**\n\n` +
        `• **Total Rows:** ${rows.length.toLocaleString()}\n` +
        `• **Total Columns:** ${cols.length} (${colList}${cols.length > 8 ? '...' : ''})\n` +
        (context.bestModel ? `• **Best ML Model:** ${context.bestModel}\n` : '') +
        `\n**Action Items:**\n` +
        `• You can ask specific questions about any column, mean, median, distributions, or correlation.\n` +
        `• Proceed to Data Exploration or Predictive ML tabs for automated model training and visual charts.`;
    }

    return {
      reply: smartFallback,
      mode,
      timestamp: new Date().toISOString(),
      source: 'data_fallback',
      aiUnavailable: true,
    };
  }
}

module.exports = {
  generateRecommendations,
  processChatMessage,
};
