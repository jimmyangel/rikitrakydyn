import fs from "fs"
import readline from "readline"
import { DynamoDBClient, BatchWriteItemCommand } from "@aws-sdk/client-dynamodb"
import geohash from "ngeohash"

const client = new DynamoDBClient({ region: "us-west-2" })
const TABLE_NAME = "rikitrakidyn"

// Helper to safely unwrap MongoDB extended JSON dates
function isoDate(val) {
  if (!val) return undefined
  if (typeof val === "string") return val // already ISO
  if (val.$date) return val.$date // extended JSON
  return undefined
}

// Normalize MongoDB extended JSON numbers into DynamoDB N attributes
function num(val) {
  if (val === undefined || val === null) return undefined
  if (typeof val === "number") return String(val)
  if (typeof val === "string") return String(Number(val))
  if (val.$numberDouble) return String(Number(val.$numberDouble))
  if (val.$numberInt) return String(Number(val.$numberInt))
  return undefined
}

// Map a track document → DynamoDB items
function mapTrack(doc) {
  const items = []
  const createdDate = isoDate(doc.createdDate)

  const lat = Array.isArray(doc.trackLatLng) ? num(doc.trackLatLng[0]) : undefined
  const lng = Array.isArray(doc.trackLatLng) ? num(doc.trackLatLng[1]) : undefined

  let trackType = doc.trackType ? doc.trackType : "Hiking"

  // Region tags (still separate items for search/indexing)
  if (Array.isArray(doc.trackRegionTags)) {
    doc.trackRegionTags.forEach((tag, idx) => {
      const regionItem = {
        PK: { S: `TRACK#${doc.trackId}` },
        SK: { S: `REGION#${idx}#${tag}` },
        trackId: { S: doc.trackId },
        trackRegionTag: { S: tag },
        regionIndex: { N: String(idx) },
        trackName: { S: doc.trackName },
        trackType: { S: trackType },
        trackLevel: { S: doc.trackLevel },
        username: { S: doc.username },
        trackFav: { BOOL: doc.trackFav },
        isDeleted: { BOOL: false }
      }
      regionItem.trackRegionTags = {
        L: doc.trackRegionTags.map(tag => ({ S: tag }))
      }

      if (lat && lng) {
        regionItem.trackLatLng = { L: [{ N: lat }, { N: lng }] }
      }

      if (createdDate) regionItem.createdDate = { S: createdDate }

      items.push({ PutRequest: { Item: regionItem } })
    })
  }

  // Metadata (with embedded trackPhotos array)
  let trackGeoHash
  if (lat && lng) {
    trackGeoHash = geohash.encode(Number(lat), Number(lng), 8) // precision 8
  }

  let tracksIndexUserPK = `TRACKS#${doc.username}`

  const trackItem = {
    PK: { S: `TRACK#${doc.trackId}` },
    SK: { S: "METADATA" },
    trackId: { S: doc.trackId },
    trackName: { S: doc.trackName },
    username: { S: doc.username },
    isDeleted: { BOOL: false },
    trackLevel: { S: doc.trackLevel },
    trackType: { S: trackType },
    trackFav: { BOOL: doc.trackFav },
    trackDescription: { S: doc.trackDescription },
    hasPhotos: { BOOL: doc.hasPhotos },
    trackGPX: { S: doc.trackGPX },
    tracksIndexPK: { S: "TRACKS" },
    tracksIndexUserPK: { S: tracksIndexUserPK },
    createdDate: { S: createdDate }
  }

  if (Array.isArray(doc.trackRegionTags)) {
    trackItem.trackRegionTags = {
      L: doc.trackRegionTags.map(tag => ({ S: tag }))
    }
  }

  if (lat && lng) {
    trackItem.trackLatLng = { L: [{ N: lat }, { N: lng }] }
  }

  if (doc.lastUpdatedDate) trackItem.lastUpdatedDate = { S: isoDate(doc.lastUpdatedDate) }
  if (trackGeoHash) trackItem.trackGeoHash = { S: trackGeoHash }

  // Embed trackPhotos array if present
  if (Array.isArray(doc.trackPhotos)) {
    trackItem.trackPhotos = {
      L: doc.trackPhotos.map(p => {
        const photoMap = {
          M: {
            picName: { S: p.picName },
            picThumb: { S: p.picThumb },
            picCaption: { S: p.picCaption }
          }
        }
        if (Object.hasOwn(p, "picIndex")) {
          photoMap.M.picIndex = { N: String(p.picIndex) }
        }
        if (p.createdDate) {
          photoMap.M.createdDate = { S: isoDate(p.createdDate) }
        }
        if (Array.isArray(p.picLatLng)) {
          const plat = num(p.picLatLng[0])
          const plng = num(p.picLatLng[1])
          if (plat && plng) {
            photoMap.M.picLatLng = { L: [{ N: plat }, { N: plng }] }
          }
        }
        return photoMap
      })
    }
  }

  items.push({ PutRequest: { Item: trackItem } })

  return items
}

