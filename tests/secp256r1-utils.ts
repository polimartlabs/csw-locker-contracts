/**
 * Secp256r1 signature utilities for smart wallet standard testing.
 *
 * Provides key generation and SIP-018 message signing for signature-based
 * authentication in smart wallet operations.
 */

import { sign, generateKeyPairSync, KeyObject, createHash } from "crypto";
import { Cl, serializeCV } from "@stacks/transactions";

/**
 * Secp256r1 key pair with compressed and uncompressed public key formats.
 */
interface Secp256r1KeyPair {
  publicKey: KeyObject;
  privateKey: KeyObject;
  compressedPublicKey: Buffer; // 33 bytes: prefix (0x02/0x03) + x
  uncompressedPublicKey: Buffer; // 65 bytes: 0x04 + x + y
}

/**
 * Generates a new secp256r1 (P-256) key pair.
 *
 * @returns Key pair with compressed (33 bytes) and uncompressed (65 bytes)
 * public keys
 */
export const generateSecp256r1KeyPair = (): Secp256r1KeyPair => {
  const { publicKey, privateKey } = generateKeyPairSync("ec", {
    namedCurve: "prime256v1", // secp256r1 = P-256 = prime256v1
  });

  // Extract uncompressed public key (0x04 | x | y) from DER format
  const pubkeyDer = publicKey.export({ type: "spki", format: "der" });
  const uncompressedPublicKey = Buffer.from(pubkeyDer.subarray(-65));

  if (
    uncompressedPublicKey[0] !== 0x04 ||
    uncompressedPublicKey.length !== 65
  ) {
    throw new Error("Invalid uncompressed public key format");
  }

  // Create compressed format: prefix (0x02 if y even, 0x03 if y odd) + x
  const x = Buffer.from(uncompressedPublicKey.subarray(1, 33));
  const yIsEven = uncompressedPublicKey[64] % 2 === 0;
  const compressedPublicKey = Buffer.concat([
    Buffer.from([yIsEven ? 0x02 : 0x03]),
    x,
  ]);

  return { publicKey, privateKey, compressedPublicKey, uncompressedPublicKey };
};

/**
 * Creates a signed STX transfer authorization using SIP-018 message format.
 *
 * @param chainId - Chain ID (1 = mainnet, 2147483648 = testnet)
 * @param privateKey - The secp256r1 private key
 * @param params - STX transfer parameters
 * @returns Signature and authorization details
 */
export const createStxTransferAuthorization = (
  chainId: number,
  privateKey: KeyObject,
  params: {
    authId: number;
    amount: number;
    recipient: string;
    memo?: Buffer | null;
  }
) => {
  const stxTransferMessageHash = buildStxTransferHash(chainId, params);
  const signature = signMessageHash(stxTransferMessageHash, privateKey);

  return {
    signature,
    messageHash: stxTransferMessageHash,
    ...params,
  };
};

/**
 * Creates a signed extension call authorization using SIP-018 message format.
 *
 * @param chainId - Chain ID (1 = mainnet, 2147483648 = testnet)
 * @param privateKey - The secp256r1 private key
 * @param params - Extension call parameters including extension and payload
 * @returns Signature and authorization details
 */
export const createExtensionCallAuthorization = (
  chainId: number,
  privateKey: KeyObject,
  params: {
    authId: number;
    extension: string;
    payload: Buffer;
  }
) => {
  const extensionCallMessageHash = buildExtensionCallHash(chainId, params);
  const signature = signMessageHash(extensionCallMessageHash, privateKey);
  return {
    signature,
    messageHash: extensionCallMessageHash,
    ...params,
  };
};

/**
 * Creates a signed SIP-010 transfer authorization using SIP-018 message format.
 *
 * @param chainId - Chain ID (1 = mainnet, 2147483648 = testnet)
 * @param privateKey - The secp256r1 private key
 * @param params - SIP-010 transfer parameters
 * @returns Signature and authorization details
 */
export const createSip10TransferAuthorization = (
  chainId: number,
  privateKey: KeyObject,
  params: {
    authId: number;
    amount: number;
    recipient: string;
    memo?: Buffer | null;
    sip010: string;
  }
) => {
  const messageHash = buildSip10TransferHash(chainId, params);
  const signature = signMessageHash(messageHash, privateKey);
  return {
    signature,
    messageHash,
    ...params,
  };
};

/**
 * Creates a signed SIP-009 transfer authorization using SIP-018 message format.
 *
 * @param chainId - Chain ID (1 = mainnet, 2147483648 = testnet)
 * @param privateKey - The secp256r1 private key
 * @param params - SIP-009 transfer parameters
 * @returns Signature and authorization details
 */
export const createSip09TransferAuthorization = (
  chainId: number,
  privateKey: KeyObject,
  params: {
    authId: number;
    nftId: number;
    recipient: string;
    sip009: string;
  }
) => {
  const messageHash = buildSip09TransferHash(chainId, params);
  const signature = signMessageHash(messageHash, privateKey);
  return {
    signature,
    messageHash,
    ...params,
  };
};

/**
 * Builds a SIP-018 message hash for STX transfer.
 *
 * Format: sha256("SIP018" || domain-hash || message-hash)
 *
 * @param chainId - Chain ID (1 = mainnet, 2147483648 = testnet)
 * @param params - STX transfer parameters
 * @returns 32-byte message hash ready to sign
 */
