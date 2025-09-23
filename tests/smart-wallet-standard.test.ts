import { initSimnet, tx } from "@hirosystems/clarinet-sdk";
import {
  Cl,
  ClarityType,
  cvToString,
  cvToValue,
  hexToCV,
  serializeCV,
} from "@stacks/transactions";
import { describe, expect, it } from "vitest";
import { deployments } from "../clarigen/src/clarigen-types";

const simnet = await initSimnet();

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const address1 = accounts.get("wallet_1")!;
const address2 = accounts.get("wallet_2")!;
const address3 = accounts.get("wallet_3")!;

// General error codes
const ERR_NOT_ENOUGH_BALANCE = 1;
// Smart Wallet Standard error codes
const ERR_UNAUTHORISED = 4001;
const ERR_FORBIDDEN = 4003;
// xBTC error codes
const XBTC_ORIGINATOR_NOT_SENDER = 4;

if (!deployer || !address2 || !address3) {
  throw new Error("One or more required addresses are undefined.");
}

const address2CV = Cl.standardPrincipal(address2);
const noneMemoCV = Cl.none();

const sip010Contract = Cl.contractPrincipal(
  "SP32AEEF6WW5Y0NMJ1S8SBSZDAY8R5J32NBZFPKKZ",
  "nope"
);
const sip009Deployer = "SP16GEW6P7GBGZG0PXRXFJEMR3TJHJEY2HJKBP1P5";
const sip009ContractCV = Cl.contractPrincipal(
  sip009Deployer,
  "og-bitcoin-pizza-leather-edition"
);
const extTestCV = Cl.contractPrincipal(simnet.deployer, "ext-test");

const smartWalletStandard = "smart-wallet-standard";
const xBTC = "Wrapped-Bitcoin";
const wrappedBitcoinDeployer = "SP3DX3H4FEYZJZ586MFBS25ZW3HZDMEW92260R2PR";
const wrappedBitcoinContractCV = Cl.contractPrincipal(
  wrappedBitcoinDeployer,
  xBTC
);

const getStxBalance = (address: string) => {
  const balanceHex = simnet.runSnippet(`(stx-get-balance '${address})`);
  const balanceBigInt = cvToValue(hexToCV(balanceHex));

  return Number(balanceBigInt);
};

