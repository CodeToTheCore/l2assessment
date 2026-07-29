# Customer Inbox Triage App

## Changes in this fork

**See [IMPROVEMENTS.md](IMPROVEMENTS.md) for the full assessment write-up** — how I
tested, the top 3 areas for improvement, what I implemented and why, and before/after
measurements.

Short version:

- **Urgency is now scored by the LLM** in the same call as the category, because a
  keyword list cannot read business impact. The rule-based scorer was rewritten and
  demoted to a fallback.
- **The LLM contract is validated** — JSON mode, `temperature: 0`, and both fields
  checked against allow-lists instead of keyword-scanning the reply prose.
- **Failures are visible.** The app now says when a result came from the fallback rules
  rather than the model, instead of labelling everything "AI Reasoning".
- **Recommendations use category *and* urgency**, and each category has its own action.
- **Supervisor requests are detected and routed** — a separate field from urgency, since a
  calm message can still ask for a manager. Escalates on its own and prompts a reply review.
- **Follow-ups are tracked so nothing goes unanswered** — each analysis gets a respond-by
  target from its urgency, with overdue counts in the nav bar and a "Needs attention" panel.
- **Draft replies can be reviewed before sending** — the model checks accuracy, completeness,
  tone and ownership, and returns a verdict plus a suggested rewrite.
- **Tone, impact and routing are separate layers** — `aggravation.js` measures how upset the
  customer is, `escalation.js` decides routing from an allow-listed reason enum, and neither
  touches the LLM. Being upset does not jump the queue; being blocked does.
- **Guarded storage layer, 76 unit tests, `.env` added to `.gitignore`.**

### What wasn't working before

| Area | Before | After |
|---|---|---|
| **Urgency scoring** | The only rule that *raised* the score was the count of `!`. ALL-CAPS subtracted 50, short messages up to 100 (two stacking branches), politeness and `?` subtracted, and the score changed with the time of day and day of week — so the same message got a different urgency depending on when you clicked, and history was not reproducible. `High` needed `> 80` but one `!` landed on exactly 80. "Our production server is down" scored **Low**; agreement with my own labels was **3/12**. | The LLM scores urgency from business impact in the same call as the category, with tone explicitly excluded. **8/8** on held-out messages. The rewritten keyword scorer — real signal tiers, no clock dependency, no tone terms at all — is now only the fallback. |
| **Categorization** | The model was asked an open question and its reply *prose* was scanned for keywords in a fixed order, `billing` first, so a reply saying *"this is not a billing issue, it's a bug in the export"* was classified **Billing Issue**. `temperature: 0.7` meant the same message could be labelled differently on consecutive runs. | JSON mode at `temperature: 0`, with the category read from a declared field and validated against an allow-list. Unrecognised values become `Unknown` → *review manually* instead of a confident guess. **6/6** on the examples below. |
| **Recommended actions** | `Feature Request` returned *"Ask user to check billing portal."* — a copy-paste of the billing entry. `getRecommendedAction(category, urgency)` accepted `urgency` and never used it, so a High-urgency outage and a Low-urgency question got identical advice. | Every category has its own action, and urgency drives a response-time line and escalation. |
| **AI failures** | Any API error fell through to canned keyword output with only a `console.warn`, while the UI kept the heading "AI Reasoning". The bundled API key was **expired**, so this was the app's permanent state and nothing said so. Fallback wording was picked with `Math.random()`, so re-analysing one message gave different explanations. | Amber banner when the fallback ran, urgency badge marked *AI-scored* or *rule-scored*, "Rule-based" chip in history. No key means no request is attempted. Fallback wording is a stable hash of the message. |
| **Stored history** | Four unguarded `JSON.parse` calls — one malformed value blanked the page. No record ids, unbounded growth with no quota handling, and the list was sorted **alphabetically by message text** instead of newest-first. | One guarded storage module: corrupt entries filtered out, capped at 200 records, stable ids, newest-first, failed writes reported to the user. |
| **Navigation** | `window.location.href` and a raw `<a href>` forced full page reloads inside the single-page app; two `setState`-in-effect patterns caused cascading renders (both were lint errors). | `useNavigate` / `Link`, with state derived during render. Lint is clean (was 6 errors). |
| **Secrets** | `.env` was **not** in `.gitignore` — it sat untracked next to a live API key, one `git add -A` from being published. | Ignored, with an `!.env.example` exception. Verified it was never committed, so there is nothing in git history to scrub. |
| **Tests** | None, so none of the above had anything to catch it. | 76 unit tests (`npm test`, no new dependencies), written as regressions against these specific bugs. |

### Added beyond the original scope

Features the original app had no notion of, covered in
[IMPROVEMENTS.md](IMPROVEMENTS.md) sections 6 and 7:

- **Supervisor routing.** The triage call now also returns whether the customer asked for a
  supervisor, as a field separate from urgency — a polite, low-impact message can still need a
  manager. It escalates on its own and flags the reply for review. Keyword detection is the
  fallback. **6/6 on live examples**, including the two cases that matter most: an furious
  customer who asks for nobody, and one who mentions *their own* manager.
