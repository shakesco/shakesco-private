/**
 * @notice Class for managing keys on secp256k1 curve
 */
const EC = require("elliptic").ec;
// const { Buffer } = require('buffer/'); // TODO make sure this works in browser and node
const { keccak256 } = require("js-sha3");
const ethers = require("ethers");
const {
  padHex,
  recoverPublicKeyFromTransaction,
  lengths,
} = require("../utils/utils");
async function loadApp() {
  const { getSharedSecret, ProjectivePoint, utils, getPublicKey, etc } =
    await import("@noble/secp256k1");
  return { getSharedSecret, ProjectivePoint, utils, getPublicKey, etc };
}
const ec = new EC("secp256k1");
const { hexZeroPad } = require("@ethersproject/bytes");
const { BigNumber } = require("ethers");
const { utils } = ethers;

class KeyPair {
  /**
   * @notice Creates new instance from a public key or private key
   * @param {String} key Can be either (1) hex public key with 0x04 prefix, (2) hex private
   * key with 0x prefix
   */
  constructor(key) {
    // Input checks
    if (!utils.isHexString(key))
      throw new Error("Key must be in hex format with 0x prefix");

    // Handle input
    if (key.length === 66) {
      // PRIVATE KEY
      // Save off various forms of the private key
      this.privateKeyHex = key;
      this.privateKeyHexSlim = key.slice(2);
      this.privateKeyEC = ec.keyFromPrivate(this.privateKeyHexSlim);
      this.privateKeyBN = ethers.BigNumber.from(this.privateKeyHex);

      // Multiply curve's generator point by private key to get public key
      const publicKey = ec.g.mul(this.privateKeyHexSlim);

      // Save off public key as hex, other forms computed as getters
      const publicKeyHexCoordsSlim = {
        x: padHex(publicKey.getX().toString("hex")),
        y: padHex(publicKey.getY().toString("hex")),
      };
      this.publicKeyHex = `0x04${publicKeyHexCoordsSlim.x}${publicKeyHexCoordsSlim.y}`;
    } else if (key.length === 132) {
      // PUBLIC KEY
      // Save off public key as hex, other forms computed as getters
      this.publicKeyHex = key;
    } else {
      throw new Error(
        "Key must be a 66 character private key, a 132 character public key, or a transaction hash with isTxHash set to true"
      );
    }
  }

  // GETTERS =======================================================================================
  /**
   * @notice Returns the x,y public key coordinates as hex with 0x prefix
   */
  get publicKeyHexCoords() {
    return {
      x: `0x${padHex(this.publicKeyHexSlim.slice(0, 64))}`,
      y: `0x${padHex(this.publicKeyHexSlim.slice(64))}`,
    };
  }

  /**
   * @notice Returns the x,y public key coordinates as hex without 0x prefix
   */
  get publicKeyHexCoordsSlim() {
    return {
      x: padHex(this.publicKeyHexSlim.slice(0, 64)),
      y: padHex(this.publicKeyHexSlim.slice(64)),
    };
  }

  /**
   * @notice Returns the public key without the 0x prefix
   */
  get publicKeyHexSlim() {
    return this.publicKeyHex.slice(4);
  }

  /**
   * @notice Returns an elliptic instance generated from the public key
   */
  get publicKeyEC() {
    return ec.keyFromPublic({
      x: this.publicKeyHexCoordsSlim.x,
      y: this.publicKeyHexCoordsSlim.y,
    });
  }

  /**
   * @notice Returns the public key as a BigNumber
   */
  get publicKeyBN() {
    return ethers.BigNumber.from(this.publicKeyHex);
  }

  /**
   * @notice Returns the public key as bytes array
   */
  get publicKeyBytes() {
    return utils.arrayify(this.publicKeyHex);
  }

  /**
   * @notice Returns checksum address derived from this key
   */
  get address() {
    const hash = keccak256(Buffer.from(this.publicKeyHexSlim, "hex"));
    const addressBuffer = Buffer.from(hash, "hex");
    const address = `0x${addressBuffer.slice(-20).toString("hex")}`;
    return utils.getAddress(address);
  }

