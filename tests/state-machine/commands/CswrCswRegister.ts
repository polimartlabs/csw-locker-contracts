import { AccountObject, Model } from "../types";
import { Simnet } from "@hirosystems/clarinet-sdk";
import { expect } from "vitest";
import { Cl } from "@stacks/transactions";
import { prettyConsoleLog } from "../helpers";
import fc from "fast-check";
import { deployments } from "../../../clarigen/src/clarigen-types";

export const CswrCswRegister = (accounts: AccountObject[], model: Model) =>
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
      check: (model: Readonly<Model>) => {
        return (
          // Only the owner can register the smart wallet in the CSW Registry.
          model.deployedSmartWallets.find(
            (w) => w.contractId === wallet.contractId
          )?.owner.address === sender.address &&
          // The smart wallet is not already registered.
          model.registry.registeredWallets.findIndex(
            (rw) => rw.contractId === wallet.contractId
          ) === -1
        );
      },
      run: (model: Model, real: Simnet) => {
        const expectedCswIndex = model.registry.cswIndex + 1;

        // Act
        const { result: cswRegisterResult } = real.callPublicFn(
          deployments.cswRegistry.simnet,
          "csw-register",
          [Cl.principal(wallet.contractId)],
          sender.address
        );

        // Assert
        expect(cswRegisterResult).toBeOk(Cl.uint(expectedCswIndex));

        // Update model
        model.registry.cswIndex = expectedCswIndex;
        model.registry.registeredWallets.push({
          contractId: wallet.contractId,
          owner: wallet.owner.address,
          cswIndex: expectedCswIndex,
        });

        prettyConsoleLog(
          // Sender
          sender.label,
          // Action
          "csw-register",
          // Smart Wallet
          `${wallet.deployer.label}.${wallet.contractName}`,
          // Info
          `index: ${expectedCswIndex}`,
          // Result
          "(ok true)"
        );
      },
      toString: () =>
        `${sender.label} csw-register ${wallet.deployer.label}.${wallet.contractName}`,
    }));
