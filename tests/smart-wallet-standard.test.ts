import { initSimnet, tx } from "@stacks/clarinet-sdk";
import { Cl, serializeCV } from "@stacks/transactions";
import { describe, expect, it } from "vitest";
import {
  accounts,
  contracts,
  deployments,
} from "../clarigen/src/clarigen-types";
import {
  errorCodes,
  getSimnetChainId,
  getStxBalance,
  getStxMemoPrintEvent,
  initAndSendWrappedBitcoin,
  proxyTransferSrc,
} from "./testUtils";
import {
  createExtensionCallAuthorization,
  createSip09TransferAuthorization,
  createSip10TransferAuthorization,
  createStxTransferAuthorization,
  generateSecp256r1KeyPair,
} from "./secp256r1-utils";

const simnet = await initSimnet();

const deployer = accounts.deployer.address;
const address1 = accounts.wallet_1.address;
const address2 = accounts.wallet_2.address;
const address3 = accounts.wallet_3.address;
const address4 = accounts.wallet_4.address;

if (!deployer || !address2 || !address3) {
  throw new Error("One or more required addresses are undefined.");
}

const sip010Contract = deployments.nope.simnet;
const sip009Contract = deployments.ogBitcoinPizzaLeatherEdition.simnet;
const sip009Deployer = sip009Contract.split(".")[0];
const extTestContract = deployments.extTest.simnet;

const smartWalletStandard = deployments.smartWalletStandard.simnet;
const wrappedBitcoinContract = deployments.wrappedBitcoin.simnet;

