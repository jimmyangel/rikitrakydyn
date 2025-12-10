import fs from 'fs';
import readline from 'readline';

// Strip HTML tags and decode basic entities
function normalizeText(text) {
  if (!text || typeof text !== 'string') return '';
  const noTags = text.replace(/<[^>]+>/g, ' ');
  const entitiesDecoded = noTags
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  return entitiesDecoded.replace(/\s+/g, ' ').trim();
}

// Common short stopwords to ignore
const STOPWORDS = new Set([
  'a','an','and','the','of','to','in','on','for','la','de','i','el','los','las','le','les','di','da','du','des','et'
]);

// Tokenizer: split on whitespace/punctuation, treat underscores as separators
function tokenize(text) {
  return text
    .split(/[\s.,;:!?()[\]{}"“”«»…_]/u)
    .map(t => t.trim())
    .filter(Boolean);
}

// Word‑like check: letters, apostrophes, hyphens; allow letter+digit combos, slug‑style tokens, and dates
function isWordLike(word) {
  if (/^[\p{L}](?:[\p{L}'’-]*[\p{L}])?$/u.test(word)) return true;
  if (/^[\p{L}]+[0-9]+$/u.test(word)) return true;
  if (/^[\p{L}0-9]+(?:[-'][\p{L}0-9]+)*$/u.test(word)) return true;
  if (/^[0-9]{2,4}$/.test(word)) return true;
  return false;
}

function checkReasons(raw) {
  const reasons = [];
  const text = normalizeText(raw);
  if (!text) return reasons;

  // Trim punctuation off tokens before testing
  const tokens = tokenize(text).map(t => t.replace(/^[^\p{L}0-9]+|[^\p{L}0-9]+$/gu, ''));
  const candidates = tokens.filter(t => t && !STOPWORDS.has(t.toLowerCase()) && !/^[0-9]+$/u.test(t));

  const wordLikeCount = candidates.filter(isWordLike).length;
  const ratio = candidates.length > 0 ? wordLikeCount / candidates.length : 1;

  // Adaptive cutoff: stricter for short strings, looser for long ones
  const cutoff = text.length > 50 ? 0.6 : 0.8;
  if (ratio < cutoff) reasons.push('low dictionary ratio');

  // Refined excessive repetition check: only flag if one token dominates
  const freq = {};
  tokens.forEach(t => {
    const lower = t.toLowerCase();
    freq[lower] = (freq[lower] || 0) + 1;
  });
  const maxRepeat = Math.max(...Object.values(freq));
  const total = tokens.length;
  if (maxRepeat / total > 0.5 && maxRepeat >= 3) {
    reasons.push('excessive repetition');
  }

  if (/qwerty|asdf|zxcv|hjkl|1234|asdfasdf|qwertyuiop/i.test(text)) reasons.push('keyboard mash');
  if (/(.)\1{5,}/u.test(text)) reasons.push('long repeated chars');
  if (text.length < 4) reasons.push('too short');
  if (tokens.some(t => t.toLowerCase() === 'test')) reasons.push('contains "test"');

  return reasons;
}

async function processFile() {
  const input = fs.createReadStream('./exports/tracks.json');
  const rl = readline.createInterface({ input, crlfDelay: Infinity });

  const flagged = [];
  const summary = {};
  let count = 0;

  for await (const line of rl) {
    count++;
    if (!line.trim()) continue;

    let doc;
    try {
      doc = JSON.parse(line);
    } catch {
      continue; // skip malformed lines
    }

    const reasonsName = checkReasons(doc.trackName);
    const reasonsDesc = checkReasons(doc.trackDescription);
    const allReasons = [...reasonsName, ...reasonsDesc];

    if (allReasons.length > 0) {
      flagged.push({
        trackId: doc.trackId || doc._id?.$oid,
        trackName: doc.trackName,
        trackDescription: doc.trackDescription,
        createdDate: doc.createdDate?.$date,
        reasons: allReasons
      });
      allReasons.forEach(r => { summary[r] = (summary[r] || 0) + 1; });
    }

    if (count % 200 === 0) {
      console.log(`Processed ${count} lines...`);
    }
  }

  fs.writeFileSync('./exports/flagged.json', JSON.stringify(flagged, null, 2));

  console.log(`\nFlagged ${flagged.length} suspicious records`);
  console.log('Summary by reason:');
  Object.entries(summary).forEach(([reason, c]) => console.log(`- ${reason}: ${c}`));
}

processFile();
