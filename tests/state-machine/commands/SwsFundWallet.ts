import { AccountObject, Model } from "../types";
import { Simnet, tx } from "@hirosystems/clarinet-sdk";
import { expect } from "vitest";
import { Cl } from "@stacks/transactions";
import { prettyConsoleLog } from "../helpers";
import fc from "fast-check";
import { getStxBalance } from "../../testUtils";

export const SwsFundWallet = (accounts: AccountObject[], model: Model) =>
  fc
    .record({
      sender: fc.constantFrom(...accounts),
      amount: fc.integer({ min: 1 }),
    })
    .chain(({ sender, amount }) =>
      fc
        .record({
          recipientWallet: fc.constantFrom(...model.deployedSmartWallets),
        })
        .map(({ recipientWallet }) => ({ amount, sender, recipientWallet }))
    )
    .map(({ amount, sender, recipientWallet }) => ({
      check: (model: Readonly<Model>) => {
        return model.accountBalances[sender.address].uSTX >= amount;
      },
      run: (model: Model, real: Simnet) => {
        const modelSmartWalletBalanceBefore = model.deployedSmartWallets.find(
          (w) => w.contractId === recipientWallet.contractId
        )!.balances.uSTX;

        // Act
        const stxTransfer = tx.transferSTX(
          amount,
          recipientWallet.contractId,
          sender.address
        );
        const block = real.mineBlock([stxTransfer]);

        const realSmartWalletBalanceAfter = getStxBalance(
          real,
          recipientWallet.contractId
        );

        // Assert
        expect(block[0].result).toBeOk(Cl.bool(true));
        expect(realSmartWalletBalanceAfter).toBe(
          modelSmartWalletBalanceBefore + amount
        );

        // Update model
        model.deployedSmartWallets.find(
          (w) => w.contractId === recipientWallet.contractId
        )!.balances.uSTX += amount;

        prettyConsoleLog(
          // Sender
          sender.label,
          // Action
          `fund-wallet`,
          // Smart Wallet
          `${recipientWallet.deployer.label}.${recipientWallet.contractName}`,
          // Info
          `amount:${amount}`,
          // Result
          "(ok true)"
        );
      },
      toString: () =>
        `${sender.label} fund-wallet ${recipientWallet.deployer.label}.${recipientWallet.contractName}`,
    }));
