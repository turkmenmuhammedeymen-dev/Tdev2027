# TdevKuantum Akademi

TdevKuantum is an educational web app with grade-based lesson browsing, topic explanations, topic-specific notes, video/resource search links, quiz practice, study plans, flashcards, revision logs and an optional AI tutor.

## Files

- `index.html` — student interface, country selector, lesson/topic view, video/resource links and chat display.
- `study.js` — study plans, personal notes, flashcards, revision records, mistake notebook and cloud-sync helpers.
- `back4app/main.js` — Back4App Cloud Code, account/verification workflows, email-provider diagnostics, user-scoped study data, quiz endpoints and optional AI tutor.
- `apps-script/Code.gs` — Google Apps Script mail service with a token-only health check.
- `back4app/schema-setup.js` — schema helper kept aligned with verification and study record classes.
- `terms.html` / `privacy.html` — usage and privacy drafts. These are not legal advice and must be checked against the real production configuration.

## Back4App Cloud Code deployment

1. Open the Back4App app's Cloud Code area, upload the latest `back4app/main.js` from this repository, and deploy it. A GitHub commit does **not** deploy Cloud Code automatically.
2. In Back4App Config, set `GOOGLE_SCRIPT_URL` to the deployed Google Apps Script Web App URL and `APPS_SCRIPT_TOKEN` to the secret token you generated. The optional Resend fallback uses `RESEND_API_KEY` and `EMAIL_FROM`.
3. Open `apps-script/Code.gs` in this repository and copy its complete contents into the matching Google Apps Script project's `Code.gs`. This version supports a token-only health check without sending an email.
4. In that Google Apps Script project, open **Project Settings → Script Properties** and set `APPS_SCRIPT_TOKEN`. Its value must match the Back4App Config value exactly. Never put the token in `index.html`, `study.js`, a public README, or any other public file.
5. Save the script, then open **Deploy → Manage deployments → Edit → New version → Deploy**. Keep the existing Web App URL in Back4App Config if you updated that deployment; if you created a new deployment URL, update `GOOGLE_SCRIPT_URL` too.
6. Open the deployed Apps Script Web App URL with a browser. Its JSON health response should contain `"configured": true`. Then run the Back4App `healthCheck` Cloud Function and inspect `emailDiagnostics`; the token check should pass without sending an email. No secret token is returned.

### Email token troubleshooting

- The Apps Script property name must be exactly `APPS_SCRIPT_TOKEN`; its value must be identical to Back4App Config `APPS_SCRIPT_TOKEN`. Do not add quotation marks around the value.
- If the deployed `Code.gs` is an older version without the `action: "healthcheck"` branch, the current Cloud Code can recognize the legacy response `A valid recipient email is required.` only after the Apps Script has accepted the supplied token. This is a compatibility fallback, not proof that mail delivery works.
- Prefer copying the complete current `apps-script/Code.gs` from this repository into the Apps Script editor and deploying **New version**. The current script returns `tokenValid: true` for a token-only health check and avoids sending a real email during diagnostics.
- If the Apps Script GET response says `configured: true` but the Back4App `healthCheck` reports token validation failed, verify that the Back4App URL points to the same Apps Script project where you saved the property, then redeploy the Web App if you changed the code.
- After `healthCheck` succeeds, run a real registration or resend request. Only a received verification email confirms delivery; `configured: true` alone does not.
7. Test registration with an address you control. If delivery fails after the account has been created, use **Doğrulama kodunu tekrar gönder** on the verification screen after correcting the configuration. The resend endpoint applies a short rate limit.
8. Sign in and test one topic note, one flashcard, one quiz question and a long chat message. The UI distinguishes local saves from confirmed cloud sync.

The verification code is time-limited. Do not send real credentials, tokens, or private student data in public issues or screenshots.

### Optional TDEV-AI provider

For full AI-generated answers, set these values in Back4App Config (or the corresponding server environment):

