const { listMessages, graphFetch, requireGraphConfig } = require('../netlify/functions/_shared/ms-graph.cjs');

const clean = (v) => String(v || '').trim();
const enc = (v) => encodeURIComponent(String(v || '').replace(/^\//, ''));

async function run() {
  const since = process.argv[2] || '2026-08-07T18:00:00Z';
  const cfg = requireGraphConfig();
  const page = await listMessages({
    since,
    folder: 'Inbox',
    top: 10,
    filter: `receivedDateTime ge ${since} and contains(subject,'confirmation')`,
  });

  for (const m of page.value || []) {
    const messageId = m.id;
    const basePath = `/users/${enc(cfg.mailbox)}/messages/${enc(messageId)}`;
    const expanded = await graphFetch(`${basePath}?$select=id,subject,hasAttachments,internetMessageId,receivedDateTime&$expand=attachments($select=id,name,contentType,size,isInline,@odata.type,contentId)`).catch(() => null);
    const atts = Array.isArray(expanded?.attachments) ? expanded.attachments : [];

    const mimeText = await graphFetch(`${basePath}/$value`, { headers: { accept: 'message/rfc822' } }).catch(() => '');
    const mimeString = typeof mimeText === 'string' ? mimeText : '';
    const hasDriverConfirmationInMime = /driver\s*confirmation/i.test(mimeString);
    const hasPdfFilenameInMime = /filename\s*=\s*"?[^"]*\.pdf"?/i.test(mimeString);

    console.log(JSON.stringify({
      subject: clean(m.subject),
      id: messageId,
      hasAttachments: Boolean(m.hasAttachments),
      expandedAttachmentCount: atts.length,
      expandedAttachmentNames: atts.map((a) => ({ name: a?.name || '', type: a?.['@odata.type'] || '', contentType: a?.contentType || '', size: a?.size || 0, isInline: !!a?.isInline })),
      mimeLength: mimeString.length,
      mimeHasDriverConfirmation: hasDriverConfirmationInMime,
      mimeHasPdfFilename: hasPdfFilenameInMime,
    }));
  }
}

run().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});
