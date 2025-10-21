import { Model } from "../types";
import { Simnet } from "@hirosystems/clarinet-sdk";
import { expect } from "vitest";
import { Cl } from "@stacks/transactions";
import { prettyConsoleLog } from "../helpers";
import fc from "fast-check";

export const SwsCheckAdminsMap = (model: Model) =>
  fc
    .record({})
    .chain(() =>
      fc.record({
        wallet: fc.constantFrom(...model.deployedSmartWallets),
      })
    )
    .map(({ wallet }) => ({
      check: (_model: Readonly<Model>) => {
        return true;
      },
      run: (model: Model, real: Simnet) => {
        model.deployedSmartWallets
          .find((w) => w.contractId === wallet.contractId)!
          .admins.forEach((adminAddress) => {
            // Act
            const adminsMapEntry = real.getMapEntry(
              wallet.contractId,
              "admins",
              Cl.principal(adminAddress)
            );

            // Assert
            expect(adminsMapEntry).toBeSome(Cl.bool(true));
          });

        prettyConsoleLog(
          // Sender
          " ",
          // Action
          "check-admins-map",
          // Smart Wallet
          `${wallet.deployer.label}.${wallet.contractName}`,
          // Info
          " ",
          // Result
          "(some true)"
        );
      },
      toString: () =>
        `check-admins-map ${wallet.deployer.label}.${wallet.contractName}`,
    }));