  /**
   * @notice Given the x-coordinate of a public key, without the identifying prefix bit, returns
   * the uncompressed public key assuming the identifying bit is 02
   * @dev We don't know if the identifying bit is 02 or 03 when uncompressing for the scanning use case, but it
   * doesn't actually matter since we are not deriving an address from the public key. We use the public key to
   * compute the shared secret to decrypt the random number, and since that involves multiplying this public key
   * by a private key, we can ensure the result is the same shared secret regardless of whether we assume the 02 or
   * 03 prefix by using the compressed form of the hex shared secret and ignoring the prefix. Therefore if no prefix
   * is provided, we can assume 02, and it's up to the user to make sure they are using this method safely. This is
   * done because it saves gas in the Umbra contract
   * @param pkx x-coordinate of compressed public key, as BigNumber or hex string
   * @param prefix Prefix bit, must be 2 or 3
   */

  static getUncompressedFromX(pkx, prefix) {
    pkx = BigNumber.from(pkx);

    const hexWithoutPrefix = hexZeroPad(
      BigNumber.from(pkx).toHexString(),
      32
    ).slice(2);

    if (!prefix) {
      const point = ec
        .keyFromPublic(`02${hexWithoutPrefix}`, "hex")
        .getPublic();
      return `0x${point.encode("hex", false)}`;
    }

    const hexWithPrefix = `0${Number(prefix)}${hexWithoutPrefix}`;
    const point = ec.keyFromPublic(hexWithPrefix, "hex").getPublic();
    return `0x${point.encode("hex", false)}`;
  }

  /**
   * @notice Takes an uncompressed public key and returns the compressed public key
   * @param uncompressedpublicKey Uncompressed public key, as hex string starting with 0x
   * @returns Object containing the prefix as an integer and compressed public key as hex, as separate parameters
   */

  static compressPublicKey(uncompressedpublicKey) {
    const publicKeyBuffer = Buffer.from(uncompressedpublicKey.slice(2), "hex");

    // Decode the compressed public key
    const publicKey = ec.keyFromPublic(publicKeyBuffer);

    // Get the compressed public key as a hexadecimal string
    const compressedPublicKeyHex = publicKey.getPublic(true, "hex");

    return {
      prefix: Number(compressedPublicKeyHex[1]), // prefix bit is the 2th character in the string (no 0x prefix)
      pubKeyXCoordinate: `0x${compressedPublicKeyHex.slice(2)}`,
    };
  }

  // ENCRYPTION / DECRYPTION =======================================================================
  /**
   * @notice Encrypt a random number with the instance's public key
   * @param {RandomNumber} number Random number as instance of RandomNumber class
   * @returns {Object} Hex strings of uncompressed 65 byte public key and 32 byte ciphertext
   */
  async encrypt(number) {
    const { ProjectivePoint, utils, etc } = await loadApp();

    // Get shared secret to use as encryption key
    const ephemeralPrivateKey = utils.randomPrivateKey();
    const ephemeralPublicKey =
      ProjectivePoint.fromPrivateKey(ephemeralPrivateKey);
    const ephemeralPrivateKeyHex = `0x${etc.bytesToHex(ephemeralPrivateKey)}`;
    const ephemeralPublicKeyHex = `0x${ephemeralPublicKey.toHex()}`;

    const sharedSecret = await this.getSharedSecret(
      ephemeralPrivateKeyHex,
      this.publicKeyHex
    );

    // XOR random number with shared secret to get encrypted value
    const ciphertextBN = BigNumber.from(number.value).xor(sharedSecret);

    const ciphertext = hexZeroPad(ciphertextBN.toHexString(), 32); // 32 byte hex string with 0x prefix
    return { ephemeralPublicKey: ephemeralPublicKeyHex, ciphertext };
  }

  /**
   * @notice Decrypt a random number with the instance's private key and return the plaintext
   * @param {String} output Output from the encrypt method
   */
  async decrypt(output) {
    const { ephemeralPublicKey, ciphertext } = output;
    if (!ephemeralPublicKey || !ciphertext) {
      throw new Error("Input must be of type EncryptedPayload to decrypt");
    }
    if (!this.privateKeyHex) {
      throw new Error("KeyPair has no associated private key to decrypt with");
    }

    // Get shared secret to use as decryption key, then decrypt with XOR
    const sharedSecret = await this.getSharedSecret(
      this.privateKeyHex,
      ephemeralPublicKey
    );
    const plaintext = BigNumber.from(ciphertext).xor(sharedSecret);
    return hexZeroPad(plaintext.toHexString(), 32);
  }

