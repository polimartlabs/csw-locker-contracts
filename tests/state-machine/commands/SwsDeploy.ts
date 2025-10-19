import { AccountObject, Model } from "../types";
import { Simnet } from "@hirosystems/clarinet-sdk";
import { expect } from "vitest";
import { Cl } from "@stacks/transactions";
import { prettyConsoleLog } from "../helpers";
import fc from "fast-check";
import { readFileSync } from "fs";

// Read the smart wallet contract source code at module load time.
const contractSrc = readFileSync(
  "./contracts/smart-wallet-standard.clar",
  "utf-8"
);

export const SwsDeploy = (accounts: AccountObject[]) =>
  fc
    .record({
      owner: fc.constantFrom(...accounts),
      // Match a string that starts with "smart-wallet-" and is followed by 1-5
      // valid contract name characters.
      contractName: fc.stringMatching(/^smart-wallet-[a-zA-Z0-9-_]{1,5}$/),
    })
    .map(({ owner, contractName }) => ({
      check: (model: Readonly<Model>) => {
        // A wallet with the same name has not already been deployed by the
        // owner.
        return (
          model.deployedSmartWallets.findIndex(
            (sw) =>
              sw.deployer.address === owner.address &&
              sw.contractName === contractName
          ) === -1
        );
      },
      run: (model: Model, real: Simnet) => {
        // Act
        real.deployContract(contractName, contractSrc, null, owner.address);

        // Assert
        // Deployment sanity check: verify that the owner is correctly set in
        // the deployed smart wallet.
        const { result: getOwnerResult } = real.callReadOnlyFn(
          `${owner.address}.${contractName}`,
          "get-owner",
          [],
          owner.address
        );
        expect(getOwnerResult).toBeOk(Cl.principal(owner.address));

        // Update model
        model.deployedSmartWallets.push({
          deployer: owner,
          contractName: contractName,
          contractId: `${owner.address}.${contractName}`,
          owner: owner,
          admins: [owner.address, `${owner.address}.${contractName}`],
          balances: {
            uSTX: 0,
            SIP009: {},
            SIP010: {},
          },
        });

        prettyConsoleLog(
          // Sender
          owner.label,
          // Action
          "deploy-smart-wallet",
          // Smart Wallet
          `${owner.label}.${contractName}`,
          // Info
          " ",
          // Result
          "(some true)"
        );
      },
      toString: () =>
        `${owner.address} deploy-smart-wallet ${owner.label}.${contractName}`,
    }));
