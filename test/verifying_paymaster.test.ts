import { Wallet } from 'ethers'
import { ethers } from 'hardhat'
import { expect } from 'chai'
import {
  EntryPoint,
  SimpleAccount,
  VerifyingPaymaster,
  VerifyingPaymaster__factory
} from '../typechain'
import {
  AddressZero,
  createAccount,
  createAccountOwner, createAddress, decodeRevertReason,
  deployEntryPoint, packPaymasterData, parseValidationData
} from './testutils'
import { DefaultsForUserOp, fillAndSign, fillSignAndPack, packUserOp, simulateValidation } from './UserOp'
import { arrayify, defaultAbiCoder, hexConcat, parseEther } from 'ethers/lib/utils'
import { PackedUserOperation } from './UserOperation'

const MOCK_PAYMASTER_ID = '0x0000000000000001'
const MOCK_VALID_UNTIL = '0x00000000deadbeef'
const MOCK_VALID_AFTER = '0x0000000000001234'
const MOCK_SIG = '0x1234'

describe('Constructor', () => {
  const ethersSigner = ethers.provider.getSigner()

  it('should deploy successfully with valid parameters', async () => {
    const validEntryPoint = await deployEntryPoint()
    const validOffchainSigner = createAccountOwner()
    const validPaymaster = await new VerifyingPaymaster__factory(ethersSigner).deploy(validEntryPoint.address, validOffchainSigner.address)
    expect(await validPaymaster.verifyingSigner()).to.equal(validOffchainSigner.address)
  })
})

describe('VerifyingPaymaster Properties', function () {
  let entryPoint: EntryPoint
  let accountOwner: Wallet
  const ethersSigner = ethers.provider.getSigner()
  let account: SimpleAccount
  let offchainSigner: Wallet

  let paymaster: VerifyingPaymaster
  before(async function () {
    this.timeout(20000)
    entryPoint = await deployEntryPoint()

    offchainSigner = createAccountOwner()
    accountOwner = createAccountOwner()

    paymaster = await new VerifyingPaymaster__factory(ethersSigner).deploy(entryPoint.address, offchainSigner.address)
    await paymaster.addStake(1, { value: parseEther('2') })
    await entryPoint.depositTo(paymaster.address, { value: parseEther('1') });
    ({ proxy: account } = await createAccount(ethersSigner, accountOwner.address, entryPoint.address))
  })

  describe('#depositFor', () => {
    it('should revert when paymasterId is zero', async () => {
      await expect(paymaster.depositFor(0, { value: parseEther('1') })).to.be.revertedWith('Paymaster Id cannot be zero')
    })

    it('should revert when deposit amount is zero', async () => {
      await expect(paymaster.depositFor(1, { value: 0 })).to.be.revertedWith('Deposit value cannot be zero')
    })

    it('should deposit correctly for valid paymasterId and amount', async () => {
      const initialBalance = await paymaster.getBalance(1)
      await paymaster.depositFor(1, { value: parseEther('1') })
      const newBalance = await paymaster.getBalance(1)
      expect(newBalance).to.be.equal(initialBalance.add(parseEther('1')))
    })

    it('should emit GasDeposited event on successful deposit', async () => {
      await expect(paymaster.depositFor(1, { value: parseEther('1') }))
        .to.emit(paymaster, 'GasDeposited')
        .withArgs(1, parseEther('1'))
    })
  })

  describe('#setUnaccountedEPGasOverhead', () => {
    it('should revert when called by non-owner', async () => {
      const nonOwner = createAccountOwner()
      await expect(paymaster.connect(nonOwner).setUnaccountedEPGasOverhead(15000))
        .to.be.revertedWith('OwnableUnauthorizedAccount')
    })

    it('should emit EPGasOverheadChanged event on successful change', async () => {
      const newValue = 15000
      await expect(paymaster.setUnaccountedEPGasOverhead(newValue))
        .to.emit(paymaster, 'EPGasOverheadChanged')
    })
  })

  describe('#withdrawTo', () => {
    it('should revert when called by non-owner', async () => {
      const nonOwner = createAccountOwner()
      await expect(paymaster.connect(nonOwner)['withdrawTo(address,uint256,uint48)'](createAddress(), parseEther('1'), 1))
        .to.be.revertedWith('OwnableUnauthorizedAccount')
    })

    it('should revert when withdraw address is zero', async () => {
      await expect(paymaster['withdrawTo(address,uint256,uint48)'](ethers.constants.AddressZero, parseEther('1'), 1))
        .to.be.revertedWith('Withdraw address cannot be zero')
    })

    it('should revert when amount is greater than balance', async () => {
      const currentBalance = await paymaster.getBalance(1)
      const withdrawAmount = currentBalance.add(parseEther('1'))
      await expect(paymaster['withdrawTo(address,uint256,uint48)'](createAddress(), withdrawAmount, 1))
        .to.be.revertedWith(`Insufficient balance in paymasterId, required: ${withdrawAmount}, available: ${currentBalance}`)
    })

    it('should withdraw correctly for valid address and amount', async () => {
      const withdrawAddress = createAddress()
      const initialBalance = await ethers.provider.getBalance(withdrawAddress)
      const withdrawAmount = parseEther('1')

      await paymaster.depositFor(1, { value: withdrawAmount })

      await paymaster['withdrawTo(address,uint256,uint48)'](withdrawAddress, withdrawAmount, 1)

      const newBalance = await ethers.provider.getBalance(withdrawAddress)
      expect(newBalance).to.be.equal(initialBalance.add(withdrawAmount))
    })

    it('should emit GasWithdrawn event on successful withdrawal', async () => {
      const withdrawAddress = createAddress()
      const withdrawAmount = parseEther('1')

      await paymaster.depositFor(1, { value: withdrawAmount })

      await expect(paymaster['withdrawTo(address,uint256,uint48)'](withdrawAddress, withdrawAmount, 1))
        .to.emit(paymaster, 'GasWithdrawn')
        .withArgs(1, withdrawAddress, withdrawAmount)
    })
  })
})

