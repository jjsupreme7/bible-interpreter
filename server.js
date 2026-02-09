require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.disable('x-powered-by');

// Simple rate limiter for /api/analyze (20 requests per minute per IP)
const rateLimitMap = new Map();
function rateLimit(req, res, next) {
  const ip = req.ip;
  const now = Date.now();
  const windowMs = 60000;
  const maxRequests = 20;
  if (!rateLimitMap.has(ip)) rateLimitMap.set(ip, []);
  const timestamps = rateLimitMap.get(ip).filter(t => now - t < windowMs);
  if (timestamps.length >= maxRequests) {
    return res.status(429).json({ error: 'Too many requests. Please wait a moment.' });
  }
  timestamps.push(now);
  rateLimitMap.set(ip, timestamps);
  next();
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const ALLOWED_TRANSLATIONS = new Set([
  'NIV2011',
  'ESV',
  'KJV',
  'NLT',
  'NKJV',
  'CSB17',
  'NASB',
  'MSG',
  'AMP',
]);

function normalizeTranslation(translation) {
  const t = String(translation || '').trim();
  const fallback = 'ESV';
  const resolved = t || fallback;
  if (!ALLOWED_TRANSLATIONS.has(resolved)) {
    throw new HttpError(400, `Unsupported translation: ${resolved}`);
  }
  return resolved;
}

// Usage tracking
const USAGE_FILE = path.join(__dirname, 'usage.json');

// Claude Sonnet pricing (as of 2024)
const PRICING = {
  inputPerMillion: 3.00,   // $3 per million input tokens
  outputPerMillion: 15.00  // $15 per million output tokens
};

function loadUsage() {
  try {
    if (fs.existsSync(USAGE_FILE)) {
      return JSON.parse(fs.readFileSync(USAGE_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Error loading usage file:', e);
  }
  return {
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalRequests: 0,
    requests: []
  };
}

function saveUsage(usage) {
  try {
    fs.writeFileSync(USAGE_FILE, JSON.stringify(usage, null, 2));
  } catch (e) {
    console.error('Error saving usage file:', e);
  }
}

function trackUsage(reference, inputTokens, outputTokens) {
  const usage = loadUsage();
  usage.totalInputTokens += inputTokens;
  usage.totalOutputTokens += outputTokens;
  usage.totalRequests += 1;
  usage.requests.push({
    timestamp: new Date().toISOString(),
    reference,
    inputTokens,
    outputTokens,
    estimatedCost: calculateCost(inputTokens, outputTokens)
  });
  // Keep only last 100 requests to avoid huge file
  if (usage.requests.length > 100) {
    usage.requests = usage.requests.slice(-100);
  }
  saveUsage(usage);
  return usage;
}

function calculateCost(inputTokens, outputTokens) {
  const inputCost = (inputTokens / 1000000) * PRICING.inputPerMillion;
  const outputCost = (outputTokens / 1000000) * PRICING.outputPerMillion;
  return inputCost + outputCost;
}

function cleanBibleText(text) {
  return String(text || '')
    .replace(/<S>[A-Za-z]?\d+<\/S>/g, '') // Remove Strong's numbers
    .replace(/<[^>]+>/g, '') // Remove other HTML tags
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

const CHAPTER_CACHE = new Map();
const CHAPTER_CACHE_MAX = 250;

async function fetchBollsChapter(translation, bookNum, chapter) {
  const cacheKey = `${translation}:${bookNum}:${chapter}`;
  if (CHAPTER_CACHE.has(cacheKey)) return CHAPTER_CACHE.get(cacheKey);

  const url = `https://bolls.life/get-text/${translation}/${bookNum}/${chapter}/`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  let response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    throw new HttpError(502, 'Failed to fetch passage from Bible API');
  }

  const verses = await response.json();
  CHAPTER_CACHE.set(cacheKey, verses);

  if (CHAPTER_CACHE.size > CHAPTER_CACHE_MAX) {
    const firstKey = CHAPTER_CACHE.keys().next().value;
    if (firstKey) CHAPTER_CACHE.delete(firstKey);
  }

  return verses;
}

// Book name to number mapping for Bolls.life API
const BOOK_MAP = {
  // Old Testament
  'genesis': 1, 'gen': 1, 'ge': 1,
  'exodus': 2, 'exod': 2, 'ex': 2,
  'leviticus': 3, 'lev': 3, 'le': 3,
  'numbers': 4, 'num': 4, 'nu': 4,
  'deuteronomy': 5, 'deut': 5, 'de': 5,
  'joshua': 6, 'josh': 6, 'jos': 6,
  'judges': 7, 'judg': 7, 'jdg': 7,
  'ruth': 8, 'ru': 8,
  '1 samuel': 9, '1samuel': 9, '1sam': 9, '1sa': 9,
  '2 samuel': 10, '2samuel': 10, '2sam': 10, '2sa': 10,
  '1 kings': 11, '1kings': 11, '1ki': 11,
  '2 kings': 12, '2kings': 12, '2ki': 12,
  '1 chronicles': 13, '1chronicles': 13, '1chr': 13, '1ch': 13,
  '2 chronicles': 14, '2chronicles': 14, '2chr': 14, '2ch': 14,
  'ezra': 15, 'ezr': 15,
  'nehemiah': 16, 'neh': 16, 'ne': 16,
  'esther': 17, 'esth': 17, 'es': 17,
  'job': 18, 'jb': 18,
  'psalms': 19, 'psalm': 19, 'ps': 19, 'psa': 19,
  'proverbs': 20, 'prov': 20, 'pr': 20,
  'ecclesiastes': 21, 'eccl': 21, 'ecc': 21, 'ec': 21,
  'song of solomon': 22, 'song': 22, 'sos': 22, 'ss': 22,
  'isaiah': 23, 'isa': 23, 'is': 23,
  'jeremiah': 24, 'jer': 24, 'je': 24,
  'lamentations': 25, 'lam': 25, 'la': 25,
  'ezekiel': 26, 'ezek': 26, 'eze': 26,
  'daniel': 27, 'dan': 27, 'da': 27,
  'hosea': 28, 'hos': 28, 'ho': 28,
  'joel': 29, 'joe': 29,
  'amos': 30, 'am': 30,
  'obadiah': 31, 'obad': 31, 'ob': 31,
  'jonah': 32, 'jon': 32,
  'micah': 33, 'mic': 33,
  'nahum': 34, 'nah': 34, 'na': 34,
  'habakkuk': 35, 'hab': 35,
  'zephaniah': 36, 'zeph': 36, 'zep': 36,
  'haggai': 37, 'hag': 37,
  'zechariah': 38, 'zech': 38, 'zec': 38,
  'malachi': 39, 'mal': 39,
  // New Testament
  'matthew': 40, 'matt': 40, 'mt': 40,
  'mark': 41, 'mk': 41, 'mr': 41,
  'luke': 42, 'lk': 42, 'lu': 42,
  'john': 43, 'jn': 43, 'joh': 43,
  'acts': 44, 'ac': 44,
  'romans': 45, 'rom': 45, 'ro': 45,
  '1 corinthians': 46, '1corinthians': 46, '1cor': 46, '1co': 46,
  '2 corinthians': 47, '2corinthians': 47, '2cor': 47, '2co': 47,
  'galatians': 48, 'gal': 48, 'ga': 48,
  'ephesians': 49, 'eph': 49,
  'philippians': 50, 'phil': 50, 'php': 50,
  'colossians': 51, 'col': 51,
  '1 thessalonians': 52, '1thessalonians': 52, '1thess': 52, '1th': 52,
  '2 thessalonians': 53, '2thessalonians': 53, '2thess': 53, '2th': 53,
  '1 timothy': 54, '1timothy': 54, '1tim': 54, '1ti': 54,
  '2 timothy': 55, '2timothy': 55, '2tim': 55, '2ti': 55,
  'titus': 56, 'tit': 56,
  'philemon': 57, 'phlm': 57, 'phm': 57,
  'hebrews': 58, 'heb': 58,
  'james': 59, 'jas': 59, 'jm': 59,
  '1 peter': 60, '1peter': 60, '1pet': 60, '1pe': 60,
  '2 peter': 61, '2peter': 61, '2pet': 61, '2pe': 61,
  '1 john': 62, '1john': 62, '1jn': 62,
  '2 john': 63, '2john': 63, '2jn': 63,
  '3 john': 64, '3john': 64, '3jn': 64,
  'jude': 65, 'jud': 65,
  'revelation': 66, 'rev': 66, 're': 66
};

// Parse a Bible reference string into components
function parseReference(reference) {
  // Normalize: lowercase, trim
  const ref = reference.toLowerCase().trim();

  // Match patterns like:
  // - "1 corinthians 4:3-6"
  // - "romans 8:28"
  // - "song of solomon 2:1"
  // - "1john3:16"
  const match = ref.match(/^(.+?)\s*(\d+):(\d+)(?:-(\d+))?$/);

  if (!match) {
    throw new HttpError(400, `Invalid reference format: ${reference}`);
  }

  const [, bookPart, chapter, startVerse, endVerse] = match;
  const bookName = bookPart
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const bookNum = BOOK_MAP[bookName];
  if (!bookNum) {
    throw new HttpError(400, `Unknown book: ${bookPart}`);
  }

  return {
    bookNum,
    bookName: bookName,
    chapter: parseInt(chapter),
    startVerse: parseInt(startVerse),
    endVerse: endVerse ? parseInt(endVerse) : parseInt(startVerse),
    isOT: bookNum <= 39,
    isNT: bookNum >= 40
  };
}

// API endpoint to analyze a Bible passage
app.post('/api/analyze', rateLimit, async (req, res) => {
  try {
    const { reference, translation = 'ESV' } = req.body;

    if (!reference) {
      return res.status(400).json({ error: 'Reference is required' });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      throw new HttpError(500, 'Server missing ANTHROPIC_API_KEY');
    }

    const normalizedTranslation = normalizeTranslation(translation);

    // Parse the reference
    const parsed = parseReference(reference);

    // Step 1: Fetch passage data from Bible API
    const passageData = await fetchPassageData(parsed, normalizedTranslation);

    // Step 2: Fetch Greek/Hebrew word data (kept for potential future use)
    const wordData = await fetchWordData(parsed);

    // Step 3: Generate AI interpretation (now returns structured data)
    const result = await generateInterpretation(reference, passageData, wordData, parsed);

    res.json({
      reference,
      englishText: passageData.text,
      words: result.keyWords,  // Use AI-extracted key words
      interpretation: result.interpretation
    });
  } catch (error) {
    console.error('Error analyzing passage:', error);
    const status = error instanceof HttpError ? error.status : 500;
    res.status(status).json({ error: error.message || 'Failed to analyze passage' });
  }
});

// Fetch passage text from Bolls.life API
async function fetchPassageData(parsed, translation = 'ESV') {
  const { bookNum, chapter, startVerse, endVerse } = parsed;
  const normalizedTranslation = normalizeTranslation(translation);

  // Fetch the chapter from Bolls.life (cached)
  const verses = await fetchBollsChapter(normalizedTranslation, bookNum, chapter);

  // Filter to requested verse range
  const selectedVerses = verses.filter(v =>
    v.verse >= startVerse && v.verse <= endVerse
  );

  if (selectedVerses.length === 0) {
    throw new HttpError(404, 'No verses found for the given reference');
  }

  // Combine verse texts
  const text = selectedVerses
    .map(v => `${v.verse} ${cleanBibleText(v.text)}`)
    .join(' ');

  return { text, verses: selectedVerses };
}

// Fetch Greek/Hebrew word data
async function fetchWordData(parsed) {
  const { bookNum, chapter, startVerse, endVerse, isNT } = parsed;

  // Use Greek text for NT, Hebrew for OT
  const translation = isNT ? 'TGNT' : 'WLC'; // Tyndale Greek NT or Westminster Leningrad Codex

  const url = `https://bolls.life/get-text/${translation}/${bookNum}/${chapter}/`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let response;
    try {
      response = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) {
      console.log('Original language text not available, skipping word data');
      return [];
    }

    const verses = await response.json();

    // Filter to requested verse range
    const selectedVerses = verses.filter(v =>
      v.verse >= startVerse && v.verse <= endVerse
    );

    // Extract words from the original language text
    const words = [];
    for (const verse of selectedVerses) {
      // Split text into words (simple approach)
      const verseWords = verse.text.split(/\s+/).filter(w => w.length > 0);
      for (const word of verseWords) {
        words.push({
          original: word,
          transliteration: '', // Would need additional API for this
          strongs: '', // Would need additional API for Strong's numbers
          morphology: '',
          definition: '',
          verse: verse.verse
        });
      }
    }

    // Try to get lexicon definitions for unique words
    const uniqueWords = [...new Set(words.map(w => w.original))];
    const definitions = await fetchDefinitions(uniqueWords, isNT);

    // Merge definitions back into words
    for (const word of words) {
      if (definitions[word.original]) {
        Object.assign(word, definitions[word.original]);
      }
    }

    return words;
  } catch (error) {
    console.error('Error fetching word data:', error);
    return [];
  }
}

// Fetch definitions from Bolls.life dictionary
async function fetchDefinitions(words, isNT) {
  const definitions = {};
  const dict = isNT ? 'TGNT' : 'BDB'; // Thayer's Greek or Brown-Driver-Briggs Hebrew

  // Fetch definitions for each word (limit to avoid too many requests)
  const wordsToFetch = words.slice(0, 20);

  for (const word of wordsToFetch) {
    try {
      const url = `https://bolls.life/dictionary-definition/${dict}/${encodeURIComponent(word)}/`;
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 5000);
      let response;
      try {
        response = await fetch(url, { signal: ctrl.signal });
      } finally {
        clearTimeout(t);
      }

      if (response.ok) {
        const data = await response.json();
        if (data && data.definition) {
          definitions[word] = {
            definition: data.definition,
            strongs: data.strongs || '',
            transliteration: data.transliteration || ''
          };
        }
      }
    } catch (e) {
      // Skip words without definitions
    }
  }

  return definitions;
}

// Parse Claude's response to extract structured word data
function parseInterpretationResponse(responseText) {
  let keyWords = [];

  // Prefer an explicitly marked JSON block; fall back to any code block containing "keyWords".
  const candidates = [];
  const explicit = responseText.match(/```json\s*([\s\S]*?)\s*```/i);
  if (explicit) candidates.push(explicit);

  const anyBlocks = [...responseText.matchAll(/```[a-z0-9_-]*\s*([\s\S]*?)\s*```/gi)];
  for (const block of anyBlocks) {
    if (String(block[1]).includes('"keyWords"')) candidates.push(block);
  }

  let interpretation = responseText;
  for (const match of candidates) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed && Array.isArray(parsed.keyWords)) {
        keyWords = parsed.keyWords;
        interpretation = responseText.replace(match[0], '').trim();
        break;
      }
    } catch (e) {
      // Keep trying other candidates
    }
  }

  return { keyWords, interpretation };
}

