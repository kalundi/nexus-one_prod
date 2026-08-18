const { runSocialPublish } = require('../netlify/functions/_shared/social-engine.cjs');

(async () => {
  const report = await runSocialPublish({
    channels: ['facebook', 'instagram', 'bluesky', 'x', 'youtube'],
    dryRun: false,
    forcedPostId: 'shorts-hook-001'
  });
  console.log(JSON.stringify(report, null, 2));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
