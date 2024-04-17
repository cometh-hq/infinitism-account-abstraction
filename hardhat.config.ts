import * as dotenv from "dotenv";

import "@nomiclabs/hardhat-waffle";
import "@typechain/hardhat";
import { HardhatUserConfig } from "hardhat/config";
import "hardhat-deploy";
import "@nomiclabs/hardhat-etherscan";
import "hardhat-deploy-ethers";

import "solidity-coverage";

import * as fs from "fs";
dotenv.config();

const mnemonicFileName =
  process.env.MNEMONIC_FILE ??
  `${process.env.HOME}/.secret/testnet-mnemonic.txt`;
let mnemonic = "test ".repeat(11) + "junk";
if (fs.existsSync(mnemonicFileName)) {
  mnemonic = fs.readFileSync(mnemonicFileName, "ascii");
} else {
  mnemonic = "test test test test test test test test test test test junk";
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
  version: "0.8.24",
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
        version: "0.8.24",
        settings: {
          optimizer: { enabled: true, runs: 1000000 },
        },
      },
    ],
    overrides: {
      "contracts/core/EntryPoint.sol": optimizedComilerSettings,
      "contracts/samples/SimpleAccount.sol": optimizedComilerSettings,
    },
  },
  networks: {
    dev: { url: "http://localhost:8545" },
    // github action starts localgeth service, for gas calculations
    localgeth: { url: "http://localgeth:8545" },
    proxy: getNetwork1("http://localhost:8545"),
    kovan: getNetwork("kovan"),
    mumbai: {
      url: `https://polygon-mumbai.infura.io/v3/${process.env.INFURA_ID}`,
      accounts: getAccounts(),
    },
    polygon: {
      url: `https://polygon-mainnet.infura.io/v3/${process.env.INFURA_ID}`,
      accounts: getAccounts(),
    },
    avalanche: {
      url: `https://avalanche-mainnet.infura.io/v3/${process.env.INFURA_ID}`,
      accounts: getAccounts(),
    },
    fuji: {
      url: `https://avalanche-fuji.infura.io/v3/${process.env.INFURA_ID}`,
      accounts: getAccounts(),
    },
    goerli: {
      url: `https://goerli.infura.io/v3/${process.env.INFURA_ID}`,
      accounts: getAccounts(),
    },
    mainnet: {
      url: `https://mainnet.infura.io/v3/${process.env.INFURA_ID}`,
      accounts: getAccounts(),
    },
    arbitrum_sepolia: {
      url: "https://arbitrum-sepolia.infura.io/v3/" + process.env.INFURA_ID,
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
        network: "chiado",
        chainId: 10200,
        urls: {
          apiURL: "https://gnosis-chiado.blockscout.com/api",
          browserURL: "https://gnosis-chiado.blockscout.com/",
        },
      },
      {
        network: "muster_testnet",
        chainId: 2121337,
        urls: {
          apiURL: "https://muster-anytrust-explorer.alt.technology/api",
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
    ],
  },
};

// coverage chokes on the "compilers" settings
if (process.env.COVERAGE != null) {
  // @ts-ignore
  config.solidity = config.solidity.compilers[0];
}

export default config;
