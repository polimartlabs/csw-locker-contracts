import { initSimnet } from "@hirosystems/clarinet-sdk";
import { accounts, deployments } from "../clarigen/src/clarigen-types";
import { tx } from "@hirosystems/clarinet-sdk";
import { Cl } from "@stacks/transactions";
import { describe, expect, it } from "vitest";
import { errorCodes } from "./testUtils";
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

// Type guard to check if data has an amount property
function hasAmountProperty(data: any): data is { amount: string } {
  return (data as { amount: string }).amount !== undefined;
}

describe("Smart Wallet Endpoint", () => {
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

it("transfers fee to sponsor", () => {
  // transferAmount < fees, but the transaction is not a sponsored one.
  const transferAmount = 100;
  const fees = 10000;

  const stxTransfer = tx.transferSTX(
    transferAmount,
    deployments.smartWalletWithRules.simnet,
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
