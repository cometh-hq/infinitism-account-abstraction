import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import { defaultAbiCoder } from "ethers/lib/utils";

const PAYMASTER_DEPOSIT = ethers.utils.parseEther('0.02');

const deployPaymaster: DeployFunction = async function (
  hre: HardhatRuntimeEnvironment
) {

  const { run } = hre

  const signer = hre.ethers.provider.getSigner()
  const from = await signer.getAddress()

  const paymasterId = ethers.utils.keccak256(defaultAbiCoder.encode(['string'], [process.env.PAYMASTER_ID]))
  const { paymasterOwner } = await hre.getNamedAccounts()
  const entryPointAddress = '0x0000000071727De22E5E9d8BAf0edAc6f37da032'

  console.log(
    'signer: ',
    await signer.getAddress(),
    'from: ',
    from,
    'paymasterOwner: ',
    paymasterOwner,
    'paymasterId: ',
    paymasterId,
    'paymasterDeposit: ',
    PAYMASTER_DEPOSIT.toString(),
    'entrypoint: ',
    entryPointAddress
  )

  const paymaster = await hre.deployments.deploy('VerifyingPaymaster', {
    from,
    args: [entryPointAddress, '0x261F6B90Ec3Ec621D6178053f18b491F1DF7AD23'],
    deterministicDeployment: true
  })
  console.log('==PAYMASTER CONTRACT address=', paymaster.address)

  const paymasterContract = (
    await hre.ethers.getContractAt('VerifyingPaymaster', paymaster.address)
  ).connect(signer)
  const tx = await paymasterContract.depositFor(paymasterId, { value: PAYMASTER_DEPOSIT })
  await tx.wait()
  console.log('Paymaster deposited')

  await run('verify:verify', {
    address: paymaster.address,
    constructorArguments: [entryPointAddress, paymasterOwner]
  })
}

export default deployPaymaster

deployPaymaster.tags = ['Paymaster']
