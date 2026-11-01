'use strict';
/*
 * Public visitor Q&A assistant endpoint.
 *
 * POST /.netlify/functions/visitor-assistant
 *   { "question": "...",
 *     "state":   { "lastEstimate": { "inputs": {...}, "result": {...} } },
 *     "history": [{ "role": "user" | "assistant", "text": "..." }] }
 * -> { answer, sources, mode, state, estimate?, followup? }
 *
 * Answers come only from the website knowledge base
 * (_shared/visitor-knowledge.cjs) via _shared/visitor-assistant-core.cjs.
 * The optional state/history are the widget's page-session memory of
 * the conversation (the last rough estimate and recent turns), used
 * to answer follow-ups about the same trip; they are sanitized in
 * _shared/visitor-conversation.cjs, used for this request only, and
 * never logged or stored. No database.
 *
 * Works without any AI credentials (deterministic follow-ups +
 * retrieval + composed answers); if VISITOR_ASSISTANT_API_KEY /
 * VISITOR_ASSISTANT_MODEL (or the platform's OPENAI_API_KEY /
 * OPENAI_MODEL) are configured, the model may phrase replies and
 * re-price the stored trip through the estimate tool, under strict
 * guardrails (see the core).
 */

const { json, parseBody } = require('./_shared/http.cjs');
const { createAssistant } = require('./_shared/visitor-assistant-core.cjs');

const assistant = createAssistant({});

function clientIp(event) {
  const headers = event.headers || {};
  const forwarded = headers['x-nf-client-connection-ip'] || headers['x-forwarded-for'] || '';
  return String(forwarded).split(',')[0].trim() || 'unknown';
}

exports.handler = async (event) => {
  try {
    if (String(event.httpMethod || 'GET').toUpperCase() !== 'POST') {
      return json(405, { error: 'Method not allowed' });
    }
    const body = parseBody(event);
    const result = await assistant.ask(body.question, clientIp(event), { state: body.state, history: body.history });
    return json(result.status, result.body);
  } catch (error) {
    return json(Number(error.statusCode || 500), {
      error: 'The assistant is unavailable right now. Please call (888) 639-5766 and the team will help.'
    });
  }
};