// Generate AI interpretation using Claude
async function generateInterpretation(reference, passageData, wordData, parsed) {
  const isNT = parsed.isNT;
  const language = isNT ? 'Greek' : 'Hebrew';
  const strongsPrefix = isNT ? 'G' : 'H';

  // Build verse list for multi-verse organization
  const verses = [];
  for (let v = parsed.startVerse; v <= parsed.endVerse; v++) {
    verses.push(v);
  }
  const isMultiVerse = verses.length > 1;

  const prompt = `You are a Bible scholar helping everyday readers understand Scripture the way scholars do — by examining the original ${language} words.

## Your Task
Analyze this passage and explain what the original language reveals. Write like Timothy Keller — accessible to general audiences, not academic, but intellectually rich.

## Passage
${reference}

## English Text
${passageData.text}

## Output Format

**Step 1:** Begin your response with a JSON code block containing 2-4 key ${language} words you'll analyze:

\`\`\`json
{
  "keyWords": [
    {
      "original": "the ${language} word",
      "transliteration": "phonetic pronunciation",
      "strongs": "${strongsPrefix}####",
      "definition": "core meaning (15 words max)",
      "verse": <verse number where this word appears>
    }
  ]
}
\`\`\`

**Step 2:** After the JSON block, provide your interpretation.

${isMultiVerse ? `## Verse-by-Verse Organization

Since multiple verses are selected (verses ${verses.join(', ')}), organize your analysis with clear headers:

${verses.map(v => `### Verse ${v}\n[Analysis of key words and meaning in verse ${v}]`).join('\n\n')}

### Synthesis
[How these verses connect; the author's flow of thought; why this matters today]
` : `## Analysis Structure

Organize your interpretation with clear sections:
- Explain each key word's significance
- Synthesize the overall insight
- End with practical application
`}

## Key Word Selection
Focus on words where ${language} adds meaning English misses:
- Words with rich etymology
- Repeated words showing emphasis
- Words with theological weight
- Idioms that don't translate directly

## Tone
- Conversational, not academic
- Use ${language} words but always explain them
- Show genuine curiosity ("Notice that Paul doesn't use the normal word for...")
- Avoid churchy jargon

## Cross-References
At the end of your interpretation, add a section:

### Related Passages
List 2-3 cross-references that illuminate this passage. Format each as:
- **[Book Chapter:Verse]** — One sentence explaining the connection.

## Length
${isMultiVerse ? '500-800' : '400-600'} words (after the JSON block, not counting cross-references)`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1500,
      messages: [
        { role: 'user', content: prompt }
      ]
    });

    // Track usage
    const inputTokens = message.usage?.input_tokens || 0;
    const outputTokens = message.usage?.output_tokens || 0;
    trackUsage(reference, inputTokens, outputTokens);

    console.log(`API Usage - Input: ${inputTokens}, Output: ${outputTokens}, Cost: $${calculateCost(inputTokens, outputTokens).toFixed(4)}`);

    // Parse the response to extract structured data
    const rawResponse = message.content[0].text;
    return parseInterpretationResponse(rawResponse);
  } catch (error) {
    console.error('Claude API error:', error);
    return {
      keyWords: [],
      interpretation: 'Unable to generate interpretation. Please check your API key and try again.'
    };
  }
}

