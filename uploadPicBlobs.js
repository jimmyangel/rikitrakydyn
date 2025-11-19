import fs from "fs";
import readline from "readline";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({ region: "us-west-2" }); // adjust region

async function uploadPicturesFromExport(filePath, bucketName) {
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath),
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    const pic = JSON.parse(line);

    if (pic.picBlob && pic.picBlob.$binary && pic.picBlob.$binary.base64) {
      const buffer = Buffer.from(pic.picBlob.$binary.base64, "base64");

      // Construct a logical S3 key: group by trackId and index
      const key = `${pic.trackId}/pictures/${pic.picIndex}.jpg`;

      const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: buffer,
        ContentType: "image/jpeg" // adjust if PNG or other format
      });

      await s3.send(command);
      console.log(`Uploaded ${key}`);
    }
  }
}

// Usage
uploadPicturesFromExport("exports/pictures.json", "rikitraki")
  .catch(err => console.error("Error:", err));
