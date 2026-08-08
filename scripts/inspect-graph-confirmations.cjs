const pdfParse = require('pdf-parse');
const {
  listMessages,
  getMessageAttachments,
  toBrokerAttachment,
  isFileAttachment,
  requireGraphConfig,
} = require('../netlify/functions/_shared/ms-graph.cjs');

function clean(value, max = 50000) {
  return String(value || '').trim().slice(0, max);
}

async function decodeAttachmentText(attachment) {
  const filename = clean(attachment.filename || '', 180).toLowerCase();
  const type = clean(attachment.type || '', 160).toLowerCase();
  const isPdf = type.includes('pdf') || filename.endsWith('.pdf');
  if (isPdf) {
    try {
      const buffer = Buffer.from(String(attachment.content || ''), 'base64');
      const parsed = await pdfParse(buffer);
      return clean(parsed?.text || '', 50000);
    } catch {
      return '';
    }
  }
  const isTextual =
    type.startsWith('text/') ||
    type.includes('json') ||
    type.includes('xml') ||
    type.includes('csv') ||
    filename.endsWith('.txt') ||
    filename.endsWith('.csv') ||
    filename.endsWith('.json') ||
    filename.endsWith('.xml');
  if (!isTextual) return '';
  try {
    const decoded = Buffer.from(String(attachment.content || ''), 'base64').toString('utf8');
    if (decoded && decoded.trim()) return decoded;
  } catch {}
  return clean(attachment.content || '', 20000);
}

async function run() {
  requireGraphConfig();
  const since = process.argv[2] || '2026-07-31T00:00:00Z';
  const page = await listMessages({
    since,
    folder: 'Inbox',
    top: 25,
    filter: `receivedDateTime ge ${since} and contains(subject,'confirmation') and hasAttachments eq true`,
  });

  const rows = [];
  for (const message of page.value || []) {
    const attachmentsRaw = await getMessageAttachments({ messageId: message.id, folder: 'Inbox' }).catch(() => []);
    const attachments = attachmentsRaw.filter(isFileAttachment).map(toBrokerAttachment).filter((a) => a.content);
    const decoded = [];
    for (const att of attachments) {
      const text = await decodeAttachmentText(att);
      decoded.push({
        filename: att.filename,
        type: att.type,
        textLen: String(text || '').length,
        textPreview: clean(String(text || '').replace(/\s+/g, ' '), 450),
      });
    }
    const bodyHtml = String(message.body?.content || '');
    const bodyText = clean(bodyHtml.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' '), 50000);
    rows.push({
      subject: message.subject,
      from: message.from?.emailAddress?.address || '',
      receivedDateTime: message.receivedDateTime,
      bodyPreview: clean(message.bodyPreview || '', 220),
      bodyTextLen: bodyText.length,
      bodyTextPreview: clean(bodyText, 450),
      bodyTextTail: clean(bodyText.slice(-450), 450),
      attachmentCount: attachments.length,
      attachmentRawCount: attachmentsRaw.length,
      attachmentRawTypes: attachmentsRaw.map((att) => ({
        type: String(att?.['@odata.type'] || ''),
        name: String(att?.name || ''),
        contentType: String(att?.contentType || ''),
        size: Number(att?.size || 0),
        hasContentBytes: Boolean(att?.contentBytes),
      })),
      attachments: decoded,
    });
  }

  console.log(JSON.stringify({ since, count: rows.length, rows }, null, 2));
}

run().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});
