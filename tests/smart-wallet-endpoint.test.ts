import { initSimnet, tx } from "@stacks/clarinet-sdk";
import { accounts, deployments } from "../clarigen/src/clarigen-types";
import { Cl } from "@stacks/transactions";
import { describe, expect, it } from "vitest";
import {
  errorCodes,
  getSbtcBalance,
  getSimnetChainId,
  getStxBalance,
  initAndSendWrappedBitcoin,
  transferSbtc,
} from "./testUtils";
import { filterEvents } from "@clarigen/test";
import { CoreNodeEventType, cvToValue } from "@clarigen/core";
import {
  createExtensionCallAuthorization,
  generateSecp256r1KeyPair,
} from "./secp256r1-utils";

const simnet = await initSimnet();

const deployer = accounts.deployer.address;
const wallet1 = accounts.wallet_1.address;
const wallet2 = accounts.wallet_2.address;
const poolAdmin = accounts.wallet_3.address;

const smartWalletEndpoint = deployments.smartWalletEndpoint.simnet;
const smartWallet = deployments.smartWalletStandard.simnet;
const smartWalletWithRules = deployments.smartWalletWithRules.simnet;
const delegateExtension = deployments.extDelegateStxPox4.simnet;
const sbtcTokenContract = deployments.sbtcToken.simnet;
const wrappedBitcoinContract = deployments.wrappedBitcoin.simnet;

// Type guard to check if data has an amount property
function hasAmountProperty(data: any): data is { amount: string } {
  return (data as { amount: string }).amount !== undefined;
}

