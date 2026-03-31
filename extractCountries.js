import { DynamoDBClient } from "@aws-sdk/client-dynamodb"
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb"

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}))

async function extractCountries() {
  const countries = new Set()
  let ExclusiveStartKey = undefined

  do {
    const res = await client.send(new ScanCommand({
      TableName: "rikitrakidyn",
      FilterExpression: "SK = :sk",
      ExpressionAttributeValues: { ":sk": "METADATA" },
      ProjectionExpression: "trackRegionTags",
      ExclusiveStartKey
    }))

    for (const item of res.Items ?? []) {
      const [country] = item.trackRegionTags ?? []
      if (country) countries.add(country)
    }

    ExclusiveStartKey = res.LastEvaluatedKey
  } while (ExclusiveStartKey)

  console.log("Unique legacy countries:")
  console.log([...countries].sort())
}

extractCountries()