// API endpoint to get usage stats
app.get('/api/usage', (req, res) => {
  const usage = loadUsage();
  const totalCost = calculateCost(usage.totalInputTokens, usage.totalOutputTokens);
  res.json({
    totalInputTokens: usage.totalInputTokens,
    totalOutputTokens: usage.totalOutputTokens,
    totalRequests: usage.totalRequests,
    totalCost: totalCost,
    formattedCost: `$${totalCost.toFixed(4)}`,
    recentRequests: usage.requests.slice(-10).reverse(),
    pricing: PRICING
  });
});

// API endpoint to reset usage stats
app.post('/api/usage/reset', (req, res) => {
  const emptyUsage = {
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalRequests: 0,
    requests: []
  };
  saveUsage(emptyUsage);
  res.json({ message: 'Usage stats reset', usage: emptyUsage });
});

// API endpoint to load a full chapter
app.post('/api/chapter', async (req, res) => {
  try {
    const { book, chapter, translation = 'ESV' } = req.body;

    if (!book || !chapter) {
      return res.status(400).json({ error: 'Book and chapter are required' });
    }

    const normalizedTranslation = normalizeTranslation(translation);

    const bookName = book.toLowerCase().trim();
    const bookNum = BOOK_MAP[bookName];

    if (!bookNum) {
      return res.status(400).json({ error: `Unknown book: ${book}` });
    }

    // Fetch the chapter from Bolls.life (cached)
    const verses = await fetchBollsChapter(normalizedTranslation, bookNum, chapter);

    // Clean up Strong's numbers and other markup from the text
    const cleanedVerses = verses.map(v => ({
      ...v,
      text: cleanBibleText(v.text)
    }));

    res.json({
      book,
      chapter,
      verses: cleanedVerses
    });
  } catch (error) {
    console.error('Error loading chapter:', error);
    const status = error instanceof HttpError ? error.status : 500;
    res.status(status).json({ error: error.message || 'Failed to load chapter' });
  }
});

