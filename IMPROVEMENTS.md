# Customer Inbox Triage — Assessment Write-Up

**Author:** Cornell Robertson · **Date:** 29 July 2026

---

## 1. How I tested the app

I ran the app locally (`npm run dev`) and analyzed the six example messages from the
README, then a further set of my own messages chosen to stress the edges: an angry
all-caps outage, a *polite* emergency, a quiet churn risk, and a one-word thank-you.

To measure changes rather than eyeball them, I also built a small harness that imports
the original `urgencyScorer.js` and `templates.js` straight from git alongside the new
versions, so every claim below is a diff between two runnable implementations.

**The first thing testing surfaced had nothing to do with the code:** the bundled Groq
API key is expired (the API returns `expired_api_key`). Every request was failing and
the app was silently serving canned rule-based output — still labelled "AI Reasoning"
in the UI. I had been "testing the LLM" for a while before I noticed. That single
observation shaped the whole review: a triage tool that cannot tell you it has stopped
thinking is the most expensive kind of broken.

---

## 2. Top 3 areas for improvement

### Area 1 — The triage output is wrong often enough to create work instead of saving it

Relay AI's pitch is handling more customer volume without hiring more staff. That only
holds if an agent can trust the label and skip re-reading the message. Measured against
the twelve messages I triaged, the original urgency scorer agreed with my own judgment
**3 out of 12 times**, and it failed in the direction that costs the most — real
emergencies scored *Low*.

The mechanics, in the original [`urgencyScorer.js`](src/utils/urgencyScorer.js):

- The only thing that *raised* the score was the number of `!` characters. Every other
  rule subtracted. "Our production server is down" scored **Low**.
- ALL-CAPS **subtracted 50 points**. Shouting was read as calm.
- Short messages were penalised up to 100 points (two stacking branches), so `Outage!`
  could not reach High.
- Politeness and question marks subtracted, so a polite emergency scored below a rude
  question.
- The score depended on the wall clock — 20 points off at weekends, 15 off outside
  9am–5pm. The same message got a different urgency depending on when you pressed the
  button, and stored history was not reproducible. I measured the "before" numbers at
  2:04pm on a Wednesday, i.e. the most favourable window; a coach opening the app at
  6pm would see systematically lower urgencies than I did.
- `High` required `score > 80`, but one `!` landed on exactly 80 — an off-by-one that
  made a single exclamation mark worthless.

Category selection had the same shape of problem. The LLM was asked an open question
("Categorize this customer support message: …") and the reply prose was then scanned
for keywords in a fixed order, `billing` first. A reply saying *"this is not a billing
issue, it's a bug in the export"* was classified **Billing Issue**. `temperature` was
`0.7`, so the same message could be labelled differently on two consecutive runs.

Finally the recommendations were wrong even when the label was right: `Feature Request`
returned *"Ask user to check billing portal."* (a copy-paste of the billing entry), and
`getRecommendedAction(category, urgency)` accepted `urgency` and never used it — so a
High-urgency outage and a Low-urgency question got identical advice.

### Area 2 — The app cannot tell anyone when the AI has stopped working

Any API failure fell through to `getMockCategorization` with a `console.warn`, and the
UI kept the heading "AI Reasoning". There was no signal in the interface, the stored
history, or the dashboard that a result came from a keyword fallback rather than a
model. With an expired key this is the *permanent* state of the app, and nothing says so.

For a subscription product this is worse than an outage. An outage is visible and gets
fixed; a silent degradation means customers keep paying for AI triage, keep acting on
the output, and the support lead has no way to audit which decisions were AI-made. The
mock also picked its wording with `Math.random()`, so re-analysing one message produced
different explanations — indistinguishable from a model changing its mind.

### Area 3 — A single-browser data layer and no test safety net won't support a team product

Relay AI sells to support *teams*, but history lives in one browser's `localStorage`:
not shared between agents, lost when the cache clears, invisible to a manager. Around
it were four unguarded `JSON.parse` calls (one malformed value blanks the page), no
stable record ids, unbounded growth with no quota handling, and a history list sorted
**alphabetically by message text** instead of newest-first. The repo had zero tests, so
none of the logic bugs above had anything to catch them. And `dangerouslyAllowBrowser:
true` ships the API key to every visitor, which blocks any real deployment regardless.

---

## 3. What I implemented

I did the whole of Area 1 and Area 2, plus the correctness and safety parts of Area 3.
The single change I would point to as making the biggest difference:

### Urgency is now scored by the LLM, in the same call, with rules as the fallback

My first attempt at Area 1 was to fix the keyword scorer properly — real signal tiers,
capped weights, no clock dependency, shouting counted as urgency instead of against it.
It took the tuning set from 3/12 to **12/12**.

Then I wrote eight *held-out* messages after I had finished tuning and scored **2/8**.

That result is the most useful thing I learned. The misses were all paraphrase:
"our account was compromised" never contains `breach`, "revenue is stopped" never
contains `losing money`, "does nothing when I click it" never contains `not working`.
Urgency is a judgment about business impact, and no keyword list reaches it — I would
just have been overfitting a list to whatever examples I happened to test with.

So [`llmHelper.js`](src/utils/llmHelper.js) now asks for the category *and* the urgency
in one structured call, with the urgency criteria written in terms of impact and an
explicit instruction to ignore tone:

> Urgency rules — judge business impact, not tone. A polite message can be High and an
> angry message can be Low. **High**: the customer is blocked or cannot work, money or
> data is at risk, a security or account-access problem, an explicit deadline, or a hint
> that they may cancel or switch to a competitor. …

This costs nothing extra: same request, same latency, one more JSON field. The rewritten
keyword scorer stays in place as the fallback for when the API is unavailable, which is
a much better fallback than the original — but it is now the safety net rather than the
product.

