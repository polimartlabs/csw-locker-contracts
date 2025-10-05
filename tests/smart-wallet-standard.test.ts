import { initSimnet, tx } from "@hirosystems/clarinet-sdk";
import { Cl, serializeCV } from "@stacks/transactions";
import { describe, expect, it } from "vitest";
import { accounts, deployments } from "../clarigen/src/clarigen-types";
import {
  errorCodes,
  getStxBalance,
  getStxMemoPrintEvent,
  initAndSendWrappedBitcoin,
} from "./testUtils";

const simnet = await initSimnet();

const deployer = accounts.deployer.address;
const address1 = accounts.wallet_1.address;
const address2 = accounts.wallet_2.address;
const address3 = accounts.wallet_3.address;

if (!deployer || !address2 || !address3) {
  throw new Error("One or more required addresses are undefined.");
}

const sip010Contract = deployments.nope.simnet;
const sip009Contract = deployments.ogBitcoinPizzaLeatherEdition.simnet;
const sip009Deployer = sip009Contract.split(".")[0];
const extTestContract = deployments.extTest.simnet;

const smartWalletStandard = deployments.smartWalletStandard.simnet;
const wrappedBitcoinContract = deployments.wrappedBitcoin.simnet;

describe("Standard Smart Wallet", () => {
  describe("STX Transfer", () => {
    it("can transfer 100 stx from overfunded smart wallet to standard recipient", () => {
      const transferAmount = 100;
      const overfundedAmount = 1;
      const smartWalletFunds = transferAmount + overfundedAmount;
      const stxTransfer = tx.transferSTX(
        smartWalletFunds,
        smartWalletStandard,
        address1
      );
      simnet.mineBlock([stxTransfer]);

      const { result: transferResponse } = simnet.callPublicFn(
        smartWalletStandard,
        "stx-transfer",
        [Cl.uint(transferAmount), Cl.principal(address2), Cl.none()],
        deployer
      );

      expect(transferResponse).toBeOk(Cl.bool(true));
    });

    it("can transfer 100 stx from fully funded smart wallet to standard recipient", () => {
      const transferAmount = 100;
      const stxTransfer = tx.transferSTX(
        transferAmount,
        smartWalletStandard,
        address1
      );
      simnet.mineBlock([stxTransfer]);

      const { result: transferResponse } = simnet.callPublicFn(
        smartWalletStandard,
        "stx-transfer",
        [Cl.uint(transferAmount), Cl.principal(address2), Cl.none()],
        deployer
      );

      expect(transferResponse).toBeOk(Cl.bool(true));
    });

    it("cannot transfer 100 stx from underfunded smart wallet to standard recipient", () => {
      const transferAmount = 100;
      const smartWalletFunds = transferAmount - 1;
      const stxTransfer = tx.transferSTX(
        smartWalletFunds,
        smartWalletStandard,
        address1
      );
      simnet.mineBlock([stxTransfer]);

      const { result: transferResponse } = simnet.callPublicFn(
        smartWalletStandard,
        "stx-transfer",
        [Cl.uint(transferAmount), Cl.principal(address2), Cl.none()],
        deployer
      );

      expect(transferResponse).toBeErr(
        Cl.uint(errorCodes.general.NOT_ENOUGH_BALANCE)
      );
    });

    it("transferring 100 stx with a memo correctly prints the events", () => {
      const transferAmount = 100;
      const transferAmountCV = Cl.uint(transferAmount);
      const testMemo = "test memo";
      const someMemoCV = Cl.some(
        Cl.bufferFromHex(serializeCV(Cl.stringAscii(testMemo)))
      );
      const stxTransfer = tx.transferSTX(
        transferAmount,
        smartWalletStandard,
        address1
      );
      simnet.mineBlock([stxTransfer]);

      const { events: stxTransferEvents } = simnet.callPublicFn(
        smartWalletStandard,
        "stx-transfer",
        [transferAmountCV, Cl.principal(address2), someMemoCV],
        deployer
      );

      const expectedMemoPrintEvent = getStxMemoPrintEvent(
        transferAmount,
        smartWalletStandard,
        address2,
        testMemo
      );
      const [payloadPrintEvent, memoPrintEvent] = stxTransferEvents;
      expect(stxTransferEvents.length).toBe(2);
      expect(payloadPrintEvent.data.raw_value.slice(2)).toEqual(
        serializeCV(
          Cl.tuple({
            a: Cl.stringAscii("stx-transfer"),
            payload: Cl.tuple({
              amount: Cl.uint(transferAmount),
              recipient: Cl.principal(address2),
              memo: Cl.some(
                Cl.bufferFromHex(serializeCV(Cl.stringAscii(testMemo)))
              ),
            }),
          })
        )
      );
      expect(memoPrintEvent).toEqual(expectedMemoPrintEvent);
    });

    it("transferring 100 stx from smart wallet correctly updates the balances", () => {
      const transferAmount = 100;
      const transferAmountCV = Cl.uint(transferAmount);
      const recipientAddress = address2;
      const recipientBalanceBefore = getStxBalance(simnet, recipientAddress);
      const stxTransfer = tx.transferSTX(
        transferAmount,
        smartWalletStandard,
        address1
      );
      simnet.mineBlock([stxTransfer]);

      simnet.callPublicFn(
        smartWalletStandard,
        "stx-transfer",
        [transferAmountCV, Cl.principal(address2), Cl.none()],
        deployer
      );

      const smartWalletBalanceAfterTransfer = getStxBalance(
        simnet,
        smartWalletStandard
      );
      const recipientBalanceAfterTransfer = getStxBalance(
        simnet,
        recipientAddress
      );

      expect(smartWalletBalanceAfterTransfer).toBe(0);
      expect(recipientBalanceAfterTransfer).toBe(
        recipientBalanceBefore + transferAmount
      );
    });

    it("non-admin cannot transfer stx from smart wallet", () => {
      const transferAmount = 100;
      const transferAmountCV = Cl.uint(transferAmount);

      const { result: transferResponse } = simnet.callPublicFn(
        smartWalletStandard,
        "stx-transfer",
        [transferAmountCV, Cl.principal(address2), Cl.none()],
        address1
      );

      expect(transferResponse).toBeErr(
        Cl.uint(errorCodes.smartWalletStandard.UNAUTHORISED)
      );
    });
  });

  describe("SIP-010 Transfer", () => {
    it("transferring 100 sip10 tokens fails because tx-sender is not the token sender", () => {
      const transferAmount = 100;

      initAndSendWrappedBitcoin(simnet, transferAmount, smartWalletStandard);

      const { result: sip10transferResult } = simnet.callPublicFn(
        smartWalletStandard,
        "sip010-transfer",
        [
          Cl.uint(transferAmount),
          Cl.principal(address2),
          Cl.none(),
          Cl.principal(wrappedBitcoinContract),
        ],
        deployer
      );

      // xBTC defines that tx-sender must be token sender
      expect(sip10transferResult).toBeErr(
        Cl.uint(errorCodes.xBTC.ORIGINATOR_NOT_SENDER)
      );
    });
  });

  describe("SIP-009 Transfer", () => {
    it("transfers 1 Nft to wallet", () => {
      const NftId = 99;
      // transfer NFT to smart wallet
      const { result: deployerTransferNftResult } = simnet.callPublicFn(
        sip009Contract,
        "transfer",
        [
          Cl.uint(NftId),
          Cl.principal(sip009Deployer),
          Cl.contractPrincipal(deployer, smartWalletStandard),
        ],
        sip009Deployer
      );
      expect(deployerTransferNftResult).toBeOk(Cl.bool(true));

      // transfer from smart wallet
      const { result: sip9transferResult } = simnet.callPublicFn(
        smartWalletStandard,
        "sip009-transfer",
        [Cl.uint(NftId), Cl.principal(address2), Cl.principal(sip009Contract)],
        deployer
      );

      expect(sip9transferResult).toBeErr(
        Cl.uint(errorCodes.ogBitcoinPizzaLeatherEdition.NOT_AUTHORIZED)
      );
    });
  });

  describe("Extension Call", () => {
    it("admin can call extension with payload", () => {
      const payload = Cl.principal(smartWalletStandard);

      const { result: extensionCallResult } = simnet.callPublicFn(
        smartWalletStandard,
        "extension-call",
        [
          Cl.principal(extTestContract),
          Cl.bufferFromHex(Cl.serialize(payload)),
        ],
        deployer
      );

      expect(extensionCallResult).toBeOk(Cl.bool(true));
    });

    it("non-admin cannot call extension", () => {
      const payload = Cl.principal(smartWalletStandard);

      const { result: extensionCallResult } = simnet.callPublicFn(
        smartWalletStandard,
        "extension-call",
        [
          Cl.principal(extTestContract),
          Cl.bufferFromHex(Cl.serialize(payload)),
        ],
        address1
      );

      expect(extensionCallResult).toBeErr(
        Cl.uint(errorCodes.smartWalletStandard.UNAUTHORISED)
      );
    });
  });

  describe("Admin Management Flows", () => {
    it("admins map is properly initialized on deployment", () => {
      const deployerMapEntry = simnet.getMapEntry(
        smartWalletStandard,
        "admins",
        Cl.principal(deployer)
      );
      const smartWalletMapEntry = simnet.getMapEntry(
        smartWalletStandard,
        "admins",
        Cl.principal(smartWalletStandard)
      );

      expect(deployerMapEntry).toBeSome(Cl.bool(true));
      expect(smartWalletMapEntry).toBeSome(Cl.bool(true));
    });

    it("admin can transfer wallet to new admin", () => {
      const newAdminAddress = Cl.principal(address3);

      const { result: transferWalletResult } = simnet.callPublicFn(
        smartWalletStandard,
        "transfer-wallet",
        [newAdminAddress],
        deployer
      );

      expect(transferWalletResult).toBeOk(Cl.bool(true));
    });

    it("admins map is correctly updated after transferring wallet", () => {
      const exAdminAddressCV = Cl.principal(deployer);
      const newAdminAddressCV = Cl.principal(address3);

      const { result: transferWalletResult } = simnet.callPublicFn(
        smartWalletStandard,
        "transfer-wallet",
        [newAdminAddressCV],
        deployer
      );
      expect(transferWalletResult).toBeOk(Cl.bool(true));

      const exAdminMapEntry = simnet.getMapEntry(
        smartWalletStandard,
        "admins",
        exAdminAddressCV
      );
      expect(exAdminMapEntry).toBeNone();
      const newAdminMapEntry = simnet.getMapEntry(
        smartWalletStandard,
        "admins",
        newAdminAddressCV
      );
      expect(newAdminMapEntry).toBeSome(Cl.bool(true));
    });

    it("non-admin cannot transfer wallet", () => {
      const newAdminAddressCV = Cl.principal(address1);

      const { result: transferWallet } = simnet.callPublicFn(
        smartWalletStandard,
        "transfer-wallet",
        [newAdminAddressCV],
        address1
      );

      expect(transferWallet).toBeErr(
        Cl.uint(errorCodes.smartWalletStandard.UNAUTHORISED)
      );
    });
  });
});
