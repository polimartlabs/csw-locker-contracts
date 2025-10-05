import { initSimnet } from "@hirosystems/clarinet-sdk";
import { Cl, serializeCV } from "@stacks/transactions";
import { describe, expect, it } from "vitest";
import { accounts, deployments } from "../clarigen/src/clarigen-types";
import {
  errorCodes,
  getStxBalance,
  getStxMemoPrintEvent,
  initAndSendWrappedBitcoin,
} from "./testUtils";
import { tx } from "@hirosystems/clarinet-sdk";

const simnet = await initSimnet();

const deployer = accounts.deployer.address;
const address1 = accounts.wallet_1.address;
const address2 = accounts.wallet_2.address;
const address3 = accounts.wallet_3.address;

const smartWalletGroup = deployments.smartWalletGroup.simnet;
const sip009Contract = deployments.ogBitcoinPizzaLeatherEdition.simnet;
const sip009Deployer =
  deployments.ogBitcoinPizzaLeatherEdition.simnet.split(".")[0];
const extTestContract = deployments.extTest.simnet;
const wrappedBitcoinContract = deployments.wrappedBitcoin.simnet;

if (!deployer || !address2 || !address3) {
  throw new Error("One or more required addresses are undefined.");
}

describe("Smart Wallet Group", () => {
  describe("STX Transfer", () => {
    it("can transfer 100 stx from overfunded smart wallet to standard recipient", () => {
      const transferAmount = 100;
      const overfundedAmount = 1;
      const smartWalletFunds = transferAmount + overfundedAmount;
      const stxTransfer = tx.transferSTX(
        smartWalletFunds,
        deployments.smartWalletGroup.simnet,
        address1
      );
      simnet.mineBlock([stxTransfer]);

      const { result: transferResponse } = simnet.callPublicFn(
        smartWalletGroup,
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
        deployments.smartWalletGroup.simnet,
        address1
      );
      simnet.mineBlock([stxTransfer]);

      const { result: transferResponse } = simnet.callPublicFn(
        smartWalletGroup,
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
        deployments.smartWalletGroup.simnet,
        address1
      );
      simnet.mineBlock([stxTransfer]);

      const { result: transferResponse } = simnet.callPublicFn(
        smartWalletGroup,
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
        deployments.smartWalletGroup.simnet,
        address1
      );
      simnet.mineBlock([stxTransfer]);

      const { events: stxTransferEvents } = simnet.callPublicFn(
        smartWalletGroup,
        "stx-transfer",
        [transferAmountCV, Cl.principal(address2), someMemoCV],
        deployer
      );

      const expectedMemoPrintEvent = getStxMemoPrintEvent(
        transferAmount,
        deployments.smartWalletGroup.simnet,
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

    it("transferring 100 stx from group smart wallet correctly updates the balances", () => {
      const transferAmount = 100;
      const transferAmountCV = Cl.uint(transferAmount);
      const recipientAddress = address2;
      const recipientBalanceBefore = getStxBalance(simnet, recipientAddress);
      const stxTransfer = tx.transferSTX(
        transferAmount,
        smartWalletGroup,
        address1
      );
      simnet.mineBlock([stxTransfer]);

      simnet.callPublicFn(
        smartWalletGroup,
        "stx-transfer",
        [transferAmountCV, Cl.principal(address2), Cl.none()],
        deployer
      );

      const smartWalletBalanceAfterTransfer = getStxBalance(
        simnet,
        deployments.smartWalletGroup.simnet
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

    it("non-admin cannot transfer stx from group smart wallet", () => {
      const transferAmount = 100;
      const transferAmountCV = Cl.uint(transferAmount);

      const { result: transferResponse } = simnet.callPublicFn(
        smartWalletGroup,
        "stx-transfer",
        [transferAmountCV, Cl.principal(address2), Cl.none()],
        address1
      );

      expect(transferResponse).toBeErr(
        Cl.uint(errorCodes.smartWalletGroup.UNAUTHORISED)
      );
    });
  });

  describe("SIP-010 Transfer", () => {
    it("transferring 100 sip10 tokens fails because tx-sender is not the token sender", () => {
      const transferAmount = 100;

      initAndSendWrappedBitcoin(simnet, transferAmount, smartWalletGroup);

      const { result: sip10transferResult } = simnet.callPublicFn(
        smartWalletGroup,
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
      // transfer NFT to group smart wallet
      const { result: deployerTransferNftResult } = simnet.callPublicFn(
        sip009Contract,
        "transfer",
        [
          Cl.uint(NftId),
          Cl.principal(sip009Deployer),
          Cl.contractPrincipal(deployer, smartWalletGroup),
        ],
        sip009Deployer
      );
      expect(deployerTransferNftResult).toBeOk(Cl.bool(true));

      // transfer from group smart wallet
      const { result: sip9transferResult } = simnet.callPublicFn(
        smartWalletGroup,
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
    it("admin can call extension with payload from group smart wallet", () => {
      const payload = Cl.principal(smartWalletGroup);

      const { result: extensionCallResult } = simnet.callPublicFn(
        smartWalletGroup,
        "extension-call",
        [
          Cl.principal(extTestContract),
          Cl.bufferFromHex(Cl.serialize(payload)),
        ],
        deployer
      );

      expect(extensionCallResult).toBeOk(Cl.bool(true));
    });

    it("non-admin cannot call extension from group smart wallet", () => {
      const payload = Cl.principal(smartWalletGroup);

      const { result: extensionCallResult } = simnet.callPublicFn(
        smartWalletGroup,
        "extension-call",
        [
          Cl.principal(extTestContract),
          Cl.bufferFromHex(Cl.serialize(payload)),
        ],
        address1
      );

      expect(extensionCallResult).toBeErr(
        Cl.uint(errorCodes.smartWalletGroup.UNAUTHORISED)
      );
    });
  });

  describe("Admin Management Flows", () => {
    it("admins map is properly initialized on deployment", () => {
      const deployerMapEntry = simnet.getMapEntry(
        smartWalletGroup,
        "admins",
        Cl.principal(deployer)
      );
      const smartWalletMapEntry = simnet.getMapEntry(
        smartWalletGroup,
        "admins",
        Cl.principal(smartWalletGroup)
      );

      expect(deployerMapEntry).toBeSome(Cl.bool(true));
      expect(smartWalletMapEntry).toBeSome(Cl.bool(true));
    });

    it("admin can enable another address as admin", () => {
      const newAdminAddressCV = Cl.principal(address3);

      const { result: enableAdminResponse } = simnet.callPublicFn(
        smartWalletGroup,
        "enable-admin",
        [newAdminAddressCV, Cl.bool(true)],
        deployer
      );

      expect(enableAdminResponse).toBeOk(Cl.bool(true));
    });

    it("new admin is added to admins map after being enabled as admin", () => {
      const newAdminAddressCV = Cl.principal(address3);

      const { result: enableAdminResult } = simnet.callPublicFn(
        smartWalletGroup,
        "enable-admin",
        [newAdminAddressCV, Cl.bool(true)],
        deployer
      );
      expect(enableAdminResult).toBeOk(Cl.bool(true));

      const newAdminMapEntry = simnet.getMapEntry(
        smartWalletGroup,
        "admins",
        newAdminAddressCV
      );
      expect(newAdminMapEntry).toBeSome(Cl.bool(true));
    });

    it("admin cannot enable himself as admin", () => {
      const { result: enableAdminResult } = simnet.callPublicFn(
        smartWalletGroup,
        "enable-admin",
        [Cl.principal(deployer), Cl.bool(true)],
        deployer
      );

      expect(enableAdminResult).toBeErr(
        Cl.uint(errorCodes.smartWalletGroup.FORBIDDEN)
      );
    });

    it("non-admin cannot enable another address as admin", () => {
      const newAdminAddressCV = Cl.principal(address1);

      const enableAdmin = simnet.callPublicFn(
        smartWalletGroup,
        "enable-admin",
        [newAdminAddressCV, Cl.bool(true)],
        address1 // not current admin
      );

      expect(enableAdmin.result).toBeErr(
        Cl.uint(errorCodes.smartWalletGroup.UNAUTHORISED)
      );
    });

    it("admin can transfer wallet to new admin", () => {
      const newAdminAddress = Cl.principal(address3);

      const { result: transferWalletResult } = simnet.callPublicFn(
        smartWalletGroup,
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
        smartWalletGroup,
        "transfer-wallet",
        [newAdminAddressCV],
        deployer
      );
      expect(transferWalletResult).toBeOk(Cl.bool(true));

      const exAdminMapEntry = simnet.getMapEntry(
        smartWalletGroup,
        "admins",
        exAdminAddressCV
      );
      expect(exAdminMapEntry).toBeNone();
      const newAdminMapEntry = simnet.getMapEntry(
        smartWalletGroup,
        "admins",
        newAdminAddressCV
      );
      expect(newAdminMapEntry).toBeSome(Cl.bool(true));
    });

    it("non-admin cannot transfer wallet", () => {
      const newAdminAddressCV = Cl.principal(address1);

      const { result: transferWallet } = simnet.callPublicFn(
        smartWalletGroup,
        "transfer-wallet",
        [newAdminAddressCV],
        address1
      );

      expect(transferWallet).toBeErr(
        Cl.uint(errorCodes.smartWalletGroup.UNAUTHORISED)
      );
    });
  });
});
