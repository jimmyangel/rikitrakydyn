import { DynamoDBClient } from "@aws-sdk/client-dynamodb"
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb"
import fs from "fs"

// Load canonical regions from your NE dataset
const geojson = JSON.parse(
  fs.readFileSync("../revgeocoder/dist/world_regions.geojson", "utf8")
)

const canonicalRegions = new Set(
  geojson.features.map(f => f.properties.region)
)

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}))

async function findRegionMismatches() {
  let ExclusiveStartKey = undefined
  const legacyRegions = new Set()

  do {
    const res = await client.send(new ScanCommand({
      TableName: "rikitrakidyn",
      FilterExpression: "SK = :sk",
      ExpressionAttributeValues: { ":sk": "METADATA" },
      ProjectionExpression: "trackRegionTags",
      ExclusiveStartKey
    }))

    for (const item of res.Items ?? []) {
      const tags = item.trackRegionTags
      if (!tags || tags.length !== 2) continue

      const region = tags[1]
      legacyRegions.add(region)
    }

    ExclusiveStartKey = res.LastEvaluatedKey
  } while (ExclusiveStartKey)

  const mismatches = [...legacyRegions].filter(
    r => !canonicalRegions.has(r)
  )

  console.log("Legacy region names NOT in canonical NE list:")
  const sorted = mismatches.sort((a, b) => a.localeCompare(b))
  for (const r of sorted) {
    console.log(r)
  }

  console.log(`\nTotal mismatches: ${sorted.length}`)
}

findRegionMismatches()
