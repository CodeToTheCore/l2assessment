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
- **Guarded storage layer, 22 unit tests, `.env` added to `.gitignore`.**

### What wasn't working before

| Area | Before | After |
|---|---|---|
| **Urgency scoring** | The only rule that *raised* the score was the count of `!`. ALL-CAPS subtracted 50, short messages up to 100 (two stacking branches), politeness and `?` subtracted, and the score changed with the time of day and day of week — so the same message got a different urgency depending on when you clicked, and history was not reproducible. `High` needed `> 80` but one `!` landed on exactly 80. "Our production server is down" scored **Low**; agreement with my own labels was **3/12**. | The LLM scores urgency from business impact in the same call as the category, with tone explicitly excluded. **8/8** on held-out messages. The rewritten keyword scorer — real signal tiers, no clock dependency, shouting counted as urgency rather than against it — is now only the fallback. |
| **Categorization** | The model was asked an open question and its reply *prose* was scanned for keywords in a fixed order, `billing` first, so a reply saying *"this is not a billing issue, it's a bug in the export"* was classified **Billing Issue**. `temperature: 0.7` meant the same message could be labelled differently on consecutive runs. | JSON mode at `temperature: 0`, with the category read from a declared field and validated against an allow-list. Unrecognised values become `Unknown` → *review manually* instead of a confident guess. **6/6** on the examples below. |
| **Recommended actions** | `Feature Request` returned *"Ask user to check billing portal."* — a copy-paste of the billing entry. `getRecommendedAction(category, urgency)` accepted `urgency` and never used it, so a High-urgency outage and a Low-urgency question got identical advice. | Every category has its own action, and urgency drives a response-time line and escalation. |
| **AI failures** | Any API error fell through to canned keyword output with only a `console.warn`, while the UI kept the heading "AI Reasoning". The bundled API key was **expired**, so this was the app's permanent state and nothing said so. Fallback wording was picked with `Math.random()`, so re-analysing one message gave different explanations. | Amber banner when the fallback ran, urgency badge marked *AI-scored* or *rule-scored*, "Rule-based" chip in history. No key means no request is attempted. Fallback wording is a stable hash of the message. |
| **Stored history** | Four unguarded `JSON.parse` calls — one malformed value blanked the page. No record ids, unbounded growth with no quota handling, and the list was sorted **alphabetically by message text** instead of newest-first. | One guarded storage module: corrupt entries filtered out, capped at 200 records, stable ids, newest-first, failed writes reported to the user. |
| **Navigation** | `window.location.href` and a raw `<a href>` forced full page reloads inside the single-page app; two `setState`-in-effect patterns caused cascading renders (both were lint errors). | `useNavigate` / `Link`, with state derived during render. Lint is clean (was 6 errors). |
| **Secrets** | `.env` was **not** in `.gitignore` — it sat untracked next to a live API key, one `git add -A` from being published. | Ignored, with an `!.env.example` exception. Verified it was never committed, so there is nothing in git history to scrub. |
| **Tests** | None, so none of the above had anything to catch it. | 22 unit tests (`npm test`, no new dependencies), written as regressions against these specific bugs. |

Two findings came from measurement rather than reading the code, and both are written up
in [IMPROVEMENTS.md](IMPROVEMENTS.md): a rewritten keyword scorer that hit **12/12** on
the messages I tuned it against and **2/8** on held-out messages (which is why urgency
moved to the LLM), and an escalation rule of my own that passed its unit tests and then
turned *"Can I upgrade to the pro plan?"* into *"Escalate to a senior agent within 1
hour"* against the live API.

## Overview

The Customer Inbox Triage app is a lightweight AI-powered tool that helps classify customer support messages and recommend actions. It uses Groq AI to assign both a category and an urgency level in a single structured call, falls back to rule-based urgency scoring when the API is unavailable, and suggests next steps from templates keyed on both values.

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
   npm test        # 22 unit tests, no extra dependencies (node --test)
   npm run lint
   npm run build
   ```

> **Note:** if `VITE_GROQ_API_KEY` is missing or invalid, the app still works — it falls
> back to rule-based triage and labels the results as rule-scored rather than AI-scored.

## How It Works

1. **Paste Message**: User pastes a customer support message into the text area
2. **Analyze**: Click "Analyze Message" to process the input
3. **Triage**: The app then runs:
   - **Category + Urgency** (LLM): One structured Groq call (Llama 3.3 70B) returns both,
     validated against fixed allow-lists
   - **Urgency fallback** (Rule-based): A deterministic keyword scorer, used only when the
     LLM is unavailable or returns an unusable urgency
   - **Recommendation** (Template-based): Maps category *and* urgency to a recommended
     action, escalating where warranted
4. **Display Results**: Shows category, urgency tag (marked AI-scored or rule-scored),
   recommended action, and the reasoning behind it
5. **History**: Analyses are saved to localStorage (newest first, capped at 200 records)
   and viewable in the History tab


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
