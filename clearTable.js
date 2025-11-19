import { DynamoDBClient, ScanCommand, BatchWriteItemCommand } from "@aws-sdk/client-dynamodb";

const client = new DynamoDBClient({ region: "us-west-2" });
const TABLE_NAME = "rikitrakidyn";

// Delete items in chunks of 25
async function batchDelete(items) {
  if (!items.length) return;

  for (let i = 0; i < items.length; i += 25) {
    const chunk = items.slice(i, i + 25);

    const deleteRequests = chunk.map(item => ({
      DeleteRequest: {
        Key: {
          PK: { S: item.PK.S },
          SK: { S: item.SK.S }
        }
      }
    }));

    const result = await client.send(new BatchWriteItemCommand({
      RequestItems: { [TABLE_NAME]: deleteRequests }
    }));

    const unprocessed = result.UnprocessedItems?.[TABLE_NAME] || [];
    if (unprocessed.length) {
      console.log("Retrying unprocessed deletes...");
      // Retry only the unprocessed keys
      await batchDelete(unprocessed.map(req => req.DeleteRequest.Key));
    }
  }
}

// Scan and delete everything
async function clearTable() {
  let lastEvaluatedKey = undefined;
  let totalDeleted = 0;

  do {
    const scanResult = await client.send(new ScanCommand({
      TableName: TABLE_NAME,
      ExclusiveStartKey: lastEvaluatedKey
    }));

    const items = scanResult.Items || [];
    if (items.length) {
      await batchDelete(items);
      totalDeleted += items.length;
      console.log(`Deleted ${totalDeleted} items so far...`);
    }

    lastEvaluatedKey = scanResult.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  console.log(`Finished clearing table ${TABLE_NAME}. Total items deleted: ${totalDeleted}`);
}

// Run
clearTable().catch(err => console.error("Error clearing table:", err));