// Compare translations endpoint
app.post('/api/compare', async (req, res) => {
  try {
    const { book, chapter, startVerse, endVerse, translations } = req.body;
    if (!book || !chapter || !startVerse) {
      return res.status(400).json({ error: 'Book, chapter, and startVerse are required' });
    }
    const bookName = book.toLowerCase().trim();
    const bookNum = BOOK_MAP[bookName];
    if (!bookNum) {
      return res.status(400).json({ error: `Unknown book: ${book}` });
    }
    const end = endVerse || startVerse;
    const translationList = translations || ['ESV', 'KJV', 'NLT', 'NIV2011'];
    const results = {};
    await Promise.all(translationList.map(async (t) => {
      try {
        const normalized = normalizeTranslation(t);
        const verses = await fetchBollsChapter(normalized, bookNum, chapter);
        const selected = verses
          .filter(v => v.verse >= startVerse && v.verse <= end)
          .map(v => ({ verse: v.verse, text: cleanBibleText(v.text) }));
        results[t] = selected;
      } catch (e) {
        results[t] = [{ verse: startVerse, text: '(Translation unavailable)' }];
      }
    }));
    res.json({ book, chapter, startVerse, endVerse: end, translations: results });
  } catch (error) {
    console.error('Error comparing translations:', error);
    res.status(500).json({ error: error.message || 'Failed to compare translations' });
  }
});

