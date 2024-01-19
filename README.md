<!-- SPDX-License-Identifier: (AGPL-3.0-only OR CC-BY-4.0) -->

# SKALE Interchain Messaging Agent (IMA)

[![Discord](https://img.shields.io/discord/534485763354787851.svg)](https://discord.gg/vvUtWJB)

## Components Structure

### Message Transferring Agent App

IMA Agent is the main application implementing connectivity and message transfer between `Mainnet` and `SKALE Chains`. The Agent also provides an easy way to perform ETH, ERC20, and ERC721 transfers between `Main Net` and `S-Chain` nevertheless, this can be done without it.

#### Core

A module implementing core IMA functionality.

#### OWASP

Data validity verifier module. See [OWASP document](https://www.gitbook.com/download/pdf/book/checkmarx/JS-SCP).

#### SKALE Network Browser

Component responsible for providing description of all SKALE chains. See detailed spec:
[SKALE Network Browser](docs/SNB.md)

#### IMA Log

Console and log file output with rotation.

#### IMA CC

ANSI colorizer for console and log output.

## For more information

-   [SKALE Network Website](https://skale.network)
-   [SKALE Network Twitter](https://twitter.com/SkaleNetwork)
-   [SKALE Network Blog](https://skale.network/blog)

Learn more about the SKALE community over on [Discord](https://discord.gg/vvUtWJB).

## Security and Liability

All contracts are WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.

## License

[![License](https://img.shields.io/github/license/skalenetwork/IMA)](LICENSE)
All contributions are made under the [GNU Affero General Public License v3](https://www.gnu.org/licenses/agpl-3.0.en.html). See [LICENSE](LICENSE).
Copyright (C) 2019-Present SKALE Labs.
