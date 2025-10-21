import { AccountObject, Model } from "../types";
import { Simnet } from "@hirosystems/clarinet-sdk";
import { expect } from "vitest";
import { Cl } from "@stacks/transactions";
import { prettyConsoleLog } from "../helpers";
import fc from "fast-check";
import { contracts } from "../../../clarigen/src/clarigen-types";

export const SwsIsAdminCallingOk = (accounts: AccountObject[], model: Model) =>
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
        return model.deployedSmartWallets
          .find((w) => w.contractId === wallet.contractId)!
          .admins.includes(sender.address);
      },
      run: (_model: Model, real: Simnet) => {
        // Act
        const { result: isAdminCallingResult } = real.callReadOnlyFn(
          wallet.contractId,
          "is-admin-calling",
          [],
          sender.address
        );

        // Assert
        expect(isAdminCallingResult).toBeOk(Cl.bool(true));

        prettyConsoleLog(
          // Sender
          sender.label,
          // Action
          "is-admin-calling",
          // Smart Wallet
          `${wallet.deployer.label}.${wallet.contractName}`,
          // Info
          " ",
          // Result
          "(ok true)"
        );
      },
      toString: () =>
        `${sender.label} is-admin-calling ok ${wallet.deployer.label}.${wallet.contractName}`,
    }));

export const SwsIsAdminCallingErr = (accounts: AccountObject[], model: Model) =>
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
        return !model.deployedSmartWallets
          .find((w) => w.contractId === wallet.contractId)!
          .admins.includes(sender.address);
      },
      run: (_model: Model, real: Simnet) => {
        // Act
        const { result: isAdminCallingResult } = real.callReadOnlyFn(
          wallet.contractId,
          "is-admin-calling",
          [],
          sender.address
        );

        // Assert
        const expectedErrCode =
          contracts.smartWalletStandard.constants.errUnauthorised.value;
        expect(isAdminCallingResult).toBeErr(Cl.uint(expectedErrCode));

        prettyConsoleLog(
          // Sender
          sender.label,
          // Action
          "is-admin-calling",
          // Smart Wallet
          `${wallet.deployer.label}.${wallet.contractName}`,
          // Info
          " ",
          // Result
          `(err u${expectedErrCode})`
        );
      },
      toString: () =>
        `${sender.label} is-admin-calling err ${wallet.deployer.label}.${wallet.contractName}`,
    }));
