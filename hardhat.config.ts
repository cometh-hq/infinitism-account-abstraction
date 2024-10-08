import "@nomiclabs/hardhat-waffle";
import "@typechain/hardhat";
import { HardhatUserConfig, task } from "hardhat/config";
import "hardhat-deploy";
import "@nomiclabs/hardhat-etherscan";
import { getDeterministicDeployment } from "@cometh/contracts-factory";

import "solidity-coverage";

import * as fs from "fs";

const SALT =
  "0x90d8084deab30c2a37c45e8d47f49f2f7965183cb6990a98943ef94940681de3";
process.env.SALT = process.env.SALT ?? SALT;

task("deploy", "Deploy contracts").addFlag(
  "simpleAccountFactory",
  "deploy sample factory (by default, enabled only on localhost)"
);

const mnemonicFileName = process.env.MNEMONIC_FILE!;
let mnemonic = "test ".repeat(11) + "junk";
if (fs.existsSync(mnemonicFileName)) {
  mnemonic = fs.readFileSync(mnemonicFileName, "ascii");
}

function getNetwork1(url: string): {
  url: string;
  accounts: { mnemonic: string };
} {
  return {
    url,
    accounts: { mnemonic },
  };
}

function getNetwork(name: string): {
  url: string;
  accounts: { mnemonic: string };
} {
  return getNetwork1(`https://${name}.infura.io/v3/${process.env.INFURA_ID}`);
  // return getNetwork1(`wss://${name}.infura.io/ws/v3/${process.env.INFURA_ID}`)
}

function getAccounts(): string[] | { mnemonic: string } {
  return [process.env.PRIVATE_KEY];
}