const buildStxTransferHash = (
  chainId: number,
  params: {
    authId: number;
    amount: number;
    recipient: string;
    memo?: Buffer | null;
  }
): Buffer => {
  const domainHash = buildDomainHash(chainId);

  const message = Cl.tuple({
    amount: Cl.uint(params.amount),
    "auth-id": Cl.uint(params.authId),
    memo: params.memo ? Cl.buffer(params.memo) : Cl.none(),
    recipient: Cl.principal(params.recipient),
    topic: Cl.stringAscii("stx-transfer"),
  });

  const stxTransferMessageHash = createHash("sha256")
    .update(Buffer.from(serializeCV(message), "hex"))
    .digest();

  return createFinalMessageHash(
    SIP018_PREFIX,
    domainHash,
    stxTransferMessageHash
  );
};

/**
 * Builds a SIP-018 message hash for extension call.
 *
 * Format: sha256("SIP018" || domain-hash || message-hash)
 *
 * @param chainId - Chain ID (1 = mainnet, 2147483648 = testnet)
 * @param params - Extension call parameters
 * @returns 32-byte message hash ready to sign
 */
const buildExtensionCallHash = (
  chainId: number,
  params: {
    authId: number;
    extension: string;
    payload: Buffer;
  }
) => {
  const domainHash = buildDomainHash(chainId);

  const message = Cl.tuple({
    "auth-id": Cl.uint(params.authId),
    extension: Cl.principal(params.extension),
    payload: Cl.buffer(params.payload),
    topic: Cl.stringAscii("extension-call"),
  });

  const extensionCallMessageHash = createHash("sha256")
    .update(Buffer.from(serializeCV(message), "hex"))
    .digest();

  return createFinalMessageHash(
    SIP018_PREFIX,
    domainHash,
    extensionCallMessageHash
  );
};

/**
 * Builds a SIP-018 message hash for SIP-010 transfer.
 *
 * Format: sha256("SIP018" || domain-hash || message-hash)
 *
 * @param chainId - Chain ID (1 = mainnet, 2147483648 = testnet)
 * @param params - SIP-010 transfer parameters
 * @returns 32-byte message hash ready to sign
 */
const buildSip10TransferHash = (
  chainId: number,
  params: {
    authId: number;
    amount: number;
    recipient: string;
    memo?: Buffer | null;
    sip010: string;
  }
): Buffer => {
  const domainHash = buildDomainHash(chainId);

  const message = Cl.tuple({
    "auth-id": Cl.uint(params.authId),
    amount: Cl.uint(params.amount),
    recipient: Cl.principal(params.recipient),
    memo: params.memo ? Cl.buffer(params.memo) : Cl.none(),
    sip010: Cl.principal(params.sip010),
    topic: Cl.stringAscii("sip010-transfer"),
  });

  const sip10TransferMessageHash = createHash("sha256")
    .update(Buffer.from(serializeCV(message), "hex"))
    .digest();

  return createFinalMessageHash(
    SIP018_PREFIX,
    domainHash,
    sip10TransferMessageHash
  );
};

/**
 * Builds a SIP-018 message hash for SIP-009 transfer.
 *
 * Format: sha256("SIP018" || domain-hash || message-hash)
 *
 * @param chainId - Chain ID (1 = mainnet, 2147483648 = testnet)
 * @param params - SIP-009 transfer parameters
 * @returns 32-byte message hash ready to sign
 */
const buildSip09TransferHash = (
  chainId: number,
  params: {
    authId: number;
    nftId: number;
    recipient: string;
    sip009: string;
  }
): Buffer => {
  const domainHash = buildDomainHash(chainId);

  const message = Cl.tuple({
    "auth-id": Cl.uint(params.authId),
    "nft-id": Cl.uint(params.nftId),
    recipient: Cl.principal(params.recipient),
    sip009: Cl.principal(params.sip009),
    topic: Cl.stringAscii("sip009-transfer"),
  });

  const sip09TransferMessageHash = createHash("sha256")
    .update(Buffer.from(serializeCV(message), "hex"))
    .digest();

  return createFinalMessageHash(
    SIP018_PREFIX,
    domainHash,
    sip09TransferMessageHash
  );
};

/**
 * Signs a message hash with a secp256r1 private key.
 *
 * @param messageHash - 32-byte hash to sign
 * @param privateKey - Secp256r1 private key
 * @returns 64-byte raw signature (r||s) in IEEE P1363 format
 */
const signMessageHash = (
  messageHash: Buffer,
  privateKey: KeyObject
): Buffer => {
  return sign(null, messageHash, {
    key: privateKey,
    dsaEncoding: "ieee-p1363", // Returns raw 64-byte r||s format
  });
};

/**
 * Builds the SIP-018 domain hash for replay protection.
 *
 * @param chainId - Chain ID (1 = mainnet, 2147483648 = testnet)
 * @param name - Contract/application name
 * @param version - Contract/application version
 * @returns 32-byte domain hash: sha256(consensus-buff(domain))
 */
const buildDomainHash = (
  chainId: number,
  name = "smart-wallet-standard",
  version = "1.0.0"
): Buffer => {
  const domain = Cl.tuple({
    "chain-id": Cl.uint(chainId),
    name: Cl.stringAscii(name),
    version: Cl.stringAscii(version),
  });

  return createHash("sha256")
    .update(Buffer.from(serializeCV(domain), "hex"))
    .digest();
};

const createFinalMessageHash = (
  prefix: Buffer,
  domainHash: Buffer,
  messageHash: Buffer
) => {
  return createHash("sha256")
    .update(Buffer.concat([prefix, domainHash, messageHash]))
    .digest();
};

const SIP018_PREFIX = Buffer.from("534950303138", "hex"); // "SIP018" = 0x534950303138.
