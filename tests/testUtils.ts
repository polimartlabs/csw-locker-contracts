import { cvToValue, hexToCvValue } from "@clarigen/core";
import { Simnet, tx } from "@stacks/clarinet-sdk";
import { accounts, deployments } from "../clarigen/src/clarigen-types";
import { Cl, serializeCV } from "@stacks/transactions";
import { expect } from "vitest";

export const errorCodes = {
  general: {
    NOT_ENOUGH_BALANCE: 1,
  },
  ogBitcoinPizzaLeatherEdition: {
    NOT_AUTHORIZED: 101,
  },
  wrappedBitcoin: {
    ORIGINATOR_NOT_SENDER: 4,
  },
};

export const addresses: string[] = Object.values(accounts).map(
  (account) => account.address
);

export const btcAddresses = ["mqVnk6NPRdhntvfm4hh9vvjiRkFDUuSYsH"];

export const getStxBalance = (simnet: Simnet, address: string) => {
  const balanceHex = simnet.runSnippet(`(stx-get-balance '${address})`);
  const balanceBigInt = hexToCvValue(balanceHex);
  return Number(balanceBigInt);
};

export const getSbtcBalance = (simnet: Simnet, address: string) => {
  const { result: sbtcBalanceResult } = simnet.callReadOnlyFn(
    deployments.sbtcToken.simnet,
    "get-balance",
    [Cl.principal(address)],
    accounts.deployer.address
  );
  const sbtcBalance = cvToValue<{ value: number }>(sbtcBalanceResult);
  return Number(sbtcBalance);
};

export const getStxMemoPrintEvent = (
  amount: number,
  sender: string,
  recipient: string,
  memo: string
) => {
  const memoString = memo ? serializeCV(Cl.stringAscii(memo)) : "";
  return {
    data: { amount: amount.toString(), sender, recipient, memo: memoString },
    event: "stx_transfer_event",
  };
};

export const transferSbtc = (
  simnet: Simnet,
  amount: number,
  from: string,
  to: string
) => {
  const sbtcTransfer = simnet.callPublicFn(
    deployments.sbtcToken.simnet,
    "transfer",
    [
      // (amount uint)
      Cl.uint(amount),
      // (sender principal)
      Cl.principal(from),
      // (recipient principal)
      Cl.principal(to),
      // (memo (optional (buff 34)))
      Cl.none(),
    ],
    from
  );

  return sbtcTransfer;
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

export const getSimnetChainId: (simnet: Simnet) => number = (simnet: Simnet) =>
  cvToValue(Cl.deserialize(simnet.runSnippet(`chain-id`)));

export const proxyTransferSrc = `
(define-public (transfer-no-context-switching (to principal))
  (contract-call? 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.smart-wallet-standard transfer-wallet to)
)

(define-public (transfer-context-switching (to principal))
  (as-contract? () (try! (contract-call? 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.smart-wallet-standard transfer-wallet to)))
)
`;
