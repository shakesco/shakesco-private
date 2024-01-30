const StealthKeyRegistry = require("../classes/StealthKeyRegistry");
const KeyPair = require("../classes/KeyPair");
const RandomNumber = require("../classes/RandomNumber");
const { sha256 } = require("ethers");

const generateKeyPair = async (signature) => {
  // Split hex string signature into two 32 byte chunks
  const startIndex = 2; // first two characters are 0x, so skip these
  const length = 64; // each 32 byte chunk is in hex, so 64 characters
  const r = signature.slice(startIndex, startIndex + length);
  const s = signature.slice(startIndex + length, startIndex + length + length);
  const v = signature.slice(signature.length - 2);

  if (`0x${r}${s}${v}` !== signature) {
    throw new Error("Signature incorrectly generated or parsed");
  }

  const spendingPrivateKey = sha256(`0x${r}`);
  const viewingPrivateKey = sha256(`0x${s}`);

  const spendingKeyPair = new KeyPair(spendingPrivateKey);
  const viewingKeyPair = new KeyPair(viewingPrivateKey);
  return { spendingKeyPair, viewingKeyPair };
};

async function prepareSend(recipientId, provider) {
  // Lookup recipient's public key
  const registry = new StealthKeyRegistry(provider);

  const { spendingPublicKey, viewingPublicKey } = await registry.getStealthKeys(
    recipientId
  );
  if (!spendingPublicKey || !viewingPublicKey) {
    throw new Error(
      `Could not retrieve public keys for recipient ID ${recipientId}`
    );
  }

  const spendingKeyPair = new KeyPair(spendingPublicKey);
  const viewingKeyPair = new KeyPair(viewingPublicKey);

  // Generate random number
  const randomNumber = new RandomNumber();

  // Encrypt random number with recipient's public key
  const encrypted = await viewingKeyPair.encrypt(randomNumber);

  // Get x,y coordinates of ephemeral private key
  const { pubKeyXCoordinate } = KeyPair.compressPublicKey(
    encrypted.ephemeralPublicKey
  );

  // Compute stealth address
  const stealthKeyPair = spendingKeyPair.mulPublicKey(randomNumber);

  return { stealthKeyPair, pubKeyXCoordinate, encrypted };
}

async function IsUsersFunds(
  announcement,
  provider,
  viewingPrivateKey, //Users viewprivatekey
  sender //user
) {
  try {
    const { pkx, ciphertext, receiver, tokenAddress, amount } = announcement;

    const uncompressedPubKey = KeyPair.getUncompressedFromX(pkx);

    const payload = { ephemeralPublicKey: uncompressedPubKey, ciphertext };
    const viewkey = new KeyPair(viewingPrivateKey);
    const randomNumber = await viewkey.decrypt(payload);

    const registry = new StealthKeyRegistry(provider);
    const { spendingPublicKey } = await registry.getStealthKeys(sender);

    // Get what our receiving address would be with this random number
    const spendingkey = new KeyPair(spendingPublicKey);

    const computedReceivingAddress =
      spendingkey.mulPublicKey(randomNumber).address;

    return {
      isForUser: computedReceivingAddress == receiver,
      randomNumber: ciphertext,
      ephemeralPubkey: pkx,
      stealthAddress: computedReceivingAddress,
      tokenAddress: tokenAddress,
      businessTokenAddress: businessTokenAddress,
      amountOrId: amount.toString(),
    };
  } catch (e) {
    return {
      isForUser: false,
      randomNumber: "",
      ephemeralPubkey: "",
      tokenAddress: "",
      stealthAddress: "",
      businessTokenAddress: "",
      amountOrId: "",
    };
  }
}

module.exports = {
  generateKeyPair,
  prepareSend,
  IsUsersFunds,
};