const optimizedComilerSettings = {
  version: "0.8.23",
  settings: {
    optimizer: { enabled: true, runs: 1000000 },
    viaIR: true,
  },
};

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.23",
        settings: {
          optimizer: { enabled: true, runs: 1000000 },
        },
      },
    ],
    overrides: {
      "contracts/core/EntryPoint.sol": optimizedComilerSettings,
      "contracts/samples/SimpleAccount.sol": optimizedComilerSettings,
    },
    deterministicDeployment: (network: string) => {
      const networkName = process.env.HARDHAT_NETWORK ?? "";
      const env: string = (() => {
        switch (true) {
          case networkName.endsWith("_production"):
            return "production";
          case networkName.endsWith("_staging"):
            return "staging";
          default:
            return "develop";
        }
      })();
      return getDeterministicDeployment(env)(network);
    },
  },
  networks: {
    polygon_develop: {
      url: `https://polygon-mainnet.infura.io/v3/${process.env.INFURA_ID}`,
      accounts: getAccounts(),
    },
    arbitrum_sepolia_develop: {
      url: "https://arbitrum-sepolia.infura.io/v3/" + process.env.INFURA_ID,
      accounts: getAccounts(),
    },
    base_sepolia_production: {
      url: "https://base-sepolia.g.alchemy.com/v2/" + process.env.INFURA_ID,
      accounts: getAccounts(),
    },
    base_production: {
      url: "https://base-mainnet.g.alchemy.com/v2/" + process.env.INFURA_ID,
      accounts: getAccounts(),
    },
    arbitrum_sepolia_production: {
      url: "https://arbitrum-sepolia.infura.io/v3/" + process.env.INFURA_ID,
      accounts: getAccounts(),
    },
    arbitrum_production: {
      url: "https://arbitrum-mainnet.infura.io/v3/" + process.env.INFURA_ID,
      accounts: getAccounts(),
    },
    optimism_production: {
      url: "https://opt-mainnet.g.alchemy.com/v2/" + process.env.INFURA_ID,
      accounts: getAccounts(),
    },
    optimism_sepolia_production: {
      url: "https://opt-sepolia.g.alchemy.com/v2/" + process.env.INFURA_ID,
      accounts: getAccounts(),
    },
    polygon_production: {
      url: "https://polygon-mainnet.infura.io/v3/" + process.env.INFURA_ID,
      accounts: getAccounts(),
    },
    amoy_production: {
      url: "https://polygon-amoy.g.alchemy.com/v2/" + process.env.INFURA_ID,
      accounts: getAccounts(),
    },
    sepolia: {
      url: "https://sepolia.infura.io/v3/" + process.env.INFURA_ID,
      accounts: getAccounts(),
    },
    gnosis_production: {
      url: "https://gnosis-mainnet.g.alchemy.com/v2/" + process.env.INFURA_ID,
      accounts: getAccounts(),
    },
    bArtio_production: {
      url: "https://bartio.rpc.berachain.com",
      accounts: getAccounts(),
    },
    worldchain_sepolia_production: {
      url:
        "https://worldchain-sepolia.g.alchemy.com/v2/" + process.env.INFURA_ID,
      accounts: getAccounts(),
    },
  },

  namedAccounts: {
    paymasterOwner: {
      default: `privatekey://${process.env.PAYMASTER_OWNER_PRIVATE_KEY!}`,
    },
  },

  mocha: {
    timeout: 10000,
  },

  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
    customChains: [
      {
        network: "sepolia",
        chainId: 11155111,
        urls: {
          apiURL: "https://api-sepolia.etherscan.io/api",
          browserURL: "https://api-sepolia.etherscan.io",
        },
      },
      {
        network: "optimism sepolia",
        chainId: 11155420,
        urls: {
          apiURL: "https://api-sepolia-optimistic.etherscan.io/api",
          browserURL: "https://api-sepolia-optimism.etherscan.io",
        },
      },
      {
        network: "optimism",
        chainId: 10,
        urls: {
          apiURL: "https://api-optimistic.etherscan.io/api",
          browserURL: "https://api-optimistic.etherscan.io",
        },
      },
      {
        network: "chiado",
        chainId: 10200,
        urls: {
          apiURL: "https://gnosis-chiado.blockscout.com/api",
          browserURL: "https://gnosis-chiado.blockscout.com/",
        },
      },
      {
        network: "muster",
        chainId: 4078,
        urls: {
          apiURL: "https://muster-explorer-v2.alt.technology/api",
        },
      },
      {
        network: "polygon_zkevm_testnet",
        chainId: 1442,
        urls: {
          apiURL: "https://testnet-zkevm.polygonscan.com/api",
          browserURL: "https://testnet-zkevm.polygonscan.com/",
        },
      },
      {
        network: "arbitrum_sepolia",
        chainId: 421614,
        urls: {
          apiURL: "https://api-sepolia.arbiscan.io/api",
          browserURL: "https://sepolia.arbiscan.io/",
        },
      },
      {
        network: "arbitrum",
        chainId: 42161,
        urls: {
          apiURL: "https://api.arbiscan.io/api",
          browserURL: "https://arbiscan.io/",
        },
      },
      {
        network: "base_sepolia",
        chainId: 84532,
        urls: {
          apiURL: "https://api-sepolia.basescan.org/api",
          browserURL: "https://sepolia.basescan.org/",
        },
      },
      {
        network: "base",
        chainId: 8453,
        urls: {
          apiURL: "https://api.basescan.org/api",
          browserURL: "https://basescan.org/",
        },
      },
      {
        network: "polygon",
        chainId: 137,
        urls: {
          apiURL: "https://api.polygonscan.com/api",
          browserURL: "https://polygonscan.com/",
        },
      },
      {
        network: "gnosis",
        chainId: 100,
        urls: {
          apiURL: "https://api.gnosisscan.io/api",
          browserURL: "https://gnosisscan.io/",
        },
      },
      {
        network: "bartio_testnet",
        chainId: 80084,
        urls: {
          apiURL:
            "https://api.routescan.io/v2/network/testnet/evm/80084/etherscan",
          browserURL: "https://bartio.beratrail.io",
        },
      },
    ],
  },
};

// coverage chokes on the "compilers" settings
if (process.env.COVERAGE != null) {
  // @ts-ignore
  config.solidity = config.solidity.compilers[0];
}

export default config;
