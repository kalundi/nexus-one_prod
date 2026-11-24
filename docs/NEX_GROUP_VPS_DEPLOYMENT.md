# Nex Group Intelligence — Hostinger VPS deployment preparation

**Current state:** GitHub code only. The WhatsApp Business account is **not connected**.
These steps are for an administrator operating the user's own VPS. Do not enable
the service merely because this document or its pull request has been merged.

## Platform and policy risks

This is an **unofficial WhatsApp Web automation client** using the CURRENT
customer-facing Nexus WhatsApp Business number, as requested by its owner.
WhatsApp's Business App terms prohibit unauthorized automated clients and
data extraction; linking the active account could cause suspension or impact
customer communication. No official entitlement or compatibility is implied.
Prefer official APIs for critical operations.

A WhatsApp linked-browser session can locally synchronize **all chats**,
even though the Nexus application accepts metadata from approved groups only.
The account may contain patient-related and customer messages in other chats.
Keep the VPS session protected; use a documented consent/notice process and
a response plan if sensitive data is discovered. Do not process or retain
patient messages through this pilot.

No AI-generated responses, WhatsApp sending, historic import, or automatic
task assignment is included. A green Netlify preview does not prove that
WhatsApp linking will succeed or remain supported.

## What we can verify before pairing

- Inspect `tools/nex-whatsapp-group-bridge/deploy/nex-wa-bridge.service`.
- Inspect `tools/nex-whatsapp-group-bridge/deploy/bridge.env.example`.
- Confirm the service uses `LoadCredential` and contains no literal phone number
  or HMAC key in `EnvironmentFile`.
- Run the non-invasive `deploy/preflight.cjs` once an isolated service
  account and private environment exist.
- Run `node --test tests/nex-wa-vps-readiness.test.cjs` from the repo root.
- Confirm that `NEX_GROUP_BRIDGE_ENABLED=false`,
  `NEX_GROUP_DISCOVERY_MODE=false` and
  `NEX_GROUP_INGEST_ENABLED` is absent/false in Netlify.
- Keep SQL migration `999.006_nex_group_signals.sql` and Netlify function
  configuration separate from the VPS setup until reviewed.

## 1. Hostinger administrator: inspect the server

Connect using Hostinger's normal SSH administration interface. Do not send
SSH credentials, password, private keys, screenshots containing secrets or
session QR codes to ChatGPT.

Run these harmless checks first:

```bash
uname -a
cat /etc/os-release
node --version
command -v node
id
systemctl --version
df -h /var
```

The server needs Node.js 20.20+ at a system-wide executable path, systemd,
a persistent filesystem, a Chromium/Puppeteer-compatible Linux OS, restricted
remote access, updated security packages and sufficient disk space. For a
Headless Chromium installation, see the project's documented OS library
requirements: https://wwebjs.dev/guide/installation.

If Node is only in another user's nvm home directory, do **not** point the
service at that path; install a system-wide supported Node binary instead.

## 2. Stage isolated service storage, with monitoring OFF

Only after approval of the active-business-number risk, an administrator can
prepare the non-root service account and secure directories:

```bash
sudo useradd --system --home-dir /var/lib/nex-wa --shell /usr/sbin/nologin nex-wa
sudo install -d -o nex-wa -g nex-wa -m 0700 /var/lib/nex-wa /var/lib/nex-wa/session
sudo install -d -o nex-wa -g nex-wa -m 0700 /var/lib/nex-wa/.cache /var/lib/nex-wa/.cache/puppeteer
sudo install -d -o root -g root -m 0700 /etc/nex-wa
sudo install -d -o root -g root -m 0755 /opt/nex-wa
```

The useradd command is only needed if `nex-wa` does not already exist.
The account must not run as root. Protect the VPS backup destination: the
browser profile may include private chat data even when the app-level
allowlist is narrow. Avoid syncing browser profiles to cloud backups or
shared folders without explicit security review.

After this PR is merged and code reviewed, a trusted operator can clone the
Nexus GitHub repo as an ordinary SSH account, install application dependencies
*without root*, then copy the reviewed bridge directory into `/opt/nex-wa`.
Do not use `npm install` as root or introduce `--no-sandbox` as a workaround.
Use only the reviewed pinned packages and generate/review the dependency lock
file before production use.

Keep the app directory root-owned and read-only for the runtime. Ensure the
Puppeteer Chromium binary is installed under the service user's private cache
path (`/var/lib/nex-wa/.cache/puppeteer`), not another user's home directory.

## 3. Stage a private environment file (still OFF)

An administrator may copy `deploy/bridge.env.example` to
`/etc/nex-wa/bridge.env`. It must be root-owned and mode `0600`.