  // ELLIPTIC CURVE MATH ===========================================================================
  /**
   * @notice Returns new KeyPair instance after multiplying this public key by some value
   * @param {RandomNumber, String} value number to multiply by, as class RandomNumber or hex
   * string with 0x prefix
   */
  mulPublicKey(value) {
    // Perform multiplication
    const number = utils.isHexString(value) ? value.slice(2) : value.asHexSlim;
    const publicKey = this.publicKeyEC.getPublic().mul(number);
    // Get x,y hex strings
    const x = padHex(publicKey.getX().toString("hex"));
    const y = padHex(publicKey.getY().toString("hex"));
    // Instantiate and return new instance
    return new KeyPair(`0x04${x}${y}`);
  }

  /**
   * @notice Returns new KeyPair instance after multiplying this private key by some value
   * @param {RandomNumber, String} value number to multiply by, as class RandomNumber or hex
   * string with 0x prefix
   */
  mulPrivateKey(value) {
    // Get new private key. This gives us an arbitrarily large number that is not
    // necessarily in the domain of the secp256k1 elliptic curve
    const number = utils.isHexString(value) ? value : value.asHex;
    const privateKeyFull = this.privateKeyBN.mul(number);
    // Modulo operation to get private key to be in correct range, where ec.n gives the
    // order of our curve. We add the 0x prefix as it's required by ethers.js
    const privateKeyMod = privateKeyFull.mod(`0x${ec.n.toString("hex")}`);
    // Remove 0x prefix to pad hex value, then add back 0x prefix
    const privateKey = `0x${padHex(privateKeyMod.toHexString().slice(2))}`;
    // Instantiate and return new instance
    return new KeyPair(privateKey);
  }

  async getSharedSecret(privateKey, publicKey) {
    if (
      privateKey.length !== lengths.privateKey ||
      !ethers.utils.isHexString(privateKey)
    )
      throw new Error("Invalid private key");
    if (
      publicKey.length !== lengths.publicKey ||
      !ethers.utils.isHexString(publicKey)
    )
      throw new Error("Invalid public key");

    const { getSharedSecret, etc } = await loadApp();

    // We use sharedSecret.slice(2) to ensure the shared secret is not dependent on the prefix, which enables
    // us to uncompress ephemeralPublicKey from Umbra.sol logs as explained in comments of getUncompressedFromX.
    // Note that a shared secret is really just a point on the curve, so it's an uncompressed public key
    const sharedSecret = getSharedSecret(
      privateKey.slice(2),
      publicKey.slice(2),
      true
    );
    const sharedSecretHex = etc.bytesToHex(sharedSecret); // Has 04 prefix but not 0x.
    return ethers.utils.sha256(`0x${sharedSecretHex.slice(2)}`); // TODO Update to use noble-hashes?
  }

  // STATIC METHODS ================================================================================
  /**
   * @notice Generate KeyPair instance asynchronously from a transaction hash
   * @param {String} txHash Transaction hash to recover public key from
   * @param {*} provider raw web3 provider to use (not an ethers instance)
   */
  static async instanceFromTransaction(txHash, provider) {
    const publicKeyHex = await recoverPublicKeyFromTransaction(
      txHash,
      provider
    );
    return new KeyPair(publicKeyHex);
  }

  /**
   * @notice Helper method to return the stealth wallet from a receiver's private key and a random number
   * @param spendingPrivateKey Receiver's spending private key
   * @param randomNumber Number to multiply by, as class RandomNumber or hex string with 0x prefix
   */
  static computeStealthPrivateKey(spendingPrivateKey, randomNumber) {
    const spendingPrivateKeyPair = new KeyPair(spendingPrivateKey); // validates spendingPrivateKey
    const stealthFromPrivate =
      spendingPrivateKeyPair.mulPrivateKey(randomNumber); // validates randomNumber
    if (!stealthFromPrivate.privateKeyHex) {
      throw new Error(
        "Stealth key pair must have a private key: this should never occur"
      );
    }
    return stealthFromPrivate.privateKeyHex;
  }
}

module.exports = KeyPair;
