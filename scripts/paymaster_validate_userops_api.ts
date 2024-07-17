import { Wallet } from "ethers";
import { ethers } from "hardhat";
import { fillAndSign, fillSignAndPack, simulateValidation } from "../test/UserOp";
import { defaultAbiCoder, hexConcat, hexlify } from "ethers/lib/utils";
import { EntryPoint__factory } from "../typechain";
import { parseValidationData } from "../test/testutils";
import axios from "axios";

async function validatePaymaster(
  userOp: any,
  validUntil: string,
  validAfter: string
): Promise<any> {
  const paymasterApi = axios.create({ baseURL: "http://localhost:3001" });

  const body = {
    userOperation: userOp,
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
  const entryPointAddress = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";

  const accountAddress = "0x76bF77425f6575D4d3bb0D82e45245B0CD7Bf9eD";

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
      nonce: "0x00",
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
      paymasterAndData: userOp1.paymasterData,
      signature: userOp1.signature,
    },
    VALID_UNTIL,
    VALID_AFTER
  );
  //console.log("API RESULT", apiRes.result.paymasterAndData);

  const userOp = await fillSignAndPack(
    {
      ...userOp1,
      paymaster: paymaster.address,
      paymasterData: apiRes.result.paymasterData,
    },
    owner,
    entryPoint
  );

  console.log("USER OP", userOp);

  const res = await simulateValidation(userOp, entryPoint.address)

  console.log(res);
  const validationData = parseValidationData(res.returnInfo.paymasterValidationData)

  //const tx = await entryPoint.handleOps([userOp], accountAddress);
  //console.log(tx.hash);
}

main();
