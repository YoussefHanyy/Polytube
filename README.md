# EasyGerman Learning — Chrome Extension

A Chrome extension for learning German through YouTube videos. Replaces YouTube's native subtitles with an interactive overlay that helps you understand and retain vocabulary while watching.

## Features

- **Interactive Subtitles** — Hover over any word to instantly see its English translation. Click a word for a full popup with meaning, part of speech, and synonyms.
- **Save Vocabulary** — Save words directly from subtitles to your personal vocabulary list with one click.
- **Spaced Repetition (SM-2)** — Practice saved words using flashcards. The algorithm schedules reviews based on how well you know each word — easy words appear less often, hard words more often.
- **CEFR Word Difficulty** — Words are color-coded by difficulty level. B2 and C1 words are labeled so you instantly know which words are advanced.
- **Pause on Hover** — The video automatically pauses when you hover over the subtitle, giving you time to read and click words without missing anything.
- **Vocabulary Sidebar** — A slide-out panel on the right side of the page shows all your saved words with their meanings, part of speech, and review interval.

## Installation

1. Clone or download this repository
2. Run `npm install` then `npm run build`
3. Open Chrome and go to `chrome://extensions/`
4. Enable **Developer Mode** (top right toggle)
5. Click **Load unpacked** and select the `dist` folder
6. Open any YouTube video, turn on subtitles (press `C`), and start learning

## How to Use

- **Subtitles** appear automatically over the video when YouTube captions are enabled
- **Hover** a word → quick translation tooltip appears, video pauses
- **Click** a word → full popup with meaning and a Save button
- **VOCABULARY** tab (right edge of page) → opens your saved word list
- **Practice** tab → flashcard quiz using spaced repetition

## Tech Stack

- React + Vite
- Chrome Extension Manifest V3
- Google Translate API (free endpoint) for translations
- SM-2 spaced repetition algorithm
