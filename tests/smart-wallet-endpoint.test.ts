import { initSimnet } from "@hirosystems/clarinet-sdk";
import { accounts, deployments } from "../clarigen/src/clarigen-types";
import { tx } from "@hirosystems/clarinet-sdk";
import { Cl } from "@stacks/transactions";
import { expect, it } from "vitest";

const simnet = await initSimnet();

const wallet1 = accounts.wallet_1.address;
const wallet2 = accounts.wallet_2.address;

const smartWalletWithRules = deployments.smartWalletWithRules.simnet;
const smartWalletEndpoint = deployments.smartWalletEndpoint.simnet;

// Type guard to check if data has an amount property
function hasAmountProperty(data: any): data is { amount: string } {
  return (data as { amount: string }).amount !== undefined;
}

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
