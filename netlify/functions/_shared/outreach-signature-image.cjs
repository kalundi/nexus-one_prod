// Inline signature card for the emergency-plan outreach round.
// Source: nexus-email-signature-fletcher-kalundi.png (1189x663 PNG, 401,745 bytes;
// SHA-256 a216a35c32308db5c4a01e317bf0f029cb14dca1363801ca65f655d5a98da33f),
// the owner's approved graphic signature card. The card is carried as base64 text
// in the data file assets/nexus-signature-card.b64 next to this module and read
// at runtime; it is sent as a Postmark inline (cid:) attachment because the
// repository has no hosted copy of the card to link to, and the GitHub snapshot
// publishing flow cannot carry binary files. Referenced from outreach-content.cjs
// as cid:nexus-signature-card; outreach-automation.cjs attaches it on round sends.
//
// Why the data no longer lives in this file: PR #164 originally inlined the
// base64 as a 4,463-term 'a' + 'b' + ... string concatenation here. Netlify's
// Functions bundling (@vercel/nft static-eval) recursively walks the left spine
// of that expression tree and overflows the call stack (RangeError: Maximum
// call stack size exceeded), which failed every Netlify deploy on 2026-11-16.
// A non-JS data file is never expression-evaluated by the tracer. The asset is
// wired into the bundles via included_files in netlify.toml for every function
// that loads outreach-automation (api, outreach-campaign-daily,
// outreach-round-daily, outreach-wednesday-daily).
const fs=require('fs');
const path=require('path');
const ASSET='nexus-signature-card.b64';
const CANDIDATES=[
 // Repository layout: this module sits in _shared/, the asset in _shared/assets/.
 path.join(__dirname,'assets',ASSET),
 // Bundled layout: the module is inlined into the function entry file, whose
 // directory is the functions directory; included_files preserve paths relative
 // to it (the same pattern as _private-documents for the api function).
 path.join(__dirname,'_shared','assets',ASSET),
 // Zip-root layout: included_files preserved relative to the project root.
 path.join(__dirname,'netlify','functions','_shared','assets',ASSET),
 path.join(process.cwd(),'netlify','functions','_shared','assets',ASSET)
];
function loadSignatureCardBase64(){
 for(const candidate of CANDIDATES){
  try{return fs.readFileSync(candidate,'utf8').replace(/\s+/g,'');}catch{/* try the next layout */}
 }
 throw new Error(`Nexus signature card asset (${ASSET}) not found; tried: ${CANDIDATES.join(', ')}`);
}
const SIGNATURE_CARD_BASE64=loadSignatureCardBase64();
module.exports={SIGNATURE_CARD_BASE64};
