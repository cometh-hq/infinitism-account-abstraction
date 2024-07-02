import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";

const deploySimpleAccountFactory: DeployFunction = async function (
  hre: HardhatRuntimeEnvironment
) {
  /* const provider = ethers.provider;
  const from = await provider.getSigner().getAddress();

  const entryPointAddress = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";
  // only deploy on local test network.

  const ret = await hre.deployments.deploy("SimpleAccountFactory", {
    from,
    args: [entryPointAddress],
    gasLimit: 6e6,
    log: true,
    deterministicDeployment: true,
  });
  console.log("==SimpleAccountFactory addr=", ret.address);*/
};

export default deploySimpleAccountFactory;
