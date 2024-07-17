// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.23;

/* solhint-disable reason-string */
/* solhint-disable no-inline-assembly */

import "../core/BasePaymaster.sol";
import "../core/UserOperationLib.sol";
import "../core/Helpers.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol"; 

/**
 * A sample paymaster that uses external service to decide whether to pay for the UserOp.
 * The paymaster trusts an external signer to sign the transaction.
 * The calling user must pass the UserOp to that external signer first, which performs
 * whatever off-chain verification before signing the UserOp.
 * Note that this signature is NOT a replacement for the account-specific signature:
 * - the paymaster checks a signature to agree to PAY for GAS.
 * - the account checks a signature to prove identity and account ownership.
 */
contract VerifyingPaymaster is BasePaymaster, ReentrancyGuard {

    using UserOperationLib for PackedUserOperation;

    //calculated cost of the postOp
    uint256 constant public COST_OF_POST = 15000;

    address public immutable verifyingSigner;

    uint256 private constant VALID_TIMESTAMP_OFFSET = PAYMASTER_DATA_OFFSET;

    uint256 private constant SIGNATURE_OFFSET = VALID_TIMESTAMP_OFFSET + 96; 

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

    constructor(IEntryPoint _entryPoint, address _verifyingSigner) BasePaymaster(_entryPoint) {
        verifyingSigner = _verifyingSigner;
        unaccountedEPGasOverhead = 16000;
    }

    /**
     * @dev Add a deposit for this paymaster and given paymasterId (Dapp Depositor ID), used for paying for transaction fees
     * @param paymasterId dapp identifier for which deposit is being made
     */
    function depositFor(uint48 paymasterId) external payable nonReentrant { 
        if (paymasterId == 0) revert("Paymaster Id cannot be zero");
        if (msg.value == 0) revert("Deposit value cannot be zero");
        paymasterIdBalances[paymasterId] = paymasterIdBalances[paymasterId] + msg.value;
        entryPoint.depositTo{value: msg.value}(address(this));
        emit GasDeposited(paymasterId, msg.value);
    }

    function setUnaccountedEPGasOverhead(uint256 value) external onlyOwner {
        uint256 oldValue = unaccountedEPGasOverhead;
        unaccountedEPGasOverhead = value;
        emit EPGasOverheadChanged(oldValue, value);
    }

    /**
     * @dev get the current deposit for paymasterId (Dapp Depositor ID)
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
    function withdrawTo(address payable /* withdrawAddress */, uint256 /* amount */) public pure override {
        revert("Use withdrawTo with paymasterId parameter");
    }


    /**
     * @dev Withdraws the specified amount of gas tokens from the paymaster's balance and transfers them to the specified address.
     * @param withdrawAddress The address to which the gas tokens should be transferred.
     * @param amount The amount of gas tokens to withdraw.
     * @param paymasterId The paymasterId (Dapp Depositor ID) from which the gas tokens should be withdrawn.
     */
    function withdrawTo(
        address payable withdrawAddress,
        uint256 amount,
        uint48 paymasterId
    ) public onlyOwner nonReentrant {
        if (withdrawAddress == address(0)) revert("Withdraw address cannot be zero");
        uint256 currentBalance = paymasterIdBalances[paymasterId];
        if (amount > currentBalance)
        revert(string(abi.encodePacked(
            "Insufficient balance in paymasterId, required: ",
            Strings.toString(amount),
            ", available: ",
            Strings.toString(currentBalance)
        )));
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

    /**
     * return the hash we're going to sign off-chain (and validate on-chain)
     * this method is called by the off-chain service, to sign the request.
     * it is called on-chain from the validatePaymasterUserOp, to validate the signature.
     * note that this signature covers all fields of the UserOperation, except the "paymasterAndData",
     * which will carry the signature itself.
     */
    function getHash(PackedUserOperation calldata userOp, uint48 paymasterId, uint48 validUntil, uint48 validAfter)
    public view returns (bytes32) {
        //can't use userOp.hash(), since it contains also the paymasterAndData itself.
        address sender = userOp.getSender();
        return
            keccak256(
            abi.encode(
                sender,
                userOp.nonce,
                keccak256(userOp.initCode),
                keccak256(userOp.callData),
                userOp.accountGasLimits,
                uint256(bytes32(userOp.paymasterAndData[PAYMASTER_VALIDATION_GAS_OFFSET : PAYMASTER_DATA_OFFSET])),
                userOp.preVerificationGas,
                userOp.gasFees,
                block.chainid,
                address(this),
                paymasterId,
                validUntil,
                validAfter
            )
        );
    }

    /**
    * @dev Executes the paymaster's payment conditions
    * @param context payment conditions signed by the paymaster in `validatePaymasterUserOp`
    * @param actualGasCost amount to be paid to the entry point in wei
    * @param actualUserOpFeePerGas the actual fee per gas used by the user operation
    */
    function _postOp(
        PostOpMode /** mode */,
        bytes calldata context,
        uint256 actualGasCost,
        uint256 actualUserOpFeePerGas
    ) internal override {
        (uint48 paymasterId) = abi.decode(context, (uint48));
        uint256 balToDeduct = actualGasCost + (unaccountedEPGasOverhead * actualUserOpFeePerGas);
        paymasterIdBalances[paymasterId] -= balToDeduct;
        emit GasBalanceDeducted(paymasterId, balToDeduct);
    }

    /**
     * verify our external signer signed this request.
     * the "paymasterAndData" is expected to be the paymaster and a signature over the entire request params
     * paymasterAndData[:20] : address(this)
     * paymasterAndData[20:116] : abi.encode(paymasterId, validUntil, validAfter)
     * paymasterAndData[116:] : signature
     */
    function _validatePaymasterUserOp(PackedUserOperation calldata userOp, bytes32 /*userOpHash*/, uint256 requiredPreFund)
    internal view override returns (bytes memory context, uint256 validationData) {
        (requiredPreFund);

        (uint48 paymasterId, uint48 validUntil, uint48 validAfter, bytes calldata signature) = parsePaymasterAndData(userOp.paymasterAndData);
        //ECDSA library supports both 64 and 65-byte long signatures.
        // we only "require" it here so that the revert reason on invalid signature will be of "VerifyingPaymaster", and not "ECDSA"
        require(signature.length == 64 || signature.length == 65, "VerifyingPaymaster: invalid signature length in paymasterAndData");
        bytes32 hash = MessageHashUtils.toEthSignedMessageHash(getHash(userOp, paymasterId, validUntil, validAfter));

        uint256 postOpGasLimit = userOp.unpackPostOpGasLimit();
        require( postOpGasLimit > COST_OF_POST, "TokenPaymaster: gas too low for postOp");

        //don't revert on signature failure: return SIG_VALIDATION_FAILED
        if (verifyingSigner != ECDSA.recover(hash, signature)) {
            return ("", _packValidationData(true, validUntil, validAfter));
        }

        if (requiredPreFund > paymasterIdBalances[paymasterId])
            revert(string(abi.encodePacked(
                "Insufficient balance in paymasterId, required: ",
                Strings.toString(requiredPreFund),
                ", available: ",
                Strings.toString(paymasterIdBalances[paymasterId])
            )));

        //no need for other on-chain validation: entire UserOp should have been checked
        // by the external service prior to signing it.
        return (
            abi.encode(paymasterId),
            _packValidationData(
                false,
                validUntil,
                validAfter
            )
        );
    }

    function parsePaymasterAndData(bytes calldata paymasterAndData) public pure returns (uint48 paymasterId, uint48 validUntil, uint48 validAfter, bytes calldata signature) {
        (paymasterId, validUntil, validAfter) = abi.decode(paymasterAndData[VALID_TIMESTAMP_OFFSET :], (uint48, uint48, uint48));
        signature = paymasterAndData[SIGNATURE_OFFSET :]; 
    }
}
