# SKALE Network Browser

## Configuration

Required env variables:

- `MAINNET_RPC_URL` - endpoint of the Mainnet network where skale-manager contracts are deployed
- `SCHAIN_RPC_URL` - endpoint of the current sChain
- `SCHAIN_NAME` - name of the current sChain

- `SCHAIN_PROXY_PATH` - IMA ABI from sChain
- `MANAGER_ABI_PATH` - skale-manager ABI from Mainnet
- `IMA_NETWORK_BROWSER_DATA_PATH` - path to JSON file where network-browser results will be saved

Optional env variables:

- `MULTICALL` - use ethers multicall provider (default: `false`)
- `CONNECTED_ONLY` - collect info only for connected chains (default: `true`)

- `POST_ERROR_DELAY` - delay before retry if error happened in browser loop (seconds, default: `5`)
- `NETWORK_BROWSER_DELAY` - delay between iterations of the network-browser (seconds, default: `10800`)
- `NETWORK_BROWSER_TIMEOUT` - maximum amount of time allocated to the browse function (seconds, default: `1200`)

## Development 

To use network-browser it's recommended to use [bun.sh](https://bun.sh/), installation script can be found on their website.

Install dependencies:

```bash
bun install
```

Run in dev mode:

```bash
bun dev
```

Pre-commit hook:

```bash
bun pre
```

## Run in production mode

```bash
bun browse
```