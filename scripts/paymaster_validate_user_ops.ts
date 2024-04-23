import { Wallet } from "ethers";
import { ethers } from "hardhat";
import { fillAndSign } from "../test/UserOp";
import { arrayify, defaultAbiCoder, hexConcat } from "ethers/lib/utils";
import { EntryPoint__factory } from "../typechain";
import { simulationResultCatch } from "../test/testutils";

async function main(): Promise<void> {
  const owner = new Wallet(process.env.PRIVATE_KEY!);
  const paymasterSigner = new Wallet(process.env.PAYMASTER_OWNER_PRIVATE_KEY!);

  const ethersSigner = ethers.provider.getSigner();
  const entryPointAddress = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";

  const accountAddress = "0x8050dd2c27E71c0Fe6B76ba136e8C7435eDADDE9";

  const PaymasterFactory = await ethers.getContractFactory(
    "VerifyingPaymaster"
  );

  const paymaster = await PaymasterFactory.attach(
    "0x6f010FB33E6dce2789c714b19c385035122e664E"
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
      paymasterAndData: hexConcat([
        paymaster.address,
        defaultAbiCoder.encode(
          ["uint48", "uint48"],
          [VALID_UNTIL, VALID_AFTER]
        ),
        "0x" + "00".repeat(65),
      ]),
    },
    owner,
    entryPoint
  );

  const hash = await paymaster.getHash(userOp1, VALID_UNTIL, VALID_AFTER);
  console.log(hash);

  const sig = await paymasterSigner.signMessage(arrayify(hash));
  const userOp = await fillAndSign(
    {
      ...userOp1,
      paymasterAndData: hexConcat([
        paymaster.address,
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

  const res = await entryPoint.callStatic
    .simulateValidation(userOp)
    .catch(simulationResultCatch);

  console.log(res.returnInfo.sigFailed);
}

main();
