import { DynamoDBClient } from "@aws-sdk/client-dynamodb"
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb"

// These are the values that appeared in the "country" slot
// but are NOT countries in your NE dataset.
const nonCountryValues = new Set([
  "Oregon",
  "Réunion",
  "New Caledonia"
])

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}))

async function findReversed() {
  let ExclusiveStartKey = undefined
  const reversed = []

  do {
    const res = await client.send(new ScanCommand({
      TableName: "rikitrakidyn",
      FilterExpression: "SK = :sk",
      ExpressionAttributeValues: { ":sk": "METADATA" },
      ProjectionExpression: "PK, trackRegionTags",
      ExclusiveStartKey
    }))

    for (const item of res.Items ?? []) {
      const tags = item.trackRegionTags
      if (!tags || tags.length !== 2) continue

      const [c1, c2] = tags

      if (nonCountryValues.has(c1)) {
        reversed.push({
          trackId: item.PK,
          legacyCountry: c1,
          legacyRegion: c2,
          inferredCorrectCountry: c2,
          inferredCorrectRegion: c1
        })
      }
    }

    ExclusiveStartKey = res.LastEvaluatedKey
  } while (ExclusiveStartKey)

  console.log("Reversed region-tag records:")
  console.log(JSON.stringify(reversed, null, 2))
  console.log(`Total reversed: ${reversed.length}`)
}

findReversed()