// Generate chapter outline/TOC
app.post('/api/outline', rateLimit, async (req, res) => {
  try {
    const { book, chapter } = req.body;
    if (!book || !chapter) {
      return res.status(400).json({ error: 'Book and chapter are required' });
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new HttpError(500, 'Server missing ANTHROPIC_API_KEY');
    }
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 400,
      messages: [{
        role: 'user',
        content: `For ${book} chapter ${chapter} in the Bible, provide a brief section outline. Return ONLY a JSON array with 3-6 sections. Each object must have "title" (short heading, 5 words max) and "verses" (range string like "1-5" or "16-21"). Example: [{"title":"Nicodemus Visits Jesus","verses":"1-15"},{"title":"God So Loved the World","verses":"16-21"}]. Return ONLY the JSON array, no other text.`
      }]
    });
    const inputTokens = message.usage?.input_tokens || 0;
    const outputTokens = message.usage?.output_tokens || 0;
    trackUsage(`${book} ${chapter} (outline)`, inputTokens, outputTokens);
    const text = message.content[0].text.trim();
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    const sections = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    res.json({ book, chapter, sections });
  } catch (error) {
    console.error('Error generating outline:', error);
    const status = error instanceof HttpError ? error.status : 500;
    res.status(status).json({ error: error.message || 'Failed to generate outline' });
  }
});

