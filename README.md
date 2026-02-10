# Bible Interpreter

An AI-powered Bible study app. Pick a book and chapter, read the text, select any verses that stand out to you, and get a detailed AI interpretation — complete with historical context, Greek/Hebrew word analysis, and practical application for your life.

The app also includes a personal Bible counselor (Life Application), daily devotionals, topical browsing, reading plans, a prayer journal, and more. All study data syncs across devices with an optional user account.

**Live:** Deployed on Railway

## How It Works

1. **Read** — Choose a book and chapter from the dropdowns. The full chapter text loads from the Bolls.life Bible API (free, no key required).
2. **Select** — Click on verses to highlight them. Pick a highlight color if you want to save it.
3. **Interpret** — Hit the Interpret button. Claude AI analyzes your selected verses and returns a structured interpretation with context, key words, and takeaways.
4. **Go deeper** — Use cross-references, word studies, translation comparisons, or the chapter outline to keep studying.
5. **Get personal** — Open Life Application, describe what's going on in your life, and get relevant passages with personalized explanations.

Everything works without an account (data saves to localStorage). Create an account to sync across devices.

## Features

- **AI Interpretation** — Select verses and get detailed analysis with historical context, key word studies (Greek/Hebrew), and practical application
- **Life Application** — Describe your situation and get 3-5 relevant Bible passages with personalized explanations
- **Daily Devotional** — AI-generated daily devotional with verse reflection, original language insight, and application thought
- **Topical Browse** — Explore passages by topic (faith, anxiety, forgiveness, etc.) or search custom topics
- **Cross References** — Find related passages across the Bible for any selected verses
- **Word Study** — Deep dive into original Greek/Hebrew words with etymology, usage, and theological significance
- **Reading Plans** — Structured plans (Gospels in 40 Days, Psalms in 30 Days, etc.) with streak tracking
- **Prayer Journal** — Save prayers linked to specific verses, mark as answered
- **Highlights & Notes** — Color-coded verse highlighting and per-verse notes
- **Compare Translations** — Side-by-side comparison across ESV, NIV, KJV, NASB, NLT, and more
- **Chapter Outline** — AI-generated structural outline for any chapter
- **User Accounts** — Email/password auth via Supabase with cloud sync across devices
- **Dark Mode** — Full dark/light theme toggle
- **Keyboard Shortcuts** — Quick access to search, menu, topics, life app, and dark mode

## Tech Stack

- **Frontend:** Vanilla HTML/CSS/JS (single `index.html`)
- **Backend:** Node.js + Express
- **AI:** Claude API (Anthropic) — Claude Haiku for interpretations, Sonnet for life application and devotionals
- **Bible API:** [Bolls.life](https://bolls.life) — free, no API key needed, supports 20+ translations
- **Auth & Database:** Supabase (PostgreSQL with Row Level Security)
- **Hosting:** Railway

## Cost

The app uses the Claude API for all AI features. Each interpretation costs roughly $0.01-0.05 depending on verse length. The app tracks cumulative API cost in the header so you can monitor usage. A rate limiter (20 requests/minute) prevents runaway costs.

The Bolls.life Bible API and Supabase free tier cost nothing.

## Setup

### Prerequisites

- Node.js >= 18
- Anthropic API key ([console.anthropic.com](https://console.anthropic.com))
- Supabase project (optional — app works fully without it using localStorage)

### Install

```bash
git clone <repo-url>
cd bible-interpreter
npm install
```

### Environment Variables

Create a `.env` file:

```
ANTHROPIC_API_KEY=your-api-key

# Optional: enables user accounts with cloud sync
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
```

### Supabase Setup (Optional)

If you want user accounts with cloud sync:

1. Create a free Supabase project at [supabase.com](https://supabase.com)
2. Open the SQL Editor and run the contents of `supabase-setup.sql`
3. Go to Authentication > Sign In / Providers and disable "Confirm email" for instant signup
4. Copy your project URL and anon key from Settings > API into `.env`

This creates 6 tables with Row Level Security policies so each user can only access their own data:

- `user_highlights`, `user_notes`, `user_prayers`
- `user_reading_progress`, `user_history`, `user_preferences`

### Run

```bash
npm start            # Production (port 3000)
npm run dev          # Development with auto-reload
PORT=4000 npm start  # Custom port
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/analyze` | Interpret selected verses |
| POST | `/api/chapter` | Fetch chapter text from Bolls.life |
| POST | `/api/compare` | Compare verse across translations |
| POST | `/api/outline` | Generate chapter outline |
| POST | `/api/life-application` | Find passages for a life situation |
| POST | `/api/topical` | Browse passages by topic |
| POST | `/api/daily-devotional` | Generate daily devotional |
| POST | `/api/cross-references` | Find cross-references for verses |
| POST | `/api/word-study` | Deep word study analysis |
| GET | `/api/usage` | API usage stats |
| POST | `/api/usage/reset` | Reset usage counters |
| GET | `/api/config` | Supabase config for frontend |

All AI endpoints are rate-limited to 20 requests per minute per IP.

## Project Structure

```
bible-interpreter/
├── server.js              # Express server + all API routes + Claude prompts
├── public/
│   └── index.html         # Entire frontend (HTML + CSS + JS)
├── supabase-setup.sql     # Database schema for user accounts
├── package.json
└── .env                   # API keys (not committed)
```

The frontend is a single file by design — no build step, no bundler, no framework. Just open and edit.
