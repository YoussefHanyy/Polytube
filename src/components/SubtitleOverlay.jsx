import React, { useState, useEffect, useRef, useCallback } from 'react';
import freqDe from '../data/freq_de';
import freqFr from '../data/freq_fr';
import freqKo from '../data/freq_ko';
import freqAr from '../data/freq_ar';
import WordPopup from './WordPopup';

const FREQ_MAPS = { de: freqDe, fr: freqFr, ko: freqKo, ar: freqAr };
const PINK = '#f472b6';

// ─── YouTube Provider ─────────────────────────────────────────────────────────
class YouTubeSubtitleProvider {
  constructor() { this._intervalId = null; this._last = ""; }
  getName() { return "youtube"; }

  start(callback) {
    let chunkOffset = 0;
    let prevTotalWords = 0;
    const CHUNK_SIZE = 10;

    this._intervalId = setInterval(() => {
      let text = '';

      const windows = document.querySelectorAll('.caption-window');
      if (windows.length > 0) {
        const lastWin = windows[windows.length - 1];
        const segs = lastWin.querySelectorAll('.ytp-caption-segment');
        const parts = [];
        segs.forEach(seg => { const t = seg.textContent.trim(); if (t) parts.push(t); });
        text = parts.join(' ');
      }

      if (!text) {
        const container = document.querySelector('.ytp-caption-window-container');
        if (container) text = container.textContent.trim();
      }

      if (!text) {
        if (this._last !== '') { this._last = ''; callback(''); }
        return;
      }

      const words = text.trim().split(/\s+/).filter(Boolean);
      const total = words.length;

      if (total < prevTotalWords * 0.6 || chunkOffset >= total) {
        chunkOffset = 0;
      }
      prevTotalWords = total;

      const chunkWords = words.slice(chunkOffset);

      if (chunkWords.length >= CHUNK_SIZE) {
        chunkOffset = total;
        return;
      }

      if (chunkWords.length === 0) return;

      const display = chunkWords.join(' ');
      if (display !== this._last) {
        this._last = display;
        callback(display);
      }
    }, 50);
  }

  stop() { clearInterval(this._intervalId); }
}

// ─── TextTrack Provider ───────────────────────────────────────────────────────
class TextTrackSubtitleProvider {
  constructor(videoElement) { this._video = videoElement; this._track = null; this._onCueChange = null; }
  getName() { return "texttrack"; }

  start(callback) {
    const tracks = this._video.textTracks;
    for (let i = 0; i < tracks.length; i++) {
      if (tracks[i].kind === 'subtitles' || tracks[i].kind === 'captions') {
        this._track = tracks[i];
        if (this._track.mode === 'disabled') this._track.mode = 'hidden';
        break;
      }
    }
    if (!this._track) return;
    this._onCueChange = () => {
      const cues = this._track.activeCues;
      if (!cues || cues.length === 0) { callback(""); return; }
      const text = Array.from(cues).map(c => c.text).join(' ').replace(/<[^>]*>/g, '').trim();
      callback(text);
    };
    this._track.addEventListener('cuechange', this._onCueChange);
  }

  stop() { if (this._track && this._onCueChange) this._track.removeEventListener('cuechange', this._onCueChange); }
}

// ─── Generic Provider ─────────────────────────────────────────────────────────
class GenericSubtitleProvider {
  constructor() { this._observer = null; this._last = ""; this._timer = null; }
  getName() { return "generic"; }

  static SELECTORS = [
    '[class*="subtitle"]','[class*="caption"]','[class*="closed-caption"]',
    '.vp-captions-line','.jw-text-track-cue','.vjs-text-track-cue','.plyr__captions span',
    '[data-testid="subtitle"]',
  ];

