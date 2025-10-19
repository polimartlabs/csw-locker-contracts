export type Model = {
  accountBalances: {
    [address: STXAddress]: AccountBalances;
  };
  deployedSmartWallets: {
    contractId: string;
    deployer: AccountObject;
    contractName: string;
    owner: AccountObject;
    admins: STXAddress[];
    balances: AccountBalances;
  }[];
  registry: {
    cswIndex: number;
    registeredWallets: {
      contractId: string;
      owner: STXAddress;
      cswIndex: number;
    }[];
  };
};

export type STXAddress = string;
export type AccountBalances = {
  uSTX: number;
  SIP010: {
    [contractId: string]: number;
  };
  SIP009: {
    [contractId: string]: { tokenName: string; tokenId: string }[];
  };
};
export type AccountObject = {
  label: string;
  address: STXAddress;
};
