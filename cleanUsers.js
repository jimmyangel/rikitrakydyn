import fs from 'fs';
import readline from 'readline';

async function buildTrackIndex() {
  const index = new Map();
  const rl = readline.createInterface({
    input: fs.createReadStream('./exports/tracks.json'),
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    let track;
    try { track = JSON.parse(line); } catch { continue; }
    const uname = track.username;
    if (uname) {
      index.set(uname, (index.get(uname) || 0) + 1);
    }
  }
  return index;
}

async function flagUsers() {
  const trackIndex = await buildTrackIndex();
  const flagged = [];

  const rl = readline.createInterface({
    input: fs.createReadStream('./exports/users.json'),
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    let user;
    try { user = JSON.parse(line); } catch { continue; }

    const uname = user.username;
    const createdDate = new Date(user.createdDate?.$date);
    const isInactive = user.isInactive === true;
    const trackCount = trackIndex.get(uname) || 0;

    if (isInactive) {
      flagged.push({
        username: uname,
        email: user.email,
        createdDate: user.createdDate?.$date,
        reason: 'inactive'
      });
    } else if (createdDate < new Date('2024-01-01') && trackCount === 0) {
      flagged.push({
        username: uname,
        email: user.email,
        createdDate: user.createdDate?.$date,
        reason: 'old_zero_tracks'
      });
    }
  }

  fs.writeFileSync('./exports/flagged_users.json', JSON.stringify(flagged, null, 2));
  console.log(`Flagged ${flagged.length} users`);
}

flagUsers().catch(console.error);
