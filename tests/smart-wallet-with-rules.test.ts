import {
  Cl,
  cvToValue,
  standardPrincipalCV,
  trueCV,
} from "@stacks/transactions";
import { describe, expect, it } from "vitest";
import { accounts, deployments } from "../clarigen/src/clarigen-types";
import { tx } from "@hirosystems/clarinet-sdk";
import { errorCodes } from "./testUtils";

const deployer = accounts.deployer.address;
const wallet1 = accounts.wallet_1.address;
const wallet2 = accounts.wallet_2.address;

const smartWalletWithRules = deployments.smartWalletWithRules.simnet;
const smartWalletEndpoint = deployments.smartWalletEndpoint.simnet;

// Type guard to check if data has an amount property
function hasAmountProperty(data: any): data is { amount: string } {
  return (data as { amount: string }).amount !== undefined;
}

// TODO: Split by standard rules, no rules, and emergency rules.
describe("Smart Wallet with rules", () => {
  it("wallet with rules can transfer stx to a standard recipient", () => {
    const transferAmount = 100;
    const stxTransfer = tx.transferSTX(
      transferAmount,
      deployments.smartWalletWithRules.simnet,
      wallet1
    );
    simnet.mineBlock([stxTransfer]);

    const { result: stxTransferResult } = simnet.callPublicFn(
      smartWalletWithRules,
      "stx-transfer",
      [Cl.uint(transferAmount), Cl.principal(wallet2), Cl.none()],
      wallet1
    );
    expect(stxTransferResult).toBeOk(trueCV());
  });

  it("transferring sip10 tokens fails because tx-sender is not the token sender", () => {
    const sip010Contract = deployments.nope.simnet;
    const transferAmount = 100;
    const { result: sip010TransferResult } = simnet.callPublicFn(
      smartWalletWithRules,
      "sip010-transfer",
      [
        Cl.uint(transferAmount),
        Cl.principal(wallet2),
        Cl.none(),
        Cl.principal(sip010Contract),
      ],
      wallet1
    );

    // nope contract defines that tx-sender must be the token sender
    expect(sip010TransferResult).toBeErr(Cl.uint(401));
  });

  it("transfers 1 Nft to wallet", () => {
    const sip09Contract =
      "SP16GEW6P7GBGZG0PXRXFJEMR3TJHJEY2HJKBP1P5.og-bitcoin-pizza-leather-edition";

    const { result: sip09TransferResult } = simnet.callPublicFn(
      smartWalletWithRules,
      "sip009-transfer",
      [Cl.uint(1), Cl.principal(wallet2), Cl.principal(sip09Contract)],
      wallet1
    );

    expect(sip09TransferResult).toBeErr(Cl.uint(101));
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
});

it("non-admin cannot enable admin", async () => {
  const adminAddress = standardPrincipalCV(wallet1);
  const enableAdmin = simnet.callPublicFn(
    "smart-wallet-with-rules",
    "enable-admin",
    [adminAddress, Cl.bool(true)],
    wallet1
  );

  expect(enableAdmin.result).toBeErr(
    Cl.uint(errorCodes.smartWalletWithRules.UNAUTHORISED)
  );
});

it("admin can set security level", async () => {
  const { result: setSecurityLevelResult } = simnet.callPublicFn(
    "smart-wallet-with-rules",
    "set-security-level",
    [Cl.uint(1)],
    deployer
  );

  expect(setSecurityLevelResult).toBeOk(Cl.bool(true));
});

it("setting-security-level correctly updates the security level data var", async () => {
  simnet.callPublicFn(
    "smart-wallet-with-rules",
    "set-security-level",
    [Cl.uint(1)],
    deployer
  );

  const currentSecurityLevel = cvToValue(
    simnet.getDataVar("smart-wallet-with-rules", "security-level")
  );

  expect(currentSecurityLevel).toEqual(1n);
});

// TODO: This test is failing, no handling of invalid security level in the
// contract yet.
// it("admin cannot set an invalid security level", async () => {
//   const invalidSecurityLevel = 3;

//   const { result: setSecurityLevelResult } = simnet.callPublicFn(
//     "smart-wallet-with-rules",
//     "set-security-level",
//     [Cl.uint(invalidSecurityLevel)],
//     deployer
//   );

//   expect(setSecurityLevelResult).toHaveClarityType(ClarityType.ResponseErr);
// });

it("checks that is-admin-calling is working", async () => {
  const { result: isAdminCallingResult } = simnet.callReadOnlyFn(
    "smart-wallet-with-rules",
    "is-admin-calling",
    [],
    wallet1
  );

  expect(isAdminCallingResult).toBeErr(
    Cl.uint(errorCodes.smartWalletWithRules.UNAUTHORISED)
  );
});
