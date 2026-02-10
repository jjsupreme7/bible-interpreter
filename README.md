# Bible Interpreter

An AI-powered Bible study app that provides verse-by-verse interpretation with Greek/Hebrew word analysis, historical context, and personalized life application. Built with vanilla HTML/CSS/JS and an Express.js backend using Claude API.

**Live:** Deployed on Railway

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
- **Bible API:** [Bolls.life](https://bolls.life) — multiple translations
- **Auth & Database:** Supabase (PostgreSQL with Row Level Security)
- **Hosting:** Railway

## Setup

### Prerequisites

- Node.js >= 18
- Anthropic API key
- Supabase project (optional — app works without auth using localStorage)

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

# Optional: Supabase for user accounts
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
```

### Supabase Setup (Optional)

If you want user accounts with cloud sync, create a Supabase project and run `supabase-setup.sql` in the SQL Editor. This creates 6 tables with RLS policies:

- `user_highlights`
- `user_notes`
- `user_prayers`
- `user_reading_progress`
- `user_history`
- `user_preferences`

Disable "Confirm email" in Authentication > Sign In / Providers if you want instant signup.

### Run

```bash
npm start          # Production (port 3000)
npm run dev        # Development with auto-reload
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

## Project Structure

```
bible-interpreter/
├── server.js              # Express server + all API routes
├── public/
│   └── index.html         # Entire frontend (HTML + CSS + JS)
├── supabase-setup.sql     # Database schema for user accounts
├── package.json
└── .env                   # API keys (not committed)
```