- **Follow-up tracking.** Every analysis gets a respond-by target from its urgency (High 1h,
  Medium 24h, Low 72h) and an open/done state. Overdue and due-soon counts show as a badge in
  the nav bar, a "Needs attention" panel on the Dashboard, and per-row chips in History with a
  "Mark done" button.
- **Draft reply review.** Write the reply you plan to send and have it checked before it goes
  out, against accuracy, completeness, tone and ownership. Returns *Send as is* / *Needs edits*
  / *Do not send*, the specific issues, and a suggested rewrite; the verdict is stored on the
  record as an audit trail. There is deliberately **no rule-based fallback** for this — judging
  a reply is not something keywords can do, so with no API key it reports unavailable rather
  than inventing a verdict a supervisor might trust.
- **Tone as its own layer.** `detectAggravation(message)` returns `{aggravated, signals}` from
  a hard-coded phrase list — no weighted stacking, since that was the original scorer's worst
  bug. `decideEscalation({category, urgency, aggravated, customerRequestedSupervisor})` returns
  `{escalate, reason}` from an allow-listed enum and never sees the raw message. **Aggravation
  alone does not escalate**: being upset is not being blocked, and letting tone drive routing
  rewards whoever shouts loudest. It changes how you open the reply, not where it goes.

### Findings that came from measurement, not from reading the code

All four are written up in [IMPROVEMENTS.md](IMPROVEMENTS.md):

- A rewritten keyword scorer hit **12/12** on the messages I tuned it against and **2/8** on
  held-out messages written afterwards. That gap is why urgency moved to the LLM.
- An escalation rule of my own passed its unit tests, then turned *"Can I upgrade to the pro
  plan?"* into *"Escalate to a senior agent within 1 hour"* against the live API.
- Since category and urgency now come from one call, I tested adversarially for the model
  correlating them (assuming Billing means Low). It doesn't: **urgency 6/6** on pairs built
  against the stereotype — billing P1s scored High, a cosmetic technical bug scored Low. One
  of the two category disagreements was **my** label being wrong, not the model's.
- `temperature: 0` makes sampling greedy but does **not** guarantee bit-identical output —
  provider-side batching and hardware can still cause drift. Three repeat calls is evidence,
  not proof; a real stability claim needs the evaluation harness in section 5. This is part of
  why allow-list validation matters: it bounds what a drifting reply can turn into.

## Overview

The Customer Inbox Triage app is a lightweight AI-powered tool that helps classify customer support messages and recommend actions. It uses Groq AI to assign a category, an urgency level and a supervisor-requested flag in a single structured call, measures customer aggravation separately with rules, and combines the two into an escalation decision and a recommended next step. When the API is unavailable it falls back to rule-based scoring and says so rather than presenting the result as AI output.

Concerns are deliberately separated into layers, each answering one question:

| Layer | Module | Question | Uses the LLM? |
|---|---|---|---|
| 1. Classification | `llmHelper.js` | What is this about, how much business impact, did they ask for a manager? | Yes |
| 2. Tone | `aggravation.js` | How badly is this relationship going? | No |
| 3. Routing | `escalation.js` | Does a supervisor need to see this, and why? | No |
| 4. Wording | `templates.js` | What should the agent actually do next? | No |

Layers 2–4 are pure functions of the layers above them — layer 3 never even sees the raw message text — which is what makes them testable as inputs in, enums out.

## Problem Statement

Support teams waste time manually reading and triaging customer messages. This tool provides an automated first pass at classification to help prioritize and route messages more efficiently.

## Tech Stack

- **Frontend**: React + Vite + Tailwind CSS
- **AI**: Groq API (Llama 3.3 70B - Free tier)
- **Runtime**: Browser-based (local development only)

## Setup Instructions

### Prerequisites

