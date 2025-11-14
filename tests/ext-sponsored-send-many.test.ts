import { Cl } from "@stacks/transactions";
import { describe, expect, it } from "vitest";
import {
  accounts,
  contracts,
  deployments,
} from "../clarigen/src/clarigen-types";
import { getStxBalance } from "./testUtils";
import { cvToValue } from "@clarigen/core";

const deployer = accounts.deployer.address;
const wallet1 = accounts.wallet_1.address;
const wallet2 = accounts.wallet_2.address;
const wallet3 = accounts.wallet_3.address;
const wallet4 = accounts.wallet_4.address;

const smartWallet = deployments.smartWalletStandard.simnet;
const stxSendManyExtension = deployments.extSponsoredSendMany.simnet;

describe("Sponsored STX Send Many Extension Sender Auth", () => {
  it("non-owner cannot call the STX send-many extension", () => {
    const transferAmount = 50;
    // this amount will be ignored, the tx is not sponsored
    const feesAmount = 1;
    // send STX to smart wallet
    const { result: fundingResult } = simnet.transferSTX(
      transferAmount,
      smartWallet,
      wallet1
    );
    expect(fundingResult).toBeOk(Cl.bool(true));

    const { result: stxSendManyResult } = simnet.callPublicFn(
      smartWallet,
      "extension-call",
      [
        // (extension <extension-trait>)
        Cl.principal(stxSendManyExtension),
        // (payload (buff 2048))
        Cl.bufferFromHex(
          Cl.serialize(
            Cl.tuple({
              fees: Cl.uint(feesAmount),
              recipients: Cl.list([
                Cl.tuple({
                  ustx: Cl.uint(transferAmount),
                  to: Cl.principal(wallet2),
                }),
              ]),
            })
          )
        ),
        // (sig-auth (optional ...))
        Cl.none(),
      ],
      wallet1
    );
    expect(stxSendManyResult).toBeErr(
      Cl.uint(contracts.smartWalletStandard.constants.errUnauthorised.value)
    );
  });

  it("sending STX to one recipient using transfer many extension correctly updates balances", () => {
    // wallet1 funds the smart wallet with 100 STX.
    // deployer uses the smart wallet to send 50 STX to wallet2.
    const fundingAmount = 100;
    const transferAmount = 50;
    const feesAmount = 1;

    const initial = {
      deployer: getStxBalance(simnet, deployer),
      wallet1: getStxBalance(simnet, wallet1),
      wallet2: getStxBalance(simnet, wallet2),
      smartWallet: getStxBalance(simnet, smartWallet),
    };

    // send STX to smart wallet
    const { result: fundingResult } = simnet.transferSTX(
      fundingAmount,
      smartWallet,
      wallet1
    );
    expect(fundingResult).toBeOk(Cl.bool(true));

    // Extract all the involved parties' initial STX balances.
    const before = {
      deployer: getStxBalance(simnet, deployer),
      wallet1: getStxBalance(simnet, wallet1),
      wallet2: getStxBalance(simnet, wallet2),
      smartWallet: getStxBalance(simnet, smartWallet),
    };

    const { result: stxSendManyResult } = simnet.callPublicFn(
      smartWallet,
      "extension-call",
      [
        // (extension <extension-trait>)
        Cl.principal(stxSendManyExtension),
        // (payload (buff 2048))
        Cl.bufferFromHex(
          Cl.serialize(
            Cl.tuple({
              fees: Cl.uint(feesAmount),
              recipients: Cl.list([
                Cl.tuple({
                  ustx: Cl.uint(transferAmount),
                  to: Cl.principal(wallet2),
                }),
              ]),
            })
          )
        ),
        // (sig-auth (optional ...))
        Cl.none(),
      ],
      deployer
    );
    expect(stxSendManyResult).toBeOk(Cl.bool(true));

    const after = {
      deployer: getStxBalance(simnet, deployer),
      wallet1: getStxBalance(simnet, wallet1),
      wallet2: getStxBalance(simnet, wallet2),
      smartWallet: getStxBalance(simnet, smartWallet),
    };

    // Deployer should be unchanged.
    expect(after.deployer).toBe(initial.deployer);
    expect(after.deployer).toBe(before.deployer);
    // Wallet 1 should be unchanged. The only transfer wallet1 made was the
    // initial funding to the smart wallet.
    expect(after.wallet1).toBe(initial.wallet1 - fundingAmount);
    expect(after.wallet1).toBe(before.wallet1);
    // Wallet 2 should have received 50 STX.
    expect(after.wallet2).toBe(initial.wallet2 + transferAmount);
    expect(after.wallet2).toBe(before.wallet2 + transferAmount);
    // Smart wallet should have the initial funding minus the transfer amount.
    expect(after.smartWallet).toBe(
      initial.smartWallet + fundingAmount - transferAmount
    );
    expect(after.smartWallet).toBe(before.smartWallet - 50);
  });

  it("sending STX to one recipient using transfer many extension correctly prints the events", () => {
    const fundingAmount = 100;
    const transferAmount = 50;
    const feesAmount = 1;

    // send STX tokens to smart wallet
    const { result: fundingResult } = simnet.transferSTX(
      fundingAmount,
      smartWallet,
      wallet1
    );
    expect(fundingResult).toBeOk(Cl.bool(true));

    const serializedPayload = Cl.serialize(
      Cl.tuple({
        fees: Cl.uint(feesAmount),
        recipients: Cl.list([
          Cl.tuple({
            ustx: Cl.uint(transferAmount),
            to: Cl.principal(wallet2),
          }),
        ]),
      })
    );
    const { events: stxSendManyEvents, result: stxSendManyResult } =
      simnet.callPublicFn(
        smartWallet,
        "extension-call",
        [
          // (extension <extension-trait>)
          Cl.principal(stxSendManyExtension),
          // (payload (buff 2048))
          Cl.bufferFromHex(serializedPayload),
          // (sig-auth (optional ...))
          Cl.none(),
        ],
        deployer
      );
    expect(stxSendManyResult).toBeOk(Cl.bool(true));
    // ectMint, ectBurn, payload, and STX transfer event.
    expect(stxSendManyEvents.length).toBe(4);

    const [ectMintEvent, ectBurnEvent, payloadPrintEvent, stxTransferEvent] =
      stxSendManyEvents;
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
        extension: stxSendManyExtension,
        payload: Uint8Array.from(Buffer.from(serializedPayload, "hex")),
      },
    });
    expect(stxTransferEvent).toEqual({
      data: {
        amount: transferAmount.toString(),
        sender: smartWallet,
        recipient: wallet2,
        memo: "",
      },
      event: "stx_transfer_event",
    });
  });

  it("sending STX to multiple recipients using send many extension correctly updates balances", () => {
    const fundingAmount = 100;
    const transferAmount1 = 10;
    const transferAmount2 = 20;
    const transferAmount3 = 30;
    const transferAmount4 = 40;
    const feesAmount = 1;

    const initial = {
      deployer: getStxBalance(simnet, deployer),
      wallet1: getStxBalance(simnet, wallet1),
      wallet2: getStxBalance(simnet, wallet2),
      wallet3: getStxBalance(simnet, wallet3),
      wallet4: getStxBalance(simnet, wallet4),
      smartWallet: getStxBalance(simnet, smartWallet),
    };

    // send STX to smart wallet
    const { result: fundingResult } = simnet.transferSTX(
      fundingAmount,
      smartWallet,
      deployer
    );
    expect(fundingResult).toBeOk(Cl.bool(true));

    // Extract all the involved parties' initial STX balances.
    const before = {
      deployer: getStxBalance(simnet, deployer),
      wallet1: getStxBalance(simnet, wallet1),
      wallet2: getStxBalance(simnet, wallet2),
      wallet3: getStxBalance(simnet, wallet3),
      wallet4: getStxBalance(simnet, wallet4),
      smartWallet: getStxBalance(simnet, smartWallet),
    };

    const { result: stxSendManyResult } = simnet.callPublicFn(
      smartWallet,
      "extension-call",
      [
        // (extension <extension-trait>)
        Cl.principal(stxSendManyExtension),
        // (payload (buff 2048))
        Cl.bufferFromHex(
          Cl.serialize(
            Cl.tuple({
              fees: Cl.uint(feesAmount),
              recipients: Cl.list([
                // Transfer 1.
                Cl.tuple({
                  ustx: Cl.uint(transferAmount1),
                  to: Cl.principal(wallet1),
                }),
                // Transfer 2.
                Cl.tuple({
                  ustx: Cl.uint(transferAmount2),
                  to: Cl.principal(wallet2),
                }),
                // Transfer 3.
                Cl.tuple({
                  ustx: Cl.uint(transferAmount3),
                  to: Cl.principal(wallet3),
                }),
                // Transfer 4.
                Cl.tuple({
                  ustx: Cl.uint(transferAmount4),
                  to: Cl.principal(wallet4),
                }),
              ]),
            })
          )
        ),
        // (sig-auth (optional ...))
        Cl.none(),
      ],
      deployer
    );
    expect(stxSendManyResult).toBeOk(Cl.bool(true));

    const after = {
      deployer: getStxBalance(simnet, deployer),
      wallet1: getStxBalance(simnet, wallet1),
      wallet2: getStxBalance(simnet, wallet2),
      wallet3: getStxBalance(simnet, wallet3),
      wallet4: getStxBalance(simnet, wallet4),
      smartWallet: getStxBalance(simnet, smartWallet),
    };

    // Deployer should have less than initial, unchanged from before the
    // extension call.
    expect(after.deployer).toBe(initial.deployer - fundingAmount);
    expect(after.deployer).toBe(before.deployer);
    // Wallet 1 should have received transferAmount1 STX.
    expect(after.wallet1).toBe(initial.wallet1 + transferAmount1);
    expect(after.wallet1).toBe(before.wallet1 + transferAmount1);
    // Wallet 2 should have received transferAmount2 STX.
    expect(after.wallet2).toBe(initial.wallet2 + transferAmount2);
    expect(after.wallet2).toBe(before.wallet2 + transferAmount2);
    // Wallet 3 should have received transferAmount3 STX.
    expect(after.wallet3).toBe(initial.wallet3 + transferAmount3);
    expect(after.wallet3).toBe(before.wallet3 + transferAmount3);
    // Wallet 4 should have received transferAmount4 STX.
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

  it("sending STX to multiple recipients using transfer many extension correctly prints the events", () => {
    const fundingAmount = 100;
    const transferAmount1 = 10;
    const transferAmount2 = 20;
    const transferAmount3 = 30;
    const transferAmount4 = 40;
    const feesAmount = 1;

    // send STX to smart wallet
    const { result: fundingResult } = simnet.transferSTX(
      fundingAmount,
      smartWallet,
      deployer
    );
    expect(fundingResult).toBeOk(Cl.bool(true));

    const serializedPayload = Cl.serialize(
      Cl.tuple({
        fees: Cl.uint(feesAmount),
        recipients: Cl.list([
          // Transfer 1.
          Cl.tuple({
            ustx: Cl.uint(transferAmount1),
            to: Cl.principal(wallet1),
          }),
          // Transfer 2.
          Cl.tuple({
            ustx: Cl.uint(transferAmount2),
            to: Cl.principal(wallet2),
          }),
          // Transfer 3.
          Cl.tuple({
            ustx: Cl.uint(transferAmount3),
            to: Cl.principal(wallet3),
          }),
          // Transfer 4.
          Cl.tuple({
            ustx: Cl.uint(transferAmount4),
            to: Cl.principal(wallet4),
          }),
        ]),
      })
    );
    const { events: stxSendManyEvents, result: stxSendManyResult } =
      simnet.callPublicFn(
        smartWallet,
        "extension-call",
        [
          // (extension <extension-trait>)
          Cl.principal(stxSendManyExtension),
          // (payload (buff 2048))
          Cl.bufferFromHex(serializedPayload),
          // (sig-auth (optional ...))
          Cl.none(),
        ],
        deployer
      );
    expect(stxSendManyResult).toBeOk(Cl.bool(true));
    // ectMint, ectBurn, payload, and 4 STX transfer events.
    expect(stxSendManyEvents.length).toBe(7);

    const [
      ectMintEvent,
      ectBurnEvent,
      payloadPrintEvent,
      stxTransferEvent1,
      stxTransferEvent2,
      stxTransferEvent3,
      ostxTransferEvent4,
    ] = stxSendManyEvents;
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
        extension: stxSendManyExtension,
        payload: Uint8Array.from(Buffer.from(serializedPayload, "hex")),
      },
    });
    expect(stxTransferEvent1).toEqual({
      data: {
        amount: transferAmount1.toString(),
        sender: smartWallet,
        recipient: wallet1,
        memo: "",
      },
      event: "stx_transfer_event",
    });
    expect(stxTransferEvent2).toEqual({
      data: {
        amount: transferAmount2.toString(),
        sender: smartWallet,
        recipient: wallet2,
        memo: "",
      },
      event: "stx_transfer_event",
    });
    expect(stxTransferEvent3).toEqual({
      data: {
        amount: transferAmount3.toString(),
        sender: smartWallet,
        recipient: wallet3,
        memo: "",
      },
      event: "stx_transfer_event",
    });
    expect(ostxTransferEvent4).toEqual({
      data: {
        amount: transferAmount4.toString(),
        sender: smartWallet,
        recipient: wallet4,
        memo: "",
      },
      event: "stx_transfer_event",
    });
  });

  it("sending STX to N recipients using transfer many extension correctly updates balances", () => {
    // more than the maximum allowed in the smart wallet endpoint (currently 10
    // due to Clarity capping the serialization-deserialization of the payload)
    const N = 38; // 38 is the maximum number of standard principal recipients.
    const transferAmount = 10;
    const feesAmount = 1;
    const fundingAmount = transferAmount * N;

    const initial = {
      deployer: getStxBalance(simnet, deployer),
      wallet1: getStxBalance(simnet, wallet1),
      smartWallet: getStxBalance(simnet, smartWallet),
    };

    // Fund the smart wallet with STX.
    const { result: fundingResult } = simnet.transferSTX(
      fundingAmount,
      smartWallet,
      deployer
    );
    expect(fundingResult).toBeOk(Cl.bool(true));

    // Extract all the involved parties' initial STX balances.
    const before = {
      deployer: getStxBalance(simnet, deployer),
      wallet1: getStxBalance(simnet, wallet1),
      smartWallet: getStxBalance(simnet, smartWallet),
    };

    // Create a list of all the recipients, each with the transfer amount.
    const serializedPayload = Cl.serialize(
      Cl.tuple({
        fees: Cl.uint(feesAmount),
        recipients: Cl.list(
          Array.from({ length: N }, () =>
            Cl.tuple({
              ustx: Cl.uint(transferAmount),
              to: Cl.principal(wallet1),
            })
          )
        ),
      })
    );
    const { result: stxSendManyResult } = simnet.callPublicFn(
      smartWallet,
      "extension-call",
      [
        // (extension <extension-trait>)
        Cl.principal(stxSendManyExtension),
        // (payload (buff 2048))
        Cl.bufferFromHex(serializedPayload),
        // (sig-auth (optional ...))
        Cl.none(),
      ],
      deployer
    );
    expect(stxSendManyResult).toBeOk(Cl.bool(true));

    const after = {
      deployer: getStxBalance(simnet, deployer),
      wallet1: getStxBalance(simnet, wallet1),
      smartWallet: getStxBalance(simnet, smartWallet),
    };

    // Deployer should have less than initial, unchanged from before the
    // extension call.
    expect(after.deployer).toBe(initial.deployer - fundingAmount);
    expect(after.deployer).toBe(before.deployer);
    // Wallet 1 should have received transferAmount * 12 STX.
    expect(after.wallet1).toBe(initial.wallet1 + transferAmount * N);
    expect(after.wallet1).toBe(before.wallet1 + transferAmount * N);
    // Smart wallet should have the initial funding minus the transfer amount.
    expect(after.smartWallet).toBe(
      initial.smartWallet + fundingAmount - transferAmount * N
    );
    expect(after.smartWallet).toBe(before.smartWallet - transferAmount * N);
  });
});
