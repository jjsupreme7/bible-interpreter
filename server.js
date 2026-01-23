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

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

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

  // Match patterns like "1 corinthians 4:3-6" or "romans 8:28" or "gen 1:1"
  const match = ref.match(/^(\d?\s*[a-z]+)\s*(\d+):(\d+)(?:-(\d+))?$/);

  if (!match) {
    throw new Error(`Invalid reference format: ${reference}`);
  }

  const [, bookPart, chapter, startVerse, endVerse] = match;
  const bookName = bookPart.replace(/\s+/g, ' ').trim();

  const bookNum = BOOK_MAP[bookName];
  if (!bookNum) {
    throw new Error(`Unknown book: ${bookPart}`);
  }

  return {
    bookNum,
    bookName: bookPart,
    chapter: parseInt(chapter),
    startVerse: parseInt(startVerse),
    endVerse: endVerse ? parseInt(endVerse) : parseInt(startVerse),
    isOT: bookNum <= 39,
    isNT: bookNum >= 40
  };
}

// API endpoint to analyze a Bible passage
app.post('/api/analyze', async (req, res) => {
  try {
    const { reference, translation = 'ESV' } = req.body;

    if (!reference) {
      return res.status(400).json({ error: 'Reference is required' });
    }

    // Parse the reference
    const parsed = parseReference(reference);

    // Step 1: Fetch passage data from Bible API
    const passageData = await fetchPassageData(parsed, translation);

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
    res.status(500).json({ error: error.message || 'Failed to analyze passage' });
  }
});

// Fetch passage text from Bolls.life API
async function fetchPassageData(parsed, translation = 'ESV') {
  const { bookNum, chapter, startVerse, endVerse } = parsed;

  // Fetch the chapter from Bolls.life
  const url = `https://bolls.life/get-text/${translation}/${bookNum}/${chapter}/`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Failed to fetch passage from Bible API');
  }

  const verses = await response.json();

  // Filter to requested verse range
  const selectedVerses = verses.filter(v =>
    v.verse >= startVerse && v.verse <= endVerse
  );

  if (selectedVerses.length === 0) {
    throw new Error('No verses found for the given reference');
  }

  // Combine verse texts
  const text = selectedVerses.map(v => `${v.verse} ${v.text}`).join(' ');

  return { text, verses: selectedVerses };
}

// Fetch Greek/Hebrew word data
async function fetchWordData(parsed) {
  const { bookNum, chapter, startVerse, endVerse, isNT } = parsed;

  // Use Greek text for NT, Hebrew for OT
  const translation = isNT ? 'TGNT' : 'WLC'; // Tyndale Greek NT or Westminster Leningrad Codex

  const url = `https://bolls.life/get-text/${translation}/${bookNum}/${chapter}/`;

  try {
    const response = await fetch(url);
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
      const response = await fetch(url);

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
  const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
  let keyWords = [];
  let interpretation = responseText;

  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      keyWords = parsed.keyWords || [];
      // Remove the JSON block from the interpretation text
      interpretation = responseText.replace(/```json\s*[\s\S]*?\s*```\s*/, '').trim();
    } catch (e) {
      console.error('Failed to parse key words JSON:', e);
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

## Length
${isMultiVerse ? '500-800' : '400-600'} words (after the JSON block)`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
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

    const bookName = book.toLowerCase().trim();
    const bookNum = BOOK_MAP[bookName];

    if (!bookNum) {
      return res.status(400).json({ error: `Unknown book: ${book}` });
    }

    // Fetch the chapter from Bolls.life
    const url = `https://bolls.life/get-text/${translation}/${bookNum}/${chapter}/`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error('Failed to fetch chapter from Bible API');
    }

    const verses = await response.json();

    // Clean up Strong's numbers and other markup from the text
    const cleanedVerses = verses.map(v => ({
      ...v,
      text: v.text
        .replace(/<S>\d+<\/S>/g, '')  // Remove Strong's numbers
        .replace(/<[^>]+>/g, '')       // Remove any other HTML tags
        .replace(/\s+/g, ' ')          // Normalize whitespace
        .trim()
    }));

    res.json({
      book,
      chapter,
      verses: cleanedVerses
    });
  } catch (error) {
    console.error('Error loading chapter:', error);
    res.status(500).json({ error: error.message || 'Failed to load chapter' });
  }
});

app.listen(PORT, () => {
  console.log(`Bible Interpreter running at http://localhost:${PORT}`);
});
