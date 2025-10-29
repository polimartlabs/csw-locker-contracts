import { initSimnet, tx } from "@hirosystems/clarinet-sdk";
import { Cl, serializeCV } from "@stacks/transactions";
import { describe, expect, it } from "vitest";
import {
  accounts,
  contracts,
  deployments,
} from "../../clarigen/src/clarigen-types";
import fc from "fast-check";
import {
  addresses,
  btcAddresses,
  errorCodes,
  getStxBalance,
  getStxMemoPrintEvent,
  initAndSendWrappedBitcoin,
  transferSbtc,
} from "../testUtils";
import { cvToValue } from "@clarigen/core";
import { poxAddressToTuple } from "@stacks/stacking";

const deployer = accounts.deployer.address;

const smartWalletStandard = deployments.smartWalletStandard.simnet;
const extDelegateStxPox4 = deployments.extDelegateStxPox4.simnet;
const extSponsoredSbtcTransfer = deployments.extSponsoredSbtcTransfer.simnet;
const extSbtcTransferMany = deployments.extSponsoredSbtcTransferMany.simnet;
const extSbtcTransferManyNative =
  deployments.extSponsoredSbtcTransferManyNative.simnet;
const extSponsoredTransfer = deployments.extSponsoredTransfer.simnet;
const extSponsoredSendMany = deployments.extSponsoredSendMany.simnet;
const extUnsafeSip010Transfer = deployments.extUnsafeSip010Transfer.simnet;
const sbtcTokenContract = deployments.sbtcToken.simnet;
const wrappedBitcoinContract = deployments.wrappedBitcoin.simnet;
const nopeTokenContract = deployments.nope.simnet;

fc.configureGlobal({
  numRuns: 10,
});

