'use strict';
/*
 * Public visitor Q&A assistant endpoint.
 *
 * POST /.netlify/functions/visitor-assistant  { "question": "..." }
 * -> { answer, sources, mode }
 *
 * Answers come only from the website knowledge base
 * (_shared/visitor-knowledge.cjs) via _shared/visitor-assistant-core.cjs.
 * No database, no logging of question text, per-IP rate limiting in the
 * core. Works without any AI credentials (retrieval + composed answers);
 * if VISITOR_ASSISTANT_API_KEY / VISITOR_ASSISTANT_MODEL (or the platform's
 * OPENAI_API_KEY / OPENAI_MODEL) are configured, retrieved entries may be
 * phrased by the model under strict guardrails.
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
    const result = await assistant.ask(body.question, clientIp(event));
    return json(result.status, result.body);
  } catch (error) {
    return json(Number(error.statusCode || 500), {
      error: 'The assistant is unavailable right now. Please call (888) 639-5766 and the team will help.'
    });
  }
};
