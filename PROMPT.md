# Bible Interpreter App - Ralph Wiggum Build Prompt

## Goal
Build a fully functional Bible interpretation web app that:
1. Takes a Bible passage reference as input (e.g., "1 Corinthians 4:3-6")
2. Fetches the English text and Greek/Hebrew word data from Bible APIs
3. Uses Claude to generate a "Keller-style" interpretation
4. Displays both the word-level data AND the AI interpretation

## Current State
- Basic project structure exists
- server.js has placeholder functions for API calls
- public/index.html has the UI shell

## What Needs to Be Built

### 1. Bible API Integration (server.js)
Implement `fetchPassageData()` to get English text:
- Use Bolls.life API: `https://bolls.life/get-text/YLT/{book_num}/{chapter}/`
- Parse the reference to extract book, chapter, verses
- Return the passage text

### 2. Word Data Integration (server.js)
Implement `fetchWordData()` to get Greek/Hebrew data:
- Scrape or fetch from BibleHub interlinear OR use another API
- For each word, get: original, transliteration, Strong's number, morphology, definition
- Return array of word objects

### 3. Claude API Integration (server.js)
Implement `generateInterpretation()`:
- Use the Anthropic SDK (already imported)
- Send the passage text and word data to Claude
- Use this prompt style:

```
You are a Bible scholar helping everyday readers understand Scripture the way scholars do — by examining the original Greek (New Testament) or Hebrew (Old Testament) words.

Analyze this passage and explain what the original language reveals. Write like Timothy Keller — accessible to general audiences, not academic, but intellectually rich.

Passage: {reference}
English Text: {text}
Original Language Data: {word_data}

Instructions:
1. Identify 2-4 key words where the original language adds meaning
2. For each key word, explain the original meaning, etymology, and usage patterns
3. Synthesize what this reveals about the passage
4. End with practical application

Tone: Conversational, not academic. Show curiosity and discovery.
Length: 400-600 words
```

### 4. Reference Parsing
Create a utility to parse Bible references:
- "1 Corinthians 4:3-6" → { book: "1CO", chapter: 4, startVerse: 3, endVerse: 6 }
- Handle various formats (1 Cor, 1Cor, First Corinthians, etc.)
- Map book names to API-expected format

### 5. Error Handling
- Handle invalid references gracefully
- Handle API failures with user-friendly messages
- Handle missing word data (some verses may not have full interlinear data)

## Book Number Reference for Bolls API
- Genesis = 1, Exodus = 2, ... Matthew = 40, Mark = 41, ... 1 Corinthians = 46, ...

## Testing
The app should work for these passages:
- 1 Corinthians 4:3-6 (the Keller passage - Greek)
- Romans 8:28 (popular verse - Greek)
- Philippians 2:5-8 (Christ hymn - Greek)
- Genesis 1:1 (Hebrew)
- Psalm 23:1 (Hebrew)

## Definition of Done
Output `<promise>APP COMPLETE</promise>` when:
1. User can enter a Bible reference
2. App fetches and displays English text
3. App fetches and displays Greek/Hebrew word breakdown
4. App generates and displays AI interpretation
5. App handles errors gracefully
6. App works for both OT (Hebrew) and NT (Greek) passages

## Files to Modify
- /Users/jacoballen/bible-interpreter/server.js - Main logic
- /Users/jacoballen/bible-interpreter/public/index.html - UI improvements if needed

## Do NOT
- Add user authentication (out of scope)
- Add database/persistence (out of scope)
- Add deployment config (out of scope)
- Over-engineer - keep it simple and functional