NVIDIA NIM is preferred when `NVIDIA_API_KEY` is configured:
- `NVIDIA_API_KEY` — secret NVIDIA API key.
- `NVIDIA_BASE_URL` — optional HTTPS base URL; default is `https://integrate.api.nvidia.com/v1`. The server appends `/chat/completions` when needed.
- `TAVILY_API_KEY` — optional server-side Tavily Search API key for source-linked research in TDEV-AI.
- `AI_FALLBACK_API_KEY`, `AI_FALLBACK_MODEL`, `AI_FALLBACK_BASE_URL` — optional separate fallback provider for TDEV-AI when the primary AI API fails.
- `NVIDIA_MODEL` — optional NVIDIA model ID; default is `deepseek-ai/deepseek-v4-flash`.

Fallback provider options:
- `AI_API_KEY` — secret key for an OpenAI-compatible chat-completions provider.
- `AI_MODEL` — optional fallback model name; default is `gpt-4o-mini`.
- `AI_BASE_URL` — optional HTTPS chat-completions endpoint; default is `https://api.openai.com/v1/chat/completions`.

Never put an AI key in `index.html`, `study.js`, a public repository, or a user-visible message. AI requests are made from Cloud Code. If neither provider key is configured, the tutor can only use the limited topic guide fallback. Provider billing, quotas, and privacy terms must be reviewed before enabling it for students.

## Curriculum accuracy

The country selector includes a broad list of countries. The built-in curriculum is a **general learning guide**, not a claim that all national curricula have been completely verified. Localized subject-name profiles are included for a selection of countries. The built-in topics remain general learning guides; country-specific official syllabus coverage is only assured when a verified record exists in Back4App. Other countries receive a clearly labelled general guide until official, grade-specific records are added.

For an official country curriculum, create a `Curriculum` record in Back4App for each `server` country code and `grade` (1–12), with the verified subject map in `subjects`. Each subject may contain:
- `icon`, `desc`, `tag`
- `topics`: objects with `title`, `explanation`, optional `objectives` and topic-level `videos`
- `videos`: objects with `title`, `query`, optional `url`
- `meb1`, `meb2`, `mebLink`

Use the official education ministry or curriculum authority for the selected country, check the academic year, and do not label a general guide as an official syllabus. Topic video links currently open a YouTube search for the topic rather than claiming to be a verified individual video.

## Automated repository validation

Run the dependency-free static checks locally with Node.js 20 or later:

```bash
node scripts/validate-project.js
```

The GitHub Actions workflow runs the same checks on pushes and pull requests. It checks JavaScript syntax, inline scripts in `index.html`, local script assets, frontend-to-Cloud-Code function names, the Apps Script token health-check contract, and the flashcard cloud-sync endpoints. Passing these checks does not prove that Back4App Config, the deployed Google Apps Script URL, email quotas, or live email delivery are configured correctly; those still require the live verification checklist below.

## Verification checklist

- [ ] Deploy Cloud Code after each `back4app/main.js` change.
- [ ] Confirm `getCurriculum` returns subjects and topic explanations for grade 1, grade 8 and grade 12.
- [ ] Select another country and verify the UI labels the fallback as a general guide when no official record exists.
- [ ] Save a topic note; verify it appears in Not Defterim and, if the cloud call succeeds, after logging in on another device.
- [ ] Send a long message; confirm the whole message and response remain visible. Real AI answers require the optional provider configuration above.
- [ ] Verify the e-mail registration flow separately; GitHub deployment does not automatically redeploy Back4App Cloud Code.

Do not claim production testing until these checks have been run in the deployed environment.

**NVIDIA NIM configuration:** set `NVIDIA_API_KEY` and `NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1` in Back4App Config. Optional `NVIDIA_MODEL` overrides the default `deepseek-ai/deepseek-v4-flash`. The authenticated `healthCheck` response reports only whether the key/URL are configured and the selected model; it never returns the API key. If inference fails, the response includes the provider's HTTP status and a short sanitized error detail. Back4App Config values take precedence over environment variables when both are present.