// Life Application - find relevant passages for user's life situation
app.post('/api/life-application', rateLimit, async (req, res) => {
  try {
    const { situation } = req.body;

    if (!situation || typeof situation !== 'string' || situation.trim().length < 10) {
      return res.status(400).json({
        error: 'Please describe your situation in at least a few words.'
      });
    }

    if (situation.length > 500) {
      return res.status(400).json({ error: 'Please keep your description under 500 characters.' });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      throw new HttpError(500, 'Server missing ANTHROPIC_API_KEY');
    }

    const prompt = `You are a wise pastoral counselor who knows the Bible deeply. Someone has come to you and shared what's going on in their life. Your job is to find 3-5 Bible passages that genuinely speak to their situation — not just popular "go-to" verses, but passages that really connect.

## The Person's Situation
"${situation.trim()}"

## Your Task
Find 3-5 Bible passages that are genuinely relevant to this person's situation. For each passage:
1. Choose a specific passage (book, chapter, and verse range — keep it to 1-4 verses so it's focused)
2. Include the key verse text (paraphrase briefly if needed, but stay faithful)
3. Explain specifically HOW this passage connects to what they described — not generic "this is comforting" but precisely why it matters for their situation
4. Include one Greek or Hebrew word insight that deepens the meaning

## Guidelines
- Reach beyond the "usual suspects" — if Jeremiah 29:11 or Philippians 4:13 genuinely fits, fine, but prefer less obvious passages that are more precisely relevant
- Draw from across the whole Bible: Old Testament narratives, Psalms, Prophets, Gospels, Epistles
- The Greek/Hebrew insight should illuminate the passage in a way that matters for this person's situation, not just be a fun fact
- Write like Timothy Keller: warm, intellectually honest, never preachy, genuinely curious about the text
- Address the person directly using "you" and "your"
- If the situation involves pain, acknowledge it before offering hope — don't rush past lament
- Keep each explanation to 2-3 sentences — enough to be meaningful, short enough to invite further reading

## Output Format
Return ONLY a JSON object with this exact structure (no other text before or after):

\`\`\`json
{
  "passages": [
    {
      "reference": "Book Chapter:StartVerse-EndVerse",
      "book": "Book",
      "chapter": 1,
      "startVerse": 1,
      "endVerse": 3,
      "verseText": "The key verse text (brief, 1-2 verses max)",
      "connection": "2-3 sentences explaining how this specifically connects to their situation",
      "greekHebrew": {
        "word": "the original language word",
        "transliteration": "how to pronounce it",
        "language": "Greek or Hebrew",
        "insight": "One sentence explaining what this word reveals"
      }
    }
  ],
  "encouragement": "One warm, brief closing sentence (not a Bible verse — just a human word of encouragement)"
}
\`\`\`

Important: The "reference" field must use standard Bible reference format (e.g., "Romans 8:26-28", "Psalm 34:18", "1 Peter 5:7"). Use full book names, not abbreviations. For single-verse passages, use format like "Psalm 34:18" (no range needed).`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 2000,
      messages: [
        { role: 'user', content: prompt }
      ]
    });

    const inputTokens = message.usage?.input_tokens || 0;
    const outputTokens = message.usage?.output_tokens || 0;
    trackUsage('life-application', inputTokens, outputTokens);

    console.log(`Life App - Input: ${inputTokens}, Output: ${outputTokens}, Cost: $${calculateCost(inputTokens, outputTokens).toFixed(4)}`);

    const responseText = message.content[0].text;

    // Extract JSON from the response
    let result;
    const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      result = JSON.parse(jsonMatch[1]);
    } else {
      result = JSON.parse(responseText.trim());
    }

    if (!result || !Array.isArray(result.passages)) {
      throw new HttpError(500, 'Invalid response format from AI');
    }

    res.json(result);

  } catch (error) {
    console.error('Life Application error:', error);
    if (error instanceof SyntaxError) {
      return res.status(500).json({ error: 'Failed to parse AI response. Please try again.' });
    }
    const status = error instanceof HttpError ? error.status : 500;
    res.status(status).json({ error: error.message || 'Failed to find passages' });
  }
});

app.listen(PORT, () => {
  console.log(`Bible Interpreter running at http://localhost:${PORT}`);
});