  start(callback) {
    this._observer = new MutationObserver(() => {
      let text = "";
      for (const sel of GenericSubtitleProvider.SELECTORS) {
        const els = document.querySelectorAll(sel);
        if (els.length > 0) {
          const parts = new Set();
          els.forEach(el => { const t = el.textContent.trim(); if (t) parts.add(t); });
          text = Array.from(parts).join(' ');
          break;
        }
      }
      if (text !== this._last) {
        this._last = text;
        clearTimeout(this._timer);
        this._timer = setTimeout(() => callback(text), 300);
      }
    });
    this._observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  stop() { if (this._observer) this._observer.disconnect(); clearTimeout(this._timer); }
}

// ─── SubtitleOverlay Component ────────────────────────────────────────────────
const SubtitleOverlay = ({ videoElement }) => {
  const [subtitle, setSubtitle] = useState("");
  const [visible, setVisible] = useState(false);
  const [hoveredWord, setHoveredWord] = useState(null);
  const [clickedWord, setClickedWord] = useState(null);
  const [settings, setSettings] = useState({ language: 'de', threshold: 3000 });

  const providerRef = useRef(null);
  const clearTimerRef = useRef(null);
  const videoRef = useRef(videoElement);
  const pausedByHoverRef = useRef(false);
  const seenWordsRef = useRef({});

  useEffect(() => { videoRef.current = videoElement; }, [videoElement]);

  // Load settings from storage
  useEffect(() => {
    chrome.storage.local.get(['language', 'threshold'], (result) => {
      setSettings({
        language: result.language || 'de',
        threshold: result.threshold ?? 3000,
      });
    });
    const onStorageChange = (changes) => {
      const updated = {};
      if (changes.language) updated.language = changes.language.newValue;
      if (changes.threshold) updated.threshold = changes.threshold.newValue;
      if (Object.keys(updated).length) setSettings(prev => ({ ...prev, ...updated }));
    };
    chrome.storage.onChanged.addListener(onStorageChange);
    return () => chrome.storage.onChanged.removeListener(onStorageChange);
  }, []);

  // Clear local ref when language changes so new session starts fresh
  useEffect(() => {
    seenWordsRef.current = {};
  }, [settings.language]);

  // Track seen words (deduplicated, per-language storage key)
  const trackWord = useCallback((word, rank) => {
    const wordKey = word.toLowerCase();
    if (seenWordsRef.current[wordKey] !== undefined) return;
    seenWordsRef.current[wordKey] = rank;
    const storageKey = `seenWords_${settings.language}`;
    chrome.storage.local.get([storageKey], (result) => {
      const existing = result[storageKey] || {};
      if (existing[wordKey] !== undefined) return;
      existing[wordKey] = rank;
      chrome.storage.local.set({ [storageKey]: existing });
    });
  }, [settings.language]);

  const showSubtitle = useCallback((text) => {
    clearTimeout(clearTimerRef.current);
    if (!text) {
      clearTimerRef.current = setTimeout(() => {
        setVisible(false);
        setTimeout(() => setSubtitle(""), 250);
      }, 200);
      return;
    }
    setSubtitle(text);
    setVisible(true);
    setClickedWord(null);
    setHoveredWord(null);
  }, []);

  useEffect(() => {
    const isYouTube = !!document.querySelector('.html5-video-player');
    const hasTextTracks = videoElement?.textTracks?.length > 0;

    let provider;
    if (isYouTube) provider = new YouTubeSubtitleProvider();
    else if (hasTextTracks) provider = new TextTrackSubtitleProvider(videoElement);
    else provider = new GenericSubtitleProvider();

    providerRef.current = provider;
    provider.start(showSubtitle);

    const onTrackAdded = () => {
      if (provider.getName() !== 'texttrack' && videoElement?.textTracks?.length > 0) {
        provider.stop();
        const p = new TextTrackSubtitleProvider(videoElement);
        providerRef.current = p;
        p.start(showSubtitle);
      }
    };
    if (videoElement?.textTracks) videoElement.textTracks.addEventListener('addtrack', onTrackAdded);

    return () => {
      provider.stop();
      if (videoElement?.textTracks) videoElement.textTracks.removeEventListener('addtrack', onTrackAdded);
      clearTimeout(clearTimerRef.current);
    };
  }, [videoElement, showSubtitle]);

  // ─── Pause on hover ───
  const handleSubtitleMouseEnter = () => {
    const video = videoRef.current;
    if (video && !video.paused) {
      video.pause();
      pausedByHoverRef.current = true;
    }
  };

  const handleSubtitleMouseLeave = () => {
    if (pausedByHoverRef.current) {
      videoRef.current?.play();
      pausedByHoverRef.current = false;
    }
  };

  const handleWordHover = (word) => {
    if (clickedWord) return;
    setHoveredWord(word);
  };

  const handleWordClick = (word, e) => {
    e.stopPropagation();
    if (clickedWord === word) {
      setClickedWord(null);
    } else {
      setClickedWord(word);
      setHoveredWord(null);
    }
  };

  if (!subtitle) return null;

  const freqMap = FREQ_MAPS[settings.language] || freqDe;
  const isRTL = settings.language === 'ar';
  const tokens = subtitle.match(/\p{L}+|[^\p{L}\s]/gu) || [];

  return (
    <div
      className={`deutschtube-subtitle-box ${visible ? 'subtitle-visible' : 'subtitle-hidden'}`}
      style={isRTL ? { direction: 'rtl' } : {}}
      onClick={() => setClickedWord(null)}
      onMouseEnter={handleSubtitleMouseEnter}
      onMouseLeave={handleSubtitleMouseLeave}
    >
      {tokens.map((token, index) => {
        const isWord = /\p{L}/u.test(token);
        if (!isWord) return <span key={index} className="deutschtube-punctuation">{token} </span>;

        const rank = freqMap[token.toLowerCase()] ?? 99999;
        const isUnknown = rank > settings.threshold;

        // Track every word seen
        trackWord(token, rank);

        const wordStyle = isUnknown && !hoveredWord && !clickedWord
          ? { color: PINK }
          : {};

        return (
          <span
            key={`${token}-${index}`}
            className={`deutschtube-word-wrapper ${hoveredWord === token ? 'is-hovered' : ''} ${clickedWord === token ? 'is-active' : ''}`}
            style={wordStyle}
            onMouseEnter={() => handleWordHover(token)}
            onMouseLeave={() => setHoveredWord(null)}
            onClick={(e) => handleWordClick(token, e)}
          >
            {token}{' '}

            {hoveredWord === token && !clickedWord && (
              <div className="deutschtube-mini-tooltip">Click for definition</div>
            )}

            {clickedWord === token && (
              <WordPopup
                word={token}
                language={settings.language}
                onSave={() => setClickedWord(null)}
              />
            )}
          </span>
        );
      })}
    </div>
  );
};

export default SubtitleOverlay;
