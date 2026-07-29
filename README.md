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

## Overview

The Customer Inbox Triage app is a lightweight AI-powered tool that helps classify customer support messages and recommend actions. It uses Groq AI to categorize messages, applies rule-based urgency scoring, and suggests next steps based on predefined templates.

## Problem Statement

Support teams waste time manually reading and triaging customer messages. This tool provides an automated first pass at classification to help prioritize and route messages more efficiently.

## Tech Stack

- **Frontend**: React + Vite + Tailwind CSS
- **AI**: Groq API (Llama 3.3 70B - Free tier)
- **Runtime**: Browser-based (local development only)

## Setup Instructions

### Prerequisites

- Node.js (v16 or higher)
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
5. **History**: All analyses are saved to localStorage and viewable in the History tab


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
