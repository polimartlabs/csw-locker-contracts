import { CoreNodeEventType, cvToValue, hexToBytes } from "@clarigen/core";
import { filterEvents } from "@clarigen/test";
import { tx } from "@hirosystems/clarinet-sdk";
import {
  Cl,
  boolCV,
  bufferCV,
  principalCV,
  tupleCV,
  uintCV,
} from "@stacks/transactions";
import { describe, expect, it } from "vitest";
import { deployments } from "../clarigen/src/clarigen-types";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const poolAdmin = accounts.get("wallet_2")!;

// General error codes
const ERR_NOT_ENOUGH_BALANCE = 1;

const smartWallet = deployments.smartWalletStandard.simnet;
const delegateExtension = deployments.extDelegateStxPox4.simnet;
const smartWalletEndpoint = deployments.smartWalletEndpoint.simnet;

describe("Standard wallet with delegate-stx-pox-4 extension", () => {
  it("user can delegate using endpoint and fully funded smart wallet", () => {
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

    expect(delegateResult).toBeOk(boolCV(true));
  });

  it("delegate call fails if smart wallet is underfunded", () => {
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

    expect(delegateResult).toBeErr(Cl.uint(ERR_NOT_ENOUGH_BALANCE));
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

    expect(delegateResponse).toBeOk(boolCV(true));

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
    expect(payloadData.payload.extension).toEqual(
      deployments.extDelegateStxPox4.simnet
    );

    // extension call token events

    // mint print event
    const ectMintEvents = filterEvents(
      delegateEvents,
      CoreNodeEventType.FtMintEvent
    );
    expect(ectMintEvents.length).toEqual(1);
    const [ectMintEvent] = ectMintEvents;
    expect(ectMintEvent.data.amount).toEqual("1");

    // burn print event
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
    expect(stxEvent.data.recipient).toEqual(
      deployments.extDelegateStxPox4.simnet
    );
  });

  it("user can revoke an existing delegation using endpoint and fully funded smart wallet", () => {
    const delegationAmount = 100;
    const stxTransfer = tx.transferSTX(delegationAmount, smartWallet, deployer);
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

    expect(revokeResult).toBeOk(boolCV(true));
  });

  it("user can delegate using smart wallet endpoint and pool admin can lock", () => {
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

    expect(delegateResponse).toBeOk(boolCV(true));

    // check for print event
    const printEvents = filterEvents(
      delegateEvents,
      CoreNodeEventType.ContractEvent
    );

    expect(printEvents.length).toEqual(1);
    const [print] = printEvents;
    const printData = cvToValue<{
      a: string;
      payload: { extension: string };
    }>(print.data.value);
    expect(printData.a).toEqual("extension-call");
    expect(printData.payload.extension).toEqual(
      deployments.extDelegateStxPox4.simnet
    );

    // extension call token events
    // mint event
    const ectMintEvents = filterEvents(
      delegateEvents,
      CoreNodeEventType.FtMintEvent
    );
    expect(ectMintEvents.length).toEqual(1);
    const [ectMintEvent] = ectMintEvents;
    expect(ectMintEvent.data.amount).toEqual("1");

    // burn event
    const ectBurnEvents = filterEvents(
      delegateEvents,
      CoreNodeEventType.FtBurnEvent
    );
    expect(ectBurnEvents.length).toEqual(1);
    const [ectBurnEvent] = ectBurnEvents;
    expect(ectBurnEvent.data.amount).toEqual("1");

    // stx transfer event from smart wallet to extension
    const stxEvents = filterEvents(
      delegateEvents,
      CoreNodeEventType.StxTransferEvent
    );
    const [stxEvent] = stxEvents;
    expect(stxEvent.data.amount).toEqual(delegationAmount.toString());
    expect(stxEvent.data.sender).toEqual(smartWallet);
    expect(stxEvent.data.recipient).toEqual(
      deployments.extDelegateStxPox4.simnet
    );

    // pool admin locks
    const { result: lockResult } = simnet.callPublicFn(
      "SP000000000000000000002Q6VF78.pox-4",
      "delegate-stack-stx",
      [
        principalCV(deployments.extDelegateStxPox4.simnet),
        uintCV(delegationAmount),
        tupleCV({
          version: bufferCV(hexToBytes("01")),
          hashbytes: bufferCV(
            hexToBytes("b0b75f408a29c271d107e05d614d0ff439813d02")
          ),
        }),
        uintCV(delegationAmount),
        uintCV(1),
      ],
      poolAdmin
    );

    expect(lockResult).toBeOk(
      tupleCV({
        "lock-amount": uintCV(delegationAmount),
        stacker: principalCV(deployments.extDelegateStxPox4.simnet),
        "unlock-burn-height": uintCV(2100),
      })
    );
  });
});
