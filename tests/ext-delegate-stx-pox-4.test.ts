import { hexToBytes } from "@clarigen/core";
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
import { accounts, deployments } from "../clarigen/src/clarigen-types";
import { getStxBalance } from "./testUtils";

const deployer = accounts.deployer.address;
const poolAdmin = accounts.wallet_2.address;
const wallet8 = accounts.wallet_8.address;

const smartWallet = deployments.smartWalletStandard.simnet;
const delegateExtension = deployments.extDelegateStxPox4.simnet;
const smartWalletEndpoint = deployments.smartWalletEndpoint.simnet;

describe("Delegate Extension", () => {
  it("delegate extension owns the delegated funds after delegation", () => {
    const delegationAmount = 100;
    const stxTransfer = tx.transferSTX(delegationAmount, smartWallet, deployer);
    simnet.mineBlock([stxTransfer]);

    const { result: delegateResponse } = simnet.callPublicFn(
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

    const delegateExtensionBalance = getStxBalance(delegateExtension);
    expect(delegateExtensionBalance).toBe(delegationAmount);
  });

  it("delegate extension still owns the delegated funds after delegation is revoked", () => {
    const delegationAmount = 100;
    const stxTransfer = tx.transferSTX(delegationAmount, smartWallet, deployer);
    simnet.mineBlock([stxTransfer]);

    const { result: delegateResponse } = simnet.callPublicFn(
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

    const { result: revokeResponse } = simnet.callPublicFn(
      smartWalletEndpoint,
      "revoke-delegate-stx",
      [Cl.principal(smartWallet), Cl.principal(delegateExtension)],
      deployer
    );
    expect(revokeResponse).toBeOk(Cl.bool(true));

    const delegateExtensionBalance = getStxBalance(delegateExtension);
    expect(delegateExtensionBalance).toBe(delegationAmount);
  });

  it("admin can recover the delegated funds after delegation is revoked", () => {
    const delegationAmount = 100;
    const stxTransfer = tx.transferSTX(delegationAmount, smartWallet, deployer);
    simnet.mineBlock([stxTransfer]);

    const { result: delegateResponse } = simnet.callPublicFn(
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

    const delegateExtensionBalance = getStxBalance(delegateExtension);
    expect(delegateExtensionBalance).toBe(delegationAmount);

    const { result: recoverResult } = simnet.callPublicFn(
      smartWallet,
      "extension-call",
      [
        Cl.principal(delegateExtension),
        Cl.bufferFromHex(
          Cl.serialize(
            Cl.tuple({
              action: Cl.stringAscii("reclaim"),
              // Any uint should result in funds recovery.
              "amount-ustx": Cl.uint(0),
              // Any principal should result in funds recovery.
              "delegate-to": Cl.principal(wallet8),
              "until-burn-ht": Cl.none(),
              "pox-addr": Cl.none(),
            })
          )
        ),
      ],
      deployer
    );

    expect(recoverResult).toBeOk(Cl.bool(true));

    const delegateExtensionBalanceAfterRecover =
      getStxBalance(delegateExtension);
    expect(delegateExtensionBalanceAfterRecover).toBe(0);
  });

  it("pool admin can lock after delegating successfully", () => {
    const transferAmount = 100;
    const delegationAmount = 100;
    const stxTransfer = tx.transferSTX(transferAmount, smartWallet, deployer);
    simnet.mineBlock([stxTransfer]);

    const { result: delegateResponse } = simnet.callPublicFn(
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

    // pool admin locks
    const { result: lockResult } = simnet.callPublicFn(
      "SP000000000000000000002Q6VF78.pox-4",
      "delegate-stack-stx",
      [
        principalCV(delegateExtension),
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
        stacker: principalCV(delegateExtension),
        "unlock-burn-height": uintCV(2100),
      })
    );
  });
});