describe("Standard Smart Wallet", () => {
  describe("Sender Auth STX Transfer", () => {
    it("owner can fund and refund the smart wallet", () => {
      const deployerBalanceBeforeFunding = getStxBalance(simnet, deployer);
      const fundAmount = 200;
      const stxTransfer = tx.transferSTX(
        fundAmount,
        smartWalletStandard,
        deployer
      );
      simnet.mineBlock([stxTransfer]);

      const smartWalletBalanceAfterFunding = getStxBalance(
        simnet,
        smartWalletStandard
      );
      const deployerBalanceAfterFunding = getStxBalance(simnet, deployer);
      expect(smartWalletBalanceAfterFunding).toBe(fundAmount);
      expect(deployerBalanceAfterFunding).toBe(
        deployerBalanceBeforeFunding - fundAmount
      );

      const refundAmount = 50;
      const { result: refundResponse } = simnet.callPublicFn(
        smartWalletStandard,
        "stx-transfer",
        [Cl.uint(refundAmount), Cl.principal(deployer), Cl.none(), Cl.none()],
        deployer
      );
      expect(refundResponse).toBeOk(Cl.bool(true));

      const smartWalletBalanceAfterRefund = getStxBalance(
        simnet,
        smartWalletStandard
      );
      const deployerBalanceAfterRefund = getStxBalance(simnet, deployer);
      expect(smartWalletBalanceAfterRefund).toBe(fundAmount - refundAmount);
      expect(deployerBalanceAfterRefund).toBe(
        deployerBalanceBeforeFunding - fundAmount + refundAmount
      );
    });

    it("can transfer 100 stx from overfunded smart wallet to standard recipient", () => {
      const transferAmount = 100;
      const overfundedAmount = 1;
      const smartWalletFunds = transferAmount + overfundedAmount;
      const stxTransfer = tx.transferSTX(
        smartWalletFunds,
        smartWalletStandard,
        address1
      );
      simnet.mineBlock([stxTransfer]);

      const { result: transferResponse } = simnet.callPublicFn(
        smartWalletStandard,
        "stx-transfer",
        [Cl.uint(transferAmount), Cl.principal(address2), Cl.none(), Cl.none()],
        deployer
      );

      expect(transferResponse).toBeOk(Cl.bool(true));
    });

    it("can transfer 100 stx from fully funded smart wallet to standard recipient", () => {
      const transferAmount = 100;
      const stxTransfer = tx.transferSTX(
        transferAmount,
        smartWalletStandard,
        address1
      );
      simnet.mineBlock([stxTransfer]);

      const { result: transferResponse } = simnet.callPublicFn(
        smartWalletStandard,
        "stx-transfer",
        [Cl.uint(transferAmount), Cl.principal(address2), Cl.none(), Cl.none()],
        deployer
      );

      expect(transferResponse).toBeOk(Cl.bool(true));
    });

    it("cannot transfer 100 stx from underfunded smart wallet to standard recipient", () => {
      const transferAmount = 100;
      const smartWalletFunds = transferAmount - 1;
      const stxTransfer = tx.transferSTX(
        smartWalletFunds,
        smartWalletStandard,
        address1
      );
      simnet.mineBlock([stxTransfer]);

      const { result: transferResponse } = simnet.callPublicFn(
        smartWalletStandard,
        "stx-transfer",
        [Cl.uint(transferAmount), Cl.principal(address2), Cl.none(), Cl.none()],
        deployer
      );

      expect(transferResponse).toBeErr(
        Cl.uint(errorCodes.general.NOT_ENOUGH_BALANCE)
      );
    });

    it("transferring 100 stx with a memo correctly prints the events", () => {
      const transferAmount = 100;
      const transferAmountCV = Cl.uint(transferAmount);
      const testMemo = "test memo";
      const someMemoCV = Cl.some(
        Cl.bufferFromHex(serializeCV(Cl.stringAscii(testMemo)))
      );
      const stxTransfer = tx.transferSTX(
        transferAmount,
        smartWalletStandard,
        address1
      );
      simnet.mineBlock([stxTransfer]);

      const { events: stxTransferEvents } = simnet.callPublicFn(
        smartWalletStandard,
        "stx-transfer",
        [transferAmountCV, Cl.principal(address2), someMemoCV, Cl.none()],
        deployer
      );

      const expectedMemoPrintEvent = getStxMemoPrintEvent(
        transferAmount,
        smartWalletStandard,
        address2,
        testMemo
      );
      const [payloadPrintEvent, memoPrintEvent] = stxTransferEvents;
      expect(stxTransferEvents.length).toBe(2);
      expect(payloadPrintEvent.data.raw_value.slice(2)).toEqual(
        serializeCV(
          Cl.tuple({
            a: Cl.stringAscii("stx-transfer"),
            payload: Cl.tuple({
              amount: Cl.uint(transferAmount),
              recipient: Cl.principal(address2),
              memo: Cl.some(
                Cl.bufferFromHex(serializeCV(Cl.stringAscii(testMemo)))
              ),
            }),
          })
        )
      );
      expect(memoPrintEvent).toEqual(expectedMemoPrintEvent);
    });

    it("transferring 100 stx from smart wallet correctly updates the balances", () => {
      const transferAmount = 100;
      const transferAmountCV = Cl.uint(transferAmount);
      const recipientAddress = address2;
      const recipientBalanceBefore = getStxBalance(simnet, recipientAddress);
      const stxTransfer = tx.transferSTX(
        transferAmount,
        smartWalletStandard,
        address1
      );
      simnet.mineBlock([stxTransfer]);

      simnet.callPublicFn(
        smartWalletStandard,
        "stx-transfer",
        [transferAmountCV, Cl.principal(address2), Cl.none(), Cl.none()],
        deployer
      );

      const smartWalletBalanceAfterTransfer = getStxBalance(
        simnet,
        smartWalletStandard
      );
      const recipientBalanceAfterTransfer = getStxBalance(
        simnet,
        recipientAddress
      );

      expect(smartWalletBalanceAfterTransfer).toBe(0);
      expect(recipientBalanceAfterTransfer).toBe(
        recipientBalanceBefore + transferAmount
      );
    });

    it("non-admin cannot transfer stx from smart wallet", () => {
      const transferAmount = 100;
      const transferAmountCV = Cl.uint(transferAmount);

      const { result: transferResponse } = simnet.callPublicFn(
        smartWalletStandard,
        "stx-transfer",
        [transferAmountCV, Cl.principal(address2), Cl.none(), Cl.none()],
        address1
      );

      expect(transferResponse).toBeErr(
        Cl.uint(contracts.smartWalletStandard.constants.errUnauthorised.value)
      );
    });
  });

  describe("Signature Auth STX Transfer", () => {
    it("relayer cannot transfer 100 stx using unregistered key pair", () => {
      const amount = 100;
      const authId = 12345;
      const depositor = address1;
      const recipient = address2;
      const relayer = address3;

      const { result: fundingResult } = simnet.transferSTX(
        amount,
        smartWalletStandard,
        depositor
      );
      expect(fundingResult).toBeOk(Cl.bool(true));

      // Generate key pair. The public key is not registered in the contract.
      const keyPair = generateSecp256r1KeyPair();

      // Create authorization using the valid but unregistered key pair.
      const auth = createStxTransferAuthorization(
        getSimnetChainId(simnet),
        keyPair.privateKey,
        {
          authId: authId,
          amount: amount,
          recipient: recipient,
          memo: null,
        }
      );

      // Call the contract with the signature (from a relayer, not the admin).
      const { result: stxTransferResult } = simnet.callPublicFn(
        smartWalletStandard,
        "stx-transfer",
        [
          Cl.uint(amount),
          Cl.principal(recipient),
          Cl.none(),
          Cl.some(
            Cl.tuple({
              "auth-id": Cl.uint(auth.authId),
              signature: Cl.buffer(auth.signature),
              pubkey: Cl.buffer(keyPair.compressedPublicKey),
            })
          ),
        ],
        relayer // Relayer (not the admin).
      );
      expect(stxTransferResult).toBeErr(
        Cl.uint(
          contracts.smartWalletStandard.constants.errUnregisteredPubkey.value
        )
      );
    });

    it("relayer can transfer 100 stx from fully funded smart wallet to standard recipient", () => {
      const amount = 100;
      const authId = 12345;
      const depositor = address1;
      const recipient = address2;
      const relayer = address3;

      const { result: fundWalletResult } = simnet.transferSTX(
        amount,
        smartWalletStandard,
        depositor
      );
      expect(fundWalletResult).toBeOk(Cl.bool(true));

      // Generate key pair.
      const keyPair = generateSecp256r1KeyPair();

      // Register public key.
      const { result: registerPublicKeyResult } = simnet.callPublicFn(
        smartWalletStandard,
        "add-admin-pubkey",
        [Cl.buffer(keyPair.compressedPublicKey)],
        deployer
      );
      expect(registerPublicKeyResult).toBeOk(Cl.bool(true));

      const beforeTransfer = {
        wallet: getStxBalance(simnet, smartWalletStandard),
        depositor: getStxBalance(simnet, depositor),
        recipient: getStxBalance(simnet, recipient),
        relayer: getStxBalance(simnet, relayer),
      };

      // Create authorization using the registered key pair.
      const auth = createStxTransferAuthorization(
        getSimnetChainId(simnet),
        keyPair.privateKey,
        {
          authId: authId,
          amount: amount,
          recipient: recipient,
          memo: null,
        }
      );

      // Call the contract with the signature (from a relayer, not the admin).
      const { result: stxTransferResult } = simnet.callPublicFn(
        smartWalletStandard,
        "stx-transfer",
        [
          Cl.uint(auth.amount),
          Cl.principal(auth.recipient),
          Cl.none(),
          Cl.some(
            Cl.tuple({
              "auth-id": Cl.uint(auth.authId),
              signature: Cl.buffer(auth.signature),
              pubkey: Cl.buffer(keyPair.compressedPublicKey),
            })
          ),
        ],
        relayer // Relayer (not the admin).
      );
      expect(stxTransferResult).toBeOk(Cl.bool(true));

      const afterTransfer = {
        wallet: getStxBalance(simnet, smartWalletStandard),
        depositor: getStxBalance(simnet, depositor),
        recipient: getStxBalance(simnet, recipient),
        relayer: getStxBalance(simnet, relayer),
      };

      expect(afterTransfer.wallet).toBe(beforeTransfer.wallet - amount);
      expect(afterTransfer.recipient).toBe(beforeTransfer.recipient + amount);
      // Unchanged, only relayed the transaction.
      expect(afterTransfer.relayer).toBe(beforeTransfer.relayer);
      // Unchanged, only deposited the funds to the wallet.
      expect(afterTransfer.depositor).toBe(beforeTransfer.depositor);
    });

    it("multiple relayers can transfer STX from smart wallet using multiple registered key pairs", () => {
      const amount = 100;
      // Because the used authorizations map maps message hash to pubkey,
      // different authIds must be used (regardless of the fact that the
      // message was signed by different private keys).
      const authId1 = 12345;
      const authId2 = 12346;
      const depositor = address1;
      const recipient = address2;
      const relayer1 = address3;
      const relayer2 = address4;

      const { result: fundWalletResult } = simnet.transferSTX(
        2 * amount,
        smartWalletStandard,
        depositor
      );
      expect(fundWalletResult).toBeOk(Cl.bool(true));

      // Generate key pair.
      const keyPair1 = generateSecp256r1KeyPair();
      const keyPair2 = generateSecp256r1KeyPair();

      // Register public key.
      const { result: registerPublicKeyResult1 } = simnet.callPublicFn(
        smartWalletStandard,
        "add-admin-pubkey",
        [Cl.buffer(keyPair1.compressedPublicKey)],
        deployer
      );
      expect(registerPublicKeyResult1).toBeOk(Cl.bool(true));

      const { result: registerPublicKeyResult2 } = simnet.callPublicFn(
        smartWalletStandard,
        "add-admin-pubkey",
        [Cl.buffer(keyPair2.compressedPublicKey)],
        deployer
      );
      expect(registerPublicKeyResult2).toBeOk(Cl.bool(true));

      // Create authorization using the registered key pair.
      const auth1 = createStxTransferAuthorization(
        getSimnetChainId(simnet),
        keyPair1.privateKey,
        {
          authId: authId1,
          amount: amount,
          recipient: recipient,
          memo: null,
        }
      );
      const auth2 = createStxTransferAuthorization(
        getSimnetChainId(simnet),
        keyPair2.privateKey,
        {
          authId: authId2,
          amount: amount,
          recipient: recipient,
          memo: null,
        }
      );

      // Call the contract with the signature (from a relayer, not the admin).
      const { result: stxTransferResult1 } = simnet.callPublicFn(
        smartWalletStandard,
        "stx-transfer",
        [
          Cl.uint(auth1.amount),
          Cl.principal(auth1.recipient),
          Cl.none(),
          Cl.some(
            Cl.tuple({
              "auth-id": Cl.uint(auth1.authId),
              signature: Cl.buffer(auth1.signature),
              pubkey: Cl.buffer(keyPair1.compressedPublicKey),
            })
          ),
        ],
        relayer1
      );
      expect(stxTransferResult1).toBeOk(Cl.bool(true));

      const { result: stxTransferResult2 } = simnet.callPublicFn(
        smartWalletStandard,
        "stx-transfer",
        [
          Cl.uint(auth2.amount),
          Cl.principal(auth2.recipient),
          Cl.none(),
          Cl.some(
            Cl.tuple({
              "auth-id": Cl.uint(auth2.authId),
              signature: Cl.buffer(auth2.signature),
              pubkey: Cl.buffer(keyPair2.compressedPublicKey),
            })
          ),
        ],
        relayer2
      );
      expect(stxTransferResult2).toBeOk(Cl.bool(true));
    });

    it("malicious relayer cannot reuse signature to transfer STX", () => {
      const amount = 100;
      const authId = 12345;
      const depositor = address1;
      const recipient = address2;
      const relayer = address3;
      const malRelayer = address4;

      const { result: fundWalletResult } = simnet.transferSTX(
        amount,
        smartWalletStandard,
        depositor
      );
      expect(fundWalletResult).toBeOk(Cl.bool(true));

      // Generate key pair.
      const keyPair = generateSecp256r1KeyPair();

      // Register public key.
      const { result: registerPublicKeyResult } = simnet.callPublicFn(
        smartWalletStandard,
        "add-admin-pubkey",
        [Cl.buffer(keyPair.compressedPublicKey)],
        deployer
      );
      expect(registerPublicKeyResult).toBeOk(Cl.bool(true));

      // Create authorization using the registered key pair.
      const auth = createStxTransferAuthorization(
        getSimnetChainId(simnet),
        keyPair.privateKey,
        {
          authId: authId,
          amount: amount,
          recipient: recipient,
          memo: null,
        }
      );

      // First call succeeds.
      const { result: stxTransferResult } = simnet.callPublicFn(
        smartWalletStandard,
        "stx-transfer",
        [
          Cl.uint(auth.amount),
          Cl.principal(auth.recipient),
          Cl.none(),
          Cl.some(
            Cl.tuple({
              "auth-id": Cl.uint(auth.authId),
              signature: Cl.buffer(auth.signature),
              pubkey: Cl.buffer(keyPair.compressedPublicKey),
            })
          ),
        ],
        relayer // Relayer (not the admin).
      );
      expect(stxTransferResult).toBeOk(Cl.bool(true));

      // Malicious relayer tries to reuse the signature with the same params,
      // fails due to anti-replay protection.
      const { result: stxTransferReplayResult } = simnet.callPublicFn(
        smartWalletStandard,
        "stx-transfer",
        [
          Cl.uint(auth.amount),
          Cl.principal(auth.recipient),
          Cl.none(),
          Cl.some(
            Cl.tuple({
              "auth-id": Cl.uint(auth.authId),
              signature: Cl.buffer(auth.signature),
              pubkey: Cl.buffer(keyPair.compressedPublicKey),
            })
          ),
        ],
        malRelayer
      );
      expect(stxTransferReplayResult).toBeErr(
        Cl.uint(
          contracts.smartWalletStandard.constants.errSignatureReplay.value
        )
      );
    });

    it("ex-owner registered keypair can no longer transfer STX after transferring wallet", () => {
      const amount = 100;
      const authId = 12345;
      const depositor = address1;
      const recipient = address2;
      const relayer = address3;
      const newOwner = address4;

      const keyPair = generateSecp256r1KeyPair();

      // Register public key.
      const { result: registerPublicKeyResult } = simnet.callPublicFn(
        smartWalletStandard,
        "add-admin-pubkey",
        [Cl.buffer(keyPair.compressedPublicKey)],
        deployer
      );
      expect(registerPublicKeyResult).toBeOk(Cl.bool(true));

      // Create authorization using the registered key pair.
      const auth = createStxTransferAuthorization(
        getSimnetChainId(simnet),
        keyPair.privateKey,
        {
          authId: authId,
          amount: amount,
          recipient: recipient,
          memo: null,
        }
      );

      // Fund the wallet.
      const { result: fundWalletResult } = simnet.transferSTX(
        amount,
        smartWalletStandard,
        depositor
      );
      expect(fundWalletResult).toBeOk(Cl.bool(true));

      // Transfer the wallet to the new owner.
      const { result: transferWalletResult } = simnet.callPublicFn(
        smartWalletStandard,
        "transfer-wallet",
        [Cl.principal(newOwner)],
        deployer
      );
      expect(transferWalletResult).toBeOk(Cl.bool(true));

      // Relayer tries to transfer STX using a signature created by the
      // ex-owner's registered key pair.
      const { result: stxTransferResult } = simnet.callPublicFn(
        smartWalletStandard,
        "stx-transfer",
        [
          Cl.uint(amount),
          Cl.principal(recipient),
          Cl.none(),
          Cl.some(
            Cl.tuple({
              "auth-id": Cl.uint(auth.authId),
              signature: Cl.buffer(auth.signature),
              pubkey: Cl.buffer(keyPair.compressedPublicKey),
            })
          ),
        ],
        relayer
      );
      expect(stxTransferResult).toBeErr(
        Cl.uint(contracts.smartWalletStandard.constants.errNotAdminPubkey.value)
      );
    });
  });

  describe("Sender Auth SIP-010 Transfer", () => {
    it("transferring 100 sip10 tokens fails because tx-sender is not the token sender", () => {
      const transferAmount = 100;

      initAndSendWrappedBitcoin(simnet, transferAmount, smartWalletStandard);

      const { result: sip10transferResult } = simnet.callPublicFn(
        smartWalletStandard,
        "sip010-transfer",
        [
          Cl.uint(transferAmount),
          Cl.principal(address2),
          Cl.none(),
          Cl.principal(wrappedBitcoinContract),
          Cl.none(),
        ],
        deployer
      );
      // xBTC defines that tx-sender must be token sender
      expect(sip10transferResult).toBeErr(
        Cl.uint(errorCodes.wrappedBitcoin.ORIGINATOR_NOT_SENDER)
      );
    });
  });

  describe("Signature Auth SIP-010 Transfer", () => {
    it("transferring 100 sip10 tokens fails because tx-sender is not the token sender", () => {
      const transferAmount = 100;
      const authId = 12345;
      const recipient = address2;
      const relayer = address3;
      initAndSendWrappedBitcoin(simnet, transferAmount, smartWalletStandard);

      const keyPair = generateSecp256r1KeyPair();

      // Register public key.
      const { result: registerPublicKeyResult } = simnet.callPublicFn(
        smartWalletStandard,
        "add-admin-pubkey",
        [Cl.buffer(keyPair.compressedPublicKey)],
        deployer
      );
      expect(registerPublicKeyResult).toBeOk(Cl.bool(true));

      const auth = createSip10TransferAuthorization(
        getSimnetChainId(simnet),
        keyPair.privateKey,
        {
          authId: authId,
          amount: transferAmount,
          recipient: recipient,
          memo: null,
          sip010: wrappedBitcoinContract,
        }
      );

      const { result: sip10transferResult } = simnet.callPublicFn(
        smartWalletStandard,
        "sip010-transfer",
        [
          Cl.uint(transferAmount),
          Cl.principal(address2),
          Cl.none(),
          Cl.principal(wrappedBitcoinContract),
          Cl.some(
            Cl.tuple({
              "auth-id": Cl.uint(auth.authId),
              signature: Cl.buffer(auth.signature),
              pubkey: Cl.buffer(keyPair.compressedPublicKey),
            })
          ),
        ],
        relayer
      );
      // Passes auth, but fails because of the context switching.
      expect(sip10transferResult).toBeErr(
        Cl.uint(errorCodes.wrappedBitcoin.ORIGINATOR_NOT_SENDER)
      );
    });
  });

  describe("Sender Auth SIP-009 Transfer", () => {
    it("transfers 1 Nft to wallet", () => {
      const NftId = 99;
      // transfer NFT to smart wallet
      const { result: deployerTransferNftResult } = simnet.callPublicFn(
        sip009Contract,
        "transfer",
        [
          Cl.uint(NftId),
          Cl.principal(sip009Deployer),
          Cl.contractPrincipal(deployer, smartWalletStandard),
        ],
        sip009Deployer
      );
      expect(deployerTransferNftResult).toBeOk(Cl.bool(true));

      // transfer from smart wallet
      const { result: sip9transferResult } = simnet.callPublicFn(
        smartWalletStandard,
        "sip009-transfer",
        [
          Cl.uint(NftId),
          Cl.principal(address2),
          Cl.principal(sip009Contract),
          Cl.none(),
        ],
        deployer
      );

      expect(sip9transferResult).toBeErr(
        Cl.uint(errorCodes.ogBitcoinPizzaLeatherEdition.NOT_AUTHORIZED)
      );
    });
  });

  describe("Signature Auth SIP-009 Transfer", () => {
    it("transfers 1 Nft to wallet", () => {
      const NftId = 99;
      const authId = 12345;
      const recipient = address2;
      const relayer = address3;

      // transfer NFT to smart wallet
      const { result: deployerTransferNftResult } = simnet.callPublicFn(
        sip009Contract,
        "transfer",
        [
          Cl.uint(NftId),
          Cl.principal(sip009Deployer),
          Cl.contractPrincipal(deployer, smartWalletStandard),
        ],
        sip009Deployer
      );
      expect(deployerTransferNftResult).toBeOk(Cl.bool(true));

      const keyPair = generateSecp256r1KeyPair();
      // Register public key.
      const { result: registerPublicKeyResult } = simnet.callPublicFn(
        smartWalletStandard,
        "add-admin-pubkey",
        [Cl.buffer(keyPair.compressedPublicKey)],
        deployer
      );
      expect(registerPublicKeyResult).toBeOk(Cl.bool(true));

      const auth = createSip09TransferAuthorization(
        getSimnetChainId(simnet),
        keyPair.privateKey,
        {
          authId: authId,
          nftId: NftId,
          recipient: recipient,
          sip009: sip009Contract,
        }
      );

      // transfer from smart wallet
      const { result: sip9transferResult } = simnet.callPublicFn(
        smartWalletStandard,
        "sip009-transfer",
        [
          Cl.uint(NftId),
          Cl.principal(address2),
          Cl.principal(sip009Contract),
          Cl.some(
            Cl.tuple({
              "auth-id": Cl.uint(auth.authId),
              signature: Cl.buffer(auth.signature),
              pubkey: Cl.buffer(keyPair.compressedPublicKey),
            })
          ),
        ],
        relayer
      );
      // Passes auth, but fails because of the context switching.
      expect(sip9transferResult).toBeErr(
        Cl.uint(errorCodes.ogBitcoinPizzaLeatherEdition.NOT_AUTHORIZED)
      );
    });
  });

  describe("Sender Auth Extension Call", () => {
    it("admin can call extension with payload", () => {
      const payload = Cl.principal(smartWalletStandard);

      const { result: extensionCallResult } = simnet.callPublicFn(
        smartWalletStandard,
        "extension-call",
        [
          Cl.principal(extTestContract),
          Cl.bufferFromHex(Cl.serialize(payload)),
          Cl.none(),
        ],
        deployer
      );

      expect(extensionCallResult).toBeOk(Cl.bool(true));
    });

    it("non-admin cannot call extension", () => {
      const payload = Cl.principal(smartWalletStandard);

      const { result: extensionCallResult } = simnet.callPublicFn(
        smartWalletStandard,
        "extension-call",
        [
          Cl.principal(extTestContract),
          Cl.bufferFromHex(Cl.serialize(payload)),
          Cl.none(),
        ],
        address1
      );

      expect(extensionCallResult).toBeErr(
        Cl.uint(contracts.smartWalletStandard.constants.errUnauthorised.value)
      );
    });
  });

  describe("Signature Auth Extension Call", () => {
    it("relayer cannot call extension with payload using unregistered key pair", () => {
      const relayer = address3;
      const payload = Cl.principal(smartWalletStandard);

      // Generate valid but unregistered key pair.
      const unregisteredKeyPair = generateSecp256r1KeyPair();

      const auth = createExtensionCallAuthorization(
        getSimnetChainId(simnet),
        unregisteredKeyPair.privateKey,
        {
          authId: 12345,
          extension: extTestContract,
          payload: Buffer.from(Cl.serialize(payload), "hex"),
        }
      );

      // Call the contract with the signature (from a relayer, not the admin).
      const { result: extensionCallResult } = simnet.callPublicFn(
        smartWalletStandard,
        "extension-call",
        [
          Cl.principal(extTestContract),
          Cl.bufferFromHex(Cl.serialize(payload)),
          Cl.some(
            Cl.tuple({
              "auth-id": Cl.uint(auth.authId),
              signature: Cl.buffer(auth.signature),
              pubkey: Cl.buffer(unregisteredKeyPair.compressedPublicKey),
            })
          ),
        ],
        relayer
      );
      expect(extensionCallResult).toBeErr(
        Cl.uint(
          contracts.smartWalletStandard.constants.errUnregisteredPubkey.value
        )
      );
    });

    it("relayer cannot call extension with a different key pair than the one registered", () => {
      const relayer = address3;
      const payload = Cl.principal(smartWalletStandard);

      const registeredKeyPair = generateSecp256r1KeyPair();
      const unregisteredKeyPair = generateSecp256r1KeyPair();

      // Register public key.
      const { result: registerPublicKeyResult } = simnet.callPublicFn(
        smartWalletStandard,
        "add-admin-pubkey",
        [Cl.buffer(registeredKeyPair.compressedPublicKey)],
        deployer
      );
      expect(registerPublicKeyResult).toBeOk(Cl.bool(true));

      const auth = createExtensionCallAuthorization(
        getSimnetChainId(simnet),
        unregisteredKeyPair.privateKey,
        {
          authId: 12345,
          extension: extTestContract,
          payload: Buffer.from(Cl.serialize(payload), "hex"),
        }
      );

      const { result: extensionCallResult } = simnet.callPublicFn(
        smartWalletStandard,
        "extension-call",
        [
          Cl.principal(extTestContract),
          Cl.bufferFromHex(Cl.serialize(payload)),
          Cl.some(
            Cl.tuple({
              "auth-id": Cl.uint(auth.authId),
              signature: Cl.buffer(auth.signature),
              pubkey: Cl.buffer(unregisteredKeyPair.compressedPublicKey),
            })
          ),
        ],
        relayer
      );
      expect(extensionCallResult).toBeErr(
        Cl.uint(
          contracts.smartWalletStandard.constants.errUnregisteredPubkey.value
        )
      );
    });

    it("relayer can call extension with payload", () => {
      const relayer = address3;
      const payload = Cl.principal(smartWalletStandard);

      const keyPair = generateSecp256r1KeyPair();

      // Register public key.
      const { result: registerPublicKeyResult } = simnet.callPublicFn(
        smartWalletStandard,
        "add-admin-pubkey",
        [Cl.buffer(keyPair.compressedPublicKey)],
        deployer
      );
      expect(registerPublicKeyResult).toBeOk(Cl.bool(true));

      // Create authorization using the registered key pair.
      const auth = createExtensionCallAuthorization(
        getSimnetChainId(simnet),
        keyPair.privateKey,
        {
          authId: 12345,
          extension: extTestContract,
          payload: Buffer.from(Cl.serialize(payload), "hex"),
        }
      );

      const { result: extensionCallResult } = simnet.callPublicFn(
        smartWalletStandard,
        "extension-call",
        [
          Cl.principal(extTestContract),
          Cl.bufferFromHex(Cl.serialize(payload)),
          Cl.some(
            Cl.tuple({
              "auth-id": Cl.uint(auth.authId),
              signature: Cl.buffer(auth.signature),
              pubkey: Cl.buffer(keyPair.compressedPublicKey),
            })
          ),
        ],
        relayer
      );

      expect(extensionCallResult).toBeOk(Cl.bool(true));
    });
  });

  describe("Admin Management Flows", () => {
    it("admins map is properly initialized on deployment", () => {
      const deployerMapEntry = simnet.getMapEntry(
        smartWalletStandard,
        "admins",
        Cl.principal(deployer)
      );
      const smartWalletMapEntry = simnet.getMapEntry(
        smartWalletStandard,
        "admins",
        Cl.principal(smartWalletStandard)
      );

      // (some none), no admin pubkey on deployment.
      expect(deployerMapEntry).toBeSome(Cl.bool(true));
      expect(smartWalletMapEntry).toBeSome(Cl.bool(true));
    });

    it("admin can transfer wallet to new admin", () => {
      const newAdminAddress = Cl.principal(address3);

      const { result: transferWalletResult } = simnet.callPublicFn(
        smartWalletStandard,
        "transfer-wallet",
        [newAdminAddress],
        deployer
      );

      expect(transferWalletResult).toBeOk(Cl.bool(true));
    });

    it("admins map is correctly updated after transferring wallet", () => {
      const exAdminAddressCV = Cl.principal(deployer);
      const newAdminAddressCV = Cl.principal(address3);

      const { result: transferWalletResult } = simnet.callPublicFn(
        smartWalletStandard,
        "transfer-wallet",
        [newAdminAddressCV],
        deployer
      );
      expect(transferWalletResult).toBeOk(Cl.bool(true));

      const exAdminMapEntry = simnet.getMapEntry(
        smartWalletStandard,
        "admins",
        exAdminAddressCV
      );
      expect(exAdminMapEntry).toBeNone();
      const newAdminMapEntry = simnet.getMapEntry(
        smartWalletStandard,
        "admins",
        newAdminAddressCV
      );
      expect(newAdminMapEntry).toBeSome(Cl.bool(true));
    });

    it("non-admin cannot transfer wallet", () => {
      const newAdminAddressCV = Cl.principal(address1);

      const { result: transferWallet } = simnet.callPublicFn(
        smartWalletStandard,
        "transfer-wallet",
        [newAdminAddressCV],
        address1
      );

      expect(transferWallet).toBeErr(
        Cl.uint(contracts.smartWalletStandard.constants.errUnauthorised.value)
      );
    });

    it("admin can register public key for signature authentication", () => {
      const keyPair = generateSecp256r1KeyPair();

      const { result: addAdminPubkeyResult } = simnet.callPublicFn(
        smartWalletStandard,
        "add-admin-pubkey",
        [Cl.buffer(keyPair.compressedPublicKey)],
        deployer
      );
      expect(addAdminPubkeyResult).toBeOk(Cl.bool(true));

      const pubkeyMapEntry = simnet.getMapEntry(
        smartWalletStandard,
        "pubkey-to-admin",
        Cl.buffer(keyPair.compressedPublicKey)
      );
      expect(pubkeyMapEntry).toBeSome(Cl.principal(deployer));
    });

    it("non-admin cannot register public key for signature authentication", () => {
      const keyPair = generateSecp256r1KeyPair();

      const { result: addAdminPubkeyResult } = simnet.callPublicFn(
        smartWalletStandard,
        "add-admin-pubkey",
        [Cl.buffer(keyPair.compressedPublicKey)],
        address1
      );
      expect(addAdminPubkeyResult).toBeErr(
        Cl.uint(contracts.smartWalletStandard.constants.errUnauthorised.value)
      );
    });

    it("admin can remove public key for signature authentication", () => {
      const keyPair = generateSecp256r1KeyPair();

      const { result: addAdminPubkeyResult } = simnet.callPublicFn(
        smartWalletStandard,
        "add-admin-pubkey",
        [Cl.buffer(keyPair.compressedPublicKey)],
        deployer
      );
      expect(addAdminPubkeyResult).toBeOk(Cl.bool(true));

      const { result: removeAdminPubkeyResult } = simnet.callPublicFn(
        smartWalletStandard,
        "remove-admin-pubkey",
        [Cl.buffer(keyPair.compressedPublicKey)],
        deployer
      );
      expect(removeAdminPubkeyResult).toBeOk(Cl.bool(true));

      const pubkeyMapEntry = simnet.getMapEntry(
        smartWalletStandard,
        "pubkey-to-admin",
        Cl.buffer(keyPair.compressedPublicKey)
      );
      expect(pubkeyMapEntry).toBeNone();
    });

    it("non-admin cannot remove public key for signature authentication", () => {
      const keyPair = generateSecp256r1KeyPair();

      const { result: addAdminPubkeyResult } = simnet.callPublicFn(
        smartWalletStandard,
        "add-admin-pubkey",
        [Cl.buffer(keyPair.compressedPublicKey)],
        deployer
      );
      expect(addAdminPubkeyResult).toBeOk(Cl.bool(true));

      const { result: removeAdminPubkeyResult } = simnet.callPublicFn(
        smartWalletStandard,
        "remove-admin-pubkey",
        [Cl.buffer(keyPair.compressedPublicKey)],
        address1
      );
      expect(removeAdminPubkeyResult).toBeErr(
        Cl.uint(contracts.smartWalletStandard.constants.errUnauthorised.value)
      );
    });

    it("admin can add multiple public keys for signature authentication", () => {
      const keyPair1 = generateSecp256r1KeyPair();
      const keyPair2 = generateSecp256r1KeyPair();

      const { result: addAdminPubkeyResult1 } = simnet.callPublicFn(
        smartWalletStandard,
        "add-admin-pubkey",
        [Cl.buffer(keyPair1.compressedPublicKey)],
        deployer
      );
      expect(addAdminPubkeyResult1).toBeOk(Cl.bool(true));

      const { result: addAdminPubkeyResult2 } = simnet.callPublicFn(
        smartWalletStandard,
        "add-admin-pubkey",
        [Cl.buffer(keyPair2.compressedPublicKey)],
        deployer
      );
      expect(addAdminPubkeyResult2).toBeOk(Cl.bool(true));

      const pubkeyMapEntry1 = simnet.getMapEntry(
        smartWalletStandard,
        "pubkey-to-admin",
        Cl.buffer(keyPair1.compressedPublicKey)
      );
      expect(pubkeyMapEntry1).toBeSome(Cl.principal(deployer));

      const pubkeyMapEntry2 = simnet.getMapEntry(
        smartWalletStandard,
        "pubkey-to-admin",
        Cl.buffer(keyPair2.compressedPublicKey)
      );
      expect(pubkeyMapEntry2).toBeSome(Cl.principal(deployer));
    });

    it("invalid signature errors properly", () => {
      const keyPair = generateSecp256r1KeyPair();
      const keyPair2 = generateSecp256r1KeyPair();

      const { result: addAdminPubkeyResult } = simnet.callPublicFn(
        smartWalletStandard,
        "add-admin-pubkey",
        [Cl.buffer(keyPair.compressedPublicKey)],
        deployer
      );
      expect(addAdminPubkeyResult).toBeOk(Cl.bool(true));

      // Sign with the second key pair.
      const auth = createStxTransferAuthorization(
        getSimnetChainId(simnet),
        keyPair2.privateKey,
        {
          authId: 12345,
          amount: 100,
          recipient: address2,
        }
      );

      const { result: verifySignatureResult } = simnet.callReadOnlyFn(
        smartWalletStandard,
        "verify-signature",
        [
          // Mutated message hash.
          Cl.buffer(Buffer.from(auth.messageHash)),
          Cl.buffer(auth.signature),
          Cl.buffer(keyPair.compressedPublicKey),
        ],
        deployer
      );
      expect(verifySignatureResult).toBeErr(
        Cl.uint(
          contracts.smartWalletStandard.constants.errInvalidSignature.value
        )
      );
    });
  });

  describe("Proxy Transfer", () => {
    it("admin can transfer wallet using proxy contract direct call and state updates correctly", () => {
      const proxyContractName = "proxy-contract";
      const proxyContractId = `${accounts.wallet_1.address}.${proxyContractName}`;

      simnet.deployContract(
        proxyContractName,
        proxyTransferSrc,
        null,
        accounts.wallet_1.address
      );

      const { result: transferNoContextSwitchingResult } = simnet.callPublicFn(
        proxyContractId,
        "transfer-no-context-switching",
        [Cl.principal(address1)],
        deployer
      );
      expect(transferNoContextSwitchingResult).toBeOk(Cl.bool(true));

      const address1AdminMapEntry = simnet.getMapEntry(
        smartWalletStandard,
        "admins",
        Cl.principal(address1)
      );
      expect(address1AdminMapEntry).toBeSome(Cl.bool(true));

      const deployerAdminMapEntry = simnet.getMapEntry(
        smartWalletStandard,
        "admins",
        Cl.principal(deployer)
      );
      expect(deployerAdminMapEntry).toBeNone();

      const smartWalletAdminMapEntry = simnet.getMapEntry(
        smartWalletStandard,
        "admins",
        Cl.principal(smartWalletStandard)
      );
      expect(smartWalletAdminMapEntry).toBeSome(Cl.bool(true));
    });

    it("wallet canot be transferred on behalf of admin using proxy contract context switching call", () => {
      const proxyContractName = "proxy-contract";
      const proxyContractId = `${accounts.wallet_1.address}.${proxyContractName}`;

      simnet.deployContract(
        proxyContractName,
        proxyTransferSrc,
        null,
        accounts.wallet_1.address
      );

      const { result: transferContextSwitchingResult } = simnet.callPublicFn(
        proxyContractId,
        "transfer-context-switching",
        [Cl.principal(address1)],
        deployer
      );
      expect(transferContextSwitchingResult).toBeErr(
        Cl.uint(contracts.smartWalletStandard.constants.errUnauthorised.value)
      );
    });

    it("contract principal admin can transfer wallet using proxy contract context switching call and state updates correctly", () => {
      const proxyContractName = "proxy-contract";
      const proxyContractId = `${accounts.wallet_1.address}.${proxyContractName}`;

      simnet.deployContract(
        proxyContractName,
        proxyTransferSrc,
        null,
        accounts.wallet_1.address
      );

      // Admins transfers wallet ownership to proxy contract.
      const { result: transferWalletResult } = simnet.callPublicFn(
        smartWalletStandard,
        "transfer-wallet",
        [Cl.principal(proxyContractId)],
        deployer
      );
      expect(transferWalletResult).toBeOk(Cl.bool(true));

      // Proxy and smart wallet are now admins, deployer is not.
      const proxyAdminMapEntry = simnet.getMapEntry(
        smartWalletStandard,
        "admins",
        Cl.principal(proxyContractId)
      );
      expect(proxyAdminMapEntry).toBeSome(Cl.bool(true));

      const smartWalletAdminMapEntry = simnet.getMapEntry(
        smartWalletStandard,
        "admins",
        Cl.principal(smartWalletStandard)
      );
      expect(smartWalletAdminMapEntry).toBeSome(Cl.bool(true));

      const deployerAdminMapEntry = simnet.getMapEntry(
        smartWalletStandard,
        "admins",
        Cl.principal(deployer)
      );
      expect(deployerAdminMapEntry).toBeNone();

      // Deployer makes proxy transfer the wallet to address1.
      const { result: transferContextSwitchingResult } = simnet.callPublicFn(
        proxyContractId,
        "transfer-context-switching",
        [Cl.principal(address1)],
        deployer
      );
      expect(transferContextSwitchingResult).toBeOk(Cl.bool(true));

      // Address1 and smart wallet are now admins, deployer and proxy are not.
      const address1AdminMapEntry = simnet.getMapEntry(
        smartWalletStandard,
        "admins",
        Cl.principal(address1)
      );
      expect(address1AdminMapEntry).toBeSome(Cl.bool(true));

      const smartWalletAdminMapEntry2 = simnet.getMapEntry(
        smartWalletStandard,
        "admins",
        Cl.principal(smartWalletStandard)
      );
      expect(smartWalletAdminMapEntry2).toBeSome(Cl.bool(true));

      const deployerAdminMapEntry2 = simnet.getMapEntry(
        smartWalletStandard,
        "admins",
        Cl.principal(deployer)
      );
      expect(deployerAdminMapEntry2).toBeNone();

      const proxyAdminMapEntry2 = simnet.getMapEntry(
        smartWalletStandard,
        "admins",
        Cl.principal(proxyContractId)
      );
      expect(proxyAdminMapEntry2).toBeNone();
    });
  });
});
