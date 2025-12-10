#!/bin/bash
echo Export user collection from mongodb
mongoexport -h  127.0.0.1:4444 --authenticationDatabase admin --username root --db rikitraki --collection users --out ./exports/users.json

echo Export tracks table from mongodb
mongoexport -h  127.0.0.1:4444 --authenticationDatabase admin --username root --db rikitraki --collection tracks --out ./exports/tracks.json

echo Export pictures table from mongodb
mongoexport -h  127.0.0.1:4444 --authenticationDatabase admin --username root --db rikitraki --collection pictures --out ./exports/pictures.json
