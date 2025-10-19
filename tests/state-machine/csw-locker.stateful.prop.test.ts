import { initSimnet } from "@hirosystems/clarinet-sdk";
import fc, { VerbosityLevel } from "fast-check";
import { it } from "vitest";
import { AccountObject, Model } from "./types";
import { accounts, deployments } from "../../clarigen/src/clarigen-types";
import { SwsGetOwner } from "./commands/SwsGetOwner";
import { prettyConsoleLog } from "./helpers";
import {
  SwsIsAdminCallingErr,
  SwsIsAdminCallingOk,
} from "./commands/SwsIsAdminCalling";
import { SwsCheckAdminsMap } from "./commands/SwsCheckAdminsMap";
import { SwsFundWallet } from "./commands/SwsFundWallet";
import { SwsStxTransferNoMemo } from "./commands/SwsStxTransfer";
import { CswrCswRegister } from "./commands/CswrCswRegister";
import { SwsDeploy } from "./commands/SwsDeploy";

it("executes csw-locker state interactions", async () => {
  const simnet = await initSimnet();

  const deployerAddress = accounts.deployer.address;
  const excludedAccounts = ["faucet"];
  const testAccounts: AccountObject[] = [...simnet.getAccounts()]
    .filter(([label]) => !excludedAccounts.includes(label))
    .map(([label, address]) => ({
      label,
      address,
    }));
  const initialUstxUserBalance = 100_000_000_000_000;
  const accountBalances = Object.fromEntries(
    testAccounts.map((account: AccountObject) => [
      account.address,
      {
        uSTX: initialUstxUserBalance,
        SIP009: {},
        SIP010: {},
      },
    ])
  );

  const model: Model = {
    accountBalances: accountBalances,
    registry: {
      cswIndex: 0,
      registeredWallets: [],
    },
    // In the beginning there are two already deployed smart wallets as per the
    // Clarinet.toml.
    deployedSmartWallets: [
      {
        deployer: {
          address: deployerAddress,
          label: "deployer",
        },
        contractName: "smart-wallet-standard",
        contractId: deployments.smartWalletStandard.simnet,
        owner: {
          address: deployerAddress,
          label: "deployer",
        },
        admins: [`${deployerAddress}.smart-wallet-standard`, deployerAddress],
        balances: {
          uSTX: 0,
          SIP009: {},
          SIP010: {},
        },
      },
      {
        deployer: {
          address: deployerAddress,
          label: "deployer",
        },
        contractName: "smart-wallet-standard-2",
        contractId: deployments.smartWalletStandard2.simnet,
        owner: {
          address: deployerAddress,
          label: "deployer",
        },
        admins: [`${deployerAddress}.smart-wallet-standard-2`, deployerAddress],
        balances: {
          uSTX: 0,
          SIP009: {},
          SIP010: {},
        },
      },
    ],
  };

  const invariants = [
    SwsDeploy(testAccounts),
    SwsGetOwner(testAccounts, model),
    SwsIsAdminCallingErr(testAccounts, model),
    SwsIsAdminCallingOk(testAccounts, model),
    SwsCheckAdminsMap(model),
    SwsFundWallet(testAccounts, model),
    SwsStxTransferNoMemo(testAccounts, model),
    CswrCswRegister(testAccounts, model),
  ];

  // Print header for clarity in the console output.
  prettyConsoleLog("Caller, Action, Smart Wallet, Info?, Result");
  fc.assert(
    fc.property(fc.array(fc.oneof(...invariants), { size: "+1" }), (cmds) => {
      const state = () => ({ model, real: simnet });
      fc.modelRun(state, cmds);
    }),
    { numRuns: 1000, verbose: VerbosityLevel.Verbose, endOnFailure: true }
  );
});
