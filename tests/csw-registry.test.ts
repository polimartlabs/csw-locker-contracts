import { describe, expect, it } from "vitest";
import { accounts, deployments } from "../clarigen/src/clarigen-types";
import { Cl } from "@stacks/transactions";
import { errorCodes } from "./testUtils";

const deployer = accounts.deployer.address;
const wallet1 = accounts.wallet_1.address;
const wallet2 = accounts.wallet_2.address;

const cswRegistry = deployments.cswRegistry.simnet;
const smartWallet = deployments.smartWalletStandard.simnet;
const smartWallet2 = deployments.smartWalletStandard2.simnet;

describe("CSW Registry", () => {
  describe("Smart Wallet Registration", () => {
    it("register properly increments last token id", () => {
      const { result: getLastTokenIdResult0 } = simnet.callReadOnlyFn(
        cswRegistry,
        "get-last-token-id",
        [],
        deployer
      );
      expect(getLastTokenIdResult0).toBeOk(Cl.uint(0));

      const { result: registerResult1 } = simnet.callPublicFn(
        cswRegistry,
        "csw-register",
        [Cl.principal(smartWallet)],
        deployer
      );
      expect(registerResult1).toBeOk(Cl.uint(1));

      const { result: getLastTokenIdResult1 } = simnet.callReadOnlyFn(
        cswRegistry,
        "get-last-token-id",
        [],
        deployer
      );
      expect(getLastTokenIdResult1).toBeOk(Cl.uint(1));

      const { result: registerResult2 } = simnet.callPublicFn(
        cswRegistry,
        "csw-register",
        [Cl.principal(smartWallet2)],
        deployer
      );
      expect(registerResult2).toBeOk(Cl.uint(2));

      const { result: getLastTokenIdResult2 } = simnet.callReadOnlyFn(
        cswRegistry,
        "get-last-token-id",
        [],
        deployer
      );
      expect(getLastTokenIdResult2).toBeOk(Cl.uint(2));
    });

    it("wallet owner can register it in the csw registry", () => {
      const { result: registerResult } = simnet.callPublicFn(
        cswRegistry,
        "csw-register",
        [Cl.principal(smartWallet)],
        deployer
      );

      expect(registerResult).toBeOk(Cl.uint(1));
    });

    it("non-owner cannot register a smart wallet in the csw registry", () => {
      const { result: registerResult } = simnet.callPublicFn(
        cswRegistry,
        "csw-register",
        [Cl.principal(smartWallet)],
        wallet1
      );
      expect(registerResult).toBeErr(
        Cl.uint(errorCodes.cswRegistry.NOT_AUTHORIZED)
      );
    });

    it("registering the first csw correctly sets the primary csw", () => {
      const { result: registerResult } = simnet.callPublicFn(
        cswRegistry,
        "csw-register",
        [Cl.principal(smartWallet)],
        deployer
      );

      expect(registerResult).toBeOk(Cl.uint(1));

      const { result: primaryCswResult } = simnet.callReadOnlyFn(
        cswRegistry,
        "get-primary-csw",
        [Cl.principal(deployer)],
        deployer
      );

      expect(primaryCswResult).toBeSome(Cl.uint(1));
    });

    it("registering a second csw does not change the primary csw", () => {
      const { result: registerResult1 } = simnet.callPublicFn(
        cswRegistry,
        "csw-register",
        [Cl.principal(smartWallet)],
        deployer
      );

      expect(registerResult1).toBeOk(Cl.uint(1));

      const { result: registerResult2 } = simnet.callPublicFn(
        cswRegistry,
        "csw-register",
        [Cl.principal(smartWallet2)],
        deployer
      );

      expect(registerResult2).toBeOk(Cl.uint(2));

      const { result: primaryCswResult } = simnet.callReadOnlyFn(
        cswRegistry,
        "get-primary-csw",
        [Cl.principal(deployer)],
        deployer
      );

      expect(primaryCswResult).toBeSome(Cl.uint(1));
    });

    it("new wallet owner can register a smart wallet if the prev owner did not", () => {
      const { result: transferWalletResult } = simnet.callPublicFn(
        smartWallet,
        "transfer-wallet",
        [Cl.principal(wallet1)],
        deployer
      );
      expect(transferWalletResult).toBeOk(Cl.bool(true));

      const { result: registerResult } = simnet.callPublicFn(
        cswRegistry,
        "csw-register",
        [Cl.principal(smartWallet)],
        wallet1
      );
      expect(registerResult).toBeOk(Cl.uint(1));

      const { result: getOwnerResult } = simnet.callReadOnlyFn(
        cswRegistry,
        "get-owner",
        [Cl.uint(1)],
        deployer
      );
      expect(getOwnerResult).toBeOk(Cl.some(Cl.principal(wallet1)));
    });
  });

  describe("Smart Wallet Transfer", () => {
    it("wallet owner cannot send ownership NFT to themselves", () => {
      const { result: registerResult } = simnet.callPublicFn(
        cswRegistry,
        "csw-register",
        [Cl.principal(smartWallet)],
        deployer
      );
      expect(registerResult).toBeOk(Cl.uint(1));

      const { result: transferResult } = simnet.callPublicFn(
        cswRegistry,
        "transfer",
        [Cl.uint(1), Cl.principal(deployer), Cl.principal(deployer)],
        deployer
      );
      expect(transferResult).toBeErr(
        Cl.uint(errorCodes.cswRegistry.OPERATION_UNAUTHORIZED)
      );
    });

    it("non-owner of the ownership NFT cannot transfer it", () => {
      const { result: registerResult } = simnet.callPublicFn(
        cswRegistry,
        "csw-register",
        [Cl.principal(smartWallet)],
        deployer
      );
      expect(registerResult).toBeOk(Cl.uint(1));

      const { result: transferResult } = simnet.callPublicFn(
        cswRegistry,
        "transfer",
        [Cl.uint(1), Cl.principal(deployer), Cl.principal(wallet2)],
        wallet1
      );
      expect(transferResult).toBeErr(
        Cl.uint(errorCodes.cswRegistry.NOT_AUTHORIZED)
      );
    });

    it("wallet owner can transfer a registered ownership NFT without transferring the smart wallet", () => {
      const { result: registerResult } = simnet.callPublicFn(
        cswRegistry,
        "csw-register",
        [Cl.principal(smartWallet)],
        deployer
      );
      expect(registerResult).toBeOk(Cl.uint(1));

      const { result: transferResult } = simnet.callPublicFn(
        cswRegistry,
        "transfer",
        [Cl.uint(1), Cl.principal(deployer), Cl.principal(wallet1)],
        deployer
      );

      expect(transferResult).toBeOk(Cl.bool(true));

      const { result: getOwnerResult } = simnet.callReadOnlyFn(
        cswRegistry,
        "get-owner",
        [Cl.uint(1)],
        deployer
      );
      expect(getOwnerResult).toBeOk(Cl.some(Cl.principal(wallet1)));
    });

    it("wallet owner can transfer and reclaim a registered ownership NFT anytime if not transferring the smart wallet", () => {
      const { result: registerResult } = simnet.callPublicFn(
        cswRegistry,
        "csw-register",
        [Cl.principal(smartWallet)],
        deployer
      );
      expect(registerResult).toBeOk(Cl.uint(1));

      const { result: transferResult } = simnet.callPublicFn(
        cswRegistry,
        "transfer",
        [Cl.uint(1), Cl.principal(deployer), Cl.principal(wallet1)],
        deployer
      );

      expect(transferResult).toBeOk(Cl.bool(true));

      const { result: getOwnerResult } = simnet.callReadOnlyFn(
        cswRegistry,
        "get-owner",
        [Cl.uint(1)],
        deployer
      );
      expect(getOwnerResult).toBeOk(Cl.some(Cl.principal(wallet1)));

      // wallet1 transfers the NFT to a third party
      const { result: transferResult2 } = simnet.callPublicFn(
        cswRegistry,
        "transfer",
        [Cl.uint(1), Cl.principal(wallet1), Cl.principal(wallet2)],
        wallet1
      );

      expect(transferResult2).toBeOk(Cl.bool(true));

      const { result: getOwnerResult2 } = simnet.callReadOnlyFn(
        cswRegistry,
        "get-owner",
        [Cl.uint(1)],
        deployer
      );
      expect(getOwnerResult2).toBeOk(Cl.some(Cl.principal(wallet2)));

      // wallet owner(deployer) can reclaim the NFT
      const { result: reclaimResult } = simnet.callPublicFn(
        cswRegistry,
        "claim-transfer",
        [Cl.principal(smartWallet)],
        deployer
      );
      expect(reclaimResult).toBeOk(Cl.bool(true));

      const { result: getOwnerResult3 } = simnet.callReadOnlyFn(
        cswRegistry,
        "get-owner",
        [Cl.uint(1)],
        deployer
      );
      expect(getOwnerResult3).toBeOk(Cl.some(Cl.principal(deployer)));
    });

    it("wallet owner has no primary wallet set after transferring the ownership NFT of the primary wallet", () => {
      const { result: registerResult1 } = simnet.callPublicFn(
        cswRegistry,
        "csw-register",
        [Cl.principal(smartWallet)],
        deployer
      );
      expect(registerResult1).toBeOk(Cl.uint(1));

      const { result: registerResult2 } = simnet.callPublicFn(
        cswRegistry,
        "csw-register",
        [Cl.principal(smartWallet2)],
        deployer
      );
      expect(registerResult2).toBeOk(Cl.uint(2));

      const { result: primaryCswResult1 } = simnet.callReadOnlyFn(
        cswRegistry,
        "get-primary-csw",
        [Cl.principal(deployer)],
        deployer
      );
      expect(primaryCswResult1).toBeSome(Cl.uint(1));

      const { result: transferResult } = simnet.callPublicFn(
        cswRegistry,
        "transfer",
        [Cl.uint(1), Cl.principal(deployer), Cl.principal(wallet1)],
        deployer
      );
      expect(transferResult).toBeOk(Cl.bool(true));

      const { result: primaryCswResult2 } = simnet.callReadOnlyFn(
        cswRegistry,
        "get-primary-csw",
        [Cl.principal(deployer)],
        deployer
      );
      expect(primaryCswResult2).toBeNone();
    });

    it("owner primary wallet unchanged after transferring the ownership NFT of a secondary wallet", () => {
      const { result: registerResult1 } = simnet.callPublicFn(
        cswRegistry,
        "csw-register",
        [Cl.principal(smartWallet)],
        deployer
      );
      expect(registerResult1).toBeOk(Cl.uint(1));

      const { result: registerResult2 } = simnet.callPublicFn(
        cswRegistry,
        "csw-register",
        [Cl.principal(smartWallet2)],
        deployer
      );
      expect(registerResult2).toBeOk(Cl.uint(2));

      const { result: primaryCswResult1 } = simnet.callReadOnlyFn(
        cswRegistry,
        "get-primary",
        [Cl.principal(deployer)],
        deployer
      );
      expect(primaryCswResult1).toBeOk(Cl.some(Cl.principal(smartWallet)));

      const { result: transferResult } = simnet.callPublicFn(
        cswRegistry,
        "transfer",
        [Cl.uint(2), Cl.principal(deployer), Cl.principal(wallet1)],
        deployer
      );
      expect(transferResult).toBeOk(Cl.bool(true));

      // primary csw should still be the primary csw
      const { result: primaryCswResult2 } = simnet.callReadOnlyFn(
        cswRegistry,
        "get-primary",
        [Cl.principal(deployer)],
        deployer
      );
      expect(primaryCswResult2).toBeOk(Cl.some(Cl.principal(smartWallet)));
    });
  });

  describe("Smart Wallet Claim Transfer", () => {
    it("new wallet owner can claim the corresponding ownership NFT", () => {
      const { result: registerResult } = simnet.callPublicFn(
        cswRegistry,
        "csw-register",
        [Cl.principal(smartWallet)],
        deployer
      );
      expect(registerResult).toBeOk(Cl.uint(1));

      const { result: transferResult } = simnet.callPublicFn(
        smartWallet,
        "transfer-wallet",
        [Cl.principal(wallet1)],
        deployer
      );
      expect(transferResult).toBeOk(Cl.bool(true));

      const { result: claimResult } = simnet.callPublicFn(
        cswRegistry,
        "claim-transfer",
        [Cl.principal(smartWallet)],
        wallet1
      );
      expect(claimResult).toBeOk(Cl.bool(true));

      const { result: getOwnerResult } = simnet.callReadOnlyFn(
        cswRegistry,
        "get-owner-csw",
        [Cl.principal(smartWallet)],
        deployer
      );
      expect(getOwnerResult).toBeOk(Cl.some(Cl.principal(wallet1)));
    });

    it("non-owner of smart wallet cannot claim a corresponding ownership NFT", () => {
      const { result: registerResult } = simnet.callPublicFn(
        cswRegistry,
        "csw-register",
        [Cl.principal(smartWallet)],
        deployer
      );
      expect(registerResult).toBeOk(Cl.uint(1));

      const { result: claimResult } = simnet.callPublicFn(
        cswRegistry,
        "claim-transfer",
        [Cl.principal(smartWallet)],
        wallet1
      );
      expect(claimResult).toBeErr(
        Cl.uint(errorCodes.cswRegistry.NOT_AUTHORIZED)
      );
    });

    it("wallet owner can reclaim a transferred ownership NFT", () => {
      const { result: registerResult } = simnet.callPublicFn(
        cswRegistry,
        "csw-register",
        [Cl.principal(smartWallet)],
        deployer
      );
      expect(registerResult).toBeOk(Cl.uint(1));

      const { result: transferResult } = simnet.callPublicFn(
        cswRegistry,
        "transfer",
        [Cl.uint(1), Cl.principal(deployer), Cl.principal(wallet1)],
        deployer
      );
      expect(transferResult).toBeOk(Cl.bool(true));

      const { result: getOwnerResult1 } = simnet.callReadOnlyFn(
        cswRegistry,
        "get-owner",
        [Cl.uint(1)],
        deployer
      );
      expect(getOwnerResult1).toBeOk(Cl.some(Cl.principal(wallet1)));

      const { result: reclaimResult } = simnet.callPublicFn(
        cswRegistry,
        "claim-transfer",
        [Cl.principal(smartWallet)],
        deployer
      );
      expect(reclaimResult).toBeOk(Cl.bool(true));

      const { result: getOwnerResult2 } = simnet.callReadOnlyFn(
        cswRegistry,
        "get-owner",
        [Cl.uint(1)],
        deployer
      );
      expect(getOwnerResult2).toBeOk(Cl.some(Cl.principal(deployer)));
    });
  });

  describe("Set Primary Wallet", () => {
    it("non-owner of the ownership NFT cannot set it as primary wallet", () => {
      const { result: registerResult } = simnet.callPublicFn(
        cswRegistry,
        "csw-register",
        [Cl.principal(smartWallet)],
        deployer
      );
      expect(registerResult).toBeOk(Cl.uint(1));

      const { result: setPrimaryCswResult } = simnet.callPublicFn(
        cswRegistry,
        "set-primary-csw",
        [Cl.uint(1)],
        wallet1
      );
      expect(setPrimaryCswResult).toBeErr(
        Cl.uint(errorCodes.cswRegistry.NOT_AUTHORIZED)
      );
    });

    it("multiple-wallets-owner can set the primary wallet after transferring the ownership NFT of the primary wallet", () => {
      const { result: registerResult1 } = simnet.callPublicFn(
        cswRegistry,
        "csw-register",
        [Cl.principal(smartWallet)],
        deployer
      );
      expect(registerResult1).toBeOk(Cl.uint(1));

      const { result: registerResult2 } = simnet.callPublicFn(
        cswRegistry,
        "csw-register",
        [Cl.principal(smartWallet2)],
        deployer
      );
      expect(registerResult2).toBeOk(Cl.uint(2));

      const { result: primaryCswResult1 } = simnet.callReadOnlyFn(
        cswRegistry,
        "get-primary-csw",
        [Cl.principal(deployer)],
        deployer
      );
      expect(primaryCswResult1).toBeSome(Cl.uint(1));

      const { result: transferResult } = simnet.callPublicFn(
        cswRegistry,
        "transfer",
        [Cl.uint(1), Cl.principal(deployer), Cl.principal(wallet1)],
        deployer
      );
      expect(transferResult).toBeOk(Cl.bool(true));

      const { result: setPrimaryCswResult } = simnet.callPublicFn(
        cswRegistry,
        "set-primary-csw",
        [Cl.uint(2)],
        deployer
      );
      expect(setPrimaryCswResult).toBeOk(Cl.bool(true));

      const { result: primaryCswResult2 } = simnet.callReadOnlyFn(
        cswRegistry,
        "get-primary-csw",
        [Cl.principal(deployer)],
        deployer
      );
      expect(primaryCswResult2).toBeSome(Cl.uint(2));
    });
  });

  describe("SIP-009 Functions", () => {
    it("get-token-uri returns none", () => {
      const { result: getTokenUriResult } = simnet.callReadOnlyFn(
        cswRegistry,
        "get-token-uri",
        [Cl.uint(1)],
        deployer
      );
      expect(getTokenUriResult).toBeOk(Cl.none());
    });

    it("get-contract-uri returns none", () => {
      const { result: getContractUriResult } = simnet.callReadOnlyFn(
        cswRegistry,
        "get-contract-uri",
        [],
        deployer
      );
      expect(getContractUriResult).toBeOk(Cl.none());
    });
  });
});