describe("Smart Wallet Endpoint", () => {
  describe("Sender Auth Sponsored STX Transfer", () => {
    it("admin can call stx-transfer-sponsored successfully using standard wallet", () => {
      const transferAmount = 100;
      const fees = 10000;

      const wallet2BalanceBefore = getStxBalance(simnet, wallet2);

      const stxTransfer = tx.transferSTX(transferAmount, smartWallet, deployer);
      simnet.mineBlock([stxTransfer]);

      const {
        events: stxTransferSponsoredEvents,
        result: stxTransferSponsoredResult,
      } = simnet.callPublicFn(
        smartWalletEndpoint,
        "stx-transfer-sponsored",
        [
          Cl.principal(smartWallet),
          Cl.tuple({
            amount: Cl.uint(transferAmount),
            to: Cl.principal(wallet2),
            fees: Cl.uint(fees),
          }),
          Cl.none(),
        ],
        deployer
      );

      expect(stxTransferSponsoredResult).toBeOk(Cl.bool(true));

      // not sponsored tx: ect mint, ect burn, payload print, stx transfer print
      expect(stxTransferSponsoredEvents.length).toBe(4);

      const stxTransferEvent = stxTransferSponsoredEvents[3].data;
      expect(stxTransferEvent).toEqual({
        amount: transferAmount.toString(),
        recipient: wallet2,
        sender: smartWallet,
        memo: "",
      });

      const smartWalletBalance = getStxBalance(simnet, smartWallet);
      expect(smartWalletBalance).toBe(0);

      const wallet2BalanceAfter = getStxBalance(simnet, wallet2);
      expect(wallet2BalanceAfter).toBe(wallet2BalanceBefore + transferAmount);
    });

    // TODO: Decide on this. No longer adheres to smart wallet trait.
    // it("admin can call stx-transfer-sponsored successfully using rules wallet", () => {
    //   // transferAmount < fees, but the transaction is not a sponsored one.
    //   const transferAmount = 100;
    //   const fees = 10000;

    //   const stxTransfer = tx.transferSTX(
    //     transferAmount,
    //     smartWalletWithRules,
    //     wallet1
    //   );
    //   simnet.mineBlock([stxTransfer]);

    //   const {
    //     events: stxTransferSponsoredEvents,
    //     result: stxTransferSponsoredResult,
    //   } = simnet.callPublicFn(
    //     smartWalletEndpoint,
    //     "stx-transfer-sponsored",
    //     [
    //       Cl.principal(smartWalletWithRules),
    //       Cl.tuple({
    //         amount: Cl.uint(transferAmount),
    //         to: Cl.principal(wallet2),
    //         fees: Cl.uint(fees),
    //       }),
    //       Cl.none(),
    //     ],
    //     wallet1
    //   );

    //   expect(stxTransferSponsoredResult).toBeOk(Cl.bool(true));
    //   // only 1 stx transfer event because there is no sponsored tx here
    //   expect(stxTransferSponsoredEvents.length).toBe(1);
    //   const event = stxTransferSponsoredEvents[0].data;
    //   if (hasAmountProperty(event)) {
    //     expect(event.amount).toBe(transferAmount.toString());
    //   } else {
    //     throw new Error("Event data does not have amount property");
    //   }
    // });
  });

  describe("Signature Auth Sponsored STX Transfer", () => {
    it("relayer can call stx-transfer-sponsored successfully using standard wallet", () => {
      const transferAmount = 100;
      const fees = 10000;
      const authId = 12345;
      const relayer = accounts.wallet_4.address;
      const recipient = accounts.wallet_5.address;

      const recipientBalanceBefore = getStxBalance(simnet, recipient);

      const stxTransfer = tx.transferSTX(transferAmount, smartWallet, deployer);
      simnet.mineBlock([stxTransfer]);

      const keyPair = generateSecp256r1KeyPair();
      // Register public key.
      const { result: registerPublicKeyResult } = simnet.callPublicFn(
        smartWallet,
        "add-admin-pubkey",
        [Cl.buffer(keyPair.compressedPublicKey)],
        deployer
      );
      expect(registerPublicKeyResult).toBeOk(Cl.bool(true));

      const auth = createExtensionCallAuthorization(
        getSimnetChainId(simnet),
        keyPair.privateKey,
        {
          authId: authId,
          extension: deployments.extSponsoredTransfer.simnet,
          payload: Buffer.from(
            Cl.serialize(
              Cl.tuple({
                amount: Cl.uint(transferAmount),
                to: Cl.principal(recipient),
                fees: Cl.uint(fees),
              })
            ),
            "hex"
          ),
        }
      );

      const {
        events: stxTransferSponsoredEvents,
        result: stxTransferSponsoredResult,
      } = simnet.callPublicFn(
        smartWalletEndpoint,
        "stx-transfer-sponsored",
        [
          Cl.principal(smartWallet),
          Cl.tuple({
            amount: Cl.uint(transferAmount),
            to: Cl.principal(recipient),
            fees: Cl.uint(fees),
          }),
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

      expect(stxTransferSponsoredResult).toBeOk(Cl.bool(true));

      // not sponsored tx: ect mint, ect burn, payload print, stx transfer print
      expect(stxTransferSponsoredEvents.length).toBe(4);

      const stxTransferEvent = stxTransferSponsoredEvents[3].data;
      expect(stxTransferEvent).toEqual({
        amount: transferAmount.toString(),
        recipient: recipient,
        sender: smartWallet,
        memo: "",
      });

      const smartWalletBalance = getStxBalance(simnet, smartWallet);
      expect(smartWalletBalance).toBe(0);

      const recipientBalanceAfter = getStxBalance(simnet, recipient);
      expect(recipientBalanceAfter).toBe(
        recipientBalanceBefore + transferAmount
      );
    });
  });

  describe("Sender Auth Unsafe SIP-010 Transfer", () => {
    it("admin can transfer 100 xBTC tokens using unsafe extension", () => {
      const transferAmount = 100;
      initAndSendWrappedBitcoin(simnet, transferAmount, smartWallet);

      const { result: walletBalance } = simnet.callReadOnlyFn(
        wrappedBitcoinContract,
        "get-balance",
        [Cl.principal(smartWallet)],
        deployer
      );

      expect(walletBalance).toBeOk(Cl.uint(transferAmount));

      const { result: unsafeSip10TransferResult } = simnet.callPublicFn(
        smartWalletEndpoint,
        "transfer-unsafe-sip-010-token",
        [
          Cl.principal(smartWallet),
          Cl.tuple({
            amount: Cl.uint(transferAmount),
            to: Cl.principal(wallet2),
            token: Cl.principal(wrappedBitcoinContract),
          }),
          Cl.none(),
        ],
        deployer
      );

      expect(unsafeSip10TransferResult).toBeOk(Cl.bool(true));

      const { result: recipientBalance } = simnet.callReadOnlyFn(
        wrappedBitcoinContract,
        "get-balance",
        [Cl.principal(wallet2)],
        deployer
      );

      expect(recipientBalance).toBeOk(Cl.uint(transferAmount));
    });
  });

  describe("Signature Auth Unsafe SIP-010 Transfer", () => {
    it("relayer can transfer 100 xBTC tokens using unsafe extension", () => {
      const transferAmount = 100;
      const authId = 12345;
      const relayer = accounts.wallet_4.address;
      const recipient = accounts.wallet_5.address;

      initAndSendWrappedBitcoin(simnet, transferAmount, smartWallet);

      const keyPair = generateSecp256r1KeyPair();
      // Register public key.
      const { result: registerPublicKeyResult } = simnet.callPublicFn(
        smartWallet,
        "add-admin-pubkey",
        [Cl.buffer(keyPair.compressedPublicKey)],
        deployer
      );
      expect(registerPublicKeyResult).toBeOk(Cl.bool(true));

      const auth = createExtensionCallAuthorization(
        getSimnetChainId(simnet),
        keyPair.privateKey,
        {
          authId: authId,
          extension: deployments.extUnsafeSip010Transfer.simnet,
          payload: Buffer.from(
            Cl.serialize(
              Cl.tuple({
                amount: Cl.uint(transferAmount),
                to: Cl.principal(recipient),
                token: Cl.principal(wrappedBitcoinContract),
              })
            ),
            "hex"
          ),
        }
      );

      const { result: unsafeSip10TransferResult } = simnet.callPublicFn(
        smartWalletEndpoint,
        "transfer-unsafe-sip-010-token",
        [
          Cl.principal(smartWallet),
          Cl.tuple({
            amount: Cl.uint(transferAmount),
            to: Cl.principal(recipient),
            token: Cl.principal(wrappedBitcoinContract),
          }),
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
      expect(unsafeSip10TransferResult).toBeOk(Cl.bool(true));

      const { result: recipientBalance } = simnet.callReadOnlyFn(
        wrappedBitcoinContract,
        "get-balance",
        [Cl.principal(recipient)],
        deployer
      );

      expect(recipientBalance).toBeOk(Cl.uint(transferAmount));
    });
  });

  describe("Sender Auth Sponsored sBTC Transfer", () => {
    it("admin can transfer 100 sBTC tokens using sponsored sBTC transfer extension", () => {
      const transferAmount = 100;
      const fees = 10000;

      // send sBTC tokens to smart wallet
      const sbtcTransfer = tx.callPublicFn(
        sbtcTokenContract,
        "transfer",
        [
          Cl.uint(transferAmount),
          Cl.principal(wallet1),
          Cl.principal(smartWallet),
          Cl.none(),
        ],
        wallet1
      );
      simnet.mineBlock([sbtcTransfer]);

      const { events: sbtcTransferEvents, result: sbtcTransferResult } =
        simnet.callPublicFn(
          smartWalletEndpoint,
          "sbtc-transfer-sponsored",
          [
            Cl.principal(smartWallet),
            Cl.tuple({
              amount: Cl.uint(transferAmount),
              to: Cl.principal(wallet2),
              fees: Cl.uint(fees),
            }),
            Cl.none(),
          ],
          deployer
        );

      expect(sbtcTransferResult).toBeOk(Cl.bool(true));
      // not sponsored tx: ect mint, ect burn, payload print, sbtc transfer print
      expect(sbtcTransferEvents.length).toBe(4);

      const sbtcTransferEvent = sbtcTransferEvents[3].data;
      expect(sbtcTransferEvent).toEqual({
        asset_identifier: `${sbtcTokenContract}::sbtc-token`,
        amount: transferAmount.toString(),
        recipient: wallet2,
        sender: smartWallet,
      });
    });
  });

  describe("Signature Auth Sponsored sBTC Transfer", () => {
    it("relayer can transfer 100 sBTC tokens using sponsored sBTC transfer extension", () => {
      const transferAmount = 100;
      const fees = 10000;
      const authId = 12345;
      const relayer = accounts.wallet_4.address;
      const recipient = accounts.wallet_5.address;

      // send sBTC tokens to smart wallet
      const sbtcTransfer = tx.callPublicFn(
        sbtcTokenContract,
        "transfer",
        [
          Cl.uint(transferAmount),
          Cl.principal(wallet1),
          Cl.principal(smartWallet),
          Cl.none(),
        ],
        wallet1
      );
      simnet.mineBlock([sbtcTransfer]);

      const keyPair = generateSecp256r1KeyPair();
      // Register public key.
      const { result: registerPublicKeyResult } = simnet.callPublicFn(
        smartWallet,
        "add-admin-pubkey",
        [Cl.buffer(keyPair.compressedPublicKey)],
        deployer
      );
      expect(registerPublicKeyResult).toBeOk(Cl.bool(true));

      const auth = createExtensionCallAuthorization(
        getSimnetChainId(simnet),
        keyPair.privateKey,
        {
          authId: authId,
          extension: deployments.extSponsoredSbtcTransfer.simnet,
          payload: Buffer.from(
            Cl.serialize(
              Cl.tuple({
                amount: Cl.uint(transferAmount),
                to: Cl.principal(recipient),
                fees: Cl.uint(fees),
              })
            ),
            "hex"
          ),
        }
      );

      const {
        events: sbtcTransferSponsoredEvents,
        result: sbtcTransferSponsoredResult,
      } = simnet.callPublicFn(
        smartWalletEndpoint,
        "sbtc-transfer-sponsored",
        [
          Cl.principal(smartWallet),
          Cl.tuple({
            amount: Cl.uint(transferAmount),
            to: Cl.principal(recipient),
            fees: Cl.uint(fees),
          }),
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
      expect(sbtcTransferSponsoredResult).toBeOk(Cl.bool(true));
      // not sponsored tx: ect mint, ect burn, payload print, sbtc transfer print
      expect(sbtcTransferSponsoredEvents.length).toBe(4);

      const sbtcTransferEvent = sbtcTransferSponsoredEvents[3].data;
      expect(sbtcTransferEvent).toEqual({
        asset_identifier: `${sbtcTokenContract}::sbtc-token`,
        amount: transferAmount.toString(),
        recipient: recipient,
        sender: smartWallet,
      });
    });
  });

  describe("Sender Auth Sponsored STX Send Many", () => {
    it("admin can transfer STX to maximum 38 standard principal recipients using smart wallet endpoint", () => {
      const N = 38;
      const transferAmount = 100;
      const fundingAmount = transferAmount * N;
      const fees = 1;

      const { result: fundingResult } = simnet.transferSTX(
        fundingAmount,
        smartWallet,
        deployer
      );
      expect(fundingResult).toBeOk(Cl.bool(true));

      const before = {
        deployer: getStxBalance(simnet, deployer),
        wallet1: getStxBalance(simnet, wallet1),
        smartWallet: getStxBalance(simnet, smartWallet),
      };

      const { result: stxSendManyResult } = simnet.callPublicFn(
        smartWalletEndpoint,
        "stx-send-many-sponsored",
        [
          Cl.principal(smartWallet),
          Cl.tuple({
            fees: Cl.uint(fees),
            recipients: Cl.list(
              Array.from({ length: N }, () =>
                Cl.tuple({
                  ustx: Cl.uint(transferAmount),
                  to: Cl.principal(wallet1),
                })
              )
            ),
          }),
          Cl.none(),
        ],
        deployer
      );
      expect(stxSendManyResult).toBeOk(Cl.bool(true));

      const after = {
        deployer: getStxBalance(simnet, deployer),
        wallet1: getStxBalance(simnet, wallet1),
        smartWallet: getStxBalance(simnet, smartWallet),
      };

      expect(after.deployer).toBe(before.deployer);
      expect(after.wallet1).toBe(before.wallet1 + transferAmount * N);
      expect(after.smartWallet).toBe(before.smartWallet - transferAmount * N);
    });
  });

  describe("Signature Auth Sponsored STX Send Many", () => {
    it("relayer can transfer STX to maximum 38 standard principal recipients using smart wallet endpoint", () => {
      const N = 38;
      const transferAmount = 100;
      const fundingAmount = transferAmount * N;
      const fees = 1;
      const authId = 12345;
      const relayer = accounts.wallet_4.address;
      const recipient = accounts.wallet_5.address;

      const { result: fundingResult } = simnet.transferSTX(
        fundingAmount,
        smartWallet,
        deployer
      );
      expect(fundingResult).toBeOk(Cl.bool(true));

      const keyPair = generateSecp256r1KeyPair();
      // Register public key.
      const { result: registerPublicKeyResult } = simnet.callPublicFn(
        smartWallet,
        "add-admin-pubkey",
        [Cl.buffer(keyPair.compressedPublicKey)],
        deployer
      );
      expect(registerPublicKeyResult).toBeOk(Cl.bool(true));

      const auth = createExtensionCallAuthorization(
        getSimnetChainId(simnet),
        keyPair.privateKey,
        {
          authId: authId,
          extension: deployments.extSponsoredSendMany.simnet,
          payload: Buffer.from(
            Cl.serialize(
              Cl.tuple({
                fees: Cl.uint(fees),
                recipients: Cl.list(
                  Array.from({ length: N }, () =>
                    Cl.tuple({
                      ustx: Cl.uint(transferAmount),
                      to: Cl.principal(recipient),
                    })
                  )
                ),
              })
            ),
            "hex"
          ),
        }
      );

      const before = {
        deployer: getStxBalance(simnet, deployer),
        recipient: getStxBalance(simnet, recipient),
        smartWallet: getStxBalance(simnet, smartWallet),
      };

      const { result: stxSendManyResult } = simnet.callPublicFn(
        smartWalletEndpoint,
        "stx-send-many-sponsored",
        [
          Cl.principal(smartWallet),
          Cl.tuple({
            fees: Cl.uint(fees),
            recipients: Cl.list(
              Array.from({ length: N }, () =>
                Cl.tuple({
                  ustx: Cl.uint(transferAmount),
                  to: Cl.principal(recipient),
                })
              )
            ),
          }),
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
      expect(stxSendManyResult).toBeOk(Cl.bool(true));

      const after = {
        deployer: getStxBalance(simnet, deployer),
        recipient: getStxBalance(simnet, recipient),
        smartWallet: getStxBalance(simnet, smartWallet),
      };

      expect(after.deployer).toBe(before.deployer);
      expect(after.recipient).toBe(before.recipient + transferAmount * N);
      expect(after.smartWallet).toBe(before.smartWallet - transferAmount * N);
    });
  });

  describe("Sender Auth Sponsored sBTC Transfer Many", () => {
    it("admin can transfer sBTC tokens to maximum 41 standard principal recipients using smart wallet endpoint", () => {
      const N = 41;
      const transferAmount = 100;
      const fundingAmount = transferAmount * N;
      const fees = 1;

      const { result: fundingResult } = transferSbtc(
        simnet,
        fundingAmount,
        deployer,
        smartWallet
      );
      expect(fundingResult).toBeOk(Cl.bool(true));

      const before = {
        deployer: getSbtcBalance(simnet, deployer),
        wallet1: getSbtcBalance(simnet, wallet1),
        smartWallet: getSbtcBalance(simnet, smartWallet),
      };

      const { result: sbtcTransferManyResult } = simnet.callPublicFn(
        smartWalletEndpoint,
        "sbtc-transfer-many-sponsored",
        [
          Cl.principal(smartWallet),
          Cl.tuple({
            fees: Cl.uint(fees),
            recipients: Cl.list(
              Array.from({ length: N }, () =>
                Cl.tuple({
                  a: Cl.uint(transferAmount),
                  r: Cl.principal(wallet1),
                })
              )
            ),
          }),
          Cl.none(),
        ],
        deployer
      );
      expect(sbtcTransferManyResult).toBeOk(Cl.bool(true));

      const after = {
        deployer: getSbtcBalance(simnet, deployer),
        wallet1: getSbtcBalance(simnet, wallet1),
        smartWallet: getSbtcBalance(simnet, smartWallet),
      };

      expect(after.deployer).toBe(before.deployer);
      expect(after.wallet1).toBe(before.wallet1 + transferAmount * N);
      expect(after.smartWallet).toBe(before.smartWallet - transferAmount * N);
    });
  });

  describe("Signature Auth Sponsored sBTC Transfer Many", () => {
    it("relayer can transfer sBTC tokens to maximum 41 standard principal recipients using smart wallet endpoint", () => {
      const N = 41;
      const transferAmount = 100;
      const fundingAmount = transferAmount * N;
      const fees = 1;
      const authId = 12345;
      const relayer = accounts.wallet_4.address;
      const recipient = accounts.wallet_5.address;

      const { result: fundingResult } = transferSbtc(
        simnet,
        fundingAmount,
        deployer,
        smartWallet
      );
      expect(fundingResult).toBeOk(Cl.bool(true));

      const keyPair = generateSecp256r1KeyPair();
      // Register public key.
      const { result: registerPublicKeyResult } = simnet.callPublicFn(
        smartWallet,
        "add-admin-pubkey",
        [Cl.buffer(keyPair.compressedPublicKey)],
        deployer
      );
      expect(registerPublicKeyResult).toBeOk(Cl.bool(true));

      const auth = createExtensionCallAuthorization(
        getSimnetChainId(simnet),
        keyPair.privateKey,
        {
          authId: authId,
          extension: deployments.extSponsoredSbtcTransferMany.simnet,
          payload: Buffer.from(
            Cl.serialize(
              Cl.tuple({
                fees: Cl.uint(fees),
                recipients: Cl.list(
                  Array.from({ length: N }, () =>
                    Cl.tuple({
                      a: Cl.uint(transferAmount),
                      r: Cl.principal(recipient),
                    })
                  )
                ),
              })
            ),
            "hex"
          ),
        }
      );

      const before = {
        deployer: getSbtcBalance(simnet, deployer),
        recipient: getSbtcBalance(simnet, recipient),
        smartWallet: getSbtcBalance(simnet, smartWallet),
      };

      const { result: sbtcTransferManyResult } = simnet.callPublicFn(
        smartWalletEndpoint,
        "sbtc-transfer-many-sponsored",
        [
          Cl.principal(smartWallet),
          Cl.tuple({
            fees: Cl.uint(fees),
            recipients: Cl.list(
              Array.from({ length: N }, () =>
                Cl.tuple({
                  a: Cl.uint(transferAmount),
                  r: Cl.principal(recipient),
                })
              )
            ),
          }),
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
      expect(sbtcTransferManyResult).toBeOk(Cl.bool(true));

      const after = {
        deployer: getSbtcBalance(simnet, deployer),
        recipient: getSbtcBalance(simnet, recipient),
        smartWallet: getSbtcBalance(simnet, smartWallet),
      };

      expect(after.deployer).toBe(before.deployer);
      expect(after.recipient).toBe(before.recipient + transferAmount * N);
      expect(after.smartWallet).toBe(before.smartWallet - transferAmount * N);
    });
  });

  describe("Sender Auth Delegation", () => {
    it("admin can delegate using endpoint and fully funded smart wallet", () => {
      const transferAmount = 100;
      const stxTransfer = tx.transferSTX(transferAmount, smartWallet, deployer);
      simnet.mineBlock([stxTransfer]);

      const { result: delegateResult } = simnet.callPublicFn(
        smartWalletEndpoint,
        "delegate-stx",
        [
          Cl.principal(smartWallet),
          Cl.principal(delegateExtension),
          Cl.uint(transferAmount),
          Cl.principal(poolAdmin),
          Cl.none(),
        ],
        deployer
      );

      expect(delegateResult).toBeOk(Cl.bool(true));
    });

    it("successful delegation call correctly prints the expected events", () => {
      const transferAmount = 100;
      const delegationAmount = 100;
      const stxTransfer = tx.transferSTX(transferAmount, smartWallet, deployer);
      simnet.mineBlock([stxTransfer]);

      const { events: delegateEvents, result: delegateResponse } =
        simnet.callPublicFn(
          smartWalletEndpoint,
          "delegate-stx",
          [
            Cl.principal(smartWallet),
            Cl.principal(delegateExtension),
            Cl.uint(delegationAmount),
            Cl.principal(poolAdmin),
            Cl.none(),
          ],
          deployer
        );

      expect(delegateResponse).toBeOk(Cl.bool(true));

      // payload print event
      const contractEvents = filterEvents(
        delegateEvents,
        CoreNodeEventType.ContractEvent
      );

      expect(contractEvents.length).toEqual(1);
      const [payloadEvent] = contractEvents;
      const payloadData = cvToValue<{
        a: string;
        payload: { extension: string };
      }>(payloadEvent.data.value);
      expect(payloadData.a).toEqual("extension-call");
      expect(payloadData.payload.extension).toEqual(delegateExtension);

      // extension call token events

      // ect mint print event
      const ectMintEvents = filterEvents(
        delegateEvents,
        CoreNodeEventType.FtMintEvent
      );
      expect(ectMintEvents.length).toEqual(1);
      const [ectMintEvent] = ectMintEvents;
      expect(ectMintEvent.data.amount).toEqual("1");

      // ect burn print event
      const ectBurnEvents = filterEvents(
        delegateEvents,
        CoreNodeEventType.FtBurnEvent
      );
      expect(ectBurnEvents.length).toEqual(1);
      const [ectBurnEvent] = ectBurnEvents;
      expect(ectBurnEvent.data.amount).toEqual("1");

      // stx transfer print event from smart wallet to extension
      const stxEvents = filterEvents(
        delegateEvents,
        CoreNodeEventType.StxTransferEvent
      );
      const [stxEvent] = stxEvents;
      expect(stxEvent.data.amount).toEqual(delegationAmount.toString());
      expect(stxEvent.data.sender).toEqual(smartWallet);
      expect(stxEvent.data.recipient).toEqual(delegateExtension);
    });

    it("admin delegate call fails if smart wallet is underfunded", () => {
      const transferAmount = 100;
      const delegationAmount = transferAmount + 1;
      const stxTransfer = tx.transferSTX(transferAmount, smartWallet, deployer);
      simnet.mineBlock([stxTransfer]);

      const { result: delegateResult } = simnet.callPublicFn(
        smartWalletEndpoint,
        "delegate-stx",
        [
          Cl.principal(smartWallet),
          Cl.principal(delegateExtension),
          Cl.uint(delegationAmount),
          Cl.principal(poolAdmin),
          Cl.none(),
        ],
        deployer
      );

      expect(delegateResult).toBeErr(
        Cl.uint(errorCodes.general.NOT_ENOUGH_BALANCE)
      );
    });

    it("admin can revoke an existing delegation using endpoint and fully funded smart wallet", () => {
      const delegationAmount = 100;
      const stxTransfer = tx.transferSTX(
        delegationAmount,
        smartWallet,
        deployer
      );
      simnet.mineBlock([stxTransfer]);

      simnet.callPublicFn(
        smartWalletEndpoint,
        "delegate-stx",
        [
          Cl.principal(smartWallet),
          Cl.principal(delegateExtension),
          Cl.uint(delegationAmount),
          Cl.principal(poolAdmin),
          Cl.none(),
        ],
        deployer
      );

      const { result: revokeResult } = simnet.callPublicFn(
        smartWalletEndpoint,
        "revoke-delegate-stx",
        [Cl.principal(smartWallet), Cl.principal(delegateExtension), Cl.none()],
        deployer
      );

      expect(revokeResult).toBeOk(Cl.bool(true));
    });
  });

  describe("Signature Auth Delegation", () => {
    it("relayer can delegate using endpoint and fully funded smart wallet", () => {
      const transferAmount = 100;
      const authId = 12345;
      const relayer = accounts.wallet_4.address;
      const stxTransfer = tx.transferSTX(transferAmount, smartWallet, deployer);
      simnet.mineBlock([stxTransfer]);

      const keyPair = generateSecp256r1KeyPair();
      // Register public key.
      const { result: registerPublicKeyResult } = simnet.callPublicFn(
        smartWallet,
        "add-admin-pubkey",
        [Cl.buffer(keyPair.compressedPublicKey)],
        deployer
      );
      expect(registerPublicKeyResult).toBeOk(Cl.bool(true));

      const auth = createExtensionCallAuthorization(
        getSimnetChainId(simnet),
        keyPair.privateKey,
        {
          authId: authId,
          extension: deployments.extDelegateStxPox4.simnet,
          payload: Buffer.from(
            Cl.serialize(
              Cl.tuple({
                action: Cl.stringAscii("delegate"),
                "amount-ustx": Cl.uint(transferAmount),
                "delegate-to": Cl.principal(poolAdmin),
                "until-burn-ht": Cl.none(),
                "pox-addr": Cl.none(),
              })
            ),
            "hex"
          ),
        }
      );

      const { result: delegateResult } = simnet.callPublicFn(
        smartWalletEndpoint,
        "delegate-stx",
        [
          Cl.principal(smartWallet),
          Cl.principal(delegateExtension),
          Cl.uint(transferAmount),
          Cl.principal(poolAdmin),
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

      expect(delegateResult).toBeOk(Cl.bool(true));
    });

    it("relayer can revoke an existing delegation using endpoint and fully funded smart wallet", () => {
      const delegationAmount = 100;
      const authId = 12345;
      const relayer = accounts.wallet_4.address;

      const stxTransfer = tx.transferSTX(
        delegationAmount,
        smartWallet,
        deployer
      );
      simnet.mineBlock([stxTransfer]);

      const keyPair = generateSecp256r1KeyPair();
      // Register public key.
      const { result: registerPublicKeyResult } = simnet.callPublicFn(
        smartWallet,
        "add-admin-pubkey",
        [Cl.buffer(keyPair.compressedPublicKey)],
        deployer
      );
      expect(registerPublicKeyResult).toBeOk(Cl.bool(true));

      const auth = createExtensionCallAuthorization(
        getSimnetChainId(simnet),
        keyPair.privateKey,
        {
          authId: authId,
          extension: deployments.extDelegateStxPox4.simnet,
          payload: Buffer.from(
            Cl.serialize(
              Cl.tuple({
                action: Cl.stringAscii("revoke"),
                "amount-ustx": Cl.uint(0),
                "delegate-to": Cl.principal(relayer),
                "until-burn-ht": Cl.none(),
                "pox-addr": Cl.none(),
              })
            ),
            "hex"
          ),
        }
      );

      const { result: revokeResult } = simnet.callPublicFn(
        smartWalletEndpoint,
        "revoke-delegate-stx",
        [
          Cl.principal(smartWallet),
          Cl.principal(delegateExtension),
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
      expect(revokeResult).toBeErr(Cl.uint(34)); // pox-4 ERR_DELEGATION_ALREADY_REVOKED
    });
  });
});
