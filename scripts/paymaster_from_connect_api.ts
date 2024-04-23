import { Wallet } from "ethers";
import { ethers } from "hardhat";
import { fillAndSign } from "../test/UserOp";
import { defaultAbiCoder, hexConcat, hexlify } from "ethers/lib/utils";
import { EntryPoint__factory } from "../typechain";
import { simulationResultCatch } from "../test/testutils";
import axios from "axios";

async function validatePaymaster(
  userOp: any,
  validUntil: string,
  validAfter: string
): Promise<any> {
  const paymasterApi = axios.create({ baseURL: "http://localhost:3000" });

  const body = {
    userOp: userOp,
    validUntil: validUntil,
    validAfter: validAfter,
  };

  const response = await paymasterApi.post(
    "/verifying-paymaster/validate",
    body,
    {
      headers: {
        apiKey: "ezaeaeazea",
        "x-consumer-access": "public",
        "x-consumer-groups": "connect",
        "x-consumer-username": "650ae7583be9c36fad85c0e2",
        "x-project-chain-id": "421614",
      },
    }
  );
  return response?.data;
}

async function main(): Promise<void> {
  const owner = new Wallet(process.env.PRIVATE_KEY!);

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

  console.log("USER OP", userOp1);

  const apiRes = await validatePaymaster(
    {
      sender: userOp1.sender,
      nonce: hexlify(userOp1.nonce),
      initCode: userOp1.initCode,
      callData: userOp1.callData,
      callGasLimit: userOp1.callGasLimit,
      verificationGasLimit: userOp1.verificationGasLimit,
      preVerificationGas: userOp1.preVerificationGas,
      maxFeePerGas: hexlify(userOp1.maxFeePerGas),
      maxPriorityFeePerGas: userOp1.maxPriorityFeePerGas,
      paymasterAndData: userOp1.paymasterAndData,
      signature: userOp1.signature,
    },
    VALID_UNTIL,
    VALID_AFTER
  );
  console.log("API RESULT", apiRes.result.paymasterAndData);

  const userOp = await fillAndSign(
    {
      ...userOp1,
      paymasterAndData: apiRes.result.paymasterAndData,
    },
    owner,
    entryPoint
  );

  console.log("USER OP", userOp);

  const res = await entryPoint.callStatic
    .simulateValidation(userOp)
    .catch(simulationResultCatch);

  console.log(res.returnInfo);

  //const tx = await entryPoint.handleOps([userOp], accountAddress);
  //console.log(tx.hash);
}

main();
