import { initSimnet, tx } from "@hirosystems/clarinet-sdk";
import { Cl, serializeCV } from "@stacks/transactions";
import { describe, expect, it } from "vitest";
import { accounts, deployments } from "../clarigen/src/clarigen-types";
import { errorCodes, getStxBalance } from "./testUtils";

const simnet = await initSimnet();

const deployer = accounts.deployer.address;
const address1 = accounts.wallet_1.address;
const address2 = accounts.wallet_2.address;
const address3 = accounts.wallet_3.address;

if (!deployer || !address2 || !address3) {
  throw new Error("One or more required addresses are undefined.");
}

const noneMemoCV = Cl.none();

const sip010Contract = deployments.nope.simnet;
const sip009Contract = deployments.ogBitcoinPizzaLeatherEdition.simnet;
const sip009Deployer =
  deployments.ogBitcoinPizzaLeatherEdition.simnet.split(".")[0];
const extTestContract = deployments.extTest.simnet;

const smartWalletStandard = deployments.smartWalletStandard.simnet;
const wrappedBitcoinContract = deployments.wrappedBitcoin.simnet;
const wrappedBitcoinDeployer = wrappedBitcoinContract.split(".")[0];

const getStxMemoPrintEvent = (
  amount: number,
  sender: string,
  recipient: string,
  memo: string
) => {
  const memoString = serializeCV(Cl.stringAscii(memo));
  return {
    data: { amount: amount.toString(), sender, recipient, memo: memoString },
    event: "stx_transfer_event",
  };
};

describe("Standard Smart Wallet", () => {
  describe("STX Transfer", () => {
    it("can transfer 100 stx from overfunded smart wallet to standard recipient", () => {
      const transferAmount = 100;
      const overfundedAmount = 1;
      const smartWalletFunds = transferAmount + overfundedAmount;
      const stxTransfer = tx.transferSTX(
        smartWalletFunds,
        deployments.smartWalletStandard.simnet,
        address1
      );
      simnet.mineBlock([stxTransfer]);

      const { result: transferResponse } = simnet.callPublicFn(
        smartWalletStandard,
        "stx-transfer",
        [Cl.uint(transferAmount), Cl.principal(address2), noneMemoCV],
        deployer
      );

      expect(transferResponse).toBeOk(Cl.bool(true));
    });

    it("can transfer 100 stx from fully funded smart wallet to standard recipient", () => {
      const transferAmount = 100;
      const stxTransfer = tx.transferSTX(
        transferAmount,
        deployments.smartWalletStandard.simnet,
        address1
      );
      simnet.mineBlock([stxTransfer]);

      const { result: transferResponse } = simnet.callPublicFn(
        smartWalletStandard,
        "stx-transfer",
        [Cl.uint(transferAmount), Cl.principal(address2), noneMemoCV],
        deployer
      );

      expect(transferResponse).toBeOk(Cl.bool(true));
    });

    it("cannot transfer 100 stx from underfunded smart wallet to standard recipient", () => {
      const transferAmount = 100;
      const smartWalletFunds = transferAmount - 1;
      const stxTransfer = tx.transferSTX(
        smartWalletFunds,
        deployments.smartWalletStandard.simnet,
        address1
      );
      simnet.mineBlock([stxTransfer]);

      const { result: transferResponse } = simnet.callPublicFn(
        smartWalletStandard,
        "stx-transfer",
        [Cl.uint(transferAmount), Cl.principal(address2), noneMemoCV],
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
        deployments.smartWalletStandard.simnet,
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
        deployments.smartWalletStandard.simnet,
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
      const recipientBalanceBefore = getStxBalance(recipientAddress);
      const stxTransfer = tx.transferSTX(
        transferAmount,
        deployments.smartWalletStandard.simnet,
        address1
      );
      simnet.mineBlock([stxTransfer]);

      simnet.callPublicFn(
        smartWalletStandard,
        "stx-transfer",
        [transferAmountCV, Cl.principal(address2), noneMemoCV],
        deployer
      );

      const smartWalletBalanceAfterTransfer = getStxBalance(
        deployments.smartWalletStandard.simnet
      );
      const recipientBalanceAfterTransfer = getStxBalance(recipientAddress);

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
        [transferAmountCV, Cl.principal(address2), noneMemoCV],
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

      const block = simnet.mineBlock([
        tx.callPublicFn(
          wrappedBitcoinContract,
          "initialize",
          [
            Cl.stringAscii("Wrapped Bitcoin"),
            Cl.stringAscii("xBTC"),
            Cl.uint(8),
            Cl.principal(deployer), // initial-owner
          ],
          wrappedBitcoinDeployer
        ),
        tx.callPublicFn(
          wrappedBitcoinContract,
          "add-principal-to-role",
          [
            Cl.uint(1), // minter
            Cl.principal(deployer),
          ],
          deployer
        ),
        tx.callPublicFn(
          wrappedBitcoinContract,
          "mint-tokens",
          [
            Cl.uint(100000000000000),
            Cl.contractPrincipal(deployer, smartWalletStandard),
          ],
          deployer
        ),
      ]);

      const [
        { result: initializeResult },
        { result: addPrincipalToRoleResult },
        { result: mintTokensResult },
      ] = block;

      expect(initializeResult).toBeOk(Cl.bool(true));
      expect(addPrincipalToRoleResult).toBeOk(Cl.bool(true));
      expect(mintTokensResult).toBeOk(Cl.bool(true));

      const { result: sip10transferResult } = simnet.callPublicFn(
        smartWalletStandard,
        "sip010-transfer",
        [
          Cl.uint(transferAmount),
          Cl.principal(address2),
          noneMemoCV,
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

    it("admin can enable another address as admin", () => {
      const newAdminAddressCV = Cl.principal(address3);

      const { result: enableAdminResponse } = simnet.callPublicFn(
        smartWalletStandard,
        "enable-admin",
        [newAdminAddressCV, Cl.bool(true)],
        deployer
      );

      expect(enableAdminResponse).toBeOk(Cl.bool(true));
    });

    it("new admin is added to admins map after being enabled as admin", () => {
      const newAdminAddressCV = Cl.principal(address3);

      const { result: enableAdminResult } = simnet.callPublicFn(
        smartWalletStandard,
        "enable-admin",
        [newAdminAddressCV, Cl.bool(true)],
        deployer
      );
      expect(enableAdminResult).toBeOk(Cl.bool(true));

      const newAdminMapEntry = simnet.getMapEntry(
        smartWalletStandard,
        "admins",
        newAdminAddressCV
      );
      expect(newAdminMapEntry).toBeSome(Cl.bool(true));
    });

    it("admin cannot enable himself as admin", () => {
      const { result: enableAdminResult } = simnet.callPublicFn(
        smartWalletStandard,
        "enable-admin",
        [Cl.principal(deployer), Cl.bool(true)],
        deployer
      );

      expect(enableAdminResult).toBeErr(
        Cl.uint(errorCodes.smartWalletStandard.FORBIDDEN)
      );
    });

    it("non-admin cannot enable another address as admin", () => {
      const newAdminAddressCV = Cl.principal(address1);

      const enableAdmin = simnet.callPublicFn(
        "smart-wallet-standard",
        "enable-admin",
        [newAdminAddressCV, Cl.bool(true)],
        address1 // not current admin
      );

      expect(enableAdmin.result).toBeErr(
        Cl.uint(errorCodes.smartWalletStandard.UNAUTHORISED)
      );
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
