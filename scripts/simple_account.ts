import { Wallet } from "ethers";
import { ethers } from "hardhat";
import { fillAndSign, fillSignAndPack, packUserOp, simulateValidation } from "../test/UserOp";
import { arrayify, defaultAbiCoder, hexConcat } from "ethers/lib/utils";
import { EntryPoint__factory } from "../typechain";
import { parseValidationData } from "../test/testutils";

/* import { simulationResultCatch } from "../test/testutils";
 */
async function main(): Promise<void> {
  const owner = new Wallet(process.env.PRIVATE_KEY!);

  const SimpleAccountFactory = await ethers.getContractFactory(
    "SimpleAccountFactory"
  );

  const factory = await SimpleAccountFactory.attach(
    "0x109E91d7c6D1f18Dc735A2E22A7724D2d3BaB8fF"
  );


  const account  =   await factory.createAccount(owner.address, 0)  

  console.log({account})

  // account= 0x328E5544b6267cEF03675d0b77D80a00904795Dc




  //const tx = await entryPoint.handleOps([userOp], accountAddress);
  //console.log(tx.hash);
}

main();