### The rest of the changes

**Trustworthy output contract.** The request now uses `response_format: json_object`,
`temperature: 0` and a system prompt that names the allowed values. Both fields are
validated against allow-lists (`parseTriage`), so "not a billing issue" can no longer
become Billing, and an unrecognised value yields `Unknown` → *review manually* rather
than a confident guess. An invalid urgency falls back to the rule scorer instead of
showing nothing.

**Honest failure states.** `triageMessage` returns `source` (`llm` / `fallback`) and
`urgencySource` (`llm` / `rules`). The results panel shows an amber banner when the
fallback ran, the urgency badge is annotated *AI-scored* or *rule-scored*, the reasoning
heading changes to "Rule-Based Reasoning", and history rows carry a "Rule-based" chip.
When no key is configured the app skips the request entirely instead of failing one.
Fallback wording is now chosen by a stable hash of the message, so it is reproducible.

**Recommendations that use both inputs.** Every category has its own action, and
`urgency` now drives a response-time line via a `shouldEscalate` rule (High always
escalates; Billing escalates from Medium, since it is revenue-impacting).

**Data layer.** A new [`storage.js`](src/utils/storage.js) is the single guarded
read/write path: corrupt or legacy entries are filtered out instead of throwing, history
is capped at 200 records, and a failed write (quota) surfaces to the user instead of
being lost. Records get stable ids. History is sorted newest-first.

**React correctness.** Removed two `setState`-in-effect patterns in favour of deriving
state during render, replaced `window.location.href` and a raw `<a>` with
`useNavigate`/`Link` (they were forcing full page reloads inside the SPA), replaced
`alert()` with inline states, and passed the example message through router state
instead of `localStorage`.

**Secrets.** `.env` was not in `.gitignore` — it was sitting untracked next to a live
key, one `git add -A` from being published. Now ignored, with an `!.env.example`
exception. I confirmed it was never committed, so there is nothing in git history to scrub.

**Tests.** 22 unit tests via `npm test` (`node --test`, no new dependencies), most of
them written as regressions against the specific bugs above — shouting, politeness,
short messages, clock-dependence, the billing copy-paste, the ignored `urgency`
argument, and the negated-mention parse.

---

## 4. Test results

### Urgency, before vs after

Expected values are my own triage judgment. "Before" was measured at 2:04pm on a
Wednesday — the original scorer's most generous window.

| Message | Expected | Before | After |
|---|---|---|---|
| Our production server is down | High | **Low** | High |
| Hi there! … thank you for your amazing customer service … | Low | **Medium** | Low |
| I would love to see a dark mode option … | Low | **Medium** | Low |
| I tried to update my payment method but the page keeps loading forever | Medium | **Low** | Medium |
| Can I upgrade my subscription to the pro plan? | Low | Low | Low |
| The dashboard won't load … it keeps timing out | Medium | Medium | Medium |
| We cannot access our account and our whole team is blocked | High | **Medium** | High |
| THE SITE IS DOWN AGAIN. … it is unacceptable. | High | **Medium** | High |
| We were charged twice this month. Please refund the duplicate. | High | **Medium** | High |
| Hi, could you please help? Our production integration failed and we have a deadline today. Thank you! | High | **Low** | High |
| Our payment failed and we can no longer access our account | High | **Medium** | High |
| Thanks! | Low | Low | Low |

**3/12 → 12/12** on this set. Held-out set: **2/8** — see above; this is the number
that motivated moving urgency to the LLM, and it is why the table above should be read
as "the fallback got much better", not "urgency is solved".

### Recommended actions, before vs after

| Input | Before | After |
|---|---|---|
| `Feature Request` / Low | Ask user to check billing portal. | Handle in the normal queue. Log the request in the product backlog and let the customer know it was recorded. |
| `Billing Issue` / Medium | Ask user to check billing portal. | Escalate to a senior agent and respond within 1 hour. Verify the charge in the billing portal, then confirm the customer's payment method and invoice history. |
| `Technical Problem` / High | Suggest user to restart their browser. | Escalate to a senior agent and respond within 1 hour. Try to reproduce the issue, then collect browser/OS details and any error messages before handing to engineering. |

### Automated checks

```
npm test    → 22 tests, 22 pass
npm run lint → clean (was 6 errors)
npm run build → clean
```

### Live LLM verification

<!-- LIVE-RESULTS -->

---

## 5. What I would do next

1. **Move the LLM call to a backend.** This is the blocker for shipping anything:
   `dangerouslyAllowBrowser: true` hands the API key to every visitor. A thin server
   route also enables per-tenant rate limits, caching of repeated messages, and request
   logging.
2. **Shared, durable storage with auth.** `localStorage` cannot support a team queue —
   agents can't see each other's work and a manager can't see anything. This is the
   difference between a demo and the product Relay AI is selling.
3. **A feedback loop, which I think is the real long-term moat.** Let an agent correct a
   category or urgency in one click and store the correction. That gives Relay AI three
   things at once: an accuracy metric per customer, a labelled evaluation set that grows
   for free, and few-shot examples to tune each tenant's prompt to their own definition
   of "urgent" — which differs a lot between a law firm and an e-commerce store.
4. **An evaluation harness over a labelled set**, run on every prompt or model change.
   My 12/12-then-2/8 experience is the argument: without held-out measurement you cannot
   tell tuning from overfitting, and prompt changes are just as easy to overfit as
   keyword lists.
5. **Surface confidence and route low-confidence messages to a human queue.** The
   honest-fallback work here is the first step; the next is the model reporting when it
   is unsure, so the tool degrades into "needs review" instead of guessing.
