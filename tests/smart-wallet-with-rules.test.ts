import { Cl, standardPrincipalCV, trueCV } from "@stacks/transactions";
import { describe, expect, it } from "vitest";
import {
  accounts,
  contracts,
  deployments,
} from "../clarigen/src/clarigen-types";
import { tx } from "@stacks/clarinet-sdk";
import { errorCodes } from "./testUtils";

const ONE_STX = 1_000_000;

const deployer = accounts.deployer.address;
const wallet1 = accounts.wallet_1.address;
const wallet2 = accounts.wallet_2.address;

const smartWalletWithRules = deployments.smartWalletWithRules.simnet;
const noRules = deployments.noRules.simnet;
const standardRules = deployments.standardRules.simnet;
const emergencyRules = deployments.emergencyRules.simnet;

describe("Smart Wallet with rules", () => {
  describe("Security level management", () => {
    it("security level is set to 1 by default", () => {
      const securityLevel = simnet.getDataVar(
        smartWalletWithRules,
        "security-level"
      );
      expect(securityLevel).toBeUint(1);
    });

    it("security level 1 returns standard-rules", () => {
      const { result: currentRulesResult } = simnet.callReadOnlyFn(
        smartWalletWithRules,
        "current-rules",
        [],
        wallet1
      );

      expect(currentRulesResult).toBePrincipal(standardRules);
    });

    it("admin can set security level to 0", () => {
      const { result: setSecurityLevelResult } = simnet.callPublicFn(
        smartWalletWithRules,
        "set-security-level",
        [Cl.uint(0)],
        deployer
      );

      expect(setSecurityLevelResult).toBeOk(Cl.bool(true));

      const { result: currentRulesResult } = simnet.callReadOnlyFn(
        smartWalletWithRules,
        "current-rules",
        [],
        wallet1
      );

      expect(currentRulesResult).toBePrincipal(noRules);
    });

    it("admin can set security level to 2", () => {
      const { result: setSecurityLevelResult } = simnet.callPublicFn(
        smartWalletWithRules,
        "set-security-level",
        [Cl.uint(2)],
        deployer
      );

      expect(setSecurityLevelResult).toBeOk(Cl.bool(true));

      const { result: currentRulesResult } = simnet.callReadOnlyFn(
        smartWalletWithRules,
        "current-rules",
        [],
        wallet1
      );

      expect(currentRulesResult).toBePrincipal(emergencyRules);
    });

    it("security level transitions work correctly", () => {
      // 1 -> 0
      simnet.callPublicFn(
        smartWalletWithRules,
        "set-security-level",
        [Cl.uint(0)],
        deployer
      );

      const securityLevel0 = simnet.getDataVar(
        smartWalletWithRules,
        "security-level"
      );
      expect(securityLevel0).toBeUint(0);

      const { result: noRulesResult } = simnet.callReadOnlyFn(
        smartWalletWithRules,
        "current-rules",
        [],
        wallet1
      );
      expect(noRulesResult).toBePrincipal(noRules);

      // 0 -> 2
      simnet.callPublicFn(
        smartWalletWithRules,
        "set-security-level",
        [Cl.uint(2)],
        deployer
      );

      const securityLevel2 = simnet.getDataVar(
        smartWalletWithRules,
        "security-level"
      );
      expect(securityLevel2).toBeUint(2);

      const { result: emergencyRulesResult } = simnet.callReadOnlyFn(
        smartWalletWithRules,
        "current-rules",
        [],
        wallet1
      );
      expect(emergencyRulesResult).toBePrincipal(emergencyRules);

      // 2 -> 1
      simnet.callPublicFn(
        smartWalletWithRules,
        "set-security-level",
        [Cl.uint(1)],
        deployer
      );

      const securityLevel1 = simnet.getDataVar(
        smartWalletWithRules,
        "security-level"
      );
      expect(securityLevel1).toBeUint(1);

      const { result: standardRulesResult } = simnet.callReadOnlyFn(
        smartWalletWithRules,
        "current-rules",
        [],
        wallet1
      );
      expect(standardRulesResult).toBePrincipal(standardRules);
    });

    // TODO: This test is failing, no handling of invalid security level in the
    // contract yet.
    // it("admin cannot set an invalid security level", async () => {
    //   const invalidSecurityLevel = 3;

    //   const { result: setSecurityLevelResult } = simnet.callPublicFn(
    //     smartWalletWithRules,
    //     "set-security-level",
    //     [Cl.uint(invalidSecurityLevel)],
    //     deployer
    //   );

    //   expect(setSecurityLevelResult).toHaveClarityType(ClarityType.ResponseErr);
    // });

    it("non-admin cannot update security level", () => {
      const { result: setSecurityLevelResult } = simnet.callPublicFn(
        smartWalletWithRules,
        "set-security-level",
        [Cl.uint(1)],
        wallet1
      );

      expect(setSecurityLevelResult).toBeErr(
        Cl.uint(contracts.smartWalletWithRules.constants.errUnauthorised.value)
      );
    });
  });

  describe("Rules Engine Integration", () => {
    it("level 1 wallet can transfer stx to a standard recipient within the per-tx limit", () => {
      const transferAmount = 99 * ONE_STX;
      const stxTransfer = tx.transferSTX(
        transferAmount,
        smartWalletWithRules,
        wallet1
      );
      simnet.mineBlock([stxTransfer]);

      const { result: stxTransferResult } = simnet.callPublicFn(
        smartWalletWithRules,
        "stx-transfer",
        [Cl.uint(transferAmount), Cl.principal(wallet2), Cl.none()],
        wallet1
      );
      expect(stxTransferResult).toBeOk(trueCV());
    });

    it("level 1 wallet cannot transfer stx to a standard recipient outside the per-tx limit", () => {
      const transferAmount = 100 * ONE_STX;
      const stxTransfer = tx.transferSTX(
        transferAmount,
        smartWalletWithRules,
        wallet1
      );
      simnet.mineBlock([stxTransfer]);

      const { result: stxTransferResult } = simnet.callPublicFn(
        smartWalletWithRules,
        "stx-transfer",
        [Cl.uint(transferAmount), Cl.principal(wallet2), Cl.none()],
        wallet1
      );
      expect(stxTransferResult).toBeErr(
        Cl.uint(contracts.standardRules.constants.errPerTxLimit.value)
      );
    });

    it("level 1 wallet cannot transfer stx to a standard recipient outside the weekly limit", () => {
      const transferAmount = 1000 * ONE_STX;
      const stxTransfer = tx.transferSTX(
        transferAmount,
        smartWalletWithRules,
        wallet1
      );
      simnet.mineBlock([stxTransfer]);

      const { result: stxTransferResult } = simnet.callPublicFn(
        smartWalletWithRules,
        "stx-transfer",
        [Cl.uint(transferAmount), Cl.principal(wallet2), Cl.none()],
        wallet1
      );
      expect(stxTransferResult).toBeErr(
        Cl.uint(contracts.standardRules.constants.errPerTxLimit.value)
      );
    });

    it("level 1 wallet cannot repeat transfers outside the weekly limit", () => {
      const oneTransferAmount = 99 * ONE_STX;
      // 10 valid transfers, the 11th transfer exceeds the weekly limit
      const totalTransferAmount = 11 * oneTransferAmount;

      const stxTransfer = tx.transferSTX(
        totalTransferAmount,
        smartWalletWithRules,
        wallet1
      );
      simnet.mineBlock([stxTransfer]);

      // 10 valid transfers: amount of each transfer is within the per-tx limit
      for (let i = 0; i < 10; i++) {
        const { result: validStxTransferResult } = simnet.callPublicFn(
          smartWalletWithRules,
          "stx-transfer",
          [Cl.uint(oneTransferAmount), Cl.principal(wallet2), Cl.none()],
          wallet1
        );
        expect(validStxTransferResult).toBeOk(trueCV());
      }

      // 11th transfer: amount of transfer is outside the weekly limit
      const { result: stxTransferResult } = simnet.callPublicFn(
        smartWalletWithRules,
        "stx-transfer",
        [Cl.uint(oneTransferAmount), Cl.principal(wallet2), Cl.none()],
        wallet1
      );

      expect(stxTransferResult).toBeErr(
        Cl.uint(contracts.standardRules.constants.errWeeklyLimit.value)
      );
    });

    it("level 0 wallet can transfer unlimited amount of stx to a standard recipient", () => {
      const transferAmount = 1_000_000 * ONE_STX;

      const stxTransfer = tx.transferSTX(
        transferAmount,
        smartWalletWithRules,
        wallet1
      );
      simnet.mineBlock([stxTransfer]);

      simnet.callPublicFn(
        smartWalletWithRules,
        "set-security-level",
        [Cl.uint(0)],
        deployer
      );

      const { result: stxTransferResult } = simnet.callPublicFn(
        smartWalletWithRules,
        "stx-transfer",
        [Cl.uint(transferAmount), Cl.principal(wallet2), Cl.none()],
        wallet1
      );
      expect(stxTransferResult).toBeOk(trueCV());
    });

    it("level 2 wallet cannot transfer any amount of stx to a standard recipient", () => {
      const transferAmount = ONE_STX;
      const stxTransfer = tx.transferSTX(
        transferAmount,
        smartWalletWithRules,
        wallet1
      );
      simnet.mineBlock([stxTransfer]);

      simnet.callPublicFn(
        smartWalletWithRules,
        "set-security-level",
        [Cl.uint(2)],
        deployer
      );

      const { result: stxTransferResult } = simnet.callPublicFn(
        smartWalletWithRules,
        "stx-transfer",
        [Cl.uint(transferAmount), Cl.principal(wallet2), Cl.none()],
        wallet1
      );
      expect(stxTransferResult).toBeErr(
        Cl.uint(contracts.emergencyRules.constants.errEmergencyLockdown.value)
      );
    });
  });

  describe("Token Transfers Limitations", () => {
    it("transferring sip10 tokens fails because tx-sender is not the token sender", () => {
      const sip010Contract = deployments.nope.simnet;
      const transferAmount = 100;
      const { result: sip010TransferResult } = simnet.callPublicFn(
        smartWalletWithRules,
        "sip010-transfer",
        [
          Cl.uint(transferAmount),
          Cl.principal(wallet2),
          Cl.none(),
          Cl.principal(sip010Contract),
        ],
        wallet1
      );

      // nope contract defines that tx-sender must be the token sender
      expect(sip010TransferResult).toBeErr(
        Cl.uint(contracts.smartWalletWithRules.constants.errUnauthorised.value)
      );
    });

    it("transferring sip09 tokens fails because tx-sender is not the token sender", () => {
      const { result: sip09TransferResult } = simnet.callPublicFn(
        smartWalletWithRules,
        "sip009-transfer",
        [
          Cl.uint(1),
          Cl.principal(wallet2),
          Cl.principal(deployments.ogBitcoinPizzaLeatherEdition.simnet),
        ],
        wallet1
      );

      expect(sip09TransferResult).toBeErr(
        Cl.uint(errorCodes.ogBitcoinPizzaLeatherEdition.NOT_AUTHORIZED)
      );
    });
  });

  describe("Admin Logic", () => {
    it("checks that is-admin-calling is working", async () => {
      const { result: isAdminCallingResult } = simnet.callReadOnlyFn(
        smartWalletWithRules,
        "is-admin-calling",
        [],
        wallet1
      );

      expect(isAdminCallingResult).toBeErr(
        Cl.uint(contracts.smartWalletWithRules.constants.errUnauthorised.value)
      );
    });

    it("non-admin cannot enable admin", async () => {
      const adminAddress = standardPrincipalCV(wallet1);
      const enableAdmin = simnet.callPublicFn(
        smartWalletWithRules,
        "enable-admin",
        [adminAddress, Cl.bool(true)],
        wallet1
      );

      expect(enableAdmin.result).toBeErr(
        Cl.uint(contracts.smartWalletWithRules.constants.errUnauthorised.value)
      );
    });
  });
});