describe('EntryPoint with VerifyingPaymaster', function () {
  let entryPoint: EntryPoint
  let accountOwner: Wallet
  const ethersSigner = ethers.provider.getSigner()
  let account: SimpleAccount
  let offchainSigner: Wallet

  let paymaster: VerifyingPaymaster
  before(async function () {
    this.timeout(20000)
    entryPoint = await deployEntryPoint()

    offchainSigner = createAccountOwner()
    accountOwner = createAccountOwner()

    paymaster = await new VerifyingPaymaster__factory(ethersSigner).deploy(entryPoint.address, offchainSigner.address)
    await paymaster.addStake(1, { value: parseEther('2') })
    await entryPoint.depositTo(paymaster.address, { value: parseEther('1') });
    ({ proxy: account } = await createAccount(ethersSigner, accountOwner.address, entryPoint.address))
  })

  describe('#parsePaymasterAndData', () => {
    it('should parse data properly', async () => {
      const paymasterAndData = packPaymasterData(
        paymaster.address,
        DefaultsForUserOp.paymasterVerificationGasLimit,
        DefaultsForUserOp.paymasterPostOpGasLimit,
        hexConcat([
          defaultAbiCoder.encode(['uint48', 'uint48', 'uint48'], [MOCK_PAYMASTER_ID, MOCK_VALID_UNTIL, MOCK_VALID_AFTER]), MOCK_SIG
        ])
      )
      console.log(paymasterAndData)
      const res = await paymaster.parsePaymasterAndData(paymasterAndData)
      // console.log('MOCK_VALID_UNTIL, MOCK_VALID_AFTER', MOCK_VALID_UNTIL, MOCK_VALID_AFTER)
      // console.log('validUntil after', res.validUntil, res.validAfter)
      // console.log('MOCK SIG', MOCK_SIG)
      // console.log('sig', res.signature)
      expect(res.paymasterId).to.be.equal(ethers.BigNumber.from(MOCK_PAYMASTER_ID))
      expect(res.validUntil).to.be.equal(ethers.BigNumber.from(MOCK_VALID_UNTIL))
      expect(res.validAfter).to.be.equal(ethers.BigNumber.from(MOCK_VALID_AFTER))
      expect(res.signature).equal(MOCK_SIG)
    })
  })

  describe('#validatePaymasterUserOp', () => {
    it('should reject on no signature', async () => {
      const userOp = await fillSignAndPack({
        sender: account.address,
        paymaster: paymaster.address,
        paymasterPostOpGasLimit: 20000,
        paymasterData: hexConcat([defaultAbiCoder.encode(['uint48', 'uint48', 'uint48'], [MOCK_PAYMASTER_ID, MOCK_VALID_UNTIL, MOCK_VALID_AFTER]), '0x1234'])
      }, accountOwner, entryPoint)
      expect(await simulateValidation(userOp, entryPoint.address)
        .catch(e => decodeRevertReason(e)))
        .to.include('invalid signature length in paymasterAndData')
    })

    it('should reject on invalid signature', async () => {
      const userOp = await fillSignAndPack({
        sender: account.address,
        paymaster: paymaster.address,
        paymasterPostOpGasLimit: 20000,
        paymasterData: hexConcat(
          [defaultAbiCoder.encode(['uint48', 'uint48', 'uint48'], [MOCK_PAYMASTER_ID, MOCK_VALID_UNTIL, MOCK_VALID_AFTER]), '0x' + '00'.repeat(65)])
      }, accountOwner, entryPoint)
      expect(await simulateValidation(userOp, entryPoint.address)
        .catch(e => decodeRevertReason(e)))
        .to.include('ECDSAInvalidSignature')
    })

    describe('with wrong signature', () => {
      let wrongSigUserOp: PackedUserOperation
      const beneficiaryAddress = createAddress()
      before(async () => {
        const sig = await offchainSigner.signMessage(arrayify('0xdead'))
        wrongSigUserOp = await fillSignAndPack({
          sender: account.address,
          paymaster: paymaster.address,
          paymasterPostOpGasLimit: 20000,
          paymasterData: hexConcat([defaultAbiCoder.encode(['uint48', 'uint48', 'uint48'], [MOCK_PAYMASTER_ID, MOCK_VALID_UNTIL, MOCK_VALID_AFTER]), sig])
        }, accountOwner, entryPoint)
      })

      it('should return signature error (no revert) on wrong signer signature', async () => {
        const ret = await simulateValidation(wrongSigUserOp, entryPoint.address)
        expect(parseValidationData(ret.returnInfo.paymasterValidationData).aggregator).to.match(/0x0*1$/)
      })

      it('handleOp revert on signature failure in handleOps', async () => {
        await expect(entryPoint.estimateGas.handleOps([wrongSigUserOp], beneficiaryAddress)).to.revertedWith('AA34 signature error')
      })
    })

    it('succeed with valid signature', async () => {
      // Add sufficient deposit to ensure required pre-fund condition is met
      await paymaster.depositFor(1, { value: parseEther('1') })
      const userOp1 = await fillAndSign({
        sender: account.address,
        paymaster: paymaster.address,
        paymasterPostOpGasLimit: 20000,
        paymasterData: hexConcat(
          [defaultAbiCoder.encode(['uint48', 'uint48', 'uint48'], [MOCK_PAYMASTER_ID, MOCK_VALID_UNTIL, MOCK_VALID_AFTER]), '0x' + '00'.repeat(65)])
      }, accountOwner, entryPoint)
      const hash = await paymaster.getHash(packUserOp(userOp1), MOCK_PAYMASTER_ID, MOCK_VALID_UNTIL, MOCK_VALID_AFTER)
      const sig = await offchainSigner.signMessage(arrayify(hash))
      const userOp = await fillSignAndPack({
        ...userOp1,
        paymaster: paymaster.address,
        paymasterData: hexConcat([defaultAbiCoder.encode(['uint48', 'uint48', 'uint48'], [MOCK_PAYMASTER_ID, MOCK_VALID_UNTIL, MOCK_VALID_AFTER]), sig])
      }, accountOwner, entryPoint)
      const res = await simulateValidation(userOp, entryPoint.address)
      const validationData = parseValidationData(res.returnInfo.paymasterValidationData)
      expect(validationData).to.eql({
        aggregator: AddressZero,
        validAfter: parseInt(MOCK_VALID_AFTER),
        validUntil: parseInt(MOCK_VALID_UNTIL)
      })
    })

    it('should revert if postOpGasLimit is less than paymaster balance', async () => {
      // paymasterId 2 has not been funded
      const userOp1 = await fillAndSign({
        sender: account.address,
        paymaster: paymaster.address,
        paymasterPostOpGasLimit: 10000,
        paymasterData: hexConcat(
          [defaultAbiCoder.encode(['uint48', 'uint48', 'uint48'], ['0x0000000000000002', MOCK_VALID_UNTIL, MOCK_VALID_AFTER]), '0x' + '00'.repeat(65)])
      }, accountOwner, entryPoint)
      const hash = await paymaster.getHash(packUserOp(userOp1), '0x0000000000000002', MOCK_VALID_UNTIL, MOCK_VALID_AFTER)
      const sig = await offchainSigner.signMessage(arrayify(hash))
      const userOp = await fillAndSign({
        ...userOp1,
        paymaster: paymaster.address,
        paymasterData: hexConcat([defaultAbiCoder.encode(['uint48', 'uint48', 'uint48'], ['0x0000000000000002', MOCK_VALID_UNTIL, MOCK_VALID_AFTER]), sig])
      }, accountOwner, entryPoint)
      expect(await simulateValidation(packUserOp(userOp), entryPoint.address)
        .catch(e => decodeRevertReason(e)))
        .to.include('TokenPaymaster: gas too low for postOp')
    })

    it('should revert if required pre-fund is greater than paymaster balance', async () => {
      // paymasterId 2 has not been funded
      const userOp1 = await fillAndSign({
        sender: account.address,
        paymaster: paymaster.address,
        paymasterPostOpGasLimit: 20000,
        paymasterData: hexConcat(
          [defaultAbiCoder.encode(['uint48', 'uint48', 'uint48'], ['0x0000000000000002', MOCK_VALID_UNTIL, MOCK_VALID_AFTER]), '0x' + '00'.repeat(65)])
      }, accountOwner, entryPoint)
      const hash = await paymaster.getHash(packUserOp(userOp1), '0x0000000000000002', MOCK_VALID_UNTIL, MOCK_VALID_AFTER)
      const sig = await offchainSigner.signMessage(arrayify(hash))
      const userOp = await fillAndSign({
        ...userOp1,
        paymaster: paymaster.address,
        paymasterData: hexConcat([defaultAbiCoder.encode(['uint48', 'uint48', 'uint48'], ['0x0000000000000002', MOCK_VALID_UNTIL, MOCK_VALID_AFTER]), sig])
      }, accountOwner, entryPoint)
      expect(await simulateValidation(packUserOp(userOp), entryPoint.address)
        .catch(e => decodeRevertReason(e)))
        .to.include('Insufficient balance in paymasterId')
    })
  })
})
