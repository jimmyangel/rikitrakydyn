#!/bin/bash
echo Create rikitrakidyn table
aws dynamodb create-table --cli-input-json file://rikitrakidyn.json
