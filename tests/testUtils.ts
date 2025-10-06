import { hexToCvValue } from "@clarigen/core";
import { Simnet, tx } from "@hirosystems/clarinet-sdk";
import { accounts, deployments } from "../clarigen/src/clarigen-types";
import { Cl, serializeCV } from "@stacks/transactions";
import { expect } from "vitest";

export const errorCodes = {
  cswRegistry: {
    NOT_AUTHORIZED: 102,
    OPERATION_UNAUTHORIZED: 114,
  },
  emergencyRules: {
    EMERGENCY_LOCKDOWN: 401,
  },
  standardRules: {
    PER_TX_LIMIT: 402,
    WEEKLY_LIMIT: 403,
  },
  general: {
    NOT_ENOUGH_BALANCE: 1,
  },
  ogBitcoinPizzaLeatherEdition: {
    NOT_AUTHORIZED: 101,
  },
  smartWalletStandard: {
    UNAUTHORISED: 4001,
    FORBIDDEN: 4003,
  },
  smartWalletGroup: {
    UNAUTHORISED: 4001,
    FORBIDDEN: 4003,
  },
  smartWalletWithRules: {
    UNAUTHORISED: 401,
    FORBIDDEN: 403,
  },
  xBTC: {
    ORIGINATOR_NOT_SENDER: 4,
  },
};

export const getStxBalance = (address: string) => {
  const balanceHex = simnet.runSnippet(`(stx-get-balance '${address})`);
  const balanceBigInt = hexToCvValue(balanceHex);
  return Number(balanceBigInt);
};

export const getStxMemoPrintEvent = (
  amount: number,
  sender: string,
  recipient: string,
  memo: string
) => {
  const memoString = serializeCV(Cl.stringAscii(memo));
  return {
    data: { amount: amount.toString(), sender, recipient, memo: memoString },
    event: "stx_transfer_event",
  };
};

export const initAndSendWrappedBitcoin = (
  simnet: Simnet,
  amount: number,
  to: string
) => {
  const deployer = accounts.deployer.address;
  const wrappedBitcoinContract = deployments.wrappedBitcoin.simnet;
  const wrappedBitcoinDeployer = wrappedBitcoinContract.split(".")[0];
  const block = simnet.mineBlock([
    tx.callPublicFn(
      wrappedBitcoinContract,
      "initialize",
      [
        Cl.stringAscii("Wrapped Bitcoin"),
        Cl.stringAscii("xBTC"),
        Cl.uint(8),
        // initial-owner
        Cl.principal(deployer),
      ],
      wrappedBitcoinDeployer
    ),
    tx.callPublicFn(
      wrappedBitcoinContract,
      "add-principal-to-role",
      [
        // minter
        Cl.uint(1),
        Cl.principal(deployer),
      ],
      deployer
    ),
    tx.callPublicFn(
      wrappedBitcoinContract,
      "mint-tokens",
      [Cl.uint(amount), Cl.principal(to)],
      deployer
    ),
  ]);

  const [
    { result: initializeResult },
    { result: addPrincipalToRoleResult },
    { result: mintTokensResult },
  ] = block;
  expect(initializeResult).toBeOk(Cl.bool(true));
  expect(addPrincipalToRoleResult).toBeOk(Cl.bool(true));
  expect(mintTokensResult).toBeOk(Cl.bool(true));
};