describe("Smart Wallet Standard", () => {
  describe("STX Transfer", () => {
    it("non-owner cannot transfer STX from smart wallet", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            transferAmount: fc.integer({ min: 1 }),
            nonOwner: fc.constantFrom(
              ...addresses.filter((a) => a != deployer)
            ),
            depositor: fc.constantFrom(...addresses),
            recipient: fc.constantFrom(...addresses),
          }),
          async ({ depositor, nonOwner, recipient, transferAmount }) => {
            const simnet = await initSimnet();

            const stxTransfer = tx.transferSTX(
              transferAmount,
              smartWalletStandard,
              depositor
            );
            simnet.mineBlock([stxTransfer]);

            const { result: transferResult } = simnet.callPublicFn(
              smartWalletStandard,
              "stx-transfer",
              [Cl.uint(transferAmount), Cl.principal(recipient), Cl.none()],
              nonOwner
            );
            expect(transferResult).toBeErr(
              Cl.uint(
                contracts.smartWalletStandard.constants.errUnauthorised.value
              )
            );
          }
        )
      );
    });

    it("transfer from underfunded smart wallet always fails and balances are unchanged", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc
            .record({
              transferAmount: fc.integer({ min: 2 }),
              owner: fc.constant(deployer),
              depositor: fc.constantFrom(...addresses),
              recipient: fc.constantFrom(...addresses),
            })
            .chain(({ depositor, owner, recipient, transferAmount }) =>
              fc
                .record({
                  underfundedAmount: fc.integer({
                    min: 1,
                    max: transferAmount - 1,
                  }),
                })
                .map(({ underfundedAmount }) => ({
                  depositor,
                  owner,
                  recipient,
                  transferAmount,
                  underfundedAmount,
                }))
            ),
          async ({
            depositor,
            owner,
            recipient,
            transferAmount,
            underfundedAmount,
          }) => {
            const simnet = await initSimnet();

            const smartWalletFunds = transferAmount - underfundedAmount;
            const stxTransfer = tx.transferSTX(
              smartWalletFunds,
              smartWalletStandard,
              depositor
            );
            simnet.mineBlock([stxTransfer]);

            const before = {
              wallet: getStxBalance(simnet, smartWalletStandard),
              recipient: getStxBalance(simnet, recipient),
              owner: getStxBalance(simnet, owner),
            };

            const { result: transferResult } = simnet.callPublicFn(
              smartWalletStandard,
              "stx-transfer",
              [Cl.uint(transferAmount), Cl.principal(recipient), Cl.none()],
              owner
            );
            expect(transferResult).toBeErr(
              Cl.uint(errorCodes.general.NOT_ENOUGH_BALANCE)
            );

            const after = {
              wallet: getStxBalance(simnet, smartWalletStandard),
              recipient: getStxBalance(simnet, recipient),
              owner: getStxBalance(simnet, owner),
            };
            expect(after.wallet).toBe(before.wallet);
            expect(after.recipient).toBe(before.recipient);
            expect(after.owner).toBe(before.owner);
          }
        )
      );
    });

    it("owner can transfer STX from overfunded smart wallet to standard recipient and balances are updated correctly", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc
            .record({
              transferAmount: fc.integer({ min: 1 }),
              overfundedAmount: fc.integer({ min: 1 }),
              owner: fc.constant(deployer),
              depositor: fc.constantFrom(...addresses),
              recipient: fc.constantFrom(...addresses),
            })
            .filter(
              ({ depositor, recipient, owner }) =>
                depositor !== recipient &&
                depositor !== owner &&
                recipient !== owner
            ),
          async ({
            transferAmount,
            overfundedAmount,
            owner,
            depositor,
            recipient,
          }) => {
            const simnet = await initSimnet();

            const before = {
              recipient: getStxBalance(simnet, recipient),
              owner: getStxBalance(simnet, owner),
              depositor: getStxBalance(simnet, depositor),
              wallet: getStxBalance(simnet, smartWalletStandard),
            };
            const smartWalletFunds = transferAmount + overfundedAmount;

            const stxTransfer = tx.transferSTX(
              smartWalletFunds,
              smartWalletStandard,
              depositor
            );
            simnet.mineBlock([stxTransfer]);

            const { result: transferResponse } = simnet.callPublicFn(
              smartWalletStandard,
              "stx-transfer",
              [Cl.uint(transferAmount), Cl.principal(recipient), Cl.none()],
              owner
            );
            expect(transferResponse).toBeOk(Cl.bool(true));

            const after = {
              recipient: getStxBalance(simnet, recipient),
              owner: getStxBalance(simnet, owner),
              depositor: getStxBalance(simnet, depositor),
              wallet: getStxBalance(simnet, smartWalletStandard),
            };

            // Recipient should have received exactly the transfer amount
            expect(after.recipient).toBe(before.recipient + transferAmount);
            // Owner funds should be untouched
            expect(after.owner).toBe(before.owner);
            // Depositor should have spent exactly the funds sent to the wallet
            expect(after.depositor).toBe(before.depositor - smartWalletFunds);
            // Wallet should have spent exactly the overfunded amount
            expect(after.wallet).toBe(overfundedAmount);
          }
        )
      );
    });

    it("owner can transfer STX from fully funded smart wallet to standard recipient and balances are updated correctly", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc
            .record({
              transferAmount: fc.integer({ min: 1 }),
              owner: fc.constant(deployer),
              depositor: fc.constantFrom(...addresses),
              recipient: fc.constantFrom(...addresses),
            })
            .filter(
              ({ depositor, recipient, owner }) =>
                depositor !== recipient &&
                depositor !== owner &&
                recipient !== owner
            ),
          async ({ depositor, owner, recipient, transferAmount }) => {
            const simnet = await initSimnet();

            const recipientBalanceBefore = getStxBalance(simnet, recipient);
            const ownerBalanceBefore = getStxBalance(simnet, owner);
            const depositorBalanceBefore = getStxBalance(simnet, depositor);

            const stxTransfer = tx.transferSTX(
              transferAmount,
              smartWalletStandard,
              depositor
            );
            simnet.mineBlock([stxTransfer]);

            expect(getStxBalance(simnet, smartWalletStandard)).toBe(
              transferAmount
            );

            const { result: transferResponse } = simnet.callPublicFn(
              smartWalletStandard,
              "stx-transfer",
              [Cl.uint(transferAmount), Cl.principal(recipient), Cl.none()],
              owner
            );
            expect(transferResponse).toBeOk(Cl.bool(true));

            const recipientBalanceAfter = getStxBalance(simnet, recipient);
            const ownerBalanceAfter = getStxBalance(simnet, owner);
            const depositorBalanceAfter = getStxBalance(simnet, depositor);
            const smartWalletBalanceAfter = getStxBalance(
              simnet,
              smartWalletStandard
            );

            expect(recipientBalanceAfter).toBe(
              recipientBalanceBefore + transferAmount
            );
            expect(ownerBalanceAfter).toBe(ownerBalanceBefore);
            expect(depositorBalanceAfter).toBe(
              depositorBalanceBefore - transferAmount
            );
            expect(smartWalletBalanceAfter).toBe(0);
          }
        )
      );
    });

    it("transferring STX without a memo correctly prints the events", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            transferAmount: fc.integer({ min: 1 }),
            owner: fc.constant(deployer),
            depositor: fc.constantFrom(...addresses),
            recipient: fc.constantFrom(...addresses),
          }),
          async ({ transferAmount, owner, depositor, recipient }) => {
            const simnet = await initSimnet();
            const stxTransfer = tx.transferSTX(
              transferAmount,
              smartWalletStandard,
              depositor
            );
            simnet.mineBlock([stxTransfer]);

            const { events, result: transferResponse } = simnet.callPublicFn(
              smartWalletStandard,
              "stx-transfer",
              [Cl.uint(transferAmount), Cl.principal(recipient), Cl.none()],
              owner
            );
            expect(transferResponse).toBeOk(Cl.bool(true));
            expect(events.length).toBe(2);

            const [payloadEvent, stxTransferEvent] = events;
            const payloadData = cvToValue<{
              a: string;
              payload: { amount: string; recipient: string; memo: string };
            }>(payloadEvent.data.value);
            expect(payloadData).toEqual({
              a: "stx-transfer",
              payload: {
                amount: BigInt(transferAmount),
                recipient: recipient,
                memo: null,
              },
            });
            expect(stxTransferEvent).toEqual(
              getStxMemoPrintEvent(
                transferAmount,
                smartWalletStandard,
                recipient,
                ""
              )
            );
          }
        )
      );
    });

    it("transferring STX with a memo correctly prints the events", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            transferAmount: fc.integer({ min: 1 }),
            owner: fc.constant(deployer),
            depositor: fc.constantFrom(...addresses),
            recipient: fc.constantFrom(...addresses),
            memoString: fc.string({ minLength: 1 }),
          }),
          async ({
            transferAmount,
            owner,
            depositor,
            recipient,
            memoString: memoString,
          }) => {
            const simnet = await initSimnet();
            const stxTransfer = tx.transferSTX(
              transferAmount,
              smartWalletStandard,
              depositor
            );
            simnet.mineBlock([stxTransfer]);

            const { events, result: transferResponse } = simnet.callPublicFn(
              smartWalletStandard,
              "stx-transfer",
              [
                Cl.uint(transferAmount),
                Cl.principal(recipient),
                Cl.some(
                  Cl.bufferFromHex(serializeCV(Cl.stringAscii(memoString)))
                ),
              ],
              owner
            );
            expect(transferResponse).toBeOk(Cl.bool(true));
            expect(events.length).toBe(2);

            const [payloadPrintEvent, stxTransferEvent] = events;
            expect(payloadPrintEvent.data.raw_value.slice(2)).toEqual(
              serializeCV(
                Cl.tuple({
                  a: Cl.stringAscii("stx-transfer"),
                  payload: Cl.tuple({
                    amount: Cl.uint(transferAmount),
                    recipient: Cl.principal(recipient),
                    memo: Cl.some(
                      Cl.bufferFromHex(serializeCV(Cl.stringAscii(memoString)))
                    ),
                  }),
                })
              )
            );
            expect(stxTransferEvent).toEqual(
              getStxMemoPrintEvent(
                transferAmount,
                smartWalletStandard,
                recipient,
                memoString
              )
            );
          }
        )
      );
    });

    it("STX balance is conserved after multiple transfers", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc
            .record({
              owner: fc.constant(deployer),
              depositor: fc.constantFrom(...addresses),
              overfund: fc.integer({ min: 1 }),
              amounts: fc.array(fc.integer({ min: 1, max: 100_000 }), {
                minLength: 1,
                maxLength: 5,
              }),
            })
            .chain(({ owner, depositor, amounts, overfund }) => {
              const pool = addresses.filter(
                (a) => a !== owner && a !== depositor
              );
              return fc
                .subarray(pool, {
                  minLength: amounts.length,
                  maxLength: amounts.length,
                })
                .map((recipients) => ({
                  owner,
                  depositor,
                  recipients,
                  amounts,
                  overfund,
                }));
            }),
          async ({ owner, depositor, recipients, amounts, overfund }) => {
            const simnet = await initSimnet();
            const totalOutgoingAmount = amounts.reduce((a, b) => a + b, 0);
            simnet.mineBlock([
              tx.transferSTX(
                totalOutgoingAmount + overfund,
                smartWalletStandard,
                depositor
              ),
            ]);

            const beforeWallet = getStxBalance(simnet, smartWalletStandard);
            const beforeRecipients = recipients.map((r) =>
              getStxBalance(simnet, r)
            );

            for (let i = 0; i < recipients.length; i++) {
              const { result } = simnet.callPublicFn(
                smartWalletStandard,
                "stx-transfer",
                [Cl.uint(amounts[i]), Cl.principal(recipients[i]), Cl.none()],
                owner
              );
              expect(result).toBeOk(Cl.bool(true));
            }

            const afterWallet = getStxBalance(simnet, smartWalletStandard);
            const afterRecipients = recipients.map((r) =>
              getStxBalance(simnet, r)
            );
            const walletDecrease = beforeWallet - afterWallet;
            const recipientsIncrease = afterRecipients.reduce(
              (sum, current, idx) => sum + (current - beforeRecipients[idx]),
              0
            );
            expect(walletDecrease).toBe(recipientsIncrease);
            expect(afterWallet).toBe(overfund);
          }
        )
      );
    });

    it("ex-owner cannot transfer STX from smart wallet after transferring ownership", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            transferAmount: fc.integer({ min: 1 }),
            initialOwner: fc.constant(deployer),
            newAdmin: fc.constantFrom(
              ...addresses.filter((a) => a !== deployer)
            ),
          }),
          async ({ initialOwner, newAdmin, transferAmount }) => {
            const simnet = await initSimnet();

            const stxTransfer = tx.transferSTX(
              transferAmount,
              smartWalletStandard,
              initialOwner
            );
            simnet.mineBlock([stxTransfer]);

            const { result } = simnet.callPublicFn(
              smartWalletStandard,
              "transfer-wallet",
              [Cl.principal(newAdmin)],
              initialOwner
            );
            expect(result).toBeOk(Cl.bool(true));

            const fail = simnet.callPublicFn(
              smartWalletStandard,
              "stx-transfer",
              [Cl.uint(transferAmount), Cl.principal(newAdmin), Cl.none()],
              initialOwner
            ).result;
            expect(fail).toBeErr(
              Cl.uint(
                contracts.smartWalletStandard.constants.errUnauthorised.value
              )
            );
          }
        )
      );
    });
  });

  describe("Admin Management Flows", () => {
    it("postconditions are enforced on transfer-wallet", async () => {
      // The postconditions are enforced by asset movements. For this, on
      // transfer there will be an ect mint and burn of 1 token each. This test
      // checks if the mint and burn events are present and correct.
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            initialOwner: fc.constant(deployer),
            newAdmin: fc.constantFrom(
              ...addresses.filter((a) => a !== deployer)
            ),
          }),
          async ({ initialOwner, newAdmin }) => {
            const simnet = await initSimnet();

            const { events, result } = simnet.callPublicFn(
              smartWalletStandard,
              "transfer-wallet",
              [Cl.principal(newAdmin)],
              initialOwner
            );
            expect(result).toBeOk(Cl.bool(true));
            expect(events.length).toBe(3);

            const [ectMintEvent, ectBurnEvent, payloadPrintEvent] = events;
            expect(ectMintEvent).toEqual({
              data: {
                amount: "1",
                asset_identifier: `${smartWalletStandard}::ect`,
                recipient: smartWalletStandard,
              },
              event: "ft_mint_event",
            });
            expect(ectBurnEvent).toEqual({
              data: {
                amount: "1",
                asset_identifier: `${smartWalletStandard}::ect`,
                sender: smartWalletStandard,
              },
              event: "ft_burn_event",
            });
            const payloadData = cvToValue<{
              a: string;
              payload: { newAdmin: string };
            }>(payloadPrintEvent.data.value);
            expect(payloadData).toEqual({
              a: "transfer-wallet",
              payload: { newAdmin: newAdmin },
            });
          }
        )
      );
    });

    it("transferring wallet to self is forbidden", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            initialOwner: fc.constant(deployer),
            newOwner: fc.constantFrom(
              ...addresses.filter((a) => a !== deployer)
            ),
          }),
          async ({ initialOwner, newOwner }) => {
            const simnet = await initSimnet();

            // Transfer to new owner. The new owner will then attempt to
            // transfer to self, which should fail.
            const { result } = simnet.callPublicFn(
              smartWalletStandard,
              "transfer-wallet",
              [Cl.principal(newOwner)],
              initialOwner
            );
            expect(result).toBeOk(Cl.bool(true));

            // Now new owner tries to transfer to self.
            const { result: selfTransferResult } = simnet.callPublicFn(
              smartWalletStandard,
              "transfer-wallet",
              [Cl.principal(newOwner)],
              newOwner
            );
            expect(selfTransferResult).toBeErr(
              Cl.uint(
                contracts.smartWalletStandard.constants.errForbidden.value
              )
            );
          }
        )
      );
    });

    it("is-admin-calling returns correct value after multiple ownership transfers", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            initialOwner: fc.constant(deployer),
            newAdmins: fc.subarray(addresses.filter((a) => a !== deployer)),
          }),
          async ({ initialOwner, newAdmins }) => {
            const simnet = await initSimnet();

            let currentOwner: string = initialOwner;

            for (let newAdmin of newAdmins) {
              const { result } = simnet.callPublicFn(
                smartWalletStandard,
                "transfer-wallet",
                [Cl.principal(newAdmin)],
                currentOwner
              );
              expect(result).toBeOk(Cl.bool(true));

              const { result: exOwnerIsAdmin } = simnet.callReadOnlyFn(
                smartWalletStandard,
                "is-admin-calling",
                [],
                currentOwner
              );
              expect(exOwnerIsAdmin).toBeErr(
                Cl.uint(
                  contracts.smartWalletStandard.constants.errUnauthorised.value
                )
              );

              const { result: newOwnerIsAdmin } = simnet.callReadOnlyFn(
                smartWalletStandard,
                "is-admin-calling",
                [],
                newAdmin
              );
              expect(newOwnerIsAdmin).toBeOk(Cl.bool(true));

              currentOwner = newAdmin;
            }
          }
        )
      );
    });

    it("transferring ownership multiple times correctly updates admins map", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            initialOwner: fc.constant(deployer),
            newAdmins: fc.subarray(addresses.filter((a) => a !== deployer)),
          }),
          async ({ initialOwner, newAdmins }) => {
            const simnet = await initSimnet();

            let currentOwner: string = initialOwner;

            for (let newAdmin of newAdmins) {
              const { result } = simnet.callPublicFn(
                smartWalletStandard,
                "transfer-wallet",
                [Cl.principal(newAdmin)],
                currentOwner
              );
              expect(result).toBeOk(Cl.bool(true));

              const exOwnerAdminEntry = simnet.getMapEntry(
                smartWalletStandard,
                "admins",
                Cl.principal(currentOwner)
              );
              expect(exOwnerAdminEntry).toBeNone();

              const newOwnerAdminEntry = simnet.getMapEntry(
                smartWalletStandard,
                "admins",
                Cl.principal(newAdmin)
              );
              expect(newOwnerAdminEntry).toBeSome(Cl.bool(true));

              const smartWalleetAdminEntry = simnet.getMapEntry(
                smartWalletStandard,
                "admins",
                Cl.principal(smartWalletStandard)
              );
              expect(smartWalleetAdminEntry).toBeSome(Cl.bool(true));

              currentOwner = newAdmin;
            }
          }
        )
      );
    });
  });

  describe("Extension Call", () => {
    describe("ext-delegate-stx-pox-4", () => {
      it("non-owner cannot delegate using smart wallet", async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.record({
              delegationAmount: fc.integer({ min: 1 }),
              nonOwner: fc.constantFrom(
                ...addresses.filter((a) => a != deployer)
              ),
              depositor: fc.constantFrom(...addresses),
              operator: fc.constantFrom(...addresses),
            }),
            async ({
              delegationAmount,
              nonOwner: nonOwner,
              depositor,
              operator,
            }) => {
              const simnet = await initSimnet();

              const stxTransfer = tx.transferSTX(
                delegationAmount,
                smartWalletStandard,
                depositor
              );
              simnet.mineBlock([stxTransfer]);

              const { result: delegateStxResult } = simnet.callPublicFn(
                smartWalletStandard,
                "extension-call",
                [
                  Cl.principal(extDelegateStxPox4),
                  Cl.bufferFromHex(
                    serializeCV(
                      Cl.tuple({
                        action: Cl.stringAscii("delegate"),
                        "amount-ustx": Cl.uint(delegationAmount),
                        "delegate-to": Cl.principal(operator),
                        "until-burn-ht": Cl.none(),
                        "pox-addr": Cl.none(),
                      })
                    )
                  ),
                ],
                nonOwner
              );
              expect(delegateStxResult).toBeErr(
                Cl.uint(
                  contracts.smartWalletStandard.constants.errUnauthorised.value
                )
              );
            }
          )
        );
      });

      it("owner can delegate using smart wallet and the events are printed correctly until-burn-ht and pox-addr specified", async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.record({
              delegationAmount: fc.integer({ min: 1 }),
              owner: fc.constant(deployer),
              depositor: fc.constantFrom(...addresses),
              operator: fc.constantFrom(...addresses),
              untilBurnHt: fc.nat(),
              poxAddress: fc.constantFrom(...btcAddresses),
            }),
            async ({
              delegationAmount,
              owner,
              depositor,
              operator,
              untilBurnHt,
              poxAddress,
            }) => {
              const simnet = await initSimnet();

              const stxTransfer = tx.transferSTX(
                delegationAmount,
                smartWalletStandard,
                depositor
              );
              simnet.mineBlock([stxTransfer]);

              const serializedPayload = serializeCV(
                Cl.tuple({
                  action: Cl.stringAscii("delegate"),
                  "amount-ustx": Cl.uint(delegationAmount),
                  "delegate-to": Cl.principal(operator),
                  "until-burn-ht": Cl.some(Cl.uint(untilBurnHt)),
                  "pox-addr": Cl.some(poxAddressToTuple(poxAddress)),
                })
              );

              const { events: delegateStxEvents, result: delegateStxResult } =
                simnet.callPublicFn(
                  smartWalletStandard,
                  "extension-call",
                  [
                    Cl.principal(extDelegateStxPox4),
                    Cl.bufferFromHex(serializedPayload),
                  ],
                  owner
                );
              expect(delegateStxResult).toBeOk(Cl.bool(true));
              expect(delegateStxEvents.length).toBe(4);

              const [
                ectMintEvent,
                ectBurnEvent,
                payloadPrintEvent,
                stxTransferEvent,
              ] = delegateStxEvents;
              expect(ectMintEvent).toEqual({
                data: {
                  amount: "1",
                  asset_identifier: `${smartWalletStandard}::ect`,
                  recipient: smartWalletStandard,
                },
                event: "ft_mint_event",
              });
              expect(ectBurnEvent).toEqual({
                data: {
                  amount: "1",
                  asset_identifier: `${smartWalletStandard}::ect`,
                  sender: smartWalletStandard,
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
                  extension: extDelegateStxPox4,
                  payload: Uint8Array.from(
                    Buffer.from(serializedPayload, "hex")
                  ),
                },
              });
              expect(stxTransferEvent).toEqual({
                data: {
                  amount: delegationAmount.toString(),
                  memo: "",
                  recipient: extDelegateStxPox4,
                  sender: smartWalletStandard,
                },
                event: "stx_transfer_event",
              });
            }
          )
        );
      });

      it("owner can delegate using smart wallet and the extension owns the funds", async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.record({
              delegationAmount: fc.integer({ min: 1 }),
              overfund: fc.integer({ min: 1 }),
              owner: fc.constant(deployer),
              depositor: fc.constantFrom(...addresses),
              operator: fc.constantFrom(...addresses),
            }),
            async ({
              delegationAmount,
              overfund,
              owner,
              depositor,
              operator,
            }) => {
              const simnet = await initSimnet();

              const smartWalletFunds = delegationAmount + overfund;
              const stxTransfer = tx.transferSTX(
                smartWalletFunds,
                smartWalletStandard,
                depositor
              );
              simnet.mineBlock([stxTransfer]);

              const serializedPayload = serializeCV(
                Cl.tuple({
                  action: Cl.stringAscii("delegate"),
                  "amount-ustx": Cl.uint(delegationAmount),
                  "delegate-to": Cl.principal(operator),
                  "until-burn-ht": Cl.none(),
                  "pox-addr": Cl.none(),
                })
              );

              const { result: delegateStxResult } = simnet.callPublicFn(
                smartWalletStandard,
                "extension-call",
                [
                  Cl.principal(extDelegateStxPox4),
                  Cl.bufferFromHex(serializedPayload),
                ],
                owner
              );
              expect(delegateStxResult).toBeOk(Cl.bool(true));

              const after = {
                w: getStxBalance(simnet, smartWalletStandard),
                e: getStxBalance(simnet, extDelegateStxPox4),
              };
              expect(after.w).toBe(overfund);
              expect(after.e).toBe(delegationAmount);
            }
          )
        );
      });

      it("owner can revoke an existing delegation and the events are printed correctly", async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.record({
              delegationAmount: fc.integer({ min: 1 }),
              owner: fc.constant(deployer),
              depositor: fc.constantFrom(...addresses),
              operator: fc.constantFrom(...addresses),
            }),
            async ({ delegationAmount, owner, depositor, operator }) => {
              const simnet = await initSimnet();

              const stxTransfer = tx.transferSTX(
                delegationAmount,
                smartWalletStandard,
                depositor
              );
              simnet.mineBlock([stxTransfer]);

              // Delegate first. The delegation will be revoked after.
              const { result: delegateStxResult } = simnet.callPublicFn(
                smartWalletStandard,
                "extension-call",
                [
                  Cl.principal(extDelegateStxPox4),
                  Cl.bufferFromHex(
                    serializeCV(
                      Cl.tuple({
                        action: Cl.stringAscii("delegate"),
                        "amount-ustx": Cl.uint(delegationAmount),
                        "delegate-to": Cl.principal(operator),
                        "until-burn-ht": Cl.none(),
                        "pox-addr": Cl.none(),
                      })
                    )
                  ),
                ],
                owner
              );
              expect(delegateStxResult).toBeOk(Cl.bool(true));

              const serializedRevokePayload = serializeCV(
                Cl.tuple({
                  action: Cl.stringAscii("revoke"),
                  // The following fields will be ignored. Must be specified
                  // in order for the serialization to work.
                  "amount-ustx": Cl.uint(0),
                  "delegate-to": Cl.principal(operator),
                  "until-burn-ht": Cl.none(),
                  "pox-addr": Cl.none(),
                })
              );
              const { events: revokeEvents, result: revokeResult } =
                simnet.callPublicFn(
                  smartWalletStandard,
                  "extension-call",
                  [
                    Cl.principal(extDelegateStxPox4),
                    Cl.bufferFromHex(serializedRevokePayload),
                  ],
                  owner
                );
              expect(revokeResult).toBeOk(Cl.bool(true));
              expect(revokeEvents.length).toBe(3);

              const [ectMintEvent, ectBurnEvent, payloadPrintEvent] =
                revokeEvents;
              expect(ectMintEvent).toEqual({
                data: {
                  amount: "1",
                  asset_identifier: `${smartWalletStandard}::ect`,
                  recipient: smartWalletStandard,
                },
                event: "ft_mint_event",
              });
              expect(ectBurnEvent).toEqual({
                data: {
                  amount: "1",
                  asset_identifier: `${smartWalletStandard}::ect`,
                  sender: smartWalletStandard,
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
                  extension: extDelegateStxPox4,
                  payload: Uint8Array.from(
                    Buffer.from(serializedRevokePayload, "hex")
                  ),
                },
              });
            }
          )
        );
      });

      it("owner can revoke an existing delegation and extension still owns the funds", async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.record({
              delegationAmount: fc.integer({ min: 1 }),
              owner: fc.constant(deployer),
              depositor: fc.constantFrom(...addresses),
              operator: fc.constantFrom(...addresses),
            }),
            async ({ delegationAmount, owner, depositor, operator }) => {
              const simnet = await initSimnet();

              const stxTransfer = tx.transferSTX(
                delegationAmount,
                smartWalletStandard,
                depositor
              );
              simnet.mineBlock([stxTransfer]);

              // Delegate first. The delegation will be revoked after.
              const { result: delegateStxResult } = simnet.callPublicFn(
                smartWalletStandard,
                "extension-call",
                [
                  Cl.principal(extDelegateStxPox4),
                  Cl.bufferFromHex(
                    serializeCV(
                      Cl.tuple({
                        action: Cl.stringAscii("delegate"),
                        "amount-ustx": Cl.uint(delegationAmount),
                        "delegate-to": Cl.principal(operator),
                        "until-burn-ht": Cl.none(),
                        "pox-addr": Cl.none(),
                      })
                    )
                  ),
                ],
                owner
              );
              expect(delegateStxResult).toBeOk(Cl.bool(true));

              const serializedRevokePayload = serializeCV(
                Cl.tuple({
                  action: Cl.stringAscii("revoke"),
                  // The following fields will be ignored. Must be specified
                  // in order for the serialization to work.
                  "amount-ustx": Cl.uint(0),
                  "delegate-to": Cl.principal(operator),
                  "until-burn-ht": Cl.none(),
                  "pox-addr": Cl.none(),
                })
              );
              const { result: revokeResult } = simnet.callPublicFn(
                smartWalletStandard,
                "extension-call",
                [
                  Cl.principal(extDelegateStxPox4),
                  Cl.bufferFromHex(serializedRevokePayload),
                ],
                owner
              );
              expect(revokeResult).toBeOk(Cl.bool(true));

              const after = {
                w: getStxBalance(simnet, smartWalletStandard),
                e: getStxBalance(simnet, extDelegateStxPox4),
              };
              expect(after.w).toBe(0);
              expect(after.e).toBe(delegationAmount);
            }
          )
        );
      });

      it("non-owner cannot revoke an existing delegation", async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.record({
              delegationAmount: fc.integer({ min: 1 }),
              owner: fc.constant(deployer),
              nonOwner: fc.constantFrom(
                ...addresses.filter((a) => a != deployer)
              ),
              depositor: fc.constantFrom(...addresses),
              operator: fc.constantFrom(...addresses),
            }),
            async ({
              delegationAmount,
              owner,
              nonOwner,
              depositor,
              operator,
            }) => {
              const simnet = await initSimnet();

              const stxTransfer = tx.transferSTX(
                delegationAmount,
                smartWalletStandard,
                depositor
              );
              simnet.mineBlock([stxTransfer]);

              // Delegate first. The delegation will be revoked after.
              const { result: delegateStxResult } = simnet.callPublicFn(
                smartWalletStandard,
                "extension-call",
                [
                  Cl.principal(extDelegateStxPox4),
                  Cl.bufferFromHex(
                    serializeCV(
                      Cl.tuple({
                        action: Cl.stringAscii("delegate"),
                        "amount-ustx": Cl.uint(delegationAmount),
                        "delegate-to": Cl.principal(operator),
                        "until-burn-ht": Cl.none(),
                        "pox-addr": Cl.none(),
                      })
                    )
                  ),
                ],
                owner
              );
              expect(delegateStxResult).toBeOk(Cl.bool(true));

              const { result: revokeResult } = simnet.callPublicFn(
                smartWalletStandard,
                "extension-call",
                [
                  Cl.principal(extDelegateStxPox4),
                  Cl.bufferFromHex(
                    serializeCV(
                      Cl.tuple({
                        action: Cl.stringAscii("revoke"),
                        // The following fields will be ignored. Must be specified
                        // in order for the serialization to work.
                        "amount-ustx": Cl.uint(0),
                        "delegate-to": Cl.principal(operator),
                        "until-burn-ht": Cl.none(),
                        "pox-addr": Cl.none(),
                      })
                    )
                  ),
                ],
                nonOwner
              );
              expect(revokeResult).toBeErr(
                Cl.uint(
                  contracts.smartWalletStandard.constants.errUnauthorised.value
                )
              );
            }
          )
        );
      });

      it("owner can reclaim STX from the delegate extension and the balances are updated correctly", async () => {
        await fc.assert(
          fc.asyncProperty(
            fc
              .record({
                reclaimActionString: fc.string(),
                delegationAmount: fc.integer({ min: 1 }),
                overfund: fc.integer({ min: 1 }),
                owner: fc.constant(deployer),
                depositor: fc.constantFrom(...addresses),
                operator: fc.constantFrom(...addresses),
              })
              .filter(({ reclaimActionString: reclaimString }) => {
                // Anything other than "delegate" or "revoke" should reclaim
                // the delegated STX.
                return (
                  reclaimString !== "delegate" && reclaimString !== "revoke"
                );
              }),
            async ({
              reclaimActionString,
              delegationAmount,
              overfund,
              owner,
              depositor,
              operator,
            }) => {
              const simnet = await initSimnet();

              const smartWalletFunds = delegationAmount + overfund;
              const stxTransfer = tx.transferSTX(
                smartWalletFunds,
                smartWalletStandard,
                depositor
              );
              simnet.mineBlock([stxTransfer]);

              // Delegate first. This sends the funds to the extension. The funds
              // will be reclaimed after.
              const { result: delegateStxResult } = simnet.callPublicFn(
                smartWalletStandard,
                "extension-call",
                [
                  Cl.principal(extDelegateStxPox4),
                  Cl.bufferFromHex(
                    serializeCV(
                      Cl.tuple({
                        action: Cl.stringAscii("delegate"),
                        "amount-ustx": Cl.uint(delegationAmount),
                        "delegate-to": Cl.principal(operator),
                        "until-burn-ht": Cl.none(),
                        "pox-addr": Cl.none(),
                      })
                    )
                  ),
                ],
                owner
              );
              expect(delegateStxResult).toBeOk(Cl.bool(true));

              const before = {
                w: getStxBalance(simnet, smartWalletStandard),
                e: getStxBalance(simnet, extDelegateStxPox4),
                o: getStxBalance(simnet, owner),
              };
              expect(before.w).toBe(overfund);
              expect(before.e).toBe(delegationAmount);

              // Reclaim the delegated STX from the extension. This sends the
              // STX back to the smart wallet.
              const { result: reclaimResult } = simnet.callPublicFn(
                smartWalletStandard,
                "extension-call",
                [
                  Cl.principal(extDelegateStxPox4),
                  Cl.bufferFromHex(
                    serializeCV(
                      Cl.tuple({
                        // Can be anything other than "delegate" or "revoke".
                        action: Cl.stringAscii(reclaimActionString),
                        // The following fields will be ignored. Must be specified
                        // in order for the serialization to work.
                        "amount-ustx": Cl.uint(0),
                        "delegate-to": Cl.principal(operator),
                        "until-burn-ht": Cl.none(),
                        "pox-addr": Cl.none(),
                      })
                    )
                  ),
                ],
                owner
              );
              expect(reclaimResult).toBeOk(Cl.bool(true));

              const after = {
                w: getStxBalance(simnet, smartWalletStandard),
                e: getStxBalance(simnet, extDelegateStxPox4),
                o: getStxBalance(simnet, owner),
              };
              expect(after.w).toBe(delegationAmount + overfund);
              expect(after.e).toBe(0);
              expect(after.o).toBe(before.o);
            }
          )
        );
      });
    });

    describe("ext-sponsored-sbtc-transfer", () => {
      it("non-owner cannot transfer sBTC using smart wallet", async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.record({
              // Not sponsored, so no fees to transfer to sponsor. Ensure
              // that transferAmount is within the depositor's sBTC balance.
              transferAmount: fc.integer({ min: 1, max: 1_000_000_000 }),
              // Can be any natural number since the fees won't be transferred
              // to anyone.
              fees: fc.nat(),
              nonOwner: fc.constantFrom(
                ...addresses.filter((a) => a != deployer)
              ),
              depositor: fc.constantFrom(...addresses),
              recipient: fc.constantFrom(...addresses),
            }),
            async ({
              transferAmount,
              nonOwner,
              depositor,
              recipient,
              fees,
            }) => {
              const simnet = await initSimnet();

              const sbtcTransfer = tx.callPublicFn(
                sbtcTokenContract,
                "transfer",
                [
                  Cl.uint(transferAmount),
                  Cl.principal(depositor),
                  Cl.principal(smartWalletStandard),
                  Cl.none(),
                ],
                depositor
              );
              const block = simnet.mineBlock([sbtcTransfer]);
              const [{ result: sbtcFundingResult }] = block;
              // Ensure the wallet funding was successful.
              expect(sbtcFundingResult).toBeOk(Cl.bool(true));

              const { result: sbtcTransferResult } = simnet.callPublicFn(
                smartWalletStandard,
                "extension-call",
                [
                  Cl.principal(extSponsoredSbtcTransfer),
                  Cl.bufferFromHex(
                    serializeCV(
                      Cl.tuple({
                        amount: Cl.uint(transferAmount),
                        to: Cl.principal(recipient),
                        fees: Cl.uint(fees),
                      })
                    )
                  ),
                ],
                nonOwner
              );
              expect(sbtcTransferResult).toBeErr(
                Cl.uint(
                  contracts.smartWalletStandard.constants.errUnauthorised.value
                )
              );
            }
          )
        );
      });

      it("owner can transfer sBTC using smart wallet and the events are printed correctly", async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.record({
              // Not sponsored, so no fees to transfer to sponsor. Ensure
              // that transferAmount is within the depositor's sBTC balance.
              transferAmount: fc.integer({ min: 1, max: 1_000_000_000 }),
              // Can be any natural number since the fees won't be transferred
              // to anyone.
              fees: fc.nat(),
              owner: fc.constant(deployer),
              depositor: fc.constantFrom(...addresses),
              recipient: fc.constantFrom(...addresses),
            }),
            async ({ transferAmount, fees, owner, depositor, recipient }) => {
              const simnet = await initSimnet();

              // send sBTC tokens to smart wallet
              const sbtcTransfer = tx.callPublicFn(
                sbtcTokenContract,
                "transfer",
                [
                  Cl.uint(transferAmount),
                  Cl.principal(depositor),
                  Cl.principal(smartWalletStandard),
                  Cl.none(),
                ],
                depositor
              );
              const block = simnet.mineBlock([sbtcTransfer]);
              const [{ result: sbtcFundingResult }] = block;
              // Ensure the wallet funding was successful.
              expect(sbtcFundingResult).toBeOk(Cl.bool(true));

              const sbtcBalance = simnet.callReadOnlyFn(
                sbtcTokenContract,
                "get-balance",
                [Cl.principal(smartWalletStandard)],
                deployer
              ).result;
              expect(sbtcBalance).toBeOk(Cl.uint(transferAmount));

              const { events: sbtcTransferEvents, result: sbtcTransferResult } =
                simnet.callPublicFn(
                  smartWalletStandard,
                  "extension-call",
                  [
                    Cl.principal(extSponsoredSbtcTransfer),
                    Cl.bufferFromHex(
                      serializeCV(
                        Cl.tuple({
                          amount: Cl.uint(transferAmount),
                          to: Cl.principal(recipient),
                          fees: Cl.uint(fees),
                        })
                      )
                    ),
                  ],
                  owner
                );

              expect(sbtcTransferResult).toBeOk(Cl.bool(true));
              // not sponsored tx: ect mint, ect burn, payload print, sbtc
              // transfer event
              expect(sbtcTransferEvents.length).toBe(4);

              const [
                ectMintEvent,
                ectBurnEvent,
                payloadPrintEvent,
                sbtcTransferEvent,
              ] = sbtcTransferEvents;
              expect(ectMintEvent).toEqual({
                data: {
                  amount: "1",
                  asset_identifier: `${smartWalletStandard}::ect`,
                  recipient: smartWalletStandard,
                },
                event: "ft_mint_event",
              });
              expect(ectBurnEvent).toEqual({
                data: {
                  amount: "1",
                  asset_identifier: `${smartWalletStandard}::ect`,
                  sender: smartWalletStandard,
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
                  extension: extSponsoredSbtcTransfer,
                  payload: Uint8Array.from(
                    Buffer.from(
                      serializeCV(
                        Cl.tuple({
                          amount: Cl.uint(transferAmount),
                          to: Cl.principal(recipient),
                          fees: Cl.uint(fees),
                        })
                      ),
                      "hex"
                    )
                  ),
                },
              });
              expect(sbtcTransferEvent).toEqual({
                data: {
                  asset_identifier: `${sbtcTokenContract}::sbtc-token`,
                  amount: transferAmount.toString(),
                  recipient: recipient,
                  sender: smartWalletStandard,
                },
                event: "ft_transfer_event",
              });
            }
          )
        );
      });
    });

    describe("ext-sponsored-sbtc-transfer-many", () => {
      it("owner can transfer sBTC to many recipients using smart wallet and the events are printed correctly", async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.record({
              feesAmount: fc.nat(),
              // Ensure total transfer amount is within the depositor's sBTC balance.
              transfers: fc.array(
                fc.record({
                  // The initial sBTC balance of each wallet is 1000, limit
                  // each transfer amount.
                  amount: fc.integer({ min: 1, max: 20 }),
                  recipient: fc.constantFrom(...addresses),
                }),
                { minLength: 1, maxLength: 41 }
              ),
              owner: fc.constant(deployer),
              depositor: fc.constantFrom(...addresses),
            }),
            async ({ feesAmount, transfers, owner, depositor }) => {
              const simnet = await initSimnet();

              const totalTransferAmount = transfers.reduce(
                (sum, t) => sum + t.amount,
                0
              );

              const { result: sbtcFundingResult } = transferSbtc(
                simnet,
                totalTransferAmount,
                depositor,
                smartWalletStandard
              );
              // Ensure the wallet funding was successful.
              expect(sbtcFundingResult).toBeOk(Cl.bool(true));

              const serializedPayload = serializeCV(
                Cl.tuple({
                  fees: Cl.uint(feesAmount),
                  recipients: Cl.list(
                    transfers.map((t) =>
                      Cl.tuple({
                        a: Cl.uint(t.amount),
                        r: Cl.principal(t.recipient),
                      })
                    )
                  ),
                })
              );

              const {
                events: sbtcTransferManyEvents,
                result: sbtcTransferManyResult,
              } = simnet.callPublicFn(
                smartWalletStandard,
                "extension-call",
                [
                  Cl.principal(extSbtcTransferMany),
                  Cl.bufferFromHex(serializedPayload),
                ],
                owner
              );
              expect(sbtcTransferManyResult).toBeOk(Cl.bool(true));
              // ect mint, ect burn, payload print, sbtc transfer events
              expect(sbtcTransferManyEvents.length).toBe(3 + transfers.length);

              const [ectMintEvent, ectBurnEvent, payloadPrintEvent] =
                sbtcTransferManyEvents;
              expect(ectMintEvent).toEqual({
                data: {
                  amount: "1",
                  asset_identifier: `${smartWalletStandard}::ect`,
                  recipient: smartWalletStandard,
                },
                event: "ft_mint_event",
              });
              expect(ectBurnEvent).toEqual({
                data: {
                  amount: "1",
                  asset_identifier: `${smartWalletStandard}::ect`,
                  sender: smartWalletStandard,
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
                  extension: extSbtcTransferMany,
                  payload: Uint8Array.from(
                    Buffer.from(serializedPayload, "hex")
                  ),
                },
              });

              transfers.forEach((t, index) => {
                const sbtcTransferEvent = sbtcTransferManyEvents[3 + index];
                expect(sbtcTransferEvent).toEqual({
                  data: {
                    asset_identifier: `${sbtcTokenContract}::sbtc-token`,
                    amount: t.amount.toString(),
                    recipient: t.recipient,
                    sender: smartWalletStandard,
                  },
                  event: "ft_transfer_event",
                });
              });
            }
          )
        );
      });
    });

    describe("ext-sponsored-sbtc-transfer-many-native", () => {
      it("owner can transfer sBTC to many recipients using smart wallet and the events are printed correctly", async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.record({
              feesAmount: fc.nat(),
              // Ensure total transfer amount is within the depositor's sBTC balance.
              transfers: fc.array(
                fc.record({
                  // The initial sBTC balance of each wallet is 1000, limit
                  // each transfer amount.
                  amount: fc.integer({ min: 1, max: 50 }),
                  recipient: fc.constantFrom(...addresses),
                }),
                { minLength: 1, maxLength: 5 }
              ),
              owner: fc.constant(deployer),
              depositor: fc.constantFrom(...addresses),
            }),
            async ({ feesAmount, transfers, owner, depositor }) => {
              const simnet = await initSimnet();

              const totalTransferAmount = transfers.reduce(
                (sum, t) => sum + t.amount,
                0
              );

              const { result: sbtcFundingResult } = transferSbtc(
                simnet,
                totalTransferAmount,
                depositor,
                smartWalletStandard
              );
              // Ensure the wallet funding was successful.
              expect(sbtcFundingResult).toBeOk(Cl.bool(true));

              const serializedPayload = serializeCV(
                Cl.tuple({
                  fees: Cl.uint(feesAmount),
                  recipients: Cl.list(
                    transfers.map((t) =>
                      Cl.tuple({
                        amount: Cl.uint(t.amount),
                        sender: Cl.principal(smartWalletStandard),
                        to: Cl.principal(t.recipient),
                        memo: Cl.none(),
                      })
                    )
                  ),
                })
              );

              const {
                events: sbtcTransferManyNativeEvents,
                result: sbtcTransferManyNativeResult,
              } = simnet.callPublicFn(
                smartWalletStandard,
                "extension-call",
                [
                  Cl.principal(extSbtcTransferManyNative),
                  Cl.bufferFromHex(serializedPayload),
                ],
                owner
              );
              expect(sbtcTransferManyNativeResult).toBeOk(Cl.bool(true));
              // ect mint, ect burn, payload print, sbtc transfer events
              expect(sbtcTransferManyNativeEvents.length).toBe(
                3 + transfers.length
              );

              const [ectMintEvent, ectBurnEvent, payloadPrintEvent] =
                sbtcTransferManyNativeEvents;
              expect(ectMintEvent).toEqual({
                data: {
                  amount: "1",
                  asset_identifier: `${smartWalletStandard}::ect`,
                  recipient: smartWalletStandard,
                },
                event: "ft_mint_event",
              });
              expect(ectBurnEvent).toEqual({
                data: {
                  amount: "1",
                  asset_identifier: `${smartWalletStandard}::ect`,
                  sender: smartWalletStandard,
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
                  extension: extSbtcTransferManyNative,
                  payload: Uint8Array.from(
                    Buffer.from(serializedPayload, "hex")
                  ),
                },
              });

              transfers.forEach((t, index) => {
                const sbtcTransferEvent =
                  sbtcTransferManyNativeEvents[3 + index];
                expect(sbtcTransferEvent).toEqual({
                  data: {
                    asset_identifier: `${sbtcTokenContract}::sbtc-token`,
                    amount: t.amount.toString(),
                    recipient: t.recipient,
                    sender: smartWalletStandard,
                  },
                  event: "ft_transfer_event",
                });
              });
            }
          )
        );
      });
    });

    describe("ext-sponsored-send-many", () => {
      it("owner can transfer STX to many recipients using smart wallet and the events are printed correctly", async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.record({
              feesAmount: fc.nat(),
              transfers: fc.array(
                fc.record({
                  amount: fc.integer({ min: 1 }),
                  recipient: fc.constantFrom(...addresses),
                }),
                // 38 is the maximum number of standard principal recipients.
                { minLength: 1, maxLength: 38 }
              ),
              owner: fc.constant(deployer),
              depositor: fc.constantFrom(...addresses),
            }),
            async ({ feesAmount, transfers, owner, depositor }) => {
              const simnet = await initSimnet();

              const totalTransferAmount = transfers.reduce(
                (sum, t) => sum + t.amount,
                0
              );

              const { result: stxFundingResult } = simnet.transferSTX(
                totalTransferAmount,
                smartWalletStandard,
                depositor
              );
              // Ensure the wallet funding was successful.
              expect(stxFundingResult).toBeOk(Cl.bool(true));

              const serializedPayload = serializeCV(
                Cl.tuple({
                  fees: Cl.uint(feesAmount),
                  recipients: Cl.list(
                    transfers.map((t) =>
                      Cl.tuple({
                        ustx: Cl.uint(t.amount),
                        to: Cl.principal(t.recipient),
                      })
                    )
                  ),
                })
              );

              const { events: stxSendManyEvents, result: stxSendManyResult } =
                simnet.callPublicFn(
                  smartWalletStandard,
                  "extension-call",
                  [
                    Cl.principal(extSponsoredSendMany),
                    Cl.bufferFromHex(serializedPayload),
                  ],
                  owner
                );
              expect(stxSendManyResult).toBeOk(Cl.bool(true));
              // ect mint, ect burn, payload print, STX transfer events
              expect(stxSendManyEvents.length).toBe(3 + transfers.length);

              const [ectMintEvent, ectBurnEvent, payloadPrintEvent] =
                stxSendManyEvents;
              expect(ectMintEvent).toEqual({
                data: {
                  amount: "1",
                  asset_identifier: `${smartWalletStandard}::ect`,
                  recipient: smartWalletStandard,
                },
                event: "ft_mint_event",
              });
              expect(ectBurnEvent).toEqual({
                data: {
                  amount: "1",
                  asset_identifier: `${smartWalletStandard}::ect`,
                  sender: smartWalletStandard,
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
                  extension: extSponsoredSendMany,
                  payload: Uint8Array.from(
                    Buffer.from(serializedPayload, "hex")
                  ),
                },
              });

              transfers.forEach((t, index) => {
                const stxTransferEvent = stxSendManyEvents[3 + index];
                expect(stxTransferEvent).toEqual({
                  data: {
                    amount: t.amount.toString(),
                    recipient: t.recipient,
                    sender: smartWalletStandard,
                    memo: "",
                  },
                  event: "stx_transfer_event",
                });
              });
            }
          )
        );
      });
    });

    describe("ext-sponsored-transfer", () => {
      it("non-owner cannot transfer STX using sponsored transfer extension", async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.record({
              transferAmount: fc.integer({ min: 1 }),
              // Can be any natural number since the fees won't be transferred
              // to anyone, the tx is not sponsored.
              fees: fc.nat(),
              nonOwner: fc.constantFrom(
                ...addresses.filter((a) => a !== deployer)
              ),
              depositor: fc.constantFrom(...addresses),
              recipient: fc.constantFrom(...addresses),
            }),
            async ({
              transferAmount,
              fees,
              nonOwner,
              depositor,
              recipient,
            }) => {
              const simnet = await initSimnet();

              const stxTransfer = tx.transferSTX(
                transferAmount,
                smartWalletStandard,
                depositor
              );
              simnet.mineBlock([stxTransfer]);

              const { result: stxTransferSponsoredExtResult } =
                simnet.callPublicFn(
                  smartWalletStandard,
                  "extension-call",
                  [
                    Cl.principal(extSponsoredTransfer),
                    Cl.bufferFromHex(
                      serializeCV(
                        Cl.tuple({
                          amount: Cl.uint(transferAmount),
                          to: Cl.principal(recipient),
                          fees: Cl.uint(fees),
                        })
                      )
                    ),
                  ],
                  nonOwner
                );
              expect(stxTransferSponsoredExtResult).toBeErr(
                Cl.uint(
                  contracts.smartWalletStandard.constants.errUnauthorised.value
                )
              );
            }
          )
        );
      });

      it("owner can transfer STX using sponsored transfer extension and the events are printed correctly", async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.record({
              transferAmount: fc.integer({ min: 1 }),
              // Can be any natural number since the fees won't be transferred
              // to anyone.
              fees: fc.nat(),
              owner: fc.constant(deployer),
              depositor: fc.constantFrom(...addresses),
              recipient: fc.constantFrom(...addresses),
            }),
            async ({ transferAmount, fees, owner, depositor, recipient }) => {
              const simnet = await initSimnet();

              const stxTransfer = tx.transferSTX(
                transferAmount,
                smartWalletStandard,
                depositor
              );
              simnet.mineBlock([stxTransfer]);

              const serializedPayload = serializeCV(
                Cl.tuple({
                  amount: Cl.uint(transferAmount),
                  to: Cl.principal(recipient),
                  fees: Cl.uint(fees),
                })
              );
              const { events: stxTransferEvents, result: stxTransferResult } =
                simnet.callPublicFn(
                  smartWalletStandard,
                  "extension-call",
                  [
                    Cl.principal(extSponsoredTransfer),
                    Cl.bufferFromHex(serializedPayload),
                  ],
                  owner
                );
              expect(stxTransferResult).toBeOk(Cl.bool(true));
              expect(stxTransferEvents.length).toBe(4);

              const [
                ectMintEvent,
                ectBurnEvent,
                payloadPrintEvent,
                stxTransferEvent,
              ] = stxTransferEvents;
              expect(ectMintEvent).toEqual({
                data: {
                  amount: "1",
                  asset_identifier: `${smartWalletStandard}::ect`,
                  recipient: smartWalletStandard,
                },
                event: "ft_mint_event",
              });
              expect(ectBurnEvent).toEqual({
                data: {
                  amount: "1",
                  asset_identifier: `${smartWalletStandard}::ect`,
                  sender: smartWalletStandard,
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
                  extension: extSponsoredTransfer,
                  payload: Uint8Array.from(
                    Buffer.from(serializedPayload, "hex")
                  ),
                },
              });
              expect(stxTransferEvent).toEqual({
                data: {
                  amount: transferAmount.toString(),
                  memo: "",
                  recipient: recipient,
                  sender: smartWalletStandard,
                },
                event: "stx_transfer_event",
              });
            }
          )
        );
      });
    });

    describe("ext-unsafe-sip-010-transfer", () => {
      it("non-owner cannot transfer xBTC using unsafe SIP-010 transfer extension", async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.record({
              transferAmount: fc.integer({ min: 1 }),
              nonOwner: fc.constantFrom(
                ...addresses.filter((a) => a != deployer)
              ),
              recipient: fc.constantFrom(...addresses),
            }),
            async ({ transferAmount, nonOwner, recipient }) => {
              const simnet = await initSimnet();

              initAndSendWrappedBitcoin(
                simnet,
                transferAmount,
                smartWalletStandard
              );

              const { result: xbtcTransferResult } = simnet.callPublicFn(
                smartWalletStandard,
                "extension-call",
                [
                  Cl.principal(extUnsafeSip010Transfer),
                  Cl.bufferFromHex(
                    serializeCV(
                      Cl.tuple({
                        amount: Cl.uint(transferAmount),
                        to: Cl.principal(recipient),
                        token: Cl.principal(wrappedBitcoinContract),
                      })
                    )
                  ),
                ],
                nonOwner
              );
              expect(xbtcTransferResult).toBeErr(
                Cl.uint(
                  contracts.smartWalletStandard.constants.errUnauthorised.value
                )
              );
            }
          )
        );
      });

      it("owner can transfer xBTC using unsafe SIP-010 transfer extension and the events are printed correctly", async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.record({
              transferAmount: fc.integer({ min: 1 }),
              owner: fc.constant(deployer),
              recipient: fc.constantFrom(...addresses),
            }),
            async ({ transferAmount, owner, recipient }) => {
              const simnet = await initSimnet();

              initAndSendWrappedBitcoin(
                simnet,
                transferAmount,
                smartWalletStandard
              );

              const serializedPayload = serializeCV(
                Cl.tuple({
                  amount: Cl.uint(transferAmount),
                  to: Cl.principal(recipient),
                  token: Cl.principal(wrappedBitcoinContract),
                })
              );
              const { events: xbtcTransferEvents, result: xbtcTransferResult } =
                simnet.callPublicFn(
                  smartWalletStandard,
                  "extension-call",
                  [
                    Cl.principal(extUnsafeSip010Transfer),
                    Cl.bufferFromHex(serializedPayload),
                  ],
                  owner
                );
              expect(xbtcTransferResult).toBeOk(Cl.bool(true));
              expect(xbtcTransferEvents.length).toBe(5);

              const [
                ectMintEvent,
                ectBurnEvent,
                payloadPrintEvent,
                emptyMemoPrintEvent,
                xbtcTransferEvent,
              ] = xbtcTransferEvents;
              expect(ectMintEvent).toEqual({
                data: {
                  amount: "1",
                  asset_identifier: `${smartWalletStandard}::ect`,
                  recipient: smartWalletStandard,
                },
                event: "ft_mint_event",
              });
              expect(ectBurnEvent).toEqual({
                data: {
                  amount: "1",
                  asset_identifier: `${smartWalletStandard}::ect`,
                  sender: smartWalletStandard,
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
                  extension: extUnsafeSip010Transfer,
                  payload: Uint8Array.from(
                    Buffer.from(serializedPayload, "hex")
                  ),
                },
              });
              const emptyMemoValue = cvToValue(emptyMemoPrintEvent.data.value);
              expect(emptyMemoValue).toEqual(new Uint8Array());
              expect(xbtcTransferEvent).toEqual({
                data: {
                  amount: transferAmount.toString(),
                  recipient: recipient,
                  sender: smartWalletStandard,
                  asset_identifier: `${wrappedBitcoinContract}::wrapped-bitcoin`,
                },
                event: "ft_transfer_event",
              });
            }
          )
        );
      });

      it("owner can transfer xBTC using unsafe SIP-010 transfer extension and balances are updated correctly", async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.record({
              transferAmount: fc.integer({ min: 1 }),
              owner: fc.constant(deployer),
              recipient: fc.constantFrom(...addresses),
            }),
            async ({ transferAmount, owner, recipient }) => {
              const simnet = await initSimnet();

              initAndSendWrappedBitcoin(
                simnet,
                transferAmount,
                smartWalletStandard
              );

              const before = {
                w: simnet.callReadOnlyFn(
                  wrappedBitcoinContract,
                  "get-balance",
                  [Cl.principal(smartWalletStandard)],
                  deployer
                ).result,
                r: simnet.callReadOnlyFn(
                  wrappedBitcoinContract,
                  "get-balance",
                  [Cl.principal(recipient)],
                  deployer
                ).result,
              };
              expect(before.w).toBeOk(Cl.uint(transferAmount));
              expect(before.r).toBeOk(Cl.uint(0));

              const serializedPayload = serializeCV(
                Cl.tuple({
                  amount: Cl.uint(transferAmount),
                  to: Cl.principal(recipient),
                  token: Cl.principal(wrappedBitcoinContract),
                })
              );
              const { result: xbtcTransferResult } = simnet.callPublicFn(
                smartWalletStandard,
                "extension-call",
                [
                  Cl.principal(extUnsafeSip010Transfer),
                  Cl.bufferFromHex(serializedPayload),
                ],
                owner
              );
              expect(xbtcTransferResult).toBeOk(Cl.bool(true));

              const after = {
                w: simnet.callReadOnlyFn(
                  wrappedBitcoinContract,
                  "get-balance",
                  [Cl.principal(smartWalletStandard)],
                  deployer
                ).result,
                r: simnet.callReadOnlyFn(
                  wrappedBitcoinContract,
                  "get-balance",
                  [Cl.principal(recipient)],
                  deployer
                ).result,
              };
              expect(after.w).toBeOk(Cl.uint(0));
              expect(after.r).toBeOk(Cl.uint(transferAmount));
            }
          )
        );
      });

      it("owner cannot transfer other sip-010 tokens than xBTC", async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.record({
              transferAmount: fc.integer({ min: 1 }),
              owner: fc.constant(deployer),
              recipient: fc.constantFrom(...addresses),
            }),
            async ({ transferAmount, owner, recipient }) => {
              const simnet = await initSimnet();

              const serializedPayload = serializeCV(
                Cl.tuple({
                  amount: Cl.uint(transferAmount),
                  to: Cl.principal(recipient),
                  token: Cl.principal(nopeTokenContract),
                })
              );
              const { result: nopeTransferResult } = simnet.callPublicFn(
                smartWalletStandard,
                "extension-call",
                [
                  Cl.principal(extUnsafeSip010Transfer),
                  Cl.bufferFromHex(serializedPayload),
                ],
                owner
              );
              expect(nopeTransferResult).toBeErr(
                Cl.uint(
                  contracts.extUnsafeSip010Transfer.constants.errInvalidPayload
                    .value
                )
              );
            }
          )
        );
      });
    });
  });
});
