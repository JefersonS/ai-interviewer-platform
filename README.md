# AI Interviewer

A small web app where you pick a job, then have a **spoken interview** with an AI interviewer. It asks role-specific questions that adapt to what you say, then shows the full transcript and a structured evaluation.

**Live:** https://ai-interviewer-production-4cfa.up.railway.app (use Chrome or Edge; the microphone needs HTTPS and a browser that supports speech recognition)

## What it does

| Requirement | How it is met |
|---|---|
| 3+ jobs with title and description | Backend Engineer, Frontend Engineer, Product Manager (`lib/jobs.ts`) |
| Interview room per job | `/interview/[jobId]`: chat layout, the interviewer speaks, you answer by voice |
| Voice in, questions visible | Browser speech recognition and speech synthesis; every message is also shown as text |
| 6+ questions, 2+ follow-ups depending on the prior answer, role-grounded | 7 questions, 2 to 3 follow-ups (enforced in code, each quotes the answer it follows), every one of the role's 4 focus areas covered |
| Session saved, transcript and evaluation at the end | Saved in the browser; `/interview/[jobId]/summary` shows transcript, score, strengths, concerns and the raw JSON |
| Clean UI, works hosted | Next.js on Railway |

## Run it locally

```bash
npm install
cp .env.example .env.local      # then put your OpenRouter key in OPENROUTER_API_KEY
npm run dev                     # http://localhost:3000
```

Other commands:

```bash
npm test             # offline tests, no API key needed (about 200 tests, free, a few seconds)
npm run test:live    # the same full conversations against the real model (costs cents, ~5 minutes)
npm run build && npm start
```

Environment variables (see `.env.example`): `OPENROUTER_API_KEY` (required), `OPENROUTER_MODEL` (optional, default `mistralai/mistral-small-3.2-24b-instruct`), `DATABASE_URL` (optional, a Postgres connection string: turns on the saved history, see below), `RATE_LIMIT_PER_IP`, `RATE_LIMIT_GLOBAL_PER_HOUR` and `RATE_LIMIT_HISTORY_PER_IP` (optional). Keys are read from the environment only and never committed.

Without `DATABASE_URL` the app works fully; in development the history uses an in-memory store (lost on restart), and in production the history pages say it is not configured.

## How the interviewer decides (reasoning and question selection)

**Principle: code owns the rules, the model owns the words.** The model is a small, cheap one, and cheap models are unreliable at counting, constraints and formats. So everything that must always be true is decided and checked by plain code (`lib/interview.ts`). The model only does what it is good at: reacting naturally, writing the question, and judging how good an answer was. Every model reply is validated; if it breaks a rule it is rejected and retried.

### 1. How many questions, and which kind (follow-up or new topic)

There are 7 questions per interview. Each role has 4 **focus areas** (for Backend: API design, databases and data modeling, reliability and debugging in production, scaling and performance). So 7 slots minus 4 areas leaves **3 spare slots**, and the follow-up budget is exactly that.

Before each question the code computes which kinds are still allowed. A choice is allowed only if the slots that remain can still:
1. cover every focus area not yet asked about, **and**
2. fit the required minimum of 2 follow-ups.

What this gives in practice:
- The model may follow up whenever an answer opens a thread worth pursuing, even three times in a row on one strong thread.
- It can never starve a later area. Once only enough slots remain to cover the uncovered areas, the next question is forced onto one of them. A good first thread therefore never costs the interview its performance question.
- When the minimum of 2 follow-ups would otherwise be missed, a follow-up is forced.

The model is told the allowed kind, which areas are still uncovered, and how many follow-ups it can still afford, so it can spend them wisely. A follow-up inherits the area of the question it follows, set by code, so a follow-up cannot be misfiled.

### 2. How hard the question is (pacing)

Difficulty has four levels: 1 warm-up, 2 core, 3 advanced (tradeoffs, debugging), 4 expert (ambiguity, scale, edge cases).

- The base difficulty ramps with the question number: **1, 1, 2, 2, 3, 3, 4**.
- For each new question the model first **rates the candidate's last answer**: strong, adequate or weak.
- Code then moves the difficulty one level: strong +1, weak -1, never below 1 or above 4. The model must return exactly that number. If it does not, the reply is rejected and retried.
- Follow-ups use the same rule: a strong answer gets a deeper probe, a weak one a simpler clarifying probe.

