import { initSimnet, tx } from "@hirosystems/clarinet-sdk";
import { Cl, serializeCV } from "@stacks/transactions";
import { describe, expect, it } from "vitest";
import { accounts, deployments } from "../../clarigen/src/clarigen-types";
import fc from "fast-check";
import {
  btcAddresses,
  errorCodes,
  getStxBalance,
  getStxMemoPrintEvent as getStxPrintEvent,
} from "../testUtils";
import { cvToValue } from "@clarigen/core";
import { poxAddressToTuple } from "@stacks/stacking";

const addresses: string[] = Object.values(accounts).map(
  (account) => account.address
);
const deployer = accounts.deployer.address;

const smartWalletStandard = deployments.smartWalletStandard.simnet;
const extDelegateStxPox4 = deployments.extDelegateStxPox4.simnet;

// TODO:
// 1. Add prop tests comparing contract-caller and tx-sender ops (dummy SCs will probably be needed).
// 2. Add prop tests generating unexpected data for the payloads. Check serialization/deserialization.
// 3. Add roundtrip tests for the payload.
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
              Cl.uint(errorCodes.smartWalletStandard.UNAUTHORISED)
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
              getStxPrintEvent(
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
              getStxPrintEvent(
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
              Cl.uint(errorCodes.smartWalletStandard.UNAUTHORISED)
            );
          }
        )
      );
    });
  });

  describe("Admin Management Flows", () => {
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
                Cl.uint(errorCodes.smartWalletStandard.UNAUTHORISED)
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
                Cl.uint(errorCodes.smartWalletStandard.UNAUTHORISED)
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
                Cl.uint(errorCodes.smartWalletStandard.UNAUTHORISED)
              );
            }
          )
        );
      });
    });
  });
});
