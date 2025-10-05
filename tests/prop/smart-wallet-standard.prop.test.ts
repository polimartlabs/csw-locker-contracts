import { initSimnet, tx } from "@hirosystems/clarinet-sdk";
import { Cl } from "@stacks/transactions";
import { describe, expect, it } from "vitest";
import { accounts, deployments } from "../../clarigen/src/clarigen-types";
import fc from "fast-check";
import { errorCodes, getStxBalance } from "../testUtils";

const addresses: string[] = Object.values(accounts).map(
  (account) => account.address
);
const deployer = accounts.deployer.address;

const smartWalletStandard = deployments.smartWalletStandard.simnet;

describe("Smart Wallet Standard", () => {
  describe("STX Transfer", () => {
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
});