The result is visible in the tests: a candidate rated strong every time sees difficulty `1, 2, 3, 3, 4, 4, 4`; a weak one sees `1, 1, 1, 1, 2, 2, 3`.

### 3. What the model writes, and what is stored as its "reasoning"

For each turn the model returns JSON, which the code validates before showing anything:

| Field | Written by | Checked by code |
|---|---|---|
| `reaction` + `question` | model (spoken, in the candidate's language) | no placeholders such as `[Name]`; non-empty |
| `kind` (`new_topic` or `follow_up`) | model | must be an allowed kind |
| `area` | model for a new topic; inherited for a follow-up | must be exactly one of the areas still to cover |
| `assessment` of the previous answer | model | required after question 1 |
| `difficulty` | model | must equal the pacing rule above |
| `references` | model | for a follow-up: must quote the candidate's answer, so a follow-up provably depends on the prior answer |
| `topic`, `reasoning` | model (one sentence on why it chose this question) | non-empty |

Each question is saved with these fields (plus `source`, see below). They are the explanation of *why this question was chosen*: what area it covers, how the last answer was rated, what difficulty and why, and which words it follows up on. They are stored with the session and are what the decision panel (next section) shows.

### 4. When the model fails

Model replies fail in ordinary ways: invalid JSON, wrong difficulty, an area outside the allowed set, a follow-up with no quote. The pipeline handles this in layers:
1. **Retry with the reason.** The retry includes the rejected reply and the validation error ("difficulty must be 2 for this assessment"). Resending the identical prompt repeated the same mistake in testing, so this matters.
2. **Fallback question.** If retries run out on a transient failure (bad output, network, rate limit, provider outage), the next question comes from a fixed bank: four difficulty levels for every focus area, or a generic probe that quotes the candidate's last answer. It follows the same coverage, follow-up and pacing rules, so the interview never stalls and still satisfies the spec. In live runs about 5% of questions needed it. These questions are marked `source: "fallback"`.
3. **Loud failure for real misconfiguration.** A missing or rejected API key is *not* hidden behind fallback questions, because that would make a broken deploy look healthy.

### 5. The evaluation

After the 7th answer one more call produces `{strengths, concerns, overall_score (1 to 10), summary}`. It also rates the final answer and lists its skills (`last_answer`), because there is no next question left to carry that rating. Scores used to cluster around 6 because the prompt had no anchors, so it now has a **score guide** (for example "mostly vague answers must score 4 or below") and receives the interviewer's per-answer ratings and each question's difficulty. In live runs strong scripted candidates score 7 or 8 and weak ones 2. The evaluation is always written in English and saved that way.

### 6. Clarifying a question

While a question is open the candidate can ask for a rephrase, an example, or something else (up to 2 per question, enforced server-side). Clarifications do not count as questions and do not change the rules above. They are stored with the question and shown to the evaluator, so asking is not held against the candidate.

## The decision panel

The **Decision panel** button in the interview header opens a panel that shows what the interviewer is tracking and why it asked what it asked. On wide screens it sits beside the chat; on a phone it opens full screen. It updates after every question.

| Section | What it shows |
|---|---|
| Why this question | Follow-up or new topic, the focus area, the difficulty level, how the previous answer was rated (which set the difficulty), the words a follow-up builds on, and the model's one-line reasoning. A note appears when the question came from the fallback bank |
| Topics | Each focus area as covered, current, or still a gap, with how many questions it has had |
| Follow-ups | How many of the 3 follow-up slots are used, and the required minimum |
| Difficulty and ratings | One bar per question: height is the difficulty, colour is how the answer to it was rated |
| Skills detected | Skills and technologies the candidate showed, collected across answers |
| Rule for the next question | What the code will allow next and why, for example "No follow-up slots left. The next question must open an uncovered area: ..." |

Everything except "skills" and the one-line reasoning is computed by code from the saved questions (`lib/panel.ts`, unit-tested). Skills come from the model, which reports them while writing the next question; code keeps only skills that actually appear in the candidate's previous answer, so the panel cannot show invented ones.

The final answer has no next question to carry its rating or skills, so the evaluation call provides them; the panel fills in the last bar and the skills when the evaluation arrives and shows "Interview complete". The summary page shows the same information as a read-only **How the interviewer decided** section, with every question's reasoning, so the whole trail stays visible after the interview ends.

## History, replay and analytics

Every finished interview is saved to **Postgres** (Railway) when the evaluation arrives. This is a best-effort background save: if it fails, the interview is unaffected and the summary page offers "Save to history".

- **`/history`** lists this browser's interviews, with a role filter and a score trend chart across sessions. Each row shows the session's metrics.
- **`/history/[id]`** replays an interview step by step (previous, next, play, scrubber). The decision panel shows its state at each step, so you can watch the coverage, ratings and skills build up.

| Metric | How it is computed |
|---|---|
| Duration | start of the interview to the evaluation arriving |
| Talk share | the candidate's share of all words spoken (**by words**: audio is not recorded, so speaking time cannot be measured) |
| Answer time | question appearing to the answer being sent; it includes the voice reading the question. Absent for sessions saved before timestamps existed |
| Topic coverage | focus areas asked about, out of the role's total |
| Score, ratings, difficulty | the evaluation's score, how many answers were rated strong, adequate or weak, and the average difficulty reached |

**Privacy.** There are no accounts, and a public URL must not let anyone read other people's transcripts. Each browser creates a random anonymous **owner id** (kept in browser storage) and sends it in a request header; the server only returns sessions saved under that id, and answers 404 for anyone else's. It is a capability rather than real authentication: anyone who obtained the id could read that history, which is why it is a long random value and never goes in a URL. Clearing browser storage loses access to the history (the rows stay in the database).

**Storage details.** One table, created automatically on first use (`lib/sessionStore.ts`), with the full interview and its metrics as JSON plus a few indexed columns (owner, role, time, score). The save is an upsert by id, so retries are safe, and an id owned by another owner is refused with 409. Tests run the real SQL on `pg-mem`, an in-process Postgres emulator, because the hosted database is not reachable from a laptop; the same routes were also smoke-tested against the real database after deploying.

## Reliability of the model calls

Every model call is treated as unreliable (`lib/llm.ts`):

- 25 s timeout, 3 attempts, exponential backoff with jitter, honouring `Retry-After`; 429 and 5xx are retried, other 4xx fail fast
- JSON is extracted from fenced or chatty replies, then validated by a caller-supplied function
- at most 4 model calls in flight per process
- the interview server is **stateless**: the browser sends the history each turn and the server re-validates it, so requests are idempotent; the browser saves progress after every turn, so a reload resumes the interview. Only finished interviews go to the database
- structured JSON logs (one line per call with label, attempt and latency)
- the candidate's speech is treated as data, never as instructions; the name is restricted to letters before it enters a prompt
- public deploy protection (`lib/guard.ts`): 60 model calls per IP per 15 minutes, 600 per hour overall, 100 KB request cap (enforced in production only)

## Voice

- **Speaking:** the browser's speech synthesis (`speechSynthesis`), picking a neural/online voice for the interview language when one exists, with a Stop and Replay button on the message being spoken. Text appears progressively as the message arrives.
- **Listening:** the browser's speech recognition (`SpeechRecognition`, Chrome and Edge). The transcribed text lands in an editable box, so the candidate can fix mistakes before sending. Browsers without recognition fall back to typing.
- **Technical terms:** the browser recognizer cannot take a vocabulary, so it mishears words like "Node.js" or "Postgres". `lib/glossary.ts` rewrites known mishearings (about 35 patterns). It only fixes what it was taught.

## Code map

```
app/
  page.tsx                         job list
  interview/[jobId]/               interview room (chat UI), decision panel, and summary page
  api/interview/{next,clarify,evaluate,translate}/route.ts
  api/sessions/                    save and read finished interviews
  history/                         history list and replay pages
lib/
  interview.ts   rules: policy, pacing, prompts, validators   (the core)
  llm.ts         OpenRouter client: retries, repair, concurrency
  fallback.ts, questions.ts, questions.pt.ts   fallback question bank
  guard.ts       rate limits and size cap
  history.ts, metrics.ts, sessionStore.ts, owner.ts, historyClient.ts   saved history: validation, metrics, Postgres store, owner id
  panel.ts       what the decision panel shows (pure, unit-tested)
  glossary.ts, voice.ts, languages.ts, candidate.ts, session.ts, jobs.ts, logger.ts
tests/conversations/   full-conversation tests (offline and live)
```

## Tests

- **Unit tests** cover the policy (including simulations that play whole interviews under several strategies and assert coverage and follow-up bounds for every role), pacing, validators, retry and repair, the fallback bank, the glossary, rate limiting and translation.
- **Full-conversation tests:** 8 scripted interviews (a strong and a weak candidate per role, plus two in Portuguese) run through the real route handlers. Offline (`npm test`) a scripted fake model plays the interviewer, including a wrong-difficulty-then-repair failure and a complete outage. Live (`npm run test:live`) the same interviews run against the real model and the transcripts and scores are saved to `tests/conversations/live-results.json` (git-ignored) so they can be read afterwards.
- The model API is mocked in everything that runs by default.

## Deployment

Hosted on Railway. The service is deployed from this folder with the Railway CLI:

```bash
railway up --service ai-interviewer
```

`OPENROUTER_API_KEY` is set as a Railway variable, and `DATABASE_URL` is a reference to the project's Postgres service (`${{Postgres.DATABASE_URL}}`), so the app reaches the database over Railway's private network. (Auto-deploy from GitHub needs admin access to the repository's organization, so the CLI upload is used instead.)

## Decisions and tradeoffs

| Decision | Why | Cost |
|---|---|---|
| Rules in code, words from the model | A cheap model cannot be trusted to count, follow quotas or keep a format | More code than a single prompt; the model has less freedom |
| Browser speech recognition and synthesis | Free, no extra key, works instantly | Chrome and Edge only, no custom vocabulary, quality varies by voice and accent |
| Stateless interview server; finished interviews in Postgres | Retries stay safe, and the database only holds what the history needs | In-progress interviews live in the browser only |
| History private per browser through an anonymous owner id | A public deploy must not expose everyone's transcripts, and accounts were out of scope | Not real authentication; clearing browser storage loses access to the history |
| Talk share by words, not time | Audio is not recorded, so spoken time cannot be measured | It is a proxy: someone who speaks slowly and someone who speaks fast look the same |
| Fixed question bank as fallback | Interview always continues | Generic questions when it triggers |
| Typewriter reveal instead of token streaming | Our checks need the whole reply before anything is shown, so real streaming would mean taking text back when validation fails | Feels like streaming but does not reduce the wait for the model |
| In-memory rate limit | No infrastructure to run | Resets on redeploy; not shared if more than one instance runs |

## Known limitations

- Speech-to-text mishears technical terms; the glossary only covers the ones it was taught.
- Each question takes about 3 to 9 seconds (cheap model, plus retries when it breaks a rule).
- The interviewer's rating of answers and the final score come from the same cheap model. They separate strong from weak candidates reliably in tests, but they are not calibrated against human judgement.
- An unfinished interview lives only in one browser's storage; clearing it deletes it. Finished ones are in the database but can only be opened from the browser that owns them.
- The UI text (buttons, hints) is English only, even when the interview is in Portuguese.

## With more time, and things left out on purpose

**Save the audio.** Recording the candidate's answers would be worth having: audio carries intonation, hesitation and pace, which is a strong base for understanding the interviewee's mood and confidence. It needs recording in the browser, storage for the files, and consent handling.

**Save the video.** Even better than audio for judging mood, since it adds facial expression and posture. It was intentionally left for last: for this exercise it would add a lot of code (capture, upload, storage, playback, privacy) without improving anything the test actually evaluates.

**Multiple languages: a trap, so only two.** We know a real product should support many languages. But the transcription tool used here (the browser's speech recognition) is the weak link: quality drops sharply outside English, and technical terms are mangled in every language. Each added language would also need voice checks, a translated fallback bank and native review. So the app is deliberately limited to **two languages, English and Brazilian Portuguese**, which the author can check. Adding more would multiply effort without making the interview better until transcription improves.

**Better transcription.** The real fix for the points above is a speech service that accepts a vocabulary hint (Whisper-class, Deepgram, AssemblyAI) fed with the role's terms. It costs a few cents per interview and a second API key, and the text would appear after each answer instead of live.

**Stretch goals.** The decision panel and the history with replay and analytics are built (see above). Two were left out on purpose:
1. **Job-specific question packs (not built, deliberately).** The idea is structured technical and behavioral question banks per role, with the model choosing from them. It was skipped because it would constrain the model on new topics, trading the natural, adaptive conversation (which is the point of the exercise) for consistency, and because the fallback bank already covers the safety-net use. The fallback bank is the first step toward it.
2. **Video mode (not built, deliberately).** A camera preview and a call-style layout, with voice staying the input. It adds interface and permission handling but does not change anything the interview evaluates. Saving the video, described above, is the part that would make it worthwhile.

Also: accounts so history survives clearing browser storage, shared rate limiting (Redis), authentication, a monitored spending cap on the key, and calibrating the scoring against human-labelled interviews.
