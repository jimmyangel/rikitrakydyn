import fs from "fs"

const geojson = JSON.parse(
  fs.readFileSync("../revgeocoder/dist/world_regions.geojson", "utf8")
)

const countries = new Set()

for (const feature of geojson.features) {
  const c = feature.properties.country
  if (c) countries.add(c)
}

const sorted = [...countries].sort()

// Print one per line to avoid truncation
for (const c of sorted) {
  console.log(c)
}

console.log(`\nTotal countries: ${sorted.length}`)
