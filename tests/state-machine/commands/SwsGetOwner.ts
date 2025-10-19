import { AccountObject, Model } from "../types";
import { Simnet } from "@hirosystems/clarinet-sdk";
import { expect } from "vitest";
import { Cl } from "@stacks/transactions";
import { prettyConsoleLog } from "../helpers";
import fc from "fast-check";

export const SwsGetOwner = (accounts: AccountObject[], model: Model) =>
  fc
    .record({
      sender: fc.constantFrom(...accounts),
    })
    .chain(({ sender }) =>
      fc
        .record({
          wallet: fc.constantFrom(...model.deployedSmartWallets),
        })
        .map(({ wallet }) => ({ sender, wallet }))
    )
    .map(({ sender, wallet }) => ({
      check: (_model: Readonly<Model>) => {
        return true;
      },
      run: (model: Model, real: Simnet) => {
        const walletState = model.deployedSmartWallets.find(
          (w) => w.contractId === wallet.contractId
        )!;

        // Act
        const { result: getOwnerResult } = real.callReadOnlyFn(
          wallet.contractId,
          "get-owner",
          [],
          sender.address
        );

        // Assert
        expect(getOwnerResult).toBeOk(Cl.principal(walletState.owner.address));

        prettyConsoleLog(
          // Sender
          sender.label,
          // Action
          "get-owner",
          // Smart Wallet
          `${wallet.deployer.label}.${wallet.contractName}`,
          // Info
          " ",
          // Result
          walletState.owner.label
        );
      },
      toString: () =>
        `${sender.label} get-owner ${wallet.deployer.label}.${wallet.contractName}`,
    }));
