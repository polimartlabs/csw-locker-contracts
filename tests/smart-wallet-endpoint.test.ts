import { initSimnet } from "@hirosystems/clarinet-sdk";
import { accounts, deployments } from "../clarigen/src/clarigen-types";
import { tx } from "@hirosystems/clarinet-sdk";
import { Cl } from "@stacks/transactions";
import { describe, expect, it } from "vitest";
import {
  errorCodes,
  getSbtcBalance,
  getStxBalance,
  initAndSendWrappedBitcoin,
  transferSbtc,
} from "./testUtils";
import { filterEvents } from "@clarigen/test";
import { CoreNodeEventType, cvToValue } from "@clarigen/core";

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
  describe("Sponsored STX Transfer", () => {
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

    it("admin can call stx-transfer-sponsored successfully using rules wallet", () => {
      // transferAmount < fees, but the transaction is not a sponsored one.
      const transferAmount = 100;
      const fees = 10000;

      const stxTransfer = tx.transferSTX(
        transferAmount,
        smartWalletWithRules,
        wallet1
      );
      simnet.mineBlock([stxTransfer]);

      const {
        events: stxTransferSponsoredEvents,
        result: stxTransferSponsoredResult,
      } = simnet.callPublicFn(
        smartWalletEndpoint,
        "stx-transfer-sponsored",
        [
          Cl.principal(smartWalletWithRules),
          Cl.tuple({
            amount: Cl.uint(transferAmount),
            to: Cl.principal(wallet2),
            fees: Cl.uint(fees),
          }),
        ],
        wallet1
      );

      expect(stxTransferSponsoredResult).toBeOk(Cl.bool(true));
      // only 1 stx transfer event because there is no sponsored tx here
      expect(stxTransferSponsoredEvents.length).toBe(1);
      const event = stxTransferSponsoredEvents[0].data;
      if (hasAmountProperty(event)) {
        expect(event.amount).toBe(transferAmount.toString());
      } else {
        throw new Error("Event data does not have amount property");
      }
    });
  });

  describe("Unsafe SIP-010 Transfer", () => {
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

  describe("Sponsored sBTC Transfer", () => {
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

  describe("Sponsored STX Send Many", () => {
    it("admin can transfer STX to maximum 11 recipients using smart wallet endpoint", () => {
      const N = 11;
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

  describe("Sponsored sBTC Transfer Many", () => {
    it("admin can transfer sBTC tokens to maximum 11 recipients using smart wallet endpoint", () => {
      const N = 11;
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

  describe("Sponsored sBTC Transfer Many Native", () => {
    it("admin can transfer sBTC tokens to maximum 6 recipients using smart wallet endpoint", () => {
      const N = 5;
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

      const { result: sbtcTransferManyNativeResult } = simnet.callPublicFn(
        smartWalletEndpoint,
        "sbtc-transfer-many-native-sponsored",
        [
          Cl.principal(smartWallet),
          Cl.tuple({
            fees: Cl.uint(fees),
            recipients: Cl.list(
              Array.from({ length: N }, () =>
                Cl.tuple({
                  amount: Cl.uint(transferAmount),
                  sender: Cl.principal(smartWallet),
                  to: Cl.principal(wallet1),
                  memo: Cl.none(),
                })
              )
            ),
          }),
        ],
        deployer
      );
      expect(sbtcTransferManyNativeResult).toBeOk(Cl.bool(true));

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

  describe("Delegation", () => {
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
        ],
        deployer
      );

      const { result: revokeResult } = simnet.callPublicFn(
        smartWalletEndpoint,
        "revoke-delegate-stx",
        [Cl.principal(smartWallet), Cl.principal(delegateExtension)],
        deployer
      );

      expect(revokeResult).toBeOk(Cl.bool(true));
    });
  });
});
