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
  const paymasterSigner = new Wallet(process.env.PAYMASTER_OWNER_PRIVATE_KEY!);

  const ethersSigner = ethers.provider.getSigner();
  const entryPointAddress = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";

  const accountAddress = "0x56ccbcF43d4DE1602498aBD869d17c4cf11896dB";

  const PaymasterFactory = await ethers.getContractFactory(
    "VerifyingPaymaster"
  );

  const paymaster = await PaymasterFactory.attach(
    "0xc49d6e93bB127A2FDf349FAdBD90De6853Bf40ff"
  );

  const entryPoint = EntryPoint__factory.connect(
    entryPointAddress,
    ethersSigner
  );

  const VALID_UNTIL = "0x00000000deadbeef"; // 2088
  const VALID_AFTER = "0x0000000000001234"; //1970

  const userOp1 = await fillAndSign(
    {
      sender: accountAddress,
      paymaster: paymaster.address,
      paymasterData: hexConcat([
        defaultAbiCoder.encode(
          ["uint48", "uint48"],
          [VALID_UNTIL, VALID_AFTER]
        ),
        "0x" + "00".repeat(65),
      ]),
      nonce:"0x01",
      verificationGasLimit : "0x17305",
      paymasterPostOpGasLimit : 10000,
      paymasterVerificationGasLimit:100000000
    },
    owner,
    entryPoint
  );


  const hash = await paymaster.getHash(packUserOp(userOp1), VALID_UNTIL, VALID_AFTER);
  console.log({hash});

  const sig = await paymasterSigner.signMessage(arrayify(hash));
  const userOp = await fillSignAndPack(
    {
      ...userOp1,
      paymaster: paymaster.address,
      paymasterData: hexConcat([
        defaultAbiCoder.encode(
          ["uint48", "uint48"],
          [VALID_UNTIL, VALID_AFTER]
        ),
        sig,
      ]),
    },
    owner,
    entryPoint
  );

  console.log("USER OP", userOp);

  const res = await simulateValidation(userOp, entryPoint.address)

  console.log(res);
  const validationData = parseValidationData(res.returnInfo.paymasterValidationData)

  console.log(validationData)


  //const tx = await entryPoint.handleOps([userOp], accountAddress);
  //console.log(tx.hash);
}

main();