# TdevKuantum Akademi

TdevKuantum is an educational web app with grade-based lesson browsing, topic explanations, topic-specific notes, video/resource search links, quiz practice, study plans, flashcards, revision logs and an optional AI tutor.

## Files

- `index.html` — student interface, country selector, lesson/topic view, video/resource links and chat display.
- `study.js` — study plans, personal notes, flashcards, revision records, mistake notebook and cloud-sync helpers.
- `back4app/main.js` — Back4App Cloud Code, account/verification workflows, curriculum fallback content, user-scoped study data, quiz endpoints and optional AI tutor.
- `terms.html` / `privacy.html` — usage and privacy drafts. These are not legal advice and must be checked against the real production configuration.

## Back4App Cloud Code deployment

1. Open the Back4App app's Cloud Code area.
2. Upload the latest `back4app/main.js` from this repository and deploy it.
3. Confirm the existing mail configuration remains in place. The Apps Script token is a secret and must not be added to HTML or public documentation.
4. Sign in to the site and test one topic note, one flashcard, one quiz question and a long chat message. The UI distinguishes local saves from confirmed cloud sync.

### Optional TDEV-AI provider

For full AI-generated answers, set these values in Back4App Config (or the corresponding server environment):

- `AI_API_KEY` — secret key for an OpenAI-compatible chat-completions provider.
- `AI_MODEL` — optional model name; default is `gpt-4o-mini`.
- `AI_BASE_URL` — optional HTTPS chat-completions endpoint; default is `https://api.openai.com/v1/chat/completions`.

Never put an AI key in `index.html`, `study.js`, a public repository, or a user-visible message. AI requests are made from Cloud Code. If no provider key is configured, the tutor explains that full AI service is not configured and can only use the limited topic guide fallback. Provider billing, quotas, and privacy terms must be reviewed before enabling it for students.

## Curriculum accuracy

The country selector includes a broad list of countries. The built-in curriculum is a **general learning guide**, not a claim that all national curricula have been completely verified. Localized subject-name profiles are included for a selection of countries. The built-in topics remain general learning guides; country-specific official syllabus coverage is only assured when a verified record exists in Back4App. Other countries receive a clearly labelled general guide until official, grade-specific records are added.

For an official country curriculum, create a `Curriculum` record in Back4App for each `server` country code and `grade` (1–12), with the verified subject map in `subjects`. Each subject may contain:
- `icon`, `desc`, `tag`
- `topics`: objects with `title`, `explanation`, optional `objectives` and topic-level `videos`
- `videos`: objects with `title`, `query`, optional `url`
- `meb1`, `meb2`, `mebLink`

Use the official education ministry or curriculum authority for the selected country, check the academic year, and do not label a general guide as an official syllabus. Topic video links currently open a YouTube search for the topic rather than claiming to be a verified individual video.

## Verification checklist

- [ ] Deploy Cloud Code after each `back4app/main.js` change.
- [ ] Confirm `getCurriculum` returns subjects and topic explanations for grade 1, grade 8 and grade 12.
- [ ] Select another country and verify the UI labels the fallback as a general guide when no official record exists.
- [ ] Save a topic note; verify it appears in Not Defterim and, if the cloud call succeeds, after logging in on another device.
- [ ] Send a long message; confirm the whole message and response remain visible. Real AI answers require the optional provider configuration above.
- [ ] Verify the e-mail registration flow separately; GitHub deployment does not automatically redeploy Back4App Cloud Code.

Do not claim production testing until these checks have been run in the deployed environment.
