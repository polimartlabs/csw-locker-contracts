import { hexToCvValue } from "@clarigen/core";

export const errorCodes = {
  emergencyRules: {
    EMERGENCY_LOCKDOWN: 401,
  },
  standardRules: {
    PER_TX_LIMIT: 402,
    WEEKLY_LIMIT: 403,
  },
  general: {
    NOT_ENOUGH_BALANCE: 1,
  },
  ogBitcoinPizzaLeatherEdition: {
    NOT_AUTHORIZED: 101,
  },
  smartWalletStandard: {
    UNAUTHORISED: 4001,
    FORBIDDEN: 4003,
  },
  smartWalletWithRules: {
    UNAUTHORISED: 401,
    FORBIDDEN: 403,
  },
  xBTC: {
    ORIGINATOR_NOT_SENDER: 4,
  },
};

export const getStxBalance = (address: string) => {
  const balanceHex = simnet.runSnippet(`(stx-get-balance '${address})`);
  const balanceBigInt = hexToCvValue(balanceHex);
  return Number(balanceBigInt);
};
