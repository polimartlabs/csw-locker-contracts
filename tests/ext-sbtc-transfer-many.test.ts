import { tx } from "@hirosystems/clarinet-sdk";
import { Cl } from "@stacks/transactions";
import { describe, expect, it } from "vitest";
import {
  accounts,
  contracts,
  deployments,
} from "../clarigen/src/clarigen-types";
import { getSbtcBalance } from "./testUtils";
import { cvToValue } from "@clarigen/core";

const deployer = accounts.deployer.address;
const wallet1 = accounts.wallet_1.address;
const wallet2 = accounts.wallet_2.address;
const wallet3 = accounts.wallet_3.address;
const wallet4 = accounts.wallet_4.address;

const smartWallet = deployments.smartWalletStandard.simnet;
const sbtcTokenContract = deployments.sbtcToken.simnet;
const sbtcTransferManyExtension =
  deployments.extSponsoredSbtcTransferMany.simnet;

describe("sBTC Transfer Many Extension", () => {
  it("non-owner cannot call the sBTC transfer many extension", () => {
    const transferAmount = 50;
    // this amount will be ignored, the tx is not sponsored
    const feesAmount = 1;
    // send sBTC tokens to smart wallet
    const sbtcTransfer = tx.callPublicFn(
      sbtcTokenContract,
      "transfer",
      [
        // (amount uint)
        Cl.uint(transferAmount),
        // (sender principal)
        Cl.principal(wallet1),
        // (recipient principal)
        Cl.principal(smartWallet),
        // (memo (optional (buff 34)))
        Cl.none(),
      ],
      wallet1
    );
    const [{ result: fundingResult }] = simnet.mineBlock([sbtcTransfer]);
    expect(fundingResult).toBeOk(Cl.bool(true));

    const { result: sbtcTransferManyResult } = simnet.callPublicFn(
      smartWallet,
      "extension-call",
      [
        // (extension <extension-trait>)
        Cl.principal(sbtcTransferManyExtension),
        // (payload (buff 2048))
        Cl.bufferFromHex(
          Cl.serialize(
            Cl.tuple({
              fees: Cl.uint(feesAmount),
              recipients: Cl.list([
                Cl.tuple({
                  amount: Cl.uint(transferAmount),
                  sender: Cl.principal(smartWallet),
                  to: Cl.principal(wallet2),
                  memo: Cl.none(),
                }),
              ]),
            })
          )
        ),
      ],
      wallet1
    );
    expect(sbtcTransferManyResult).toBeErr(
      Cl.uint(contracts.smartWalletStandard.constants.errUnauthorised.value)
    );
  });

  it("sending sBTC to one recipient using transfer many extension correctly updates balances", () => {
    // wallet1 funds the smart wallet with 100 sBTC.
    // deployer uses the smart wallet to send 50 sBTC to wallet2.
    const fundingAmount = 100;
    const transferAmount = 50;
    const feesAmount = 1;

    const initial = {
      deployer: getSbtcBalance(simnet, deployer),
      wallet1: getSbtcBalance(simnet, wallet1),
      wallet2: getSbtcBalance(simnet, wallet2),
      smartWallet: getSbtcBalance(simnet, smartWallet),
    };

    // send sBTC tokens to smart wallet
    const sbtcTransfer = tx.callPublicFn(
      sbtcTokenContract,
      "transfer",
      [
        // (amount uint)
        Cl.uint(fundingAmount),
        // (sender principal)
        Cl.principal(wallet1),
        // (recipient principal)
        Cl.principal(smartWallet),
        // (memo (optional (buff 34)))
        Cl.none(),
      ],
      wallet1
    );
    const [{ result: fundingResult }] = simnet.mineBlock([sbtcTransfer]);
    expect(fundingResult).toBeOk(Cl.bool(true));

    // Extract all the involved parties' initial sBTC balances.
    const before = {
      deployer: getSbtcBalance(simnet, deployer),
      wallet1: getSbtcBalance(simnet, wallet1),
      wallet2: getSbtcBalance(simnet, wallet2),
      smartWallet: getSbtcBalance(simnet, smartWallet),
    };

    const { result: sbtcTransferManyResult } = simnet.callPublicFn(
      smartWallet,
      "extension-call",
      [
        // (extension <extension-trait>)
        Cl.principal(sbtcTransferManyExtension),
        // (payload (buff 2048))
        Cl.bufferFromHex(
          Cl.serialize(
            Cl.tuple({
              fees: Cl.uint(feesAmount),
              recipients: Cl.list([
                Cl.tuple({
                  amount: Cl.uint(transferAmount),
                  sender: Cl.principal(smartWallet),
                  to: Cl.principal(wallet2),
                  memo: Cl.none(),
                }),
              ]),
            })
          )
        ),
      ],
      deployer
    );
    expect(sbtcTransferManyResult).toBeOk(Cl.bool(true));

    const after = {
      deployer: getSbtcBalance(simnet, deployer),
      wallet1: getSbtcBalance(simnet, wallet1),
      wallet2: getSbtcBalance(simnet, wallet2),
      smartWallet: getSbtcBalance(simnet, smartWallet),
    };

    // Deployer should be unchanged.
    expect(after.deployer).toBe(initial.deployer);
    expect(after.deployer).toBe(before.deployer);
    // Wallet 1 should be unchanged. The only transfer wallet1 made was the
    // initial funding to the smart wallet.
    expect(after.wallet1).toBe(initial.wallet1 - fundingAmount);
    expect(after.wallet1).toBe(before.wallet1);
    // Wallet 2 should have received 50 sBTC.
    expect(after.wallet2).toBe(initial.wallet2 + transferAmount);
    expect(after.wallet2).toBe(before.wallet2 + transferAmount);
    // Smart wallet should have the initial funding minus the transfer amount.
    expect(after.smartWallet).toBe(
      initial.smartWallet + fundingAmount - transferAmount
    );
    expect(after.smartWallet).toBe(before.smartWallet - 50);
  });

  it("sending sBTC to one recipient using transfer many extension correctly prints the events", () => {
    const fundingAmount = 100;
    const transferAmount = 50;
    const feesAmount = 1;

    // send sBTC tokens to smart wallet
    const sbtcTransfer = tx.callPublicFn(
      sbtcTokenContract,
      "transfer",
      [
        // (amount uint)
        Cl.uint(fundingAmount),
        // (sender principal)
        Cl.principal(wallet1),
        // (recipient principal)
        Cl.principal(smartWallet),
        // (memo (optional (buff 34)))
        Cl.none(),
      ],
      wallet1
    );
    const [{ result: fundingResult }] = simnet.mineBlock([sbtcTransfer]);
    expect(fundingResult).toBeOk(Cl.bool(true));

    const serializedPayload = Cl.serialize(
      Cl.tuple({
        fees: Cl.uint(feesAmount),
        recipients: Cl.list([
          Cl.tuple({
            amount: Cl.uint(transferAmount),
            sender: Cl.principal(smartWallet),
            to: Cl.principal(wallet2),
            memo: Cl.none(),
          }),
        ]),
      })
    );
    const { events: sbtcTransferManyEvents, result: sbtcTransferManyResult } =
      simnet.callPublicFn(
        smartWallet,
        "extension-call",
        [
          // (extension <extension-trait>)
          Cl.principal(sbtcTransferManyExtension),
          // (payload (buff 2048))
          Cl.bufferFromHex(serializedPayload),
        ],
        deployer
      );
    expect(sbtcTransferManyResult).toBeOk(Cl.bool(true));
    // ectMint, ectBurn, payload, and sbtc transfer event.
    expect(sbtcTransferManyEvents.length).toBe(4);

    const [ectMintEvent, ectBurnEvent, payloadPrintEvent, sbtcTransferEvent] =
      sbtcTransferManyEvents;
    expect(ectMintEvent).toEqual({
      data: {
        amount: "1",
        asset_identifier: `${smartWallet}::ect`,
        recipient: smartWallet,
      },
      event: "ft_mint_event",
    });
    expect(ectBurnEvent).toEqual({
      data: {
        amount: "1",
        asset_identifier: `${smartWallet}::ect`,
        sender: smartWallet,
      },
      event: "ft_burn_event",
    });
    const payloadData = cvToValue<{
      a: string;
      payload: { extension: string; payload: string };
    }>(payloadPrintEvent.data.value);
    expect(payloadData).toEqual({
      a: "extension-call",
      payload: {
        extension: sbtcTransferManyExtension,
        payload: Uint8Array.from(Buffer.from(serializedPayload, "hex")),
      },
    });
    expect(sbtcTransferEvent).toEqual({
      data: {
        amount: transferAmount.toString(),
        sender: smartWallet,
        recipient: wallet2,
        asset_identifier: `${sbtcTokenContract}::sbtc-token`,
      },
      event: "ft_transfer_event",
    });
  });

  it("sending sBTC to multiple recipients using transfer many extension correctly updates balances", () => {
    const fundingAmount = 100;
    const transferAmount1 = 10;
    const transferAmount2 = 20;
    const transferAmount3 = 30;
    const transferAmount4 = 40;
    const feesAmount = 1;

    const initial = {
      deployer: getSbtcBalance(simnet, deployer),
      wallet1: getSbtcBalance(simnet, wallet1),
      wallet2: getSbtcBalance(simnet, wallet2),
      wallet3: getSbtcBalance(simnet, wallet3),
      wallet4: getSbtcBalance(simnet, wallet4),
      smartWallet: getSbtcBalance(simnet, smartWallet),
    };

    // send sBTC tokens to smart wallet
    const sbtcTransfer = tx.callPublicFn(
      sbtcTokenContract,
      "transfer",
      [
        // (amount uint)
        Cl.uint(fundingAmount),
        // (sender principal)
        Cl.principal(deployer),
        // (recipient principal)
        Cl.principal(smartWallet),
        // (memo (optional (buff 34)))
        Cl.none(),
      ],
      deployer
    );
    const [{ result: fundingResult }] = simnet.mineBlock([sbtcTransfer]);
    expect(fundingResult).toBeOk(Cl.bool(true));

    // Extract all the involved parties' initial sBTC balances.
    const before = {
      deployer: getSbtcBalance(simnet, deployer),
      wallet1: getSbtcBalance(simnet, wallet1),
      wallet2: getSbtcBalance(simnet, wallet2),
      wallet3: getSbtcBalance(simnet, wallet3),
      wallet4: getSbtcBalance(simnet, wallet4),
      smartWallet: getSbtcBalance(simnet, smartWallet),
    };

    const { result: sbtcTransferManyResult } = simnet.callPublicFn(
      smartWallet,
      "extension-call",
      [
        // (extension <extension-trait>)
        Cl.principal(sbtcTransferManyExtension),
        // (payload (buff 2048))
        Cl.bufferFromHex(
          Cl.serialize(
            Cl.tuple({
              fees: Cl.uint(feesAmount),
              recipients: Cl.list([
                // Transfer 1.
                Cl.tuple({
                  amount: Cl.uint(transferAmount1),
                  sender: Cl.principal(smartWallet),
                  to: Cl.principal(wallet1),
                  memo: Cl.none(),
                }),
                // Transfer 2.
                Cl.tuple({
                  amount: Cl.uint(transferAmount2),
                  sender: Cl.principal(smartWallet),
                  to: Cl.principal(wallet2),
                  memo: Cl.none(),
                }),
                // Transfer 3.
                Cl.tuple({
                  amount: Cl.uint(transferAmount3),
                  sender: Cl.principal(smartWallet),
                  to: Cl.principal(wallet3),
                  memo: Cl.none(),
                }),
                // Transfer 4.
                Cl.tuple({
                  amount: Cl.uint(transferAmount4),
                  sender: Cl.principal(smartWallet),
                  to: Cl.principal(wallet4),
                  memo: Cl.none(),
                }),
              ]),
            })
          )
        ),
      ],
      deployer
    );
    expect(sbtcTransferManyResult).toBeOk(Cl.bool(true));

    const after = {
      deployer: getSbtcBalance(simnet, deployer),
      wallet1: getSbtcBalance(simnet, wallet1),
      wallet2: getSbtcBalance(simnet, wallet2),
      wallet3: getSbtcBalance(simnet, wallet3),
      wallet4: getSbtcBalance(simnet, wallet4),
      smartWallet: getSbtcBalance(simnet, smartWallet),
    };

    // Deployer should have less than initial, unchanged from before the
    // extension call.
    expect(after.deployer).toBe(initial.deployer - fundingAmount);
    expect(after.deployer).toBe(before.deployer);
    // Wallet 1 should have received transferAmount1 sBTC.
    expect(after.wallet1).toBe(initial.wallet1 + transferAmount1);
    expect(after.wallet1).toBe(before.wallet1 + transferAmount1);
    // Wallet 2 should have received transferAmount2 sBTC.
    expect(after.wallet2).toBe(initial.wallet2 + transferAmount2);
    expect(after.wallet2).toBe(before.wallet2 + transferAmount2);
    // Wallet 3 should have received transferAmount3 sBTC.
    expect(after.wallet3).toBe(initial.wallet3 + transferAmount3);
    expect(after.wallet3).toBe(before.wallet3 + transferAmount3);
    // Wallet 4 should have received transferAmount4 sBTC.
    expect(after.wallet4).toBe(initial.wallet4 + transferAmount4);
    expect(after.wallet4).toBe(before.wallet4 + transferAmount4);
    // Smart wallet should have the initial funding minus the transfer amount.
    expect(after.smartWallet).toBe(
      initial.smartWallet +
        fundingAmount -
        (transferAmount1 + transferAmount2 + transferAmount3 + transferAmount4)
    );
    expect(after.smartWallet).toBe(
      before.smartWallet -
        (transferAmount1 + transferAmount2 + transferAmount3 + transferAmount4)
    );
  });

  it("sending sBTC to multiple recipients using transfer many extension correctly prints the events", () => {
    const fundingAmount = 100;
    const transferAmount1 = 10;
    const transferAmount2 = 20;
    const transferAmount3 = 30;
    const transferAmount4 = 40;
    const feesAmount = 1;

    // send sBTC tokens to smart wallet
    const sbtcTransfer = tx.callPublicFn(
      sbtcTokenContract,
      "transfer",
      [
        // (amount uint)
        Cl.uint(fundingAmount),
        // (sender principal)
        Cl.principal(deployer),
        // (recipient principal)
        Cl.principal(smartWallet),
        // (memo (optional (buff 34)))
        Cl.none(),
      ],
      deployer
    );
    const [{ result: fundingResult }] = simnet.mineBlock([sbtcTransfer]);
    expect(fundingResult).toBeOk(Cl.bool(true));

    const serializedPayload = Cl.serialize(
      Cl.tuple({
        fees: Cl.uint(feesAmount),
        recipients: Cl.list([
          // Transfer 1.
          Cl.tuple({
            amount: Cl.uint(transferAmount1),
            sender: Cl.principal(smartWallet),
            to: Cl.principal(wallet1),
            memo: Cl.none(),
          }),
          // Transfer 2.
          Cl.tuple({
            amount: Cl.uint(transferAmount2),
            sender: Cl.principal(smartWallet),
            to: Cl.principal(wallet2),
            memo: Cl.none(),
          }),
          // Transfer 3.
          Cl.tuple({
            amount: Cl.uint(transferAmount3),
            sender: Cl.principal(smartWallet),
            to: Cl.principal(wallet3),
            memo: Cl.none(),
          }),
          // Transfer 4.
          Cl.tuple({
            amount: Cl.uint(transferAmount4),
            sender: Cl.principal(smartWallet),
            to: Cl.principal(wallet4),
            memo: Cl.none(),
          }),
        ]),
      })
    );
    const { events: sbtcTransferManyEvents, result: sbtcTransferManyResult } =
      simnet.callPublicFn(
        smartWallet,
        "extension-call",
        [
          // (extension <extension-trait>)
          Cl.principal(sbtcTransferManyExtension),
          // (payload (buff 2048))
          Cl.bufferFromHex(serializedPayload),
        ],
        deployer
      );
    expect(sbtcTransferManyResult).toBeOk(Cl.bool(true));
    // ectMint, ectBurn, payload, and 4 sbtc transfer events.
    expect(sbtcTransferManyEvents.length).toBe(7);

    const [
      ectMintEvent,
      ectBurnEvent,
      payloadPrintEvent,
      sbtcTransferEvent1,
      sbtcTransferEvent2,
      sbtcTransferEvent3,
      sbtcTransferEvent4,
    ] = sbtcTransferManyEvents;
    expect(ectMintEvent).toEqual({
      data: {
        amount: "1",
        asset_identifier: `${smartWallet}::ect`,
        recipient: smartWallet,
      },
      event: "ft_mint_event",
    });
    expect(ectBurnEvent).toEqual({
      data: {
        amount: "1",
        asset_identifier: `${smartWallet}::ect`,
        sender: smartWallet,
      },
      event: "ft_burn_event",
    });
    const payloadData = cvToValue<{
      a: string;
      payload: { extension: string; payload: string };
    }>(payloadPrintEvent.data.value);
    expect(payloadData).toEqual({
      a: "extension-call",
      payload: {
        extension: sbtcTransferManyExtension,
        payload: Uint8Array.from(Buffer.from(serializedPayload, "hex")),
      },
    });
    expect(sbtcTransferEvent1).toEqual({
      data: {
        amount: transferAmount1.toString(),
        sender: smartWallet,
        recipient: wallet1,
        asset_identifier: `${sbtcTokenContract}::sbtc-token`,
      },
      event: "ft_transfer_event",
    });
    expect(sbtcTransferEvent2).toEqual({
      data: {
        amount: transferAmount2.toString(),
        sender: smartWallet,
        recipient: wallet2,
        asset_identifier: `${sbtcTokenContract}::sbtc-token`,
      },
      event: "ft_transfer_event",
    });
    expect(sbtcTransferEvent3).toEqual({
      data: {
        amount: transferAmount3.toString(),
        sender: smartWallet,
        recipient: wallet3,
        asset_identifier: `${sbtcTokenContract}::sbtc-token`,
      },
      event: "ft_transfer_event",
    });
    expect(sbtcTransferEvent4).toEqual({
      data: {
        amount: transferAmount4.toString(),
        sender: smartWallet,
        recipient: wallet4,
        asset_identifier: `${sbtcTokenContract}::sbtc-token`,
      },
      event: "ft_transfer_event",
    });
  });
});
