import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";

const PAYMASTER_DEPOSIT = ethers.utils.parseEther("0.2");

const deployPaymaster: DeployFunction = async function (
  hre: HardhatRuntimeEnvironment
) {
  const { run } = hre;

  const signer = hre.ethers.provider.getSigner();
  const from = await signer.getAddress();

  const { paymasterOwner } = await hre.getNamedAccounts();

  const entryPointAddress = process.env.ENTRY_POINT_ADDRESS;

  console.log(
    "signer: ",
    await signer.getAddress(),
    "from: ",
    from,
    "paymasterOwner: ",
    paymasterOwner,
    "entrypoint: ",
    entryPointAddress
  );

  const paymaster = await hre.deployments.deploy("VerifyingPaymaster", {
    from,
    args: [entryPointAddress, paymasterOwner],
    deterministicDeployment: true,
  });
  console.log("==paymaster addr=", paymaster.address);

  const paymasterContract = (
    await hre.ethers.getContractAt("VerifyingPaymaster", paymaster.address)
  ).connect(signer);
  const tx = await paymasterContract.deposit({ value: PAYMASTER_DEPOSIT });
  await tx.wait();
  console.log("Paymaster deposited");

  await run("verify:verify", {
    address: paymaster.address,
    constructorArguments: [entryPointAddress, paymasterOwner],
  });
};

export default deployPaymaster;
