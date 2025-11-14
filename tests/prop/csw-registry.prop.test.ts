import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { addresses } from "../testUtils";
import { initSimnet } from "@stacks/clarinet-sdk";
import { readFileSync } from "fs";
import {
  accounts,
  contracts,
  deployments,
} from "../../clarigen/src/clarigen-types";
import { Cl } from "@stacks/transactions";

const deployer = accounts.deployer.address;

const cswRegistry = deployments.cswRegistry.simnet;
const smartWalletStandard = deployments.smartWalletStandard.simnet;

fc.configureGlobal({
  numRuns: 10,
});

describe("CSW Registry", () => {
  describe("Smart Wallet Registration", () => {
    it("non-owner cannot register a smart wallet", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            nonOwner: fc.constantFrom(
              ...addresses.filter((a) => a !== deployer)
            ),
          }),
          async ({ nonOwner }) => {
            const simnet = await initSimnet();

            const { result: registerResult } = simnet.callPublicFn(
              cswRegistry,
              "csw-register",
              [Cl.principal(smartWalletStandard)],
              nonOwner
            );
            expect(registerResult).toBeErr(
              Cl.uint(contracts.cswRegistry.constants.eRRNOTAUTHORIZED.value)
            );
          }
        )
      );
    });

    it("last token ID is always incremental and unique", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.subarray(
            // Deployer already has registered smart wallets as per
            // `Clarinet.toml`.
            addresses.filter((a) => a !== deployer),
            {
              minLength: 1,
            }
          ),
          async (ownersList) => {
            const simnet = await initSimnet();
            const cswName = "smart-wallet-standard";
            const cswSrc = readFileSync(
              "./contracts/smart-wallet-standard.clar",
              "utf8"
            );

            ownersList.forEach((owner, index) => {
              // Owner deploys its own smart wallet.
              simnet.deployContract(
                cswName,
                cswSrc,
                { clarityVersion: 4 },
                owner
              );
              const expectedTokenId = index + 1;

              // Owner registers its smart wallet in the CSW registry.
              const cswContractId = `${owner}.${cswName}`;
              const { result: registerResult } = simnet.callPublicFn(
                cswRegistry,
                "csw-register",
                [Cl.principal(cswContractId)],
                owner
              );
              expect(registerResult).toBeOk(Cl.uint(expectedTokenId));
            });
          }
        )
      );
    });

    it("csw mappings are correct after multiple registrations", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.subarray(
            // Deployer already has registered smart wallets as per
            // `Clarinet.toml`.
            addresses.filter((a) => a !== deployer),
            {
              minLength: 1,
            }
          ),
          async (ownersList) => {
            const simnet = await initSimnet();
            const cswName = "smart-wallet-standard";
            const cswSrc = readFileSync(
              "./contracts/smart-wallet-standard.clar",
              "utf8"
            );

            ownersList.forEach((owner, index) => {
              // Owner deploys its own smart wallet.
              simnet.deployContract(
                cswName,
                cswSrc,
                { clarityVersion: 4 },
                owner
              );
              const tokenId = index + 1;

              // Owner registers its smart wallet in the CSW registry.
              const cswContractId = `${owner}.${cswName}`;
              const { result: registerResult } = simnet.callPublicFn(
                cswRegistry,
                "csw-register",
                [Cl.principal(cswContractId)],
                owner
              );
              expect(registerResult).toBeOk(Cl.uint(tokenId));

              const cswToIndexMapEntry = simnet.getMapEntry(
                cswRegistry,
                "csw-to-index",
                Cl.principal(cswContractId)
              );
              expect(cswToIndexMapEntry).toBeSome(Cl.uint(tokenId));

              const indexToCswMapEntry = simnet.getMapEntry(
                cswRegistry,
                "index-to-csw",
                Cl.uint(tokenId)
              );
              expect(indexToCswMapEntry).toBeSome(Cl.principal(cswContractId));
            });
          }
        )
      );
    });

    it("csw read-only methods correctly return after multiple registrations", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.subarray(
            // Deployer already has registered smart wallets as per
            // `Clarinet.toml`.
            addresses.filter((a) => a !== deployer),
            {
              minLength: 1,
            }
          ),
          async (ownersList) => {
            const simnet = await initSimnet();
            const cswName = "smart-wallet-standard";
            const cswSrc = readFileSync(
              "./contracts/smart-wallet-standard.clar",
              "utf8"
            );

            ownersList.forEach((owner, index) => {
              // Owner deploys its own smart wallet.
              simnet.deployContract(
                cswName,
                cswSrc,
                { clarityVersion: 4 },
                owner
              );
              const tokenId = index + 1;

              // Owner registers its smart wallet in the CSW registry.
              const cswContractId = `${owner}.${cswName}`;
              const { result: registerResult } = simnet.callPublicFn(
                cswRegistry,
                "csw-register",
                [Cl.principal(cswContractId)],
                owner
              );
              expect(registerResult).toBeOk(Cl.uint(tokenId));

              const { result: tokenIdResult } = simnet.callReadOnlyFn(
                cswRegistry,
                "get-id-from-csw",
                [Cl.principal(cswContractId)],
                owner
              );
              expect(tokenIdResult).toBeSome(Cl.uint(tokenId));

              const { result: cswResult } = simnet.callReadOnlyFn(
                cswRegistry,
                "get-csw-from-id",
                [Cl.uint(tokenId)],
                owner
              );
              expect(cswResult).toBeSome(Cl.principal(cswContractId));
            });
          }
        )
      );
    });

    it("registering the first smart wallet always sets primary wallet", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.subarray(
            // Deployer already has registered smart wallets as per
            // `Clarinet.toml`.
            addresses.filter((a) => a !== deployer),
            {
              minLength: 1,
            }
          ),
          async (ownersList) => {
            const simnet = await initSimnet();
            const cswName = "smart-wallet-standard";
            const cswSrc = readFileSync(
              "./contracts/smart-wallet-standard.clar",
              "utf8"
            );

            ownersList.forEach((owner, index) => {
              // Owner deploys its own smart wallet.
              simnet.deployContract(
                cswName,
                cswSrc,
                { clarityVersion: 4 },
                owner
              );
              const tokenId = index + 1;

              // Owner registers its smart wallet in the CSW registry.
              const cswContractIdId = `${owner}.${cswName}`;
              const { result: registerResult } = simnet.callPublicFn(
                cswRegistry,
                "csw-register",
                [Cl.principal(cswContractIdId)],
                owner
              );
              expect(registerResult).toBeOk(Cl.uint(tokenId));

              const { result: getPrimaryResult } = simnet.callReadOnlyFn(
                cswRegistry,
                "get-primary-csw",
                [Cl.principal(owner)],
                owner
              );
              expect(getPrimaryResult).toBeSome(Cl.uint(tokenId));
            });
          }
        )
      );
    });

    it("registering subsequent smart wallets does not change primary wallet", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.subarray(
            // Deployer already has registered smart wallets as per
            // `Clarinet.toml`.
            addresses.filter((a) => a !== deployer),
            {
              minLength: 1,
            }
          ),
          async (ownersList) => {
            const simnet = await initSimnet();
            const cswName1 = "smart-wallet-standard";
            const cswName2 = "smart-wallet-standard-2";
            const cswSrc = readFileSync(
              "./contracts/smart-wallet-standard.clar",
              "utf8"
            );

            ownersList.forEach((owner, index) => {
              // Owner deploys its own smart wallet.
              simnet.deployContract(
                cswName1,
                cswSrc,
                { clarityVersion: 4 },
                owner
              );
              simnet.deployContract(
                cswName2,
                cswSrc,
                { clarityVersion: 4 },
                owner
              );
              const tokenId1 = 2 * index + 1;
              const tokenId2 = 2 * index + 2;

              // Owner registers its smart wallet in the CSW registry.
              const cswContractId1 = `${owner}.${cswName1}`;
              const cswContractId2 = `${owner}.${cswName2}`;
              const { result: registerResult1 } = simnet.callPublicFn(
                cswRegistry,
                "csw-register",
                [Cl.principal(cswContractId1)],
                owner
              );
              expect(registerResult1).toBeOk(Cl.uint(tokenId1));

              const { result: registerResult2 } = simnet.callPublicFn(
                cswRegistry,
                "csw-register",
                [Cl.principal(cswContractId2)],
                owner
              );
              expect(registerResult2).toBeOk(Cl.uint(tokenId2));

              // Primary wallet remains the first registered wallet.
              const { result: getPrimaryResult } = simnet.callReadOnlyFn(
                cswRegistry,
                "get-primary-csw",
                [Cl.principal(owner)],
                owner
              );
              expect(getPrimaryResult).toBeSome(Cl.uint(tokenId1));
            });
          }
        )
      );
    });

    it("owner cannot register the same smart wallet twice", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...addresses.filter((a) => a !== deployer)),
          async (owner) => {
            const simnet = await initSimnet();
            const cswName = "smart-wallet-standard";
            const cswSrc = readFileSync(
              "./contracts/smart-wallet-standard.clar",
              "utf8"
            );

            // Owner deploys its own smart wallet.
            simnet.deployContract(
              cswName,
              cswSrc,
              { clarityVersion: 4 },
              owner
            );

            // Owner registers its smart wallet in the CSW registry.
            const cswContractId = `${owner}.${cswName}`;
            const { result: registerResult1 } = simnet.callPublicFn(
              cswRegistry,
              "csw-register",
              [Cl.principal(cswContractId)],
              owner
            );
            expect(registerResult1).toBeOk(Cl.uint(1));

            // Owner tries to register the same smart wallet again.
            const { result: registerResult2 } = simnet.callPublicFn(
              cswRegistry,
              "csw-register",
              [Cl.principal(cswContractId)],
              owner
            );
            expect(registerResult2).toBeErr(
              Cl.uint(contracts.cswRegistry.constants.eRRCSWNOTAVAILABLE.value)
            );
          }
        )
      );
    });
  });

  describe("Smart Wallet Transfer", () => {
    it("non-owner of the ownership NFT cannot transfer it", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            nonOwner: fc.constantFrom(
              ...addresses.filter((a) => a !== deployer)
            ),
            // Owner and recipient cannot be the same address.
            recipient: fc.constantFrom(
              ...addresses.filter((a) => a !== deployer)
            ),
          }),
          async ({ nonOwner, recipient }) => {
            const simnet = await initSimnet();
            const tokenId = 1;

            const { result: registerResult } = simnet.callPublicFn(
              cswRegistry,
              "csw-register",
              [Cl.principal(smartWalletStandard)],
              deployer
            );
            expect(registerResult).toBeOk(Cl.uint(tokenId));

            const { result: transferResult } = simnet.callPublicFn(
              cswRegistry,
              "transfer",
              [
                Cl.uint(tokenId),
                Cl.principal(deployer),
                Cl.principal(recipient),
              ],
              nonOwner
            );
            expect(transferResult).toBeErr(
              Cl.uint(contracts.cswRegistry.constants.eRRNOTAUTHORIZED.value)
            );
          }
        )
      );
    });

    it("owner can transfer the ownership NFT without transferring the smart wallet", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            // Owner and recipient cannot be the same address.
            recipient: fc.constantFrom(
              ...addresses.filter((a) => a !== deployer)
            ),
          }),
          async ({ recipient }) => {
            const simnet = await initSimnet();
            const tokenId = 1;

            const { result: registerResult } = simnet.callPublicFn(
              cswRegistry,
              "csw-register",
              [Cl.principal(smartWalletStandard)],
              deployer
            );
            expect(registerResult).toBeOk(Cl.uint(tokenId));

            const { result: transferResult } = simnet.callPublicFn(
              cswRegistry,
              "transfer",
              [
                Cl.uint(tokenId),
                Cl.principal(deployer),
                Cl.principal(recipient),
              ],
              deployer
            );
            expect(transferResult).toBeOk(Cl.bool(true));

            const { result: getOwnerResult } = simnet.callReadOnlyFn(
              cswRegistry,
              "get-owner",
              [Cl.uint(tokenId)],
              recipient
            );
            expect(getOwnerResult).toBeOk(Cl.some(Cl.principal(recipient)));
          }
        )
      );
    });
  });

  describe("Smart Wallet Claim Transfer", () => {
    it("non-owner of the smart wallet cannot claim the ownership NFT", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            nonOwner: fc.constantFrom(
              ...addresses.filter((a) => a !== deployer)
            ),
          }),
          async ({ nonOwner }) => {
            const simnet = await initSimnet();
            const tokenId = 1;

            const { result: registerResult } = simnet.callPublicFn(
              cswRegistry,
              "csw-register",
              [Cl.principal(smartWalletStandard)],
              deployer
            );
            expect(registerResult).toBeOk(Cl.uint(tokenId));

            const { result: claimResult } = simnet.callPublicFn(
              cswRegistry,
              "claim-transfer",
              [Cl.principal(smartWalletStandard)],
              nonOwner
            );
            expect(claimResult).toBeErr(
              Cl.uint(contracts.cswRegistry.constants.eRRNOTAUTHORIZED.value)
            );
          }
        )
      );
    });

    it("owner can transfer and reclaim registered ownership NFT anytime if not transferring smart wallet", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            // Owner and recipient cannot be the same address.
            recipient: fc.constantFrom(
              ...addresses.filter((a) => a !== deployer)
            ),
          }),
          async ({ recipient }) => {
            const simnet = await initSimnet();
            const tokenId = 1;

            const { result: registerResult } = simnet.callPublicFn(
              cswRegistry,
              "csw-register",
              [Cl.principal(smartWalletStandard)],
              deployer
            );
            expect(registerResult).toBeOk(Cl.uint(tokenId));

            const { result: transferResult } = simnet.callPublicFn(
              cswRegistry,
              "transfer",
              [
                Cl.uint(tokenId),
                Cl.principal(deployer),
                Cl.principal(recipient),
              ],
              deployer
            );
            expect(transferResult).toBeOk(Cl.bool(true));

            const { result: getOwnerResult } = simnet.callReadOnlyFn(
              cswRegistry,
              "get-owner",
              [Cl.uint(tokenId)],
              recipient
            );
            expect(getOwnerResult).toBeOk(Cl.some(Cl.principal(recipient)));

            const { result: reclaimResult } = simnet.callPublicFn(
              cswRegistry,
              "claim-transfer",
              [Cl.principal(smartWalletStandard)],
              deployer
            );
            expect(reclaimResult).toBeOk(Cl.bool(true));

            const { result: getOwnerResult2 } = simnet.callReadOnlyFn(
              cswRegistry,
              "get-owner",
              [Cl.uint(tokenId)],
              deployer
            );
            expect(getOwnerResult2).toBeOk(Cl.some(Cl.principal(deployer)));
          }
        )
      );
    });

    it("owner can transfer wallet and ownership NFT to different recipients, new wallet owner can claim", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc
            .record({
              // Owner and recipient cannot be the same address.
              nftRecipient: fc.constantFrom(
                ...addresses.filter((a) => a !== deployer)
              ),
              walletRecipient: fc.constantFrom(
                ...addresses.filter((a) => a !== deployer)
              ),
            })
            // Recipients must be different addresses. Otherwise this would
            // end up transferring an NFT from and to the same address.
            .filter(
              ({ nftRecipient, walletRecipient }) =>
                nftRecipient !== walletRecipient
            ),
          async ({ nftRecipient, walletRecipient }) => {
            const simnet = await initSimnet();
            const tokenId = 1;

            const { result: registerResult } = simnet.callPublicFn(
              cswRegistry,
              "csw-register",
              [Cl.principal(smartWalletStandard)],
              deployer
            );
            expect(registerResult).toBeOk(Cl.uint(tokenId));

            // Transfer the ownership NFT to a recipient.
            const { result: transferResult } = simnet.callPublicFn(
              cswRegistry,
              "transfer",
              [
                Cl.uint(tokenId),
                Cl.principal(deployer),
                Cl.principal(nftRecipient),
              ],
              deployer
            );
            expect(transferResult).toBeOk(Cl.bool(true));

            const { result: getOwnerResult } = simnet.callReadOnlyFn(
              cswRegistry,
              "get-owner",
              [Cl.uint(tokenId)],
              nftRecipient
            );
            expect(getOwnerResult).toBeOk(Cl.some(Cl.principal(nftRecipient)));

            // Transfer the smart wallet to a recipient (not necessarily the
            // same as the NFT recipient).
            const { result: transferCswResult } = simnet.callPublicFn(
              smartWalletStandard,
              "transfer-wallet",
              [Cl.principal(walletRecipient)],
              deployer
            );
            expect(transferCswResult).toBeOk(Cl.bool(true));

            // Original owner is not the smart wallet owner anymore, so cannot
            // reclaim the ownership NFT.
            const { result: reclaimResult } = simnet.callPublicFn(
              cswRegistry,
              "claim-transfer",
              [Cl.principal(smartWalletStandard)],
              deployer
            );
            expect(reclaimResult).toBeErr(
              Cl.uint(contracts.cswRegistry.constants.eRRNOTAUTHORIZED.value)
            );

            const { result: getOwnerResult2 } = simnet.callReadOnlyFn(
              cswRegistry,
              "get-owner",
              [Cl.uint(tokenId)],
              nftRecipient
            );
            expect(getOwnerResult2).toBeOk(Cl.some(Cl.principal(nftRecipient)));

            const { result: walletOwnerClaimResult } = simnet.callPublicFn(
              cswRegistry,
              "claim-transfer",
              [Cl.principal(smartWalletStandard)],
              walletRecipient
            );
            expect(walletOwnerClaimResult).toBeOk(Cl.bool(true));

            const { result: getOwnerResult3 } = simnet.callReadOnlyFn(
              cswRegistry,
              "get-owner",
              [Cl.uint(tokenId)],
              walletRecipient
            );
            expect(getOwnerResult3).toBeOk(
              Cl.some(Cl.principal(walletRecipient))
            );
          }
        )
      );
    });
  });

  describe("Set Primary Wallet", () => {
    it("transferring primary wallet clears the mapping", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...addresses.filter((a) => a !== deployer)),
          async (recipient) => {
            const simnet = await initSimnet();
            const tokenId1 = 1;

            const { result: registerResult } = simnet.callPublicFn(
              cswRegistry,
              "csw-register",
              [Cl.principal(smartWalletStandard)],
              deployer
            );
            expect(registerResult).toBeOk(Cl.uint(tokenId1));

            const { result: getPrimaryResult1 } = simnet.callReadOnlyFn(
              cswRegistry,
              "get-primary-csw",
              [Cl.principal(deployer)],
              deployer
            );
            expect(getPrimaryResult1).toBeSome(Cl.uint(tokenId1));

            const { result: transferResult } = simnet.callPublicFn(
              cswRegistry,
              "transfer",
              [
                Cl.uint(tokenId1),
                Cl.principal(deployer),
                Cl.principal(recipient),
              ],
              deployer
            );
            expect(transferResult).toBeOk(Cl.bool(true));

            const { result: getPrimaryResult2 } = simnet.callReadOnlyFn(
              cswRegistry,
              "get-primary-csw",
              [Cl.principal(deployer)],
              deployer
            );
            expect(getPrimaryResult2).toBeNone();
          }
        )
      );
    });

    it("primary wallet mapping is consistent after multiple registrations and set-primary calls", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...addresses.filter((a) => a !== deployer)),
          fc.integer({ min: 2, max: 5 }),
          async (owner, registrationsCount) => {
            const simnet = await initSimnet();
            const cswSrc = readFileSync(
              "./contracts/smart-wallet-standard.clar",
              "utf8"
            );

            let lastTokenId = 0;
            for (let i = 0; i < registrationsCount; i++) {
              const cswName = `smart-wallet-standard-${i}`;

              // Owner deploys its own smart wallet.
              simnet.deployContract(
                cswName,
                cswSrc,
                { clarityVersion: 4 },
                owner
              );
              lastTokenId = i + 1;

              // Owner registers its smart wallet in the CSW registry.
              const cswContractId = `${owner}.${cswName}`;
              const { result: registerResult } = simnet.callPublicFn(
                cswRegistry,
                "csw-register",
                [Cl.principal(cswContractId)],
                owner
              );
              expect(registerResult).toBeOk(Cl.uint(lastTokenId));

              const { result: setPrimaryResult } = simnet.callPublicFn(
                cswRegistry,
                "set-primary-csw",
                [Cl.uint(lastTokenId)],
                owner
              );
              expect(setPrimaryResult).toBeOk(Cl.bool(true));
            }

            const { result: getPrimaryResult } = simnet.callReadOnlyFn(
              cswRegistry,
              "get-primary-csw",
              [Cl.principal(owner)],
              owner
            );
            expect(getPrimaryResult).toBeSome(Cl.uint(lastTokenId));
          }
        )
      );
    });
  });
});
