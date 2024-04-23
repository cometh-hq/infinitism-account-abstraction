import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";

const deploySimpleAccountFactory: DeployFunction = async function (
  hre: HardhatRuntimeEnvironment
) {
  const provider = ethers.provider;
  const from = await provider.getSigner().getAddress();

  const entryPointAddress = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";
  // only deploy on local test network.

  const ret = await hre.deployments.deploy("SimpleAccountFactory", {
    from,
    args: [entryPointAddress],
    gasLimit: 6e6,
    log: true,
    deterministicDeployment: true,
  });
  console.log("==SimpleAccountFactory addr=", ret.address);
};

export default deploySimpleAccountFactory;
