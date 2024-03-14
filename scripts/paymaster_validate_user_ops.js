const { Wallet } = require("ethers");
const { arrayify } = require("ethers/lib/utils");

async function main() {
  const VALID_UNTIL = "0x00000000deadbeef"; // 2088
  const VALID_AFTER = "0x0000000000001234"; //1970

  const op = {
    sender: "0xb0485a310312352606a82c86D08931C17C101cFA",
    nonce: 0,
    initCode: "0x",
    callData: "0x",
    callGasLimit: 0,
    verificationGasLimit: 150000,
    preVerificationGas: 21000,
    maxFeePerGas: 1000000007,
    maxPriorityFeePerGas: 1000000000,
    paymasterAndData:
      "0xc66ab83418c20a65c3f8e83b3d11c8c3a6097b6f00000000000000000000000000000000000000000000000000000000deadbeef00000000000000000000000000000000000000000000000000000000000012340000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
    signature:
      "0x7ed27359d43e9e9c19ad03b804e1e0ce2361fdcb3bdd1370edde84b83040f687707c9e8d21b349568de161e7d81d21239f8045658e4aea487d1e3ed2f34b9b191b",
  };

  const PaymasterFactory = await ethers.getContractFactory(
    "VerifyingPaymaster"
  );

  const paymaster = await PaymasterFactory.attach(
    "0xf32C11b3566B478eC5EA292Ba8dD5B290997D021"
  );
  const hash = await paymaster.getHash(op, VALID_UNTIL, VALID_AFTER);
  console.log("Hash:", hash);
  const paymasterOwner = new Wallet(process.env.PAYMASTER_OWNER_PRIVATE_KEY);
  const paymasterSignature = await paymasterOwner.signMessage(arrayify(hash));
  console.log("Signature:", paymasterSignature);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