- Node.js (v20 or higher — `npm test` uses the built-in `node --test` runner)
- npm or yarn
- Groq API key (FREE - get from https://console.groq.com)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd "L2 assessment"
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure Groq API Key**
   
   Create a `.env.local` file in the root directory:
   ```bash
   cp .env.example .env.local
   ```
   
   Edit `.env.local` and add your Groq API key:
   ```
   VITE_GROQ_API_KEY=gsk_your-actual-key-here
   ```
   
   Get your FREE API key from: https://console.groq.com/keys
   
   **Why Groq?** Groq offers a generous free tier with fast inference and no credit card required!

4. **Run the application**
   ```bash
   npm run dev
   ```
   
   The app will be available at `http://localhost:5173`

5. **Run the checks** (optional)
   ```bash
   npm test        # 76 unit tests, no extra dependencies (node --test)
   npm run lint
   npm run build
   ```

> **Note:** if `VITE_GROQ_API_KEY` is missing or invalid, the app still works — it falls
> back to rule-based triage and labels the results as rule-scored rather than AI-scored.

## How It Works

1. **Paste Message**: User pastes a customer support message into the text area
2. **Analyze**: Click "Analyze Message" to process the input
3. **Triage**: The app then runs:
   - **Category + Urgency + Supervisor flag** (LLM): One structured Groq call (Llama 3.3 70B)
     returns all three, validated against fixed allow-lists
   - **Fallbacks** (Rule-based): A deterministic keyword scorer for urgency and a keyword check
     for supervisor requests, used only when the LLM is unavailable or returns unusable values
   - **Aggravation** (Rule-based, no LLM): Reports whether the customer is upset and which
     signals said so, kept out of the LLM call so tone cannot contaminate the impact judgment
   - **Escalation** (Pure): Combines urgency, aggravation and the supervisor flag into
     `{escalate, reason}` from an allow-listed enum
   - **Recommendation** (Template-based): Turns the escalation reason and category into a
     recommended action
4. **Display Results**: Shows category, urgency tag (marked AI-scored or rule-scored), the
   respond-by target, recommended action, and the reasoning behind it
5. **Draft Reply** (optional): Write the reply you plan to send and have it reviewed for
   accuracy, completeness, tone and ownership before it goes out
6. **History**: Analyses are saved to localStorage (newest first, capped at 200 records) with
   follow-up state, so overdue items surface in the nav bar and on the Dashboard


## Example Test Messages

Try analyzing these messages to see how the triage system works:

### Example 1: Production Issue
```
Our production server is down
```

### Example 2: Customer Feedback
```
Hi there! I just wanted to say thank you for your amazing customer service. I've been using your product for three years now and I'm really happy with it. Keep up the great work!
```

### Example 3: Feature Request
```
I would love to see a dark mode option in the app. It would be much easier on my eyes during night time usage.
```

### Example 4: Payment Issue
```
I tried to update my payment method but the page keeps loading forever. Is this a known issue?
```

### Example 5: Billing Question
```
Can I upgrade my subscription to the pro plan?
```

### Example 6: Technical Support
```
The dashboard won't load when I try to access it. I've tried refreshing but it keeps timing out.
```

### Examples for the behaviour added in this fork

These are the pairs that show *why* tone, impact and routing are separate. Each has been
verified against the live API.

**A polite, low-impact supervisor request — escalates anyway**
```
Hi, thanks for your help so far. Could I speak with a supervisor about this please?
```
→ General Inquiry / **Low** urgency / not aggravated / **escalates** with reason
`customer_requested`. Urgency alone would have left this in the normal queue.

**A furious customer with a cosmetic bug — does not escalate**
```
THIS IS RIDICULOUS!!! The footer still shows the wrong year and it looks unprofessional
```
→ Technical Problem / **Medium** / **aggravated** (`frustrated_wording`,
`excessive_punctuation`) / **no escalation**. Being upset does not jump the queue.

**A calm outage — escalates on impact alone**
```
Our production server is down and we cannot process orders
```
→ Technical Problem / **High** / not aggravated / **escalates** with reason `high_urgency`.
The polite customer whose business has stopped is not deprioritised.

**Both at once — the reason changes the advice**
```
This is the third time I am reporting this. Still no reply. The site is down AGAIN and it is unacceptable.
```
→ **High** + **aggravated** (`frustrated_wording`, `repeat_contact`) → reason
`high_urgency_and_aggravated`, and the recommended action adds *"The customer is already
upset, so acknowledge that first."*

**Emphatic, not angry**
```
THANKS SO MUCH!!! You fixed it so fast
```
→ tone signals `shouting` and `excessive_punctuation` are **reported but not decisive**, so
`aggravated` stays false. A flag that fires on exclamation marks would mean nothing.

**To see the draft reply review**, analyze any of the above, then put a deliberately bad
reply in the Draft Reply box, e.g.:
```
I have already refunded you in full and upgraded your account to free for life.
```
→ **Do not send**, flagged for inventing a refund and an upgrade that were never authorised.
That draft is friendly and confident, which is exactly why a tone-only check would pass it.

**To see follow-up tracking**, analyze a High-urgency message and wait — its response target
is 1 hour, and the History tab badge and Dashboard "Needs attention" panel update on their
own. To see the overdue state immediately, open DevTools and edit the `dueBy` field of a
record in `localStorage` under the `triageHistory` key to a time in the past.

**To see the honest-failure behaviour**, break `VITE_GROQ_API_KEY` in `.env`, restart the dev
server, and analyze anything: you get an amber banner, a *rule-scored* urgency badge,
"Rule-Based Reasoning" instead of "AI Reasoning", and reply review reports itself
unavailable rather than inventing a verdict.

## Security Note

⚠️ **Warning**: This application exposes the Groq API key in the browser (using `dangerouslyAllowBrowser: true`). This is acceptable for local development only but should **NEVER** be done in production. In a real application, API calls should be made from a secure backend server.

## Why Groq?

- ✅ **Completely Free** - No credit card required
- ✅ **Fast Inference** - Groq's LPU technology is incredibly fast
- ✅ **Generous Limits** - ~14,400 requests/day on free tier
- ✅ **High Quality** - Llama 3.3 70B performs excellently
- ✅ **Easy Signup** - Get started in minutes at https://console.groq.com

## License

This project is for educational purposes only.