// Map a user document → DynamoDB item
function mapUser(doc) {
  const items = []

  const userItem = {
    PK: { S: `USER#${doc.username}` },
    SK: { S: "METADATA" },
    email: { S: doc.email },
    username: { S: doc.username },
    password: { S: doc.password }
  }

  if (doc.isInactive) userItem.isInactive = { BOOL: doc.isInactive }

  const createdDate = isoDate(doc.createdDate)
  if (createdDate) userItem.createdDate = { S: createdDate }

  const lastUpdatedDate = isoDate(doc.lastUpdatedDate)
  if (lastUpdatedDate) userItem.lastUpdatedDate = { S: createdDate }

  items.push({ PutRequest: { Item: userItem }})

  const emailItem = {
    PK: { S: `EMAIL#${doc.email}` },
    SK: { S: "EMAIL" },
    username: { S: doc.username }
  }

  items.push({ PutRequest: { Item: emailItem }})

  return items
}

// Batch insert helper
async function batchInsert(batch) {
  if (!batch.length) return
  const result = await client.send(new BatchWriteItemCommand({
    RequestItems: { [TABLE_NAME]: batch }
  }))
  const unprocessed = result.UnprocessedItems?.[TABLE_NAME] || []
  if (unprocessed.length) {
    console.log("Retrying unprocessed items...")
    await batchInsert(unprocessed)
  }
}

// Stream NDJSON file line by line
async function importNDJSON(filePath, mapper, limit = 0) {
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath),
    crlfDelay: Infinity
  })

  let batch = []
  let count = 0

  for await (const line of rl) {
    if (!line.trim()) continue
    const doc = JSON.parse(line)
    const items = Array.isArray(mapper(doc)) ? mapper(doc) : [mapper(doc)]
    batch.push(...items)

    while (batch.length >= 25) {
      const chunk = batch.splice(0, 25)
      await batchInsert(chunk)
    }

    count++
    if (limit > 0 && count >= limit) {
      console.log(`Imported ${limit} records from ${filePath}, stopping early.`)
      break
    }
  }

  if (batch.length) {
    await batchInsert(batch)
  }

  console.log(`Finished importing from ${filePath}. Total docs processed: ${count}`)
}

const imports = {
  tracks: { file: './exports/tracks.json', mapper: mapTrack, label: 'Tracks' },
  users:  { file: './exports/users.json',  mapper: mapUser,  label: 'Users' }
}

async function askChoice() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(resolve => {
    rl.question('What do you want to import? (tracks/users/both/none): ', answer => {
      rl.close()
      resolve(answer.trim().toLowerCase() || 'none')
    })
  })
}

;(async () => {
  let choice = process.argv[2]?.toLowerCase()
  if (!choice) choice = await askChoice()

  const toRun =
    choice === 'both' ? Object.keys(imports)
    : choice === 'none' ? []
    : [choice]

  for (const key of toRun) {
    const { file, mapper, label } = imports[key] || {}
    if (!file) {
      console.error(`Invalid choice: ${choice}`)
      process.exit(1)
    }
    await importNDJSON(file, mapper)
    console.log(`${label} import completed.`)
  }

  if (toRun.length === 0) {
    console.log('No imports selected.')
  }
})()
