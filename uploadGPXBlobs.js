import fs from "fs";
import readline from "readline";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
// For large files, you can also use: import { Upload } from "@aws-sdk/lib-storage";

const s3 = new S3Client({ region: "us-west-2" }); // adjust region

async function uploadGPXFromExport(filePath, bucketName) {
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath),
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    if (!line.trim()) continue; // skip empty lines
    const track = JSON.parse(line);

    if (track.trackGPXBlob) {
      const key = `${track.trackId}/gpx/${track.trackGPX}`;

      // For moderate blobs, PutObjectCommand is fine
      const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: track.trackGPXBlob,
        ContentType: "application/gpx+xml"
      });

      await s3.send(command);
      console.log(`Uploaded ${key}`);
    }
  }
}

// Usage
uploadGPXFromExport("./exports/tracks.json", "rikitraki")
  .catch(err => console.error("Error:", err));