const getStxPrintEvent = (
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
        [Cl.uint(transferAmount), address2CV, noneMemoCV],
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
        [Cl.uint(transferAmount), address2CV, noneMemoCV],
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
        [Cl.uint(transferAmount), address2CV, noneMemoCV],
        deployer
      );

      expect(transferResponse).toBeErr(Cl.uint(ERR_NOT_ENOUGH_BALANCE));
    });

    it("transferring 100 stx with a memo correctly prints it", () => {
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
        [transferAmountCV, address2CV, someMemoCV],
        deployer
      );

      const expectedPrintEvent = getStxPrintEvent(
        transferAmount,
        deployments.smartWalletStandard.simnet,
        cvToString(address2CV),
        testMemo
      );
      const [, memoPrintEvent] = stxTransferEvents;

      expect(stxTransferEvents.length).toBe(2);
      expect(memoPrintEvent).toEqual(expectedPrintEvent);
    });

    it("transferring 100 stx from smart wallet correctly updates the balances", () => {
      const transferAmount = 100;
      const transferAmountCV = Cl.uint(transferAmount);
      const recipientAddress = cvToString(address2CV);
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
        [transferAmountCV, address2CV, noneMemoCV],
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
        [transferAmountCV, address2CV, noneMemoCV],
        address1
      );

      expect(transferResponse).toBeErr(Cl.uint(ERR_UNAUTHORISED));
    });
  });

  describe("SIP-010 Transfer", () => {
    it("transfers 100 sip10 tokens to wallet", () => {
      const transferAmount = 100;

      const block = simnet.mineBlock([
        tx.callPublicFn(
          cvToString(wrappedBitcoinContractCV),
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
          cvToString(wrappedBitcoinContractCV),
          "add-principal-to-role",
          [
            Cl.uint(1), // minter
            Cl.principal(deployer),
          ],
          deployer
        ),
        tx.callPublicFn(
          cvToString(wrappedBitcoinContractCV),
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
          address2CV,
          noneMemoCV,
          wrappedBitcoinContractCV,
        ],
        deployer
      );

      // xBTC defines that tx-sender must be token sender
      expect(sip10transferResult).toBeErr(Cl.uint(XBTC_ORIGINATOR_NOT_SENDER));
    });
  });

  describe("SIP-009 Transfer", () => {
    it("transfers 1 Nft to wallet", () => {
      const NftId = Cl.uint(99);
      // transfer NFT to smart wallet
      const { result: initTxResult } = simnet.callPublicFn(
        cvToString(sip009ContractCV),
        "transfer",
        [
          NftId,
          Cl.principal(sip009Deployer),
          Cl.contractPrincipal(deployer, smartWalletStandard),
        ],
        sip009Deployer
      );
      expect(initTxResult).toBeOk(Cl.bool(true));

      // transfer from smart wallet
      const { result: sip9transferResult } = simnet.callPublicFn(
        smartWalletStandard,
        "sip009-transfer",
        [NftId, address2CV, sip009ContractCV],
        deployer
      );

      expect(sip9transferResult).toBeErr(Cl.uint(101)); // nft defines that tx-sender must be owner
    });
  });

  describe("Extension Call", () => {
    it("admin can call extension with payload", () => {
      const payload = Cl.contractPrincipal(deployer, smartWalletStandard);

      const { result: extensionCallResult } = simnet.callPublicFn(
        smartWalletStandard,
        "extension-call",
        [extTestCV, Cl.bufferFromHex(Cl.serialize(payload))],
        deployer
      );

      expect(extensionCallResult.type).toBe(ClarityType.ResponseOk); // ext-test `call` function return type is response
    });

    it("non-admin cannot call extension", () => {
      const payload = Cl.contractPrincipal(deployer, smartWalletStandard);

      const { result: extensionCallResult } = simnet.callPublicFn(
        smartWalletStandard,
        "extension-call",
        [extTestCV, Cl.bufferFromHex(Cl.serialize(payload))],
        address1
      );

      expect(extensionCallResult).toBeErr(Cl.uint(ERR_UNAUTHORISED));
    });
  });

  describe("Admin Logic", () => {
    it("admins map is properly initialized on deployment", () => {
      const deployerMapEntry = simnet.getMapEntry(
        smartWalletStandard,
        "admins",
        Cl.standardPrincipal(deployer)
      );
      const smartWalletMapEntry = simnet.getMapEntry(
        smartWalletStandard,
        "admins",
        Cl.contractPrincipal(deployer, smartWalletStandard)
      );

      expect(deployerMapEntry).toBeSome(Cl.bool(true));
      expect(smartWalletMapEntry).toBeSome(Cl.bool(true));
    });

    it("admin can enable another address as admin", () => {
      const newAdminAddressCV = Cl.standardPrincipal(address3);

      const { result: enableAdminResponse } = simnet.callPublicFn(
        smartWalletStandard,
        "enable-admin",
        [newAdminAddressCV, Cl.bool(true)],
        deployer
      );

      expect(enableAdminResponse).toBeOk(Cl.bool(true));
    });

    it("new admin is added to admins map after being enabled as admin", () => {
      const newAdminAddressCV = Cl.standardPrincipal(address3);

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

      expect(enableAdminResult).toBeErr(Cl.uint(ERR_FORBIDDEN));
    });

    it("non-admin cannot enable another address as admin", () => {
      const newAdminAddressCV = Cl.standardPrincipal(address1);

      const enableAdmin = simnet.callPublicFn(
        "smart-wallet-standard",
        "enable-admin",
        [newAdminAddressCV, Cl.bool(true)],
        address1 // not current admin
      );

      expect(enableAdmin.result).toBeErr(Cl.uint(ERR_UNAUTHORISED));
    });

    it("admin can transfer wallet to new admin", () => {
      const newAdminAddress = Cl.standardPrincipal(address3);

      const { result: transferWalletResult } = simnet.callPublicFn(
        smartWalletStandard,
        "transfer-wallet",
        [newAdminAddress],
        deployer
      );

      expect(transferWalletResult).toBeOk(Cl.bool(true));
    });

    it("admins map is correctly updated after transferring wallet", () => {
      const exAdminAddressCV = Cl.standardPrincipal(deployer);
      const newAdminAddressCV = Cl.standardPrincipal(address3);

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
      const newAdminAddressCV = Cl.standardPrincipal(address1);

      const { result: transferWallet } = simnet.callPublicFn(
        smartWalletStandard,
        "transfer-wallet",
        [newAdminAddressCV],
        address1
      );

      expect(transferWallet).toBeErr(Cl.uint(ERR_UNAUTHORISED));
    });
  });
});
