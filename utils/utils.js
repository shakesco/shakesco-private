const ethers = require("ethers");
const {
  isHexString,
  getBytes,
  resolveProperties,
  Signature,
  Transaction,
  keccak256,
  verifyMessage,
} = ethers;

/**
 * @notice Adds leading zeroes to ensure hex strings are the expected length.
 * @dev We always expect a hex value to have the full number of characters for its size,
 * so we use this tool to ensure no errors occur due to wrong hex character lengths.
 * Specifically, we need to pad hex values during the following cases:
 *   1. It seems elliptic strips unnecessary leading zeros when pulling out x and y
 *      coordinates from public keys.
 *   2. When computing a new private key from a random number, the new number (i.e. the new
 *      private key) may not necessarily require all 32-bytes as ethers.js also seems to
 *      strip leading zeroes.
 *   3. When generating random numbers and returning them as hex strings, the leading
 *      zero bytes get stripped
 * @param {String} hex String to pad, without leading 0x
 * @param {String} bytes Number of bytes string should have
 */
module.exports.padHex = (hex, bytes = 32) => {
  if (!isHexString(hex)) throw new Error("Input is not a valid hex string");
  if (hex.slice(0, 2) === "0x") {
    throw new Error("Input must not contain 0x prefix");
  }
  return hex.padStart(bytes * 2, 0);
};

module.exports.lengths = {
  address: 42, // 20 bytes + 0x prefix
  txHash: 66, // 32 bytes + 0x prefix
  privateKey: 66, // 32 bytes + 0x prefix
  publicKey: 132, // 64 bytes + 0x04 prefix
};

/**
 * @notice Convert hex string with 0x prefix into Buffer
 * @param {String} data Hex string to convert
 */
module.exports.hexStringToBuffer = (data) => Buffer.from(getBytes(data));

/**
 * @notice Given a transaction hash, return the public key of the transaction's sender
 * @dev See https://github.com/ethers-io/ethers.js/issues/700 for an example of
 * recovering public key from a transaction with ethers
 * @param {String} txHash Transaction hash to recover public key from
 * @param {*} provider raw web3 provider to use (not an ethers instance)
 */
module.exports.recoverPublicKeyFromTransaction = async (txHash, provider) => {
  // Get transaction data
  const ethersProvider = new ethers.JsonRpcProvider(provider);
  const tx = await ethersProvider.getTransaction(txHash);

  // Get original signature
  const splitSignature = {
    r: tx.r,
    s: tx.s,
    v: tx.v,
  };
  const signature = Signature.from(splitSignature).serialized;

  // Reconstruct transaction data that was originally signed
  const txData = {
    chainId: tx.chainId,
    data: tx.data,
    gasLimit: tx.gasLimit,
    gasPrice: tx.gasPrice,
    nonce: tx.nonce,
    to: tx.to, // this works for both regular and contract transactions
    value: tx.value,
  };

  // Properly format it to get the correct message
  const resolvedTx = await resolveProperties(txData);
  const rawTx = Transaction.from(resolvedTx).serialized;
  const msgHash = keccak256(rawTx);
  const msgBytes = getBytes(msgHash);

  // Recover sender's public key and address
  const publicKey = verifyMessage(msgBytes, signature);

  return publicKey;
};
