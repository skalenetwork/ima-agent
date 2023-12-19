#!/bin/bash

set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

export IMA_NETWORK_BROWSER_DATA_PATH="$DIR/test_schainsData.json"
export SCHAIN_PROXY_PATH="$DIR/test_ima_schain.json"
export MANAGER_ABI_PATH="$DIR/../helper-scripts/contracts_data/manager.json"

export MAINNET_RPC_URL="http://127.0.0.1:8545"
export SCHAIN_RPC_URL="http://127.0.0.1:8545"
export SCHAIN_NAME="test"
export CONNECTED_ONLY=false

bun test