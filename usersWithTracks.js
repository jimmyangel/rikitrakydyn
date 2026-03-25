// export-users-with-tracks.js
import {
    DynamoDBClient,
    ScanCommand,
    QueryCommand
} from "@aws-sdk/client-dynamodb"
import { unmarshall } from "@aws-sdk/util-dynamodb"
import fs from "fs"

const client = new DynamoDBClient({ region: "us-west-2" })
const TABLE = "rikitrakidyn"

// Scan the entire table (handles pagination)
async function scanAllItems() {
    let items = []
    let ExclusiveStartKey = undefined

    do {
        const res = await client.send(new ScanCommand({
            TableName: TABLE,
            ExclusiveStartKey
        }))

        if (res.Items) {
            items = items.concat(res.Items.map(unmarshall))
        }

        ExclusiveStartKey = res.LastEvaluatedKey
    } while (ExclusiveStartKey)

    return items
}

async function main() {
    console.log("Scanning table...")

    // 1. Scan entire table
    const items = await scanAllItems()
    console.log(`Total items scanned: ${items.length}`)

    // 2. Filter track items
    const tracks = items.filter(item =>
        item.PK?.startsWith("TRACK#") &&
        item.SK === "METADATA"
    )

    console.log(`Found ${tracks.length} tracks`)

    // 3. Group by username
    const users = new Map()

    for (const t of tracks) {
        const username = t.username
        if (!username) continue

        if (!users.has(username)) {
            users.set(username, {
                username,
                trackCount: 0,
                createdDates: [],
                updatedDates: []
            })
        }

        const u = users.get(username)
        u.trackCount++
        if (t.createdDate) u.createdDates.push(t.createdDate)
        if (t.lastUpdatedDate) u.updatedDates.push(t.lastUpdatedDate)
    }

    console.log(`Users with tracks: ${users.size}`)

    // 4. Fetch user emails
    for (const [username, u] of users.entries()) {
        const userPk = `USER#${username}`

        const userRes = await client.send(new QueryCommand({
            TableName: TABLE,
            KeyConditionExpression: "PK = :pk",
            ExpressionAttributeValues: {
                ":pk": { S: userPk }
            }
        }))

        let email = ""

        if (userRes.Items?.length) {
            const metadataItem = userRes.Items
                .map(unmarshall)
                .find(i => i.SK === "METADATA")

            if (metadataItem) {
                email = metadataItem.email || ""
            }
        }

        u.email = email

        // Compute latest created and latest updated
        u.latestCreated = u.createdDates.length
            ? u.createdDates.sort().slice(-1)[0]
            : ""

        u.latestUpdated = u.updatedDates.length
            ? u.updatedDates.sort().slice(-1)[0]
            : ""
    }

    // 5. Write CSV
    const rows = [
        "username,email,trackCount,latestCreated,latestUpdated"
    ]

    for (const u of users.values()) {
        rows.push([
            u.username,
            u.email,
            u.trackCount,
            u.latestCreated,
            u.latestUpdated
        ].join(","))
    }

    // Ensure exports folder exists
    if (!fs.existsSync("./exports")) {
        fs.mkdirSync("./exports")
    }

    fs.writeFileSync("./exports/users-with-tracks.csv", rows.join("\n"))
    console.log("CSV written to ./exports/users-with-tracks.csv")
}

main().catch(err => console.error(err))
