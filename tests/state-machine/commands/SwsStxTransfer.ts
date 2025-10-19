import { AccountObject, Model } from "../types";
import { Simnet } from "@hirosystems/clarinet-sdk";
import { expect } from "vitest";
import { Cl } from "@stacks/transactions";
import { prettyConsoleLog } from "../helpers";
import fc from "fast-check";
import { cvToValue } from "@clarigen/core";
import { getStxMemoPrintEvent } from "../../testUtils";

export const SwsStxTransferNoMemo = (accounts: AccountObject[], model: Model) =>
  fc
    .record({
      sender: fc.constantFrom(...accounts),
      recipient: fc.constantFrom(...accounts),
      amount: fc.integer({ min: 1 }),
    })
    .chain(({ sender, recipient, amount }) =>
      fc
        .record({
          wallet: fc.constantFrom(...model.deployedSmartWallets),
        })
        .map(({ wallet }) => ({ sender, recipient, wallet, amount }))
    )
    .map(({ sender, recipient, wallet, amount }) => ({
      check: (model: Readonly<Model>) => {
        const walleState = model.deployedSmartWallets.find(
          (w) => w.contractId === wallet.contractId
        )!;
        return (
          walleState.balances.uSTX >= amount &&
          walleState.admins.includes(sender.address)
        );
      },
      run: (model: Model, real: Simnet) => {
        // Act
        const {
          events: walletStxTransferEvents,
          result: walletStxTransferResult,
        } = real.callPublicFn(
          wallet.contractId,
          "stx-transfer",
          [
            // (amount uint)
            Cl.uint(amount),
            // (recipient principal)
            Cl.principal(recipient.address),
            // (memo (optional (buff 34)))
            Cl.none(),
          ],
          sender.address
        );

        // Assert
        expect(walletStxTransferResult).toBeOk(Cl.bool(true));
        expect(walletStxTransferEvents).toHaveLength(2);

        const [payloadPrintEvent, stxTransferEvent] = walletStxTransferEvents;
        const payloadData = cvToValue<{
          a: string;
          payload: { amount: string; recipient: string; memo: string };
        }>(payloadPrintEvent.data.value);
        expect(payloadData).toEqual({
          a: "stx-transfer",
          payload: {
            amount: BigInt(amount),
            recipient: recipient.address,
            memo: null,
          },
        });
        expect(stxTransferEvent).toEqual(
          getStxMemoPrintEvent(amount, wallet.contractId, recipient.address, "")
        );

        // Update model
        model.deployedSmartWallets.find(
          (w) => w.contractId === wallet.contractId
        )!.balances.uSTX -= amount;

        prettyConsoleLog(
          // Sender
          sender.label,
          // Action
          "stx-transfer",
          // Smart Wallet
          `${wallet.deployer.label}.${wallet.contractName}`,
          // Info
          `amount:${amount}, to:${recipient.label}`,
          // Result
          "(ok true)"
        );
      },
      toString: () =>
        `${sender.label} stx-transfer ${wallet.deployer.label}.${wallet.contractName} amount:${amount}`,
    }));