It is intentionally set to:
```dotenv
NEX_GROUP_ACCOUNT_MODE=existing_business
NEX_GROUP_BRIDGE_ENABLED=false
NEX_GROUP_DISCOVERY_MODE=false
NEX_GROUP_NOTICE_CONFIRMED=false
```

**Do not place the phone number or HMAC signing key in this environment
file.** The systemd service supplies both as protected credentials:
- `LoadCredential=nex-expected-number:/etc/nex-wa/expected-number`
- `LoadCredential=nex-shared-secret:/etc/nex-wa/shared-secret`

The expected-number file contains the current Nexus account number in E.164
international format. The secret file contains a separate locally generated
random signing key (32+ characters). Both files must be root-owned with mode
0600, located outside the repository. For example, an authorized administrator
can prepare empty protected files and generate the random key without printing
it:

```bash
sudo install -m 0600 -o root -g root /dev/null /etc/nex-wa/shared-secret
sudo install -m 0600 -o root -g root /dev/null /etc/nex-wa/expected-number
openssl rand -hex 32 | sudo tee /etc/nex-wa/shared-secret >/dev/null
```

Enter the expected E.164 business number through a private shell prompt into
`/etc/nex-wa/expected-number` without printing it to console or shell history.
Do not copy private numbers or keys into this chat, a public issue, source
code, support tickets or logs.

The standalone `deploy/credentials.cjs` loader reads these files only via
the systemd-provided `CREDENTIALS_DIRECTORY`. It holds values in a private
runtime object, not `process.env`. The Netlify endpoint will eventually need
the same signing key entered through its own protected secret settings; do
not enable that endpoint during VPS preparation.

The business owner must explicitly review and set the three existing-account
authorization/risk acknowledgments **before any QR scan**:
`NEX_GROUP_EXISTING_BUSINESS_OWNER_AUTHORIZED`,
`NEX_GROUP_EXISTING_BUSINESS_RISK_ACKNOWLEDGED`,
and `NEX_GROUP_OTHER_CHAT_SYNC_RISK_ACKNOWLEDGED`.

Do not set these to true automatically. The account owner's request to use
the existing number is **not** agreement to every security and continuity
risk.

## 4. Test readiness before connecting anything

When an isolated service account and reviewed environment exist, run the
preflight script as that **non-root** user, with the protected environment
and two `LoadCredential` files supplied through a privileged systemd service
launcher. The supplied unit has an `ExecStartPre` that refuses to start
monitoring unless all active mode safety switches are present.

For any subsequent *interactive pairing* step, a responsible operator must
use a transient `systemd-run --pty` session that applies the same User,
EnvironmentFile, and LoadCredential settings. This keeps sensitive values out
of process command arguments and requires manual QR scanning in an authorized
terminal. Do not run discovery while the device is connected to an untrusted
server or with unauthorized groups.

Do NOT `systemctl enable --now nex-wa-bridge` at this stage. Installing the
unit file is not the same thing as activating the WhatsApp linked device.

## 5. Live pairing: separate owner-controlled step, NOT performed here

Only after independent policy/privacy review, account continuity acceptance,
group-member notice, VPS hardening, signed endpoint tests, and allowlists:

1. Back up the current WhatsApp Business iPhone conversations.
2. Put the bridge in explicitly approved interactive **discovery mode**.
   The QR must appear only in an authorized SSH terminal, not in logs/screenshots.
3. On the current iPhone, open **WhatsApp Business → Settings → Linked Devices
   → Link a Device**. Scan the QR in the trusted terminal.
4. Confirm the bridge verifies the exact linked business phone number. If it
   does not match, stop and unlink the unexpected device.
5. Select only business-only groups whose participants were informed.
   Keep group IDs in the private VPS allowlist and HMAC digests in the
   protected Netlify allowlist.
6. Stop discovery, audit the browser profile, turn on ingestion only with
   approved configuration, and run controlled nonpatient test messages.
7. Assess account health, access, server resource use, event classification
   accuracy, retention and kill switch before an always-on service.

**Stop immediately** if WhatsApp flags the account or the device synchronizes
data beyond the privacy plan. Unlinking the device on iPhone terminates the
WhatsApp session, but local browser data on the VPS still requires secure
removal. Never purge profiles without confirming backup/incident obligations.

## Operational controls

The systemd template runs as `nex-wa`, denies privilege escalation, restricts
filesystem writes to its dedicated profile tree, loads secrets through protected
systemd credentials, and fails preflight without explicit, non-default
monitoring enablement. It does not manage or purchase
Hostinger services. It does not add your phone, create WhatsApp groups, or
handle any QR codes.

The `nex-group-retention` Netlify job deletes received metadata older than
30 days once its migration and credentials are installed. The app-level
allowlist does **not** restrict what WhatsApp Web itself synchronizes locally.

For the existing design and server-side privacy controls, see
`docs/NEX_GROUP_LINKED_DEVICE.md`.
