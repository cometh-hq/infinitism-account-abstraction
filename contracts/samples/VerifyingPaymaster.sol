// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.12;

/* solhint-disable reason-string */
/* solhint-disable no-inline-assembly */

import "../core/BasePaymaster.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {VerifyingPaymasterErrors} from "../common/Errors.sol";
/**
 * A sample paymaster that uses external service to decide whether to pay for the UserOp.
 * The paymaster trusts an external signer to sign the transaction.
 * The calling user must pass the UserOp to that external signer first, which performs
 * whatever off-chain verification before signing the UserOp.
 * Note that this signature is NOT a replacement for the account-specific signature:
 * - the paymaster checks a signature to agree to PAY for GAS.
 * - the account checks a signature to prove identity and account ownership.
 */
contract VerifyingPaymaster is 
BasePaymaster,
ReentrancyGuard,
VerifyingPaymasterErrors
 {

    using ECDSA for bytes32;
    using UserOperationLib for UserOperation;

    address public immutable verifyingSigner;

    uint256 private constant PAYMASTER_ID_OFFSET = 20;
    uint256 private constant SIGNATURE_OFFSET = 116;

    mapping(address => uint256) public senderNonce;

    uint256 private unaccountedEPGasOverhead;
    mapping(uint48 => uint256) public paymasterIdBalances;

    event EPGasOverheadChanged(
        uint256 indexed _oldValue,
        uint256 indexed _newValue
    );

    event GasDeposited(uint48 indexed _paymasterId, uint256 indexed _value);
    event GasWithdrawn(
        uint48 indexed _paymasterId,
        address indexed _to,
        uint256 indexed _value
    );
    event GasBalanceDeducted(
        uint48 indexed _paymasterId,
        uint256 indexed _charge
    );

        constructor(
        IEntryPoint _entryPoint,
        address _verifyingSigner
    ) payable BasePaymaster(_entryPoint) {
        if (address(_entryPoint) == address(0)) revert EntryPointCannotBeZero();
        if (_verifyingSigner == address(0))
            revert VerifyingSignerCannotBeZero();
        verifyingSigner = _verifyingSigner;
        unaccountedEPGasOverhead = 12000;
    }



    /**
     * @dev Add a deposit for this paymaster and given paymasterId (Dapp Depositor address), used for paying for transaction fees
     * @param paymasterId dapp identifier for which deposit is being made
     */
    function depositFor(uint48 paymasterId) external payable nonReentrant {
        if (paymasterId == 0) revert PaymasterIdCannotBeZero();
        if (msg.value == 0) revert DepositCanNotBeZero();
        paymasterIdBalances[paymasterId] =
            paymasterIdBalances[paymasterId] +
            msg.value;
        entryPoint.depositTo{value: msg.value}(address(this));
        emit GasDeposited(paymasterId, msg.value);
    }

    function setUnaccountedEPGasOverhead(uint256 value) external onlyOwner {
        uint256 oldValue = unaccountedEPGasOverhead;
        unaccountedEPGasOverhead = value;
        emit EPGasOverheadChanged(oldValue, value);
    }

    /**
     * @dev get the current deposit for paymasterId (Dapp Depositor address)
     * @param paymasterId dapp identifier
     */
    function getBalance(
        uint48 paymasterId
    ) external view returns (uint256 balance) {
        balance = paymasterIdBalances[paymasterId];
    }

    /**
     * @dev Overrides the base function to maintain compatibility.
     * Calls the internal function with a default paymasterId.
     */
    function withdrawTo(address payable withdrawAddress, uint256 amount) public override nonReentrant {
        revert("Use withdrawTo with paymasterId parameter");
    }

    /**
     * @dev Withdraws the specified amount of gas tokens from the paymaster's balance and transfers them to the specified address.
     * @param withdrawAddress The address to which the gas tokens should be transferred.
     * @param amount The amount of gas tokens to withdraw.
     */
    function withdrawTo(
        address payable withdrawAddress,
        uint256 amount,
        uint48 paymasterId
    ) public onlyOwner nonReentrant {
        if (withdrawAddress == address(0)) revert CanNotWithdrawToZeroAddress();
        uint256 currentBalance = paymasterIdBalances[paymasterId];
        if (amount > currentBalance)
            revert InsufficientBalance(amount, currentBalance);
        paymasterIdBalances[paymasterId] =
            paymasterIdBalances[paymasterId] -
            amount;
        entryPoint.withdrawTo(withdrawAddress, amount);
        emit GasWithdrawn(paymasterId, withdrawAddress, amount);
    }


    /**
     @dev Override the default implementation.
     */
    function deposit() public payable virtual override {
        revert("user DepositFor instead");
    }

    function pack(UserOperation calldata userOp) internal pure returns (bytes memory ret) {
        // lighter signature scheme. must match UserOp.ts#packUserOp
        bytes calldata pnd = userOp.paymasterAndData;
        // copy directly the userOp from calldata up to (but not including) the paymasterAndData.
        // this encoding depends on the ABI encoding of calldata, but is much lighter to copy
        // than referencing each field separately.
        assembly {
            let ofs := userOp
            let len := sub(sub(pnd.offset, ofs), 32)
            ret := mload(0x40)
            mstore(0x40, add(ret, add(len, 32)))
            mstore(ret, len)
            calldatacopy(add(ret, 32), ofs, len)
        }
    }

    /**
     * return the hash we're going to sign off-chain (and validate on-chain)
     * this method is called by the off-chain service, to sign the request.
     * it is called on-chain from the validatePaymasterUserOp, to validate the signature.
     * note that this signature covers all fields of the UserOperation, except the "paymasterAndData",
     * which will carry the signature itself.
     */
    function getHash(UserOperation calldata userOp, uint48 paymasterId, uint48 validUntil, uint48 validAfter)
    public view returns (bytes32) {
        //can't use userOp.hash(), since it contains also the paymasterAndData itself.

        return keccak256(abi.encode(
                pack(userOp),
                block.chainid,
                address(this),
                senderNonce[userOp.getSender()],
                paymasterId,
                validUntil,
                validAfter
            ));
    }

    /**
 * @dev Executes the paymaster's payment conditions
 * @param context payment conditions signed by the paymaster in `validatePaymasterUserOp`
 * @param actualGasCost amount to be paid to the entry point in wei
 */
function _postOp(
    PostOpMode /*mode*/,
    bytes calldata context,
    uint256 actualGasCost
) internal virtual override {
    (uint48 paymasterId, uint256 maxFeePerGas, uint256 maxPriorityFeePerGas) = abi.decode(context, (uint48, uint256, uint256));
    uint256 effectiveGasPrice = getGasPrice(maxFeePerGas, maxPriorityFeePerGas);
    uint256 balToDeduct = actualGasCost + (unaccountedEPGasOverhead * effectiveGasPrice);
    paymasterIdBalances[paymasterId] -= balToDeduct;
    emit GasBalanceDeducted(paymasterId, balToDeduct);
}


    /**
     * verify our external signer signed this request.
     * the "paymasterAndData" is expected to be the paymaster and a signature over the entire request params
     * paymasterAndData[:20] : address(this)
     * paymasterAndData[20:84] : abi.encode(validUntil, validAfter)
     * paymasterAndData[84:] : signature
     */
    function _validatePaymasterUserOp(UserOperation calldata userOp, bytes32 /*userOpHash*/, uint256 requiredPreFund)
    internal override returns (bytes memory context, uint256 validationData) {
        (requiredPreFund);

        (uint48 paymasterId, uint48 validUntil, uint48 validAfter, bytes calldata signature) = parsePaymasterAndData(userOp.paymasterAndData);
        //ECDSA library supports both 64 and 65-byte long signatures.
        // we only "require" it here so that the revert reason on invalid signature will be of "VerifyingPaymaster", and not "ECDSA"
        require(signature.length == 64 || signature.length == 65, "VerifyingPaymaster: invalid signature length in paymasterAndData");
        bytes32 hash = ECDSA.toEthSignedMessageHash(getHash(userOp, paymasterId, validUntil, validAfter));
        senderNonce[userOp.getSender()]++;

        //don't revert on signature failure: return SIG_VALIDATION_FAILED
        if (verifyingSigner != ECDSA.recover(hash, signature)) {
            return ("",_packValidationData(true,validUntil,validAfter));
        }

        if (requiredPreFund > paymasterIdBalances[paymasterId])
            revert InsufficientBalance(
                requiredPreFund,
                paymasterIdBalances[paymasterId]
            );

        //no need for other on-chain validation: entire UserOp should have been checked
        // by the external service prior to signing it.
        return (abi.encode(paymasterId, userOp.maxFeePerGas, userOp.maxPriorityFeePerGas),
            _packValidationData(false,validUntil,validAfter));
    }

    function parsePaymasterAndData(bytes calldata paymasterAndData) public pure returns(uint48 paymasterId, uint48 validUntil, uint48 validAfter, bytes calldata signature) {
        (paymasterId, validUntil, validAfter) = abi.decode(paymasterAndData[PAYMASTER_ID_OFFSET:SIGNATURE_OFFSET], (uint48, uint48, uint48));
        signature = paymasterAndData[SIGNATURE_OFFSET:];
    }

    function getGasPrice(
        uint256 maxFeePerGas,
        uint256 maxPriorityFeePerGas
    ) internal view returns (uint256) {
        if (maxFeePerGas == maxPriorityFeePerGas) {
            //legacy mode (for networks that don't support basefee opcode)
            return maxFeePerGas;
        }
        return min(maxFeePerGas, maxPriorityFeePerGas + block.basefee);
    }

    function min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }
}