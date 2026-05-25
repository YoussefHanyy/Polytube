# Multi-Language Frequency System Design
Date: 2026-05-25

## Overview
Replace the CEFR (A1–C2) word-level system with a frequency-rank system. Add multi-language support (German, French, Korean, Arabic). Add a "Words" tab in the sidebar showing all words seen in the current video session grouped by frequency band.

## Frequency Data

Four bundled static JS files, one per language, in `src/data/`:

- `src/data/freq_de.js` — German
- `src/data/freq_fr.js` — French
- `src/data/freq_ko.js` — Korean
- `src/data/freq_ar.js` — Arabic

Each exports a plain object: `{ word: rank }` where rank 1 = most common.
Top 10,000 words per language. Words not in the list are implicitly rank >10,000.
Source: OpenSubtitles/SUBTLEX open-source frequency lists.

`src/data/germanWordLevels.js` is deleted.

## Subtitle Word Coloring

- Words with rank ≤ user threshold → no color (white/default)
- Words with rank > user threshold OR not in list (>10,000) → **pink** highlight
- No level badges (A1/C2 removed entirely)
- One color only: pink

## Settings Panel

The existing gear icon (⚙) in the sidebar header opens a settings panel with two controls:

1. **Language** — dropdown: German / French / Korean / Arabic
2. **Known vocabulary threshold** — number input: "I know the top ___ words" (default: 3000)

Settings persisted to `chrome.storage.local` as `{ language: 'de'|'fr'|'ko'|'ar', threshold: number }`.

## Words Tab

New tab added to sidebar: **Vocabulary | Words | Practice**

Shows all unique words seen in the current video session, grouped by frequency band:

| Band | Rank Range |
|------|-----------|
| Rank 1–1,000 | Most common |
| Rank 1,001–3,000 | Common |
| Rank 3,001–5,000 | Intermediate |
| Rank 5,001–10,000 | Uncommon |
| Above 10,000 | Rare |

- Each word is clickable → same translation popup as subtitle overlay (with Save button)
- `seenWords` resets when user navigates to a new video (URL change detected in content.jsx)
- Words accumulate in `chrome.storage.local` as `seenWords: { word: rank }` during video playback

## Architecture

### Files deleted
- `src/data/germanWordLevels.js`

### Files added
- `src/data/freq_de.js`
- `src/data/freq_fr.js`
- `src/data/freq_ko.js`
- `src/data/freq_ar.js`

### Files modified

**`src/components/SubtitleOverlay.jsx`**
- Import frequency map based on `language` setting
- On each word render: lookup rank, compare to `threshold`, apply pink style if above
- On each new subtitle token: add `{ word, rank }` to `seenWords` in `chrome.storage.local`
- Remove all CEFR level logic and badge rendering
- Change translation API `sl=de` → dynamic `sl={language}`
- Listen to `chrome.storage.onChanged` for settings changes (language/threshold)

**`src/components/Sidebar.jsx`**
- Add "Words" tab between Vocabulary and Practice
- Words tab: read `seenWords` from storage, group by band, render word chips
- Clicking a word chip shows translation popup with Save button
- Add Settings panel (shown when gear icon clicked, not a tab): language dropdown + threshold input
- On settings save: write to `chrome.storage.local`, dismiss panel

**`src/background/background.js`**
- Add `SAVE_SETTINGS` message handler: persist `{ language, threshold }` to storage
- Add `RESET_SEEN_WORDS` message handler: clear `seenWords` (called on video navigation)

**`src/content/content.jsx`**
- On URL change (already detected): send `RESET_SEEN_WORDS` message to background

## Data Flow

```
User changes settings
  → Sidebar writes to chrome.storage.local
  → SubtitleOverlay reads via onChanged listener

SubtitleOverlay processes subtitle text
  → tokenize word
  → lookup rank in bundled freq map for selected language
  → rank > threshold → pink
  → add to seenWords in chrome.storage.local

Sidebar (Words tab)
  → reads seenWords from storage
  → groups into frequency bands
  → renders clickable word chips

User clicks word chip
  → same popup as subtitle click
  → fetches translation with correct sl={language}
  → can save to Vocabulary
```

## Tokenization Notes

- French/German: space-split with Unicode letter regex (existing `\p{L}` regex works)
- Korean: Korean characters are Unicode letters, space-split works for basic cases (Korean uses spaces between words)
- Arabic: RTL — the overlay CSS needs `direction: rtl` when Arabic is selected; `\p{L}` matches Arabic letters correctly
