#!/bin/bash
# Temporary hotfix for ethers/bun.sh issue
# Fix be removed when https://github.com/oven-sh/bun/issues/5309 is fixed
FILE="node_modules/ethers/lib.esm/utils/geturl.js"
if [ -f "$FILE" ]; then
    sed -i '' 's/body = getBytes(gunzipSync(body));/body = getBytes(gunzipSync(Buffer.from(body)));/' "$FILE"

    echo "The line has been replaced in $FILE."
else
    echo "Error: $FILE does not exist."
fi
